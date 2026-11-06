// Layer: Unit — player level rules from www/level.js (experience curve, level-up gems), no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../www/level.js');
const S = require('../www/shop.js');
const Y = require('../www/sync.js');

const wallet = w => Object.assign(S.emptyWallet(), w);

test('level 1 at zero; each level needs 40 more than the last', () => {
  assert.deepEqual(L.levelOf(0), { level: 1, into: 0, next: 120 });
  assert.deepEqual(L.levelOf(undefined), { level: 1, into: 0, next: 120 });
  assert.deepEqual(L.levelOf(119), { level: 1, into: 119, next: 120 });
  assert.deepEqual(L.levelOf(120), { level: 2, into: 0, next: 160 });
  assert.deepEqual(L.levelOf(120 + 160 + 5), { level: 3, into: 5, next: 200 });
});

test('a run earns its swallows plus 30 per star', () => {
  assert.equal(L.runXp(42, 0), 42);
  assert.equal(L.runXp(42, 3), 42 + 90);
});

test('gaining experience pays every level crossed, the fifth level paying more', () => {
  const r = L.gain(wallet({ gems: 1 }), 120 + 160 + 200 + 240); // 1 -> 5
  assert.equal(r.from, 1); assert.equal(r.to, 5);
  assert.equal(r.gems, 10 + 10 + 10 + 30);
  assert.equal(r.wallet.gems, 1 + r.gems);
  const again = L.gain(r.wallet, 1);
  assert.equal(again.gems, 0, 'no level crossed, no gems');
  assert.equal(again.wallet.stats.xp, 721);
});

test('experience is saved with the other records and merges by max across phones', () => {
  const w = S.normalize(JSON.parse(JSON.stringify(L.gain(wallet(), 300).wallet)));
  assert.equal(w.stats.xp, 300);
  const save = (xp, t) => ({ stars: {}, best: {}, wallet: wallet({ stats: { xp } }), updatedAt: t, syncedAt: 1 });
  assert.equal(Y.merge(save(300, 2), save(500, 1)).wallet.stats.xp, 500);
});

test('perks: the strongest reached so far, nothing before 5, capped at level 20', () => {
  assert.deepEqual([L.perksOf(4).startR, L.perksOf(4).sun], [1, 1]);
  assert.deepEqual([L.perksOf(5).startR, L.perksOf(5).sun], [1.05, 1]);
  assert.deepEqual([L.perksOf(12).startR, L.perksOf(12).sun], [1.05, 0.9]);
  assert.deepEqual([L.perksOf(99).startR, L.perksOf(99).sun], [1.1, 0.8]);
});

test('titles follow the level; level skins are due once reached and never sold', () => {
  assert.equal(L.titleOf(1), '아기 그림자');
  assert.equal(L.titleOf(9), '동네 그림자');
  assert.equal(L.titleOf(30), '어둠의 전설');
  const xpFor = lv => Array.from({ length: lv - 1 }, (_, i) => L.need(i + 1)).reduce((a, b) => a + b, 0);
  const w = wallet({ stats: { xp: xpFor(10) } });
  assert.deepEqual(L.dueSkins(w, S.SKINS), ['candy', 'aurora']);
  assert.deepEqual(L.dueSkins(S.grantReward(S.grantReward(w, 'candy'), 'aurora'), S.SKINS), []);
  for (const s of S.SKINS.filter(k => k.level)) assert.ok(!s.product && s.reward, s.id);
});
