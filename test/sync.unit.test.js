// Layer: Unit — cloud-save merge rules from www/sync.js (stars, best scores, wallet), no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const Y = require('../www/sync.js');
const S = require('../www/shop.js');

const wallet = w => Object.assign(S.emptyWallet(), w);
const save = (o = {}) => Object.assign({ stars: {}, best: {}, wallet: wallet(), updatedAt: 0, syncedAt: null }, o);

test('no account save yet: the device save goes up as is', () => {
  const d = save({ stars: { L1: 2 }, wallet: wallet({ gems: 30 }) });
  assert.deepEqual(Y.merge(d, null).stars, { L1: 2 });
});

test('stars and best scores keep the higher value per level, from either side', () => {
  const m = Y.merge(save({ stars: { L1: 3, L2: 1 }, best: { L1: 900 } }), save({ stars: { L2: 2, L3: 1 }, best: { L1: 1200, L2: 50 } }));
  assert.deepEqual(m.stars, { L1: 3, L2: 2, L3: 1 });
  assert.deepEqual(m.best, { L1: 1200, L2: 50 });
});

test('a fresh install signing in never wipes the account gems (first link takes the larger)', () => {
  const phone2 = save({ wallet: wallet({ gems: 0 }), updatedAt: 2000 });            // newer, but never synced
  const account = save({ wallet: wallet({ gems: 450, owned: ['mint'], equipped: 'mint' }), updatedAt: 1000 });
  const m = Y.merge(phone2, account);
  assert.equal(m.wallet.gems, 450);
  assert.deepEqual(m.wallet.owned, ['mint']);
});

test('after the first sync, gems follow whichever save changed last (spending is not undone)', () => {
  const account = save({ wallet: wallet({ gems: 450 }), updatedAt: 1000 });
  const spent = save({ wallet: wallet({ gems: 380 }), updatedAt: 2000, syncedAt: 1000 });
  assert.equal(Y.merge(spent, account).wallet.gems, 380);
  const stale = save({ wallet: wallet({ gems: 500 }), updatedAt: 500, syncedAt: 400 });
  assert.equal(Y.merge(stale, account).wallet.gems, 450);
});

test('skins and credited purchases are unions, so a purchase is credited once per account', () => {
  const d = save({ wallet: wallet({ owned: ['mint'], credited: ['t1'] }), syncedAt: 1 });
  const a = save({ wallet: wallet({ owned: ['santa'], credited: ['t2'] }) });
  const m = Y.merge(d, a);
  assert.deepEqual(m.wallet.owned.sort(), ['mint', 'santa']);
  assert.deepEqual(m.wallet.credited.sort(), ['t1', 't2']);
  assert.equal(S.creditTransaction(m.wallet, { productIdentifier: S.GEM_PACKS[0].product, transactionId: 't2' }), m.wallet);
});

test('new bests are only the levels that beat the account', () => {
  assert.deepEqual(Y.newBests(save({ best: { L1: 900, L2: 300, L3: 10 } }), save({ best: { L1: 1200, L2: 100 } })),
    [{ level: 'L2', score: 300 }, { level: 'L3', score: 10 }]);
});

test('friend codes and nicknames are cleaned before they reach the server', () => {
  assert.ok(Y.isFriendCode(' a1b2c3 '));
  assert.ok(!Y.isFriendCode('A1B2C') && !Y.isFriendCode('Z1B2C3'));
  assert.equal(Y.cleanNickname('  밤의   그림자는 무섭지 않아  '), '밤의 그림자는 무섭지'); // 12 chars, no trailing space
});
