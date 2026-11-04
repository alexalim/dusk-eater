// Collection book: everything that can be swallowed, shown as a silhouette until the first swallow.
// A found entry pays a small gem reward once, when its card is tapped. Pure functions over the wallet.
(function (root) {
  'use strict';
  const St = root.DuskStages || (typeof require !== 'undefined' ? require('./stages.js') : null);

  const REWARD = 10; // gems per entry, the same as one new star

  // Names the goal list does not already have.
  const EXTRA_NAMES = {
    building: '건물', kiosk: '매점', carousel: '회전목마', fountain: '분수', pagoda: '석탑', statue: '동상',
    scooter: '스쿠터', boat: '보트', buoy: '부표', pipe: '파이프', excavator: '굴착기', towel: '비치 타월',
    tube: '튜브', surfer: '서퍼', palm: '야자수', tent: '천막', haystack: '건초더미', tractor: '트랙터',
    xtree: '크리스마스 트리', sleigh: '산타 썰매',
  };

  // What a map can actually put in the world (index.html buildWorld spawns from these same fields).
  function spawnable(t) {
    const out = ['building', 'guard'];
    for (const list of [t.small, t.waterSmall, t.parkItems]) for (const [type] of list || []) out.push(type);
    if (t.carsPerRoad > 0) out.push(t.vehicle || 'car');
    return out;
  }

  // Ladder maps in play order, then event maps. Each entry belongs to the first map it appears on.
  const THEME_ORDER = St.REGIONS.map(r => r.theme).concat(St.EVENTS.map(e => e.theme));
  const ENTRIES = [];
  for (const theme of THEME_ORDER) {
    for (const id of spawnable(St.THEMES[theme])) {
      if (ENTRIES.some(e => e.id === id)) continue;
      ENTRIES.push({ id, theme, name: (St.NAMES[id] || [EXTRA_NAMES[id]])[0], img: `img/dex/${id}.png` }); // tools/icons/render.py
    }
  }
  const byId = Object.fromEntries(ENTRIES.map(e => [e.id, e]));

  // First swallow of a kind: add it to the book (no-op if known or not an entry).
  function discover(w, id) {
    if (!byId[id] || w.dex.includes(id)) return w;
    return Object.assign({}, w, { dex: w.dex.concat(id) });
  }

  // Tap a found card: its reward, once.
  function claim(w, id) {
    if (!w.dex.includes(id) || w.dexClaimed.includes(id)) return w;
    return Object.assign({}, w, { gems: w.gems + REWARD, dexClaimed: w.dexClaimed.concat(id) });
  }

  const unclaimed = w => w.dex.filter(id => byId[id] && !w.dexClaimed.includes(id)).length;

  const api = { REWARD, ENTRIES, THEME_ORDER, spawnable, discover, claim, unclaimed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskDex = api;
})(this);
