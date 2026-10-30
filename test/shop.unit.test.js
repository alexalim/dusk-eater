// Layer: Unit — wallet rules from www/shop.js (credits, spending, entitlements), no store or DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../www/shop.js');

const GEMS_S = S.GEM_PACKS[0], SKIN = S.SKINS.find(s => s.product);
const tx = (product, id, extra) => Object.assign({ productIdentifier: product, transactionId: id }, extra);

test('buying a gem pack credits its gems once, even if the same transaction arrives twice', () => {
  let w = S.emptyWallet();
  w = S.creditTransaction(w, tx(GEMS_S.product, 't1'));
  assert.equal(w.gems, GEMS_S.gems);
  w = S.creditTransaction(w, tx(GEMS_S.product, 't1'));
  assert.equal(w.gems, GEMS_S.gems, 'replayed transaction is a no-op');
  w = S.creditTransaction(w, tx(GEMS_S.product, 't2'));
  assert.equal(w.gems, GEMS_S.gems * 2);
});

test('an unknown product or a revoked transaction credits nothing', () => {
  let w = S.emptyWallet();
  w = S.creditTransaction(w, tx('com.example.other', 't1'));
  w = S.creditTransaction(w, tx(GEMS_S.product, 't2', { revocationDate: '2026-10-30T00:00:00Z' }));
  assert.equal(w.gems, 0);
});

test('buying a skin owns it; the credit log stays bounded', () => {
  let w = S.creditTransaction(S.emptyWallet(), tx(SKIN.product, 's1'));
  assert.ok(w.owned.includes(SKIN.id));
  for (let i = 0; i < 500; i++) w = S.creditTransaction(w, tx(GEMS_S.product, 'g' + i));
  assert.ok(w.credited.length <= S.CREDIT_LOG);
  assert.equal(w.gems, GEMS_S.gems * 500);
});

test('spending more gems than the balance fails and changes nothing', () => {
  const w = Object.assign(S.emptyWallet(), { gems: 30 });
  assert.equal(S.spend(w, 40), null);
  assert.equal(S.spend(w, 30).gems, 0);
  assert.equal(w.gems, 30, 'input wallet is not mutated');
});

test('entitlements: refunded skin becomes unowned and an equipped refunded skin falls back to the default', () => {
  let w = S.creditTransaction(S.emptyWallet(), tx(SKIN.product, 's1'));
  w = S.equip(w, SKIN.id);
  assert.equal(w.equipped, SKIN.id);
  w = S.applyEntitlements(w, [tx(SKIN.product, 's1', { revocationDate: '2026-10-30T00:00:00Z' })]);
  assert.ok(!w.owned.includes(SKIN.id));
  assert.equal(w.equipped, S.DEFAULT_SKIN);
});

test('entitlements restore a skin bought on another device', () => {
  const w = S.applyEntitlements(S.emptyWallet(), [tx(SKIN.product, 's9')]);
  assert.ok(w.owned.includes(SKIN.id));
});

test('equipping a skin you do not own is refused', () => {
  const w = S.equip(S.emptyWallet(), SKIN.id);
  assert.equal(w.equipped, S.DEFAULT_SKIN);
});

test('boosts: paid up front, refunded if the run never finished, cleared when it did', () => {
  const ids = S.BOOSTS.map(b => b.id);
  const cost = S.BOOSTS.reduce((a, b) => a + b.cost, 0);
  const rich = Object.assign(S.emptyWallet(), { gems: cost + 5 });
  assert.equal(S.startBoosts(Object.assign(S.emptyWallet(), { gems: cost - 1 }), ids), null);
  const running = S.startBoosts(rich, ids);
  assert.equal(running.gems, 5);
  assert.equal(running.pending, cost);
  assert.equal(S.refundPending(running).gems, cost + 5, 'app killed mid-run: gems come back');
  const done = S.finishRun(running);
  assert.equal(done.gems, 5); assert.equal(done.pending, 0);
  assert.equal(S.refundPending(done).gems, 5, 'nothing to refund after a finished run');
});

test('stars: first-time stars pay gems, replaying for the same stars pays nothing', () => {
  let w = S.awardStars(S.emptyWallet(), 0, 2);
  assert.equal(w.gems, 2 * S.GEMS_PER_STAR);
  w = S.awardStars(w, 2, 2);
  assert.equal(w.gems, 2 * S.GEMS_PER_STAR);
  w = S.awardStars(w, 2, 3);
  assert.equal(w.gems, 3 * S.GEMS_PER_STAR);
});

test('a damaged saved wallet loads as a valid one', () => {
  const w = S.normalize({ gems: -5, owned: 'x', equipped: 'nope', credited: null, pending: 'a' });
  assert.deepEqual(w, S.emptyWallet());
  assert.deepEqual(S.normalize(null), S.emptyWallet());
});

test('every skin keeps a rim distinct from the red "in light" warning', () => {
  const red = [0xff, 0x6b, 0x6b];
  for (const s of S.SKINS) {
    const c = [s.rim >> 16, (s.rim >> 8) & 255, s.rim & 255];
    const d = Math.hypot(c[0] - red[0], c[1] - red[1], c[2] - red[2]);
    assert.ok(d > 120, `${s.id} rim too close to the warning red (${d.toFixed(0)})`);
  }
});

test('product ids are unique and live under the app bundle id', () => {
  const ids = S.allProducts();
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^com\.aspynlim\.duskeater\.[a-z0-9_.]+$/);
});
