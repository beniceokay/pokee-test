# GOING HARD (music video)

A cyberpunk / high-fashion sci-fi film for the instrumental "Going Harrrrrd", in eight chapters:
I. Analog Coast → II. High Signal → III. Observation → IV. Upload → V. Datamosh → VI. Red Shift → VII. Neon City → VIII. Wake.

It is built on the POKEE v2 engine: rotoscoped subjects, depth parallax, and the Footage2 layer compositor retuned with cyan/magenta rim light and a synthwave-grid background mode.

## How it was made
- `theme3.js` (Pokee Isaac) reskins the engine: the neural-link HUD, chapter cards, Unbounded word slams, holographic SYNC tags, a face-tracking scan reticle, the upload bar, a radial spectrum and the end card.
- `scripts/glue3.py` inlines the theme into the engine's scope and registers the fonts. It also adds `subjectScreenBox()`, which places the reticle using the cutout's bounding box projected through the camera, and fixes the CSS font shorthand so italic fonts actually render.
- `scripts/build_timeline3.py` writes `timeline.js`: the chapters on the song's bar-energy map, 105 beat-snapped shots, the text slams and captions, and the HUD events.

The images, cut-outs, plates, depth maps and the WAV are not committed (too large). The other fonts come from `../pokee-on-prem/fonts`, and IPAGothic is a system font.
