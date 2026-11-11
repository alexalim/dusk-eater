// Badges: fifteen categories of bronze/silver/gold hexagons, earned from lifetime records and paid in gems
// once each when tapped. Pure functions over the wallet; the screen lives in index.html.
(function (root) {
  'use strict';
  const Dex = root.DuskDex || (typeof require !== 'undefined' ? require('./dex.js') : null);
  const Level = root.DuskLevel || (typeof require !== 'undefined' ? require('./level.js') : null);

  const TIERS = ['동', '은', '금'];
  const GEMS = [5, 10, 20]; // per tier; every hidden badge pays the gold amount

  // `value(c)` reads the context built by `context()`; hidden badges are one-off conditions instead of steps.
  const CATS = [
    { id: 'eater', name: '먹보', icon: 'mouth', goal: '지금까지 삼킨 수', unit: '개', steps: [300, 3000, 20000], value: c => c.stats.eaten || 0 },
    { id: 'stars', name: '별 수집', icon: 'star', goal: '모은 별', unit: '개', steps: [10, 30, 60], value: c => c.stars },
    { id: 'dex', name: '도감', icon: 'book', goal: '도감에서 찾은 친구', unit: '개', steps: [20, 45, Dex.ENTRIES.length], value: c => c.dex },
    { id: 'size', name: '덩치', icon: 'grow', goal: '한 판에서 가장 커진 크기', unit: 'm', steps: [30, 60, 90], value: c => c.stats.size || 0 },
    { id: 'shade', name: '그늘 달인', icon: 'moon', goal: '빛에 한 번도 안 닿고 끝낸 판', unit: '판', steps: [1, 5, 20], value: c => c.stats.clean || 0 },
    { id: 'boss', name: '보스 사냥꾼', icon: 'crown', goal: '삼킨 거대 등불지기', unit: '명', steps: [1, 5, 15], value: c => c.stats.bosses || 0 },
    { id: 'golden', name: '황금 수집가', icon: 'goldcoin', goal: '삼킨 황금 친구', unit: '개', steps: [5, 30, 100], value: c => c.stats.golds || 0 },
    { id: 'bolt', name: '번개 달인', icon: 'bolt', goal: '성공한 번개 미션', unit: '번', steps: [3, 15, 50], value: c => c.stats.bolts || 0 },
    { id: 'rush', name: '러시 왕', icon: 'clock', goal: '막판 러시 동안 삼킨 수', unit: '개', steps: [50, 300, 1000], value: c => c.stats.rush || 0 },
    { id: 'fed', name: '배부른 하루', icon: 'face-happy', goal: '한 번도 굶지 않고 끝낸 판', unit: '판', steps: [1, 5, 20], value: c => c.stats.fed || 0 },
    { id: 'combo', name: '콤보 왕', icon: 'bolt', goal: '한 판 최고 콤보', unit: '', steps: [8, 15, 30], value: c => c.stats.combo || 0 },
    { id: 'checkin', name: '출석왕', icon: 'gift', goal: '출석한 날', unit: '일', steps: [7, 30, 100], value: c => c.daily },
    { id: 'missions', name: '미션 해결사', icon: 'check', goal: '받은 오늘의 미션 보상', unit: '개', steps: [5, 30, 100], value: c => c.stats.missions || 0 },
    { id: 'level', name: '쑥쑥 성장', icon: 'medal', goal: '레벨', unit: '', steps: [5, 10, 20], value: c => c.level },
    { id: 'regions', name: '지역 정복', icon: 'flag', goal: '10레벨을 모두 깬 지역', unit: '곳', steps: [1, 5, 15], value: c => c.regions },
    { id: 'skins', name: '패션왕', icon: 'bag', goal: '모은 스킨', unit: '벌', steps: [3, 6, 10], value: c => c.skins },
    { id: 'hidden', name: '히든', icon: 'sparkle', secret: [
      { name: '경비원 꿀꺽', goal: '경비원을 삼켜요', ok: c => (c.stats.guards || 0) >= 1 },
      { name: '밤의 먹보', goal: '한 판의 밤 동안 30개를 삼켜요', ok: c => (c.stats.night || 0) >= 30 },
      { name: '빌딩 사냥꾼', goal: '한 판에 건물 10채를 삼켜요', ok: c => (c.stats.buildings || 0) >= 10 },
    ] },
  ];

  const BADGES = CATS.flatMap(cat => [0, 1, 2].map(k => {
    const s = cat.secret && cat.secret[k];
    return { id: `${cat.id}.${k}`, cat, k, gems: s ? GEMS[2] : GEMS[k],
      name: s ? s.name : `${cat.name} ${TIERS[k]}`,
      goal: s ? s.goal : cat.id === 'level' ? `Lv.${cat.steps[k]} 달성` : `${cat.goal} ${cat.steps[k].toLocaleString()}${cat.unit}`,
      ok: s ? s.ok : c => cat.value(c) >= cat.steps[k] };
  }));
  const byId = Object.fromEntries(BADGES.map(b => [b.id, b]));

  // Everything a badge can look at: the wallet's lifetime records, total stars (kept outside the wallet), dex finds.
  // `extra.regions`: regions with all ten levels cleared (counted by the game, which knows the stars).
  const context = (w, stars, extra = {}) => ({ stats: w.stats, stars, dex: w.dex.length, daily: w.daily ? w.daily.n : 0,
    level: Level.levelOf(w.stats.xp).level, skins: w.owned.length + 1, regions: extra.regions || 0 });

  const earned = c => BADGES.filter(b => b.ok(c)).map(b => b.id);

  // Fold one finished run into the lifetime records: counts add up, per-run bests keep the maximum.
  function record(w, run) {
    const s = w.stats, add = k => (s[k] || 0) + (run[k] || 0), best = k => Math.max(s[k] || 0, run[k] || 0);
    const stats = Object.assign({}, s, { eaten: add('eaten'), guards: add('guards'), clean: add('clean'),
      bosses: add('bosses'), golds: add('golds'), bolts: add('bolts'), rush: add('rush'), fed: add('fed'),
      size: best('size'), night: best('night'), buildings: best('buildings'), combo: best('combo') });
    return Object.assign({}, w, { stats });
  }

  // Tap an earned badge: its gems, once.
  function claim(w, id, c) {
    const b = byId[id];
    if (!b || !b.ok(c) || w.badges.includes(id)) return w;
    return Object.assign({}, w, { gems: w.gems + b.gems, badges: w.badges.concat(id) });
  }

  const claimable = (w, c) => earned(c).filter(id => !w.badges.includes(id)).length;

  const api = { TIERS, GEMS, CATS, BADGES, context, earned, record, claim, claimable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskBadges = api;
})(this);
