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

test('perks: the strongest reached so far, nothing before 5, the last ones at the cap', () => {
  assert.deepEqual([L.perksOf(4).startR, L.perksOf(4).sun], [1, 1]);
  assert.deepEqual([L.perksOf(5).startR, L.perksOf(5).sun], [1.05, 1]);
  assert.deepEqual([L.perksOf(12).startR, L.perksOf(12).sun], [1.05, 0.9]);
  const p24 = L.perksOf(24);
  assert.deepEqual([p24.startR, p24.sun, p24.combo, p24.shard, p24.shardEvery, p24.zombie], [1.1, 0.8, 0, 1, 1, 0], 'the old road ends at 20');
  const p99 = L.perksOf(99);
  assert.deepEqual([p99.startR, p99.sun, p99.combo, p99.shard, p99.shardEvery, p99.zombie], [1.2, 0.75, 1, 1.25, 0.8, 1]);
  assert.equal(L.perksOf(100).sun, 0.7);
  for (const p of L.PERKS) assert.ok(p.level <= L.MAX_LEVEL && p.text, p.level);
});

test('the cap: level 100 holds, its bar reads full, and nothing is paid past it', () => {
  const xpFor = lv => Array.from({ length: lv - 1 }, (_, i) => L.need(i + 1)).reduce((a, b) => a + b, 0);
  assert.equal(L.levelOf(xpFor(99)).level, 99);
  assert.deepEqual(L.levelOf(xpFor(100)), { level: 100, into: 1, next: 1, max: true });
  assert.deepEqual(L.levelOf(xpFor(100) + 999999), { level: 100, into: 1, next: 1, max: true });
  assert.ok(xpFor(30) > 19000 && xpFor(30) < 21000, 'about 20k to 30');
  assert.ok(xpFor(100) > 200000, 'ten times that to the cap');
  const r = L.gain(wallet({ stats: { xp: xpFor(100) - 1 } }), 5000);
  assert.deepEqual([r.from, r.to, r.gems], [99, 100, 150]);
  assert.equal(L.gain(r.wallet, 5000).gems, 0, 'past the cap no more gems');
});

test('level gems: 10 as a rule, 30 at fives, 60 at tens, 150 at 25s', () => {
  assert.deepEqual([3, 5, 10, 15, 20, 25, 30, 50, 75, 100].map(L.reward), [10, 30, 60, 30, 60, 150, 60, 150, 150, 150]);
});

test('titles follow the level; level skins are due once reached and never sold', () => {
  assert.equal(L.titleOf(1), '아기 그림자');
  assert.equal(L.titleOf(9), '동네 그림자');
  assert.equal(L.titleOf(30), '어둠의 전설');
  assert.equal(L.titleOf(39), '어둠의 전설');
  assert.equal(L.titleOf(100), '황혼 그 자체');
  assert.equal(L.TITLES[L.TITLES.length - 1][0], L.MAX_LEVEL);
  const xpFor = lv => Array.from({ length: lv - 1 }, (_, i) => L.need(i + 1)).reduce((a, b) => a + b, 0);
  const w = wallet({ stats: { xp: xpFor(10) } });
  assert.deepEqual(L.dueSkins(w, S.SKINS), ['candy', 'aurora']);
  assert.deepEqual(L.dueSkins(S.grantReward(S.grantReward(w, 'candy'), 'aurora'), S.SKINS), []);
  for (const s of S.SKINS.filter(k => k.level)) assert.ok(!s.product && s.reward, s.id);
  assert.deepEqual(S.SKINS.filter(k => k.level).map(k => k.level), [5, 10, 20, 40, 60, 80, 100], 'a level skin every stretch of the road to the cap');
  assert.deepEqual(L.dueSkins(wallet({ stats: { xp: xpFor(40) } }), S.SKINS), ['candy', 'aurora', 'galaxy', 'ember']);
});
