const { chromium } = require('/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [file, section = 'intro', dur = '64', intensity = '2', sector = '0'] = process.argv.slice(2);
  const src = fs.readFileSync(file, 'utf8');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addScriptTag({ content: src });
  const r = await p.evaluate(async ({ section, dur, intensity, sector }) => {
    const sr = 22050, D = +dur;
    const ctx = new OfflineAudioContext(2, sr * D, sr);
    const m = createMusic(ctx, ctx.destination);
    const kicks = [], snares = [];
    m.onKick = t => kicks.push(t); m.onSnare = t => snares.push(t);
    m.setIntensity(+intensity); m.setSector(+sector);
    m.play(section, 0.05);
    // drive tick() via suspend points every 25ms of audio time
    let err = null;
    for (let t = 0; t < D - 0.05; t += 0.025) {
      ctx.suspend(t).then(() => { try { m.tick(ctx.currentTime); if (section === 'game' && ctx.currentTime > 1 && ctx.currentTime < 1.03) m.harmonic(ctx.currentTime + 0.05, 3); } catch (e) { err = err || String(e.stack || e); } ctx.resume(); });
    }
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, nan = 0; const win = sr * 4, rms = [];
    for (let i = 0; i < L.length; i += win) { let s = 0; for (let j = i; j < Math.min(L.length, i + win); j++) { const v = L[j], w = R[j]; if (isNaN(v)) nan++; peak = Math.max(peak, Math.abs(v), Math.abs(w)); s += v * v; } rms.push((20 * Math.log10(Math.sqrt(s / win) + 1e-9)).toFixed(1)); }
    const dKick = kicks.slice(1, 9).map((k, i) => (k - kicks[i]).toFixed(3));
    return { err, peakDb: (20 * Math.log10(peak + 1e-9)).toFixed(2), nan, rms4s: rms.join(' '), kicks: kicks.length, snares: snares.length, firstKicks: kicks.slice(0, 6).map(x => x.toFixed(3)).join(','), kickGaps: dKick.join(',') };
  }, { section, dur, intensity, sector });
  console.log(JSON.stringify(r, null, 1)); if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await b.close();
})();
