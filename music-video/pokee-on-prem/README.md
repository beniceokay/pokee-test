# POKEE — ON-PREM (music video)

A futuristic fashion music video for the Suno track "POKEE ON-PREM", built with Pokee Isaac.
Isaac generated the WebGL motion-graphics engine (`index.html`); Claude did the audio and lyric analysis,
built the timeline, debugged and directed the engine, and rendered the video frame by frame.

## Contents
- `index.html`: the render engine (WebGL transitions, grading, HUD, kinetic lyrics, events). Open it over
  http with `?render=1` for frame rendering, or without it for a live preview synced to `song.mp3`.
- `timeline.js`: the generated timeline: beats, sections, 128 shots, word-timed lyrics, HUD events and the audio envelope.
- `fonts/`: Bodoni Moda, Anton, Inter Tight and JetBrains Mono (SIL Open Font License, from Fontsource).
- `scripts/`: the pipeline:
  - `beats.py`: tempo and beat analysis (librosa)
  - `asr.py`: word timestamps (faster-whisper)
  - `align.py`: aligns the timestamps to `lyrics.txt`
  - `prep.py`: image resize and tagging
  - `build_timeline.py`: writes `timeline.js`
  - `prender.js` / `renderall.sh`: chunked headless-Chrome frame rendering
  - `sweep.js`: renders every 0.5 s of the song and reports engine errors

## Not committed (too large)
- `img/000.jpg … 127.jpg`: run `scripts/prep.py` on the 128 Midjourney PNGs.
- `song.mp3`: the track.
