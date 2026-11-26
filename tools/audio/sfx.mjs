// Musical effects played on real instrument samples (FluidR3_GM): each cue is a few notes, written as a tiny MIDI
// file in memory and rendered with the same synth as the background tracks.
// Needs `npm i spessasynth_core` beside it (not a project dependency) and FluidR3_GM.sf2 (MIT, Debian/Ubuntu package
// fluid-soundfont-gm); the WAV is levelled and AAC-encoded with ffmpeg afterwards (see www/audio/LICENSES.md).
// usage: node sfx.mjs <sf2> <outdir> [names...]  (no names: every cue)
import * as fs from 'node:fs/promises';
import { audioToWav, BasicMIDI, SoundBankLoader, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core';

const [sfPath, outDir] = process.argv.slice(2);
const SR = 44100, PPQ = 480, BPM = 120, sec = s => Math.round(s * PPQ * BPM / 60);
// GM programs (0-based): 8 celesta, 9 glockenspiel, 10 music box, 11 vibraphone, 12 marimba, 13 xylophone,
// 45 pizzicato strings, 46 harp, 115 woodblock. Channel 9 is drums (36 kick, 38 snare, 54 tambourine, 81 triangle).
// Each note: [time s, midi note, length s, velocity, channel]; `prog` gives each channel its instrument.
const CUES = {
  tap: { prog: { 0: 115 }, len: 0.25, notes: [[0, 84, 0.05, 70]] },
  tick: { prog: { 0: 115 }, len: 0.2, notes: [[0, 91, 0.04, 60]] },
  coin: { prog: { 0: 9 }, len: 0.6, notes: [[0, 88, 0.08, 95], [0.07, 95, 0.3, 105]] },
  combo: { prog: { 0: 8 }, len: 0.45, notes: [[0, 79, 0.12, 100]] },
  star: { prog: { 0: 9 }, len: 0.9, notes: [72, 76, 79, 84].map((n, i) => [i * 0.07, n, 0.3, 95 + i * 5]) },
  level_up: { prog: { 0: 13, 1: 9 }, len: 1.2, notes: [67, 72, 76, 79, 84].map((n, i) => [i * 0.09, n, 0.25, 100])
    .concat([[0.36, 96, 0.5, 70, 1]]) },
  win: { prog: { 0: 12, 1: 9 }, len: 1.7, notes: [60, 64, 67, 72].map((n, i) => [i * 0.1, n, 0.3, 105])
    .concat([[0.4, 76, 0.9, 110], [0.4, 72, 0.9, 90], [0.4, 67, 0.9, 85], [0.4, 88, 0.9, 80, 1], [0.4, 81, 0.9, 70, 9]]) },
  lose: { prog: { 0: 45, 1: 12 }, len: 1.3, notes: [[0, 67, 0.2, 100], [0.16, 63, 0.2, 95], [0.32, 60, 0.6, 100], [0.32, 48, 0.6, 80, 1]] },
  night: { prog: { 0: 8, 1: 11 }, len: 1.9, notes: [84, 79, 76, 72, 67].map((n, i) => [i * 0.12, n, 0.6, 85])
    .concat([[0.6, 55, 1.2, 60, 1], [0.6, 62, 1.2, 55, 1]]) },
  parade: { prog: { 0: 13 }, len: 1.4, notes: [67, 71, 74, 79, 74, 79].map((n, i) => [i * 0.12, n, 0.1, 100])
    .concat([0, 0.24, 0.48, 0.6].map(t => [t, 38, 0.05, 80, 9]), [[0.6, 81, 0.6, 70, 9]]) },
  shard: { prog: { 0: 10 }, len: 0.6, notes: [[0, 96, 0.15, 90], [0.05, 100, 0.15, 85], [0.1, 103, 0.3, 80]] },
  hit: { prog: { 0: 13 }, len: 0.75, notes: [[0, 36, 0.1, 110, 9], [0.1, 84, 0.15, 100], [0.18, 91, 0.35, 105]] },
  grow: { prog: { 0: 46, 1: 9 }, len: 1.0, notes: [60, 64, 67, 72, 76, 79, 84].map((n, i) => [i * 0.04, n, 0.4, 85])
    .concat([[0.3, 91, 0.5, 70, 1], [0.38, 96, 0.5, 65, 1]]) },
  eat_carousel: { prog: { 0: 10 }, len: 0.8, notes: [72, 76, 79, 84, 79].map((n, i) => [i * 0.1, n, 0.25, 90]) },
  eat_reindeer: { prog: { 0: 9 }, len: 0.6, notes: [[0, 54, 0.3, 90, 9], [0.12, 54, 0.3, 80, 9], [0, 96, 0.2, 60], [0.09, 98, 0.2, 55]] },
  // The swallow: a kalimba note that slides up (뽁) over a soft marimba body; the big one first sinks (꿀) then pops (꺽).
  // bends: [time s, semitones, channel], joined in straight lines.
  gulp_small: { prog: { 0: 108, 1: 12 }, len: 0.3, notes: [[0, 74, 0.1, 105], [0, 62, 0.08, 70, 1]],
    bends: [[0, -5, 0], [0.07, 4, 0]] },
  gulp_big: { prog: { 0: 12, 1: 108, 2: 116 }, len: 0.55, notes: [[0, 57, 0.11, 105], [0.12, 67, 0.14, 110, 1], [0.12, 43, 0.12, 60, 2]],
    bends: [[0, 0, 0], [0.1, -4, 0], [0.12, -6, 1], [0.22, 5, 1]] },
};
const only = process.argv.slice(4);

const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
function smf({ prog, notes, bends = [] }) {
  const ev = [];
  for (const [ch, p] of Object.entries(prog)) ev.push([0, [0xc0 | +ch, p]], [0, [0xb0 | +ch, 101, 0]], [0, [0xb0 | +ch, 100, 0]], [0, [0xb0 | +ch, 6, 12]]); // bend range 12
  const bendAt = (ch, s) => { const v = Math.max(0, Math.min(16383, Math.round(8192 + s / 12 * 8191))); return [0xe0 | ch, v & 127, v >> 7]; };
  for (const ch of new Set(bends.map(b => b[2]))) { // straight lines between points, a step every 5 ms
    const pts = bends.filter(b => b[2] === ch);
    pts.forEach(([t, s], i) => {
      const [t1, s1] = pts[i + 1] || [t, s];
      for (let u = t; u < t1 || u === t; u += 0.005) { ev.push([sec(u), bendAt(ch, t1 > t ? s + (s1 - s) * (u - t) / (t1 - t) : s)]); if (t1 <= t) break; }
    });
  }
  for (const [t, n, l, v, ch = 0] of notes) { ev.push([sec(t), [0x90 | ch, n, v]]); ev.push([sec(t + l), [0x80 | ch, n, 0]]); }
  const order = { 0xc0: 0, 0xb0: 1, 0xe0: 2, 0x80: 3, 0x90: 4 }; // at one tick: program, controllers, bend, note-offs, note-ons
  ev.sort((a, b) => a[0] - b[0] || order[a[1][0] & 0xf0] - order[b[1][0] & 0xf0]);
  const tempo = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]; // 500000 us per beat = 120 BPM
  const body = [...tempo]; let last = 0;
  for (const [t, e] of ev) { body.push(...vlq(t - last), ...e); last = t; }
  body.push(0, 0xff, 0x2f, 0);
  const u32 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([...Buffer.from('MThd'), ...u32(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 255, ...Buffer.from('MTrk'), ...u32(body.length), ...body]);
}

const sf = await fs.readFile(sfPath);
const bank = SoundBankLoader.fromArrayBuffer(sf.buffer.slice(sf.byteOffset, sf.byteOffset + sf.byteLength));
for (const [name, cue] of Object.entries(CUES)) {
  if (only.length && !only.includes(name)) continue;
  const synth = new SpessaSynthProcessor(SR, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(bank, 'main');
  await synth.ready;
  synth.setSystemParameter('autoAllocateVoices', true);
  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([BasicMIDI.fromArrayBuffer(smf(cue).buffer)]);
  seq.loop = false;
  seq.play();
  const N = Math.round(cue.len * SR), L = new Float32Array(N), R = new Float32Array(N);
  for (let done = 0; done < N;) { seq.processTick(); const n = Math.min(128, N - done); synth.process(L, R, done, n); done += n; }
  const fade = Math.round(0.12 * SR); // the last moment fades so a ringing note does not click off
  for (let i = 0; i < fade; i++) { const g = 1 - i / fade; L[N - fade + i] *= g; R[N - fade + i] *= g; }
  await fs.writeFile(`${outDir}/${name}.wav`, new Uint8Array(audioToWav([L, R], SR)));
  console.log(name);
}
