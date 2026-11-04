// Merge rules for cloud save. Pure functions: a device's save and the account's save in, one save out.
// A save is { stars: {levelId: 0..3}, best: {levelId: score}, wallet, updatedAt (ms), syncedAt (ms|null) }.
(function (root) {
  'use strict';
  const S = root.DuskShop || (typeof require !== 'undefined' ? require('./shop.js') : null);

  const maxEach = (a, b) => {
    const out = Object.assign({}, a);
    for (const [k, v] of Object.entries(b || {})) if (Number.isFinite(v) && !(out[k] >= v)) out[k] = v;
    return out;
  };
  const union = (a, b) => [...new Set([].concat(a || [], b || []))];

  // Stars and best scores only ever go up, so the higher value wins per level.
  // Wallet: skins owned, credited purchases and dex entries are unions (a purchase is never credited twice per account).
  // Gems are spent and earned, so they cannot be added or maxed forever:
  //  - a device that has never synced (a fresh install, or play before signing in) takes the larger
  //    of the two, so neither side's gems are lost and nothing is double-counted;
  //  - after that, the save changed most recently wins.
  function merge(device, account) {
    if (!account) return Object.assign({}, device);
    const dw = S.normalize(device.wallet), aw = S.normalize(account.wallet);
    const deviceNewer = (device.updatedAt || 0) >= (account.updatedAt || 0);
    const firstLink = !device.syncedAt;
    const newer = deviceNewer ? dw : aw;
    const wallet = S.normalize({
      gems: firstLink ? Math.max(dw.gems, aw.gems) : newer.gems,
      owned: union(dw.owned, aw.owned),
      equipped: newer.equipped,
      credited: union(aw.credited, dw.credited),
      pending: dw.pending, // boost gems held for a run on this device only
      dex: union(aw.dex, dw.dex), // a dex reward taken on either device stays taken
      dexClaimed: union(aw.dexClaimed, dw.dexClaimed),
    });
    return {
      stars: maxEach(account.stars, device.stars),
      best: maxEach(account.best, device.best),
      wallet,
      updatedAt: Math.max(device.updatedAt || 0, account.updatedAt || 0),
    };
  }

  // Levels whose best score went up compared with what the account already has (to submit for rankings).
  function newBests(device, account) {
    const had = (account && account.best) || {};
    return Object.entries(device.best || {}).filter(([k, v]) => !(had[k] >= v)).map(([level, score]) => ({ level, score }));
  }

  const FRIEND_CODE = /^[0-9A-F]{6}$/;
  const cleanCode = s => String(s || '').trim().toUpperCase();
  const isFriendCode = s => FRIEND_CODE.test(cleanCode(s));
  const cleanNickname = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();

  const api = { merge, newBests, isFriendCode, cleanCode, cleanNickname };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskSync = api;
})(this);
