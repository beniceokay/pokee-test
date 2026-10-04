const { chromium } = require('/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad/node_modules/playwright');
const OUT = '/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/neon-rust-requiem.html'); await p.waitForTimeout(1000);
  await p.screenshot({ path: OUT + '/m1.png' });
  await p.tap('#btnEnter'); await p.waitForTimeout(400); await p.evaluate(() => NRR.seekIntro(40)); await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/m2.png' });
  await p.evaluate(() => NRR.skipIntro()); await p.waitForTimeout(3500); await p.screenshot({ path: OUT + '/m3.png' });
  await p.tap('#btnDescend'); await p.waitForTimeout(500); await p.touchscreen.tap(195, 500); await p.waitForTimeout(6000); await p.screenshot({ path: OUT + '/m4.png' });
  console.log(await p.evaluate(() => [NRR.state, document.documentElement.scrollWidth, innerWidth, !document.getElementById('touchlock').hidden]), errs.join('\n') || 'no errors');
  await b.close();
})();
