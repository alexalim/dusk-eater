// Layer: Unit — the band table in www/sound.js (which players each region's tune names), no audio context.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DuskSound } = require('../www/sound.js');
const St = require('../www/stages.js');

const { TUNES, INST, BASS, LINES, DRUMS } = DuskSound.band;
const bands = Object.entries(TUNES).filter(([, t]) => !t.korean); // the hanok tune has its own scheduler

test('every map theme has its own tune', () => {
  for (const [theme, t] of Object.entries(St.THEMES)) assert.ok(TUNES[t.base || theme], theme); // a season map plays the tune of the map it is made of
});

test('every tune names players, a bass line and a kit that exist (a typo would stop the music on that map)', () => {
  for (const [name, t] of bands) {
    assert.ok(INST[t.lead], `${name}: lead ${t.lead}`);
    assert.ok(INST[t.keys], `${name}: keys ${t.keys}`);
    assert.ok(BASS[t.bass[0]] && LINES[t.bass[1]], `${name}: bass ${t.bass}`);
    assert.ok(DRUMS[t.drums], `${name}: drums ${t.drums}`);
    if (t.fill) assert.ok(INST[t.fill[0]] && Number.isInteger(t.fill[2]), `${name}: fill ${t.fill}`);
    assert.equal(t.prog.length, 4, `${name}: four bars`);
  }
});

test('chord and fill steps fit the bar: 16 steps, 12 in a waltz, and a waltz walks a waltz line', () => {
  for (const [name, t] of bands) {
    const steps = t.waltz ? 12 : 16;
    for (const s of [...(t.comp || []), ...(t.fill ? t.fill[1] : [])]) assert.ok(s >= 0 && s < steps, `${name}: step ${s}`);
    assert.equal(t.bass[1] === 'waltz', !!t.waltz, `${name}: bass line ${t.bass[1]}`);
    assert.equal(/waltz|carousel/.test(t.drums), !!t.waltz, `${name}: kit ${t.drums}`);
  }
});

test('a bass line gives a note or nothing on every step, and always starts the bar on the root', () => {
  const chord = [60, 64, 67, 71];
  for (const [name, line] of Object.entries(LINES)) {
    assert.equal(line(0, chord), 0, `${name} starts on the root`);
    for (let s = 0; s < 16; s++) { const v = line(s, chord); assert.ok(v === null || Number.isInteger(v), `${name} step ${s}: ${v}`); }
  }
});

test('the character voice: every word is syllables of a known vowel (or a short nasal hum), each a short, rising or falling pitch', () => {
  const { VOWELS, WORDS } = DuskSound.voice;
  for (const [name, w] of Object.entries(WORDS)) {
    assert.ok(w.length >= 1 && w.some(s => VOWELS[s[0]]), `${name} says a vowel`);
    for (const s of w) {
      if (s[0] === 'n' || s[0] === 'm') { assert.ok(s[1] > 0 && s[1] < 0.15, `${name}: hum ${s}`); continue; }
      assert.ok(VOWELS[s[0]], `${name}: vowel ${s[0]}`);
      assert.ok(s[1] > 0 && s[1] <= 0.4 && s[2] > 0.5 && s[2] < 2 && s[3] > 0.5 && s[3] < 2, `${name}: ${s}`);
    }
    assert.ok(w.reduce((a, s) => a + s[1], 0) < 0.6, `${name} stays a quick word`);
  }
});

test('say() remembers what was said even with no audio context (the game calls it the same way either way)', () => {
  DuskSound.sfx.say('wow'); DuskSound.sfx.say('nope');
  assert.equal(DuskSound.sfx.lastSaid.at(-1), 'wow');
});

test('recorded sounds: every effect and background track the code names has its file, and every map has a track', () => {
  const fs = require('node:fs'), path = require('node:path'), www = path.join(__dirname, '../www');
  const { SFX_FILES, BGM_LUFS, EAT_FILE } = DuskSound.files;
  for (const n of SFX_FILES) assert.ok(fs.existsSync(path.join(www, `audio/sfx/${n}.m4a`)), `sfx ${n}`);
  for (const n of Object.keys(BGM_LUFS)) assert.ok(fs.existsSync(path.join(www, `audio/bgm/bgm_${n}.m4a`)), `bgm ${n}`);
  for (const [theme, t] of Object.entries(St.THEMES)) assert.ok(BGM_LUFS[t.base || theme] !== undefined, `track for ${theme}`);
  for (const k of ['car', 'bus', 'tree', 'bench', 'building', 'cat', 'cow', 'gull', 'zombie']) assert.ok(SFX_FILES.includes(EAT_FILE(k)), `eat sound for ${k}`);
  for (const k of ['person', 'grandma', 'guard', 'boss']) assert.equal(EAT_FILE(k), 'eat_person', `a person's file for ${k}`);
  for (const w of Object.keys(DuskSound.voice.WORDS)) assert.ok(SFX_FILES.includes(`voice_${w}_1`), `voice file for ${w}`);
});

test('every effect still runs with no audio context (falls back quietly)', () => {
  const sfx = DuskSound.sfx;
  for (const k of ['tap', 'star', 'coin', 'level', 'lit', 'night', 'grow', 'hit', 'tick', 'spit', 'yuck', 'dash', 'parade', 'win', 'lose']) sfx[k]();
  sfx.gulp(0.8, 4); sfx.combo(3); sfx.shard('bolt'); sfx.rain(2); sfx.wind(2); sfx.voice('car'); sfx.voice('person');
});

test("Dusk's lines are babbled one syllable per Hangul syllable, on its own vowel, lifting at a ! or ?", () => {
  const { syllables, VOWELS } = DuskSound.voice;
  const s = syllables('퉤! 좀비가 날아갔어요');
  assert.equal(s.length, 9);
  assert.deepEqual(s.map(x => x.v).join(''), 'eoiaaaaoo'); // 퉤 좀 비 가 날 아 갔 어 요
  assert.ok(s[0].lift && !s[1].lift, 'the ! lifts the syllable before it');
  assert.ok(s[1].nasal && s[4].stop && !s[3].stop, 'ㅁ hums, ㄹ closes, an open 가 does neither');
  for (const x of syllables('가갸거겨고교구규그기개게괘궤귀긔')) assert.ok(VOWELS[x.v], x.v);
  DuskSound.sfx.speak('안녕?'); DuskSound.sfx.speak('abc');
  assert.equal(DuskSound.sfx.lastSpoken.at(-1), '안녕?'); // no Hangul, nothing to say
});
