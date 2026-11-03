# Layer: E2E — account flows in real Chromium against an in-memory fake of the Supabase client
# (same call shapes as supabase-js: auth.*, from().select/eq/maybeSingle/update/upsert, rpc).
# The real server's row-level security is covered separately by supabase/tests/rls_check.sql.
# Usage: python3 test/e2e/account.e2e.py www
import sys, json, pathlib
from playwright.sync_api import sync_playwright
www = pathlib.Path(sys.argv[1]).resolve()
URL = (www / 'index.html').as_uri()
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
A = 'window.__DUSK_TEST__.api'
res = []
def rec(sid, name, ok, detail=''):
    res.append(ok); print(f"{'PASS' if ok else 'FAIL'} {sid} {name} :: {detail}", flush=True)

FAKE = r'''
window.__fakeDb = { progress: null, profile: { nickname: '그림자', friend_code: 'ABC123' }, scores: {}, calls: [],
  friends: { 'F00D42': '달빛' } };
const db = window.__fakeDb;
let session = null, cb = null;
const ok = data => Promise.resolve({ data, error: null });
const q = table => {
  const b = { _table: table, _op: 'select', _row: null,
    select() { return b; }, eq() { return b; },
    maybeSingle() { return ok(table === 'progress' ? db.progress : { nickname: db.profile.nickname, friend_code: db.profile.friend_code }); },
    update(row) { b._op = 'update'; b._row = row; return b; },
    upsert(row) { db.calls.push(['upsert', table]); db.progress = row; return ok(null); },
    then(res, rej) { if (b._op === 'update' && table === 'profiles') Object.assign(db.profile, b._row); return ok(null).then(res, rej); },
  };
  return b;
};
window.__DUSK_TEST__.supabase = {
  auth: {
    getSession: () => ok({ session }),
    onAuthStateChange(f) { cb = f; return { data: { subscription: { unsubscribe() {} } } }; },
    signInWithOAuth({ provider }) { db.calls.push(['signIn', provider]); session = { user: { id: 'u1' } };
      setTimeout(() => cb && cb('SIGNED_IN', session), 0); return ok({ url: 'about:blank' }); },
    signOut() { session = null; setTimeout(() => cb && cb('SIGNED_OUT', null), 0); return ok(null); },
    exchangeCodeForSession: () => ok(null),
  },
  from: q,
  rpc(name, args) {
    db.calls.push(['rpc', name]);
    if (name === 'submit_scores') { for (const [k, v] of Object.entries(args.p_scores)) db.scores[k] = Math.max(db.scores[k] || 0, v); return ok(null); }
    if (name === 'add_friend') return ok(db.friends[args.p_code] || null);
    if (name === 'friend_ranking' || name === 'top_ranking')
      return ok([{ nickname: '달빛', score: 9000, is_me: false }].concat(db.scores[args.p_level] ? [{ nickname: db.profile.nickname, score: db.scores[args.p_level], is_me: true }] : [])
        .sort((a, b) => b.score - a.score));
    if (name === 'delete_me') { db.deleted = true; return ok(null); }
    return ok(null);
  },
};
'''

def frames_wait(pg, n=3):
    pg.evaluate(f'new Promise(r => {{ let k = {n}; const f = () => --k <= 0 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }})')
