# Layer: E2E — real Chromium + WebGL (SwiftShader) at phone sizes. Usage: python3 test/e2e/qa.e2e.py www <out-dir>
import sys, json, pathlib, statistics
from playwright.sync_api import sync_playwright
from PIL import Image
www, out = pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2])
URL = (www / 'index.html').as_uri()
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
res = []
def rec(sid, name, ok, detail=''):
    res.append((sid, name, ok, detail)); print(f"{'PASS' if ok else 'FAIL'} {sid} {name} :: {detail}", flush=True)

# Times every rAF callback so we can see the JS cost of one game frame.
TIMER = '''window.__DUSK_TEST__ = { fixedQuality: true, noEvents: true }; window.__ft = [];
const _raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = cb => _raf(ts => { const a = performance.now(); cb(ts); window.__ft.push(performance.now() - a); });'''

def page(p, w=390, h=844, storage=None):
    b = p.chromium.launch(args=GL)
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.add_init_script(TIMER)
    if storage: pg.add_init_script(f"localStorage.setItem('dusk-stars', '{json.dumps(storage)}')")
    pg.goto(URL); pg.wait_for_timeout(700)
    return b, pg, errs

A = 'window.__DUSK_TEST__.api'
# First level of some regions (index into STAGES; regions are 10 levels): town 0
CITY, HANOK, SNOW, CROSS, HARB, PARK, DESERT, FARM = 10, 30, 50, 70, 90, 110, 130, 140
def frames_wait(pg, n=3):
    pg.evaluate(f'new Promise(r => {{ let k = {n}; const f = () => --k <= 0 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }})')
