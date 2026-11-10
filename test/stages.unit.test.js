// Layer: Unit — the 150-level table from www/stages.js (ids, goal labels, reachable goals, difficulty curve), no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const St = require('../www/stages.js');
const { STAGES, THEMES, goalLabel, EVENT_LEVELS, activeEvents, REGIONS, REGION_SIZE } = St;

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
    const cap = g.what === 'boss' ? (s.boss ? 1 : 0) : g.what === 'guard' ? s.guards : g.what === (s.vehicle || 'car') ? s.carsPerRoad * 4 : spawned(s, g.what) / 2;
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

test('the ladder is 15 regions of 10 levels, one map each, in REGIONS order; snow and hanok lower the sun, beach and desert raise it', () => {
  const ladder = Object.keys(THEMES).filter(k => !THEMES[k].event);
  assert.deepEqual(REGIONS.map(r => r.theme).sort(), ladder.sort());
  REGIONS.forEach((r, k) => STAGES.slice(k * REGION_SIZE, (k + 1) * REGION_SIZE).forEach(s => assert.equal(s.theme, r.theme, s.id)));
  const DEFAULT = 65 * Math.PI / 180;
  assert.equal(REGIONS.length * REGION_SIZE, STAGES.length);
  for (const s of STAGES) {
    if (s.theme === 'snow' || s.theme === 'hanok') assert.ok(s.sunMax < DEFAULT, s.id); // hanok: low houses need a low sun to shade anything
    else if (s.theme === 'beach' || s.theme === 'desert') assert.ok(s.sunMax > DEFAULT, s.id);
    else assert.equal(s.sunMax, undefined, s.id);
  }
});

test('each region starts its eat goal low again, and the harbor asks to dodge the lighthouse only from its 11th level', () => {
  for (let k = 0; k < REGIONS.length; k++) {
    const first = STAGES[k * REGION_SIZE], g = first.goals[1];
    // targets carry the 90-second scale-down (St.TIME_SCALE) applied to the 120-second tuning
    assert.equal(g.n, Math.max(1, Math.round(THEMES[first.theme].eat.find(e => e[0] === g.what)[1] * St.TIME_SCALE)), `${first.id} starts its eat goal at the low end`);
    assert.equal(first.goals[0].n, Math.round(REGIONS[k].score[0] * St.TIME_SCALE / 100) * 100, `${first.id} first-star score is the region's opening score`);
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

test('every region: level 2 clouds, 5 golden, 8 eclipse, 10 a boss you must swallow; events and other levels have none', () => {
  for (let r = 0; r < St.REGIONS.length; r++) {
    const lv = k => St.STAGES[r * St.REGION_SIZE + k - 1];
    assert.deepEqual([2, 5, 8, 10].map(k => lv(k).twist), ['clouds', 'golden', 'eclipse', 'boss'], `region ${r}`);
    for (const k of [1, 3, 4, 6, 7, 9]) assert.equal(lv(k).twist, null);
    assert.deepEqual(lv(10).goals[2], { kind: 'eat', what: 'boss', n: 1 });
    assert.ok(lv(10).boss.r >= 30);
  }
  assert.ok(St.STAGES[149].boss.r > St.STAGES[9].boss.r, 'later bosses are bigger');
  for (const t of ['clouds', 'golden', 'eclipse', 'boss']) assert.ok(St.TWIST_INFO[t].name && St.TWIST_INFO[t].text);
  for (const list of Object.values(St.EVENT_LEVELS)) for (const s of list) assert.equal(s.twist, null);
  assert.equal(St.goalLabel({ kind: 'eat', what: 'boss', n: 1 }), '거대 등불지기 1명 삼키기');
});

test('hard levels: the 8th of every region is hard, the boss level super-hard; nothing else, no events', () => {
  for (let r = 0; r < St.REGIONS.length; r++) {
    const hard = St.STAGES.slice(r * St.REGION_SIZE, (r + 1) * St.REGION_SIZE).map(s => s.hard);
    assert.deepEqual(hard, [null, null, null, null, null, null, null, 'hard', null, 'super'], `region ${r}`);
  }
  for (const list of Object.values(St.EVENT_LEVELS)) for (const s of list) assert.equal(s.hard, null);
});

test('every theme declares a building look the renderer knows (wall texture and roof shape)', () => {
  const walls = ['windows', 'planks', 'pastel', 'glass', 'brick', 'adobe', 'hanok', 'corrugated', 'concrete'];
  const roofs = ['flat', 'gable', 'hip', 'hanok'];
  for (const t of Object.values(THEMES)) {
    assert.ok(t.look && walls.includes(t.look.wall) && roofs.includes(t.look.roof), `${t.theme}: ${JSON.stringify(t.look)}`);
  }
  assert.equal(THEMES.hanok.look.roof, 'hanok');
  assert.ok(THEMES.snow.look.snow && THEMES.xmas.look.snow);
  // hanok: walled compounds, earthen lanes, and a village tree that is also a book entry
  assert.ok(THEMES.hanok.compound && THEMES.hanok.alley && THEMES.hanok.landmark === 'ginkgo');
  assert.ok(THEMES.hanok.extras.includes('fence') && THEMES.hanok.extras.includes('ginkgo'));
});
