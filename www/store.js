// Store adapter: App Store purchases + durable storage in the iOS app, a no-payment demo in a browser.
// Consumable order matters: credit gems -> save -> only then tell StoreKit the transaction is finished.
// If the app dies in between, the transaction stays unfinished and is credited again (once) on next launch.
(function (root) {
  'use strict';
  const S = root.DuskShop;
  const cap = root.Capacitor;
  const IAP = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.NativePurchases;
  const Prefs = cap && cap.Plugins && cap.Plugins.Preferences;

  // Key-value storage. The app uses iOS UserDefaults (localStorage in a web view can be purged by iOS).
  const kv = {
    async get(key) {
      try {
        if (Prefs) { const { value } = await Prefs.get({ key }); return value ? JSON.parse(value) : null; }
        const v = localStorage.getItem(key); return v ? JSON.parse(v) : null;
      } catch { return null; }
    },
    async set(key, v) {
      try {
        if (Prefs) await Prefs.set({ key, value: JSON.stringify(v) });
        else localStorage.setItem(key, JSON.stringify(v));
      } catch { /* storage unavailable: keep playing */ }
    },
  };

  const WALLET = 'dusk-wallet';
  const listeners = [];
  let wallet = S.emptyWallet();
  let prices = {}; // product id -> localized price string

  async function commit(w) {
    wallet = w;
    await kv.set(WALLET, w);
    listeners.forEach(f => f(w));
  }

  // ---------- App Store ----------
  async function handleTransaction(tx) {
    if (!tx || !tx.transactionId) return;
    await commit(S.creditTransaction(wallet, tx));
    if (tx.needsFinish) { // set because capacitor.config turns autoFinishTransactions off
      try { await IAP.finishTransaction({ transactionId: tx.transactionId }); } catch (e) { console.warn('finish failed', e); }
    }
  }

  async function refreshEntitlements() {
    const { purchases } = await IAP.getPurchases({ onlyCurrentEntitlements: true });
    await commit(S.applyEntitlements(wallet, purchases));
  }

  const native = {
    demo: false,
    async init() {
      const { products } = await IAP.getProducts({ productIdentifiers: S.allProducts(), productType: 'inapp' });
      prices = Object.fromEntries(products.map(p => [p.identifier, p.priceString]));
      const { transactions } = await IAP.getUnfinishedTransactions();
      for (const tx of transactions) await handleTransaction(tx);
      IAP.addListener('transactionUpdated', tx => { handleTransaction(tx); }); // interrupted buys, Ask to Buy
      await refreshEntitlements();
    },
    async buy(product) {
      try {
        const tx = await IAP.purchaseProduct({ productIdentifier: product, productType: 'inapp', quantity: 1 });
        await handleTransaction(tx);
        return { ok: true };
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (/cancel/i.test(msg)) return { cancelled: true };
        if (/pending/i.test(msg)) return { pending: true }; // Ask to Buy: arrives later via transactionUpdated
        return { error: msg };
      }
    },
    async restore() {
      await IAP.restorePurchases();
      await refreshEntitlements();
    },
  };

  // ---------- browser demo: no payment ever happens ----------
  // Tests can queue a "purchase the app was killed during" under dusk-demo-unfinished.
  const demo = {
    demo: true,
    async init() {
      const queued = (await kv.get('dusk-demo-unfinished')) || [];
      for (const tx of queued) await commit(S.creditTransaction(wallet, tx));
      await kv.set('dusk-demo-unfinished', []);
    },
    async buy(product) {
      if (root.__DUSK_TEST__ && root.__DUSK_TEST__.cancelNextBuy) { root.__DUSK_TEST__.cancelNextBuy = false; return { cancelled: true }; }
      await commit(S.creditTransaction(wallet, { productIdentifier: product, transactionId: 'demo-' + Date.now() + Math.random() }));
      return { ok: true };
    },
    async restore() { /* demo purchases live in the saved wallet already */ },
  };

  const impl = IAP ? native : demo;

  const api = {
    kv,
    get demo() { return impl.demo; },
    get wallet() { return wallet; },
    price(product) {
      const item = S.SKINS.find(s => s.product === product) || S.GEM_PACKS.find(p => p.product === product);
      return prices[product] || (impl.demo && item ? item.price : null);
    },
    onChange(f) { listeners.push(f); },
    async init() {
      wallet = S.refundPending(S.normalize(await kv.get(WALLET))); // a run cut short gives its boost gems back
      await commit(wallet);
      try { await impl.init(); } catch (e) { console.warn('store init failed', e); return false; }
      return true;
    },
    buy: product => impl.buy(product),
    async restore() {
      try { await impl.restore(); return true; } catch (e) { console.warn('restore failed', e); return false; }
    },
    // Wallet changes that are not purchases (equip, boosts, star rewards).
    update: w => commit(w),
  };
  root.DuskStore = api;
})(this);
