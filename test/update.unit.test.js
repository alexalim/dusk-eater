// Layer: Unit — the update-check rules in www/update.js (this build vs release.json), no network, no DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../www/update.js');

const TF = 'itms-beta://beta.itunes.apple.com/v1/app/6828737098';
const info = (over) => Object.assign({ build: 54, version: '1.0', min: 0, availableAt: '2026-11-13T02:00:00Z', url: TF }, over);
const NOW = Date.parse('2026-11-13T03:00:00Z');

test('the newest build, already out for a while, is offered once; the same or a newer app is left alone', () => {
  assert.deepEqual(U.check(53, info(), NOW, 0), { kind: 'soft', latest: 54, url: TF });
  assert.equal(U.check(54, info(), NOW, 0).kind, 'none');
  assert.equal(U.check(55, info(), NOW, 0).kind, 'none');
  assert.equal(U.check('53', info(), NOW, 0).kind, 'soft', 'the App plugin hands the build over as a string');
});

test('before availableAt (Apple still processing) nothing is offered; after it, it is', () => {
  const early = Date.parse('2026-11-13T01:50:00Z');
  assert.equal(U.check(53, info(), early, 0).kind, 'none');
  assert.equal(U.check(53, info(), Date.parse('2026-11-13T02:00:00Z'), 0).kind, 'soft');
  assert.equal(U.check(53, info({ availableAt: undefined }), early, 0).kind, 'soft', 'no time in the file: offer at once');
});

test('"나중에" silences that build only; the next build asks again', () => {
  assert.equal(U.check(53, info(), NOW, 54).kind, 'none');
  assert.equal(U.check(53, info({ build: 55 }), NOW, 54).kind, 'soft');
  assert.equal(U.check(53, info(), NOW, '54').kind, 'none', 'localStorage gives the skip back as a string');
});

test('below min the update is required, even when skipped and even before availableAt', () => {
  const early = Date.parse('2026-11-13T01:50:00Z');
  assert.deepEqual(U.check(50, info({ min: 51 }), early, 54), { kind: 'force', latest: 54, url: TF });
  assert.equal(U.check(51, info({ min: 51 }), NOW, 0).kind, 'soft', 'min is the oldest build still allowed');
});

test('only store links are kept; a bad or missing file never blocks play', () => {
  assert.equal(U.check(53, info({ url: 'javascript:alert(1)' }), NOW, 0).url, '');
  assert.equal(U.check(53, info({ url: ' https://apps.apple.com/app/id6828737098 ' }), NOW, 0).url, 'https://apps.apple.com/app/id6828737098');
  assert.equal(U.check(53, info({ url: 'itms-apps://apps.apple.com/app/id6828737098' }), NOW, 0).url, 'itms-apps://apps.apple.com/app/id6828737098');
  assert.equal(U.check(53, null, NOW, 0).kind, 'none');
  assert.equal(U.check(53, {}, NOW, 0).kind, 'none');
  assert.equal(U.check(53, info({ build: 'soon' }), NOW, 0).kind, 'none');
  assert.equal(U.check(0, info(), NOW, 0).kind, 'none', 'no build of our own (browser demo): nothing to compare');
  assert.equal(U.check(NaN, info(), NOW, 0).kind, 'none');
});

test('the button names the store the link opens', () => {
  assert.equal(U.storeName(TF), 'TestFlight');
  assert.equal(U.storeName('itms-apps://apps.apple.com/app/id6828737098'), 'App Store');
  assert.equal(U.storeName('https://apps.apple.com/app/id6828737098'), 'App Store');
});
