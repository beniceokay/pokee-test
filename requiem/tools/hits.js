const { chromium } = require('/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + __dirname + '/../dist/neon-rust-requiem.html'); await p.waitForTimeout(800);
  await p.click('#btnEnter'); await p.waitForTimeout(300); await p.evaluate(() => NRR.skipIntro()); await p.waitForTimeout(500);
  await p.evaluate(() => NRR.startGame()); await p.waitForTimeout(500);
  for (let i = 0; i < 60; i++) {
    const tgt = await p.evaluate(() => { const g = NRR.g; const e = g.en.find(e => !e.dead && e.rz > 5 && e.rz < 40); if (!e) return null; const R = NRR.R;
      const z = e.rz; let ux = (e.x - g.cam.x) / z * 1.6, uy = (e.y - g.cam.y) / z * 1.6; const c = Math.cos(-g.cam.roll), s = Math.sin(-g.cam.roll); const rx = c * ux + s * uy, ry = -s * ux + c * uy;
      return { x: innerWidth / 2 + rx * innerHeight, y: innerHeight / 2 - ry * innerHeight, rz: z, type: e.type }; });
    if (tgt) { await p.mouse.move(tgt.x, tgt.y); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); }
    await p.waitForTimeout(200);
  }
  console.log(JSON.stringify(await p.evaluate(() => { const g = NRR.g; return { t: g.t.toFixed(1), score: g.score, hp: g.hp, en: g.en.length, presses: g.presses, scale: NRR.R.scale }; })));
  await b.close();
})();
