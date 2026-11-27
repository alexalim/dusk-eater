// Sound: every effect, the character's voice and a background track per map are files (www/audio; sources in
// audio/LICENSES.md) played through Web Audio. Nothing is synthesized: a file that has not loaded, or cannot (a file://
// page, a decode error), is silent. Effects and music each have an on/off switch the game saves. iOS only lets audio start inside a tap,
// so the first pointerdown anywhere unlocks it.
(function (root) {
  'use strict';

  let ctx = null, master = null, sfxBus = null, musicBus = null;
  const on = { sfx: true, music: true };

  function init() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = on.sfx ? 0.6 : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = on.music ? 0.3 : 0; musicBus.connect(master);
    for (const name of SFX_FILES) load(`audio/sfx/${name}.m4a`); // the effects are small: all of them, once
    return ctx;
  }

  // Recorded sounds. A buffer is fetched and decoded once; until then (or if it fails) the sound is skipped.
  // A file:// page (the test runs) cannot fetch, so no file is tried there and nothing is logged.
  const SFX_FILES = ['coin', 'combo', 'dash', 'eat_balloon', 'eat_bicycle', 'eat_boat', 'eat_building', 'eat_bus', 'eat_car',
    'eat_carousel', 'eat_fountain', 'eat_metal', 'eat_plant', 'eat_pop', 'eat_reindeer', 'eat_soft', 'eat_stone', 'eat_wood',
    'grow', 'gulp_big', 'gulp_small', 'hit', 'level_up', 'lose', 'night', 'parade', 'rain', 'shard', 'spit', 'star',
    'sunlight', 'tap', 'tick', 'win', 'wind', 'yuck',
    'eat_person_high', 'eat_person_low', 'eat_cat', 'eat_chicken', 'eat_sheep', 'eat_cow', 'eat_camel', 'eat_gull', 'eat_zombie',
    ...['nyam', 'umm', 'wow', 'yay', 'ah', 'hehe', 'hing'].flatMap(w => [1, 2, 3].map(i => `voice_${w}_${i}`)), 'voice_blip_a', 'voice_blip_o'];
  // dB per file, measured (RMS) so the pack keeps the balance the calls below were tuned to: a replaced effect plays as
  // loud as the one it replaced, a new eat sound sits with the other eat sounds, a voice sits under the effects.
  const LEVEL = { coin: -1, combo: 3, dash: -1, eat_balloon: -5, eat_bicycle: 5, eat_boat: -8, eat_building: 1, eat_bus: -9,
    eat_car: -3, eat_carousel: -1, eat_fountain: 7, eat_metal: -6, eat_plant: -3, eat_pop: -1, eat_reindeer: -3, eat_soft: 3,
    eat_stone: -3, eat_wood: -2, grow: -2, gulp_big: -2, gulp_small: -3, hit: 1, level_up: 2, lose: 1, night: -1, parade: 2,
    rain: 2, shard: -3, spit: -1, star: -2, sunlight: 0, tap: 3, tick: 0, win: 0, wind: 0, yuck: -1,
    eat_person_high: -5, eat_person_low: -4, eat_cat: -3, eat_chicken: -5, eat_sheep: -3, eat_cow: -4, eat_camel: -2,
    eat_gull: -5, eat_zombie: -1, voice: -8 };
  const buffers = {}, loading = {};
  let lastError = ''; // the newest file that failed to fetch or decode, for the info screen's sound check
  const canFetch = () => !!(root.fetch && root.location && root.location.protocol !== 'file:');
  // The app on iOS (Capacitor) serves its own files with status 0, not 200 (the body is all there): that counts as a file
  // too. Before this every recording failed on the phone and only the synthesized stand-ins played (tester, build 118's
  // sound check: "0/68, last error … : 0").
  const body = r => r.ok || r.status === 0 ? r.arrayBuffer() : Promise.reject(new Error(r.status));
  function load(path) {
    if (path in buffers || loading[path] || !ctx || !canFetch()) return loading[path];
    loading[path] = root.fetch(path).then(body)
      .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .then(buf => { buffers[path] = buf; return buf; }, e => { buffers[path] = null; lastError = `${path.split('/').pop()}: ${e && e.message || e}`; return null; })
      .finally(() => { delete loading[path]; });
    return loading[path];
  }
  // Plays a recorded effect; false when there is none to play yet (the caller then synthesizes).
  function sample(name, { vol = 0.75, rate = 1, at = 0, loopFor = 0 } = {}) {
    if (!SFX_FILES.includes(name)) return false;
    const b = buffers[`audio/sfx/${name}.m4a`];
    if (!b) { load(`audio/sfx/${name}.m4a`); return false; }
    if (ctx.state !== 'running') return true;
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), g = ctx.createGain();
    vol *= Math.pow(10, (LEVEL[name.startsWith('voice_') ? 'voice' : name] || 0) / 20);
    src.buffer = b; src.playbackRate.value = rate; g.gain.value = vol;
    if (loopFor) { src.loop = true; g.gain.setValueAtTime(vol, t + Math.max(0, loopFor - 0.4)); g.gain.linearRampToValueAtTime(0.0001, t + loopFor); }
    src.connect(g).connect(sfxBus); src.start(t); if (loopFor) src.stop(t + loopFor + 0.05);
    return true;
  }
  const semis = n => Math.pow(2, n / 12);
  // iOS only lets audio start inside a tap, and its context can also sit 'interrupted' (a call, another app, the app
  // launching), not just 'suspended': any state but running is resumed, on every kind of tap (some iOS versions do not
  // count a pointerdown), and a one-sample silent sound is played inside the tap, the reliable way to wake WebKit audio.
  // The first tap also fetches every effect and voice, so none is missed the first time.
  let fetched = false;
  const unlock = () => {
    if (!init()) return;
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
      const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
    }
    if (!fetched) { fetched = true; SFX_FILES.forEach(n => load(`audio/sfx/${n}.m4a`)); }
  };
  if (root.addEventListener) {
    for (const ev of ['pointerdown', 'touchend', 'click']) root.addEventListener(ev, unlock, true);
    // Leaving the app stops the sound; coming back resumes it (if iOS refuses without a tap, the next tap does it).
    root.document && root.document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (root.document.hidden) ctx.suspend(); else ctx.resume().catch(() => {});
    });
  }

  const R = (a, b) => a + Math.random() * (b - a); // small pitch/timing spread so repeats never sound identical

  // Effects: every one is a file (audio/sfx, see LICENSES.md), all fetched at the first tap; nothing is synthesized, so
  // an effect whose file has not arrived yet is simply skipped.
  // What each kind says as it is sucked in: people cry out (a mix of higher and lower voices), animals call,
  // vehicles honk, plants rustle, boxes thud, metal rattles, a balloon pops, a building rumbles.
  const PEOPLE = ['person', 'worker', 'officer', 'visitor', 'skier', 'hanbok', 'student', 'grandma', 'commuter', 'umbrella', 'fan', 'sunbather', 'traveler', 'caroler', 'surfer'];
  const PLANTS = ['tree', 'pine', 'persimmon', 'palm', 'planter', 'haystack'];
  const WOOD = ['bench', 'crate', 'container', 'kiosk', 'stall', 'jangdok', 'pot', 'fruit', 'gift', 'tube', 'towel', 'parasol', 'tent', 'sled'];
  const METAL = ['trash', 'vending', 'beam', 'pipe', 'cone'];
  const SOFT = ['snowman', 'candy', 'ball', 'buoy', 'sandcastle', 'xtree'];
  const STONE = ['statue', 'pagoda'];
  const lastVoices = []; // the kinds voiced most recently (tests read this)
  const EAT_FILE = t => ['car', 'taxi', 'foodtruck', 'scooter'].includes(t) ? 'eat_car' : ['bus', 'tractor', 'excavator'].includes(t) ? 'eat_bus'
    : ['boat', 'bicycle', 'balloon', 'fountain', 'carousel', 'reindeer', 'building'].includes(t) ? 'eat_' + t
    : PLANTS.includes(t) ? 'eat_plant' : METAL.includes(t) ? 'eat_metal' : WOOD.includes(t) ? 'eat_wood' : STONE.includes(t) ? 'eat_stone'
    : SOFT.includes(t) ? 'eat_soft' : ['cat', 'chicken', 'sheep', 'cow', 'camel', 'gull', 'zombie'].includes(t) ? 'eat_' + t
    : PEOPLE.includes(t) || t === 'guard' || t === 'boss' ? 'eat_person' : null;
  // People are half higher voices, half lower; a guard or the boss always low, a grandma always high.
  const personFile = t => t === 'guard' || t === 'boss' ? 'eat_person_low' : t === 'grandma' ? 'eat_person_high'
    : Math.random() < 0.5 ? 'eat_person_low' : 'eat_person_high';
  function voiceOf(type) { // not `voice`: that name is the music synth's note below
    lastVoices.push(type); if (lastVoices.length > 20) lastVoices.shift();
    if (!ctx || ctx.state !== 'running') return;
    let file = EAT_FILE(type);
    if (file === 'eat_person') file = personFile(type);
    sample(file || 'eat_pop', { vol: 0.6, rate: R(0.94, 1.06) }); // anything without its own sound: a pop
  }

  // The character's own voice (tester: "a cute voice for the character", then "no synth"): recorded singers from
  // FluidR3_GM (a choir "aah", a voice "ooh"), rendered by tools/audio/sfx.mjs. The words below are what was sung, three
  // takes each; a line of dialogue is babbled from two single syllables. Nothing here is synthesized: until the files
  // have loaded the character is simply quiet.
  // WORDS: each syllable is [vowel, seconds, start pitch, end pitch] (pitch as a multiple of the base), a nasal 'n'/'m'
  // hum takes [n, seconds]. VOWELS: the five sung vowels, each sung on the choir (a, e) or the voice (i, o, u).
  const VOWELS = { a: 'a', e: 'a', i: 'o', o: 'o', u: 'o' };
  const WORDS = {
    nyam: [['n', 0.035], ['a', 0.13, 1.1, 1.35], ['m', 0.06]],                              // 냠
    wow: [['u', 0.09, 0.95, 1.05], ['a', 0.26, 1.15, 1.55]],                                   // 우와~
    yay: [['i', 0.04, 1.2, 1.25], ['a', 0.12, 1.3, 1.45], ['o', 0.22, 1.55, 1.7]],              // 야호
    hehe: [['e', 0.09, 1.2, 1.35], ['e', 0.07, 1.1, 1.25], ['e', 0.13, 1.3, 1.45]],             // 에헤헤
    hing: [['i', 0.11, 1.4, 1.3], ['i', 0.36, 1.35, 0.95]],                                    // 히잉~
    ah: [['a', 0.1, 1.2, 1.65]],                                                                // 앗!
    umm: [['m', 0.05], ['u', 0.12, 1.0, 1.15], ['m', 0.08]],                                    // 음!
  };
  const lastSaid = []; // the words said most recently (tests read this)
  let saidAt = -9;
  function say(word, { at = 0, vol = 0.75, every = 0 } = {}) {
    if (!WORDS[word]) return;
    if (ctx && ctx.state === 'running' && every && ctx.currentTime - saidAt < every) return; // the frequent ones keep a gap
    lastSaid.push(word); if (lastSaid.length > 20) lastSaid.shift();
    if (!ctx || ctx.state !== 'running') return;
    saidAt = ctx.currentTime;
    sample(`voice_${word}_${1 + Math.floor(Math.random() * 3)}`, { vol, at });
  }
  // Dusk reads a line aloud in babble (tester: "a voice for Dusk's lines"): one sung syllable per Hangul syllable, on
  // that syllable's vowel (choir or voice), each pitched a little apart; a closing consonant makes it shorter, a ! or ?
  // lifts the last one, otherwise it settles; at most a dozen syllables, one line at a time.
  // JUNG: the 21 medial vowels in Unicode order (ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ) as the five sung vowels.
  const JUNG = 'aeaeoeoeoaeeouoeiuuii';
  function syllables(text) {
    const out = [];
    for (const ch of text) {
      const c = ch.codePointAt(0) - 0xac00;
      if (c >= 0 && c < 11172) out.push({ v: JUNG[Math.floor((c % 588) / 28)], nasal: [4, 16, 21].includes(c % 28), stop: c % 28 > 0 });
      else if (/[!?！？]/.test(ch) && out.length) out[out.length - 1].lift = true;
    }
    return out;
  }
  const lastSpoken = [];
  let spokeUntil = 0;
  function speak(text, { vol = 0.55 } = {}) {
    const syl = syllables(String(text)).slice(0, 12);
    if (!syl.length) return;
    lastSpoken.push(text); if (lastSpoken.length > 20) lastSpoken.shift();
    if (!ctx || ctx.state !== 'running' || ctx.currentTime < spokeUntil) return; // one line at a time
    const base = R(1.08, 1.2); // the syllables were sung at C5; Dusk speaks a little above that
    let at = 0.02;
    syl.forEach((s, i) => {
      const last = i === syl.length - 1, p = base * (1 + R(-0.06, 0.08)) * (last ? (s.lift ? 1.22 : 0.9) : 1);
      sample(`voice_blip_${VOWELS[s.v]}`, { vol: vol * (s.nasal ? 0.8 : 1), rate: p, at });
      at += s.stop ? 0.07 : 0.085;
    });
    spokeUntil = ctx.currentTime + at + 0.15;
  }

  const sfx = {
    voice: voiceOf, get lastVoices() { return lastVoices.slice(); }, say, get lastSaid() { return lastSaid.slice(); },
    speak, get lastSpoken() { return lastSpoken.slice(); },
    gulp(size = 0, combo = 0) { // a combo climbs: each swallow in the chain is a step higher, up to a fifth
      const up = Math.min(7, Math.max(0, combo - 1));
      sample(size > 0.5 ? 'gulp_big' : 'gulp_small', { vol: 0.8, rate: semis(up) * R(0.96, 1.04) });
      if (combo >= 3 && combo % 4 === 3) say('nyam', { at: 0.06, every: 1.6 }); // a 냠 now and then in a chain, never a chatter
      else if (size > 0.7) say('umm', { at: 0.08, every: 1.6 }); // something big: a satisfied 음!
    },
    tap() { sample('tap', { vol: 0.5 }); },
    star() { sample('star'); say('yay', { at: 0.3 }); },
    coin() { sample('coin', { vol: 0.6 }); },
    level() { sample('level_up'); },
    lit() { sample('sunlight', { vol: 0.55 }); say('ah', { at: 0.02, every: 3 }); }, // 앗! (out in the sun)
    night() { sample('night'); },
    grow() { sample('grow'); say('wow', { at: 0.12 }); },
    hit() { sample('hit'); },
    tick() { sample('tick', { vol: 0.5 }); },
    spit() { sample('spit'); }, // 퉤
    yuck() { sample('yuck'); }, // 으엑: a zombie went down
    shard(kind) { sample('shard', { rate: kind === 'bolt' ? semis(5) : kind === 'cloud' ? semis(-7) : 1 }); }, // higher for the bolt
    dash() { sample('dash', { vol: 0.35, rate: R(0.95, 1.05) }); }, // quick footsteps while the bolt lasts
    rain(dur) { sample('rain', { vol: 0.5, loopFor: dur }); }, // a shower for its length
    wind(dur) { sample('wind', { vol: 0.5, loopFor: dur }); }, // a cloud front rolling in
    parade() { sample('parade'); }, // a little march
    combo(n) { sample('combo', { vol: 0.5, rate: semis(Math.min(12, n)) }); }, // each link a step higher
    win() { sample('win'); say('hehe', { at: 0.6 }); },
    lose() { sample('lose'); say('hing', { at: 0.55 }); },
  };


  // Background tracks (www/audio/bgm): the menus, each map, the night stretch and the boss. One track is decoded at a
  // time (a minute of stereo is ~25 MB decoded) and swapped with a short crossfade; each is levelled to -16 LUFS from
  // its measured loudness. While a track loads (or if it cannot), nothing plays: there is no synthesized stand-in.
  // mode: 'title' (menus), 'play', 'night' (the dark stretch) or 'boss' picks the track with the region's tune name.
  const BGM_LUFS = { title: -16, night: -16, boss: -16, town: -16, city: -16, oasis: -16, hanok: -16, campus: -16, snow: -16,
    market: -16, crossing: -16, stadium: -16, harbor: -16, construction: -16, park: -16, beach: -18, desert: -17.3, farm: -16,
    playground: -16, aquarium: -16, onsen: -16, nightmarket: -16, airport: -16, space: -16, xmas: -16 };
  let tuneName = 'town', track = null, mode = 'title', rushOn = false, timer = null; // track: { name, src, g } while a file plays (or { name } while it loads)
  const trackFor = () => mode === 'title' ? 'title' : mode === 'night' ? 'night' : mode === 'boss' ? 'boss' : BGM_LUFS[tuneName] !== undefined ? tuneName : 'town';
  function syncTrack() {
    const name = trackFor();
    if (track && track.name === name) { if (track.src) track.src.playbackRate.value = rushOn ? 1.06 : 1; return; }
    const old = track, path = `audio/bgm/bgm_${name}.m4a`;
    track = { name };
    if (old && old.src) { old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25); old.src.stop(ctx.currentTime + 1.2); }
    const p = canFetch() ? root.fetch(path).then(body)
      .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej))) : Promise.reject(new Error('no fetch'));
    p.then(buf => {
      if (!track || track.name !== name) return; // moved on while it loaded
      const src = ctx.createBufferSource(), g = ctx.createGain(), level = Math.pow(10, (-16 - BGM_LUFS[name]) / 20);
      src.buffer = buf; src.loop = true; src.playbackRate.value = rushOn ? 1.06 : 1;
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.setTargetAtTime(level * 1.6, ctx.currentTime, 0.3);
      src.connect(g).connect(musicBus); src.start();
      track = { name, src, g };
    }, () => { if (track && track.name === name) track = { name, failed: true }; });
  }
  const music = {
    start() {
      if (!init() || timer) return;
      timer = setInterval(() => { if (ctx.state === 'running') syncTrack(); }, 100);
    },
    stop() { clearInterval(timer); timer = null; if (track && track.src) track.src.stop(); track = null; },
    mode(m) { mode = m; },
    rush(v) { rushOn = !!v; }, // the last seconds: the track plays a little faster
    tune(name) { if (BGM_LUFS[name] !== undefined) tuneName = name; }, // region name: town, city, ...
    get track() { return track && track.name; },
  };
  // What the info screen shows so a silent phone can be diagnosed without a debugger: the context's state, how many
  // files decoded or failed (and the last error), and the background track's state.
  function status() {
    const v = Object.values(buffers);
    return { state: ctx ? ctx.state : 'none', ok: v.filter(Boolean).length, failed: v.filter(b => b === null).length, loading: Object.keys(loading).length,
      total: SFX_FILES.length, lastError, track: !track ? '-' : track.src ? track.name : track.failed ? `${track.name} 실패` : `${track.name} 불러오는 중` };
  }


  function setOn(kind, v) {
    on[kind] = !!v;
    if (!ctx) return;
    const bus = kind === 'sfx' ? sfxBus : musicBus, level = kind === 'sfx' ? 0.6 : 0.22;
    bus.gain.setTargetAtTime(v ? level : 0, ctx.currentTime, 0.05);
  }

  root.DuskSound = { sfx, music, setOn, status, voice: { VOWELS, WORDS, syllables }, files: { SFX_FILES, BGM_LUFS, EAT_FILE }, get on() { return Object.assign({}, on); }, get ctx() { return ctx; } };
})(this);
