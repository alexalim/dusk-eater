// Player level: every finished run earns experience (things swallowed plus its stars), and each level-up pays gems.
// Total experience lives in wallet.stats.xp, so saving and cloud merge (max) already cover it. Pure functions.
(function (root) {
  'use strict';

  const XP_PER_STAR = 30;
  const MAX_LEVEL = 100; // the cap: the bar stays full and nothing more is paid past it (xp still accumulates)
  const need = level => 80 + 40 * level; // experience from `level` to the next: 120, 160, 200, ... (~20k to 30, ~205k to 100)
  // gems for reaching `level`: 10 as a rule, more at the round numbers (TestFlight: "30 came fast, give the road finer steps")
  const reward = level => (level % 25 === 0 ? 150 : level % 10 === 0 ? 60 : level % 5 === 0 ? 30 : 10);

  const runXp = (swallowed, stars) => swallowed + stars * XP_PER_STAR;

  // What a level brings besides gems. Skins live in shop.js (their `level` field); titles show on the level card
  // and the end screen. Perks are deliberately small so the star goals keep their bite:
  //  startR = start size factor, sun = shrink-in-sunlight factor, combo = seconds added to the combo window,
  //  shard = light-shard effect length factor, shardEvery = seconds-between-shards factor, zombie = seconds off a zombie slowdown.
  const PERKS = [
    { level: 5, startR: 1.05, text: '시작 크기 +5%' },
    { level: 10, sun: 0.9, text: '햇빛에서 덜 줄어요 (−10%)' },
    { level: 15, startR: 1.1, text: '시작 크기 +10%' },
    { level: 20, sun: 0.8, text: '햇빛에서 덜 줄어요 (−20%)' },
    { level: 25, combo: 0.5, text: '콤보 이어지는 시간 +0.5초' },
    { level: 30, shard: 1.25, text: '빛 조각 효과 +25% 오래' },
    { level: 35, startR: 1.15, text: '시작 크기 +15%' },
    { level: 40, zombie: 0.5, text: '좀비에 물려도 0.5초 덜 느려져요' },
    { level: 50, sun: 0.75, text: '햇빛에서 덜 줄어요 (−25%)' },
    { level: 60, shardEvery: 0.8, text: '빛 조각이 더 자주 떨어져요' },
    { level: 70, startR: 1.2, text: '시작 크기 +20%' },
    { level: 80, combo: 1, text: '콤보 이어지는 시간 +1초' },
    { level: 90, zombie: 1, text: '좀비에 물려도 1초 덜 느려져요' },
    { level: 100, sun: 0.7, text: '햇빛에서 덜 줄어요 (−30%)' },
  ];
  const TITLES = [[1, '아기 그림자'], [5, '동네 그림자'], [10, '골목 대장'], [15, '노을 사냥꾼'], [20, '밤의 지배자'], [25, '그늘 수집가'],
    [30, '어둠의 전설'], [40, '달빛 포식자'], [50, '일식의 주인'], [60, '황혼의 군주'], [70, '별을 삼킨 자'], [80, '심연의 입'],
    [90, '끝없는 그림자'], [100, '황혼 그 자체']];

  // The strongest of each perk reached so far.
  function perksOf(level) {
    const got = PERKS.filter(p => p.level <= level);
    const top = (k, fn, base) => fn(base, ...got.map(p => p[k] === undefined ? base : p[k]));
    return { startR: top('startR', Math.max, 1), sun: top('sun', Math.min, 1), combo: top('combo', Math.max, 0),
             shard: top('shard', Math.max, 1), shardEvery: top('shardEvery', Math.min, 1), zombie: top('zombie', Math.max, 0), got };
  }
  const titleOf = level => TITLES.filter(([l]) => l <= level).pop()[1];

  // Level skins reached but not yet in the wallet (granted with Shop.grantReward).
  const dueSkins = (w, skins) => skins.filter(s => s.level && s.level <= levelOf(w.stats.xp).level && !w.owned.includes(s.id)).map(s => s.id);

  // Level 1 at 0 xp. `into` is the progress inside the current level, out of `next`; at the cap the bar is full (`max`).
  function levelOf(xp) {
    let level = 1, left = Math.max(0, Math.floor(xp || 0));
    while (level < MAX_LEVEL && left >= need(level)) { left -= need(level); level++; }
    if (level >= MAX_LEVEL) return { level: MAX_LEVEL, into: 1, next: 1, max: true };
    return { level, into: left, next: need(level) };
  }

  // Add a run's experience; levels crossed pay their gems at once.
  function gain(w, xp) {
    const from = levelOf(w.stats.xp).level, total = (w.stats.xp || 0) + Math.max(0, Math.floor(xp));
    const to = levelOf(total).level;
    let gems = 0;
    for (let l = from + 1; l <= to; l++) gems += reward(l);
    const wallet = Object.assign({}, w, { gems: w.gems + gems, stats: Object.assign({}, w.stats, { xp: total }) });
    return { wallet, from, to, gems };
  }

  const api = { XP_PER_STAR, MAX_LEVEL, PERKS, TITLES, need, reward, runXp, levelOf, gain, perksOf, titleOf, dueSkins };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskLevel = api;
})(this);
