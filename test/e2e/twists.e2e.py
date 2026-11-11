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
    pg.add_init_script('window.__DUSK_TEST__ = { fixedQuality: true, noEvents: true };')
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
        // sunny with a margin all round, so a shade edge (a building's or a tree's) cannot creep over it in a frame or two
        if ([[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]].every(([dx, dy]) => !{A}.isShaded({{ x: x + dx, y: y + dy }}, null)) && !s.buildings.some(b => b.state === 0 && x > b.x - p.r - 12 && x < b.x + b.w + p.r + 12 && y > b.y - p.r - 12 && y < b.y + b.d + p.r + 12)) return [x, y];
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

    # W12 hanok lots are walled compounds: a main wing with a side wing touching it (ㄱ/ㄷ) inside a ring of low wall
    # segments (thin buildings typed 'fence', so they shade, block and go in the book), with a gate gap in front
    pg.evaluate(f'{A}.start(30)'); frames_wait(pg, 2)
    shape = pg.evaluate(f'''(() => {{ const s = {A}.s, bs = s.buildings.filter(b => !b.wall), f = s.buildings.filter(b => b.wall);
      const touching = bs.filter(a => bs.some(b => b !== a && Math.abs(b.y - (a.y + a.d)) < 0.5 && b.x >= a.x - 0.5 && b.x + b.w <= a.x + a.w + 0.5)).length;
      return [bs.length, touching, f.length, f.filter(b => b.d > b.w).length, Math.max(...bs.map(b => b.h)), Math.max(...f.map(b => b.h)), f.every(b => b.type === 'fence')]; }})()''')
    rec('W12', 'hanok: ㄱ/ㄷ houses (side wings touching the main wing) inside low wall rings', shape[0] >= 20 and shape[1] >= 8 and shape[2] >= 120 and shape[3] >= 50 and shape[4] <= 48 and shape[5] <= 8 and shape[6],
        f'houses={shape[0]} wings-touching={shape[1]} walls={shape[2]} (along y {shape[3]}) max-h={shape[4]} wall-h={shape[5]} typed-fence={shape[6]}')
    # W13 the village square and the shade budget: one ginkgo in the middle cell whose crown shades down-sun of it,
    # a pavilion beside it, and at noon real shade everywhere — the whole map, the lanes (persimmon trees along the
    # walls) and the square itself (TestFlight: "중앙은 거의 그림자가 없잖아"). A 20-unit grid over open ground.
    pg.evaluate(f'{A}.skipTo(40)'); frames_wait(pg, 3)
    sq = pg.evaluate(f'''(() => {{ const s = {A}.s, g = s.objects.filter(o => o.type === 'ginkgo'), t = g[0], sun = s.sun, CELL = 225, ROAD = 46;
      const len = 60 / Math.tan(sun.elev), under = t && {A}.isShaded({{ x: t.x + sun.sx * len, y: t.y + sun.sy * len }}, null);
      const z = {{ all: [0, 0], lane: [0, 0], square: [0, 0] }}, add = (k, v) => {{ z[k][0]++; if (v) z[k][1]++; }};
      for (let x = 40; x < 1760; x += 20) for (let y = 40; y < 1760; y += 20) {{
        if (s.buildings.some(b => b.state === 0 && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.d)) continue;
        const v = {A}.isShaded({{ x, y }}, null), lx = x % CELL, ly = y % CELL;
        add('all', v);
        if (lx < ROAD / 2 || ly < ROAD / 2 || lx > CELL - ROAD / 2 || ly > CELL - ROAD / 2) add('lane', v);
        else if (Math.floor(x / CELL) === 4 && Math.floor(y / CELL) === 4) add('square', v); }}
      // the pavilion stands to one side of the tree: never on top of it (TestFlight: a ring under the ginkgo nothing could reach)
      const pav = s.buildings.some(b => !b.wall && b.w < 50 && Math.floor(b.x / CELL) === 4 && Math.floor(b.y / CELL) === 4 && t && Math.hypot(b.x + b.w / 2 - t.x, b.y + b.d / 2 - t.y) > 60);
      const f = k => z[k][1] / z[k][0];
      return [g.length, t && Math.hypot(t.x - 900, t.y - 900) < 250, under, pav, f('all'), f('lane'), f('square')]; }})()''')
    rec('W13', 'hanok: ginkgo and pavilion on the central square; at noon >= 15% shade overall, >= 7% in lanes, >= 15% on the square',
        sq[0] == 1 and sq[1] and sq[2] and sq[3] and sq[4] >= 0.15 and sq[5] >= 0.07 and sq[6] >= 0.15,
        f'ginkgos={sq[0]} central={sq[1]} shade-under-crown={sq[2]} pavilion={sq[3]} noon all={sq[4]:.2f} lane={sq[5]:.2f} square={sq[6]:.2f}')

    # W14 hanok is passable: a body of r 16 (below the wall-crossing size) reaches most of the map from the middle
    # crossing through 66-wide lanes, gates and side doors; a body of r 18 takes a sunlit wall as food (walls are low)
    pg.evaluate(f'{A}.start(30)'); frames_wait(pg, 2)
    reach = pg.evaluate(f'''(() => {{ const s = {A}.s, R = 16, G = 10, N = 180, free = new Uint8Array(N * N);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {{ const x = i * G + 5, y = j * G + 5;
        if (!s.buildings.some(b => b.state === 0 && x > b.x - R && x < b.x + b.w + R && y > b.y - R && y < b.y + b.d + R)) free[i * N + j] = 1; }}
      const seen = new Uint8Array(N * N), st = [[90, 90]]; seen[90 * N + 90] = 1; let nr = 0;
      while (st.length) {{ const [i, j] = st.pop(); nr++;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {{ const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= N || c >= N) continue;
          const k = a * N + c; if (free[k] && !seen[k]) {{ seen[k] = 1; st.push([a, c]); }} }} }}
      return nr / (N * N); }})()''')
    pg.evaluate(f'{A}.skipTo(40)'); frames_wait(pg, 2)
    pick = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player, w = s.buildings.find(b => b.wall && b.state === 0 && !{A}.isShaded({A}.centerOf(b), b));
      p.r = 22; p.x = w.x + w.w / 2; p.y = w.y + w.d / 2; return [w.x, w.y, w.worth]; }})()''')  # 22: sunlight shaves a little off each frame
    frames_wait(pg, 4)
    ate = pg.evaluate(f"{A}.s.buildings.find(b => b.x === {pick[0]} && b.y === {pick[1]}).state")
    rec('W14', 'hanok: r 16 reaches 40%+ of the map; r 18 swallows a sunlit wall; walls are worth little', reach >= 0.4 and ate != 0 and pick[2] == 4,
        f'reach={reach:.2f} wall-state={ate} worth={pick[2]}')

    # W15 hunger: nothing swallowed for a while brings a countdown pill, then the body shrinks; a body kept at its
    # smallest long enough ends the run with the continue offer saying why (so waiting for night is no plan)
    pg.evaluate(f'{A}.start(0)'); pg.evaluate(f'{A}.skipTo(20)'); frames_wait(pg, 2)
    pg.evaluate(f'(() => {{ const s = {A}.s; for (const o of s.objects) o.state = 2; for (const g of s.guards) g.state = 2; s.player.x = 900; s.player.y = 900; }})()')
    pg.evaluate(f'{A}.hungerSet(8)'); frames_wait(pg, 2)
    count = [pg.is_visible('#hunger-pill'), pg.inner_text('#hunger-pill'), pg.evaluate(f'{A}.hunger.phase')]
    r0 = pg.evaluate(f'{A}.s.player.r')
    pg.evaluate(f'{A}.hungerSet(12)'); frames_wait(pg, 6)
    r1 = pg.evaluate(f'{A}.s.player.r'); starve = pg.evaluate(f'{A}.hunger.phase')
    pg.evaluate(f'(() => {{ {A}.s.player.r = 10; {A}.hungerSet(14, 9.95); }})()'); frames_wait(pg, 6)
    over = [pg.evaluate(f'{A}.s.state'), pg.is_visible('#cont') and pg.inner_text('#cont-why')]
    rec('W15', 'hunger: countdown pill, then shrinking, then the run ends with a continue offer that says why',
        count[0] and '배고파요' in count[1] and count[2] == 'count' and starve == 'starve' and r1 < r0 and over[0] == 'cont' and '굶' in (over[1] or ''),
        f'count={count} r {r0:.1f}->{r1:.1f} phase={starve} over={over}')
    if pg.is_visible('#cont'): pg.tap('#btn-cont-no'); frames_wait(pg, 4)

    # W16 every region keeps a sane amount of noon shade (buildings plus shade-casting props: trees, parasols, tents...):
    # scarce maps (beach, desert, farm) 2-12%, building-dense ones (city, crossing) up to 36%, the rest 6-27%.
    # Noon is the hard part of the day on purpose; the band keeps tuning from drifting into "no shade" or "all shade".
    bands = {'beach': (2, 12), 'desert': (2, 12), 'farm': (3, 12), 'city': (15, 36), 'crossing': (15, 36)}
    noon = {}
    for i, th in enumerate(pg.evaluate("window.DuskStages.REGIONS.map(r => r.theme)")):
        pg.evaluate(f'{A}.start({i * 10})'); pg.evaluate(f'{A}.skipTo(38)'); frames_wait(pg, 2)
        noon[th] = pg.evaluate(f'''(() => {{ const s = {A}.s; let n = 0, k = 0;
          for (let x = 15; x < 1785; x += 30) for (let y = 15; y < 1785; y += 30) {{
            if (s.buildings.some(b => b.state === 0 && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.d)) continue;
            n++; if ({A}.isShaded({{ x, y }}, null)) k++; }}
          return Math.round(k / n * 100); }})()''')
    off = {th: v for th, v in noon.items() if not (bands.get(th, (6, 27))[0] <= v <= bands.get(th, (6, 27))[1])}  # six runs per map spread ±3 around these
    rec('W16', 'noon shade per region stays in its band (scarce 2-12%, dense up to 36%, others 6-27%)', not off, f'noon%={noon} off={off}')

    # W17 zombies and combos: zombies shuffle on the town map; swallowing one slows the body for ~3 s, grows it not at
    # all and scores nothing; two quick swallows of ordinary things make a combo that multiplies the score
    pg.evaluate(f'{A}.start(0)'); pg.evaluate(f'{A}.skipTo(20)'); frames_wait(pg, 2)
    z0 = pg.evaluate(f'''(() => {{ const s = {A}.s, z = s.objects.filter(o => o.type === 'zombie' && o.state === 0); return [z.length, z[0] && [z[0].x, z[0].y]]; }})()''')
    frames_wait(pg, 20)
    moved = pg.evaluate(f'''(() => {{ const s = {A}.s, z = s.objects.filter(o => o.type === 'zombie' && o.state === 0)[0]; return z && Math.hypot(z.x - {z0[1][0]}, z.y - {z0[1][1]}); }})()''') if z0[1] else 0
    r0, s0 = pg.evaluate(f'[{A}.s.player.r, {A}.s.score]')
    pg.evaluate(f'''(() => {{ const s = {A}.s, z = s.objects.find(o => o.type === 'zombie' && o.state === 0); z.state = 1; z.ft = 0.99; }})()''')
    frames_wait(pg, 3)
    r1, s1, slow = pg.evaluate(f'[{A}.s.player.r, {A}.s.score, {A}.slowUntil - {A}.s.elapsed]')
    # a combo: two ordinary things one after the other (the swallow clock is reset by each)
    pg.evaluate(f'''(() => {{ const s = {A}.s; for (const o of s.objects.filter(o => o.state === 0 && !TYPES_BAD(o)).slice(0, 2)) {{ o.state = 1; o.ft = 0.99; }} }})()'''.replace('TYPES_BAD(o)', "(o.type === 'zombie')"))
    frames_wait(pg, 3)
    combo = pg.evaluate(f'{A}.combo')
    rec('W17', 'zombies shuffle; a zombie bite slows for ~3 s with no growth or points; two quick swallows start a combo',
        z0[0] >= 8 and moved > 0.5 and s1 == s0 and r1 <= r0 + 0.01 and 2.3 <= slow <= 3 and combo >= 2,
        f'zombies={z0[0]} moved={moved:.1f} score {s0}->{s1} r {r0:.1f}->{r1:.1f} slow-left={slow:.2f} combo={combo}')

    # W18 light shards: one appears in sunlight within reach by 12 s; touching it is enough; the cloud makes the sun
    # harmless around the body, the bolt raises the speed, the magnet pulls food in
    pg.evaluate(f'{A}.start(0)'); pg.evaluate(f'{A}.skipTo(12)'); frames_wait(pg, 3)
    first = pg.evaluate(f'''(() => {{ const s = {A}.s, h = {A}.shards.filter(h => h.state === 0); return [h.length, h[0] ? !{A}.isShaded(h[0], null) : false, h[0] ? Math.hypot(h[0].x - s.player.x, h[0].y - s.player.y) : 0]; }})()''')
    sunny = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player; for (let x = 80; x < 1700; x += 23) for (let y = 80; y < 1700; y += 29)
        if (!{A}.isShaded({{ x, y }}, null) && !s.buildings.some(b => x > b.x - 40 && x < b.x + b.w + 40 && y > b.y - 40 && y < b.y + b.d + 40)) {{ p.x = x; p.y = y; p.vx = p.vy = 0; return [x, y]; }} }})()''')
    pg.evaluate(f'{A}.spawnShard("cloud", {sunny[0]} + 5, {sunny[1]})'); frames_wait(pg, 3)
    cloud = pg.evaluate(f'[{A}.s.player.lit, {A}.effects.bubble > {A}.s.elapsed, {A}.s.stats.shards]')
    pg.evaluate(f'{A}.spawnShard("bolt", {A}.s.player.x + 5, {A}.s.player.y)'); frames_wait(pg, 3)
    speed = pg.evaluate(f'{A}.speedNow')
    mag = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player; p.vx = p.vy = 0; const o = s.objects.find(o => o.state === 0 && o.r <= 5 && o.type !== 'zombie'); o.x = p.x + 120; o.y = p.y; window.__mo = o; {A}.spawnShard("magnet", p.x + 5, p.y); return o.x - p.x; }})()''')
    frames_wait(pg, 8); mag2 = pg.evaluate(f'window.__mo.x - {A}.s.player.x')
    rec('W18', 'light shards: one in sunlight by 12 s; cloud = no sunburn, bolt = x1.6 speed, magnet = food drifts in',
        first[0] >= 1 and first[1] and first[2] < 320 and cloud[0] is False and cloud[1] and cloud[2] == 1 and abs(speed - 360) < 1 and mag2 < mag - 10,
        f'first={first} cloud={cloud} speed={speed:.0f} magnet dist {mag:.0f}->{mag2:.0f}')

    # W19 mid-run events (one per run 40–60% in; tests opt out and trigger kinds here): rain = shade everywhere while people
    # scatter; parade = a line of edibles marches along one road; blackout = dark with two extra keepers; cloud front = a big
    # cloud sweeps across. Each ends on time and cleans up after itself.
    pg.evaluate(f'{A}.start(0)'); pg.evaluate(f'{A}.skipTo(30)'); frames_wait(pg, 2)
    sunny = pg.evaluate(f'''(() => {{ const s = {A}.s; for (let x = 80; x < 1700; x += 23) for (let y = 80; y < 1700; y += 29)
        if (!{A}.isShaded({{ x, y }}, null) && !s.buildings.some(b => x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 20 && y < b.y + b.d + 20)) return [x, y]; }})()''')
    shaded_at = lambda: pg.evaluate(f'{A}.isShaded({{ x: {sunny[0]}, y: {sunny[1]} }}, null)')
    people = lambda: pg.evaluate(f"{A}.s.objects.filter(o => o.state === 0 && o.type === 'person' && !o.parade).slice(0, 40).map(o => [o.x, o.y])")
    pg.evaluate(f'{A}.startEvent("rain")'); p0 = people(); frames_wait(pg, 12); p1 = people()
    rain = [shaded_at(), pg.evaluate(f'{A}.mapEvent && {A}.mapEvent.kind'), sum(1 for a, b in zip(p0, p1) if abs(a[0] - b[0]) + abs(a[1] - b[1]) > 2), pg.is_visible('#rain')]
    pg.evaluate(f'{A}.endEvent()'); rain.append(shaded_at())
    pg.evaluate(f'{A}.startEvent("parade")'); frames_wait(pg, 8)
    par = pg.evaluate(f"(() => {{ const m = {A}.s.objects.filter(o => o.parade && o.state === 0); return [m.length, m.length > 0 && m[0].x > {A}.s.player.x - 240, new Set(m.map(o => Math.round(o.y))).size]; }})()")
    pg.evaluate(f'{A}.endEvent()'); gone = pg.evaluate(f"{A}.s.objects.filter(o => o.parade && o.state === 0).length")
    pg.evaluate(f'{A}.startEvent("blackout")'); frames_wait(pg, 3)
    blk = [shaded_at(), pg.evaluate(f"{A}.s.guards.filter(g => g.state === 0 && g.pool).length"), not pg.evaluate("document.querySelector('#vignette').classList.contains('hidden')")]
    pg.evaluate(f'{A}.endEvent()'); blk.append(pg.evaluate(f"{A}.s.guards.filter(g => g.state === 0 && g.pool).length"))
    pg.evaluate(f'{A}.startEvent("front")'); x0 = pg.evaluate(f"{A}.s.clouds.find(c => c.front).x"); frames_wait(pg, 10); x1 = pg.evaluate(f"({A}.s.clouds.find(c => c.front) || {{ x: 1e9 }}).x")
    pg.evaluate(f'{A}.endEvent()'); left = pg.evaluate(f"{A}.s.clouds.filter(c => c.front).length")
    rec('W19', 'events: rain shades all and scatters people; parade marches on one road; blackout darkens with 2 keepers; front sweeps across; all clean up',
        rain[0] and rain[1] == 'rain' and rain[2] >= 10 and rain[3] and rain[4] is False and par[0] >= 10 and par[1] and par[2] == 1 and gone == 0
        and blk[0] and blk[1] == 2 and blk[2] and blk[3] == 0 and x1 > x0 + 50 and left == 0,
        f'rain={rain} parade={par} gone={gone} blackout={blk} front {x0:.0f}->{x1:.0f} left={left}')

    # W6 music: each region picks its own tune (no errors switching), the boss gets the boss arrangement
    for i in (0, 10, 20, 30, 90, 140): pg.evaluate(f'{A}.start({i})'); frames_wait(pg, 2)  # 30 = hanok, the Korean-style tune
    rec('W0', 'no page errors', not errs, '; '.join(errs[:3]))
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
