// Update check: the app's own build number against the newest one the TestFlight workflow published (release.json on
// the repository's `release` branch, written after every successful upload). Pure rules only; index.html fetches the
// file, reads the build from the App plugin, shows the card and opens the store link.
(function (root) {
  'use strict';
  const RELEASE_URL = 'https://raw.githubusercontent.com/alexalim/dusk-eater/release/release.json';
  // Only links that can lead to TestFlight or the App Store are opened; anything else in the file is ignored.
  const STORE = /^(https:\/\/|itms-beta:\/\/|itms-apps:\/\/)/;

  // build = this app's CFBundleVersion; info = release.json's platform entry { build, version, min, availableAt, url };
  // now = Date or ms; skipped = the build the player already tapped "나중에" on.
  // Returns { kind, latest, url }: 'force' below `min` (play waits for the update), 'soft' when a newer build has been
  // out long enough for Apple to have processed it (availableAt) and was not skipped, else 'none'.
  function check(build, info, now, skipped) {
    const b = Math.floor(+build), latest = info ? Math.floor(+info.build) : 0;
    const url = info && typeof info.url === 'string' && STORE.test(info.url.trim()) ? info.url.trim() : '';
    if (!(b > 0) || !(latest > 0)) return { kind: 'none', latest: latest > 0 ? latest : 0, url };
    if (Math.floor(+info.min) > b) return { kind: 'force', latest, url };
    const at = info.availableAt ? Date.parse(info.availableAt) : 0;
    if (latest > b && !(+now < at) && Math.floor(+skipped) !== latest) return { kind: 'soft', latest, url };
    return { kind: 'none', latest, url };
  }

  // Where the link goes, for the button label.
  const storeName = url => (/^itms-beta:/.test(url) ? 'TestFlight' : 'App Store');

  const api = { RELEASE_URL, check, storeName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskUpdate = api;
})(this);
