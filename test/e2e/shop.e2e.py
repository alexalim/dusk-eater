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

def decline_continue(pg):
    # a run that did not clear its level offers a paid continue first; these checks want the plain end screen
    if pg.is_visible('#cont'): pg.tap('#btn-cont-no'); frames_wait(pg, 4)
    pg.evaluate("document.querySelector('#cheer').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)  # past the celebration step (a plain event: it may already have moved on by itself)  # the celebration step, then the details

def open_page(b, w=390, h=844, init=''):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.add_init_script('window.__DUSK_TEST__ = { fixedQuality: true, noEvents: true };' + init)
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
    santa = pg.inner_text('.item[data-skin=santa] .pr')
    hidden = [pg.inner_text(f'.item[data-skin={k}] .nm') for k in ('dawn', 'forest', 'sky')]
    lvl = [pg.inner_text(f'.item[data-skin={k}] .pr').strip() for k in ('candy', 'aurora', 'galaxy')]
    mint_pr = pg.inner_text('.item[data-skin=mint] .pr')
    rec('H1', 'shop lists 15 skins (santa locked to its event, 7 level skins with their level, 3 hidden as ???, paid ones priced in won and gems) + 3 gem packs, demo notice shown', pg.is_visible('#shop') and pg.is_visible('#shop-demo')
        and len(skins) == 15 and '이벤트' in santa and hidden == ['???'] * 3 and lvl == ['Lv.5', 'Lv.10', 'Lv.20'] and len(packs) == 3 and all('₩' in x for x in prices)
        and '₩' in mint_pr and '300' in mint_pr, str(prices) + f' mint={mint_pr!r}')

    # H2 buying a gem pack credits gems and saves them
    packs[0].tap(); frames_wait(pg, 5)
    w = wallet(pg); shown = pg.inner_text('#shop .gem-count')
    rec('H2', 'gem pack purchase credits 100 and persists', w['gems'] == 100 and shown.strip() == '100' and '완료' in pg.inner_text('#shop-msg'), f'wallet={w["gems"]} shown={shown!r}')

    # H3 a cancelled purchase changes nothing
    pg.evaluate('window.__DUSK_TEST__.cancelNextBuy = true')
    pg.query_selector_all('#shop-gems .item')[1].tap(); frames_wait(pg, 5)
    rec('H3', 'cancelled purchase leaves wallet unchanged', wallet(pg)['gems'] == 100 and pg.inner_text('#shop-msg') == '', '')

    # H4 buying a skin owns + equips it; renderer rim = skin color in shade, red when lit, for every skin
    pg.query_selector_all('#shop-skins .item')[1].tap(); frames_wait(pg)
    pg.tap('#skin-box-act'); frames_wait(pg, 5)
    w = wallet(pg)
    bought = w['equipped'] == 'mint' and 'mint' in w['owned']
    pg.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ owned: {A}.Shop.SKINS.filter(s => s.product || s.reward).map(s => s.id) }}))")
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
    rec('H6', 'boosts cost 70, give +20s and r=20, refunded after a mid-run kill', on == 2 and st == [30, 70, 110, 20]
        and after_kill['gems'] == 100 and after_kill['pending'] == 0, f'on={on} [gems,pending,dur,r]={st} after={after_kill["gems"]}/{after_kill["pending"]}')

    # H7 a finished boosted run keeps the boost spent; boosts do not carry over to the retry
    pg.tap('#btn-title'); frames_wait(pg)
    for k in range(2): pg.tap(f'.boost >> nth={k}'); frames_wait(pg)  # each tap re-renders the sheet
    pg.tap('#btn-go'); frames_wait(pg)
    pg.evaluate(f'{A}.skipTo(139.9)'); frames_wait(pg, 4)
    decline_continue(pg)
    w = wallet(pg); end = pg.is_visible('#end')
    pg.tap('#btn-retry'); frames_wait(pg)
    retry = pg.evaluate(f'[{A}.runDuration, {A}.s.player.r]')
    rec('H7', 'finished run: boost spent, retry is unboosted', end and w['gems'] == 30 and w['pending'] == 0 and retry == [90, 14], f'gems={w["gems"]} retry={retry}')

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

    # H10 iPhone 16 Pro (402x874): a two-line shop message must not run into the buttons below it (TestFlight feedback)
    b = p.chromium.launch(args=GL)
    pg3, _ = open_page(b, 402, 874)
    pg3.tap('#btn-shop-title'); frames_wait(pg3)
    pg3.evaluate("document.querySelector('#shop-msg').textContent = '결제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'"); frames_wait(pg3)
    gap = pg3.evaluate("""(() => { const els = [...document.querySelectorAll('#shop > *')].filter(e => e.offsetParent);
      const r = els.map(e => e.getBoundingClientRect()); let worst = 99;
      for (let i = 1; i < r.length; i++) worst = Math.min(worst, r[i].top - r[i - 1].bottom);
      const m = document.querySelector('#shop-msg'); return [Math.round(worst), m.scrollHeight - m.clientHeight]; })()""")
    rec('H10', 'shop blocks never overlap at 402x874 (no squeezed message)', gap[0] >= 8 and gap[1] <= 0, f'min gap={gap[0]}px msg overflow={gap[1]}px')
    b.close()

    # H11 a TestFlight build opens the Christmas event in November (outside its dates), marked as a preview;
    # the same date in a store build shows no event tab (S17 in qa.e2e.py covers the store dates)
    b = p.chromium.launch(args=GL)
    tabs = lambda pg: pg.evaluate("[...document.querySelectorAll('#map .tabs .chip')].map(e => e.dataset.l)")
    pg4, _ = open_page(b, init="window.__DUSK_TEST__.today = '2026-11-03'; window.__DUSK_TEST__.testBuild = true;")
    pg4.tap('#btn-title'); frames_wait(pg4); tf = tabs(pg4)
    pg4.tap('.tabs .chip[data-l=xmas]'); frames_wait(pg4); note = pg4.inner_text('.event-note')
    nodes = len(pg4.query_selector_all('.levels .node')); pg4.context.close()  # one WebGL page at a time under SwiftShader
    pg5, _ = open_page(b, init="window.__DUSK_TEST__.today = '2026-11-03';")
    pg5.tap('#btn-title'); frames_wait(pg5); store = tabs(pg5)
    rec('H11', 'TestFlight build previews the event in November; store build does not', tf == ['main', 'xmas'] and '테스트 미리보기' in note
        and nodes == 10 and store == [], f'testflight={tf} store={store} note={note!r}')
    b.close()

    # H12 tapping a skin opens its box (preview, description, price) and buys nothing; closing changes nothing;
    # the event skin opens too, with a button that cannot buy it
    b = p.chromium.launch(args=GL)
    pg6, errs6 = open_page(b)
    pg6.tap('#btn-shop-title'); frames_wait(pg6)
    pg6.tap('.item[data-skin=starry]'); frames_wait(pg6)
    box = [pg6.is_visible('#skin-box'), pg6.inner_text('#skin-box-name'), pg6.inner_text('#skin-box-desc'), pg6.inner_text('#skin-box-act')]
    w0 = wallet(pg6)
    pg6.tap('#skin-box-close'); frames_wait(pg6)
    closed = not pg6.is_visible('#skin-box') and wallet(pg6) == w0 and 'starry' not in (w0 or {}).get('owned', [])
    pg6.tap('.item[data-skin=santa]'); frames_wait(pg6)
    santa_act = pg6.inner_text('#skin-box-act'); santa_off = pg6.evaluate("document.querySelector('#skin-box-act').classList.contains('off')")
    pg6.mouse.click(5, 5); frames_wait(pg6)  # outside the box
    rec('H12', 'skin box shows description and price, buys nothing until its button; event skin cannot be bought',
        box[0] and box[1] == '별밤 그림자' and len(box[2]) > 10 and '구매하기' in box[3] and closed
        and '이벤트' in santa_act and santa_off and not pg6.is_visible('#skin-box') and not errs6, f'box={box} santa={santa_act!r}')

    # H13 a paid skin is also sold for gems: the box offers it (greyed while short), 300 gems buy and equip it
    pg6.tap('.item[data-skin=starry]'); frames_wait(pg6)
    short = pg6.evaluate("[document.querySelector('#skin-box-gems').innerText, document.querySelector('#skin-box-gems').classList.contains('off')]")
    pg6.tap('#skin-box-close'); frames_wait(pg6)
    pg6.evaluate(f"{A}.Store.update(Object.assign({{}}, {A}.Store.wallet, {{ gems: 1000 }}))"); frames_wait(pg6)
    pg6.tap('.item[data-skin=starry]'); frames_wait(pg6)
    gbtn = pg6.inner_text('#skin-box-gems'); pg6.tap('#skin-box-gems'); frames_wait(pg6, 4)
    w13 = wallet(pg6)
    rec('H13', 'a paid skin is also sold for gems: greyed while short, then 300 gems buy and equip it',
        '부족' in short[0] and short[1] and '300' in gbtn and w13['gems'] == 700 and 'starry' in w13['owned'] and w13['equipped'] == 'starry' and not errs6,
        f'short={short} btn={gbtn!r} gems={w13["gems"]} owned={w13["owned"]}')
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
