# Neon Rust Requiem

A playable music video: a 60-second raymarched cinematic, a rhythm shooter through a rotting orbital cathedral, and a hands-free Film Mode that can record itself to `.webm`. Single HTML file, no assets — every frame is raymarched on the GPU and the score is synthesised live with Web Audio.

Built by Claude and Pokee Isaac together.

## Who made what

| Part | Isaac | Claude |
|---|---|---|
| Music engine (`src/music.js`) | Wrote it: arrangement, synths, gated drums, formant choir, sidechain | Fixed seeking, the crescendo roll, octave runaway in harmonic notes |
| Station shader (`shaders/station.glsl`) | Geometry: segmented ring, spire, organ pipes, cables | Fixed the raymarch (it never hit), rewrote shading and windows, tamed the glow |
| Nebula, tunnel (`shaders/nebula.glsl`, `shaders/tunnel.glsl`) | First drafts and layout (corridor, flare, octagon ribs, stained glass, beat wave, rose-window eye) | Rewrote both on that layout |
| Angel (`shaders/angel.glsl`) | Halo/crown/wing layout | Rewrote: porcelain face SDF, anatomical wings, cracks, tears, reveal and ascend |
| Engine (`src/render.js`, `src/sprites.js`, `src/main.js`) | — | HDR pipeline, bloom, ACES, director timeline, game, film autopilot, recording |

Isaac's untouched first drafts are kept in `isaac/` for comparison.

## Build and test

```sh
python3 tools/build.py                 # -> dist/neon-rust-requiem.html
node tools/still.js angel out.png 40 0.5 0,1,0.3,0   # render one shader frame
node tools/e2e.js                      # boot → intro → game → boss → ending, screenshots
node tools/film.js                     # Film Mode end to end
node tools/audiotest.js src/music.js intro 64        # offline-render the score, report levels
```

The tools expect Playwright and the Chromium at `/opt/pw-browsers/chromium`.

## Controls

Mouse or touch steers the reticle. Hold to fire on the 8th-note grid; tap exactly on the beat for a harmonic shot that plays a note and builds combo. Hold Shift or right-click (LOCK on touch) to sweep up to eight lock-ons, release to fire lasers on successive 16ths. P pauses, M mutes, F goes fullscreen.
