// Sound: every effect and the background tune are synthesized with Web Audio, so there are no sound files to ship
// or license. Effects and music each have an on/off switch the game saves. iOS only lets audio start inside a tap,
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
    return ctx;
  }
  const unlock = () => { if (init() && ctx.state === 'suspended') ctx.resume(); };
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
  function voiceOf(type) { // not `voice`: that name is the music synth's note below
    lastVoices.push(type); if (lastVoices.length > 20) lastVoices.shift();
    if (!ctx || ctx.state !== 'running') return;
    if (type === 'cat') { const f = R(520, 720); cry(f, f * 1.45, 0.16, { vol: .22, cutoff: 2200, vib: 9, depth: .03, type: 'triangle' }); cry(f * 1.4, f * 0.8, 0.28, { vol: .2, cutoff: 1800, vib: 7, depth: .05, type: 'triangle', at: 0.15 }); return; } // 야옹
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
    tone(R(600, 800), 260, 0.12, { type: 'sine', vol: .3 }); // anything else: a plain pop
  }

  const sfx = {
    voice: voiceOf, get lastVoices() { return lastVoices.slice(); },
    gulp(size = 0) {
      const f = (720 - size * 420) * R(0.92, 1.08);
      tone(f, f * 0.35, 0.13, { type: 'sine', vol: 0.55 });
      tone(f * 2.1, f * 0.9, 0.06, { type: 'triangle', vol: 0.12 });
    },
    tap() { tone(1200, 900, 0.04, { type: 'triangle', vol: 0.18 }); },
    star() { [72, 76, 79, 84].forEach((n, i) => tone(note(n), note(n), 0.22, { type: 'triangle', vol: 0.3, at: i * 0.07 })); },
    coin() { tone(note(88), note(88), 0.09, { type: 'square', vol: 0.08 }); tone(note(95), note(95), 0.25, { type: 'square', vol: 0.08, at: 0.08 }); },
    level() { [67, 72, 76, 79, 84].forEach((n, i) => tone(note(n), note(n), 0.3, { type: 'triangle', vol: 0.32, at: i * 0.09 })); },
    lit() { tone(260, 180, 0.18, { type: 'sawtooth', vol: 0.07 }); tone(250, 175, 0.18, { type: 'sawtooth', vol: 0.07, at: 0.2 }); },
    night() { [84, 79, 76, 72, 67].forEach((n, i) => tone(note(n), note(n), 0.5, { type: 'sine', vol: 0.25, at: i * 0.12 })); },
    grow() { tone(320, 960, 0.35, { type: 'triangle', vol: 0.25 }); [79, 84, 88].forEach((n, i) => tone(note(n), note(n), 0.25, { type: 'sine', vol: 0.22, at: 0.3 + i * 0.08 })); },
    hit() { tone(180, 60, 0.18, { type: 'square', vol: 0.35 }); tone(900, 1800, 0.12, { type: 'triangle', vol: 0.2, at: 0.02 }); [84, 91].forEach((n, i) => tone(note(n), note(n), 0.3, { type: 'triangle', vol: 0.25, at: 0.1 + i * 0.08 })); },
    tick() { tone(1500, 1500, 0.06, { type: 'square', vol: 0.12 }); },
    win() { [60, 64, 67, 72, 76].forEach((n, i) => tone(note(n), note(n), 0.35, { type: 'triangle', vol: 0.3, at: i * 0.1 })); },
    lose() { [67, 64, 60].forEach((n, i) => tone(note(n), note(n), 0.4, { type: 'triangle', vol: 0.25, at: i * 0.16 })); },
  };

  // Background music: a small synth band in A minor (Am - F - C - G), scheduled a little ahead of time.
  //   pad: three detuned saws per chord note through a slowly breathing low-pass
  //   arp: a 16th-note pluck with a dotted-8th echo     bass: filtered saw on 8ths
  //   lead: a soft pentatonic line                       drums: synthesized kick and hi-hat
  // mode 'title' keeps it to pad + arp; 'play' brings in bass and drums; 'night' opens the filter and adds sparkle.
  // Every region has its own tune: key, tempo, four-chord progression, lead timbre, and a melody grown from
  // a seed over the key's pentatonic scale (so it stays the same each visit). Chords are triads on scale steps.
  const DEG = { I: [0, 4, 7], ii: [2, 5, 9], iii: [4, 7, 11], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16],
    i: [0, 3, 7], iv: [5, 8, 12], v: [7, 10, 14], III: [3, 7, 10], VI: [8, 12, 15], VII: [10, 14, 17] };
  const TUNES = {
    town: { key: 60, bpm: 96, prog: ['vi', 'IV', 'I', 'V'], lead: 'triangle', seed: 1 },
    city: { key: 62, bpm: 112, prog: ['i', 'VII', 'VI', 'VII'], lead: 'square', seed: 2, minor: true },
    oasis: { key: 64, bpm: 90, prog: ['i', 'VI', 'VII', 'i'], lead: 'sine', seed: 3, minor: true },
    hanok: { key: 55, bpm: 84, prog: ['I', 'vi', 'ii', 'V'], lead: 'sine', seed: 4 },
    campus: { key: 65, bpm: 104, prog: ['I', 'V', 'vi', 'IV'], lead: 'triangle', seed: 5 },
    snow: { key: 57, bpm: 88, prog: ['I', 'iii', 'IV', 'V'], lead: 'sine', seed: 6, bells: true },
    market: { key: 58, bpm: 110, prog: ['I', 'IV', 'V', 'IV'], lead: 'square', seed: 7 },
    crossing: { key: 61, bpm: 100, prog: ['i', 'VI', 'VII', 'i'], lead: 'triangle', seed: 8, minor: true },
    stadium: { key: 62, bpm: 122, prog: ['I', 'V', 'IV', 'V'], lead: 'square', seed: 9 },
    harbor: { key: 52, bpm: 90, prog: ['i', 'VII', 'VI', 'VII'], lead: 'triangle', seed: 10, minor: true },
    construction: { key: 54, bpm: 108, prog: ['i', 'iv', 'VII', 'i'], lead: 'square', seed: 11, minor: true },
    park: { key: 55, bpm: 116, prog: ['I', 'vi', 'IV', 'V'], lead: 'square', seed: 12 },
    beach: { key: 57, bpm: 98, prog: ['I', 'IV', 'ii', 'V'], lead: 'triangle', seed: 13 },
    desert: { key: 62, bpm: 86, prog: ['i', 'VI', 'VII', 'i'], lead: 'sine', seed: 14, minor: true },
    farm: { key: 65, bpm: 100, prog: ['I', 'IV', 'I', 'V'], lead: 'triangle', seed: 15 },
    xmas: { key: 60, bpm: 104, prog: ['I', 'IV', 'V', 'I'], lead: 'sine', seed: 16, bells: true },
  };
  function melody(t) {
    const pent = t.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    let x = t.seed * 9301 + 49297, at = 2; // tiny LCG: same tune for the same region every time
    const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: 32 }, (_, k) => {
      if (k % 8 === 7 || rnd() < 0.3) return null; // breathe at phrase ends
      at = Math.max(0, Math.min(9, at + Math.round((rnd() - 0.5) * 3)));
      return t.key + 12 + pent[at % 5] + 12 * Math.floor(at / 5);
    });
  }
  let BPM = 100, S16 = 60 / BPM / 4, tune = TUNES.town, CHORDS = [], ROOTS = [], LEAD = [];
  function setTune(name) {
    tune = TUNES[name] || TUNES.town;
    BPM = tune.bpm; S16 = 60 / BPM / 4;
    CHORDS = tune.prog.map(d => DEG[d].map(o => tune.key + o));
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
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 900; padLp.Q.value = 2; padLp.connect(musicBus);
    const len = ctx.sampleRate * 0.2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
    fx = { echo: delay, padLp };
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
  function kick(at) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.32);
  }
  function hat(at, vol) {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(musicBus); src.start(t); src.stop(t + 0.06);
  }

  function schedule() {
    const { echo, padLp } = buildFx();
    while (nextT < ctx.currentTime + 0.3) {
      const at = Math.max(0, nextT - ctx.currentTime), bar = (step >> 4) % 4, s = step % 16, chord = CHORDS[bar];
      const play = mode !== 'title', night = mode === 'night', boss = mode === 'boss';
      if (s === 0) { // pad: the whole bar, filter breathing with the bar
        padLp.frequency.setTargetAtTime(night ? 2600 : play ? 1400 : 900, ctx.currentTime + at, 0.8);
        for (const n of chord) voice(note(n), at, 16 * S16, { vol: 0.05, detune: [-9, 0, 9], attack: 0.35, release: 16 * S16 + 0.3, to: [padLp] });
      }
      const arp = chord[[0, 1, 2, 1][s % 4]] + 12 + (s >= 8 && night ? 12 : 0); // arp: up an octave, higher at night
      voice(note(arp), at, S16, { type: 'square', vol: 0.05, release: 0.18, cutoff: night ? 2600 : 1500, to: [musicBus, echo] });
      if (play) {
        if (s % 2 === 0) voice(note(ROOTS[bar] + (s % 8 === 6 ? 12 : 0)), at, 2 * S16, { vol: 0.16, detune: [0, 6], release: 0.22, cutoff: 380 });
        if (s % 4 === 0 || (boss && s % 4 === 2)) kick(at); // the boss doubles the kick
        if (s % 4 === 2 || ((night || boss) && s % 2 === 1)) hat(at, s % 4 === 2 ? 0.12 : 0.05);
        const m = LEAD[(step >> 1) % LEAD.length];
        if (s % 2 === 0 && m) voice(note(m), at, 2 * S16, { type: tune.lead, vol: tune.lead === 'square' ? 0.06 : 0.12, attack: 0.02, release: 0.5, to: [musicBus, echo] });
        if (tune.bells && s % 8 === 4) voice(note(chord[1] + 24), at, S16, { type: 'sine', vol: 0.06, release: 0.9, to: [musicBus, echo] });
      }
      if (night && s % 4 === 3) voice(note(chord[2] + 24), at, S16, { type: 'sine', vol: 0.05, release: 0.4, to: [musicBus, echo] });
      nextT += rushOn ? S16 / 1.2 : S16; step++; // the last-stretch rush plays 20% faster
      if (rushOn && s % 2 === 1) hat(at, 0.06);
    }
  }
  const music = {
    start() {
      if (!init() || timer) return;
      nextT = ctx.currentTime + 0.05; step = 0;
      timer = setInterval(() => { if (ctx.state === 'running') schedule(); else nextT = ctx.currentTime + 0.05; }, 100);
    },
    stop() { clearInterval(timer); timer = null; },
    mode(m) { mode = m; },
    rush(v) { rushOn = !!v; },
    tune(name) { if (TUNES[name] && tune !== TUNES[name]) setTune(name); }, // region name: town, city, ...
  };

  function setOn(kind, v) {
    on[kind] = !!v;
    if (!ctx) return;
    const bus = kind === 'sfx' ? sfxBus : musicBus, level = kind === 'sfx' ? 0.6 : 0.22;
    bus.gain.setTargetAtTime(v ? level : 0, ctx.currentTime, 0.05);
  }

  root.DuskSound = { sfx, music, setOn, get on() { return Object.assign({}, on); }, get ctx() { return ctx; } };
})(this);
