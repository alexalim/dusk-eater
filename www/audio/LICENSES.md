# Dusk Eater Audio Pack v2 — audio provenance and licenses

## Included audio and MIDI
- Third-party soundfonts: **none**. TimGM6mb, FluidR3_GM and GeneralUser GS were not loaded, rendered, or bundled.
- Third-party audio samples, recordings, voices, and loops: **none**.
- Source of every M4A: newly generated waveforms from mathematical acoustic-inspired instrument models, filtered noise, or source-filter formant synthesis. No audio from v1 was reused.
- Sound generator: custom Dusk Eater procedural renderer v2.0 (created for this request). The renderer is not a sampled soundfont. No external sample license applies to its generated waveforms.
- MIDI: new algorithmically composed note sequences and arrangements, with GM program changes; no intentionally copied song or game theme.
- Processing software: Python, NumPy, SciPy, mido, pyloudnorm and FFmpeg used as authoring tools; their code/binaries are not distributed in this archive.

## Commercial use
The files are newly generated for the requester and intended for use, modification, and distribution in Dusk Eater, including commercial distribution, subject to applicable law and OpenAI terms. No third-party sample attribution or sample redistribution condition was identified because no third-party audio sample was used. This is a provenance statement, not a legal guarantee of copyrightability, non-infringement or App Store approval. No claim of exclusive copyright in purely AI-generated material is made.

OpenAI Terms of Use: https://openai.com/policies/terms-of-use/

## Optional future re-rendering (not used here)
FluidR3Mono GM: Debian package information https://packages.debian.org/sid/fluidr3mono-gm-soundfont — MIT license; retain applicable notices when using it. GeneralUser GS: https://schristiancollins.com/generaluser/ — read the exact version's included license; author notes sample provenance limitations. These are references only, not licenses for this package. Verify the exact downloaded version before re-rendering.

## Re-rendered in the Dusk Eater repo with FluidR3_GM (supersedes the "procedural" note above for these files)
All 25 `bgm/*.m4a` and these 15 effects were re-rendered from the v2 MIDI (and short in-code cues) with real
instrument samples from FluidR3_GM: coin, combo, eat_carousel, eat_reindeer, grow, hit, level_up, lose, night,
parade, shard, star, tap, tick, win. Renderer: spessasynth_core (Apache-2.0); encoder: FFmpeg AAC. Neither is shipped.
Scripts: `tools/audio/render.mjs` (BGM), `tools/audio/sfx.mjs` (effects). Source package: Ubuntu jammy
`fluid-soundfont-gm` 3.1-5.3 (`FluidR3_GM.sf2`). The other effects and all voices remain v2 procedural audio.

FluidR3_GM — Copyright © 2000-2002, 2008 Frank Wen; Copyright © 2008 Toby Smithe. Released under the MIT license:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
