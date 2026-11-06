// Player level: every finished run earns experience (things swallowed plus its stars), and each level-up pays gems.
// Total experience lives in wallet.stats.xp, so saving and cloud merge (max) already cover it. Pure functions.
(function (root) {
  'use strict';

  const XP_PER_STAR = 30;
  const need = level => 80 + 40 * level; // experience from `level` to the next: 120, 160, 200, ...
  const reward = level => (level % 5 === 0 ? 30 : 10); // gems for reaching `level`; every fifth is bigger

  const runXp = (swallowed, stars) => swallowed + stars * XP_PER_STAR;

  // What a level brings besides gems. Skins live in shop.js (their `level` field); perks stop at 20 so the
  // star goals keep their bite; titles show on the level card and the end screen.
  const PERKS = [
    { level: 5, startR: 1.05, text: '시작 크기 +5%' },
    { level: 10, sun: 0.9, text: '햇빛에서 덜 줄어요 (−10%)' },
    { level: 15, startR: 1.1, text: '시작 크기 +10%' },
    { level: 20, sun: 0.8, text: '햇빛에서 덜 줄어요 (−20%)' },
  ];
  const TITLES = [[1, '아기 그림자'], [5, '동네 그림자'], [10, '골목 대장'], [15, '노을 사냥꾼'], [20, '밤의 지배자'], [30, '어둠의 전설']];

  // The strongest of each perk reached so far.
  function perksOf(level) {
    const got = PERKS.filter(p => p.level <= level);
    return { startR: Math.max(1, ...got.map(p => p.startR || 1)), sun: Math.min(1, ...got.map(p => p.sun || 1)), got };
  }
  const titleOf = level => TITLES.filter(([l]) => l <= level).pop()[1];

  // Level skins reached but not yet in the wallet (granted with Shop.grantReward).
  const dueSkins = (w, skins) => skins.filter(s => s.level && s.level <= levelOf(w.stats.xp).level && !w.owned.includes(s.id)).map(s => s.id);

  // Level 1 at 0 xp. `into` is the progress inside the current level, out of `next`.
  function levelOf(xp) {
    let level = 1, left = Math.max(0, Math.floor(xp || 0));
    while (left >= need(level)) { left -= need(level); level++; }
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

  const api = { XP_PER_STAR, PERKS, TITLES, need, reward, runXp, levelOf, gain, perksOf, titleOf, dueSkins };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskLevel = api;
})(this);
