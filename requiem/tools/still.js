// usage: node still.js <scene> <out.png> [time] [prog] [p0 csv] [p1 csv] [w] [h]
const { chromium } = require('/tmp/claude-0/-home-user-pokee-test/65b543bd-ed55-5e3f-8b30-dc2b6486e0e5/scratchpad/node_modules/playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const strip = s => s.replace(/^\s*```[a-z]*\s*$/gm, '');
(async () => {
  const [scene, out, t = '5', prog = '0.5', p0 = '0,0,0,0', p1 = '0,0,0,0', w = '960', h = '540'] = process.argv.slice(2);
  const lib = fs.readFileSync(path.join(root, 'src/lib.glsl'), 'utf8');
  const srcFile = fs.existsSync(path.join(root, 'shaders', scene + '.glsl')) ? path.join(root, 'shaders', scene + '.glsl') : path.join(root, 'isaac', scene + '.glsl');
  const body = strip(fs.readFileSync(srcFile, 'utf8'));
  const render = fs.readFileSync(path.join(root, 'src/render.js'), 'utf8');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERR ' + e.message));
  await p.setContent(`<body style="margin:0;background:#000"><canvas id=c style="width:${w}px;height:${h}px;display:block"></canvas></body>`);
  await p.addScriptTag({ content: render });
  const res = await p.evaluate(({ lib, body, scene, t, prog, p0, p1, post }) => {
    try {
      const cv = document.getElementById('c');
      const R = createRenderer(cv, { lib, preserve: true }); if (post) Object.assign(R.post, post);
      R.resize(cv.clientWidth, cv.clientHeight, 1);
      const t0 = performance.now();
      R.addScene(scene, body);
      const tc = performance.now() - t0;
      const U = { time: +t, local: +t, prog: +prog, beat: 0.05, kick: 0.6, bass: 0.5, high: 0.4, p0: p0.split(',').map(Number), p1: p1.split(',').map(Number) };
      const t1 = performance.now();
      R.beginScene(scene, U); R.finish(+t);
      R.gl.finish();
      return { ok: true, compileMs: Math.round(tc), frameMs: Math.round(performance.now() - t1) };
    } catch (e) { return { ok: false, err: String(e.message || e).slice(0, 3000) }; }
  }, { lib, body, scene, t, prog, p0, p1, post: process.env.POST ? JSON.parse(process.env.POST) : null });
  console.log(JSON.stringify(res));
  if (res.ok) await p.screenshot({ path: out });
  if (logs.length) console.log(logs.slice(0, 5).join('\n'));
  await b.close();
})();
