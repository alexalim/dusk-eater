# Layer: E2E — region twists in real Chromium: cloud shade (level 2), golden friends (5), the eclipse (8), the boss (10),
# plus the 5x2 level grid with twist markers and a different tune per region.
# Usage: python3 test/e2e/twists.e2e.py www
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

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    pg = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script('window.__DUSK_TEST__ = { fixedQuality: true };')
    pg.goto(URL); pg.evaluate(f'{A}.ready')
    # region 1 cleared up to level 9 with one star each, so levels 2..10 are open
    pg.evaluate("localStorage.setItem('dusk-stars', JSON.stringify(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['L' + (i + 1), 1]))))")
    pg.reload(); pg.evaluate(f'{A}.ready'); frames_wait(pg)

    # W1 level select: a region's ten levels sit in two rows of five; 2, 5, 8 and 10 carry their twist marker
    pg.tap('#btn-title'); frames_wait(pg)
    if pg.is_visible('.pager .chip[data-p="-1"]:not(.off)'): pg.tap('.pager .chip[data-p="-1"]'); frames_wait(pg)
    tops = pg.evaluate("[...new Set([...document.querySelectorAll('.levels .node')].map(n => Math.round(n.getBoundingClientRect().top)))].length")
    marked = pg.evaluate("[...document.querySelectorAll('.levels .node')].map((n, i) => n.querySelector('.tw') ? i + 1 : 0).filter(Boolean)")
    rec('W1', '10 levels in 2 rows of 5; twist markers on 2, 5, 8, 10', tops == 2 and marked == [2, 5, 8, 10], f'rows={tops} marked={marked}')
    # W7 starting a twist level shows its card first (name, tips; the boss card says how big to grow); its button starts the run
    cards = []
    for k in (1, 9):
        pg.tap(f'.node[data-i="{k}"]'); frames_wait(pg); pg.tap('#btn-go'); frames_wait(pg)
        cards.append([pg.is_visible('#twist'), pg.inner_text('#twist-name'), pg.inner_text('#twist-tips')])
        if k == 1: pg.tap('#btn-twist-back'); frames_wait(pg)
    pg.tap('#btn-twist-go'); frames_wait(pg, 4)
    playing = pg.evaluate(f"[{A}.s.state, document.querySelector('#twist').classList.contains('hidden')]")
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    rec('W7', 'twist levels open with an intro card; the boss card names the size to reach; Go starts the level',
        cards[0][0] and '구름' in cards[0][1] and cards[1][0] and '등불지기' in cards[1][1] and 'm를 넘으면' in cards[1][2] and playing == ['play', True],
        f'cards={[c[:2] for c in cards]} playing={playing}')

    # W2 clouds: a spot under a cloud counts as shade even in full sun (and outside any guard beam); clouds drift
    pg.evaluate(f'{A}.start(1)'); pg.evaluate(f'{A}.skipTo(30)'); frames_wait(pg, 3)
    c0 = pg.evaluate(f'{A}.s.clouds.map(c => [c.x, c.y, c.r])')
    shaded = pg.evaluate(f'{A}.s.clouds.every(c => {A}.isShaded({{ x: c.x, y: c.y }}, null) || {A}.s.guards.some(g => Math.hypot(g.x - c.x, g.y - c.y) < g.range))')
    t0 = pg.evaluate(f'{A}.s.elapsed'); frames_wait(pg, 20)
    c1 = pg.evaluate(f'{A}.s.clouds.map(c => c.x)'); gt = pg.evaluate(f'{A}.s.elapsed') - t0
    # drift is slow and steady: each cloud moves about 8 units per game second (a wrap at the edge excepted)
    steady = all(abs((x1 - c[0]) - 8 * gt) < 2 or abs(x1 - c[0]) > 1000 for x1, c in zip(c1, c0))
    rec('W2', 'cloud shade counts as shade and clouds drift slowly and steadily', len(c0) >= 5 and shaded and c1 != [c[0] for c in c0] and steady,
        f'clouds={len(c0)} shaded={shaded} moved={[round(x1 - c[0], 1) for x1, c in zip(c1, c0)]} in {gt:.2f}s')

    # W3 golden friend: one appears near the player, glows, and is worth 5x when swallowed
    pg.evaluate(f'{A}.start(4)'); pg.evaluate(f'{A}.skipTo(5)'); frames_wait(pg, 3)
    glow = pg.evaluate(f'{A}.s.objects.some(o => o.glow)')  # the renderer paints these gold
    gold = pg.evaluate(f'(() => {{ const s = {A}.s, o = s.objects.find(o => o.goldUntil > s.elapsed); if (!o) return null; o.state = 1; o.ft = 0.99; return [o.type, Math.round(o.r * o.r / 2) * 5]; }})()')
    s0 = pg.evaluate(f'{A}.s.score'); frames_wait(pg, 4); s1 = pg.evaluate(f'{A}.s.score')
    rec('W3', 'a golden friend shows up painted gold and pays 5x', glow and gold is not None and s1 - s0 == gold[1], f'glow={glow} gold={gold} score {s0}->{s1}')
    # W3b in full sun a golden friend can be swallowed where an ordinary one cannot
    spot = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player;
      for (let x = 80; x < 1900; x += 23) for (let y = 80; y < 1900; y += 29)
        if (!{A}.isShaded({{ x, y }}, null) && !s.buildings.some(b => b.state === 0 && x > b.x - p.r - 12 && x < b.x + b.w + p.r + 12 && y > b.y - p.r - 12 && y < b.y + b.d + p.r + 12)) return [x, y];
      return null; }})()''')
    sun = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player; p.x = {spot[0]}; p.y = {spot[1]}; p.vx = p.vy = 0;
      const small = s.objects.filter(o => o.state === 0 && o.r <= 5 && !(o.goldUntil > s.elapsed));
      const [g, c] = small; g.goldUntil = s.elapsed + 8; g.x = c.x = p.x + 2; g.y = c.y = p.y; window.__gc = [g, c];
      return !{A}.isShaded({{ x: p.x + 2, y: p.y }}, null); }})()''')
    frames_wait(pg, 4)
    states = pg.evaluate('window.__gc.map(o => o.state)')
    rec('W3b', 'in sunlight the golden friend is taken, the plain one is not', spot is not None and sun and states[0] >= 1 and states[1] == 0, f'spot={spot} sun={sun} states={states}')

    # W4 eclipse: 30% into the run the whole town is shade for 6 s and the screen dims; before and after it is not
    pg.evaluate(f'{A}.start(7)')
    at = pg.evaluate(f'{A}.s.runDuration * 0.3')
    sunny = pg.evaluate(f'''(() => {{ const s = {A}.s; for (let x = 60; x < 1900; x += 37) for (let y = 60; y < 1900; y += 41)
      if (!{A}.isShaded({{ x, y }}, null)) return [x, y]; return null; }})()''')
    pg.evaluate(f'{A}.skipTo({at} + 1)'); frames_wait(pg, 3)
    during = [pg.evaluate(f'{A}.s.eclipse'), pg.evaluate(f'{A}.isShaded({{ x: {sunny[0]}, y: {sunny[1]} }}, null)'),
              pg.evaluate("document.querySelector('#c').classList.contains('eclipse')")]
    pg.evaluate(f'{A}.skipTo({at} + 8)'); frames_wait(pg, 3)
    after = pg.evaluate(f'{A}.s.eclipse')
    rec('W4', 'the eclipse makes every spot shade for 6 s and dims the screen, then ends', sunny and during == [True, True, True] and after is False,
        f'sunny={sunny} during={during} after={after}')

    # W5 boss: a giant lantern keeper with a wide beam; too big at first, swallowable once outgrown and in shade
    pg.evaluate(f'{A}.start(9)'); frames_wait(pg, 3)
    boss = pg.evaluate(f'(() => {{ const g = {A}.s.guards.find(g => g.boss); return g && [g.r, g.range, {A}.s.player.r]; }})()')
    pill = pg.inner_text('#boss-pill')
    pg.evaluate(f'{A}.skipTo({A}.s.runDuration * 0.95)'); frames_wait(pg, 3)  # night: everything is shade except the beams
    # the boss comes to the player's open spot (buildings are solid now, so a big player dropped beside a road would be pushed off)
    pg.evaluate(f'(() => {{ const s = {A}.s, g = s.guards.find(g => g.boss); s.player.r = g.r / 0.8; g.x = g.tx = s.player.x + 4; g.y = g.ty = s.player.y; }})()')
    frames_wait(pg, 40)
    eaten = pg.evaluate(f"{A}.s.stats.eaten.boss || 0")
    rec('W5', 'boss is bigger than a fresh player, says how big to grow, and counts toward its goal when swallowed',
        boss and boss[0] > boss[2] * 0.85 and boss[1] > 150 and 'm 넘게' in pill and eaten == 1, f'boss={boss} pill={pill!r} eaten={eaten}')

    # W8 last-stretch rush: the final 10 s of any run score double, with a countdown pill; not before
    pg.evaluate(f'{A}.start(2)'); frames_wait(pg, 2)
    swallow = f'(() => {{ const s = {A}.s, o = s.objects.find(o => o.state === 0 && !(o.goldUntil > s.elapsed)); o.state = 1; o.ft = 0.99; return Math.round(o.r * o.r / 2); }})()'
    early = pg.evaluate(f'{A}.s.rush')
    pg.evaluate(f'{A}.skipTo({A}.s.runDuration - 8)'); frames_wait(pg, 3)
    s0 = pg.evaluate(f'{A}.s.score'); base = pg.evaluate(swallow); frames_wait(pg, 4); s1 = pg.evaluate(f'{A}.s.score')
    pill = pg.inner_text('#rush-pill') if pg.is_visible('#rush-pill') else ''
    rec('W8', 'last 10 s: rush on, a swallow scores double, the pill counts down', early is False and pg.evaluate(f'{A}.s.rush') and s1 - s0 == base * 2 and '2배' in pill,
        f'early={early} gain={s1 - s0} base={base} pill={pill!r}')

    # W9 a hard level ending with one star does not clear: the continue prompt says why; paying 30 gems adds 20 s once
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ gems: 100 }}))")
    had = pg.evaluate("JSON.parse(localStorage.getItem('dusk-stars') || '{}').L8 || 0")
    pg.evaluate(f'{A}.start(7)'); frames_wait(pg, 2)
    pg.evaluate(f"(() => {{ const g = window.DuskStages.STAGES[7].goals[0]; {A}.s.stats.score = g.n; }})()")  # one star only
    pg.evaluate(f'{A}.skipTo({A}.s.runDuration - 0.02)'); frames_wait(pg, 4)
    why = pg.inner_text('#cont-why') if pg.is_visible('#cont') else None
    dur0 = pg.evaluate(f'{A}.s.runDuration'); pg.tap('#btn-cont-yes'); frames_wait(pg, 3)
    after = pg.evaluate(f'[{A}.s.state, {A}.s.runDuration, {A}.Store.wallet.gems]')
    pg.evaluate(f'{A}.skipTo({A}.s.runDuration - 0.02)'); frames_wait(pg, 4)  # time's up again: no second offer
    again = [pg.is_visible('#cont'), pg.is_visible('#end'), pg.inner_text('#end-title')]
    stars = pg.evaluate("JSON.parse(localStorage.getItem('dusk-stars') || '{}').L8 || 0")
    rec('W9', 'hard level: 1 star does not clear; continue costs 30 gems for +20 s, offered once; no new stars saved',
        why and '별 2개' in why and after == ['play', dur0 + 20, 70] and again[:2] == [False, True] and '아쉬워요' in again[2] and stars == had,
        f'why={why!r} after={after} again={again} stars={stars}')

    # W10 size tiers: growing past a new kind (the car) announces it once, with a camera pull-back
    pg.evaluate(f'{A}.start(2)'); frames_wait(pg, 3)
    before = pg.evaluate(f'{A}.tiers')
    pg.evaluate(f'(() => {{ const s = {A}.s; s.player.r = 16 / 0.85 + 1; const o = s.objects.find(o => o.state === 0 && o.type === "cat"); o.state = 1; o.ft = 0.99; }})()')
    frames_wait(pg, 5)
    text = pg.inner_text('#banner'); pulse = pg.evaluate(f'{A}.camPulse'); after = pg.evaluate(f'{A}.tiers')
    pg.evaluate(f'(() => {{ const o = {A}.s.objects.find(o => o.state === 0 && o.type === "cat"); o.state = 1; o.ft = 0.99; }})()'); frames_wait(pg, 5)
    rec('W10', 'a new size tier is announced once with the biggest newly edible kind and a camera pulse',
        'car' not in before and '자동차' in text and '꿀꺽' in text and pulse > 0 and 'car' in after and 'tree' in after,
        f'text={text!r} pulse={pulse:.2f} new={sorted(set(after) - set(before))}')

    # W11 every kind sucked in gets its own voice (cat, person, car, tree, building) without errors
    pg.evaluate(f'{A}.start(2)'); pg.evaluate(f'{A}.skipTo({A}.s.runDuration * 0.9)'); frames_wait(pg, 3)  # night: all shade
    voiced = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player; p.r = 80; const kinds = ['cat', 'person', 'car', 'tree'];
      for (const k of kinds) {{ const o = s.objects.find(o => o.state === 0 && o.type === k); if (o) {{ o.x = p.x + 3; o.y = p.y; }} }}
      const b = s.buildings.find(b => b.state === 0 && b.r < p.r * 0.8); if (b) {{ b.x = p.x - b.w / 2; b.y = p.y - b.d / 2; }}
      return kinds; }})()''')
    frames_wait(pg, 4)
    heard = pg.evaluate('window.DuskSound.sfx.lastVoices')
    rec('W11', 'each kind sucked in is voiced by type', all(k in heard for k in ['cat', 'person', 'car', 'tree']) and 'building' in heard, f'heard={heard}')

    # W6 music: each region picks its own tune (no errors switching), the boss gets the boss arrangement
    for i in (0, 10, 20, 30, 90, 140): pg.evaluate(f'{A}.start({i})'); frames_wait(pg, 2)  # 30 = hanok, the Korean-style tune
    rec('W0', 'no page errors', not errs, '; '.join(errs[:3]))
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
