// Layer: Unit — the 150-level table from www/stages.js (ids, goal labels, reachable goals, difficulty curve), no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STAGES, THEMES, goalLabel } = require('../www/stages.js');

const spawned = (s, what) => (s.small.find(([t]) => t === what) || [0, 0])[1];
const scoreGoal = s => s.goals[0].n;

test('150 levels with stable ids L1..L150 and numbered names', () => {
  assert.equal(STAGES.length, 150);
  STAGES.forEach((s, i) => { assert.equal(s.id, 'L' + (i + 1)); assert.ok(s.name.startsWith(`${i + 1}. `)); });
});

test('every goal has a label and three goals per level', () => {
  for (const s of STAGES) {
    assert.equal(s.goals.length, 3, s.id);
    for (const g of s.goals) assert.notEqual(goalLabel(g), g.kind, `${s.id} ${JSON.stringify(g)}`);
  }
});

test('eat goals ask for at most half of what spawns (cars spawn on roads, guards per level)', () => {
  for (const s of STAGES) for (const g of s.goals.filter(g => g.kind === 'eat')) {
    const cap = g.what === 'guard' ? s.guards : g.what === 'car' ? s.carsPerRoad * 4 : spawned(s, g.what) / 2;
    assert.ok(g.n >= 1 && g.n <= cap, `${s.id} ${g.what} ${g.n}`);
  }
});

test('the first ten levels are town with gentle light and no guards before level 4', () => {
  STAGES.slice(0, 10).forEach(s => assert.equal(s.theme, 'town'));
  STAGES.slice(0, 3).forEach(s => assert.equal(s.guards, 0));
  assert.ok(STAGES[0].sunDrain < 0.5 && STAGES[0].beamDrain < 3.5);
  assert.ok(STAGES.some(s => s.theme === 'harbor') && STAGES.filter(s => s.goals.some(g => g.kind === 'noBeam')).every(s => s.n >= 60));
});

test('difficulty never drops from one level to the next within a theme', () => {
  for (const theme of Object.keys(THEMES)) {
    const ls = STAGES.filter(s => s.theme === theme);
    for (let i = 1; i < ls.length; i++) {
      const a = ls[i - 1], b = ls[i];
      assert.ok(scoreGoal(b) >= scoreGoal(a) && b.sunDrain >= a.sunDrain && b.beamDrain >= a.beamDrain && b.guards >= a.guards, `${a.id} -> ${b.id}`);
    }
  }
});
