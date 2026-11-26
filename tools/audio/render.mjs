// Render a MIDI file with a SoundFont into a seamless loop WAV.
// Needs `npm i spessasynth_core` beside it (not a project dependency) and FluidR3_GM.sf2 (MIT, Debian/Ubuntu package
// fluid-soundfont-gm); the WAV is levelled and AAC-encoded with ffmpeg afterwards (see www/audio/LICENSES.md).
// usage: node render.mjs <sf2> <mid> <out.wav> [loopSamples]
// The song is rendered for its loop length plus a tail; the tail (reverb, note releases) is folded back onto the
// start, so when the file loops the end rings into the beginning instead of cutting off.
import * as fs from 'node:fs/promises';
import { audioToWav, BasicMIDI, SoundBankLoader, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core';

const [sfPath, midPath, outPath, loopArg] = process.argv.slice(2);
const SR = 44100, TAIL = 3 * SR;
const sf = await fs.readFile(sfPath), mid = await fs.readFile(midPath);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer.slice(mid.byteOffset, mid.byteOffset + mid.byteLength));
const bank = SoundBankLoader.fromArrayBuffer(sf.buffer.slice(sf.byteOffset, sf.byteOffset + sf.byteLength));
const synth = new SpessaSynthProcessor(SR, { eventsEnabled: false });
synth.soundBankManager.addSoundBank(bank, 'main');
await synth.ready;
synth.setSystemParameter('autoAllocateVoices', true);
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.loop = false;
seq.play();
const L = loopArg ? +loopArg : Math.round(midi.duration * SR), N = L + TAIL;
const left = new Float32Array(N), right = new Float32Array(N);
for (let done = 0; done < N;) {
  seq.processTick();
  const n = Math.min(128, N - done);
  synth.process(left, right, done, n);
  done += n;
}
const loopL = left.slice(0, L), loopR = right.slice(0, L);
if (loopArg) for (let i = 0; i < TAIL && i < L; i++) { loopL[i] += left[L + i]; loopR[i] += right[L + i]; }
const out = loopArg ? [loopL, loopR] : [left, right];
await fs.writeFile(outPath, new Uint8Array(audioToWav(out, SR)));
console.log(outPath, (out[0].length / SR).toFixed(2) + 's');
