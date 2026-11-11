// Layer: Unit — the swallow-chain multiplier from www/core.js, no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../www/core.js');

test('combo: x1 for a lone swallow, +0.1 per extra link, capped at x2; the window is 1.5 s', () => {
  assert.equal(C.comboMult(0), 1);
  assert.equal(C.comboMult(1), 1);
  assert.ok(Math.abs(C.comboMult(2) - 1.1) < 1e-9);
  assert.ok(Math.abs(C.comboMult(6) - 1.5) < 1e-9);
  assert.equal(C.comboMult(11), 2);
  assert.equal(C.comboMult(40), 2, 'capped');
  assert.deepEqual(C.COMBO, { window: 1.5, step: 0.1, max: 2 });
});
