# Dusk Eater Audio Pack v2.0 — procedural edition

## Contents
97 AAC M4A files at 44.1 kHz stereo: 25 BGM, 45 effects (36 replacements + 9 new person/animal effects), 27 mascot voice variants. All 25 corresponding GM MIDI files are included. Voice files are located in `sfx/` to retain the v1 manifest structure; no eat_dog file is included. `missing` is empty because all requested names have non-silent generated audio, not because all sound design has been approved.

## What changed
The v1 ZIP was inspected for exact filenames, durations, BPM and GM programs. Its MIDI source was not included. The v2 compositions were newly created, preserving v1 BPM and program numbers; they are not faithful re-renders of v1 melodies. All 36 original SFX were replaced to ensure no dependency on v1 audio. No installed TimGM6mb soundfont was used. A licensed external soundfont could not be obtained in this environment (network/DNS failure); therefore this edition uses original procedural synthesis, NOT real instrument samples. The GM program labels in MIDI describe intended instruments, not the exact timbre of the mathematical renderer.

## Methods
- BGM: original seeded motifs, harmonic progressions, phrase variations, three melodic/accompaniment/bass tracks, 3/4 or 4/4; modal percussion, harmonic plucked strings, simple reed/wind models, and circular room reflections. Styles are simplified: traditional instruments and genre-specific drum arrangements are not fully recreated.
- SFX: modeled resonances, pitch sweeps, filtered random noise and envelope shaping. These are not recorded Foley. Rain/wind use shaped noise; audition their repeat transitions.
- Voices: original harmonic source with time-varying formant resonances and pitch contours. Each mascot utterance has three pitch variants. Human, animal and zombie sounds are stylized approximations with suction effects; not recordings, voice clones or accurate Korean speech. Some may sound synthetic or less recognizable than desired. No listening-based approval was performed.

## Audio and integration
BGM uses full-bar loops, no final fadeout, and circular reflections. `loop_samples` is the intended PCM loop length at 44.1 kHz. AAC can introduce codec priming/padding; use a decoder/player that respects edit lists and loop the decoded PCM range, and test the actual game engine for clicks or gaps. A seamless transition has not been confirmed by listening or in-game playback. MIDI has 480 ticks per beat, tempo/time signature, and zero-based GM program numbers (add one for 1-based GM tables). MIDI files can be rendered with a verified licensed soundfont on your machine. Audio includes approximate integrated LUFS (pyloudnorm) and 4x oversampled decoded true peak values in manifest. The duration field is intended source PCM duration; verified_media records AAC container durations.

## Release gate
All names, codec, sample rate, channel counts, MIDI program changes, intended track durations and decoded peak thresholds were checked. No external sample license issue remains in this procedural pack, but the requested real acoustic sample fidelity was not achieved. Review all tracks by ear, especially mascot/animal effects and loop boundaries, before shipping. See LICENSES.md for provenance. This is not an assertion of App Store legal approval or final audio quality.
