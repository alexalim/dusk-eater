// Pure game logic: no DOM, no canvas. Loaded by index.html and by the node unit tests.
(function (root) {
  'use strict';

  const DURATION = 120;      // seconds per round
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
  function sunState(dayT) {
    const az = Math.PI * dayT;
    return {
      elev: Math.max(MIN_ELEV, MAX_ELEV * Math.sin(Math.PI * dayT)),
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
  function shadowPolygon(b, sun) {
    const len = shadowLength(b.h, sun.elev);
    const ox = sun.sx * len, oy = sun.sy * len;
    const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]];
    const pts = corners.concat(corners.map(c => [c[0] + ox, c[1] + oy]));
    const poly = convexHull(pts);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    return { poly, minX, minY, maxX, maxY, owner: b };
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

  // The one eat rule: object sits in darkness, is smaller than the player, and touches it.
  function canEat(playerR, objR, shaded, dist) {
    return shaded && objR < playerR * EAT_RATIO && dist < playerR;
  }

  function grow(r, objR) {
    return Math.sqrt(r * r + GROWTH * objR * objR);
  }

  // Star goals. stats = { score, eaten: { type: count }, beamHit: bool }.
  function goalProgress(goal, stats) {
    switch (goal.kind) {
      case 'score': return { cur: stats.score, n: goal.n, done: stats.score >= goal.n };
      case 'eat': {
        const cur = stats.eaten[goal.what] || 0;
        return { cur, n: goal.n, done: cur >= goal.n };
      }
      case 'noBeam': return { cur: stats.beamHit ? 0 : 1, n: 1, done: !stats.beamHit };
      default: throw new Error('unknown goal kind: ' + goal.kind);
    }
  }

  function evaluateStars(goals, stats) {
    return goals.map(g => goalProgress(g, stats).done);
  }

  // A stage opens once the previous one has at least one star.
  function isUnlocked(stageIds, index, bestStars) {
    return index === 0 || (bestStars[stageIds[index - 1]] || 0) >= 1;
  }

  const api = {
    DURATION, NIGHT_START, EAT_RATIO, MAX_SHADOW,
    mulberry32, dayPhase, sunState, shadowLength, convexHull, pointInConvex,
    shadowPolygon, inAnyShadow, inCone, canEat, grow,
    goalProgress, evaluateStars, isUnlocked,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskCore = api;
})(this);
