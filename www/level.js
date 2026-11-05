// Player level: every finished run earns experience (things swallowed plus its stars), and each level-up pays gems.
// Total experience lives in wallet.stats.xp, so saving and cloud merge (max) already cover it. Pure functions.
(function (root) {
  'use strict';

  const XP_PER_STAR = 30;
  const need = level => 80 + 40 * level; // experience from `level` to the next: 120, 160, 200, ...
  const reward = level => (level % 5 === 0 ? 30 : 10); // gems for reaching `level`; every fifth is bigger

  const runXp = (swallowed, stars) => swallowed + stars * XP_PER_STAR;

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

  const api = { XP_PER_STAR, need, reward, runXp, levelOf, gain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskLevel = api;
})(this);
