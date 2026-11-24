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
    // `wear`: [kind, color, accent (white if left out)], the one small thing on its head in play. The kinds are drawn
    // by render3d (wearKind) and by the drawn shop picture (index.html WEAR_ART).
    // `art`: the painted picture (skin-art.js, packed from design/art/skins) the shop shows and the character is in play; `cat` is the shop section it sits in:
    // 'element' (what kind of dark it grew on), 'costume' (something to wear), 'season' (a time of year).
    // The ids are the slots players already own or earn (bought, level, collection book, event): a slot's id, price and
    // way in never change, only its name and look. So `aurora` is the Lv.10 slot (now Frost) and `tide` holds Aurora.
    // The lists keep each section together, and the level skins in level order.

    // ---- element ----
    { id: 'night', cat: 'element', art: 'luna', name: '루나', body: 0xfff7f8, rim: 0xb78cff, eye: 0x241640, pupil: 0xffffff,
      desc: '처음부터 함께하는 기본 친구예요. 연보랏빛 달의 정령이라 늘 밝고 호기심이 가득해요.' },
    // Level rewards: granted on reaching `level` (level.js), shown with the level they open at.
    { id: 'candy', cat: 'element', art: 'cotton_candy', name: '솜사탕', body: 0xffeef8, rim: 0xffa6ec, eye: 0x3a1240, pupil: 0xffffff, reward: 'level', level: 5, wear: ['flower', 0xff8fc8, 0xfff3b0],
      desc: 'Lv.5가 되면 찾아오는 달콤한 친구예요. 분홍과 하늘빛이 몽글몽글 섞여 폭신폭신해요.' },
    { id: 'aurora', cat: 'element', art: 'frost', name: '프로스트', body: 0xe3f4ff, rim: 0x5ee7ff, eye: 0x12304a, pupil: 0xffffff, reward: 'level', level: 10, wear: ['pin', 0xbfeaff],
      desc: 'Lv.10을 넘기면 만나요. 차가운 어둠을 먹고 자라 얼음 결정과 눈꽃이 피었어요.' },
    { id: 'galaxy', cat: 'element', art: 'midnight', name: '은하수', body: 0x1a1446, rim: 0xe0c3ff, eye: 0xffe08a, reward: 'level', level: 20, wear: ['pin', 0xffe08a],
      desc: 'Lv.20, 밤의 지배자에게 주는 선물이에요. 검푸른 몸 안에서 은하수가 반짝여요.' },
    { id: 'ember', cat: 'element', art: 'ember', name: '앰버', body: 0xffd2ae, rim: 0xe8a800, eye: 0x3a1608, pupil: 0xffffff, reward: 'level', level: 40, wear: ['pin', 0xffb347],
      desc: 'Lv.40, 달빛 포식자의 상이에요. 복숭아빛 몸에 따뜻한 불꽃이 일렁여요.' },
    { id: 'tide', cat: 'element', art: 'aurora', name: '오로라', body: 0xd9c8ff, rim: 0x3fe0c8, eye: 0x1a1040, pupil: 0xffffff, reward: 'level', level: 60, wear: ['bow', 0x5ee7d0],
      desc: 'Lv.60, 황혼의 군주에게 주는 선물이에요. 청록과 보랏빛 오로라가 몸을 타고 흘러요.' },
    { id: 'obsidian', cat: 'element', art: 'black_hole', name: '블랙홀', body: 0x0a0a12, rim: 0xe040ff, eye: 0xffffff, reward: 'level', level: 80, wear: ['pin', 0xffd45e],
      desc: 'Lv.80, 심연의 입만 입는 옷이에요. 새까만 몸을 황금빛 원반이 빙글빙글 감싸요.' },
    { id: 'dusk', cat: 'element', art: 'eclipse', name: '이클립스', body: 0x3a1a4a, rim: 0xffffff, eye: 0xffd25c, reward: 'level', level: 100, wear: ['crown', 0xffd25c],
      desc: '만렙 Lv.100, 일식의 정령이에요. 빛과 어둠이 한 몸에 나란히 살아요.' },
    { id: 'gold', cat: 'element', art: 'solaris', name: '솔라리스', body: 0xffe9a8, rim: 0xffe08a, eye: 0x3a2408, pupil: 0xffffff, product: PREFIX + 'skin.gold', gems: 500, price: '₩2,200', wear: ['crown', 0xffd45e, 0x7fd6ff],
      desc: '작은 태양처럼 빛나는 황금빛 정령이에요. 어디에 있어도 눈에 쏙 들어와요.' },
    // Hidden: shown as ??? until its collection-book set is filled (`reward` is the set, dex.js SETS).
    { id: 'dawn', cat: 'element', art: 'bloom', name: '블룸', body: 0xffdcea, rim: 0xf6a8ff, eye: 0x3a1240, pupil: 0xffffff, reward: 'dex', hidden: true, wear: ['flower', 0xff9fc8, 0xfff3b0],
      desc: '도감 첫 다섯 지도를 모두 채운 친구만 만나요. 꽃잎으로 된 몸에서 꽃가루가 살랑거려요.' },
    { id: 'forest', cat: 'element', art: 'moss', name: '모스', body: 0xe9f2dc, rim: 0xb8f06b, eye: 0x1c2a14, pupil: 0xffffff, reward: 'dex', hidden: true, wear: ['flower', 0xffffff, 0xffd45e],
      desc: '도감 가운데 다섯 지도를 채우면 나타나요. 이끼와 새싹, 작은 버섯이 자라는 숲의 정령이에요.' },
    { id: 'sky', cat: 'element', art: 'opal', name: '오팔', body: 0xeef2ff, rim: 0x9fb8ff, eye: 0x10203a, pupil: 0xffffff, reward: 'dex', hidden: true, wear: ['bow', 0xbfd8ff],
      desc: '도감 마지막 다섯 지도까지 다 채운 수집왕의 상이에요. 무지갯빛이 도는 반투명 보석 몸이에요.' },

    // ---- costume ----
    { id: 'mint', cat: 'costume', art: 'wizard', name: '마법사', body: 0xf3e8ff, rim: 0x9f7bff, eye: 0x2a1640, pupil: 0xffffff, product: PREFIX + 'skin.mint', gems: 300, price: '₩1,500', wear: ['hat', 0x7a4fd0, 0xffd45e],
      desc: '별 달린 고깔모자와 지팡이를 든 꼬마 마법사예요. 주문을 외우면 어둠이 모여들어요.' },
    { id: 'starry', cat: 'costume', art: 'astronaut', name: '우주비행사', body: 0xf3e8ff, rim: 0x9fd0ff, eye: 0x2a1640, pupil: 0xffffff, product: PREFIX + 'skin.starry', gems: 300, price: '₩1,500', wear: ['glasses', 0xdfe8ff],
      desc: '동그란 헬멧을 쓰고 밤하늘을 유영해요. 별과 별 사이의 어둠도 놓치지 않아요.' },
    // Gems only (no App Store product): `reward: 'gems'` keeps it through entitlement rebuilds like the earned skins.
    // `car`: the renderer seats the body on a little car (render3d setSkin).
    { id: 'car', cat: 'costume', name: '붕붕', body: 0xffe3ee, rim: 0x7fc8ff, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, car: true,
      desc: '작은 자동차에 쏙 올라탄 친구예요. 달리면 바퀴가 데굴데굴 굴러가요.' },
    { id: 'bunny', cat: 'costume', art: 'bunny', name: '토끼 후드', body: 0xf3e8ff, rim: 0xffb3d0, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['bow', 0xffb3d0],
      desc: '폭신한 토끼 후드를 뒤집어썼어요. 긴 귀가 걸을 때마다 쫑긋거려요.' },
    { id: 'pirate', cat: 'costume', art: 'pirate', name: '해적', body: 0xf3e8ff, rim: 0x8fd8e8, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['beret', 0x2a2433],
      desc: '해골 모자에 안대를 한 꼬마 선장이에요. 보물 대신 어둠을 찾아 항해해요.' },
    { id: 'sports', cat: 'costume', art: 'sports', name: '운동복', body: 0xf3e8ff, rim: 0x7f9bff, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['beret', 0x26366e],
      desc: '머리띠를 두르고 운동복을 입었어요. 가볍고 활동적이라 오늘도 한 바퀴 더 달려요.' },
    { id: 'knight', cat: 'costume', art: 'knight', name: '기사', body: 0xf3e8ff, rim: 0xb8c8ff, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['hat', 0xb8c0d0, 0x7a4fd0],
      desc: '반짝이는 투구와 별 방패를 든 기사예요. 마을의 밤을 씩씩하게 지켜요.' },
    { id: 'chef', cat: 'costume', art: 'chef', name: '요리사', body: 0xf3e8ff, rim: 0xffd9a8, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['beret', 0xffffff],
      desc: '높다란 요리사 모자를 썼어요. 오늘의 메뉴는 갓 구운 어둠 한 접시예요.' },
    { id: 'detective', cat: 'costume', art: 'detective', name: '탐정', body: 0xf3e8ff, rim: 0xbfd0e8, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['beret', 0x9a7a4e],
      desc: '체크무늬 모자에 돋보기를 든 명탐정이에요. 숨은 그늘을 단번에 찾아내요.' },
    { id: 'vampire', cat: 'costume', art: 'vampire', name: '뱀파이어', body: 0xf3e8ff, rim: 0xc79bff, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['bow', 0x9a1f3a],
      desc: '검붉은 망토를 두른 꼬마 뱀파이어예요. 햇빛은 싫고 어둠은 정말 좋아해요.' },
    { id: 'royal', cat: 'costume', art: 'royal', name: '왕족', body: 0xf3e8ff, rim: 0xe8c8ff, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['crown', 0xffd45e, 0xd04fd0],
      desc: '왕관과 망토를 갖춘 황혼 왕국의 주인이에요. 걸음걸이부터 우아해요.' },
    { id: 'archer', cat: 'costume', art: 'archer', name: '궁수', body: 0xf3e8ff, rim: 0xb8e08a, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['hat', 0x6f8f3a, 0xf3e9c8],
      desc: '깃털 모자를 쓰고 활을 멘 숲의 궁수예요. 멀리 있는 그늘도 정확히 겨눠요.' },
    { id: 'santasuit', cat: 'costume', art: 'santa', name: '산타', body: 0xf3e8ff, rim: 0x9fe0b8, eye: 0x2a1640, pupil: 0xffffff, reward: 'gems', gems: 600, wear: ['hat', 0xc8323c],
      desc: '빨간 모자와 망토에 종을 단 산타예요. 선물 주머니에는 포근한 밤이 들어 있어요.' },

    // ---- season ----
    // Earned, not bought: `reward` names the event whose stars unlock it. `reward: 'season'` has no event yet, so the
    // shop shows it as coming soon and nothing can grant it.
    { id: 'santa', cat: 'season', art: 'christmas', name: '크리스마스', body: 0xf3e8ff, rim: 0x7fe08a, eye: 0x2a1640, pupil: 0xffffff, reward: 'xmas', wear: ['hat', 0xc8323c],
      desc: '크리스마스 이벤트 선물이에요. 호랑가시 장식 모자를 쓰고 선물 상자를 들었어요.' },
    { id: 'cherry', cat: 'season', art: 'cherry_blossom', name: '벚꽃', body: 0xf3e8ff, rim: 0xffb7d5, eye: 0x2a1640, pupil: 0xffffff, reward: 'season', wear: ['flower', 0xffb7d5, 0xfff3b0],
      desc: '봄에만 만나는 친구예요. 벚꽃 가지를 머리에 꽂고 꽃잎을 흩날려요.' },
    { id: 'halloween', cat: 'season', art: 'halloween', name: '할로윈', body: 0xf3e8ff, rim: 0xb58cff, eye: 0x2a1640, pupil: 0xffffff, reward: 'season', wear: ['hat', 0x4a2a7a, 0xff9a2a],
      desc: '할로윈 밤에 찾아와요. 호박 장식 마녀 모자를 쓰고 사탕을 모으러 다녀요.' },
    { id: 'picnic', cat: 'season', art: 'picnic', name: '봄소풍', body: 0xf3e8ff, rim: 0xc8e89a, eye: 0x2a1640, pupil: 0xffffff, reward: 'season', wear: ['beret', 0xe8cf8a],
      desc: '봄 소풍 철의 친구예요. 꽃 달린 밀짚모자에 도시락 바구니를 챙겼어요.' },
    { id: 'summer', cat: 'season', art: 'summer', name: '여름휴가', body: 0xf3e8ff, rim: 0x6fd0ff, eye: 0x2a1640, pupil: 0xffffff, reward: 'season', wear: ['glasses', 0x4fc3ff],
      desc: '여름휴가를 떠난 친구예요. 물안경을 쓰고 튜브를 타고 둥실둥실 떠다녀요.' },
    { id: 'autumn', cat: 'season', art: 'autumn', name: '단풍', body: 0xf3e8ff, rim: 0xd8e07a, eye: 0x2a1640, pupil: 0xffffff, reward: 'season', wear: ['beret', 0xb5562a],
      desc: '가을에만 만나요. 체크 목도리를 두르고 단풍잎 사이를 사박사박 걸어요.' },
    { id: 'newyear', cat: 'season', art: 'new_year', name: '신년', body: 0xf3e8ff, rim: 0xc8b8ff, eye: 0x2a1640, pupil: 0xffffff, reward: 'season', wear: ['pin', 0xffd45e],
      desc: '새해 첫날의 친구예요. 고운 옷을 차려입고 불꽃놀이 아래에서 소원을 빌어요.' },
    { id: 'valentine', cat: 'season', art: 'valentine', name: '밸런타인', body: 0xf3e8ff, rim: 0xffb0e8, eye: 0x2a1640, pupil: 0xffffff, reward: 'season', wear: ['bow', 0xff8fc0],
      desc: '밸런타인데이의 친구예요. 분홍 리본을 매고 초콜릿 상자를 꼭 안았어요.' },
  ];

  // Summoning circles: a slow-turning pattern on the ground under the player. Looks only, no effect on play.
  // Colors stay clear of the gameplay signals (red light rim, orange hint rings, gold stars).
  const CIRCLES = [
    { id: 'moon', name: '달빛 마법진', color: 0xc9a8ff, gems: 200,
      desc: '발밑에 보랏빛 마법진이 천천히 돌아요. 그림자가 지나간 자리마다 달빛이 남아요.' },
    { id: 'stars', name: '별자리 원', color: 0x9fe3ff, gems: 300,
      desc: '하늘빛 별자리가 발밑을 빙 둘러요. 밤하늘을 데리고 다니는 기분이에요.' },
    { id: 'petal', name: '꽃잎 원', color: 0xffb3d9, reward: 'level', level: 15,
      desc: 'Lv.15가 되면 받아요. 분홍 꽃잎이 동그랗게 피어 함께 굴러가요.' },
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
    return { gems: 0, owned: [], equipped: DEFAULT_SKIN, circles: [], circle: '', credited: [], pending: 0, dex: [], dexClaimed: [], stats: {}, badges: [],
      tickets: {}, pendingTickets: [], daily: { n: 0, last: '' }, challenge: { date: '', progress: {}, claimed: [], chest: false },
      monthly: { month: '', points: 0, claimed: false }, monthBadges: [] }; // the monthly quest (challenge.js)
  }

  // Accept whatever was saved; anything malformed falls back to an empty field.
  function normalize(w) {
    const e = emptyWallet();
    if (!w || typeof w !== 'object') return e;
    const int = v => (Number.isInteger(v) && v > 0 ? v : 0);
    const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
    const owned = strs(w.owned).filter(id => SKINS.some(s => s.id === id && (s.product || s.reward)));
    const equipped = owned.includes(w.equipped) ? w.equipped : DEFAULT_SKIN;
    const circles = [...new Set(strs(w.circles))].filter(id => CIRCLES.some(c => c.id === id));
    const circle = circles.includes(w.circle) ? w.circle : ''; // '' = none
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
    const mo = w.monthly && typeof w.monthly === 'object' ? w.monthly : {};
    const monthly = { month: typeof mo.month === 'string' ? mo.month : '', points: int(mo.points), claimed: mo.claimed === true };
    const monthBadges = [...new Set(strs(w.monthBadges))].filter(m => /^\d{4}-\d{2}$/.test(m));
    return { gems: int(w.gems), owned, equipped, circles, circle, credited: strs(w.credited).slice(-CREDIT_LOG), pending: int(w.pending), dex, dexClaimed, stats, badges,
      tickets, pendingTickets, daily, challenge, monthly, monthBadges };
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

  // Circles: bought with gems or reached by level; wearing one is optional, so equipping the worn one takes it off.
  function buyCircle(w, id) {
    const c = CIRCLES.find(k => k.id === id);
    if (!c || !c.gems || w.circles.includes(id) || w.gems < c.gems) return null;
    return Object.assign({}, w, { gems: w.gems - c.gems, circles: w.circles.concat(id) });
  }
  const dueCircles = (w, level) => CIRCLES.filter(c => c.level && c.level <= level && !w.circles.includes(c.id)).map(c => c.id);
  const grantCircle = (w, id) => (w.circles.includes(id) || !CIRCLES.some(c => c.id === id) ? w : Object.assign({}, w, { circles: w.circles.concat(id) }));
  function wearCircle(w, id) {
    if (!w.circles.includes(id)) return w;
    return Object.assign({}, w, { circle: w.circle === id ? '' : id });
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

  const api = { buySkin, buyCircle, dueCircles, grantCircle, wearCircle, CIRCLES,
    PREFIX, DEFAULT_SKIN, GEMS_PER_STAR, CREDIT_LOG, SKINS, GEM_PACKS, BOOSTS, allProducts,
    emptyWallet, normalize, creditTransaction, applyEntitlements, grantReward, equip, spend,
    startBoosts, finishRun, refundPending, awardStars, grant, DAILY, dailyDue, claimDaily,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskShop = api;
})(this);
