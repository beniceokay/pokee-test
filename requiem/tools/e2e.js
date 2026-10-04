const { chromium } = require('/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1])); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto('file://' + __dirname + '/../dist/neon-rust-requiem.html');
  await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/e-boot.png' });
  await p.click('#btnEnter'); await p.waitForTimeout(600);
  const shot = async (name, ms) => { await p.waitForTimeout(ms || 1200); await p.screenshot({ path: OUT + '/' + name + '.png' }); };
  for (const [t, n] of [[3, 'e-void'], [12, 'e-neb'], [26, 'e-stat'], [40, 'e-ang'], [52, 'e-cresc'], [59.5, 'e-title']]) { await p.evaluate(t => NRR.seekIntro(t), t); await shot(n, 1500); }
  console.log('after intro', await p.evaluate(() => NRR.state));
  await p.click('#btnDescend'); await p.waitForTimeout(1500);
  await p.mouse.move(400, 225);
  // play: sweep reticle, click on beats-ish
  for (let i = 0; i < 24; i++) { await p.mouse.move(400 + Math.sin(i * 0.7) * 200, 225 + Math.cos(i * 0.5) * 90, { steps: 3 }); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up(); await p.waitForTimeout(250); if (i === 14) await p.screenshot({ path: OUT + '/e-game1.png' }); }
  console.log('game', JSON.stringify(await p.evaluate(() => { const g = NRR.g; return { st: NRR.state, t: +g.t.toFixed(2), score: g.score, hp: g.hp, en: g.en.length, pb: g.pb.length, eb: g.eb.length, presses: g.presses, onBeat: g.onBeat, scale: NRR.R.scale }; })));
  await p.evaluate(() => NRR.boss()); await p.waitForTimeout(6000); await p.screenshot({ path: OUT + '/e-boss.png' });
  console.log('boss', JSON.stringify(await p.evaluate(() => { const g = NRR.g; return { st: NRR.state, phase: g.phase, en: g.en.map(e => e.type + ':' + e.rz.toFixed(1)).join(' '), eb: g.eb.length }; })));
  await p.evaluate(() => NRR.killAll()); await p.waitForTimeout(800); await p.evaluate(() => NRR.killAll()); await p.waitForTimeout(3000);
  console.log('after boss', JSON.stringify(await p.evaluate(() => ({ st: NRR.state, phase: NRR.g.phase, sector: NRR.g.sector }))));
  await shot('e-sector2', 2500);
  await p.evaluate(() => NRR.win()); await shot('e-end1', 4000); await shot('e-end2', 8000);
  console.log('end', await p.evaluate(() => NRR.state));
  console.log(errs.slice(0, 12).join('\n') || 'no errors');
  await b.close();
})();
