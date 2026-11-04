// Layer: Unit — collection book rules from www/dex.js plus its wallet fields in shop.js and sync.js, no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../www/dex.js');
const St = require('../www/stages.js');
const S = require('../www/shop.js');
const Y = require('../www/sync.js');

const wallet = w => Object.assign(S.emptyWallet(), w);

test('every kind any map can spawn has one entry with a name and an icon (no slot stays ??? forever)', () => {
  const ids = D.ENTRIES.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  for (const theme of D.THEME_ORDER) for (const id of D.spawnable(St.THEMES[theme])) assert.ok(ids.includes(id), `${theme}: ${id}`);
  for (const e of D.ENTRIES) {
    assert.ok(e.name && e.icon, `${e.id} has name and icon`);
    assert.ok(D.spawnable(St.THEMES[e.theme]).includes(e.id), `${e.id} spawns on ${e.theme}`);
  }
});

test('an entry belongs to the first map it shows up on; event-only kinds sit on the event map', () => {
  const at = id => D.ENTRIES.find(e => e.id === id).theme;
  assert.equal(at('person'), 'town');
  assert.equal(at('bench'), 'town', 'also in later maps, still the first');
  assert.equal(at('reindeer'), 'xmas');
  assert.ok(St.THEMES[at('reindeer')].event);
});

test('first swallow adds the kind once; unknown kinds are ignored', () => {
  let w = D.discover(wallet(), 'cat');
  assert.deepEqual(w.dex, ['cat']);
  assert.equal(D.discover(w, 'cat'), w, 'already known: same wallet');
  assert.equal(D.discover(w, 'nope'), w);
  assert.equal(D.unclaimed(w), 1);
});

test('a found card pays its reward once; an unfound card pays nothing', () => {
  let w = D.discover(wallet({ gems: 5 }), 'cat');
  assert.equal(D.claim(w, 'tree'), w, 'not found yet');
  w = D.claim(w, 'cat');
  assert.equal(w.gems, 5 + D.REWARD);
  assert.equal(D.claim(w, 'cat').gems, 5 + D.REWARD, 'second tap is a no-op');
  assert.equal(D.unclaimed(w), 0);
});

test('saved dex fields survive normalize; junk and claims without a find are dropped', () => {
  const w = S.normalize({ dex: ['cat', 'cat', 3, 'tree'], dexClaimed: ['cat', 'gift'] });
  assert.deepEqual(w.dex, ['cat', 'tree']);
  assert.deepEqual(w.dexClaimed, ['cat']);
  assert.deepEqual(S.normalize(null).dex, []);
});

test('cloud merge unions the book, so a reward taken on one phone stays taken on the other', () => {
  const save = (w, t) => ({ stars: {}, best: {}, wallet: wallet(w), updatedAt: t, syncedAt: 1 });
  const m = Y.merge(save({ dex: ['cat'], dexClaimed: ['cat'] }, 2), save({ dex: ['tree', 'cat'] }, 1));
  assert.deepEqual(m.wallet.dex.sort(), ['cat', 'tree']);
  assert.deepEqual(m.wallet.dexClaimed, ['cat']);
});
