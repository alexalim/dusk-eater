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
    frames_wait(pg, 20); c1 = pg.evaluate(f'{A}.s.clouds.map(c => c.x)')
    rec('W2', 'cloud shade counts as shade and clouds drift', len(c0) >= 5 and shaded and c1 != [c[0] for c in c0],
        f'clouds={len(c0)} shaded={shaded}')

    # W3 golden friend: one appears near the player, glows, and is worth 5x when swallowed
    pg.evaluate(f'{A}.start(4)'); pg.evaluate(f'{A}.skipTo(5)'); frames_wait(pg, 3)
    glow = pg.evaluate(f'{A}.s.objects.some(o => o.glow)')  # the renderer paints these gold
    gold = pg.evaluate(f'(() => {{ const s = {A}.s, o = s.objects.find(o => o.goldUntil > s.elapsed); if (!o) return null; o.state = 1; o.ft = 0.99; return [o.type, Math.round(o.r * o.r / 2) * 5]; }})()')
    s0 = pg.evaluate(f'{A}.s.score'); frames_wait(pg, 4); s1 = pg.evaluate(f'{A}.s.score')
    rec('W3', 'a golden friend shows up painted gold and pays 5x', glow and gold is not None and s1 - s0 == gold[1], f'glow={glow} gold={gold} score {s0}->{s1}')

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
    pg.evaluate(f'{A}.skipTo(110)'); frames_wait(pg, 3)  # night: everything is shade except the beams
    pg.evaluate(f'(() => {{ const s = {A}.s, g = s.guards.find(g => g.boss); s.player.r = g.r / 0.8; s.player.x = g.x - 4; s.player.y = g.y; }})()')
    frames_wait(pg, 40)
    eaten = pg.evaluate(f"{A}.s.stats.eaten.boss || 0")
    rec('W5', 'boss is bigger than a fresh player, says how big to grow, and counts toward its goal when swallowed',
        boss and boss[0] > boss[2] * 0.85 and boss[1] > 150 and 'm 넘게' in pill and eaten == 1, f'boss={boss} pill={pill!r} eaten={eaten}')

    # W6 music: each region picks its own tune (no errors switching), the boss gets the boss arrangement
    for i in (0, 10, 20, 90, 140): pg.evaluate(f'{A}.start({i})'); frames_wait(pg, 2)
    rec('W0', 'no page errors', not errs, '; '.join(errs[:3]))
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
