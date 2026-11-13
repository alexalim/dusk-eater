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
    { id: 'night', key: 'nightEaten', n: [15, 25, 40], text: n => `밤 동안 ${n}개 삼키기` },
    { id: 'boost', key: 'boosted', n: [1, 1, 2], text: n => `부스터 써서 ${n}판 하기` },
    { id: 'bonus', key: 'bonus', n: [1, 2, 3], text: n => `번개 미션 ${n}번 성공하기` },
  ];
  const REWARDS = [{ gems: 15 }, { tickets: { time: 1 } }, { gems: 25 }];
  const CHEST = { gems: 40, tickets: { time: 1, size: 1 } };
  // The monthly quest (Duolingo-style): every mission reward claimed this month is a point, the chest two. MONTH_GOAL points
  // win the month's badge (w.monthBadges keeps 'YYYY-MM') and MONTH_GEMS, once. State: w.monthly = { month, points, claimed }.
  const MONTH_GOAL = 30, MONTH_GEMS = 100;
  const monthOf = day => day.slice(0, 7);
  const monthly = (w, day) => (w.monthly && w.monthly.month === monthOf(day) ? w.monthly : { month: monthOf(day), points: 0, claimed: false });
  const addPoints = (w, day, n) => { const m = monthly(w, day); return Object.assign({}, w, { monthly: Object.assign({}, m, { points: m.points + n }) }); };
  function monthStatus(w, day) {
    const m = monthly(w, day), d = new Date(day + 'T12:00:00'), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return Object.assign({}, m, { goal: MONTH_GOAL, gems: MONTH_GEMS, done: m.points >= MONTH_GOAL, daysLeft: last - d.getDate() + 1, label: `${d.getMonth() + 1}월` });
  }
  // The month's prize, once its points are in: the badge and the gems.
  function claimMonth(w, day, grant) {
    const m = monthStatus(w, day);
    if (!m.done || m.claimed) return w;
    return Object.assign(grant(w, { gems: MONTH_GEMS }), { monthly: Object.assign({}, monthly(w, day), { claimed: true }), monthBadges: (w.monthBadges || []).concat(m.month) });
  }

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

  // Fold one finished run into today's progress: { eaten, stars, runs: 1, buildings, rushEaten, size, nightEaten, boosted, bonus }.
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
    return addPoints(Object.assign(grant(w, m.reward), { challenge: Object.assign({}, b, { claimed: b.claimed.concat(id) }) }), day, 1);
  }

  // The chest opens once all three are claimed.
  function openChest(w, day, grant) {
    const b = board(w, day);
    if (b.chest || status(w, day).some(m => !m.claimed)) return w;
    return addPoints(Object.assign(grant(w, CHEST), { challenge: Object.assign({}, b, { chest: true }) }), day, 2);
  }

  const waiting = (w, day) => status(w, day).filter(m => m.done && !m.claimed).length + (status(w, day).every(m => m.claimed) && !board(w, day).chest ? 1 : 0)
    + (monthStatus(w, day).done && !monthStatus(w, day).claimed ? 1 : 0);

  const api = { POOL, REWARDS, CHEST, MONTH_GOAL, MONTH_GEMS, today, record, status, claim, openChest, waiting, monthStatus, claimMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskChallenge = api;
})(this);
