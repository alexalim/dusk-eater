// Layer: Unit — the 150-level table from www/stages.js (ids, goal labels, reachable goals, difficulty curve), no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STAGES, THEMES, goalLabel, EVENT_LEVELS, activeEvents, REGIONS, REGION_SIZE } = require('../www/stages.js');

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

test('eat goals ask for at most half of what spawns (road vehicles, guards per level)', () => {
  for (const s of STAGES) for (const g of s.goals.filter(g => g.kind === 'eat')) {
    const cap = g.what === 'guard' ? s.guards : g.what === (s.vehicle || 'car') ? s.carsPerRoad * 4 : spawned(s, g.what) / 2;
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

test('the ladder is 15 regions of 10 levels, one map each, in REGIONS order; snow lowers the sun, beach and desert raise it', () => {
  const ladder = Object.keys(THEMES).filter(k => !THEMES[k].event);
  assert.deepEqual(REGIONS.map(r => r.theme).sort(), ladder.sort());
  REGIONS.forEach((r, k) => STAGES.slice(k * REGION_SIZE, (k + 1) * REGION_SIZE).forEach(s => assert.equal(s.theme, r.theme, s.id)));
  const DEFAULT = 65 * Math.PI / 180;
  assert.equal(REGIONS.length * REGION_SIZE, STAGES.length);
  for (const s of STAGES) {
    if (s.theme === 'snow') assert.ok(s.sunMax < DEFAULT, s.id);
    else if (s.theme === 'beach' || s.theme === 'desert') assert.ok(s.sunMax > DEFAULT, s.id);
    else assert.equal(s.sunMax, undefined, s.id);
  }
});

test('each region starts its eat goal low again, and the harbor asks to dodge the lighthouse only from its 11th level', () => {
  for (let k = 0; k < REGIONS.length; k++) {
    const first = STAGES[k * REGION_SIZE], g = first.goals[1];
    assert.equal(g.n, THEMES[first.theme].eat.find(e => e[0] === g.what)[1], `${first.id} starts its eat goal at the low end`);
    assert.equal(first.goals[0].n, REGIONS[k].score[0], `${first.id} first-star score is the region's opening score`);
  }
  const harbor = STAGES.filter(s => s.theme === 'harbor');
  harbor.forEach((s, i) => assert.equal(s.goals.some(g => g.kind === 'noBeam'), i >= 10 && s.n % 2 === 0, s.id));
});

test('Christmas event: 10 levels with their own ids, varied targets, rising difficulty; open Dec 1 - Jan 6 only', () => {
  const L = EVENT_LEVELS.xmas;
  assert.equal(L.length, 10);
  assert.deepEqual(L.map(s => s.id), Array.from({ length: 10 }, (_, i) => `xmas-${i + 1}`));
  assert.ok(L.every(s => s.theme === 'xmas' && !STAGES.some(m => m.id === s.id)));
  assert.equal(new Set(L.map(s => s.goals[1].what)).size, 4);
  for (let i = 1; i < L.length; i++) assert.ok(L[i].goals[0].n > L[i - 1].goals[0].n && L[i].sunDrain >= L[i - 1].sunDrain);
  const on = d => activeEvents(new Date(d + 'T12:00:00')).map(e => e.id);
  assert.deepEqual(['2026-11-30', '2026-12-01', '2026-12-31', '2027-01-01', '2027-01-06', '2027-01-07'].map(on),
    [[], ['xmas'], ['xmas'], ['xmas'], ['xmas'], []]);
});
