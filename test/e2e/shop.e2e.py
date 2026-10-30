# Layer: E2E — shop flows in real Chromium against the browser demo store (no payment).
# Usage: python3 test/e2e/shop.e2e.py www
import sys, json, pathlib
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

def open_page(b, w=390, h=844, init=''):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.add_init_script('window.__DUSK_TEST__ = {};' + init)
    pg.goto(URL); pg.evaluate(f'{A}.ready'); frames_wait(pg)
    return pg, errs

def reload(pg):
    pg.reload(); pg.evaluate(f'{A}.ready'); frames_wait(pg)

wallet = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('dusk-wallet'))")

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    pg, errs = open_page(b)

    # H1 shop opens from the title, says it is a demo, lists skins and gem packs with prices
    pg.tap('#btn-shop-title'); frames_wait(pg)
    skins = pg.query_selector_all('#shop-skins .item'); packs = pg.query_selector_all('#shop-gems .item')
    prices = [e.inner_text() for e in pg.query_selector_all('#shop-gems .pr')]
    rec('H1', 'shop lists 5 skins + 3 gem packs, demo notice shown', pg.is_visible('#shop') and pg.is_visible('#shop-demo')
        and len(skins) == 5 and len(packs) == 3 and all('₩' in x for x in prices), str(prices))

    # H2 buying a gem pack credits gems and saves them
    packs[0].tap(); frames_wait(pg, 5)
    w = wallet(pg); shown = pg.inner_text('#shop .gem-count')
    rec('H2', 'gem pack purchase credits 100 and persists', w['gems'] == 100 and shown.strip() == '100' and '완료' in pg.inner_text('#shop-msg'), f'wallet={w["gems"]} shown={shown!r}')

    # H3 a cancelled purchase changes nothing
    pg.evaluate('window.__DUSK_TEST__.cancelNextBuy = true')
    pg.query_selector_all('#shop-gems .item')[1].tap(); frames_wait(pg, 5)
    rec('H3', 'cancelled purchase leaves wallet unchanged', wallet(pg)['gems'] == 100 and pg.inner_text('#shop-msg') == '', '')

    # H4 buying a skin owns + equips it; renderer rim = skin color in shade, red when lit, for every skin
    pg.query_selector_all('#shop-skins .item')[1].tap(); frames_wait(pg, 5)
    w = wallet(pg)
    bought = w['equipped'] == 'mint' and 'mint' in w['owned']
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ owned: {A}.Shop.SKINS.filter(s => s.product).map(s => s.id) }}))")
    pg.evaluate(f'{A}.start(0)'); frames_wait(pg); pg.evaluate(f'{A}.freeze()')
    rims = {}
    for sid in pg.evaluate(f'{A}.Shop.SKINS.map(s => s.id)'):
        pg.evaluate(f"{A}.Store.update({A}.Shop.equip({A}.Store.wallet, '{sid}'))")
        out = []
        for lit in (False, True):
            pg.evaluate(f'{A}.s.player.lit = {str(lit).lower()}'); frames_wait(pg, 2)
            out.append(pg.evaluate(f'{A}.R.debug.rimMat.color.getHex()'))
        rims[sid] = out
    expect = {s['id']: s['rim'] for s in pg.evaluate(f'{A}.Shop.SKINS')}
    ok = all(rims[k][0] == expect[k] and rims[k][1] == 0xff6b6b for k in rims)
    rec('H4', 'skin purchase equips; every skin keeps the red lit rim', bought and ok, json.dumps({k: [hex(a), hex(c)] for k, (a, c) in rims.items()}))

    # H5 a purchase the app died during (unfinished) is credited exactly once on the next launches
    pg.evaluate("localStorage.setItem('dusk-demo-unfinished', JSON.stringify([{productIdentifier: 'com.aspynlim.duskeater.gems.550', transactionId: 'killed-1'}]))")
    g0 = wallet(pg)['gems']; reload(pg); g1 = wallet(pg)['gems']; reload(pg); g2 = wallet(pg)['gems']
    rec('H5', 'unfinished purchase drained once after relaunch', g1 == g0 + 550 and g2 == g1, f'{g0} -> {g1} -> {g2}')

    # H6 boosts: picked on the sheet, paid at departure, applied to the run, refunded if the app dies mid-run
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ gems: 100 }}))")
    pg.tap('#btn-title'); frames_wait(pg)
    for k in range(2): pg.tap(f'.boost >> nth={k}'); frames_wait(pg)  # each tap re-renders the sheet
    on = len(pg.query_selector_all('.boost.on'))
    pg.tap('#btn-go'); frames_wait(pg)
    st = pg.evaluate(f'[{A}.Store.wallet.gems, {A}.Store.wallet.pending, {A}.runDuration, {A}.s.player.r]')
    reload(pg); after_kill = wallet(pg)
    rec('H6', 'boosts cost 70, give +20s and r=20, refunded after a mid-run kill', on == 2 and st == [30, 70, 140, 20]
        and after_kill['gems'] == 100 and after_kill['pending'] == 0, f'on={on} [gems,pending,dur,r]={st} after={after_kill["gems"]}/{after_kill["pending"]}')

    # H7 a finished boosted run keeps the boost spent; boosts do not carry over to the retry
    pg.tap('#btn-title'); frames_wait(pg)
    for k in range(2): pg.tap(f'.boost >> nth={k}'); frames_wait(pg)  # each tap re-renders the sheet
    pg.tap('#btn-go'); frames_wait(pg)
    pg.evaluate(f'{A}.skipTo(139.9)'); frames_wait(pg, 4)
    w = wallet(pg); end = pg.is_visible('#end')
    pg.tap('#btn-retry'); frames_wait(pg)
    retry = pg.evaluate(f'[{A}.runDuration, {A}.s.player.r]')
    rec('H7', 'finished run: boost spent, retry is unboosted', end and w['gems'] == 30 and w['pending'] == 0 and retry == [120, 14], f'gems={w["gems"]} retry={retry}')

    rec('H0', 'no page errors', not errs, '; '.join(errs[:3]))

    # H8 small screen: restore and back reachable, no sideways scroll
    b.close(); b = p.chromium.launch(args=GL)  # a second context in one SwiftShader browser times out on goto
    pg2, errs2 = open_page(b, 375, 667)
    pg2.tap('#btn-shop-title'); frames_wait(pg2)
    pg2.query_selector('#btn-restore').scroll_into_view_if_needed()
    box = pg2.query_selector('#btn-shop-back').bounding_box()
    sideways = pg2.evaluate("document.querySelector('#shop').scrollWidth > document.querySelector('#shop').clientWidth")
    pg2.query_selector('#btn-shop-back').scroll_into_view_if_needed(); pg2.tap('#btn-shop-back'); frames_wait(pg2)
    rec('H8', 'shop fits 375x667 (scrolls), back returns to title', box is not None and not sideways and pg2.is_visible('#title'), f'back={box}')
    # H9 the boost row must not push "출발" off a 375x667 screen
    pg2.tap('#btn-title'); frames_wait(pg2)
    go = pg2.query_selector('#btn-go').bounding_box()
    rec('H9', 'stage sheet with boosts keeps 출발 on screen at 375x667', go['y'] + go['height'] <= 667, f'bottom={go["y"] + go["height"]:.0f}')
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
