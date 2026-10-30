// Shop catalog and wallet rules. Pure functions: every change returns a new wallet.
// Store plumbing (StoreKit, persistence) lives in store.js.
(function (root) {
  'use strict';

  const PREFIX = 'com.aspynlim.duskeater.';
  const DEFAULT_SKIN = 'night';
  const GEMS_PER_STAR = 10;
  const CREDIT_LOG = 200; // transaction ids remembered to ignore replays

  // Rims must stay clearly apart from the red "you are in light" warning (0xff6b6b).
  // `price` is only a fallback label for the browser demo; the app shows the App Store price.
  const SKINS = [
    { id: 'night', name: '밤 그림자', body: 0x16122a, rim: 0xb9a8ff, eye: 0xffffff },
    { id: 'mint', name: '박하 그림자', body: 0x0f2226, rim: 0x7ff0d2, eye: 0xffffff, product: PREFIX + 'skin.mint', price: '₩1,500' },
    { id: 'starry', name: '별밤 그림자', body: 0x101833, rim: 0x9fd0ff, eye: 0xfff3c4, product: PREFIX + 'skin.starry', price: '₩1,500' },
    { id: 'gold', name: '황금 그림자', body: 0x221a0c, rim: 0xffe08a, eye: 0xffffff, product: PREFIX + 'skin.gold', price: '₩2,200' },
    { id: 'ghost', name: '유령 그림자', body: 0x2a2d3a, rim: 0xf4f6ff, eye: 0xb9f6ff, product: PREFIX + 'skin.ghost', price: '₩2,200' },
  ];

  const GEM_PACKS = [
    { product: PREFIX + 'gems.100', gems: 100, price: '₩1,100' },
    { product: PREFIX + 'gems.550', gems: 550, price: '₩4,400' },
    { product: PREFIX + 'gems.1200', gems: 1200, price: '₩8,800' },
  ];

  // One-run boosters bought with gems before a stage.
  const BOOSTS = [
    { id: 'time', name: '황혼 연장', desc: '하루 +20초', cost: 40, extraTime: 20 },
    { id: 'size', name: '큰 그림자', desc: '더 크게 시작', cost: 30, startR: 20 },
  ];

  const allProducts = () => SKINS.filter(s => s.product).map(s => s.product).concat(GEM_PACKS.map(p => p.product));

  function emptyWallet() {
    return { gems: 0, owned: [], equipped: DEFAULT_SKIN, credited: [], pending: 0 };
  }

  // Accept whatever was saved; anything malformed falls back to an empty field.
  function normalize(w) {
    const e = emptyWallet();
    if (!w || typeof w !== 'object') return e;
    const int = v => (Number.isInteger(v) && v > 0 ? v : 0);
    const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
    const owned = strs(w.owned).filter(id => SKINS.some(s => s.id === id && s.product));
    const equipped = owned.includes(w.equipped) ? w.equipped : DEFAULT_SKIN;
    return { gems: int(w.gems), owned, equipped, credited: strs(w.credited).slice(-CREDIT_LOG), pending: int(w.pending) };
  }

  const skinFor = product => SKINS.find(s => s.product === product);
  const packFor = product => GEM_PACKS.find(p => p.product === product);

  // Grant what a completed transaction bought. Replays of the same transaction id are ignored.
  function creditTransaction(w, tx) {
    if (!tx || tx.revocationDate || w.credited.includes(tx.transactionId)) return w;
    const pack = packFor(tx.productIdentifier), skin = skinFor(tx.productIdentifier);
    if (!pack && !skin) return w;
    const next = Object.assign({}, w, { credited: w.credited.concat(tx.transactionId).slice(-CREDIT_LOG) });
    if (pack) next.gems = w.gems + pack.gems;
    if (skin && !w.owned.includes(skin.id)) next.owned = w.owned.concat(skin.id);
    return next;
  }

  // Skins are non-consumable: the App Store's current entitlements are the truth (covers refunds and restores).
  function applyEntitlements(w, purchases) {
    const owned = [];
    for (const p of purchases || []) {
      const s = skinFor(p.productIdentifier);
      if (s && !p.revocationDate && !owned.includes(s.id)) owned.push(s.id);
    }
    return Object.assign({}, w, { owned, equipped: owned.includes(w.equipped) ? w.equipped : DEFAULT_SKIN });
  }

  function equip(w, id) {
    if (id !== DEFAULT_SKIN && !w.owned.includes(id)) return w;
    return Object.assign({}, w, { equipped: id });
  }

  function spend(w, n) {
    return n > w.gems ? null : Object.assign({}, w, { gems: w.gems - n });
  }

  // Boost gems are held as `pending` until the run ends, so a run cut short by the app closing is refunded.
  function startBoosts(w, ids) {
    const cost = BOOSTS.filter(b => ids.includes(b.id)).reduce((a, b) => a + b.cost, 0);
    const paid = spend(w, cost);
    return paid && Object.assign(paid, { pending: cost });
  }
  const finishRun = w => Object.assign({}, w, { pending: 0 });
  const refundPending = w => Object.assign({}, w, { gems: w.gems + w.pending, pending: 0 });

  function awardStars(w, before, after) {
    const gained = Math.max(0, after - before);
    return gained ? Object.assign({}, w, { gems: w.gems + gained * GEMS_PER_STAR }) : w;
  }

  const api = {
    PREFIX, DEFAULT_SKIN, GEMS_PER_STAR, CREDIT_LOG, SKINS, GEM_PACKS, BOOSTS, allProducts,
    emptyWallet, normalize, creditTransaction, applyEntitlements, equip, spend,
    startBoosts, finishRun, refundPending, awardStars,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskShop = api;
})(this);
