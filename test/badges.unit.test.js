// Layer: Unit — badge rules from www/badges.js plus their wallet fields in shop.js and sync.js, no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../www/badges.js');
const D = require('../www/dex.js');
const S = require('../www/shop.js');
const Y = require('../www/sync.js');

const wallet = w => Object.assign(S.emptyWallet(), w);
const ctx = (w, stars = 0) => B.context(w, stars);

test('fifteen categories of three badges each, every one with a name, a goal, a reward and an icon', () => {
  assert.equal(B.CATS.length, 15);
  assert.equal(B.BADGES.length, 45);
  assert.equal(new Set(B.BADGES.map(b => b.id)).size, 45);
  for (const b of B.BADGES) assert.ok(b.name && b.goal && b.gems > 0, b.id);
  for (const c of B.CATS) assert.ok(fs.existsSync(path.join(__dirname, '../www/img/ui', `${c.icon}.svg`)), c.icon);
  assert.equal(B.CATS.find(c => c.id === 'dex').steps[2], D.ENTRIES.length, 'gold dex badge = the whole book');
});

test('tiers are earned at their thresholds, from records, stars and dex finds', () => {
  assert.deepEqual(B.earned(ctx(wallet())), []);
  assert.deepEqual(B.earned(ctx(wallet({ stats: { eaten: 299 } }))), []);
  assert.deepEqual(B.earned(ctx(wallet({ stats: { eaten: 3000 } }))), ['eater.0', 'eater.1']);
  assert.deepEqual(B.earned(ctx(wallet(), 30)), ['stars.0', 'stars.1']);
  assert.deepEqual(B.earned(ctx(wallet({ dex: D.ENTRIES.slice(0, 20).map(e => e.id) }))), ['dex.0']);
  assert.deepEqual(B.earned(ctx(wallet({ stats: { guards: 1, buildings: 10 } }))), ['hidden.0', 'hidden.2']);
});

test('a run adds to the counts and keeps the best of per-run records', () => {
  const run = { eaten: 120, guards: 1, clean: 1, size: 33.2, night: 12, buildings: 4 };
  let w = B.record(wallet(), run);
  w = B.record(w, Object.assign({}, run, { clean: 0, size: 20, night: 31 }));
  assert.deepEqual(w.stats, { eaten: 240, guards: 2, clean: 1, bosses: 0, golds: 0, bolts: 0, rush: 0, size: 33.2, night: 31, buildings: 4 });
});

test('an earned badge pays its gems once; an unearned one pays nothing', () => {
  let w = wallet({ gems: 3, stats: { eaten: 300 } });
  assert.equal(B.claimable(w, ctx(w)), 1);
  assert.equal(B.claim(w, 'eater.1', ctx(w)), w, 'not earned');
  w = B.claim(w, 'eater.0', ctx(w));
  assert.equal(w.gems, 3 + B.GEMS[0]);
  assert.equal(B.claim(w, 'eater.0', ctx(w)), w, 'second tap is a no-op');
  assert.equal(B.claimable(w, ctx(w)), 0);
});

test('records and claims survive normalize (junk dropped) and merge across phones without double counting', () => {
  const n = S.normalize({ stats: { eaten: 50, size: -1, x: 'a' }, badges: ['eater.0', 'eater.0', 7] });
  assert.deepEqual(n.stats, { eaten: 50 });
  assert.deepEqual(n.badges, ['eater.0']);
  const save = (w, t) => ({ stars: {}, best: {}, wallet: wallet(w), updatedAt: t, syncedAt: 1 });
  const m = Y.merge(save({ stats: { eaten: 500, size: 20 }, badges: ['eater.0'] }, 2), save({ stats: { eaten: 300, size: 40 } }, 1));
  assert.deepEqual(m.wallet.stats, { eaten: 500, size: 40 });
  assert.deepEqual(m.wallet.badges, ['eater.0']);
});

test('newer badges read their own records: bosses, golden friends, bolt missions, rush, check-in, missions, level, regions, skins', () => {
  let w = wallet({ owned: ['mint', 'gold'], daily: { n: 7, last: '' } });
  w = B.record(w, { bosses: 1, golds: 5, bolts: 3, rush: 50 });
  w.stats.missions = 5; w.stats.xp = 5000;
  const got = B.earned(B.context(w, 0, { regions: 1 }));
  for (const id of ['boss.0', 'golden.0', 'bolt.0', 'rush.0', 'checkin.0', 'missions.0', 'level.0', 'regions.0', 'skins.0']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('boss.1'));
  assert.equal(B.BADGES.find(b => b.id === 'level.1').goal, 'Lv.10 달성');
});
