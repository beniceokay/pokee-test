const { chromium } = require('/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad/node_modules/playwright');
const OUT = '/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.route('**/fonts.*/**', r => r.abort());
  await p.goto('file://' + __dirname + '/../dist/neon-rust-requiem.html'); await p.waitForTimeout(800);
  await p.click('#btnFilmBoot'); await p.waitForTimeout(500);
  console.log('film start', await p.evaluate(() => [NRR.state, NRR.film, document.getElementById('skip').hidden]));
  await p.evaluate(() => NRR.seekIntro(62.5)); await p.waitForTimeout(4000);
  console.log('after title hold', await p.evaluate(() => [NRR.state, NRR.film, !document.getElementById('hud').hidden]));
  await p.screenshot({ path: OUT + '/f-chapter.png' });
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(4000); console.log(JSON.stringify(await p.evaluate(() => { const g = NRR.g; return { t: g.t.toFixed(1), score: g.score, hp: g.hp, en: g.en.length, presses: g.presses, onBeat: g.onBeat, phase: g.phase }; }))); }
  await p.screenshot({ path: OUT + '/f-play.png' });
  await p.evaluate(() => NRR.boss()); await p.waitForTimeout(9000); await p.screenshot({ path: OUT + '/f-boss.png' });
  console.log('boss', JSON.stringify(await p.evaluate(() => { const g = NRR.g; return { phase: g.phase, en: g.en.map(e => e.type + ':' + Math.round(e.hp)).join(' '), score: g.score }; })));
  await p.evaluate(() => NRR.win()); await p.waitForTimeout(4500); await p.screenshot({ path: OUT + '/f-end1.png' });
  await p.waitForTimeout(7000); await p.screenshot({ path: OUT + '/f-end2.png' });
  console.log('end', await p.evaluate(() => [NRR.state, !document.getElementById('credits').hidden]));
  console.log(errs.slice(0, 8).join('\n') || 'no errors');
  await b.close();
})();
