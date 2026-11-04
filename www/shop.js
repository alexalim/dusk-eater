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
    // `pupil` is the eye highlight; it defaults to dark for skins with light eyes.
    { id: 'night', name: '밤 그림자', body: 0xfff7f8, rim: 0xb78cff, eye: 0x241640, pupil: 0xffffff,
      desc: '처음부터 함께하는 기본 친구예요. 하얀 몸에 보랏빛 테두리가 포근해요.' },
    { id: 'mint', name: '박하 그림자', body: 0x0f2226, rim: 0x7ff0d2, eye: 0xffffff, product: PREFIX + 'skin.mint', price: '₩1,500',
      desc: '어두운 몸에 시원한 박하색 테두리를 둘렀어요. 그늘 속에서도 산뜻하게 보여요.' },
    { id: 'starry', name: '별밤 그림자', body: 0x101833, rim: 0x9fd0ff, eye: 0xfff3c4, product: PREFIX + 'skin.starry', price: '₩1,500',
      desc: '밤하늘처럼 짙은 몸에 하늘빛 테두리가 은은해요. 별빛 같은 노란 눈이 반짝여요.' },
    { id: 'gold', name: '황금 그림자', body: 0x221a0c, rim: 0xffe08a, eye: 0xffffff, product: PREFIX + 'skin.gold', price: '₩2,200',
      desc: '반짝반짝 황금빛 테두리를 두른 특별한 아이예요. 어디에 있어도 눈에 쏙 들어와요.' },
    // Earned, not bought: `reward` names the event whose stars unlock it.
    { id: 'santa', name: '산타 그림자', body: 0x3a0d14, rim: 0x7fe08a, eye: 0xffffff, reward: 'xmas',
      desc: '크리스마스 이벤트 선물이에요. 빨간 몸에 초록 테두리로 겨울 기분을 내요.' },
  ];

  const GEM_PACKS = [
    { product: PREFIX + 'gems.100', gems: 100, price: '₩1,100' },
    { product: PREFIX + 'gems.550', gems: 550, price: '₩4,400' },
    { product: PREFIX + 'gems.1200', gems: 1200, price: '₩8,800' },
  ];

  // One-run boosters bought with gems before a stage.
  const BOOSTS = [
    { id: 'time', name: '황혼 연장', desc: '하루 +20초', cost: 40, extraTime: 20 },
    { id: 'size', name: '통통하게 출발', desc: '처음부터 더 크게', cost: 30, startR: 20 },
  ];

  const allProducts = () => SKINS.filter(s => s.product).map(s => s.product).concat(GEM_PACKS.map(p => p.product));

  function emptyWallet() {
    return { gems: 0, owned: [], equipped: DEFAULT_SKIN, credited: [], pending: 0, dex: [], dexClaimed: [] };
  }

  // Accept whatever was saved; anything malformed falls back to an empty field.
  function normalize(w) {
    const e = emptyWallet();
    if (!w || typeof w !== 'object') return e;
    const int = v => (Number.isInteger(v) && v > 0 ? v : 0);
    const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
    const owned = strs(w.owned).filter(id => SKINS.some(s => s.id === id && (s.product || s.reward)));
    const equipped = owned.includes(w.equipped) ? w.equipped : DEFAULT_SKIN;
    const dex = [...new Set(strs(w.dex))]; // collection book (dex.js): kinds swallowed, rewards taken
    const dexClaimed = [...new Set(strs(w.dexClaimed))].filter(id => dex.includes(id));
    return { gems: int(w.gems), owned, equipped, credited: strs(w.credited).slice(-CREDIT_LOG), pending: int(w.pending), dex, dexClaimed };
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

  // Skins are non-consumable: the App Store's current entitlements are the truth for bought skins
  // (covers refunds and restores). Event-reward skins never come from the store, so they are kept.
  function applyEntitlements(w, purchases) {
    const owned = w.owned.filter(id => SKINS.some(s => s.id === id && s.reward));
    for (const p of purchases || []) {
      const s = skinFor(p.productIdentifier);
      if (s && !p.revocationDate && !owned.includes(s.id)) owned.push(s.id);
    }
    return Object.assign({}, w, { owned, equipped: owned.includes(w.equipped) ? w.equipped : DEFAULT_SKIN });
  }

  // Event reward: grant the skin once (idempotent).
  function grantReward(w, id) {
    const s = SKINS.find(k => k.id === id);
    if (!s || !s.reward || w.owned.includes(id)) return w;
    return Object.assign({}, w, { owned: w.owned.concat(id) });
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
    emptyWallet, normalize, creditTransaction, applyEntitlements, grantReward, equip, spend,
    startBoosts, finishRun, refundPending, awardStars,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskShop = api;
})(this);
