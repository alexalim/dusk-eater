// The title track, written out as notes: a slow fairy-tale waltz in F (3/4, 96 BPM, 36 bars, 67.5 s, loops).
// usage: node title.mjs <out.mid>   then: node render.mjs <sf2> <out.mid> <out.wav> 2976750
// A: the tune on a music box over pizzicato oom-pah-pah. A2: the flute takes the tune, a harp ripples under it.
// B: the tune climbs in D minor, soft strings come in. A3: music box and flute together, a glockenspiel on each bar.
// Outro: four bars of harp that land on C7, so the loop falls back into the first F.
import * as fs from 'node:fs/promises';

const PPQ = 480, BPM = 96, BAR = 3 * PPQ;
// GM programs (0-based) per channel.
const CH = { box: 0, flute: 1, pizz: 2, harp: 3, strings: 4, glock: 5, bass: 6 };
const PROG = { box: 10, flute: 73, pizz: 45, harp: 46, strings: 49, glock: 9, bass: 45 };
const VOL = { box: 100, flute: 82, pizz: 70, harp: 66, strings: 52, glock: 46, bass: 84 }, PAN = { flute: 48, harp: 80, pizz: 72, strings: 64 };

// Chords: [root (bass), chord tones]
const C = { F: [41, [65, 69, 72]], Dm: [38, [62, 65, 69]], Bb: [46, [62, 65, 70]], C: [36, [64, 67, 72]], Am: [45, [64, 69, 72]],
  Gm: [43, [62, 67, 70]], C7: [36, [64, 67, 70]] };
const A_CH = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', ['Bb', 'C'], 'F'];
const B_CH = ['Dm', 'Bb', 'Gm', 'C', 'Dm', 'Bb', ['Gm', 'C'], 'C7'];
const OUT_CH = ['F', 'Bb', 'Gm', 'C7'];
// Tunes: per bar, [note, beats] (0 = rest).
const A_TUNE = [[[69, 1], [72, 1], [77, 1]], [[76, 2], [74, 1]], [[74, 1], [72, 1], [70, 1]], [[72, 2], [67, 1]],
  [[69, 1], [72, 1], [77, 1]], [[79, 1.5], [77, 0.5], [76, 1]], [[74, 1], [76, 1], [79, 1]], [[77, 3]]];
const B_TUNE = [[[77, 1], [76, 1], [74, 1]], [[74, 2], [77, 1]], [[70, 1], [74, 1], [79, 1]], [[76, 2], [72, 1]],
  [[74, 1], [77, 1], [81, 1]], [[79, 1.5], [77, 0.5], [74, 1]], [[70, 1], [72, 1], [76, 1]], [[79, 2], [0, 1]]];

const ev = []; // [tick, bytes]
const note = (ch, t, n, len, v) => { if (!n) return; ev.push([t, [0x90 | ch, n, v]], [t + Math.max(30, len - 20), [0x80 | ch, n, 0]]); };
const tune = (ch, bar0, bars, v, shift = 0) => bars.forEach((b, i) => {
  let t = (bar0 + i) * BAR;
  for (const [n, beats] of b) { note(ch, t, n && n + shift, beats * PPQ, v); t += beats * PPQ; }
});
const chordsOf = list => list.flatMap(c => Array.isArray(c) ? [c] : [[c]]);
function waltz(bar0, list, v) { // bass on 1, chord on 2 and 3; a bar of two chords splits after beat 2
  chordsOf(list).forEach((cs, i) => {
    const t = (bar0 + i) * BAR, a = C[cs[0]], b = C[cs[1] || cs[0]];
    note(CH.bass, t, a[0], PPQ * 1.5, v + 14);
    a[1].forEach(n => note(CH.pizz, t + PPQ, n, PPQ * 0.6, v));
    (cs[1] ? [b[0]] : b[1]).forEach(n => note(cs[1] ? CH.bass : CH.pizz, t + 2 * PPQ, n, PPQ * 0.6, cs[1] ? v + 10 : v - 6));
    if (cs[1]) b[1].forEach(n => note(CH.pizz, t + 2 * PPQ + PPQ / 2, n, PPQ * 0.4, v - 10));
  });
}
function harp(bar0, list, v) { // rising eighths through the chord
  chordsOf(list).forEach((cs, i) => {
    const t = (bar0 + i) * BAR, ns = [...C[cs[0]][1].map(n => n - 12), ...C[cs[cs.length - 1]][1]];
    ns.forEach((n, k) => note(CH.harp, t + k * PPQ / 2, n, PPQ * 1.5, v - k * 2));
  });
}
function pad(bar0, list, v) { chordsOf(list).forEach((cs, i) => C[cs[0]][1].forEach(n => note(CH.strings, (bar0 + i) * BAR, n - 12, BAR, v))); }

// A (bars 0-7)
tune(CH.box, 0, A_TUNE, 92); waltz(0, A_CH, 62);
// A2 (8-15): flute tune, music box an octave up on the first beat of each bar, harp
tune(CH.flute, 8, A_TUNE, 88); waltz(8, A_CH, 60); harp(8, A_CH, 58);
A_TUNE.forEach((b, i) => note(CH.box, (8 + i) * BAR, b[0][0] + 12, PPQ, 60));
// B (16-23)
tune(CH.flute, 16, B_TUNE, 92); tune(CH.box, 16, B_TUNE, 70, 12); waltz(16, B_CH, 62); pad(16, B_CH, 50); harp(20, B_CH.slice(4), 54);
// A3 (24-31): together, glockenspiel bells
tune(CH.box, 24, A_TUNE, 96); tune(CH.flute, 24, A_TUNE, 70, -12); waltz(24, A_CH, 64); pad(24, A_CH, 44);
chordsOf(A_CH).forEach((cs, i) => note(CH.glock, (24 + i) * BAR, C[cs[0]][1][2] + 12, PPQ, 50));
// Outro (32-35)
waltz(32, OUT_CH, 56); harp(32, OUT_CH, 60); pad(32, OUT_CH, 40);
note(CH.box, 32 * BAR, 81, BAR, 70); note(CH.box, 33 * BAR, 77, BAR, 64); note(CH.box, 34 * BAR, 74, BAR, 60); note(CH.box, 35 * BAR, 76, 2 * PPQ, 60);

const END = 36 * BAR;
const head = [];
for (const [k, ch] of Object.entries(CH)) {
  head.push([0, [0xc0 | ch, PROG[k]]], [0, [0xb0 | ch, 7, VOL[k]]], [0, [0xb0 | ch, 91, 70]], [0, [0xb0 | ch, 10, PAN[k] ?? 64]]);
}
const all = [...head, ...ev.filter(e => e[0] < END)].sort((a, b) => a[0] - b[0] || ((a[1][0] & 0xf0) === 0x80 ? -1 : 0) - ((b[1][0] & 0xf0) === 0x80 ? -1 : 0));
const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const tempo = Math.round(60e6 / BPM);
const body = [0, 0xff, 0x51, 3, tempo >> 16, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x58, 4, 3, 2, 24, 8];
let last = 0;
for (const [t, e] of all) { body.push(...vlq(t - last), ...e); last = t; }
body.push(...vlq(END - last), 0xff, 0x2f, 0);
const u32 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
await fs.writeFile(process.argv[2], new Uint8Array([...Buffer.from('MThd'), ...u32(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 255,
  ...Buffer.from('MTrk'), ...u32(body.length), ...body]));
console.log(process.argv[2], (END / PPQ * 60 / BPM).toFixed(2) + 's');
