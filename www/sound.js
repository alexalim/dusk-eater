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
    musicBus = ctx.createGain(); musicBus.gain.value = on.music ? 0.22 : 0; musicBus.connect(master);
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

  // Background tune: a soft pentatonic melody over a two-chord bass, scheduled a little ahead of time.
  // `night` adds a high sparkle line for the finale.
  const BPM = 92, STEP = 60 / BPM / 2; // eighth notes
  const MELODY = [72, null, 74, 76, null, 79, 76, null, 74, null, 72, 69, null, 72, null, null,
                  76, null, 79, 81, null, 79, 76, null, 74, 76, null, 72, null, 69, null, null];
  const BASS = [48, 48, 55, 55, 45, 45, 52, 52]; // one per bar half
  let timer = null, stepN = 0, nextT = 0, nightMode = false;
  function schedule() {
    while (nextT < ctx.currentTime + 0.25) {
      const at = nextT - ctx.currentTime, m = MELODY[stepN % MELODY.length];
      if (m) tone(note(m), note(m), STEP * 1.8, { type: 'triangle', vol: 0.35, at, bus: musicBus, attack: 0.02 });
      if (stepN % 4 === 0) { const b = BASS[(stepN / 4) % BASS.length]; tone(note(b), note(b), STEP * 3.6, { type: 'sine', vol: 0.5, at, bus: musicBus, attack: 0.03 }); }
      if (nightMode && stepN % 2 === 1) { const s = [84, 88, 91, 96][(stepN >> 1) % 4]; tone(note(s), note(s), STEP, { type: 'sine', vol: 0.12, at, bus: musicBus }); }
      nextT += STEP; stepN++;
    }
  }
  const music = {
    start() {
      if (!init() || timer) return;
      nextT = ctx.currentTime + 0.05; stepN = 0;
      timer = setInterval(() => { if (ctx.state === 'running') schedule(); else nextT = ctx.currentTime + 0.05; }, 100);
    },
    stop() { clearInterval(timer); timer = null; },
    night(v) { nightMode = !!v; },
  };

  function setOn(kind, v) {
    on[kind] = !!v;
    if (!ctx) return;
    const bus = kind === 'sfx' ? sfxBus : musicBus, level = kind === 'sfx' ? 0.6 : 0.22;
    bus.gain.setTargetAtTime(v ? level : 0, ctx.currentTime, 0.05);
  }

  root.DuskSound = { sfx, music, setOn, get on() { return Object.assign({}, on); }, get ctx() { return ctx; } };
})(this);
