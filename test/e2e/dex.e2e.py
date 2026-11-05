# Layer: E2E — collection book and badges in real Chromium: silhouettes, a swallow registers a find, rewards pay once.
# Usage: python3 test/e2e/dex.e2e.py www
import sys, pathlib, json
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
    rec('X4', 'reward paid exactly once and kept', revealed and g1 == g0 + pg.evaluate('window.DuskDex.REWARD') and g2 == g1 and pg.inner_text('#dex-badge') == '', f'{g0} -> {g1} -> {g2}')

    # X5 tapping a silhouette pays nothing and gives a hint instead
    pg.tap('#btn-dex'); frames_wait(pg)
    other = pg.evaluate("document.querySelector('#dex .card.hide').dataset.dex")
    pg.tap(f'.card[data-dex={other}]'); frames_wait(pg)
    rec('X5', 'silhouette tap: no gems, a hint about where to look', wallet(pg)['gems'] == g2 and '꿀꺽' in pg.inner_text('#dex-msg'), pg.inner_text('#dex-msg'))
    # X7 swallowing the last missing kind of a set unlocks its hidden skin: toast, set bar, shop card all reveal it
    set1 = pg.evaluate('window.DuskDex.SETS[0]')
    pg.tap('#btn-dex-back'); frames_wait(pg)
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    last = pg.evaluate(f'(() => {{ const o = {A}.s.objects.find(o => o.state === 0 && !{A}.Store.wallet.dex.includes(o.type)); return o.type; }})()')
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ dex: {json.dumps(set1['entries'])}.filter(id => id !== '{last}') }}))")
    before = pg.evaluate(f"window.DuskDex.dueSkins({A}.Store.wallet).length")
    pg.evaluate(f'(() => {{ const o = {A}.s.objects.find(o => o.state === 0 && o.type === "{last}"); o.state = 1; o.ft = 0.99; }})()')
    frames_wait(pg, 4)
    toast = pg.inner_text('#dex-new'); owned = set1['skin'] in wallet(pg)['owned']
    reload(pg); pg.tap('#btn-dex'); frames_wait(pg)
    bar = pg.inner_text(f".dexset[data-set={set1['skin']}]")
    pg.tap('#btn-dex-back'); frames_wait(pg); pg.tap('#btn-shop-title'); frames_wait(pg)
    card = pg.inner_text(f".item[data-skin={set1['skin']}] .nm"); locked = pg.inner_text('.item[data-skin=sky] .nm')
    rec('X7', 'filling set 1 grants its hidden skin once; book bar and shop reveal it, other sets stay ???',
        before == 0 and owned and '히든 스킨' in toast and '모두 채웠어요' in bar and card != '???' and locked == '???',
        f'last={last} toast={toast!r} bar={bar!r} card={card!r} locked={locked!r}')
    # X8 the book is a window with map-set tabs: a tab shows only its maps; X closes; the level map has a way back
    pg.tap('#btn-shop-back') if pg.is_visible('#btn-shop-back') else None; frames_wait(pg)
    pg.tap('#btn-dex'); frames_wait(pg)
    on0 = pg.evaluate("[...document.querySelectorAll('.dexpane')].map(e => e.offsetParent !== null)")
    pg.tap('.dextab[data-tab="3"]'); frames_wait(pg)
    on3 = pg.evaluate("[...document.querySelectorAll('.dexpane')].map(e => e.offsetParent !== null)")
    xmas = pg.is_visible('.card[data-dex=reindeer]') and not pg.is_visible('.card[data-dex=cat]')
    pg.tap('#btn-dex-back'); frames_wait(pg); closed = pg.is_visible('#title')
    pg.tap('#btn-title'); frames_wait(pg); pg.tap('#btn-select-back'); frames_wait(pg)
    rec('X8', 'tabs switch map sets (event tab holds the event maps); X closes; level map has a back button to the title',
        on0 == [True, False, False, False] and on3 == [False, False, False, True] and xmas and closed and pg.is_visible('#title'),
        f'on0={on0} on3={on3} xmas={xmas} closed={closed}')
    # B1 a finished run feeds the lifetime records; crossing a threshold names the new badge on the end screen,
    # the title button counts it, and its gems are paid once from the badge window
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ stats: {{ eaten: 299 }} }}))")
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    pg.evaluate(f'(() => {{ const o = {A}.s.objects.find(o => o.state === 0); o.state = 1; o.ft = 0.99; }})()'); frames_wait(pg, 4)
    pg.evaluate(f'{A}.skipTo(119.99)'); frames_wait(pg, 8)
    note = pg.inner_text('#end-gems'); eaten = wallet(pg)['stats'].get('eaten', 0)
    reload(pg); count = pg.inner_text('#badges-badge'); g0 = wallet(pg)['gems']
    pg.tap('#btn-badges'); frames_wait(pg)
    pg.tap('.hex[data-badge="eater.0"]'); frames_wait(pg); pg.tap('.hex[data-badge="eater.0"]'); frames_wait(pg)
    g1 = wallet(pg)['gems']; locked = pg.inner_text('.hex[data-badge="hidden.1"]')
    pg.tap('#btn-badges-back'); frames_wait(pg)
    rec('B1', 'run end records progress and names the new badge; its gems pay once; hidden badges stay ???',
        '먹보 동' in note and eaten >= 300 and count != '' and g1 == g0 + 5 and locked == '?' and pg.is_visible('#title'),
        f'note={note!r} eaten={eaten} count={count!r} gems {g0}->{g1} locked={locked!r}')
    # L1 a finished run adds experience: the end screen shows the gain and a level-up note, the title chip shows the level
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ stats: Object.assign({{}}, {A}.Store.wallet.stats, {{ xp: 119 }}) }}))")
    g0 = wallet(pg)['gems']
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg)
    pg.evaluate(f'(() => {{ const o = {A}.s.objects.find(o => o.state === 0); o.state = 1; o.ft = 0.99; }})()'); frames_wait(pg, 4)
    pg.evaluate(f'{A}.skipTo(119.99)'); frames_wait(pg, 8)
    gain = pg.inner_text('#end-xp-gain'); lvl = pg.inner_text('#end-lv'); note = pg.inner_text('#end-gems')
    xp = wallet(pg)['stats']['xp']; g1 = wallet(pg)['gems']
    reload(pg); chip = pg.inner_text('#title-level')
    rec('L1', 'run experience shows on the end screen, levels up with its gems, and the title chip follows',
        xp >= 120 and '경험치' in gain and lvl == 'Lv.2' and '레벨 업' in note and g1 >= g0 + 10 and 'Lv.2' in chip,
        f'xp={xp} gain={gain!r} lvl={lvl!r} note={note!r} gems {g0}->{g1} chip={chip!r}')
    rec('X0', 'no page errors', not errs, '; '.join(errs[:3]))
    b.close()

    # X6 small screen: the book scrolls down to its back button without sideways scroll
    b = p.chromium.launch(args=GL)
    pg2, _ = open_page(b, 375, 667)
    pg2.tap('#btn-dex'); frames_wait(pg2)
    sideways = pg2.evaluate("document.querySelector('#dex').scrollWidth > document.querySelector('#dex').clientWidth")
    pg2.query_selector('#btn-dex-back').scroll_into_view_if_needed(); pg2.tap('#btn-dex-back'); frames_wait(pg2)
    rec('X6', 'book fits 375x667 (scrolls), back returns to title', not sideways and pg2.is_visible('#title'), f'sideways={sideways}')
    # T1 the title fits a small phone without scrolling: start, three menu tiles, account and info in the corners;
    # info explains what is stored and closes back to the title
    fits = pg2.evaluate("(() => { const t = document.querySelector('#title'); return t.scrollHeight <= t.clientHeight; })()")
    inview = all(pg2.evaluate(f"(() => {{ const r = document.querySelector('{q}').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }})()")
                 for q in ['#btn-title', '#btn-shop-title', '#btn-dex', '#btn-badges', '#btn-account', '#btn-info'])
    start_txt = pg2.inner_text('#btn-title')
    pg2.tap('#btn-info'); frames_wait(pg2); info = pg2.inner_text('#info')
    pg2.tap('#btn-info-back'); frames_wait(pg2)
    rec('T1', 'title fits 375x667 with every entry in view; info tells what is stored and closes',
        fits and inview and start_txt == '시작' and '서버에 저장' in info and '지울 수' in info and pg2.is_visible('#title'),
        f'fits={fits} inview={inview} start={start_txt!r}')
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
