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
  // A paid skin also sells for `gems` (buySkin), so a patient player gets it without paying.
  const SKINS = [
    // `pupil` is the eye highlight; it defaults to dark for skins with light eyes.
    { id: 'night', name: '밤 그림자', body: 0xfff7f8, rim: 0xb78cff, eye: 0x241640, pupil: 0xffffff,
      desc: '처음부터 함께하는 기본 친구예요. 하얀 몸에 보랏빛 테두리가 포근해요.' },
    { id: 'mint', name: '박하 그림자', body: 0x0f2226, rim: 0x7ff0d2, eye: 0xffffff, product: PREFIX + 'skin.mint', gems: 300, price: '₩1,500',
      desc: '어두운 몸에 시원한 박하색 테두리를 둘렀어요. 그늘 속에서도 산뜻하게 보여요.' },
    { id: 'starry', name: '별밤 그림자', body: 0x101833, rim: 0x9fd0ff, eye: 0xfff3c4, product: PREFIX + 'skin.starry', gems: 300, price: '₩1,500',
      desc: '밤하늘처럼 짙은 몸에 하늘빛 테두리가 은은해요. 별빛 같은 노란 눈이 반짝여요.' },
    { id: 'gold', name: '황금 그림자', body: 0x221a0c, rim: 0xffe08a, eye: 0xffffff, product: PREFIX + 'skin.gold', gems: 500, price: '₩2,200',
      desc: '반짝반짝 황금빛 테두리를 두른 특별한 아이예요. 어디에 있어도 눈에 쏙 들어와요.' },
    // Earned, not bought: `reward` names the event whose stars unlock it.
    { id: 'santa', name: '산타 그림자', body: 0x3a0d14, rim: 0x7fe08a, eye: 0xffffff, reward: 'xmas',
      desc: '크리스마스 이벤트 선물이에요. 빨간 몸에 초록 테두리로 겨울 기분을 내요.' },
    // Level rewards: granted on reaching `level` (level.js), shown with the level they open at.
    { id: 'candy', name: '솜사탕 그림자', body: 0xffeef8, rim: 0xffa6ec, eye: 0x3a1240, pupil: 0xffffff, reward: 'level', level: 5,
      desc: 'Lv.5가 되면 찾아오는 달콤한 친구예요. 분홍 솜사탕처럼 폭신폭신해요.' },
    { id: 'aurora', name: '오로라 그림자', body: 0x0a1f2a, rim: 0x5ee7ff, eye: 0xffffff, reward: 'level', level: 10,
      desc: 'Lv.10을 넘긴 그림자만 입을 수 있어요. 북쪽 하늘처럼 푸른빛이 일렁여요.' },
    { id: 'galaxy', name: '은하 그림자', body: 0x120a2a, rim: 0xe0c3ff, eye: 0xffe08a, reward: 'level', level: 20,
      desc: 'Lv.20, 밤의 지배자에게 주는 선물이에요. 몸 안에 은하수가 반짝여요.' },
    { id: 'ember', name: '잿불 그림자', body: 0x2b1008, rim: 0xe8a800, eye: 0xfff3c4, reward: 'level', level: 40,
      desc: 'Lv.40, 달빛 포식자의 상이에요. 꺼지지 않는 잿불처럼 주황빛 테두리가 일렁여요.' },
    { id: 'tide', name: '밀물 그림자', body: 0xe6fbff, rim: 0x00b8d4, eye: 0x0a2a3a, pupil: 0xffffff, reward: 'level', level: 60,
      desc: 'Lv.60, 황혼의 군주에게 주는 선물이에요. 밀려오는 바닷물처럼 맑은 청록 테두리예요.' },
    { id: 'obsidian', name: '흑요석 그림자', body: 0x0a0a12, rim: 0xe040ff, eye: 0xffffff, reward: 'level', level: 80,
      desc: 'Lv.80, 심연의 입만 입는 옷이에요. 새까만 몸에 자홍빛 테두리가 날카롭게 빛나요.' },
    { id: 'dusk', name: '황혼 그림자', body: 0x3a1a4a, rim: 0xffffff, eye: 0xffd25c, reward: 'level', level: 100,
      desc: '만렙 Lv.100, 황혼 그 자체가 된 그림자예요. 보랏빛 몸을 하얀 빛이 감싸요.' },
    // Hidden: shown as ??? until its collection-book set is filled (`reward` is the set, dex.js SETS).
    { id: 'dawn', name: '새벽 그림자', body: 0x1d1430, rim: 0xf6a8ff, eye: 0xffffff, reward: 'dex', hidden: true,
      desc: '도감 첫 다섯 지도를 모두 채운 친구만 만나요. 새벽빛 분홍 테두리가 살랑거려요.' },
    { id: 'forest', name: '숲 그림자', body: 0x0e1f14, rim: 0xb8f06b, eye: 0xfff3c4, reward: 'dex', hidden: true,
      desc: '도감 가운데 다섯 지도를 채우면 나타나요. 연둣빛 테두리가 풀숲처럼 싱그러워요.' },
    { id: 'sky', name: '하늘 그림자', body: 0xeaf4ff, rim: 0x4f86ff, eye: 0x10203a, pupil: 0xffffff, reward: 'dex', hidden: true,
      desc: '도감 마지막 다섯 지도까지 다 채운 수집왕의 상이에요. 맑은 하늘색 몸이 시원해요.' },
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
    return { gems: 0, owned: [], equipped: DEFAULT_SKIN, credited: [], pending: 0, dex: [], dexClaimed: [], stats: {}, badges: [],
      tickets: {}, pendingTickets: [], daily: { n: 0, last: '' }, challenge: { date: '', progress: {}, claimed: [], chest: false } };
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
    // Lifetime records and claimed badges (badges.js): plain non-negative numbers and badge ids.
    const stats = {};
    if (w.stats && typeof w.stats === 'object') for (const [k, v] of Object.entries(w.stats)) if (Number.isFinite(v) && v > 0) stats[k] = v;
    const badges = [...new Set(strs(w.badges))];
    // Booster tickets (free boosts from daily rewards and challenges), the 7-day check-in, today's challenges.
    const tickets = {};
    if (w.tickets && typeof w.tickets === 'object') for (const b of BOOSTS) if (int(w.tickets[b.id])) tickets[b.id] = int(w.tickets[b.id]);
    const pendingTickets = strs(w.pendingTickets).filter(id => BOOSTS.some(b => b.id === id));
    const d = w.daily && typeof w.daily === 'object' ? w.daily : {};
    const daily = { n: int(d.n), last: typeof d.last === 'string' ? d.last : '' };
    const c = w.challenge && typeof w.challenge === 'object' ? w.challenge : {};
    const progress = {};
    if (c.progress && typeof c.progress === 'object') for (const [k, v] of Object.entries(c.progress)) if (Number.isFinite(v) && v > 0) progress[k] = v;
    const challenge = { date: typeof c.date === 'string' ? c.date : '', progress, claimed: [...new Set(strs(c.claimed))], chest: c.chest === true };
    return { gems: int(w.gems), owned, equipped, credited: strs(w.credited).slice(-CREDIT_LOG), pending: int(w.pending), dex, dexClaimed, stats, badges,
      tickets, pendingTickets, daily, challenge };
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

  // Buy a paid skin with gems instead of money: null when it is not for gems, already owned, or the gems are short.
  function buySkin(w, id) {
    const s = SKINS.find(k => k.id === id);
    if (!s || !s.gems || w.owned.includes(id) || w.gems < s.gems) return null;
    return Object.assign({}, w, { gems: w.gems - s.gems, owned: w.owned.concat(id) });
  }

  function equip(w, id) {
    if (id !== DEFAULT_SKIN && !w.owned.includes(id)) return w;
    return Object.assign({}, w, { equipped: id });
  }

  function spend(w, n) {
    return n > w.gems ? null : Object.assign({}, w, { gems: w.gems - n });
  }

  // Boost gems are held as `pending` until the run ends, so a run cut short by the app closing is refunded.
  // A boost with a ticket in the wallet uses the ticket instead of gems (held the same way in `pendingTickets`).
  function startBoosts(w, ids) {
    const chosen = BOOSTS.filter(b => ids.includes(b.id));
    const byTicket = chosen.filter(b => (w.tickets[b.id] || 0) > 0).map(b => b.id);
    const cost = chosen.filter(b => !byTicket.includes(b.id)).reduce((a, b) => a + b.cost, 0);
    const paid = spend(w, cost);
    if (!paid) return null;
    const tickets = Object.assign({}, w.tickets);
    for (const id of byTicket) tickets[id] -= 1;
    return Object.assign(paid, { pending: cost, tickets, pendingTickets: byTicket });
  }
  const finishRun = w => Object.assign({}, w, { pending: 0, pendingTickets: [] });
  function refundPending(w) {
    const tickets = Object.assign({}, w.tickets);
    for (const id of w.pendingTickets) tickets[id] = (tickets[id] || 0) + 1;
    return Object.assign({}, w, { gems: w.gems + w.pending, pending: 0, tickets, pendingTickets: [] });
  }

  // Give gems and/or booster tickets ({ gems, tickets: { time: 1 } }).
  function grant(w, r) {
    const tickets = Object.assign({}, w.tickets);
    for (const [id, n] of Object.entries(r.tickets || {})) tickets[id] = (tickets[id] || 0) + n;
    return Object.assign({}, w, { gems: w.gems + (r.gems || 0), tickets });
  }

  // Daily check-in: a 7-day calendar; a missed day just carries on from the next square, and after day 7 it starts over.
  const DAILY = [{ gems: 10 }, { tickets: { time: 1 } }, { gems: 20 }, { tickets: { size: 1 } }, { gems: 30 }, { tickets: { time: 1, size: 1 } }, { gems: 80 }];
  const dailyDue = (w, day) => w.daily.last !== day; // `day` is the local date, YYYY-MM-DD
  function claimDaily(w, day) {
    if (!dailyDue(w, day)) return w;
    const next = grant(w, DAILY[w.daily.n % DAILY.length]);
    return Object.assign(next, { daily: { n: w.daily.n + 1, last: day } });
  }

  function awardStars(w, before, after) {
    const gained = Math.max(0, after - before);
    return gained ? Object.assign({}, w, { gems: w.gems + gained * GEMS_PER_STAR }) : w;
  }

  const api = { buySkin,
    PREFIX, DEFAULT_SKIN, GEMS_PER_STAR, CREDIT_LOG, SKINS, GEM_PACKS, BOOSTS, allProducts,
    emptyWallet, normalize, creditTransaction, applyEntitlements, grantReward, equip, spend,
    startBoosts, finishRun, refundPending, awardStars, grant, DAILY, dailyDue, claimDaily,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskShop = api;
})(this);
