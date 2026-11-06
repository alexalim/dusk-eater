// Layer: Unit — daily check-in and booster tickets (www/shop.js), daily challenges (www/challenge.js), and how sync merges them; no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../www/shop.js');
const Ch = require('../www/challenge.js');
const Y = require('../www/sync.js');

const wallet = w => Object.assign(S.emptyWallet(), w);

test('check-in: once a day, the 7-day calendar in order, a missed day carries on, day 8 starts over', () => {
  let w = wallet();
  w = S.claimDaily(w, '2026-11-01');
  assert.equal(w.gems, 10);
  assert.equal(S.claimDaily(w, '2026-11-01'), w, 'twice on one day does nothing');
  w = S.claimDaily(w, '2026-11-05'); // skipped three days: still day 2
  assert.deepEqual([w.gems, w.tickets], [10, { time: 1 }]);
  for (const d of ['06', '07', '08', '09', '10']) w = S.claimDaily(w, `2026-11-${d}`);
  assert.equal(w.daily.n, 7);
  assert.equal(w.gems, 10 + 20 + 30 + 80);
  assert.deepEqual(w.tickets, { time: 2, size: 2 });
  assert.equal(S.claimDaily(w, '2026-11-11').gems, w.gems + 10, 'day 8 is day 1 again');
});

test('a ticket pays for its boost instead of gems, and comes back if the run is cut short', () => {
  const w = wallet({ gems: 30, tickets: { time: 1 } });
  const paid = S.startBoosts(w, ['time', 'size']);
  assert.deepEqual([paid.gems, paid.pending, paid.tickets.time, paid.pendingTickets], [0, 30, 0, ['time']]);
  const back = S.refundPending(paid);
  assert.deepEqual([back.gems, back.tickets.time, back.pendingTickets], [30, 1, []]);
  assert.deepEqual(S.finishRun(paid).pendingTickets, []);
  assert.equal(S.startBoosts(wallet({ gems: 10 }), ['size']), null, 'no ticket, not enough gems');
});

test('daily challenges: three a day, the same for a given date, filled by runs, claimed once, then the chest', () => {
  const day = '2026-11-06';
  const list = Ch.today(day);
  assert.equal(list.length, 3);
  assert.equal(new Set(list.map(m => m.id)).size, 3);
  assert.deepEqual(Ch.today(day), list, 'same date, same missions');
  let w = wallet({ gems: 0 });
  const big = { eaten: 999, stars: 9, runs: 9, buildings: 99, rushEaten: 99, size: 99, nightEaten: 99, boosted: 9, bonus: 9 };
  w = Ch.record(w, day, big);
  assert.ok(Ch.status(w, day).every(m => m.done));
  assert.equal(Ch.waiting(w, day), 3);
  assert.equal(Ch.openChest(w, day, S.grant), w, 'chest waits for all three');
  for (const m of list) w = Ch.claim(w, day, m.id, S.grant);
  const gems = w.gems;
  assert.equal(Ch.claim(w, day, list[0].id, S.grant), w, 'claimed once');
  w = Ch.openChest(w, day, S.grant);
  assert.equal(w.gems, gems + Ch.CHEST.gems);
  assert.equal(Ch.openChest(w, day, S.grant), w);
  assert.equal(Ch.waiting(w, day), 0);
  assert.ok(Ch.status(w, '2026-11-07').every(m => !m.done && !m.claimed), 'a new day is a fresh board');
});

test('size missions keep the best run; counts add up across runs', () => {
  const day = '2027-03-23'; // a day whose board has both a size and an eat mission
  assert.deepEqual(Ch.today(day).map(m => m.id).sort(), ['eat', 'rush', 'size']);
  let w = wallet();
  for (const v of [5, 9, 7]) w = Ch.record(w, day, { size: v, eaten: 10, runs: 1 });
  assert.equal(w.challenge.progress.size, 9);
  assert.equal(w.challenge.progress.eat, 30);
});

test('normalize keeps the new fields sane; merge takes the further check-in and the newer board', () => {
  const n = S.normalize({ tickets: { time: 2, size: -1, nope: 4 }, pendingTickets: ['time', 'x'], daily: { n: 3, last: '2026-11-05' }, challenge: { date: 'd', progress: { eat: 5, bad: 'x' }, claimed: ['eat', 'eat'], chest: 1 } });
  assert.deepEqual([n.tickets, n.pendingTickets, n.daily, n.challenge], [{ time: 2 }, ['time'], { n: 3, last: '2026-11-05' }, { date: 'd', progress: { eat: 5 }, claimed: ['eat'], chest: false }]);
  const save = (w, t) => ({ stars: {}, best: {}, wallet: wallet(w), updatedAt: t, syncedAt: 1 });
  const m = Y.merge(save({ daily: { n: 2, last: '2026-11-04' }, tickets: { time: 1 } }, 2), save({ daily: { n: 4, last: '2026-11-06' }, tickets: { time: 3 } }, 1));
  assert.deepEqual(m.wallet.daily, { n: 4, last: '2026-11-06' });
  assert.deepEqual(m.wallet.tickets, { time: 1 }, 'tickets follow the newer save, like gems');
});
