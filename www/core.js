// Pure game logic: no DOM, no canvas. Loaded by index.html and by the node unit tests.
(function (root) {
  'use strict';

  const DURATION = 90;       // seconds per round (was 120: long runs left too much time to catch up)
  const NIGHT_START = 0.85;  // fraction of the round after which the whole map is shadow
  const MAX_ELEV = 65 * Math.PI / 180;
  // The sun never drops below this, so shadow length stays h / tan(elev) with no
  // clipping and the 3D renderer's real shadows match these polygons exactly.
  const MIN_ELEV = 12 * Math.PI / 180;
  const MAX_SHADOW = 2000;
  const EAT_RATIO = 0.85;    // object must be smaller than this fraction of the player
  const GROWTH = 0.45;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Round progress (0..1) -> day progress and night flag.
  function dayPhase(gameT) {
    if (gameT >= NIGHT_START) return { dayT: 1, night: true };
    return { dayT: 0.04 + (gameT / NIGHT_START) * 0.92, night: false };
  }

  // Sun rises in the east (+x) and sets in the west (-x). (sx, sy) is the unit
  // direction shadows are cast in, i.e. away from the sun.
  // maxElev lets a stage keep the sun low all day (winter), which stretches every shadow.
  function sunState(dayT, maxElev = MAX_ELEV) {
    const az = Math.PI * dayT;
    return {
      elev: Math.max(MIN_ELEV, maxElev * Math.sin(Math.PI * dayT)),
      sx: -Math.cos(az),
      sy: Math.sin(az),
    };
  }

  function shadowLength(height, elev) {
    if (elev <= 0) return MAX_SHADOW;
    return Math.min(height / Math.tan(elev), MAX_SHADOW);
  }

  // Andrew's monotone chain; returns the hull counter-clockwise (in y-up terms).
  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  function pointInConvex(poly, x, y) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c === 0) continue;
      const s = c > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  // Building footprint {x, y, w, d, h} -> shadow polygon with bbox for cheap rejection.
  // Light shards: pickups that appear in sunlight mid-run (index.html shards). From `from` s, one every `every` s,
  // at most `max` on the map, each gone after `life` s. Effects, in seconds: bolt = faster, cloud = your own shade,
  // magnet = nearby food drifts to you.
  const SHARD = { from: 10, every: 15, life: 12, max: 2, bolt: 8, cloud: 6, magnet: 8, speed: 1.6, pull: 150 };
  const SHARD_KINDS = ['bolt', 'cloud', 'magnet'];
  // the next kind: never the same twice in a row (r in [0,1))
  const nextShardKind = (prev, r) => SHARD_KINDS.filter(k => k !== prev)[Math.floor(r * (prev ? 2 : 3))] || SHARD_KINDS[0];

  // Mid-run events (index.html mapEvent): one per run, somewhere 40–60% in (none on boss levels or during the tutorial).
  // rain = shade everywhere while people scatter; parade = a line of edibles marches down a road; blackout = dark with two
  // extra lantern keepers; front = a big cloud sweeps across the map. Values are seconds.
  const EVENTS = { rain: 8, parade: 12, blackout: 10, front: 12 };
  const EVENT_KINDS = Object.keys(EVENTS);
  const eventWindow = r => 0.4 + r * 0.2; // when in the run it starts (fraction), r in [0,1)

  // Combo: another swallow within `window` seconds stacks the multiplier by `step`, up to `max`.
  const COMBO = { window: 1.5, step: 0.1, max: 2 };
  const comboMult = n => Math.min(COMBO.max, 1 + COMBO.step * Math.max(0, n - 1));

  // Hunger: idling is not free (hiding in shade, or waiting for night). `since` = seconds since the last swallow
  // (the run's first `grace` seconds count as fed). Quiet for `wait` s, a visible countdown of `count` s, then
  // 'starve': the body shrinks by `shrink`/s, and a body kept at its smallest for `end` s ends the run.
  const HUNGER = { grace: 8, wait: 6, count: 5, shrink: 0.8, end: 10 };
  function hungerState(since) {
    if (since < HUNGER.wait) return { phase: 'ok', left: HUNGER.wait - since };
    const left = HUNGER.wait + HUNGER.count - since;
    return left > 0 ? { phase: 'count', left } : { phase: 'starve', left: 0 };
  }

  function boxed(poly, owner) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    return { poly, minX, minY, maxX, maxY, owner };
  }
  function shadowPolygon(b, sun) {
    const len = shadowLength(b.h, sun.elev);
    const ox = sun.sx * len, oy = sun.sy * len;
    const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]];
    return boxed(convexHull(corners.concat(corners.map(c => [c[0] + ox, c[1] + oy]))), b);
  }
  // The shade a prop throws, matched to its rendered shape (the parts that cast in render3d CASTERS), in o.r units:
  //  - discs: [[height, radius], ...] — horizontal slices of a crown, cone or drum; the shadow is the hull of each
  //    slice cast to the ground (exact for cones and cylinders, close for round crowns);
  //  - box: [height, w, d] — a block standing on the ground (w along the prop's own x, turned by o.rot), cast like a building.
  function propShadow(o, shade, sun) {
    const r = o.r, pts = [];
    if (shade.box) {
      const [h, w, d] = shade.box, c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), len = shadowLength(h * r, sun.elev);
      for (const [lx, lz] of [[-w, -d], [w, -d], [w, d], [-w, d]]) {
        const x = o.x + (lx * c - lz * s) * r / 2, y = o.y + (lx * s + lz * c) * r / 2;
        pts.push([x, y], [x + sun.sx * len, y + sun.sy * len]);
      }
    } else {
      for (const [h, R] of shade.discs) {
        const len = shadowLength(h * r, sun.elev), cx = o.x + sun.sx * len, cy = o.y + sun.sy * len;
        for (let i = 0; i < 12; i++) pts.push([cx + R * r * Math.cos(i * Math.PI / 6), cy + R * r * Math.sin(i * Math.PI / 6)]);
      }
    }
    return boxed(convexHull(pts), o);
  }

  // A point inside a building's own footprint is not in that building's shadow
  // (the roof is sunlit), so the owner is skipped via `exclude`.
  function inAnyShadow(shadows, x, y, exclude) {
    for (const s of shadows) {
      if (s.owner === exclude) continue;
      if (x < s.minX || x > s.maxX || y < s.minY || y > s.maxY) continue;
      if (pointInConvex(s.poly, x, y)) return true;
    }
    return false;
  }

  function inCone(g, x, y) {
    const dx = x - g.x, dy = y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > g.range) return false;
    if (dist < 1) return true;
    let diff = Math.atan2(dy, dx) - g.dir;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return Math.abs(diff) <= g.half;
  }

  // Shade patches (clouds, a map rule's casters) are shaped like what casts them, seen from above (tester: "a round
  // shadow is odd; a shadow should take the thing's shape, a cloud a cloud's"). A shape is a few parts in unit space,
  // its nose to +x: ['c', x, y, r] circle, ['e', x, y, rx, ry] ellipse, ['b', x, y, hw, hh] box, ['p', [[x, y], ...]]
  // polygon. Each is scaled once, here, to the area of the unit circle, so a patch of radius r covers what the round
  // patch did (the map's shade budget does not move) and always contains its centre. The game tests points with
  // inPatch; render3d draws the same parts, so what looks shaded is shaded.
  const SHAPE_PARTS = {
    cloud: [['c', -0.6, 0.15, 0.55], ['c', -0.1, -0.25, 0.65], ['c', 0.55, -0.05, 0.55], ['c', 0.2, 0.35, 0.5], ['c', -0.25, 0.3, 0.45]],
    steam: [['c', -0.35, 0.25, 0.45], ['c', 0.3, 0.2, 0.5], ['c', 0, -0.3, 0.5], ['c', 0.5, -0.35, 0.3], ['c', -0.5, -0.25, 0.3]],
    round: [['c', 0, 0, 1]], // parasol, lantern, saucer, clock face: round from above too
    blimp: [['e', 0, 0, 1.6, 0.6], ['p', [[-1.3, 0], [-1.85, -0.55], [-1.85, 0.55]]]],
    copter: [['e', 0.2, 0, 0.75, 0.5], ['b', -0.95, 0, 0.65, 0.1], ['b', 0.2, 0, 1.25, 0.08], ['b', 0.2, 0, 0.08, 1.25], ['b', -1.55, 0, 0.06, 0.28]],
    kite: [['p', [[0, -1.4], [0.75, -0.2], [0, 1.0], [-0.75, -0.2]]], ['c', 0.15, 1.2, 0.12], ['c', -0.1, 1.45, 0.12]],
    whale: [['e', 0.25, 0, 1.15, 0.6], ['e', 0.35, 0.6, 0.35, 0.14], ['e', 0.35, -0.6, 0.35, 0.14], ['p', [[-0.7, 0], [-1.5, -0.6], [-1.25, 0], [-1.5, 0.6]]]],
    plane: [['e', 0, 0, 1.5, 0.2], ['p', [[0.35, 0], [-0.15, -1.4], [-0.45, -1.4], [-0.15, 0]]], ['p', [[0.35, 0], [-0.15, 1.4], [-0.45, 1.4], [-0.15, 0]]],
      ['p', [[-1.1, 0], [-1.45, -0.5], [-1.6, -0.5], [-1.4, 0]]], ['p', [[-1.1, 0], [-1.45, 0.5], [-1.6, 0.5], [-1.4, 0]]]],
    bus: [['b', 0, 0, 1.25, 0.55]],
    car: [['b', 0, 0, 0.9, 0.75]], // a wheel's cabin, hanging level
    camel: [['e', -0.15, 0, 0.95, 0.45], ['b', 0.95, 0, 0.32, 0.1], ['e', 1.35, 0, 0.3, 0.18]],
    cart: [['b', -0.1, 0, 1.0, 0.65], ['b', 1.2, 0.35, 0.35, 0.05], ['b', 1.2, -0.35, 0.35, 0.05]],
    awning: [['b', 0, 0, 1.0, 0.7]],
    hook: [['b', 0, -0.25, 0.55, 0.4], ['c', 0, 0.55, 0.4]],
    swing: [['b', 0, 0, 1.1, 0.3]],
    arm: [['b', 0, 0, 1.4, 0.42]], // a crane's jib: the patches along it join into one bar
  };
  const SHAPE_OF = { parasol: 'round', lantern: 'round', ufo: 'round', clock: 'round' };
  function inPart(p, x, y) {
    if (p[0] === 'c') return (x - p[1]) ** 2 + (y - p[2]) ** 2 <= p[3] * p[3];
    if (p[0] === 'e') return ((x - p[1]) / p[3]) ** 2 + ((y - p[2]) / p[4]) ** 2 <= 1;
    if (p[0] === 'b') return Math.abs(x - p[1]) <= p[3] && Math.abs(y - p[2]) <= p[4];
    let inside = false; const v = p[1]; // even-odd, so a concave tail works too
    for (let i = 0, j = v.length - 1; i < v.length; j = i++)
      if ((v[i][1] > y) !== (v[j][1] > y) && x < (v[j][0] - v[i][0]) * (y - v[i][1]) / (v[j][1] - v[i][1]) + v[i][0]) inside = !inside;
    return inside;
  }
  const SHAPES = {}; // name -> { parts (scaled to area pi), ext (how far it reaches, in r) }
  for (const [name, raw] of Object.entries(SHAPE_PARTS)) {
    let ext = 0;
    for (const p of raw) ext = Math.max(ext, ...(p[0] === 'p' ? p[1].map(([a, b]) => Math.hypot(a, b))
      : p[0] === 'c' ? [Math.hypot(p[1], p[2]) + p[3]] : [Math.hypot(Math.abs(p[1]) + p[3], Math.abs(p[2]) + p[4])]));
    let hit = 0; const N = 160; // area by a grid over the reach
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = ((i + 0.5) / N * 2 - 1) * ext, y = ((j + 0.5) / N * 2 - 1) * ext;
      if (raw.some(p => inPart(p, x, y))) hit++;
    }
    const k = Math.sqrt(Math.PI / (hit / (N * N) * 4 * ext * ext));
    const parts = raw.map(p => p[0] === 'p' ? ['p', p[1].map(([a, b]) => [a * k, b * k])] : [p[0], ...p.slice(1).map(v => v * k)]);
    SHAPES[name] = { parts, ext: ext * k };
  }
  // A patch: { x, y, r, h (heading, radians; the shape's nose points that way), icon, rule }.
  const patchShape = c => SHAPES[SHAPE_OF[c.icon] || c.icon] ? (SHAPE_OF[c.icon] || c.icon) : c.rule === 'arm' ? 'arm' : c.rule === 'mist' ? 'steam' : 'cloud';
  function inPatch(c, x, y) {
    const dx = x - c.x, dy = y - c.y, s = SHAPES[patchShape(c)];
    if (dx * dx + dy * dy > (s.ext * c.r) ** 2) return false;
    const h = c.h || 0, cos = Math.cos(h), sin = Math.sin(h);
    const lx = (dx * cos + dy * sin) / c.r, ly = (-dx * sin + dy * cos) / c.r;
    return s.parts.some(p => inPart(p, lx, ly));
  }

  // The one eat rule: object sits in darkness, is smaller than the player, and touches it.
  function canEat(playerR, objR, shaded, dist) {
    return shaded && objR < playerR * EAT_RATIO && dist < playerR;
  }

  function grow(r, objR) {
    return Math.sqrt(r * r + GROWTH * objR * objR);
  }

  // Star goals. stats = { score, eaten: { type: count }, beamHit: bool, maxR, rushDone }.
  //   size: grow to n metres at some point in the run (a metre is 4 units of radius, as the size pill reads)
  //   rush: reach n points by second t (the run loop sets stats.rushDone the moment it happens in time)
  function goalProgress(goal, stats) {
    switch (goal.kind) {
      case 'score': return { cur: stats.score, n: goal.n, done: stats.score >= goal.n };
      case 'eat': {
        const cur = stats.eaten[goal.what] || 0;
        return { cur, n: goal.n, done: cur >= goal.n };
      }
      case 'noBeam': return { cur: stats.beamHit ? 0 : 1, n: 1, done: !stats.beamHit };
      case 'size': { const cur = Math.round((stats.maxR || 0) / 4 * 10) / 10; return { cur, n: goal.n, done: (stats.maxR || 0) / 4 >= goal.n }; }
      case 'rush': return { cur: stats.rushDone ? goal.n : Math.min(stats.score, goal.n), n: goal.n, done: !!stats.rushDone };
      default: throw new Error('unknown goal kind: ' + goal.kind);
    }
  }

  function evaluateStars(goals, stats) {
    return goals.map(g => goalProgress(g, stats).done);
  }

  // A stage opens once the previous one has at least one star.
  // A run clears its level with one star, two on a hard level, and the boss swallowed on a super-hard one.
  // `got` is evaluateStars' per-goal list; on a boss level the boss is the third goal.
  function isCleared(stage, got) {
    const n = got.filter(Boolean).length;
    if (stage.hard === 'super') return !!got[2];
    return n >= (stage.hard === 'hard' ? 2 : 1);
  }

  function isUnlocked(stageIds, index, bestStars) {
    return index === 0 || (bestStars[stageIds[index - 1]] || 0) >= 1;
  }

  const api = {
    DURATION, NIGHT_START, EAT_RATIO, MAX_SHADOW,
    mulberry32, dayPhase, sunState, shadowLength, convexHull, pointInConvex,
    shadowPolygon, propShadow, inAnyShadow, inCone, SHAPES, patchShape, inPatch, canEat, grow, HUNGER, hungerState, COMBO, comboMult, SHARD, SHARD_KINDS, nextShardKind, EVENTS, EVENT_KINDS, eventWindow,
    goalProgress, evaluateStars, isUnlocked, isCleared,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskCore = api;
})(this);
