# Layer: E2E — daily check-in, booster tickets, today's missions and the mid-run bolt mission in real Chromium.
# Usage: python3 test/e2e/daily.e2e.py www
import sys, pathlib
from playwright.sync_api import sync_playwright
www = pathlib.Path(sys.argv[1]).resolve()
URL = (www / 'index.html').as_uri()
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
A = 'window.__DUSK_TEST__.api'
res = []
def rec(sid, name, ok, detail=''):
    res.append(ok); print(f"{'PASS' if ok else 'FAIL'} {sid} {name} :: {detail}", flush=True)

def frames_wait(pg, n=3):
    pg.evaluate(f'new Promise(r => {{ let k = {n}; const f = () => --k <= 0 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }})')

def boot(pg, day):
    # the date survives reloads through localStorage, so a test can move to another day and reload
    pg.add_init_script(f"window.__DUSK_TEST__ = {{ fixedQuality: true, daily: true, today: localStorage.getItem('__day') || '{day}' }};")

wallet = lambda pg: pg.evaluate(f'{A}.Store.wallet')

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    boot(pg, '2026-11-06')
    pg.goto(URL); pg.evaluate(f'{A}.ready'); frames_wait(pg, 4)

    # C1 the check-in greets a fresh day; day 1 pays 10 gems and is saved; the same day stays closed
    # (checked in-page: Chromium's file:// localStorage can lose a write across a quick reload, so no reload here)
    shown = pg.is_visible('#daily')
    pg.tap('#btn-daily-claim'); frames_wait(pg)
    w1 = wallet(pg); label = pg.inner_text('#btn-daily-claim')
    saved = pg.evaluate("JSON.parse(localStorage.getItem('dusk-wallet')).daily")
    pg.tap('#btn-daily-claim'); frames_wait(pg)
    twice = wallet(pg)['gems']
    pg.tap('#btn-daily-back'); frames_wait(pg)
    rec('C1', 'check-in pops up, pays day 1 once and saves it', shown and w1['gems'] == 10 and w1['daily']['n'] == 1 and '내일' in label
        and saved == {'n': 1, 'last': '2026-11-06'} and twice == 10, f'shown={shown} gems={w1["gems"]} saved={saved} twice={twice}')

    # C2 a later day (one skipped) gives day 2: a 황혼 연장 ticket; the start sheet offers it for free and it replaces gems
    pg.evaluate(f"window.__DUSK_TEST__.today = '2026-11-08'; {A}.openDaily()"); frames_wait(pg)
    pg.tap('#btn-daily-claim'); frames_wait(pg); pg.tap('#btn-daily-back'); frames_wait(pg)
    t = wallet(pg)['tickets']
    pg.tap('#btn-title'); frames_wait(pg)
    price = pg.inner_text('.boost[data-b=time] .row')
    pg.tap('.boost[data-b=time]'); frames_wait(pg); pg.tap('#btn-go'); frames_wait(pg, 3)
    w2 = wallet(pg); dur = pg.evaluate(f'{A}.s.runDuration')
    rec('C2', 'day 2 gives a ticket; the boost uses it instead of gems', t == {'time': 1} and '이용권 1' in price and w2['gems'] == 10
        and w2['tickets'].get('time', 0) == 0 and dur == 110, f'tickets={t} price={price!r} gems={w2["gems"]} dur={dur}')

    # C3 the bolt mission: 40% into a run a short target appears; meeting it pays 5 gems
    pg.evaluate(f'{A}.start(2)'); pg.evaluate(f'{A}.skipTo({A}.s.runDuration * 0.41)'); frames_wait(pg, 4)
    pill = pg.inner_text('#bonus-pill') if pg.is_visible('#bonus-pill') else ''
    g0 = wallet(pg)['gems']; p0 = pg.evaluate(f'{A}.punches')
    timer = pg.evaluate("(() => { const b = document.querySelector('#bonus-pill'); return [!!b.querySelector('.bar i'), b.querySelector('b') && b.querySelector('b').textContent]; })()")
    pg.evaluate(f'''(() => {{ const s = {A}.s, m = document.querySelector('#bonus-pill').textContent;
      const want = Object.entries(window.DuskStages.NAMES).find(([k, v]) => m.includes(v[0]))[0];
      s.objects.filter(o => o.state === 0 && o.type === want).slice(0, 4).forEach(o => {{ o.state = 1; o.ft = 0.99; }}); }})()''')
    frames_wait(pg, 6)
    g1 = wallet(pg)['gems']; done = pg.evaluate(f'{A}.s.stats.bonus')
    p1 = pg.evaluate(f'{A}.punches')
    rec('C3', 'bolt mission shows a draining timer, pays 5 gems when met, and lands with impact', '/' in pill and '초' in pill and timer[0] and timer[1].endswith('초')
        and g1 == g0 + 5 and done == 1 and p1 > p0, f'pill={pill!r} timer={timer} gems {g0}->{g1} punches {p0}->{p1}')

    # C4 finishing runs fills today's missions; a finished one can be claimed once from the missions screen
    pg.evaluate(f"{A}.Store.update(window.DuskChallenge.record({A}.Store.wallet, '2026-11-08', {{ eaten: 999, stars: 9, runs: 9, buildings: 99, rushEaten: 99, size: 99, nightEaten: 99, boosted: 9, bonus: 9 }}))")
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    pg.evaluate("document.querySelector('#btn-quit').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg)
    pg.tap('#btn-select-back'); frames_wait(pg)
    badge = pg.inner_text('#missions-badge')
    pg.tap('#btn-missions'); frames_wait(pg)
    g0 = wallet(pg)['gems']
    for _ in range(3): pg.tap('#missions-body .claim.ready[data-m]'); frames_wait(pg)
    pg.tap('#btn-chest'); frames_wait(pg)
    w4 = wallet(pg)
    rec('C4', 'missions fill, pay once each, and the chest opens after all three', badge == '3' and w4['challenge']['chest'] and len(w4['challenge']['claimed']) == 3 and w4['gems'] > g0,
        f'badge={badge!r} claimed={w4["challenge"]["claimed"]} chest={w4["challenge"]["chest"]} gems {g0}->{w4["gems"]}')
    pg.tap('#btn-missions-back'); frames_wait(pg)

    rec('C0', 'no page errors', not errs, '; '.join(errs[:3]))
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
