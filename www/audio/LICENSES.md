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
parade, shard, star, tap, tick, win, and the swallow (gulp_small, gulp_big). The title track (bgm_title) is a new
waltz written in `tools/audio/title.mjs`, not the v2 tune. Renderer: spessasynth_core (Apache-2.0); encoder: FFmpeg AAC. Neither is shipped.
Scripts: `tools/audio/render.mjs` (BGM), `tools/audio/sfx.mjs` (effects). Source package: Ubuntu jammy
`fluid-soundfont-gm` 3.1-5.3 (`FluidR3_GM.sf2`). The character's voice (every voice_* file: the seven words in three takes, and voice_blip_a/o for dialogue) is
sung by FluidR3_GM's choir (52) and voice (53) samples. The other effects remain v2 procedural audio.

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

## Recorded effects (CC0)
These effects are cut from recordings released under CC0 1.0 (public domain); trimmed, levelled and AAC-encoded here.
No attribution is required; sources are listed for provenance.
- Kenney "Impact Sounds" (kenney.nl/assets/impact-sounds, CC0): eat_wood (impactPlank_medium_000), eat_metal
  (impactMetal_light_000), eat_stone (impactMining_000)
- Kenney "RPG Audio" (kenney.nl/assets/rpg-audio, CC0): dash (footstep01), eat_plant (cloth1)
- OpenGameArt "80 CC0 creature SFX" (opengameart.org/content/80-cc0-creature-sfx, CC0): spit (spit_01), yuck (burp_01)
- OpenGameArt "40 CC0 water/splash/slime SFX" (opengameart.org/content/40-cc0-water-splash-slime-sfx, CC0): eat_soft
  (slime_01), eat_fountain (splash_01), rain (loop_rain)
- OpenGameArt "3 pop sounds" (opengameart.org/content/3-pop-sounds, CC0): eat_pop (pop1), eat_balloon (pop2)
- OpenGameArt "Camel groan" (opengameart.org/content/camel-groan, CC0): eat_camel (camel_01)
- OpenGameArt "Undead moans" (opengameart.org/content/undead-moans, CC0): eat_zombie (undead-1)
- OpenGameArt "Female scream 1" (opengameart.org/content/female-scream-1, CC0): eat_person_high (pitched up),
  eat_person_low (pitched down)
- OpenGameArt "Rumble FX" (opengameart.org/content/rumble-fx, CC0) with Kenney impactPlate_heavy_000: eat_building
- BigSoundBank "Bus horn" #3594 (bigsoundbank.com/bus-horn-s3594.html, CC0): eat_bus
Still v2 procedural: wind, sunlight, eat_car, eat_boat, eat_bicycle, eat_cat, eat_chicken, eat_sheep, eat_cow, eat_gull.
