// Layer: Unit — the hunger timeline from www/core.js (quiet wait, visible countdown, starving), no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../www/core.js');

test('hunger: fed for `wait` seconds, then a countdown of `count` seconds, then starving', () => {
  const H = C.HUNGER;
  assert.equal(C.hungerState(0).phase, 'ok');
  assert.equal(C.hungerState(H.wait - 0.01).phase, 'ok');
  const c = C.hungerState(H.wait);
  assert.equal(c.phase, 'count');
  assert.ok(Math.abs(c.left - H.count) < 1e-9, 'the countdown starts at its full length');
  assert.equal(Math.ceil(C.hungerState(H.wait + H.count - 0.5).left), 1, 'the last visible second is 1');
  const s = C.hungerState(H.wait + H.count);
  assert.equal(s.phase, 'starve');
  assert.equal(s.left, 0);
});

test('hunger numbers are the ones the design settled on: 8 s grace, 6 s quiet, 5 s countdown, slow shrink, 10 s to the end', () => {
  assert.deepEqual(C.HUNGER, { grace: 8, wait: 6, count: 5, shrink: 0.8, end: 10 });
  // waiting for night from a standing start is impossible: the first shrink comes long before night (85% of 90 s)
  assert.ok(C.HUNGER.grace + C.HUNGER.wait + C.HUNGER.count < C.DURATION * C.NIGHT_START);
});
