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

  // Effects. `size` 0..1 makes a bigger swallow a lower, rounder pop.
  const sfx = {
    gulp(size = 0) {
      const f = 720 - size * 420;
      tone(f, f * 0.35, 0.13, { type: 'sine', vol: 0.55 });
      tone(f * 2.1, f * 0.9, 0.06, { type: 'triangle', vol: 0.12 });
    },
    tap() { tone(1200, 900, 0.04, { type: 'triangle', vol: 0.18 }); },
    star() { [72, 76, 79, 84].forEach((n, i) => tone(note(n), note(n), 0.22, { type: 'triangle', vol: 0.3, at: i * 0.07 })); },
    coin() { tone(note(88), note(88), 0.09, { type: 'square', vol: 0.08 }); tone(note(95), note(95), 0.25, { type: 'square', vol: 0.08, at: 0.08 }); },
    level() { [67, 72, 76, 79, 84].forEach((n, i) => tone(note(n), note(n), 0.3, { type: 'triangle', vol: 0.32, at: i * 0.09 })); },
    lit() { tone(260, 180, 0.18, { type: 'sawtooth', vol: 0.07 }); tone(250, 175, 0.18, { type: 'sawtooth', vol: 0.07, at: 0.2 }); },
    night() { [84, 79, 76, 72, 67].forEach((n, i) => tone(note(n), note(n), 0.5, { type: 'sine', vol: 0.25, at: i * 0.12 })); },
    win() { [60, 64, 67, 72, 76].forEach((n, i) => tone(note(n), note(n), 0.35, { type: 'triangle', vol: 0.3, at: i * 0.1 })); },
    lose() { [67, 64, 60].forEach((n, i) => tone(note(n), note(n), 0.4, { type: 'triangle', vol: 0.25, at: i * 0.16 })); },
  };

  // Background music: a small synth band in A minor (Am - F - C - G), scheduled a little ahead of time.
  //   pad: three detuned saws per chord note through a slowly breathing low-pass
  //   arp: a 16th-note pluck with a dotted-8th echo     bass: filtered saw on 8ths
  //   lead: a soft pentatonic line                       drums: synthesized kick and hi-hat
  // mode 'title' keeps it to pad + arp; 'play' brings in bass and drums; 'night' opens the filter and adds sparkle.
  const BPM = 100, S16 = 60 / BPM / 4;
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G (one bar each)
  const ROOTS = [45, 41, 36, 43];
  const LEAD = [76, null, null, 74, 72, null, 69, null, 72, null, 74, null, 76, null, 79, null,
                81, null, 79, null, 76, null, 74, null, 72, null, null, null, 69, null, null, null];
  let timer = null, step = 0, nextT = 0, mode = 'title', fx = null, noise = null;

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
      const play = mode !== 'title', night = mode === 'night';
      if (s === 0) { // pad: the whole bar, filter breathing with the bar
        padLp.frequency.setTargetAtTime(night ? 2600 : play ? 1400 : 900, ctx.currentTime + at, 0.8);
        for (const n of chord) voice(note(n), at, 16 * S16, { vol: 0.05, detune: [-9, 0, 9], attack: 0.35, release: 16 * S16 + 0.3, to: [padLp] });
      }
      const arp = chord[[0, 1, 2, 1][s % 4]] + 12 + (s >= 8 && night ? 12 : 0); // arp: up an octave, higher at night
      voice(note(arp), at, S16, { type: 'square', vol: 0.05, release: 0.18, cutoff: night ? 2600 : 1500, to: [musicBus, echo] });
      if (play) {
        if (s % 2 === 0) voice(note(ROOTS[bar] + (s % 8 === 6 ? 12 : 0)), at, 2 * S16, { vol: 0.16, detune: [0, 6], release: 0.22, cutoff: 380 });
        if (s % 4 === 0) kick(at);
        if (s % 4 === 2 || (night && s % 2 === 1)) hat(at, s % 4 === 2 ? 0.12 : 0.05);
        const m = LEAD[(step >> 1) % LEAD.length];
        if (s % 2 === 0 && m) voice(note(m), at, 2 * S16, { type: 'triangle', vol: 0.12, attack: 0.02, release: 0.5, to: [musicBus, echo] });
      }
      if (night && s % 4 === 3) voice(note(chord[2] + 24), at, S16, { type: 'sine', vol: 0.05, release: 0.4, to: [musicBus, echo] });
      nextT += S16; step++;
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
  };

  function setOn(kind, v) {
    on[kind] = !!v;
    if (!ctx) return;
    const bus = kind === 'sfx' ? sfxBus : musicBus, level = kind === 'sfx' ? 0.6 : 0.22;
    bus.gain.setTargetAtTime(v ? level : 0, ctx.currentTime, 0.05);
  }

  root.DuskSound = { sfx, music, setOn, get on() { return Object.assign({}, on); }, get ctx() { return ctx; } };
})(this);
