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

test('light shards: timing constants and a kind that never repeats', () => {
  assert.deepEqual(C.SHARD_KINDS, ['bolt', 'cloud', 'magnet']);
  assert.equal(C.SHARD.from + C.SHARD.every * 4, 70, 'about five shards in a 90 s day');
  for (const prev of C.SHARD_KINDS) for (const r of [0, 0.3, 0.6, 0.99]) assert.notEqual(C.nextShardKind(prev, r), prev);
  assert.equal(C.nextShardKind(null, 0.99), 'magnet');
});

test('mid-run events: four kinds with lengths, one window 40-60% into the run', () => {
  assert.deepEqual(C.EVENT_KINDS, ['rain', 'parade', 'blackout', 'front']);
  for (const k of C.EVENT_KINDS) assert.ok(C.EVENTS[k] >= 8 && C.EVENTS[k] <= 12, k);
  assert.ok(Math.abs(C.eventWindow(0) - 0.4) < 1e-9 && Math.abs(C.eventWindow(0.999) - 0.6) < 1e-3);
  assert.ok(C.eventWindow(0.999) < C.NIGHT_START, 'an event always ends before night');
});