def tap(pg, sel):
    pg.evaluate(f"document.querySelector({json.dumps(sel)}).dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)
def settle(pg, ms=400):
    pg.wait_for_timeout(ms); frames_wait(pg, 2)

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    pg = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    # this device already played three levels and has 120 gems; the account (another phone) has level 4, 300 gems and a skin
    pg.add_init_script("window.__DUSK_TEST__ = { fixedQuality: true };" + FAKE + """
      localStorage.setItem('dusk-stars', JSON.stringify({ L1: 3, L2: 1, L3: 2 }));
      localStorage.setItem('dusk-best', JSON.stringify({ L1: 2500, L2: 900, L3: 1500 }));
      localStorage.setItem('dusk-wallet', JSON.stringify({ gems: 120, owned: [], equipped: 'night', credited: [], pending: 0 }));
      window.__fakeDb.progress = { stars: { L2: 3, L4: 1 }, best: { L2: 1800, L4: 700 },
        wallet: { gems: 300, owned: ['mint'], equipped: 'mint', credited: ['t-old'], pending: 0 }, updated_at: '2026-10-01T00:00:00Z' };""")
    pg.goto(URL); pg.evaluate(f'{A}.ready')

    # C1 signed out: three login buttons, Apple first, and a note that playing needs no account
    tap(pg, '#btn-account')
    btns = pg.evaluate("[...document.querySelectorAll('#account .login')].map(e => e.dataset.p)")
    rec('C1', 'signed-out account screen: Apple, Google, Kakao (Apple first) + play-without-login note', btns == ['apple', 'google', 'kakao']
        and '로그인하지 않아도' in pg.inner_text('#account-body'), str(btns))

    # C2 sign in with Kakao -> first sync merges both sides and uploads bests in one batch
    tap(pg, '#account .login.kakao'); settle(pg, 800)
    db = pg.evaluate('window.__fakeDb')
    local_stars = pg.evaluate("JSON.parse(localStorage.getItem('dusk-stars'))")
    wallet = pg.evaluate("JSON.parse(localStorage.getItem('dusk-wallet'))")
    batches = [c for c in db['calls'] if c == ['rpc', 'submit_scores']]
    rec('C2', 'sign-in syncs: stars max-merged, first-link gems keep the larger, skins united, bests in one call',
        ['signIn', 'kakao'] in db['calls'] and local_stars == {'L1': 3, 'L2': 3, 'L3': 2, 'L4': 1}
        and wallet['gems'] == 300 and 'mint' in wallet['owned'] and db['progress']['stars'] == local_stars
        and db['scores'] == {'L1': 2500, 'L3': 1500} and len(batches) == 1,
        f'stars={local_stars} gems={wallet["gems"]} owned={wallet["owned"]} scores={db["scores"]} batches={len(batches)}')

    # C3 profile: code shown, nickname saved, friend added by code (lower-case ok), bad code refused
    code = pg.inner_text('#my-code')
    pg.fill('#nick', '  밤산책  '); tap(pg, '#btn-nick'); settle(pg)
    nick = pg.evaluate('window.__fakeDb.profile.nickname'); m1 = pg.inner_text('#account-msg')
    pg.fill('#friend-code', 'f00d42'); tap(pg, '#btn-friend'); settle(pg); m2 = pg.inner_text('#account-msg')
    pg.fill('#friend-code', 'zzzzzz'); tap(pg, '#btn-friend'); settle(pg); m3 = pg.inner_text('#account-msg')
    rec('C3', 'friend code shown, nickname trimmed and saved, friend added by code, bad code refused',
        code == 'ABC123' and nick == '밤산책' and '바꿨' in m1 and '달빛' in m2 and '찾지 못했' in m3, f'nick={nick!r} msgs={[m1, m2, m3]}')

    # C4 ranking: a chip on the level sheet when signed in, friends list with me highlighted
    tap(pg, '#btn-account-back'); tap(pg, '#btn-title'); settle(pg)
    pg.evaluate("document.querySelector('.levels .node[data-i=\"0\"]').dispatchEvent(new PointerEvent('pointerup'))"); frames_wait(pg, 3)
    chip = pg.query_selector('#btn-rank') is not None
    tap(pg, '#btn-rank'); settle(pg)
    rows = pg.evaluate("[...document.querySelectorAll('#rank-list li')].map(li => [li.innerText.replace(/\\s+/g, ' '), li.className])")
    rec('C4', 'ranking chip on the sheet; friend ranking lists scores with me highlighted', chip and len(rows) == 2
        and rows[0][0].startswith('1. 달빛') and rows[1][1] == 'me' and '2,500' in rows[1][0], str(rows))

    # C5 finishing a run saves to the account by itself (checks that the save is sent, not its content)
    tap(pg, '#btn-rank-back'); pg.evaluate(f'{A}.start(0)'); frames_wait(pg, 2)
    pg.evaluate(f"(() => {{ {A}.s.stats.score = 2600; }})()")
    before = len(pg.evaluate('window.__fakeDb.calls'))
    pg.evaluate(f'{A}.skipTo({A}.runDuration - 0.01)'); frames_wait(pg, 8); settle(pg, 800)
    db = pg.evaluate('window.__fakeDb')
    rec('C5', 'a finished run syncs on its own', len(db['calls']) > before and db['progress'] is not None,
        f'calls after run: {db["calls"][before:]}')

    # C6 delete: first tap asks, second deletes and signs out; this device keeps its progress
    pg.evaluate("document.querySelector('#btn-account').dispatchEvent(new PointerEvent('pointerup'))"); settle(pg)
    tap(pg, '#btn-delete'); asked = '되돌릴 수 없어요' in pg.inner_text('#account-body') and not pg.evaluate('!!window.__fakeDb.deleted')
    tap(pg, '#btn-delete'); settle(pg, 600)
    gone = pg.evaluate('!!window.__fakeDb.deleted'); signed_out = pg.query_selector('#account .login.apple') is not None
    kept = pg.evaluate("JSON.parse(localStorage.getItem('dusk-stars'))").get('L4') == 1
    rec('C6', 'account deletion asks once, then deletes, signs out and keeps device progress', asked and gone and signed_out and kept,
        f'asked={asked} deleted={gone} signed_out={signed_out} kept={kept}')
    rec('C0', 'no page errors', not errs, '; '.join(errs[:3]))
    b.close()

    # C7 browser demo (no app, no fake backend): explains that sign-in is in the app
    b = p.chromium.launch(args=GL)
    pg = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    pg.add_init_script('window.__DUSK_TEST__ = { fixedQuality: true };')
    pg.goto(URL); pg.evaluate(f'{A}.ready'); tap(pg, '#btn-account')
    rec('C7', 'browser demo: account screen explains sign-in is in the app, no login buttons',
        '앱에서' in pg.inner_text('#account-body') and pg.query_selector('#account .login') is None, pg.inner_text('#account-body')[:40])
    b.close()

print(f'{sum(res)}/{len(res)} passed')
sys.exit(0 if all(res) else 1)
