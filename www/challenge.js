// Daily challenges: three missions a day, the same for everyone on that date, fed by finished runs. Each pays on
// its own, and claiming all three opens a chest. Pure functions over wallet.challenge; the screen is in index.html.
(function (root) {
  'use strict';

  // `key` names a field of the run summary (see record); `best` keeps the day's best instead of adding up.
  const POOL = [
    { id: 'eat', key: 'eaten', n: [80, 120, 160], text: n => `아무거나 ${n}개 삼키기` },
    { id: 'stars', key: 'stars', n: [3, 5, 6], text: n => `별 ${n}개 따기` },
    { id: 'runs', key: 'runs', n: [3, 4, 5], text: n => `${n}판 끝까지 하기` },
    { id: 'buildings', key: 'buildings', n: [3, 5, 8], text: n => `건물 ${n}채 삼키기` },
    { id: 'rush', key: 'rushEaten', n: [10, 15, 25], text: n => `막판 러시 동안 ${n}개 삼키기` },
    { id: 'size', key: 'size', best: true, n: [12, 18, 25], text: n => `한 판에 ${n}m까지 커지기` },
    { id: 'clean', key: 'clean', n: [1, 1, 2], text: n => `빛에 한 번도 안 닿고 ${n}판 끝내기` },
    { id: 'bonus', key: 'bonus', n: [1, 2, 3], text: n => `번개 미션 ${n}번 성공하기` },
  ];
  const REWARDS = [{ gems: 15 }, { tickets: { time: 1 } }, { gems: 25 }];
  const CHEST = { gems: 40, tickets: { time: 1, size: 1 } };

  // The day's three missions, picked from the date so every phone agrees.
  function today(day) {
    let x = [...day].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7);
    const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
    const pool = POOL.slice(), out = [];
    for (let k = 0; k < 3; k++) {
      const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      out.push({ id: m.id, key: m.key, best: !!m.best, n: m.n[k], text: m.text(m.n[k]), reward: REWARDS[k] });
    }
    return out;
  }

  // A new day starts a fresh board; an old board is simply replaced.
  const board = (w, day) => (w.challenge.date === day ? w.challenge : { date: day, progress: {}, claimed: [], chest: false });

  // Fold one finished run into today's progress: { eaten, stars, runs: 1, buildings, rushEaten, size, clean, bonus }.
  function record(w, day, run) {
    const b = board(w, day), progress = Object.assign({}, b.progress);
    for (const m of today(day)) {
      const v = run[m.key] || 0;
      progress[m.id] = m.best ? Math.max(progress[m.id] || 0, v) : (progress[m.id] || 0) + v;
    }
    return Object.assign({}, w, { challenge: Object.assign({}, b, { progress }) });
  }

  const status = (w, day) => {
    const b = board(w, day);
    return today(day).map(m => ({ ...m, got: Math.min(m.n, b.progress[m.id] || 0), done: (b.progress[m.id] || 0) >= m.n, claimed: b.claimed.includes(m.id) }));
  };

  // Claim a finished mission's reward (once); `grant` is Shop.grant.
  function claim(w, day, id, grant) {
    const m = status(w, day).find(x => x.id === id);
    if (!m || !m.done || m.claimed) return w;
    const b = board(w, day);
    return Object.assign(grant(w, m.reward), { challenge: Object.assign({}, b, { claimed: b.claimed.concat(id) }) });
  }

  // The chest opens once all three are claimed.
  function openChest(w, day, grant) {
    const b = board(w, day);
    if (b.chest || status(w, day).some(m => !m.claimed)) return w;
    return Object.assign(grant(w, CHEST), { challenge: Object.assign({}, b, { chest: true }) });
  }

  const waiting = (w, day) => status(w, day).filter(m => m.done && !m.claimed).length + (status(w, day).every(m => m.claimed) && !board(w, day).chest ? 1 : 0);

  const api = { POOL, REWARDS, CHEST, today, record, status, claim, openChest, waiting };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskChallenge = api;
})(this);
