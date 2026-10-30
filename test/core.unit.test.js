// Layer: Unit — pure geometry and rules from www/core.js, no DOM or canvas.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../www/core.js');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('sun: morning shadows point west, evening east, noon highest', () => {
  const am = C.sunState(0.1), noon = C.sunState(0.5), pm = C.sunState(0.9);
  assert.ok(am.sx < 0, 'morning shadow goes -x');
  assert.ok(pm.sx > 0, 'evening shadow goes +x');
  assert.ok(noon.elev > am.elev && noon.elev > pm.elev);
});

test('shadow length shrinks toward noon and is capped near the horizon', () => {
  const h = 100;
  assert.ok(C.shadowLength(h, C.sunState(0.5).elev) < C.shadowLength(h, C.sunState(0.1).elev));
  assert.equal(C.shadowLength(h, 0), C.MAX_SHADOW);
  near(C.shadowLength(h, Math.PI / 4), h, 1e-9);
});

test('sun never goes below the minimum elevation, so the tallest crane shadow is unclipped', () => {
  for (const t of [0, 0.01, 0.04, 0.96, 1]) assert.ok(C.sunState(t).elev >= 12 * Math.PI / 180 - 1e-12);
  const lowest = C.sunState(0).elev;
  assert.ok(260 / Math.tan(lowest) < C.MAX_SHADOW, 'a 260-high crane is not capped at the lowest sun');
});

test('convex hull of a square plus an interior point drops the interior point', () => {
  const hull = C.convexHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]);
  assert.equal(hull.length, 4);
});

test('pointInConvex: inside, outside, on edge', () => {
  const sq = C.convexHull([[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.ok(C.pointInConvex(sq, 5, 5));
  assert.ok(!C.pointInConvex(sq, 15, 5));
  assert.ok(C.pointInConvex(sq, 10, 5));
});

test('building shadow at 45° elevation covers a point one height away, opposite the sun', () => {
  const b = { x: 0, y: 0, w: 10, d: 10, h: 50 };
  const sun = { elev: Math.PI / 4, sx: -1, sy: 0 }; // sun in the east, shadow toward -x
  const s = C.shadowPolygon(b, sun);
  assert.ok(C.inAnyShadow([s], -40, 5), 'point 40 west of the wall is shaded');
  assert.ok(!C.inAnyShadow([s], -60, 5), 'point past the 50-long tip is lit');
  assert.ok(!C.inAnyShadow([s], 20, 5), 'sunward side is lit');
  assert.ok(!C.inAnyShadow([s], 5, 5, b), 'own roof is not its own shadow');
});

test('flashlight cone: in front within range only', () => {
  const g = { x: 0, y: 0, dir: 0, half: 0.4, range: 100 };
  assert.ok(C.inCone(g, 50, 0));
  assert.ok(!C.inCone(g, -50, 0));
  assert.ok(!C.inCone(g, 150, 0));
  assert.ok(!C.inCone(g, 50, 50));
});

test('eat rule requires shade, smaller size and contact', () => {
  assert.ok(C.canEat(20, 5, true, 10));
  assert.ok(!C.canEat(20, 5, false, 10), 'lit');
  assert.ok(!C.canEat(20, 18, true, 10), 'too big');
  assert.ok(!C.canEat(20, 5, true, 25), 'not touching');
});

test('growth is area-additive', () => {
  near(C.grow(10, 0), 10);
  assert.ok(C.grow(10, 10) > 10 && C.grow(10, 10) < 20);
});

test('stars: score, eat-count and no-beam goals', () => {
  const goals = [{ kind: 'score', n: 1000 }, { kind: 'eat', what: 'cat', n: 3 }, { kind: 'noBeam' }];
  assert.deepEqual(C.evaluateStars(goals, { score: 1200, eaten: { cat: 2 }, beamHit: false }), [true, false, true]);
  assert.deepEqual(C.evaluateStars(goals, { score: 999, eaten: { cat: 3 }, beamHit: true }), [false, true, false]);
  assert.deepEqual(C.goalProgress(goals[1], { score: 0, eaten: {}, beamHit: false }), { cur: 0, n: 3, done: false });
  assert.throws(() => C.goalProgress({ kind: 'nope' }, { eaten: {} }));
});

test('unlock: first stage always open, next needs one star on the previous', () => {
  const ids = ['town', 'harbor'];
  assert.ok(C.isUnlocked(ids, 0, {}));
  assert.ok(!C.isUnlocked(ids, 1, {}));
  assert.ok(!C.isUnlocked(ids, 1, { town: 0 }));
  assert.ok(C.isUnlocked(ids, 1, { town: 1 }));
});

test('day phase reaches night only in the final stretch', () => {
  assert.equal(C.dayPhase(0.5).night, false);
  assert.equal(C.dayPhase(C.NIGHT_START).night, true);
  assert.ok(C.dayPhase(0).dayT > 0 && C.dayPhase(0.84).dayT < 1);
});