def decline_continue(pg):
    # a run that did not clear its level offers a paid continue first; these checks want the plain end screen
    if pg.is_visible('#cont'): pg.tap('#btn-cont-no'); frames_wait(pg, 4)
    pg.evaluate("document.querySelector('#cheer').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)  # past the celebration step (a plain event: it may already have moved on by itself)  # the celebration step, then the details
with sync_playwright() as p:
    # S1 flow: title -> level picker, level 2 locked, locked card ignores taps
    b, pg, errs = page(p)
    t = pg.is_visible('#title')
    pg.tap('#btn-title'); frames_wait(pg)
    nodes = pg.query_selector_all('.node')
    locked = [n.get_attribute('class') for n in nodes]
    nodes[1].tap(); frames_wait(pg)
    still = pg.is_visible('#select'); go_locked = pg.query_selector('#btn-go')
    sheet = pg.evaluate("document.querySelector('#sheet').textContent")
    rec('S1', 'title->levels, level 2 locked, locked node shows no start', t and 'locked' in locked[1] and 'locked' not in locked[0] and still and go_locked is None and '별 1개' in sheet, str(locked))
    # S2 touch drag moves the player
    pg.query_selector_all('.node')[0].tap(); frames_wait(pg); pg.tap('#btn-go'); frames_wait(pg)
    # buildings are solid, so drag toward the most open side (the spawn usually hugs a building's shade)
    way = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player;
      const free = (dx, dy) => {{ let d = 0; while (d < 400 && !s.buildings.some(b => b.state === 0 && p.x + dx * d > b.x - p.r && p.x + dx * d < b.x + b.w + p.r
        && p.y + dy * d > b.y - p.r && p.y + dy * d < b.y + b.d + p.r)) d += 5; return d; }};
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].sort((a, c) => free(...c) - free(...a))[0]; }})()''')
    pos = lambda: pg.evaluate(f'[{A}.s.player.x, {A}.s.player.y]')
    p0 = pos()
    cdp = pg.context.new_cdp_session(pg)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 200, 'y': 500}]})
    for i in range(1, 18):  # a short drag: small bodies are quick now, and a long one runs into the next building
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 200 + way[0] * i * 3, 'y': 500 + way[1] * i * 3}]})
        pg.wait_for_timeout(16)
    frames_wait(pg)
    p1 = pos(); x0, x1 = 0, (p1[0] - p0[0]) * way[0] + (p1[1] - p0[1]) * way[1]  # distance along the drag
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    # release: a short glide (GLIDE_S 0.3 s at start size), then a full stop
    frames_wait(pg, 1); v_glide = pg.evaluate(f'Math.hypot({A}.s.player.vx, {A}.s.player.vy)')  # read at once: a wall a few frames on would zero it
    frames_wait(pg, 40)  # by frames, not wall time: a slow software GPU runs fewer frames (dt is capped at 0.05 s)
    v_after = pg.evaluate(f'Math.hypot({A}.s.player.vx, {A}.s.player.vy)')
    rec('S2', 'touch drag moves the player, release glides then stops', x1 - x0 > 30 and v_glide > 5 and v_after == 0, f'dx={x1-x0:.0f} v_glide={v_glide:.1f} v_after={v_after:.1f}')
    # S10 spawn state for several rounds of each stage
    lit = []
    for si in (0, HARB):
        for _ in range(15):
            pg.evaluate(f'{A}.start({si})'); frames_wait(pg)
            lit.append(pg.evaluate(f'{A}.s.player.lit'))
    rec('S10', 'player spawns in shade', not any(lit), f'lit at spawn in {sum(lit)}/{len(lit)} rounds, fallback spawns {pg.evaluate(A + ".spawnFallbacks")}')
    # S5 pause on hide, resume
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    pg.evaluate("Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange'))")
    e0 = pg.evaluate(f'{A}.s.state'); frames_wait(pg)
    paused_vis = pg.is_visible('#pause')
    pg.evaluate("Object.defineProperty(document, 'hidden', {configurable: true, get: () => false})")
    pg.tap('#btn-resume'); frames_wait(pg)
    rec('S5', 'pause on background, resume', e0 == 'paused' and paused_vis and pg.evaluate(f'{A}.s.state') == 'play', f'state={e0}')
    # S12 all three missions done -> night falls at once with a banner; two of three keeps the day going
    meet = lambda k: f"""(() => {{ const s = {A}.s; const goals = window.DuskStages.STAGES[0].goals.slice(0, {k});
        for (const g of goals) {{ if (g.kind === 'score') s.stats.score = g.n; if (g.kind === 'eat') s.stats.eaten[g.what] = g.n; }} }})()"""
    pg.evaluate(f'{A}.start(0); {A}.skipTo(20)'); pg.evaluate(meet(2)); frames_wait(pg, 4)
    partial = pg.evaluate(f'{A}.s.phase.night')
    pg.evaluate(meet(3)); frames_wait(pg, 4)
    night, t_left = pg.evaluate(f'[{A}.s.phase.night, {A}.runDuration * (1 - window.DuskCore.NIGHT_START)]')
    banner = pg.evaluate("getComputedStyle(document.querySelector('#banner')).opacity")
    rec('S12', 'all missions done -> early night + banner; partial does not', not partial and night and float(banner) > 0.5,
        f'partial_night={partial} night={night} banner={banner} night_len={t_left:.0f}s')
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    # S13 pause button -> quit: back to the level picker, boost gems refunded, no stars or best score saved
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ gems: 100 }})); {A}.start(0, ['time'])"); frames_wait(pg)
    paid = pg.evaluate(f'{A}.Store.wallet.gems')
    pg.tap('#btn-pause'); frames_wait(pg)
    paused = pg.is_visible('#pause') and pg.evaluate(f'{A}.s.state') == 'paused'
    pg.tap('#btn-quit'); frames_wait(pg)
    w = pg.evaluate(f'[{A}.Store.wallet.gems, {A}.Store.wallet.pending]')
    saved = pg.evaluate("[localStorage.getItem('dusk-stars'), localStorage.getItem('dusk-best')]")
    rec('S13', 'pause button -> quit returns to levels, refunds boost, saves nothing', paid == 60 and paused and pg.is_visible('#select')
        and w == [100, 0] and saved == [None, None], f'paid->{paid} wallet={w} saved={saved}')
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    # S14 two-finger pinch: zoom in, past the limit into first person (no shader recompiles), steer, pinch back out
    def pinch(d0, d1, steps=12):
        cdp = pg.context.new_cdp_session(pg)
        pts = lambda d: [{'x': 195 - d / 2, 'y': 500, 'id': 1}, {'x': 195 + d / 2, 'y': 500, 'id': 2}]
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(d0)})
        for i in range(1, steps + 1):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(d0 + (d1 - d0) * i / steps)}); pg.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); frames_wait(pg)
    def drag(dx, dy, ms=600):
        cdp = pg.context.new_cdp_session(pg)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 195, 'y': 600}]})
        for i in range(1, 11):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 195 + dx * i / 10, 'y': 600 + dy * i / 10}]}); pg.wait_for_timeout(16)
        pg.wait_for_timeout(ms)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); frames_wait(pg, 10)
    V = lambda: pg.evaluate(f'[{A}.view.zoom, {A}.view.fp, {A}.view.t]')
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    x0 = pg.evaluate(f'{A}.s.player.x')
    pinch(100, 150); z1 = V()
    moved = abs(pg.evaluate(f'{A}.s.player.x') - x0)
    # a pinch just past the closest zoom only previews the tilt and springs back on release
    pinch(100, 200); pg.wait_for_timeout(400); early = V()
    progs0 = pg.evaluate(f'{A}.R.debug.renderer.info.programs.length')
    pinch(80, 300); pg.wait_for_timeout(1000); fp1 = V(); frames_wait(pg, 4)
    progs1 = pg.evaluate(f'{A}.R.debug.renderer.info.programs.length')
    face0, p0 = pg.evaluate(f'[{A}.s.player.face, [{A}.s.player.x, {A}.s.player.y]]')
    drag(60, 0); face1, p1 = pg.evaluate(f'[{A}.s.player.face, [{A}.s.player.x, {A}.s.player.y]]')
    drag(0, -60); face2, p2 = pg.evaluate(f'[{A}.s.player.face, [{A}.s.player.x, {A}.s.player.y]]')
    import math
    step = (p2[0] - p1[0], p2[1] - p1[1]); along = step[0] * math.cos(face2) + step[1] * math.sin(face2)
    pinch(300, 100); pg.wait_for_timeout(1200); back = V()
    # the swoop itself, frame by frame: eases in over ~0.9 s instead of jumping
    swoop = pg.evaluate(f"""new Promise(r => {{ const v = {A}.view, out = [], t0 = performance.now(); v.target = 1;
        const f = () => {{ out.push([v.t, performance.now() - t0]); v.t >= 1 ? r(out) : requestAnimationFrame(f); }}; requestAnimationFrame(f); }})""")
    pg.evaluate(f'{A}.view.target = 0; {A}.view.t = 0')
    mid = [t for t, _ in swoop if 0.05 < t < 0.95]
    swoop_ms = swoop[-1][1]
    swoop = [t for t, _ in swoop]
    rec('S14', 'pinch zooms; small overpinch springs back; deep overpinch swoops into first person (no recompile); turn + walk; pinch out swoops back',
        z1[0] < 0.9 and not z1[1] and moved < 1 and not early[1] and early[2] < 0.05 and len(mid) >= 2 and swoop_ms > 600 and all(b >= a for a, b in zip(swoop, swoop[1:])) and fp1[1] and fp1[2] == 1
        and progs1 == progs0 and face1 - face0 > 0.3 and math.dist(p0, p1) < 15 and along > 40 and not back[1] and back[2] == 0,
        f'zoom={z1[0]:.2f} pinch_moved={moved:.1f} early={early} swoop {len(mid)} mid-frames over {swoop_ms:.0f}ms programs {progs0}->{progs1} '
        f'turn={face1 - face0:.2f} turn_drift={math.dist(p0, p1):.1f} forward={along:.0f} back={back}')
    pg.evaluate(f'{A}.view.zoom = 1; {A}.start(0)'); frames_wait(pg)
    # S15 adaptive quality: slow frames step resolution down (2 -> 1.5 -> 1 px ratio), never below the floor
    pr = lambda: pg.evaluate(f'[{A}.R.quality, {A}.R.debug.renderer.getPixelRatio()]')
    pg.evaluate('window.__DUSK_TEST__.fixedQuality = false')
    q0 = pr(); pg.evaluate(f'{A}.skipTo(5)')
    steps = []
    for _ in range(3):
        pg.evaluate(f'for (let i = 0; i < 70; i++) {A}.watchFrames(1 / 30)'); steps.append(pr())
    pg.evaluate(f'{A}.R.setQuality(0)'); restored = pr()
    pg.evaluate('window.__DUSK_TEST__.fixedQuality = true')
    rec('S15', 'slow frames lower quality step by step, stopping at the floor', q0 == [0, 2] and steps == [[1, 1.5], [2, 1], [2, 1]] and restored == [0, 2],
        f'start={q0} steps={steps}')
    # S16 level 1 tutorial: clock frozen until the first swallow, steps advance by doing; level 2 has none; skip works
    T = lambda: pg.evaluate(f"[{A}.tut && {A}.tut.i, document.querySelector('#tut-text').textContent, !document.querySelector('#tutorial').classList.contains('hidden')]")
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg, 10)
    t0 = T(); sun0 = pg.evaluate("document.querySelector('#sun').style.left")
    # buildings are solid now, so walk the way with the most open room (spawns usually hug a building's shade)
    way = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player;
      const free = (dx, dy) => {{ let d = 0; while (d < 400 && !s.buildings.some(b => b.state === 0 && p.x + dx * d > b.x - p.r && p.x + dx * d < b.x + b.w + p.r
        && p.y + dy * d > b.y - p.r && p.y + dy * d < b.y + b.d + p.r)) d += 5; return d; }};
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].sort((a, c) => free(...c) - free(...a))[0]; }})()''')
    drag(way[0] * 60, way[1] * 60, 3000); t1 = T()
    sun1 = pg.evaluate("document.querySelector('#sun').style.left")  # steps 1-2: clock still frozen
    ate = pg.evaluate(f'{A}.s.stats.total')
    pg.evaluate(f'{A}.tut.t = 10'); frames_wait(pg, 3); t1b = T()  # the timed "stay in shade" step
    # step 3 waits for a swallow: if the drag already swallowed something it passes at once
    expect_b = 2 if ate == 0 else 3
    pg.evaluate(f'{A}.s.stats.total = 1'); frames_wait(pg, 8)
    t2 = T(); sun2 = pg.evaluate("document.querySelector('#sun').style.left")
    pg.evaluate(f'{A}.start(1)'); frames_wait(pg, 3); lv2 = T()
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg, 3); pg.tap('#tut-skip'); frames_wait(pg, 3); skipped = T()
    rec('S16', 'level 1 tutorial: frozen clock until first swallow, steps advance, none on level 2, skippable',
        t0[0] == 0 and t0[2] and '끌면' in t0[1] and t1[0] == 1 and t1b[0] >= expect_b and sun0 == sun1 == '0%' and t2[0] >= 3 and sun2 != '0%'
        and lv2[0] is None and not lv2[2] and skipped[0] is None and not skipped[2],
        f'start={t0[:1]} after_drag={t1[0]} ate_while_dragging={ate} after_wait={t1b[0]} sun {sun0}->{sun1}->{sun2} after_swallow={t2[0]} level2={lv2[0]} skipped={skipped[0]}')
    # S17 Christmas event: no tab before Dec 1; a tab and 10 levels from Dec 1; 15 event stars grant the santa skin once;
    # the shop shows it locked until then; the event closes after Jan 6
    T = lambda: pg.evaluate("[...document.querySelectorAll('#map .tabs .chip')].map(e => e.dataset.l)")  # the ranking screen has tabs too
    pg.evaluate("window.__DUSK_TEST__.today = '2026-11-30'"); pg.evaluate(f'{A}.freeze()')
    pg.evaluate("document.querySelector('#btn-title').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)
    nov = T()
    pg.evaluate("window.__DUSK_TEST__.today = '2026-12-10'")
    pg.evaluate("document.querySelector('#btn-title').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)
    dec = T(); pg.tap('.tabs .chip[data-l=xmas]'); frames_wait(pg, 3)
    nodes = len(pg.query_selector_all('.levels .node')); note0 = pg.inner_text('.event-note')
    MEET = f"""(() => {{ const s = {A}.s; for (const g of window.DuskStages.EVENT_LEVELS.xmas[%d].goals) {{
        if (g.kind === 'score') s.stats.score = Math.max(s.stats.score, g.n); if (g.kind === 'eat') s.stats.eaten[g.what] = g.n; }} }})()"""
    owned = []
    for k in range(5):
        pg.evaluate(f'{A}.start({k})'); frames_wait(pg, 2)
        pg.evaluate(MEET % k); frames_wait(pg, 3)
        pg.evaluate(f'{A}.skipTo({A}.runDuration - 0.02)'); frames_wait(pg, 4)
        owned.append('santa' in pg.evaluate(f'{A}.Store.wallet.owned'))
    note = pg.inner_text('#end-gems')
    pg.evaluate("document.querySelector('#btn-select').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)
    note1 = pg.inner_text('.event-note')
    pg.evaluate("window.__DUSK_TEST__.today = '2027-01-07'")
    pg.evaluate("document.querySelector('#btn-select').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)
    jan = [T(), pg.evaluate(f'{A}.listKey')]
    rec('S17', 'Christmas event: tab only Dec 1 - Jan 6, 10 levels, santa skin at 15 stars',
        nov == [] and dec == ['main', 'xmas'] and nodes == 10 and '0/30' in note0 and owned == [False] * 4 + [True]
        and '산타 그림자' in note and '획득' in note1 and jan == [[], 'main'],
        f'nov={nov} dec={dec} nodes={nodes} owned_after_each={owned} note={note!r} jan={jan}')
    pg.evaluate("window.__DUSK_TEST__.today = null"); pg.evaluate(f'{A}.useList("main"); {A}.start(0)'); frames_wait(pg)
    # S18 third person: heading up the screen turns the body all the way round (back to the camera), not just sideways
    pg.evaluate(f"{A}.input.keys.add('ArrowUp')"); frames_wait(pg, 40)
    look = pg.evaluate(f'(() => {{ const l = {A}.s.player.look + Math.PI / 2; return Math.abs(Math.atan2(Math.sin(l), Math.cos(l))); }})()')
    pg.evaluate(f"{A}.input.keys.delete('ArrowUp')"); pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    rec('S18', 'third person turns fully toward an upward heading', look < 0.3, f'off by {look:.2f} rad')
    # S19 a building too big to swallow is solid: walking into it stops at its wall and bounces back
    wall = pg.evaluate(f'''(() => {{ const s = {A}.s, p = s.player, b = s.buildings.filter(b => b.state === 0 && b.r > p.r).sort((a, c) => c.d - a.d)[0];
      p.x = b.x - p.r * 2; p.y = b.y + b.d / 2; p.vx = p.vy = 0; return b.x; }})()''')
    pg.evaluate(f"{A}.input.keys.add('ArrowRight')"); frames_wait(pg, 60)
    pressed = pg.evaluate(f'(() => {{ const p = {A}.s.player; return [p.x, p.r]; }})()')
    pg.evaluate(f"{A}.input.keys.delete('ArrowRight')"); frames_wait(pg, 2)
    vx = pg.evaluate(f'{A}.s.player.vx'); pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    rec('S19', 'big building is solid: the body stops at the wall (no deeper than 80% of its radius)',
        pressed[0] <= wall - pressed[1] * 0.8 + 1 and vx <= 0.5, f'wall={wall:.0f} x={pressed[0]:.1f} r={pressed[1]:.1f} vx_after={vx:.1f}')
    # S3 round end: stars + goal list + next button rule (fast frames can be ~16 ms, so leave 10 ms and wait 8)
    pg.evaluate(f'{A}.skipTo(119.99)'); frames_wait(pg, 8)
    decline_continue(pg)
    end_vis = pg.is_visible('#end'); goals = len(pg.query_selector_all('#end-goals > div'))
    stars = pg.evaluate("JSON.parse(localStorage.getItem('dusk-stars') || '{}')")
    nxt = pg.is_visible('#btn-next')
    rec('S3', 'end screen, goals listed, stars saved, next hidden w/o star', end_vis and goals == 3 and 'L1' in stars and nxt == (stars['L1'] >= 1), f'stars={stars} next={nxt}')
    # S6 memory: restart 12 times. Each building owns its geometry, so pin the map seed (Date.now) to compare like with like.
    pg.evaluate('window.__now = Date.now; Date.now = () => 4242')
    info = lambda: pg.evaluate(f'(() => {{ const m = {A}.R.debug.renderer.info.memory; return [m.geometries, m.textures]; }})()')
    [pg.evaluate(f'{A}.start({i % 2 * HARB})') or frames_wait(pg) for i in range(4)]; pg.evaluate(f'{A}.start({HARB})'); frames_wait(pg); m0 = info()
    for i in range(12):
        pg.evaluate(f'{A}.start({i % 2 * HARB})'); frames_wait(pg)
    pg.evaluate(f'{A}.start({HARB})'); frames_wait(pg); m1 = info()
    pg.evaluate('Date.now = window.__now')
    rec('S6', 'no GPU memory growth over 12 restarts', m1[0] <= m0[0] + 2 and m1[1] <= m0[1], f'geo/tex before={m0} after={m1}')
    rec('S0', 'no page errors (iPhone 390x844)', not errs, '; '.join(errs)[:200])
    b.close()

    # S4 unlock via saved star
    b, pg, errs = page(p, storage={'L1': 1})
    pg.tap('#btn-title'); frames_wait(pg)
    sel0 = pg.evaluate("document.querySelector('.node.sel').dataset.i")
    pg.query_selector_all('.node')[1].tap(); frames_wait(pg); pg.tap('#btn-go'); frames_wait(pg)
    card = pg.is_visible('#twist')  # level 2 is a twist level: its intro card comes first
    pg.tap('#btn-twist-go'); frames_wait(pg)
    rec('S4', 'level 2 opens after 1 star on level 1 (after its intro card), picker preselects it', sel0 == '1' and card and pg.evaluate(f'{A}.s.state') == 'play' and '고양이' in pg.evaluate("document.querySelector('#goals').textContent"))
    # S7/S11 frame cost: early, late-big, night transition
    def stats(setup):
        pg.evaluate(setup); frames_wait(pg, 2)
        calls, tris = pg.evaluate(f'(() => {{ const i = {A}.R.debug.renderer.info.render; return [i.calls, i.triangles]; }})()')
        pg.evaluate(f'(() => {{ const r = {A}.R.debug.renderer; r.__render = r.render; r.render = () => {{}}; window.__ft = []; }})()')
        frames_wait(pg, 120)
        ft = sorted(pg.evaluate('window.__ft'))
        pg.evaluate(f'(() => {{ const r = {A}.R.debug.renderer; r.render = r.__render; }})()')
        return calls, tris, statistics.median(ft), ft[int(len(ft) * .95)]
    for si in (0, HARB, CITY, HANOK, CROSS, PARK, SNOW, FARM):  # hanok: hundreds of wall segments that cast shadows
        e = stats(f'{A}.start({si}); {A}.skipTo(10)')
        l = stats(f'{A}.s.player.r = 110; {A}.skipTo(90)')
        rec('S7', f'stage{si} draw calls / triangles / JS ms (median,p95)', e[0] < 300 and l[0] < 300 and l[3] < 8,
            f'early {e[0]} calls {e[1]//1000}k tris {e[2]:.2f}/{e[3]:.2f}ms | late-big {l[0]} calls {l[1]//1000}k tris {l[2]:.2f}/{l[3]:.2f}ms')
    progs = lambda: pg.evaluate(f'{A}.R.debug.renderer.info.programs.length')
    pg.evaluate(f'{A}.start(0); {A}.skipTo(101.0)'); frames_wait(pg, 3); p0 = progs()
    pg.evaluate(f'{A}.skipTo(103.0)'); frames_wait(pg, 3); p1 = progs()
    rec('S11', 'no shader recompiles when night starts', p1 == p0, f'programs before={p0} after={p1}')
    b.close()

    # S8 on small, large and landscape screens
    for w, h in [(375, 667), (430, 932), (844, 390)]:
        b, pg, errs = page(p, w, h)
        pg.screenshot(path=str(out / f'layout-{w}x{h}-title.png'))
        pg.evaluate(f'{A}.start({HARB})'); frames_wait(pg)
        pg.screenshot(path=str(out / f'layout-{w}x{h}-play.png'))
        ov = pg.evaluate('document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight')
        hud = pg.evaluate("(() => { const r = document.querySelector('#hud').getBoundingClientRect(); return [Math.round(r.height), innerHeight]; })()")
        pg.evaluate(f'{A}.skipTo(119.99)'); frames_wait(pg, 8)
        decline_continue(pg)
        pg.screenshot(path=str(out / f'layout-{w}x{h}-end.png'))
        pg.evaluate("document.querySelector('#btn-select').scrollIntoView({block: 'nearest'})"); frames_wait(pg)
        fits = pg.evaluate("(() => { const b = document.querySelector('#btn-select').getBoundingClientRect(); return b.bottom <= innerHeight + 1 && b.top >= -1; })()")
        rec('S8', f'layout {w}x{h}', not ov and fits, f'scroll-overflow={ov} hud_h/screen={hud} end-buttons-fit={fits}')
        b.close()

    # S9 rendered shadow vs rule polygons, pixel by pixel
    b, pg, errs = page(p)
    # sample times are 3/4 of the old 120-second marks, so they land at the same point of today's 90-second day
    for si, sec in [(0, 9), (0, 41), (0, 71), (HARB, 22), (HARB, 71), (CITY, 37), (SNOW, 22), (SNOW, 52), (DESERT, 22), (FARM, 37)]:
      t = sec
      for attempt in range(5):  # a random map with no shadow in view (the farm has few buildings) proves nothing: roll another;
        # at noon on a scarce map even three rolls can come up empty (shade hides under the trees' own exclusion radius), so
        # the last two rolls move to the afternoon, where the same map throws long shadows
        t = sec if attempt < 3 else min(sec + 30, 71)
        pg.evaluate(f'{A}.start({si}); {A}.skipTo({t})'); frames_wait(pg, 2); pg.evaluate(f'{A}.freeze()'); frames_wait(pg, 2)
        pts = pg.evaluate('''(() => {
          const A = window.__DUSK_TEST__.api, C = window.DuskCore, s = A.s, T = window.THREE;
          const { camera, scene } = A.R.debug;
          const sun = s.sun; // the stage's own sun (snow keeps it low)
          const sh = s.shadows; // the game's own shade list for this frame: buildings and shade-casting props (trees, parasols...)
          const things = s.objects.filter(o => o.state === 0).concat(s.guards);
          // HUD pieces drawn over the ground (banners, timers, warnings) would read as "bright": skip points under them
          document.getElementById('warn').style.visibility = 'hidden'; // the sunlight edge glow tints the frame; not ground
          const covers = ['#banner', '#status', '#goals', '#stats', '#sunbar', '#tutorial', '#dex-new']
            .map(q => document.querySelector(q)).filter(e => e && !e.classList.contains('hidden') && getComputedStyle(e).opacity !== '0')
            .map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
          const covered = (sx, sy) => covers.some(r => sx > r.left - 4 && sx < r.right + 4 && sy > r.top - 4 && sy < r.bottom + 4);
          const ray = new T.Raycaster(), out = [];
          for (let i = 0; i < 4000 && out.length < 500; i++) {
            const x = s.player.x + (Math.random() - .5) * 700, y = s.player.y + (Math.random() - .5) * 1400;
            // just off each prop, so prop shade (trees, parasols) is sampled too, but clear of the orange hint ring drawn on
            // the ground around anything edible (radius r+2, a few units wide): that ring is bright by design
            if (things.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 12)) continue;
            if ((A.shards || []).some(h => h.state === 0 && Math.hypot(h.x - x, h.y - y) < 40)) continue; // a light shard's ring and pillar
            if (s.buildings.some(b => { if (b.state !== 0 || b.r >= s.player.r * 0.85) return false; const R = Math.hypot(b.w, b.d) / 2, d = Math.hypot(b.x + b.w / 2 - x, b.y + b.d / 2 - y); return Math.abs(d - R) < 9; })) continue;
            if (Math.hypot(s.player.x - x, s.player.y - y) < s.player.r * 1.6) continue;
            const v = C.inAnyShadow(sh, x, y);
            const edge = [[5,0],[-5,0],[0,5],[0,-5]].some(([dx,dy]) => C.inAnyShadow(sh, x+dx, y+dy) !== v);
            if (edge) continue;
            let ed = 99; for (const rr of [8, 12, 16, 24]) if ([[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]].some(([a,b]) => C.inAnyShadow(sh, x+a*rr, y+b*rr) !== v)) { ed = rr; break; }
            const beams = s.guards.filter(g => g.state === 0).concat(s.lighthouse ? [s.lighthouse] : []);
            const inBeam = beams.some(g => C.inCone(g, x, y));
            if (inBeam) continue; // beams are drawn bright on purpose and the rule treats them as unshaded too
            const p = new T.Vector3(x, 0.5, y).project(camera);
            const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
            if (sx < 4 || sx > innerWidth - 4 || sy < 200 || sy > innerHeight - 4 || covered(sx, sy)) continue;
            ray.setFromCamera({ x: p.x, y: p.y }, camera);
            const hit = ray.intersectObjects(scene.children, true).find(h => h.object.visible && !h.object.material.transparent);
            if (!hit || !hit.object.userData.ground) continue;
            out.push([sx, sy, v, hit.object.geometry.type, inBeam, ed]);
          }
          return out;
        })()''')
        shot = out / f'pix-{si}-{t}.png'; pg.screenshot(path=str(shot))
        img = Image.open(shot).convert('L'); W, H = img.size; k = W / 390
        by = {}
        raw = [(img.getpixel((int(sx * k), int(sy * k))), v, kind, ib, ed) for sx, sy, v, kind, ib, ed in pts]
        for l, v, kind, ib, ed in raw: by.setdefault(kind, []).append((l, v))
        agree = total = 0; det = []
        for kind, arr in by.items():
            lit = [l for l, v in arr if not v]; sha = [l for l, v in arr if v]
            if not lit or not sha: continue
            thr = (statistics.median(lit) + statistics.median(sha)) / 2
            ok = sum((l < thr) == v for l, v in arr); agree += ok; total += len(arr)
            det.append(f'{kind[:5]} lit~{statistics.median(lit):.0f} shade~{statistics.median(sha):.0f} n={len(arr)}')
        rate = agree / total if total else 0
        if total >= 60: break
        print(f'   S9 stage{si} t={t}s: only {total} usable points (no shadow in view?), rolling another map')
      if True:  # scored on the last roll
        thr = {kd: (statistics.median([l for l, v in a if not v] or [0]) + statistics.median([l for l, v in a if v] or [0])) / 2 for kd, a in by.items()}
        bad = [(v, ib, ed) for l, v, kd, ib, ed in raw if (l < thr[kd]) != v]
        print('   mismatches:', len(bad), '| rule-shade-but-bright', sum(1 for v, ib, ed in bad if v), '| rule-lit-but-dark', sum(1 for v, ib, ed in bad if not v),
              '| in-beam', sum(1 for b in bad if b[1]), '| edge-dist', sorted(b[2] for b in bad))
        rec('S9', f'shadow pixels match rule stage{si} t={t}s', rate >= 0.97, f'{rate*100:.1f}% of {total} pts; ' + ' | '.join(det))
    b.close()

    # S20 first run: the onboarding cards (progress bar, the character's bubble, one button) end on the level map; never shown again
    b = p.chromium.launch(args=GL)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(TIMER); pg.add_init_script('window.__DUSK_TEST__.onboard = true')
    pg.goto(URL); pg.wait_for_timeout(700); pg.evaluate(f'{A}.ready'); frames_wait(pg)
    shown = pg.is_visible('#onboard'); bars = []; says = []
    for k in range(4):
        bars.append(pg.evaluate("document.querySelectorAll('#ob-bar i.on').length")); says.append(pg.inner_text('#ob-say'))
        last = pg.inner_text('#btn-ob'); pg.tap('#btn-ob'); frames_wait(pg)
    on_map = pg.is_visible('#select') and not pg.is_visible('#onboard'); sel = pg.evaluate("document.querySelector('.node.sel') && document.querySelector('.node.sel').dataset.i")
    pg.reload(); pg.wait_for_timeout(700); pg.evaluate(f'{A}.ready'); frames_wait(pg)
    again = pg.is_visible('#onboard')
    rec('S20', 'first run: 4 onboarding cards with a filling bar and the character talking, 시작하기 opens the map on level 1, not shown again',
        shown and bars == [1, 2, 3, 4] and len(set(says)) == 4 and last == '시작하기' and on_map and sel == '0' and not again and not errs, f'bars={bars} last={last!r} map={on_map} sel={sel} again={again} errs={errs}')
    b.close()

    # S21 update check: an older app sees the card (face, bubble, build numbers, two buttons) before any other popup; 나중에 remembers
    # that build and the title's greetings follow; a build below `min` gets one button and the start button is covered
    b = p.chromium.launch(args=GL)
    REL = "{ build: 60, version: '1.0', min: 0, availableAt: '2026-01-01T00:00:00Z', url: 'itms-beta://beta.itunes.apple.com/v1/app/6828737098' }"
    def launch(build, extra=''):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(TIMER); pg.add_init_script(f'window.__DUSK_TEST__.onboard = true; window.__DUSK_TEST__.update = {{ build: {build}, info: Object.assign({REL}, {{{extra}}}) }}')
        pg.goto(URL); pg.wait_for_timeout(700); pg.evaluate(f'{A}.ready'); frames_wait(pg, 6)
        return pg, errs
    pg, errs = launch(57)
    soft = [pg.is_visible('#update'), pg.is_visible('#onboard'), pg.inner_text('#up-say'), pg.inner_text('#up-body'), pg.inner_text('#btn-update'), pg.is_visible('#btn-update-later')]
    pg.tap('#btn-update'); opened = pg.evaluate('window.__DUSK_TEST__.opened')
    pg.tap('#btn-update-later'); frames_wait(pg, 3)
    later = [pg.is_visible('#update'), pg.is_visible('#onboard'), pg.evaluate("localStorage.getItem('dusk-update-skip')")]
    pg.reload(); pg.wait_for_timeout(700); pg.evaluate(f'{A}.ready'); frames_wait(pg, 6)
    again = pg.is_visible('#update')
    pg.context.close()
    pg, errs2 = launch(57, 'min: 58')  # too old to play
    force = [pg.is_visible('#update'), pg.inner_text('#up-say'), pg.is_visible('#btn-update-later'), pg.is_visible('#btn-title')]
    pg.context.close()
    pg, errs3 = launch(60)  # up to date: straight to the usual greetings
    same = [pg.is_visible('#update'), pg.is_visible('#onboard')]
    pg.context.close()
    rec('S21', 'update check: an old build sees the card first, 업데이트 opens TestFlight, 나중에 remembers the build and lets onboarding through; below min only 업데이트; current build sees nothing',
        soft == [True, False, '새 버전이 나왔어!', soft[3], 'TestFlight에서 업데이트', True] and '60' in soft[3] and '57' in soft[3] and opened == 'itms-beta://beta.itunes.apple.com/v1/app/6828737098'
        and later == [False, True, '60'] and not again and force[0] and force[1] == '업데이트가 필요해!' and force[2] is False and force[3] is False
        and same == [False, True] and not errs and not errs2 and not errs3,
        f'soft={soft} opened={opened} later={later} again={again} force={force} same={same} errs={errs + errs2 + errs3}')
    b.close()
print('SUMMARY', sum(r[2] for r in res), '/', len(res))
