// Accounts: sign-in (Apple, Google, Kakao via Supabase Auth), cloud save, friends and rankings.
// The game never waits on this: everything is saved on the device first and synced when signed in.
// Sign-in runs in the iOS app only (the login page returns to the app's URL scheme); the browser
// demo shows the account screen but cannot sign in.
(function (root) {
  'use strict';
  const Y = root.DuskSync;
  const cap = root.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const Browser = cap && cap.Plugins && cap.Plugins.Browser;
  const App = cap && cap.Plugins && cap.Plugins.App;
  const Prefs = cap && cap.Plugins && cap.Plugins.Preferences;
  const REDIRECT = 'com.aspynlim.duskeater://auth-callback';
  const test = root.__DUSK_TEST__ || null;

  // Auth tokens live in iOS UserDefaults in the app (WebView storage can be purged).
  const tokenStore = {
    async getItem(k) { return Prefs ? (await Prefs.get({ key: k })).value : root.localStorage.getItem(k); },
    async setItem(k, v) { if (Prefs) await Prefs.set({ key: k, value: v }); else root.localStorage.setItem(k, v); },
    async removeItem(k) { if (Prefs) await Prefs.remove({ key: k }); else root.localStorage.removeItem(k); },
  };

  function makeClient() {
    if (test && test.supabase) return test.supabase; // E2E tests inject a fake backend
    const cfg = root.DuskConfig, lib = root.supabase;
    if (!cfg || !lib) return null;
    return lib.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storage: tokenStore },
    });
  }

  const client = makeClient();
  const listeners = [];
  const state = { user: null, profile: null, syncing: false, lastError: '' };
  let hooks = null; // { getSave, applySave } from the game
  const emit = () => listeners.forEach(f => f(state));

  async function loadProfile() {
    const { data } = await client.from('profiles').select('nickname, friend_code').eq('id', state.user.id).maybeSingle();
    state.profile = data ? { nickname: data.nickname, friendCode: data.friend_code } : null;
  }

  // Pull the account save, merge with the device, write both sides. Best scores go up in one batch.
  async function sync() {
    if (!state.user || state.syncing || !hooks) return false;
    state.syncing = true; state.lastError = ''; emit();
    try {
      const { data: row, error } = await client.from('progress').select('stars, best, wallet, updated_at').eq('user_id', state.user.id).maybeSingle();
      if (error) throw error;
      const account = row && { stars: row.stars, best: row.best, wallet: row.wallet, updatedAt: Date.parse(row.updated_at) || 0 };
      const merged = Y.merge(hooks.getSave(), account);
      const ups = Y.newBests(merged, account);
      if (ups.length) {
        const r = await client.rpc('submit_scores', { p_scores: Object.fromEntries(ups.map(u => [u.level, u.score])) });
        if (r.error) throw r.error;
      }
      const w = await client.from('progress').upsert({ user_id: state.user.id, stars: merged.stars, best: merged.best,
        wallet: merged.wallet, updated_at: new Date(merged.updatedAt || Date.now()).toISOString() });
      if (w.error) throw w.error;
      await hooks.applySave(merged, Date.now());
      return true;
    } catch (e) {
      state.lastError = String((e && e.message) || e);
      return false;
    } finally {
      state.syncing = false; emit();
    }
  }

  async function onSession(session) {
    const was = state.user && state.user.id;
    state.user = session ? { id: session.user.id } : null;
    if (!state.user) { state.profile = null; emit(); return; }
    if (was !== state.user.id) { await loadProfile(); emit(); await sync(); }
  }

  const api = {
    get available() { return !!client; },
    get canSignIn() { return !!client && (native || !!(test && test.supabase)); },
    get user() { return state.user; },
    get profile() { return state.profile; },
    get syncing() { return state.syncing; },
    get lastError() { return state.lastError; },
    onChange(f) { listeners.push(f); },

    async init(h) {
      hooks = h;
      if (!client) return;
      client.auth.onAuthStateChange((_event, session) => { onSession(session); });
      if (native && App) {
        App.addListener('appUrlOpen', async ({ url }) => {
          if (!url || !url.startsWith(REDIRECT)) return;
          const code = new URL(url).searchParams.get('code');
          if (Browser) Browser.close().catch(() => {});
          if (code) {
            const { error } = await client.auth.exchangeCodeForSession(code);
            if (error) { state.lastError = error.message; emit(); }
          }
        });
      }
      const { data } = await client.auth.getSession();
      await onSession(data && data.session);
    },

    // provider: 'apple' | 'google' | 'kakao'
    async signIn(provider) {
      if (!api.canSignIn) return false;
      const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: REDIRECT, skipBrowserRedirect: true } });
      if (error) { state.lastError = error.message; emit(); return false; }
      if (Browser) await Browser.open({ url: data.url, presentationStyle: 'popover' });
      return true;
    },

    async signOut() { if (client) await client.auth.signOut(); await onSession(null); },

    async setNickname(name) {
      const nickname = Y.cleanNickname(name);
      if (!state.user || !nickname) return false;
      const { error } = await client.from('profiles').update({ nickname }).eq('id', state.user.id);
      if (error) return false;
      state.profile = Object.assign({}, state.profile, { nickname }); emit();
      return true;
    },

    // Resolves to the friend's nickname, or null for an unknown or own code.
    async addFriend(code) {
      if (!state.user || !Y.isFriendCode(code)) return null;
      const { data, error } = await client.rpc('add_friend', { p_code: Y.cleanCode(code) });
      return error ? null : data;
    },

    // scope: 'friends' | 'all' → [{ nickname, score, is_me }]
    async ranking(levelId, scope) {
      if (!state.user) return [];
      const { data, error } = await client.rpc(scope === 'all' ? 'top_ranking' : 'friend_ranking', { p_level: levelId });
      return error ? [] : data || [];
    },

    // Removes the account and everything on the server; the device keeps playing with its local save.
    async deleteAccount() {
      if (!state.user) return false;
      const { error } = await client.rpc('delete_me');
      if (error) { state.lastError = error.message; emit(); return false; }
      await api.signOut();
      return true;
    },

    sync,
  };
  root.DuskAccount = api;
})(this);
