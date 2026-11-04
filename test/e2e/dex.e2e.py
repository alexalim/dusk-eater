# Layer: E2E — collection book in real Chromium: silhouettes, a swallow registers a find, the reward pays once.
# Usage: python3 test/e2e/dex.e2e.py www
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

def open_page(b, w=390, h=844):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.add_init_script('window.__DUSK_TEST__ = { fixedQuality: true };')
    pg.goto(URL); pg.evaluate(f'{A}.ready'); frames_wait(pg)
    return pg, errs

def reload(pg):
    pg.reload(); pg.evaluate(f'{A}.ready'); frames_wait(pg)

wallet = lambda pg: pg.evaluate(f'{A}.Store.wallet')

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    pg, errs = open_page(b)

    # X1 a fresh book: every card is a silhouette, no badge on the title button
    pg.tap('#btn-dex'); frames_wait(pg)
    cards = len(pg.query_selector_all('#dex .card')); hidden = len(pg.query_selector_all('#dex .card.hide'))
    n = pg.evaluate('window.DuskDex.ENTRIES.length')
    rec('X1', 'fresh book shows every entry as a ??? silhouette', cards == n and hidden == n and pg.inner_text('#dex-badge') == '', f'{hidden}/{cards} hidden of {n}')
    pg.tap('#btn-dex-back'); frames_wait(pg)

    # X2 swallowing a new kind in play registers it at once and says so on screen
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    kind = pg.evaluate(f'(() => {{ const o = {A}.s.objects.find(o => o.state === 0); o.state = 1; o.ft = 0.99; return o.type; }})()')
    frames_wait(pg, 4)
    toast = pg.inner_text('#dex-new')
    rec('X2', 'first swallow of a kind is saved to the book with a toast', kind in wallet(pg)['dex'] and '도감에 새로 등록' in toast, f'kind={kind} toast={toast!r}')

    # X3 the find survives the app being killed mid-run (saved on swallow, not at run end)
    reload(pg)
    rec('X3', 'find kept after a reload mid-run', kind in wallet(pg)['dex'] and pg.inner_text('#dex-badge') == '1', f'dex={wallet(pg)["dex"]}')

    # X4 tapping the found card pays the reward once; a second tap and a reload pay nothing more
    g0 = wallet(pg)['gems']
    pg.tap('#btn-dex'); frames_wait(pg)
    revealed = not pg.query_selector(f'.card[data-dex={kind}]').evaluate("e => e.classList.contains('hide')")
    pg.tap(f'.card[data-dex={kind}]'); frames_wait(pg)
    pg.tap(f'.card[data-dex={kind}]'); frames_wait(pg)
    g1 = wallet(pg)['gems']; reload(pg); g2 = wallet(pg)['gems']
    rec('X4', 'reward paid exactly once and kept', revealed and g1 == g0 + 10 and g2 == g1 and pg.inner_text('#dex-badge') == '', f'{g0} -> {g1} -> {g2}')

    # X5 tapping a silhouette pays nothing and gives a hint instead
    pg.tap('#btn-dex'); frames_wait(pg)
    other = pg.evaluate("document.querySelector('#dex .card.hide').dataset.dex")
    pg.tap(f'.card[data-dex={other}]'); frames_wait(pg)
    rec('X5', 'silhouette tap: no gems, a hint about where to look', wallet(pg)['gems'] == g2 and '꿀꺽' in pg.inner_text('#dex-msg'), pg.inner_text('#dex-msg'))
    rec('X0', 'no page errors', not errs, '; '.join(errs[:3]))
    b.close()

    # X6 small screen: the book scrolls down to its back button without sideways scroll
    b = p.chromium.launch(args=GL)
    pg2, _ = open_page(b, 375, 667)
    pg2.tap('#btn-dex'); frames_wait(pg2)
    sideways = pg2.evaluate("document.querySelector('#dex').scrollWidth > document.querySelector('#dex').clientWidth")
    pg2.query_selector('#btn-dex-back').scroll_into_view_if_needed(); pg2.tap('#btn-dex-back'); frames_wait(pg2)
    rec('X6', 'book fits 375x667 (scrolls), back returns to title', not sideways and pg2.is_visible('#title'), f'sideways={sideways}')
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
