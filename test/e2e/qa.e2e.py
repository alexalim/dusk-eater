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
TIMER = '''window.__DUSK_TEST__ = {}; window.__ft = [];
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
def frames_wait(pg, n=3):
    pg.evaluate(f'new Promise(r => {{ let k = {n}; const f = () => --k <= 0 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }})')
with sync_playwright() as p:
    # S1 flow: title -> select, harbor locked, locked card ignores taps
    b, pg, errs = page(p)
    t = pg.is_visible('#title')
    pg.tap('#btn-title'); frames_wait(pg)
    nodes = pg.query_selector_all('.node')
    locked = [n.get_attribute('class') for n in nodes]
    nodes[1].tap(); frames_wait(pg)
    still = pg.is_visible('#select'); go_locked = pg.query_selector('#btn-go')
    sheet = pg.evaluate("document.querySelector('#sheet').textContent")
    rec('S1', 'title->map, harbor node locked, locked node shows no start', t and 'locked' in locked[1] and 'locked' not in locked[0] and still and go_locked is None and '별 1개' in sheet, str(locked))
    # S2 touch drag moves the player
    pg.query_selector_all('.node')[0].tap(); frames_wait(pg); pg.tap('#btn-go'); frames_wait(pg)
    x0 = pg.evaluate(f'{A}.s.player.x')
    cdp = pg.context.new_cdp_session(pg)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 200, 'y': 500}]})
    for i in range(1, 30):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 200 + i * 3, 'y': 500}]})
        pg.wait_for_timeout(16)
    frames_wait(pg)
    x1 = pg.evaluate(f'{A}.s.player.x')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    frames_wait(pg, 14)
    v_after = pg.evaluate(f'Math.hypot({A}.s.player.vx, {A}.s.player.vy)')
    rec('S2', 'touch drag moves right, release stops', x1 - x0 > 30 and v_after < 5, f'dx={x1-x0:.0f} v_after={v_after:.1f}')
    # S10 spawn state for several rounds of each stage
    lit = []
    for si in (0, 1):
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
    # S3 round end: stars + goal list + next button rule
    pg.evaluate(f'{A}.skipTo(119.9)'); frames_wait(pg)
    end_vis = pg.is_visible('#end'); goals = len(pg.query_selector_all('#end-goals > div'))
    stars = pg.evaluate("JSON.parse(localStorage.getItem('dusk-stars') || '{}')")
    nxt = pg.is_visible('#btn-next')
    rec('S3', 'end screen, goals listed, stars saved, next hidden w/o star', end_vis and goals == 3 and 'town' in stars and nxt == (stars['town'] >= 1), f'stars={stars} next={nxt}')
    # S6 memory: restart 12 times
    info = lambda: pg.evaluate(f'(() => {{ const m = {A}.R.debug.renderer.info.memory; return [m.geometries, m.textures]; }})()')
    [pg.evaluate(f'{A}.start({i % 2})') or frames_wait(pg) for i in range(4)]; pg.evaluate(f'{A}.start(1)'); frames_wait(pg); m0 = info()
    for i in range(12):
        pg.evaluate(f'{A}.start({i % 2})'); frames_wait(pg)
    pg.evaluate(f'{A}.start(1)'); frames_wait(pg); m1 = info()
    rec('S6', 'no GPU memory growth over 12 restarts', m1[0] <= m0[0] + 2 and m1[1] <= m0[1], f'geo/tex before={m0} after={m1}')
    rec('S0', 'no page errors (iPhone 390x844)', not errs, '; '.join(errs)[:200])
    b.close()

    # S4 unlock via saved star
    b, pg, errs = page(p, storage={'town': 1})
    pg.tap('#btn-title'); frames_wait(pg)
    sel0 = pg.evaluate("document.querySelector('.node.sel').dataset.i")
    pg.query_selector_all('.node')[1].tap(); frames_wait(pg); pg.tap('#btn-go'); frames_wait(pg)
    rec('S4', 'harbor opens after 1 town star, map preselects it', sel0 == '1' and pg.evaluate(f'{A}.s.state') == 'play' and pg.evaluate("document.querySelector('#goals').textContent").find('배') >= 0)
    # S7/S11 frame cost: early, late-big, night transition
    def stats(setup):
        pg.evaluate(setup); frames_wait(pg, 2)
        calls, tris = pg.evaluate(f'(() => {{ const i = {A}.R.debug.renderer.info.render; return [i.calls, i.triangles]; }})()')
        pg.evaluate(f'(() => {{ const r = {A}.R.debug.renderer; r.__render = r.render; r.render = () => {{}}; window.__ft = []; }})()')
        frames_wait(pg, 120)
        ft = sorted(pg.evaluate('window.__ft'))
        pg.evaluate(f'(() => {{ const r = {A}.R.debug.renderer; r.render = r.__render; }})()')
        return calls, tris, statistics.median(ft), ft[int(len(ft) * .95)]
    for si in (0, 1):
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
        pg.evaluate(f'{A}.start(1)'); frames_wait(pg)
        pg.screenshot(path=str(out / f'layout-{w}x{h}-play.png'))
        ov = pg.evaluate('document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight')
        hud = pg.evaluate("(() => { const r = document.querySelector('#hud').getBoundingClientRect(); return [Math.round(r.height), innerHeight]; })()")
        pg.evaluate(f'{A}.skipTo(119.9)'); frames_wait(pg)
        pg.screenshot(path=str(out / f'layout-{w}x{h}-end.png'))
        pg.evaluate("document.querySelector('#btn-select').scrollIntoView({block: 'nearest'})"); frames_wait(pg)
        fits = pg.evaluate("(() => { const b = document.querySelector('#btn-select').getBoundingClientRect(); return b.bottom <= innerHeight + 1 && b.top >= -1; })()")
        rec('S8', f'layout {w}x{h}', not ov and fits, f'scroll-overflow={ov} hud_h/screen={hud} end-buttons-fit={fits}')
        b.close()

    # S9 rendered shadow vs rule polygons, pixel by pixel
    b, pg, errs = page(p)
    for si, sec in [(0, 12), (0, 55), (0, 95), (1, 30), (1, 95)]:
        pg.evaluate(f'{A}.start({si}); {A}.skipTo({sec})'); frames_wait(pg, 2); pg.evaluate(f'{A}.freeze()'); frames_wait(pg, 2)
        pts = pg.evaluate('''(() => {
          const A = window.__DUSK_TEST__.api, C = window.DuskCore, s = A.s, T = window.THREE;
          const { camera, scene } = A.R.debug;
          const sun = C.sunState(s.phase.dayT);
          const sh = s.buildings.filter(b => b.state === 0).map(b => C.shadowPolygon(b, sun));
          const things = s.objects.filter(o => o.state === 0).concat(s.guards);
          const ray = new T.Raycaster(), out = [];
          for (let i = 0; i < 4000 && out.length < 500; i++) {
            const x = s.player.x + (Math.random() - .5) * 700, y = s.player.y + (Math.random() - .5) * 1400;
            if (things.some(o => Math.hypot(o.x - x, o.y - y) < o.r * 3 + 6)) continue;
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
            if (sx < 4 || sx > innerWidth - 4 || sy < 200 || sy > innerHeight - 4) continue;
            ray.setFromCamera({ x: p.x, y: p.y }, camera);
            const hit = ray.intersectObjects(scene.children, true).find(h => h.object.visible && !h.object.material.transparent);
            if (!hit || !hit.object.userData.ground) continue;
            out.push([sx, sy, v, hit.object.geometry.type, inBeam, ed]);
          }
          return out;
        })()''')
        shot = out / f'pix-{si}-{sec}.png'; pg.screenshot(path=str(shot))
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
        thr = {kd: (statistics.median([l for l, v in a if not v] or [0]) + statistics.median([l for l, v in a if v] or [0])) / 2 for kd, a in by.items()}
        bad = [(v, ib, ed) for l, v, kd, ib, ed in raw if (l < thr[kd]) != v]
        print('   mismatches:', len(bad), '| rule-shade-but-bright', sum(1 for v, ib, ed in bad if v), '| rule-lit-but-dark', sum(1 for v, ib, ed in bad if not v),
              '| in-beam', sum(1 for b in bad if b[1]), '| edge-dist', sorted(b[2] for b in bad))
        rec('S9', f'shadow pixels match rule stage{si} t={sec}s', rate >= 0.97, f'{rate*100:.1f}% of {total} pts; ' + ' | '.join(det))
    b.close()
print('SUMMARY', sum(r[2] for r in res), '/', len(res))
