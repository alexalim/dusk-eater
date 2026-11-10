// Collection book: everything that can be swallowed, shown as a silhouette until the first swallow.
// A found entry pays a small gem reward once, when its card is tapped; filling a whole set of maps
// unlocks a hidden skin (shop.js). Pure functions over the wallet.
(function (root) {
  'use strict';
  const St = root.DuskStages || (typeof require !== 'undefined' ? require('./stages.js') : null);

  const REWARD = 1; // gems per entry: a token, the hidden skins are the real prize

  // Names the goal list does not already have.
  const EXTRA_NAMES = {
    building: '건물', kiosk: '매점', carousel: '회전목마', fountain: '분수', pagoda: '석탑', statue: '동상',
    scooter: '스쿠터', boat: '보트', buoy: '부표', pipe: '파이프', excavator: '굴착기', towel: '비치 타월',
    tube: '튜브', surfer: '서퍼', palm: '야자수', tent: '천막', haystack: '건초더미', tractor: '트랙터',
    xtree: '크리스마스 트리', sleigh: '산타 썰매', fence: '담장',
  };

  // What a map can actually put in the world (index.html buildWorld spawns from these same fields).
  function spawnable(t) {
    const out = ['building', 'guard'];
    for (const list of [t.small, t.waterSmall, t.parkItems]) for (const [type] of list || []) out.push(type);
    if (t.carsPerRoad > 0) out.push(t.vehicle || 'car');
    for (const id of t.extras || []) out.push(id); // placed by hand rather than scattered (hanok courtyard walls)
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

  // Hidden skins: every ladder map in a run of five, filled. Event maps reward through their stars instead.
  const SETS = [0, 1, 2].map(k => ({
    skin: ['dawn', 'forest', 'sky'][k], from: k * 5 + 1, to: k * 5 + 5,
    name: ['동네 한 바퀴', '두근두근 나들이', '멀리멀리 여행'][k], // shown on the book tabs, set bars and shop
    themes: St.REGIONS.slice(k * 5, k * 5 + 5).map(r => r.theme),
  }));
  SETS.forEach(s => { s.entries = ENTRIES.filter(e => s.themes.includes(e.theme)).map(e => e.id); });
  const setFor = skin => SETS.find(s => s.skin === skin);
  const setFound = (w, s) => s.entries.filter(id => w.dex.includes(id)).length;
  // Skins whose set is complete but not yet in the wallet (granted with Shop.grantReward).
  const dueSkins = w => SETS.filter(s => setFound(w, s) === s.entries.length && !w.owned.includes(s.skin)).map(s => s.skin);

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

  const api = { REWARD, ENTRIES, THEME_ORDER, SETS, spawnable, discover, claim, unclaimed, setFor, setFound, dueSkins };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskDex = api;
})(this);
