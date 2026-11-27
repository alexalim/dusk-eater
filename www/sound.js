// Sound: recorded effects and a background track per map (www/audio, a demo pack: see audio/README) where a file is
// there and loads; everything else, and the whole of it when files cannot load (a file:// page, a decode error), is
// synthesized with Web Audio as before, so a missing file only changes how one sound is made, never whether it plays. Effects and music each have an on/off switch the game saves. iOS only lets audio start inside a tap,
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

  // Recorded sounds. A buffer is fetched and decoded once; until then (or if it fails) the caller synthesizes instead.
  // A file:// page (the test runs) cannot fetch, so no file is tried there and nothing is logged.
  const SFX_FILES = ['coin', 'combo', 'dash', 'eat_balloon', 'eat_bicycle', 'eat_boat', 'eat_building', 'eat_bus', 'eat_car',
    'eat_carousel', 'eat_fountain', 'eat_metal', 'eat_plant', 'eat_pop', 'eat_reindeer', 'eat_soft', 'eat_stone', 'eat_wood',
    'grow', 'gulp_big', 'gulp_small', 'hit', 'level_up', 'lose', 'night', 'parade', 'rain', 'shard', 'spit', 'star',
    'sunlight', 'tap', 'tick', 'win', 'wind', 'yuck',
    'eat_person_high', 'eat_person_low', 'eat_cat', 'eat_chicken', 'eat_sheep', 'eat_cow', 'eat_camel', 'eat_gull', 'eat_zombie',
    ...['nyam', 'umm', 'wow', 'yay', 'ah', 'hehe', 'hing'].flatMap(w => [1, 2, 3].map(i => `voice_${w}_${i}`)), 'voice_blip_a', 'voice_blip_o'];
  // dB per file, measured (RMS) so the pack keeps the balance the calls below were tuned to: a replaced effect plays as
  // loud as the one it replaced, a new eat sound sits with the other eat sounds, a voice sits under the effects.
  const LEVEL = { coin: -1, combo: 3, dash: -1, eat_balloon: -5, eat_bicycle: -1, eat_boat: -8, eat_building: 1, eat_bus: -9,
    eat_car: -3, eat_carousel: -1, eat_fountain: 7, eat_metal: -6, eat_plant: -3, eat_pop: -1, eat_reindeer: -3, eat_soft: 3,
    eat_stone: -3, eat_wood: -2, grow: -2, gulp_big: -2, gulp_small: -3, hit: 1, level_up: 2, lose: 1, night: -1, parade: 2,
    rain: 2, shard: -3, spit: -1, star: -2, sunlight: -2, tap: 3, tick: 0, win: 0, wind: 0, yuck: -1,
    eat_person_high: -5, eat_person_low: -4, eat_cat: -5, eat_chicken: -5, eat_sheep: -4, eat_cow: -4, eat_camel: -2,
    eat_gull: -6, eat_zombie: -1, voice: -8 };
  const buffers = {}, loading = {};
  const canFetch = () => !!(root.fetch && root.location && root.location.protocol !== 'file:');
  function load(path) {
    if (path in buffers || loading[path] || !ctx || !canFetch()) return loading[path];
    loading[path] = root.fetch(path).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
      .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .then(buf => { buffers[path] = buf; return buf; }, () => { buffers[path] = null; return null; })
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
  const unlock = () => { if (init()) { if (ctx.state === 'suspended') ctx.resume(); preloadVoice(); } };
  if (root.addEventListener) {
    root.addEventListener('pointerdown', unlock, true);
    // Leaving the app stops the sound; coming back resumes it.
    root.document && root.document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (root.document.hidden) ctx.suspend(); else ctx.resume();
    });
  }

  // One enveloped oscillator: frequency glides from f0 to f1 over `dur` seconds.
  function tone(f0, f1, dur, { type = 'sine', vol = 0.5, at = 0, bus = sfxBus, attack = 0.005 } = {}) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const note = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note number to Hz
  const R = (a, b) => a + Math.random() * (b - a); // small pitch/timing spread so repeats never sound identical

  // Filtered noise burst (rustle, pop, splash, rumble).
  let noiseBuf = null;
  function hiss(dur, { f = 2000, q = 1, type = 'bandpass', vol = 0.3, at = 0 } = {}) {
    if (!ctx || ctx.state !== 'running') return;
    if (!noiseBuf) { const len = ctx.sampleRate * 0.3, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; noiseBuf = b; }
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(sfxBus); src.start(t); src.stop(t + dur + 0.02);
  }
  // A vowel-ish cry: a saw (or other wave) through a closing low-pass, pitch gliding f0 -> f1 with vibrato.
  function cry(f0, f1, dur, { vol = 0.25, cutoff = 1200, vib = 6, depth = 0.04, at = 0, type = 'sawtooth' } = {}) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    lfo.frequency.value = vib; lg.gain.value = f0 * depth; lfo.connect(lg).connect(o.frequency);
    lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(cutoff, t); lp.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
  }

  // Effects. `size` 0..1 makes a bigger swallow a lower, rounder pop.
  // What each kind says as it is sucked in: people cry out (a mix of higher and lower voices), animals call,
  // vehicles honk, plants rustle, boxes thud, metal rattles, a balloon pops, a building rumbles.
  const PEOPLE = ['person', 'worker', 'officer', 'visitor', 'skier', 'hanbok', 'student', 'grandma', 'commuter', 'umbrella', 'fan', 'sunbather', 'traveler', 'caroler', 'surfer'];
  const VEHICLES = ['car', 'taxi', 'bus', 'foodtruck', 'tractor', 'excavator', 'scooter'];
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
    if (file && sample(file, { vol: 0.6, rate: R(0.94, 1.06) })) return;
    if (type === 'cat') { const f = R(520, 720); cry(f, f * 1.45, 0.16, { vol: .22, cutoff: 2200, vib: 9, depth: .03, type: 'triangle' }); cry(f * 1.4, f * 0.8, 0.28, { vol: .2, cutoff: 1800, vib: 7, depth: .05, type: 'triangle', at: 0.15 }); return; } // 야옹
    if (type === 'zombie') { const f = R(90, 130); cry(f, f * 0.75, 0.55, { vol: .25, cutoff: 700, vib: 4, depth: .06 }); return; } // 으어어
    if (PEOPLE.includes(type) || type === 'guard' || type === 'boss') { // 와앙 / 으악, half higher voices, half lower
      const low = type === 'guard' || type === 'boss' || type === 'grandma' ? type !== 'grandma' : Math.random() < 0.5;
      const f = low ? R(170, 240) : R(330, 440), dur = type === 'boss' ? 0.9 : R(0.35, 0.5);
      cry(f, f * (low ? 0.6 : 0.7), dur, { vol: low ? .28 : .24, cutoff: low ? 900 : 1600, vib: 11, depth: .06 });
      if (!low) cry(f * 2, f * 1.3, dur * 0.8, { vol: .08, cutoff: 2600, vib: 11, depth: .06, at: 0.02 });
      return;
    }
    if (type === 'gull') { [0, 0.13, 0.26].forEach(at => cry(R(1400, 1700), 1100, 0.1, { vol: .14, cutoff: 3000, vib: 20, depth: .08, type: 'square', at })); return; } // 끼룩
    if (type === 'chicken') { [0, 0.08, 0.16, 0.26].forEach((at, i) => cry(R(700, 900) * (i === 3 ? 1.4 : 1), 600, i === 3 ? 0.22 : 0.07, { vol: .16, cutoff: 2200, type: 'square', at })); return; } // 꼬꼬댁
    if (type === 'sheep') { cry(R(240, 300), 230, 0.5, { vol: .2, cutoff: 1400, vib: 14, depth: .1 }); return; } // 메에
    if (type === 'cow') { cry(R(100, 130), 90, 0.7, { vol: .3, cutoff: 700, vib: 5, depth: .05 }); return; } // 음메
    if (type === 'camel') { cry(R(130, 170), 100, 0.6, { vol: .26, cutoff: 800, vib: 8, depth: .12 }); return; }
    if (type === 'reindeer') { [0, 0.09, 0.18, 0.3].forEach(at => tone(R(2400, 3200), R(2400, 3200), 0.12, { type: 'sine', vol: .12, at })); return; } // 방울
    if (VEHICLES.includes(type)) { const f = ['bus', 'tractor', 'excavator'].includes(type) ? 220 : R(330, 400); tone(f, f, 0.22, { type: 'square', vol: .12 }); tone(f * 1.26, f * 1.26, 0.22, { type: 'square', vol: .12 }); hiss(0.25, { f: 3000, q: .7, vol: .06, at: 0.05 }); return; } // 빵
    if (type === 'boat') { tone(110, 95, 0.6, { type: 'sawtooth', vol: .18 }); tone(165, 140, 0.6, { type: 'sawtooth', vol: .08 }); return; } // 부웅
    if (type === 'bicycle') { [0, 0.07].forEach(at => tone(2600, 2400, 0.12, { type: 'sine', vol: .14, at })); return; } // 따르릉
    if (type === 'balloon') { hiss(0.05, { f: 4000, q: .5, vol: .4, type: 'highpass' }); tone(900, 120, 0.12, { type: 'sine', vol: .25 }); return; } // 펑
    if (PLANTS.includes(type)) { hiss(0.3, { f: 5000, q: .8, vol: .18, type: 'highpass' }); hiss(0.2, { f: 2500, q: 1, vol: .1, at: 0.12 }); return; } // 바스락
    if (METAL.includes(type)) { tone(R(700, 900), 600, 0.1, { type: 'square', vol: .12 }); hiss(0.12, { f: 6000, q: 2, vol: .15 }); tone(R(1100, 1300), 1000, 0.08, { type: 'square', vol: .08, at: 0.05 }); return; } // 달그락
    if (WOOD.includes(type)) { tone(R(140, 190), 70, 0.14, { type: 'triangle', vol: .3 }); hiss(0.08, { f: 1200, q: 1, vol: .12 }); return; } // 툭
    if (STONE.includes(type)) { tone(90, 45, 0.3, { type: 'sine', vol: .35 }); hiss(0.15, { f: 900, q: 1, vol: .15 }); return; } // 쿵
    if (type === 'fountain') { hiss(0.4, { f: 1800, q: .6, vol: .2 }); [0, .1, .2].forEach(at => tone(R(1500, 2200), R(900, 1300), 0.1, { type: 'sine', vol: .08, at })); return; } // 첨벙
    if (type === 'carousel') { [72, 76, 79, 84, 79].forEach((n, i) => tone(note(n), note(n), 0.25, { type: 'sine', vol: .14, at: i * 0.1 })); return; } // 오르골
    if (SOFT.includes(type)) { hiss(0.12, { f: 600, q: .8, vol: .18 }); tone(300, 120, 0.12, { type: 'sine', vol: .12 }); return; } // 푹
    if (type === 'building') { tone(70, 28, 0.7, { type: 'sine', vol: .45 }); hiss(0.6, { f: 300, q: .7, vol: .25 }); hiss(0.3, { f: 1500, q: 1, vol: .1, at: .1 }); return; } // 쿠궁
    if (!PEOPLE.includes(type) && sample('eat_pop', { vol: 0.6, rate: R(0.94, 1.06) })) return;
    tone(R(600, 800), 260, 0.12, { type: 'sine', vol: .3 }); // anything else: a plain pop
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
  const VOICE_FILES = [...Object.keys(WORDS).flatMap(w => [1, 2, 3].map(i => `voice_${w}_${i}`)), 'voice_blip_a', 'voice_blip_o'];
  const preloadVoice = () => VOICE_FILES.forEach(n => load(`audio/sfx/${n}.m4a`)); // so the first line is not lost
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
      if (!sample(size > 0.5 ? 'gulp_big' : 'gulp_small', { vol: 0.8, rate: semis(up) * R(0.96, 1.04) })) {
        const f = (720 - size * 420) * R(0.92, 1.08) * semis(up);
        tone(f, f * 0.35, 0.13, { type: 'sine', vol: 0.55 });
        tone(f * 2.1, f * 0.9, 0.06, { type: 'triangle', vol: 0.12 });
      }
      if (combo >= 3 && combo % 4 === 3) say('nyam', { at: 0.06, every: 1.6 }); // a 냠 now and then in a chain, never a chatter
      else if (size > 0.7) say('umm', { at: 0.08, every: 1.6 }); // something big: a satisfied 음!
    },
    tap() { if (!sample('tap', { vol: 0.5 })) tone(1200, 900, 0.04, { type: 'triangle', vol: 0.18 }); },
    star() { if (!sample('star')) [72, 76, 79, 84].forEach((n, i) => tone(note(n), note(n), 0.22, { type: 'triangle', vol: 0.3, at: i * 0.07 })); say('yay', { at: 0.3 }); },
    coin() { if (sample('coin', { vol: 0.6 })) return; tone(note(88), note(88), 0.09, { type: 'square', vol: 0.08 }); tone(note(95), note(95), 0.25, { type: 'square', vol: 0.08, at: 0.08 }); },
    level() { if (!sample('level_up')) [67, 72, 76, 79, 84].forEach((n, i) => tone(note(n), note(n), 0.3, { type: 'triangle', vol: 0.32, at: i * 0.09 })); },
    lit() { if (!sample('sunlight', { vol: 0.55 })) { tone(260, 180, 0.18, { type: 'sawtooth', vol: 0.07 }); tone(250, 175, 0.18, { type: 'sawtooth', vol: 0.07, at: 0.2 }); } say('ah', { at: 0.02, every: 3 }); }, // 앗! (out in the sun)
    night() { if (!sample('night')) [84, 79, 76, 72, 67].forEach((n, i) => tone(note(n), note(n), 0.5, { type: 'sine', vol: 0.25, at: i * 0.12 })); },
    grow() { if (!sample('grow')) { tone(320, 960, 0.35, { type: 'triangle', vol: 0.25 }); [79, 84, 88].forEach((n, i) => tone(note(n), note(n), 0.25, { type: 'sine', vol: 0.22, at: 0.3 + i * 0.08 })); } say('wow', { at: 0.12 }); },
    hit() { if (sample('hit')) return; tone(180, 60, 0.18, { type: 'square', vol: 0.35 }); tone(900, 1800, 0.12, { type: 'triangle', vol: 0.2, at: 0.02 }); [84, 91].forEach((n, i) => tone(note(n), note(n), 0.3, { type: 'triangle', vol: 0.25, at: 0.1 + i * 0.08 })); },
    tick() { if (!sample('tick', { vol: 0.5 })) tone(1500, 1500, 0.06, { type: 'square', vol: 0.12 }); },
    spit() { if (sample('spit')) return; hiss(0.09, { f: 1600, q: 1.2, vol: .32 }); tone(460, 150, 0.13, { type: 'triangle', vol: .3, at: 0.02 }); }, // 퉤: a short burst and a falling thump
    yuck() { // 으엑: a zombie went down, then three seconds of queasy gurgling
      if (sample('yuck')) return;
      tone(300, 110, 0.28, { type: 'sawtooth', vol: 0.2 }); tone(520, 130, 0.32, { type: 'square', vol: 0.07 });
      for (let i = 0; i < 7; i++) tone(90 + (i % 2) * 25, 60, 0.22, { type: 'sawtooth', vol: 0.06, at: 0.45 + i * 0.38 });
    },
    shard(kind) { // a light shard: a quick rising sparkle, higher for the bolt
      if (sample('shard', { rate: kind === 'bolt' ? semis(5) : kind === 'cloud' ? semis(-7) : 1 })) return;
      const base = kind === 'bolt' ? 84 : kind === 'cloud' ? 72 : 79;
      [0, 4, 7, 12].forEach((n, i) => tone(note(base + n), note(base + n) * 1.02, 0.12, { type: 'triangle', vol: 0.14, at: i * 0.05 }));
    },
    dash() { if (!sample('dash', { vol: 0.35, rate: R(0.95, 1.05) })) tone(2200, 1800, 0.03, { type: 'square', vol: 0.05 }); }, // quick footsteps while the bolt lasts
    rain(dur) { if (!sample('rain', { vol: 0.5, loopFor: dur })) hiss(dur, { f: 1800, q: 0.5, vol: 0.12 }); }, // a shower: soft broadband hiss for its length
    wind(dur) { if (!sample('wind', { vol: 0.5, loopFor: dur })) hiss(dur, { f: 420, q: 0.8, type: 'lowpass', vol: 0.16 }); }, // a cloud front rolling in
    parade() { if (!sample('parade')) [67, 71, 74, 79, 74, 79].forEach((n, i) => tone(note(n), note(n), 0.13, { type: 'square', vol: 0.09, at: i * 0.12 })); }, // a little march
    combo(n) { if (sample('combo', { vol: 0.5, rate: semis(Math.min(12, n)) })) return; const f = note(72 + Math.min(12, n)); tone(f, f * 1.5, 0.08, { type: 'square', vol: 0.1 }); }, // each link a step higher
    win() { if (!sample('win')) [60, 64, 67, 72, 76].forEach((n, i) => tone(note(n), note(n), 0.35, { type: 'triangle', vol: 0.3, at: i * 0.1 })); say('hehe', { at: 0.6 }); },
    lose() { if (!sample('lose')) [67, 64, 60].forEach((n, i) => tone(note(n), note(n), 0.4, { type: 'triangle', vol: 0.25, at: i * 0.16 })); say('hing', { at: 0.55 }); },
  };

  // Background music: a small band, scheduled a little ahead of time. Every region shares one core (a soft pad
  // of seventh chords, chord stabs, a bass, a light kit, a pentatonic lead) and swaps in its own players:
  //   lead: who carries the melody      keys: who plays the chords (`strum` rolls them like a strummed string)
  //   comp: the steps the chords land on (default: a 3+3+2 feel)      fill: [player, steps, semitones up] chord-tone sparkle
  //   bass: [player, line]      drums: the kit      waltz: three beats a bar (12 steps)      swing: late off-beats
  // mode 'title' keeps it to pad + keys; 'play' brings in bass, drums and lead; 'night' opens the filter and adds
  // sparkle; 'boss' puts a kick on every beat. Tempo and players follow the art direction's list per region; the
  // melody grows from a seed over the key's five-note scale (so it stays the same each visit).
  const DEG = { I: [0, 4, 7], ii: [2, 5, 9], iii: [4, 7, 11], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16],
    i: [0, 3, 7], iv: [5, 8, 12], v: [7, 10, 14], III: [3, 7, 10], VI: [8, 12, 15], VII: [10, 14, 17] };
  const OFF = [2, 6, 10, 14]; // the off-beats: where a strummed or plucked chord answers the bass
  const TUNES = {
    town: { key: 60, bpm: 100, prog: ['vi', 'IV', 'I', 'V'], seed: 1, lead: 'marimba', keys: 'guitar', strum: true, fill: ['glock', [4, 12], 12], bass: ['sub', 'tresillo'], drums: 'brush' },
    space: { key: 59, bpm: 92, prog: ['i', 'VI', 'VII', 'i'], seed: 21, minor: true, lead: 'box', keys: 'epiano', fill: ['glock', [4, 12], 12], bass: ['sub', 'tresillo'], drums: 'soft' },
    aquarium: { key: 60, bpm: 96, prog: ['I', 'iii', 'IV', 'V'], seed: 22, waltz: true, lead: 'glock', keys: 'epiano', bass: ['upright', 'waltz'], drums: 'waltz' },
    onsen: { key: 57, bpm: 84, prog: ['i', 'VI', 'VII', 'i'], seed: 23, minor: true, lead: 'flute', keys: 'guitar', strum: true, bass: ['sub', 'tresillo'], drums: 'soft' },
    nightmarket: { key: 62, bpm: 112, prog: ['i', 'VII', 'VI', 'VII'], seed: 24, minor: true, lead: 'accordion', keys: 'guitar', strum: true, bass: ['upright', 'tresillo'], drums: 'snap' },
    airport: { key: 64, bpm: 108, prog: ['I', 'vi', 'IV', 'V'], seed: 25, lead: 'marimba', keys: 'epiano', bass: ['upright', 'tresillo'], drums: 'snap' },
    playground: { key: 60, bpm: 118, prog: ['I', 'vi', 'IV', 'V'], seed: 26, waltz: true, lead: 'glock', keys: 'organ', bass: ['upright', 'waltz'], drums: 'carousel' },
    city: { key: 62, bpm: 115, prog: ['i', 'VII', 'VI', 'VII'], seed: 2, minor: true, lead: 'marimba', keys: 'epiano', bass: ['upright', 'tresillo'], drums: 'snap' },
    oasis: { key: 64, bpm: 95, prog: ['i', 'VI', 'VII', 'i'], seed: 3, minor: true, lead: 'flute', keys: 'guitar', strum: true, fill: ['kalimba', OFF, 12], bass: ['sub', 'tresillo'], drums: 'soft' },
    hanok: { key: 55, bpm: 50, prog: ['I', 'I', 'I', 'I'], seed: 4, korean: true }, // 아리랑 over 세마치 장단 (scheduleKorean); a pulse (S16) is 0.3 s
    campus: { key: 65, bpm: 112, prog: ['I', 'V', 'vi', 'IV'], seed: 5, lead: 'whistle', keys: 'banjo', strum: true, comp: OFF, bass: ['upright', 'oompah'], drums: 'brush' },
    snow: { key: 57, bpm: 90, prog: ['I', 'iii', 'IV', 'V'], seed: 6, lead: 'box', keys: 'epiano', fill: ['glock', [4, 12], 12], bass: ['sub', 'tresillo'], drums: 'soft' },
    market: { key: 58, bpm: 120, prog: ['I', 'IV', 'V', 'IV'], seed: 7, lead: 'accordion', keys: 'pizz', comp: OFF, bass: ['upright', 'oompah'], drums: 'wood' },
    crossing: { key: 61, bpm: 118, prog: ['i', 'VI', 'VII', 'i'], seed: 8, minor: true, swing: true, lead: 'clarinet', keys: 'marimba', bass: ['upright', 'walk'], drums: 'brush' },
    stadium: { key: 62, bpm: 124, prog: ['I', 'V', 'IV', 'V'], seed: 9, lead: 'trumpet', keys: 'marimba', comp: OFF, bass: ['tuba', 'oompah'], drums: 'march' },
    harbor: { key: 52, bpm: 105, prog: ['i', 'VII', 'VI', 'VII'], seed: 10, minor: true, waltz: true, lead: 'accordion', keys: 'guitar', strum: true, fill: ['mandolin', [6], 12], bass: ['upright', 'waltz'], drums: 'waltz' },
    construction: { key: 54, bpm: 110, prog: ['i', 'iv', 'VII', 'i'], seed: 11, minor: true, lead: 'marimba', keys: 'pizz', comp: OFF, bass: ['bassoon', 'oompah'], drums: 'clink' },
    park: { key: 55, bpm: 115, prog: ['I', 'vi', 'IV', 'V'], seed: 12, waltz: true, lead: 'glock', keys: 'organ', bass: ['upright', 'waltz'], drums: 'carousel' },
    beach: { key: 57, bpm: 108, prog: ['IV', 'V', 'iii', 'vi'], seed: 13, lead: 'pan', keys: 'guitar', strum: true, comp: [0, 3, 6, 10, 13], bass: ['sub', 'bossa'], drums: 'bossa' },
    desert: { key: 62, bpm: 102, prog: ['i', 'VI', 'iv', 'i'], seed: 14, minor: true, scale: [0, 1, 3, 7, 8], lead: 'oud', keys: 'marimba', bass: ['sub', 'tresillo'], drums: 'darbuka' }, // a flat second: the caravan colour
    farm: { key: 65, bpm: 110, prog: ['I', 'IV', 'I', 'V'], seed: 15, lead: 'harmonica', keys: 'guitar', strum: true, comp: OFF, fill: ['banjo', [0, 3, 6, 8, 11, 14], 12], bass: ['upright', 'oompah'], drums: 'brush' },
    xmas: { key: 60, bpm: 116, prog: ['I', 'IV', 'V', 'I'], seed: 16, lead: 'box', keys: 'pizz', fill: ['glock', [4, 12], 12], bass: ['sub', 'tresillo'], drums: 'sleigh' },
  };
  function melody(t) {
    const pent = t.scale || (t.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]), per = t.waltz ? 6 : 8; // eighths in a bar
    let x = t.seed * 9301 + 49297, at = 2; // tiny LCG: same tune for the same region every time
    const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: per * 4 }, (_, k) => {
      if (k % per === per - 1 || rnd() < 0.3) return null; // breathe at phrase ends
      at = Math.max(0, Math.min(9, at + Math.round((rnd() - 0.5) * 3)));
      return t.key + 12 + pent[at % 5] + 12 * Math.floor(at / 5);
    });
  }
  let BPM = 100, S16 = 60 / BPM / 4, tune = TUNES.town, CHORDS = [], ROOTS = [], LEAD = [];
  function setTune(name) {
    tune = TUNES[name] || TUNES.town;
    BPM = tune.bpm; S16 = 60 / BPM / 4;
    // seventh chords: a major seventh on major triads (a flat one on V), a minor seventh on minor ones
    CHORDS = tune.prog.map(d => { const c = DEG[d]; return [...c, c[0] + (c[1] - c[0] === 4 && d !== 'V' ? 11 : 10)].map(o => tune.key + o); });
    ROOTS = tune.prog.map(d => tune.key - 12 + DEG[d][0] - (tune.key >= 60 ? 12 : 0));
    LEAD = melody(tune);
    if (fx) fx.echo.delayTime.value = S16 * 3;
  }
  let timer = null, step = 0, nextT = 0, mode = 'title', fx = null, noise = null, rushOn = false;
  setTune('town');

  function buildFx() {
    if (fx) return fx;
    const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), tone = ctx.createBiquadFilter();
    delay.delayTime.value = S16 * 3; fb.gain.value = 0.35; wet.gain.value = 0.4; tone.type = 'lowpass'; tone.frequency.value = 2400;
    delay.connect(tone).connect(fb).connect(delay); tone.connect(wet).connect(musicBus);
    const padLp = ctx.createBiquadFilter(), pump = ctx.createGain(); padLp.type = 'lowpass'; padLp.frequency.value = 900; padLp.Q.value = 2;
    padLp.connect(pump).connect(musicBus);
    const len = ctx.sampleRate * 0.2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
    fx = { echo: delay, padLp, pump };
    return fx;
  }

  // One synth voice: oscillator(s) -> optional filter sweep -> envelope -> destination(s).
  function voice(freq, at, dur, { type = 'sawtooth', vol = 0.2, detune = [0], attack = 0.01, release = dur, cutoff = 0, to = [musicBus] }) {
    const t = ctx.currentTime + at, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + release);
    let head = g;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff * 3, t); f.frequency.exponentialRampToValueAtTime(cutoff, t + release * 0.6); f.connect(g); head = f; }
    for (const dt of detune) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = dt; o.connect(head); o.start(t); o.stop(t + release + 0.05); }
    for (const d of to) g.connect(d);
  }
  // Korean kit: janggu strokes (a low 'kung' from the drum head, a high 'deok' from the stick), a gayageum-like
  // pluck with a quick bend, and a daegeum-like breathy flute with wide vibrato.
  function kung(at) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.27);
  }
  function deok(at, vol = 0.18) {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2.5;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f).connect(g).connect(musicBus); src.start(t); src.stop(t + 0.08);
  }
  function pluck(freq, at, vol = 0.16) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq * 1.04, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(lp).connect(g).connect(musicBus); o.start(t); o.stop(t + 0.72);
  }
  function buk(at) { // the barrel drum under the janggu on the boss level
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.42);
  }
  // 대금: a breathy sine with its octave, and the 시김새 that make a line sound Korean rather than merely pentatonic:
  // 농현 (the note starts straight, then a slow, wide waver grows on it), 추성 (slides up into the note) and
  // 퇴성 (the end falls away). `mark` is 'chu' or 'toe' from the tune table.
  function daegeum(freq, at, dur, vol = 0.12, mark) {
    const t = ctx.currentTime + at, g = ctx.createGain(), g2 = ctx.createGain(), o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = o2.type = 'sine'; g2.gain.value = 0.35;
    const f0 = mark === 'chu' ? freq * 0.94 : freq;
    for (const [osc, k] of [[o, 1], [o2, 2]]) {
      osc.frequency.setValueAtTime(f0 * k, t);
      if (mark === 'chu') osc.frequency.exponentialRampToValueAtTime(freq * k, t + 0.12);
      if (mark === 'toe') { osc.frequency.setValueAtTime(freq * k, t + dur * 0.8); osc.frequency.exponentialRampToValueAtTime(freq * k * 0.9, t + dur); }
    }
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 4.2; lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + Math.min(0.35, dur * 0.3));
    lg.gain.linearRampToValueAtTime(freq * (dur > 1 ? 0.03 : 0.012), t + dur * 0.75);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const br = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain(); // breath around the note
    br.buffer = noise; br.loop = true; bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 5;
    bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.06); bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2).connect(g); g.connect(musicBus); br.connect(bp).connect(bg).connect(musicBus);
    const end = t + dur + 0.05;
    o.start(t); o2.start(t); lfo.start(t); br.start(t); o.stop(end); o2.stop(end); lfo.stop(end); br.stop(end);
  }
  function kick(at, vol = 0.75) { // deep and round: a lower start and a longer body than a click
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.42);
  }
  function noiseHit(at, { f, q = 1, type = 'bandpass', vol, attack = 0.002, dur }) {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(musicBus); src.start(t); src.stop(t + dur + 0.02);
  }
  // clap: three quick bursts and a short tail; shaker: a soft swish (a slow attack, so it never clicks)
  function clap(at) { [0, 0.012, 0.024].forEach(d => noiseHit(at + d, { f: 1300, q: 0.9, vol: 0.22, dur: d ? 0.03 : 0.17 })); }
  function shaker(at, vol) { noiseHit(at, { f: 6500, type: 'highpass', vol, attack: 0.02, dur: 0.09 }); }
  // keys: an electric-piano tone (a sine with a quieter octave, a bell-ish attack that falls away)
  function epiano(freq, at, vol, dur = 0.9) {
    voice(freq, at, dur, { type: 'sine', vol, attack: 0.006, release: dur, to: [musicBus, fx.echo] });
    voice(freq * 2, at, dur, { type: 'sine', vol: vol * 0.25, attack: 0.004, release: dur * 0.3, to: [musicBus] });
  }
  // marimba: a short wooden knock (a sine and its quick-dying 4th partial); steel pan: a sine with a slightly
  // sharp octave and a twelfth, a fast attack and a ringing tail
  function marimba(freq, at, vol) {
    voice(freq, at, 0.4, { type: 'sine', vol, attack: 0.003, release: 0.4, to: [musicBus, fx.echo] });
    voice(freq * 4, at, 0.06, { type: 'sine', vol: vol * 0.35, attack: 0.002, release: 0.06 });
  }
  function pan(freq, at, vol) {
    voice(freq, at, 0.8, { type: 'sine', vol, attack: 0.004, release: 0.8, to: [musicBus, fx.echo] });
    voice(freq * 2.01, at, 0.5, { type: 'sine', vol: vol * 0.5, attack: 0.004, release: 0.5 });
    voice(freq * 3, at, 0.25, { type: 'sine', vol: vol * 0.15, attack: 0.004, release: 0.25 });
  }
  // A held note (reeds, winds, brass): rises, stays level for the note and lets go, where voice() only dies away.
  function reed(freq, at, dur, { type = 'square', vol = 0.05, detune = [0], cutoff = 1400, attack = 0.03, vib = 0 }) {
    const t = ctx.currentTime + at, g = ctx.createGain(), lp = ctx.createBiquadFilter(), end = t + dur + 0.08;
    lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack + 0.001, dur * 0.8)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    const lfo = vib ? ctx.createOscillator() : null, lg = vib ? ctx.createGain() : null;
    if (lfo) { lfo.frequency.value = vib; lg.gain.value = freq * 0.006; lfo.connect(lg); lfo.start(t); lfo.stop(end); }
    for (const dt of detune) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = dt; if (lg) lg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(end); }
    lp.connect(g).connect(musicBus);
  }
  // The players: (frequency, when, level, length). Plucked and struck ones ring on their own and ignore the length.
  const INST = {
    epiano: (f, at, v) => epiano(f, at, v), marimba: (f, at, v) => marimba(f, at, v), pan: (f, at, v) => pan(f, at, v),
    guitar: (f, at, v) => voice(f, at, 0.7, { type: 'sawtooth', vol: v * 1.5, attack: 0.004, release: 0.7, cutoff: 650, to: [musicBus, fx.echo] }), // nylon: bright at the pluck, dull at once
    banjo: (f, at, v) => voice(f, at, 0.28, { type: 'square', vol: v * 0.9, attack: 0.002, release: 0.28, cutoff: 1500 }), // also the ukulele: short and twangy
    oud: (f, at, v) => voice(f, at, 0.5, { type: 'sawtooth', detune: [-7, 7], vol: v * 1.0, attack: 0.003, release: 0.5, cutoff: 900, to: [musicBus, fx.echo] }), // double strings
    pizz: (f, at, v) => voice(f, at, 0.24, { type: 'sawtooth', vol: v * 1.6, attack: 0.003, release: 0.24, cutoff: 520 }),
    mandolin: (f, at, v, d) => { for (let k = 0; k < 4; k++) voice(f, at + k * d / 4, 0.15, { type: 'sawtooth', vol: v * (k ? 0.5 : 0.8), attack: 0.002, release: 0.15, cutoff: 1400 }); }, // tremolo
    glock: (f, at, v) => { voice(f, at, 0.9, { type: 'sine', vol: v * 0.8, attack: 0.002, release: 0.9, to: [musicBus, fx.echo] }); voice(f * 2.76, at, 0.12, { type: 'sine', vol: v * 0.2, attack: 0.002, release: 0.12 }); },
    box: (f, at, v) => { voice(f, at, 0.6, { type: 'sine', vol: v * 0.9, attack: 0.002, release: 0.6, to: [musicBus, fx.echo] }); voice(f * 3, at, 0.08, { type: 'sine', vol: v * 0.15, attack: 0.002, release: 0.08 }); }, // 오르골, celesta
    kalimba: (f, at, v) => { voice(f, at, 0.5, { type: 'sine', vol: v * 1.2, attack: 0.002, release: 0.5, to: [musicBus, fx.echo] }); voice(f * 5.4, at, 0.05, { type: 'sine', vol: v * 0.3, attack: 0.002, release: 0.05 }); },
    flute: (f, at, v, d) => daegeum(f, at, d * 0.95, v * 1.1), // the breathy flute without its Korean ornaments
    whistle: (f, at, v, d) => reed(f, at, d * 0.9, { type: 'sine', vol: v * 0.8, cutoff: 8000, attack: 0.04, vib: 5.5 }),
    accordion: (f, at, v, d) => reed(f, at, d * 0.95, { type: 'square', detune: [-9, 9], vol: v * 0.5, cutoff: 1500, attack: 0.04 }), // two reeds a little apart
    organ: (f, at, v, d) => reed(f, at, d * 0.9, { type: 'triangle', detune: [0, 1200], vol: v * 0.9, cutoff: 3000, attack: 0.012, vib: 6 }), // a pipe and its octave
    harmonica: (f, at, v, d) => reed(f, at, d * 0.95, { type: 'square', detune: [-5, 5], vol: v * 0.38, cutoff: 2000, attack: 0.05, vib: 5 }),
    clarinet: (f, at, v, d) => reed(f, at, d * 0.92, { type: 'square', vol: v * 0.58, cutoff: 1100, attack: 0.03, vib: 5 }),
    trumpet: (f, at, v, d) => reed(f, at, d * 0.8, { type: 'sawtooth', vol: v * 0.62, cutoff: 1800, attack: 0.015 }), // muted: short and round
  };
  // bass players (frequency, when, steps it may ring) and bass lines (step, chord -> semitones above the root, or nothing)
  const BASS = {
    sub: (f, at, len) => voice(f, at, 3 * S16, { type: 'triangle', vol: 0.2, detune: [0, 5], attack: 0.01, release: len * S16, cutoff: 420 }),
    upright: (f, at) => voice(f, at, 0.4, { type: 'triangle', vol: 0.3, attack: 0.006, release: 0.4, cutoff: 500 }),
    tuba: (f, at) => reed(f, at, S16 * 1.6, { type: 'sawtooth', vol: 0.15, cutoff: 380, attack: 0.02 }),
    bassoon: (f, at) => reed(f * 2, at, S16 * 1.4, { type: 'sawtooth', vol: 0.1, cutoff: 600, attack: 0.015 }),
  };
  const TRESILLO = [0, 3, 6, 8, 11, 14], BOSSA = { 0: 0, 6: 7, 8: 7, 14: 0 };
  const LINES = {
    tresillo: s => TRESILLO.includes(s) ? (s === 14 ? 12 : 0) : null,
    oompah: s => s % 4 ? null : s % 8 ? 7 : 0,                        // root, fifth, root, fifth
    walk: (s, c) => s % 4 ? null : c[[0, 1, 2, 1][s >> 2]] - c[0],    // up the chord and back, one step a beat
    waltz: s => s ? null : 0,
    bossa: s => s in BOSSA ? BOSSA[s] : null,
  };
  // small percussion: a brush swish, a finger snap, a wood block (or a metal clink), a hand-drum 'tek', a triangle, sleigh bells
  function brush(at, vol = 0.1) { noiseHit(at, { f: 3200, q: 0.6, vol, attack: 0.03, dur: 0.16 }); }
  function snap(at) { noiseHit(at, { f: 2300, q: 3, vol: 0.2, dur: 0.05 }); }
  function block(at, f = 820, vol = 0.14, type = 'sine') { voice(f, at, 0.07, { type, vol, attack: 0.001, release: 0.07 }); }
  function tek(at, vol = 0.16) { noiseHit(at, { f: 3400, q: 2, vol, dur: 0.05 }); }
  function ting(at) { voice(4200, at, 0.5, { type: 'sine', vol: 0.03, attack: 0.001, release: 0.5 }); voice(6150, at, 0.3, { type: 'sine', vol: 0.015, attack: 0.001, release: 0.3 }); }
  function sleigh(at, vol) { noiseHit(at, { f: 7500, type: 'highpass', vol, attack: 0.004, dur: 0.07 }); }
  // the kits: what is hit on step s of the bar (16 steps; 12 in a waltz); k scales the kit's own kicks
  const DRUMS = {
    brush(s, at, k) { if (s === 0 || s === 8) kick(at, 0.4 * k); if (s === 4 || s === 12) brush(at, 0.13); if (s % 4 === 2) shaker(at, 0.04); },
    snap(s, at, k) { if (s === 0 || s === 8 || s === 10) kick(at, 0.55 * k); if (s === 4 || s === 12) snap(at); if (s % 4 === 2) shaker(at, 0.05); },
    soft(s, at, k) { if (s === 0) kick(at, 0.3 * k); if (s % 4 === 2) shaker(at, 0.05); },
    wood(s, at, k) { if (s === 0 || s === 8) kick(at, 0.5 * k); if ([2, 6, 7, 10, 14].includes(s)) block(at, s === 7 ? 1100 : 820); if (s === 4 || s === 12) brush(at, 0.1); },
    march(s, at, k) { if (s % 4 === 0) kick(at, 0.5 * k); if (s === 4 || s === 12) clap(at); if (s === 14 || s === 15) brush(at, 0.09); },
    clink(s, at, k) { if (s === 0 || s === 8) kick(at, 0.55 * k); if (s === 4 || s === 7 || s === 12) { block(at, 2400, 0.05, 'square'); block(at, 3550, 0.03, 'square'); } if (s % 4 === 2) shaker(at, 0.05); },
    waltz(s, at, k) { if (s === 0) kick(at, 0.4 * k); if (s === 4 || s === 8) brush(at, 0.1); },
    carousel(s, at, k) { if (s === 0) { kick(at, 0.35 * k); ting(at); } if (s === 4 || s === 8) brush(at, 0.08); },
    bossa(s, at, k) { if (s in BOSSA) kick(at, 0.35 * k); if ([0, 3, 6, 10, 13].includes(s)) block(at, 1700, 0.07); if (s % 2 === 0) shaker(at, s % 4 === 2 ? 0.06 : 0.035); },
    darbuka(s, at, k) { if (s === 0 || s === 8) kick(at, 0.5 * k); if (s === 2 || s === 6 || s === 12) tek(at); if (s === 14) tek(at, 0.08); },
    sleigh(s, at, k) { if (s === 0 || s === 8) kick(at, 0.35 * k); if (s % 2 === 0) sleigh(at, s % 4 ? 0.035 : 0.06); },
  };
  const COMP = { play: [0, 3, 6, 10], title: [0, 6], waltz: [4, 8] };

  function schedule() {
    const { echo, padLp, pump } = buildFx();
    while (nextT < ctx.currentTime + 0.3) {
      const at0 = Math.max(0, nextT - ctx.currentTime), play = mode !== 'title', night = mode === 'night', boss = mode === 'boss';
      if (tune.korean) { scheduleKorean(at0, play, night, boss); nextT += rushOn ? S16 / 1.2 : S16; step++; continue; }
      const N = tune.waltz ? 12 : 16, bar = Math.floor(step / N) % 4, s = step % N, chord = CHORDS[bar];
      const t0 = ctx.currentTime + at0, at = at0 + (tune.swing && s % 4 === 2 ? S16 * 0.6 : 0); // swung off-beats land late
      if (s === 0) { // pad: the whole bar, filter breathing with the bar
        padLp.frequency.setTargetAtTime(night ? 2600 : play ? 1400 : 900, t0, 0.8);
        for (const n of chord) voice(note(n), at0, N * S16, { vol: 0.04, detune: [-9, 0, 9], attack: 0.35, release: N * S16 + 0.3, to: [padLp] });
      }
      if (s % 4 === 0) { // the pump: the pad ducks on each beat and swells back before the next (deepest under the boss's kick)
        pump.gain.cancelScheduledValues(t0); pump.gain.setValueAtTime(boss ? 0.3 : play ? 0.55 : 0.7, t0); pump.gain.linearRampToValueAtTime(1, t0 + 3.2 * S16);
      }
      // keys: the chord's upper three notes, an octave up
      if ((tune.comp || COMP[tune.waltz ? 'waltz' : play ? 'play' : 'title']).includes(s))
        chord.slice(1).forEach((n, i) => INST[tune.keys](note(n + 12), at + (tune.strum ? i * 0.02 : 0), play ? 0.04 : 0.03, 3 * S16));
      if (play) {
        const b = LINES[tune.bass[1]](s, chord);
        if (b !== null) BASS[tune.bass[0]](note(ROOTS[bar] + b), at, s === 6 || s === 14 ? 2 : 3);
        DRUMS[tune.drums](s, at, boss ? 0.5 : 1);
        if (boss) { if (s % 4 === 0) kick(at, 0.5); if (s === 4 || s === 12) clap(at); } // the boss: four on the floor over the region's (halved) kicks
        if ((night || boss) && s % 2 === 1) shaker(at, 0.035);
        const m = LEAD[(step >> 1) % LEAD.length];
        if (s % 2 === 0 && m) INST[tune.lead](note(m), at, 0.12, 2 * S16);
        if (tune.fill && tune.fill[1].includes(s)) INST[tune.fill[0]](note(chord[(s >> 1) % 4] + 12 + tune.fill[2]), at, 0.05, 2 * S16);
      }
      if (night && s % 4 === 3) voice(note(chord[2] + 24), at, S16, { type: 'sine', vol: 0.05, release: 0.4, to: [musicBus, echo] });
      nextT += rushOn ? S16 / 1.2 : S16; step++; // the last-stretch rush plays 20% faster
      if (rushOn && s % 2 === 1) shaker(at, 0.05);
    }
  }
  // 본조 아리랑 (a traditional folk song) over 세마치 장단: a bar is 9 pulses, three beats of three. A note is
  // [semitones from the tonic, start pulse, pulses, mark]; the tune uses 솔₋ 라₋ 도 레 미 솔 (-5 -3 0 2 4 7).
  const AR = {
    a1: [[-5, 0, 2], [-3, 2, 1], [0, 3, 6]],                        // 아리랑
    a2: [[-5, 0, 2], [-3, 2, 1], [0, 3, 4], [2, 7, 2, 'chu']],       // 아리랑 (the second 랑 lifts)
    a3: [[2, 0, 2], [0, 2, 1], [2, 3, 3], [4, 6, 2], [2, 8, 1]],     // 아라리
    a4: [[0, 0, 2], [-3, 2, 1], [-5, 3, 6, 'toe']],                  // 요
    b2: [[2, 0, 2], [0, 2, 1], [-3, 3, 6]],                          // 고개로
    b3: [[-5, 0, 2], [-3, 2, 1], [0, 3, 6]],                         // 넘어간
    b4: [[0, 0, 6, 'toe']],                                          // 다
    c1: [[7, 0, 2], [7, 2, 1], [4, 3, 2], [2, 5, 1], [0, 6, 3]],     // 나를 버리고
    c2: [[0, 0, 5]],
  };
  const ARIRANG = ['a1', 'a2', 'a3', 'a4', 'a1', 'b2', 'b3', 'b4', 'c1', 'c2', 'a3', 'a4', 'a1', 'b2', 'b3', 'b4'].map(k => AR[k]);
  // No drone (국악 has none): janggu keeps the 장단 in play (덩 - - 덩 - - 덕 쿵 덕), the 대금 carries the tune by
  // day with a 가야금 pluck under each downbeat, the 가야금 alone takes it at night and on the menus.
  function scheduleKorean(at, play, night, boss) {
    const s = step % 9, bar = Math.floor(step / 9) % ARIRANG.length, tonic = tune.key + 12;
    if (play) {
      if (s === 0 || s === 3) { kung(at); deok(at, s === 0 ? 0.22 : 0.16); if (boss) buk(at); }
      if (s === 6 || s === 8) deok(at, 0.14);
      if (s === 7) { kung(at); if (boss) buk(at); }
    }
    for (const [deg, start, len, mark] of ARIRANG[bar]) {
      if (start !== s) continue;
      const dur = len * S16 * 0.95, f = note(tonic + deg);
      if (play && !night) { daegeum(f, at, dur, 0.12, mark); if (start === 0) pluck(note(tonic + deg - 12), at, 0.1); }
      else { pluck(note(tonic + deg - (play ? 0 : 12)), at, play ? 0.16 : 0.12); if (night && len >= 6) daegeum(f * 2, at + 0.1, dur, 0.04, mark); }
    }
  }

  // Background tracks (www/audio/bgm): the menus, each map, the night stretch and the boss. One track is decoded at a
  // time (a minute of stereo is ~25 MB decoded) and swapped with a short crossfade; each is levelled to -16 LUFS from
  // its measured loudness. While a track loads, nothing plays; if it cannot load, the synthesized band takes over.
  const BGM_LUFS = { title: -16, night: -16, boss: -16, town: -16, city: -16, oasis: -16, hanok: -16, campus: -16, snow: -16,
    market: -16, crossing: -16, stadium: -16, harbor: -16, construction: -16, park: -16, beach: -18, desert: -17.3, farm: -16,
    playground: -16, aquarium: -16, onsen: -16, nightmarket: -16, airport: -16, space: -16, xmas: -16 };
  let tuneName = 'town', track = null; // track: { name, src, g } while a file plays (or { name } while it loads)
  const trackFor = () => mode === 'title' ? 'title' : mode === 'night' ? 'night' : mode === 'boss' ? 'boss' : BGM_LUFS[tuneName] !== undefined ? tuneName : 'town';
  function syncTrack() {
    const name = trackFor();
    if (track && track.name === name) { if (track.src) track.src.playbackRate.value = rushOn ? 1.06 : 1; return; }
    const old = track, path = `audio/bgm/bgm_${name}.m4a`;
    track = { name };
    if (old && old.src) { old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25); old.src.stop(ctx.currentTime + 1.2); }
    const p = canFetch() ? root.fetch(path).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
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
      nextT = ctx.currentTime + 0.05; step = 0;
      timer = setInterval(() => {
        if (ctx.state !== 'running') { nextT = ctx.currentTime + 0.05; return; }
        syncTrack();
        if (track && track.failed) schedule(); else nextT = ctx.currentTime + 0.05; // the band only when the file cannot play
      }, 100);
    },
    stop() { clearInterval(timer); timer = null; if (track && track.src) track.src.stop(); track = null; },
    mode(m) { mode = m; },
    rush(v) { rushOn = !!v; },
    tune(name) { if (TUNES[name]) tuneName = name; if (TUNES[name] && tune !== TUNES[name]) setTune(name); }, // region name: town, city, ...
    get track() { return track && track.name; },
  };

  function setOn(kind, v) {
    on[kind] = !!v;
    if (!ctx) return;
    const bus = kind === 'sfx' ? sfxBus : musicBus, level = kind === 'sfx' ? 0.6 : 0.22;
    bus.gain.setTargetAtTime(v ? level : 0, ctx.currentTime, 0.05);
  }

  root.DuskSound = { sfx, music, setOn, band: { TUNES, INST, BASS, LINES, DRUMS }, voice: { VOWELS, WORDS, syllables }, files: { SFX_FILES, BGM_LUFS, EAT_FILE }, get on() { return Object.assign({}, on); }, get ctx() { return ctx; } };
})(this);
