// ===== NEON RUST REQUIEM — director, game, input (Claude) =====
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rotv = (a, x, y) => { const c = Math.cos(a), s = Math.sin(a); return [c * x + s * y, -s * x + c * y]; }; // matches GLSL rot(a)*v
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const BPM = 128, SPB = 60 / BPM, BAR = SPB * 4, STEP16 = SPB / 4;
  const SPEED = 2 * 2.5 / SPB;          // two cathedral ribs pass per beat
  const PZ = 3.5;                       // player depth in front of camera
  const OCT = 2.25;                     // player confinement (octagon apothem)
  const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const store = { get(k, d) { try { const v = localStorage.getItem('nrr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('nrr.' + k, JSON.stringify(v)); } catch (e) { } } };
  let reduceMotion = store.get('rm', (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || false);
  let crt = store.get('crt', true);

  // ---------------------------------------------------------------- renderer
  const cv = $('gl');
  const R = createRenderer(cv, { lib: SHADER_LIB, scale: 0.7 });
  if (!R) { $('nogl').hidden = false; $('boot').hidden = true; return; }
  try { for (const k in SHADERS) R.addScene(k, SHADERS[k]); }
  catch (e) { console.error(e); $('nogl').hidden = false; $('nogl').querySelector('p').textContent = 'Your GPU could not compile the shaders: ' + String(e.message).slice(0, 160); $('boot').hidden = true; return; }
  const SP = createSprites(R, 6000);
  let cssW = 0, cssH = 0;
  function resize() { cssW = innerWidth; cssH = innerHeight; R.resize(cssW, cssH, Math.min(window.devicePixelRatio || 1, 1.5)); }
  addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- audio
  const A = { ctx: null, music: null, an: null, bins: null, kicks: [], snares: [], start: 0, lat: 0, bass: 0, high: 0, muted: false, out: null, recDest: null };
  function initAudio() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    try {
      A.ctx = new C({ latencyHint: 'interactive' });
      A.out = A.ctx.createGain(); A.an = A.ctx.createAnalyser(); A.an.fftSize = 1024; A.an.smoothingTimeConstant = 0.6;
      A.out.connect(A.an); A.an.connect(A.ctx.destination);
      A.music = createMusic(A.ctx, A.out);
      A.music.onKick = t => { A.kicks.push(t); if (A.kicks.length > 48) A.kicks.shift(); };
      A.music.onSnare = t => { A.snares.push(t); if (A.snares.length > 48) A.snares.shift(); };
      A.bins = new Uint8Array(A.an.frequencyBinCount);
      A.lat = (A.ctx.outputLatency || 0) + (A.ctx.baseLatency || 0);
      setInterval(() => { if (A.ctx && A.ctx.state === 'running') A.music.tick(A.ctx.currentTime); }, 25);
    } catch (e) { console.warn('audio unavailable', e); A.ctx = null; }
  }
  const clock = () => A.ctx ? A.ctx.currentTime : performance.now() / 1000;
  function playSection(name, when) {
    when = when == null ? clock() + 0.06 : when;
    A.start = when; A.kicks.length = 0; A.snares.length = 0;
    if (A.music) A.music.play(name, when);
  }
  const songT = () => clock() - A.start - A.lat;
  function envFrom(list, t, k) { let e = 0; for (let i = list.length - 1; i >= 0; i--) { const d = t - list[i]; if (d >= 0) { e = Math.exp(-d * k); break; } } return e; }
  function bands() {
    if (!A.an) return;
    A.an.getByteFrequencyData(A.bins);
    const hz = A.ctx.sampleRate / A.an.fftSize; let b = 0, nb = 0, h = 0, nh = 0;
    for (let i = 1; i < A.bins.length; i++) { const f = i * hz; if (f < 140) { b += A.bins[i]; nb++; } else if (f > 4000 && f < 12000) { h += A.bins[i]; nh++; } }
    A.bass = lerp(A.bass, nb ? b / nb / 255 : 0, 0.3); A.high = lerp(A.high, nh ? h / nh / 255 : 0, 0.3);
  }
  const sfx = (name, ...args) => { try { if (A.music && A.music.sfx[name]) A.music.sfx[name](clock() + 0.005, ...args); } catch (e) { } };
  function setMute(m) { A.muted = m; if (A.out) A.out.gain.setTargetAtTime(m ? 0 : 1, clock(), 0.02); $('mute').textContent = m ? 'sound off' : 'sound on'; $('mute').setAttribute('aria-pressed', String(!m)); }

  // ---------------------------------------------------------------- state
  let state = 'boot';                 // boot | intro | title | game | over | ending
  let paused = false, film = false, recording = false;
  const post = R.post;
  let flash = 0, flashCol = [1, 1, 1], glitchKick = 0, lastIntroIdx = -1;
  const fx = { shake: 0 };

  // ---------------------------------------------------------------- intro director (bar-aligned to the score)
  const INTRO = [
    { s: 0, e: 7.5, sc: 'void' },
    { s: 7.5, e: 18.75, sc: 'nebula' },
    { s: 18.75, e: 31.875, sc: 'station' },
    { s: 31.875, e: 46.875, sc: 'angel', k: 'reveal' },
    { s: 46.875, e: 56.25, sc: 'angel', k: 'cresc' },
    { s: 56.25, e: 58.125, sc: 'angel', k: 'hush' },
    { s: 58.125, e: 1e9, sc: 'angel', k: 'title' }];
  const CAPTIONS = [
    [8.6, 13.6, 'the stars are going out, one by one'],
    [20.2, 25.6, 'we built a cathedral in the sky'],
    [26.0, 31.0, 'and left it to rust'],
    [36.5, 42.5, 'she is still singing'],
    [48.8, 54.5, 'can you hear her?']];
  const TX = [[0.6, 'SIGNAL 0x00 · ORBITAL CATHEDRAL “MISS ANTHROPOCENE”'], [2.4, 'ALTITUDE 408 KM · ORBIT DECAYING · 0.3 KM/DAY'], [4.2, 'STATUS: ROTTING · ONE OCCUPANT · STILL TRANSMITTING']];
  let txShown = 0, capIdx = -1;
  function startIntro(fromT) {
    state = 'intro'; hideAll(); $('skip').hidden = !!film;
    txShown = 0; capIdx = -1; lastIntroIdx = -1; $('tx').innerHTML = ''; $('tx').hidden = false;
    playSection('intro', fromT ? clock() + 0.06 - fromT : undefined);
  }
  function introFrame(t) {
    let idx = INTRO.findIndex(x => t >= x.s && t < x.e); if (idx < 0) idx = 0;
    const sh = INTRO[idx];
    if (idx !== lastIntroIdx) { if (lastIntroIdx >= 0 && !reduceMotion) { flash = idx === 6 ? 1.0 : 0.55; glitchKick = 0.5; } lastIntroIdx = idx; if (idx === 6) onTitleCard(); }
    // transmission typing
    while (txShown < TX.length && t > TX[txShown][0]) { const d = document.createElement('div'); d.className = 'txl'; d.textContent = TX[txShown][1]; $('tx').appendChild(d); txShown++; }
    if (t > 7.2) $('tx').classList.add('out'); else $('tx').classList.remove('out');
    // captions (music-video subtitles)
    let ci = CAPTIONS.findIndex(c => t >= c[0] && t < c[1]);
    if (ci !== capIdx) { capIdx = ci; const el = $('cap'); if (ci >= 0) { el.textContent = CAPTIONS[ci][2]; el.classList.add('on'); } else el.classList.remove('on'); }
    const U = baseU(t); U.local = t - sh.s; U.prog = clamp((t - sh.s) / (sh.e - sh.s), 0, 1);
    post.letterbox = 1; post.glitch = 0; post.fade = 1; post.ca = 0.0022 + U.kick * 0.004; post.exposure = 1 + U.kick * 0.06;
    let scene = sh.sc;
    if (scene === 'void') U.p0 = [sstep(0.5, 6.5, t), 0, 0, 0];
    if (scene === 'angel') {
      const at = t - 31.875; U.local = at;
      let reveal = sstep(0.0, 7.5, at), push = 0.0;
      if (sh.k === 'reveal') push = lerp(0.0, 0.3, sstep(0, 15, at));
      else if (sh.k === 'cresc') { push = lerp(0.3, 0.85, sstep(46.875, 56.25, t)); post.glitch = sstep(46.875, 56.25, t) * 0.35 + U.kick * 0.3; post.ca += 0.004 * sstep(46.875, 56.25, t); }
      else if (sh.k === 'hush') { push = 0.85; post.fade = lerp(0.25, 0.06, sstep(56.25, 58.0, t)); post.glitch = 0.15; flash = Math.max(flash, sstep(57.4, 58.12, t) * 0.9); flashCol = [1, 1, 1]; }
      else { push = lerp(0.45, 0.06, sstep(58.125, 62.0, t)); post.letterbox = 1 - sstep(58.2, 60.5, t); post.glitch = U.kick * 0.12; if (!film) post.exposure = lerp(1, 0.75, sstep(58.5, 61, t)); }
      if (reduceMotion) post.glitch = 0;
      U.p0 = [0, reveal, push, 0];
    }
    return { scene, U };
  }
  function onTitleCard() { $('cap').classList.remove('on'); $('skip').hidden = true; if (!film) showTitle(); }
  function skipIntro() { if (state !== 'intro') return; playSection('intro', clock() + 0.06 - 58.2); }

  // ---------------------------------------------------------------- title / menu
  function hideAll() { for (const id of ['boot', 'titlecard', 'hud', 'end', 'pause', 'chapter', 'credits', 'tx', 'banner', 'lastsong', 'creditsBack']) $(id).hidden = true; $('cap').classList.remove('on'); $('touchlock').hidden = true; }
  function showTitle() {
    $('titlecard').hidden = false; $('titlecard').classList.remove('in'); void $('titlecard').offsetWidth; $('titlecard').classList.add('in');
    $('best').textContent = store.get('best', 0) ? 'best · ' + store.get('best', 0).toLocaleString() : 'no transmissions logged';
    $('btnRec').hidden = !canRecord();
    syncToggles();
  }
  function syncToggles() { $('btnCrt').textContent = 'CRT ' + (crt ? 'on' : 'off'); $('btnRm').textContent = 'reduce motion ' + (reduceMotion ? 'on' : 'off'); post.crt = crt ? 1 : 0; }

  // ---------------------------------------------------------------- game
  const SECTORS = [
    { name: 'Rust Nave', num: 'I', line: 'where the hymnals oxidise' },
    { name: 'Cryo Choir', num: 'II', line: 'frozen voices in the vents' },
    { name: 'Heaven.exe', num: 'III', line: 'the last server of god' }];
  let g = null;
  const input = { ux: 0, uy: 0, fire: false, lock: false, keys: {}, touch: false, kbd: false, lastPress: -1 };
  function newGame() {
    seed = 7;
    g = {
      t0: 0, t: 0, lastBeat: -1, lastStep8: -1, bar: 0, sector: 0, sectorStartBar: 0, sectorVis: 0, phase: 'run',
      cam: { x: 0, y: 0, roll: 0 }, pl: { x: 0, y: 0, vx: 0, vy: 0, hit: 0 },
      en: [], pb: [], eb: [], pt: [], pk: [], beams: [], locks: [], lockQ: [], lockCharge: 0,
      score: 0, combo: 0, maxCombo: 0, presses: 0, onBeat: 0, hp: 5, inv: 0, dmg: 0, boss: null, bossVis: 0,
      choir: 0, over: 0, slow: 1, chapterAt: 0, killFlash: 0, sectBars: film ? 12 : 26, lastSpawnBar: -1, hitstop: 0
    };
  }
  function startGame() {
    hideAll(); newGame(); state = 'game'; paused = false;
    if (!film) { $('hud').hidden = false; if (input.touch) $('touchlock').hidden = false; }
    if (A.music) { A.music.setSector(0); A.music.setIntensity(0); }
    playSection('game');
    showChapter(0);
    if (!film && !store.get('tutored', false)) { banner(input.touch ? 'drag to steer · tap exactly on the beat for harmonic shots · hold LOCK to lock on' : 'hold to fire · tap exactly on the beat for harmonic shots · hold shift / right-click to lock on', 7); store.set('tutored', true); }
  }
  function showChapter(i) {
    const s = SECTORS[i]; const el = $('chapter');
    el.querySelector('.cn').textContent = s.num; el.querySelector('.ct').textContent = s.name; el.querySelector('.cl').textContent = s.line;
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    clearTimeout(showChapter.tm); showChapter.tm = setTimeout(() => { el.hidden = true; }, 3600);
  }
  function banner(text, sec) { const b = $('banner'); b.textContent = text; b.hidden = false; clearTimeout(banner.tm); banner.tm = setTimeout(() => b.hidden = true, sec * 1000); }
  function intensityFor(barInSector) { return barInSector < 3 ? 0 : barInSector < 8 ? 1 : barInSector < 16 ? 2 : 3; }

  // projection: camera-relative world -> scene-target pixels (GL coords, y up)
  function proj(x, y, rz) {
    const z = Math.max(rz, 0.05);
    let ux = (x - g.cam.x) / z * 1.6, uy = (y - g.cam.y) / z * 1.6;
    const r = rotv(-g.cam.roll, ux, uy);
    return [r[0] * R.sh + R.sw * 0.5, r[1] * R.sh + R.sh * 0.5, 1.6 * R.sh / z];
  }
  function aimDir() { const r = rotv(g.cam.roll, input.ux, input.uy); const l = Math.hypot(r[0], r[1], 1.6); return [r[0] / l, r[1] / l, 1.6 / l]; }
  function octClamp(x, y, a) { const ax = Math.abs(x), ay = Math.abs(y), d = Math.max(ax, ay, (ax + ay) * 0.70710678); if (d <= a) return [x, y]; const k = a / d; return [x * k, y * k]; }

  // enemies ------------------------------------------------------------
  const ETYPE = {
    moth: { hp: 1, r: 0.42, spr: 3, col: [1.0, 0.45, 0.2], score: 100 },
    seraph: { hp: 5, r: 0.62, spr: 4, col: [0.85, 0.92, 1.0], score: 350 },
    hulk: { hp: 9, r: 0.95, spr: 5, col: [1.0, 0.35, 0.08], score: 500 },
    wraith: { hp: 3, r: 0.55, spr: 6, col: [1, 1, 1], score: 300 },
    pipe: { hp: 12, r: 0.55, spr: 10, col: [1.0, 0.25, 0.6], score: 800 },
    eye: { hp: 60, r: 1.3, spr: 13, col: [1.0, 0.3, 0.55], score: 6000 }
  };
  function spawn(type, x, y, rz, o) {
    const T = ETYPE[type];
    const e = Object.assign({ type, x, y, rz: rz || 64, hover: rr(15, 26), hp: T.hp * (film ? 0.6 : 1), max: T.hp, born: g.t, life: rr(7, 11) * SPB * 4 / 4, ph: rnd() * 6.28, seed: rnd(), shield: type === 'seraph' ? 1 : 0, flash: 0, dead: false, ox: x, oy: y, dive: false, locked: false }, o || {});
    e.max = e.hp; g.en.push(e); return e;
  }
  function spawnWave(barInSector) {
    const s = g.sector, it = intensityFor(barInSector);
    if (barInSector < 1) return;
    const pick = rnd();
    const n = 3 + it + s;
    if (pick < 0.45 || barInSector < 4) {          // moth swarm in a ring or arc
      const a0 = rnd() * 6.28, rad = rr(0.8, 1.8);
      for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.28 * (rnd() < 0.5 ? 1 : 0.5); spawn('moth', Math.cos(a) * rad, Math.sin(a) * rad, 62 + i * 1.5, { orbit: rad, oa: a, os: rr(0.6, 1.2) * (rnd() < 0.5 ? -1 : 1) }); }
    } else if (pick < 0.7) {
      const k = 1 + (it >= 2 ? 1 : 0) + (s >= 1 ? 1 : 0);
      for (let i = 0; i < k; i++) spawn('seraph', rr(-1.6, 1.6), rr(-1.2, 1.2), 64 + i * 3);
    } else if (pick < 0.85) {
      spawn('hulk', rr(-1.4, 1.4), rr(-1.0, 1.0), 66, { spin: rr(-1, 1) });
    } else {
      if (s >= 1) for (let i = 0; i < 2 + s; i++) spawn('wraith', rr(-1.8, 1.8), rr(-1.3, 1.3), 60 + i * 2);
      else for (let i = 0; i < n; i++) spawn('moth', rr(-2, 2), rr(-1.5, 1.5), 62 + i, { orbit: 0 });
    }
  }
  function startBoss() {
    g.phase = 'boss'; g.boss = { stage: 0, t0: g.t, rot: 0 };
    switchSection('boss');
    for (let i = 0; i < 6; i++) spawn('pipe', 0, 0, 70 + i, { boss: true, idx: i, hover: 21, life: 1e9 });
    banner('THE ROTTING CHOIR', 3.2);
  }
  function switchSection(name) {
    const nb = nextBarTime(), old = A.start;
    if (A.music) A.music.play(name, nb);
    g.t0 += nb - old; A.start = nb;
    return nb;
  }
  function nextBarTime() { const tt = clock() - A.start; return A.start + Math.ceil((tt + 0.05) / BAR) * BAR; }

  function enemyFire(e, kind) {
    if (g.phase === 'run' && (g.t - g.sectorT0 < BAR * 3) && g.sector === 0) return;   // gentle onboarding
    const speed = (g.sector === 0 ? 10 : 12.5) * (film ? 0.9 : 1);
    const aimAt = (dx, dy) => { const tx = g.pl.x + dx, ty = g.pl.y + dy; const L = Math.hypot(tx - e.x, ty - e.y, e.rz - PZ); return [(tx - e.x) / L * speed, (ty - e.y) / L * speed, -(e.rz - PZ) / L * speed]; };
    const shoot = (v, col, big) => g.eb.push({ x: e.x, y: e.y, rz: e.rz, vx: v[0], vy: v[1], vz: v[2], col: col || [1.0, 0.25, 0.55], big: big || 0 });
    if (kind === 'aim') shoot(aimAt(0, 0));
    else if (kind === 'triple') { for (let i = -1; i <= 1; i++) shoot(aimAt(i * 0.45, 0)); }
    else if (kind === 'ring') { const n = 8 + g.sector * 2; for (let i = 0; i < n; i++) { const a = i / n * 6.28 + g.t; const v = aimAt(Math.cos(a) * 1.4, Math.sin(a) * 1.4); shoot(v, [1.0, 0.55, 0.15]); } }
    else if (kind === 'spiral') { const a = g.t * 3 + e.idx; shoot(aimAt(Math.cos(a) * 1.1, Math.sin(a) * 1.1), [1.0, 0.3, 0.75]); }
  }

  // player actions -----------------------------------------------------
  function beatErr(t) { const ph = (t % SPB + SPB) % SPB; return Math.min(ph, SPB - ph); }
  function press(atClock) {
    if (state !== 'game' || paused || !g) return;
    const t = atClock - A.start - A.lat;
    const err = beatErr(t);
    const harm = err <= 0.095;
    g.presses++;
    if (harm) {
      g.onBeat++; g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo);
      try { if (A.music) A.music.harmonic(clock() + 0.005, g.combo); } catch (e) { }
      fire(true);
    } else {
      if (g.combo > 3) banner('off beat', 0.8);
      g.combo = 0; fire(false);
    }
  }
  function fire(harm) {
    const d = aimDir(); let tgt = [g.cam.x + d[0] / d[2] * 40, g.cam.y + d[1] / d[2] * 40, 40];
    // gentle aim assist: snap toward the enemy nearest the reticle on screen
    const rx = input.ux * R.sh + R.sw / 2, ry = input.uy * R.sh + R.sh / 2; let best = null, bd = 0.09 * R.sh;
    for (const e of g.en) { if (e.dead || e.rz < PZ + 1.5 || e.rz > 55) continue; const p = proj(e.x, e.y, e.rz); const dd = Math.hypot(p[0] - rx, p[1] - ry) - p[2] * ETYPE[e.type].r * 0.8; if (dd < bd) { bd = dd; best = e; } }
    if (best) tgt = [best.x, best.y, best.rz];
    const n = harm ? (g.choir > 0 ? 5 : 3) : (g.choir > 0 ? 3 : 1);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * (harm ? 0.35 : 0.5);
      const dx = tgt[0] + off - g.pl.x, dy = tgt[1] - g.pl.y, dz = tgt[2] - PZ; const L = Math.hypot(dx, dy, dz);
      const sp = 75;
      g.pb.push({ x: g.pl.x, y: g.pl.y, rz: PZ, vx: dx / L * sp, vy: dy / L * sp, vz: dz / L * sp, harm, life: 1.0 });
    }
    if (harm) { g.pt.push({ x: g.pl.x, y: g.pl.y, rz: PZ, vx: 0, vy: 0, vz: 0, life: 0.45, max: 0.45, type: 2, size: 0.9, col: [1.0, 0.3, 0.85] }); fx.shake = Math.max(fx.shake, 0.15); }
  }
  function releaseLock() {
    if (!g || !g.locks.length) { if (g) g.locks.length = 0; return; }
    const tt = clock() - A.start; let step = Math.ceil((tt + 0.02) / STEP16);
    g.locks.forEach((e, i) => g.lockQ.push({ e, at: A.start + (step + i) * STEP16, i }));
    g.locks.length = 0;
  }
  function damagePlayer() {
    if (g.inv > 0) return;
    if (film) { g.inv = 0.4; g.pt.push({ x: g.pl.x, y: g.pl.y, rz: PZ, vx: 0, vy: 0, vz: 0, life: 0.4, max: 0.4, type: 2, size: 1.4, col: [0.3, 0.9, 1.0] }); return; }
    g.hp--; g.inv = 1.4; g.dmg = 1; g.combo = 0; flash = 0.35; flashCol = [1, 0.1, 0.2]; fx.shake = 0.6; sfx('hurt'); updateHalo();
    if (g.hp <= 0) gameOver();
  }
  function killEnemy(e, byBeam) {
    e.dead = true; const T = ETYPE[e.type];
    const mult = 1 + Math.min(g.combo, 32) * 0.125;
    g.score += Math.round(T.score * mult);
    burst(e.x, e.y, e.rz, T.col, e.type === 'hulk' || e.type === 'eye' ? 40 : 18, e.type === 'eye' ? 3 : 1);
    sfx('explode', e.type === 'hulk' || e.type === 'eye' ? 1 : 0.4);
    if (e.type === 'hulk') for (let i = 0; i < 3; i++) spawn('moth', e.x + rr(-0.5, 0.5), e.y + rr(-0.5, 0.5), e.rz, { orbit: 0, hover: e.rz, life: 6 * SPB });
    if (e.type !== 'pipe' && e.type !== 'eye' && rnd() < 0.09) g.pk.push({ x: e.x, y: e.y, rz: e.rz, kind: rnd() });
    if (e.type === 'hulk' || e.type === 'pipe') { g.hitstop = 0.06; fx.shake = Math.max(fx.shake, 0.35); }
  }
  function burst(x, y, rz, col, n, scale) {
    scale = scale || 1;
    g.pt.push({ x, y, rz, vx: 0, vy: 0, vz: 0, life: 0.55, max: 0.55, type: 2, size: 1.6 * scale, col });
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, b = rr(-1, 1), sp = rr(2, 9) * scale;
      const c = rnd() < 0.5 ? col : (rnd() < 0.5 ? [1.0, 0.3, 0.85] : [0.3, 0.9, 1.0]);
      g.pt.push({ x, y, rz, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: b * sp, life: rr(0.3, 0.8), max: 0.8, type: rnd() < 0.6 ? 12 : 0, size: rr(0.05, 0.14) * scale, col: c });
    }
  }
  function hitEnemy(e, dmg, harm) {
    if (e.type === 'seraph' && e.shield > 0 && !harm) { e.flash = 0.15; sfx('hit'); return false; }
    if (e.type === 'seraph' && e.shield > 0 && harm) { e.shield = 0; sfx('shieldBreak'); burst(e.x, e.y, e.rz, [0.3, 0.9, 1.0], 10); }
    if (e.type === 'eye' && g.en.some(o => o.type === 'pipe' && !o.dead)) { e.flash = 0.1; return false; }
    e.hp -= dmg; e.flash = 0.12; sfx('hit');
    if (e.hp <= 0 && !e.dead) killEnemy(e);
    return true;
  }
  function segSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
    const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1e-6;
    let t = ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / L2; t = clamp(t, 0, 1);
    const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz; return px * px + py * py + pz * pz < r * r;
  }

  function updateGame(dtReal) {
    const t = songTGame(); const prevT = g.t; g.t = t;
    let dt = clamp(t - prevT, 0, 0.05);
    if (g.hitstop > 0) { g.hitstop -= dtReal; dt *= 0.15; }
    const sdt = dt * (g.over > 0 ? 0.55 : 1);   // overclock slows the world, not the music
    // bars / beats
    const beat = Math.floor(t / SPB), bar = Math.floor(t / BAR);
    if (g.sectorT0 == null) g.sectorT0 = 0;
    const barInSector = Math.floor((t - g.sectorT0) / BAR);
    if (beat !== g.lastBeat) {
      g.lastBeat = beat;
      onBeat(beat, barInSector);
    }
    // music intensity follows the sector's progress
    if (A.music && g.phase === 'run') A.music.setIntensity(intensityFor(barInSector));
    if (g.phase === 'run' && barInSector >= g.sectBars) startBoss();
    // input → reticle (keyboard)
    if (input.kbd) {
      const k = input.keys, sp = 1.2 * dtReal;
      if (k.ArrowLeft || k.KeyA) input.ux -= sp; if (k.ArrowRight || k.KeyD) input.ux += sp;
      if (k.ArrowUp || k.KeyW) input.uy += sp; if (k.ArrowDown || k.KeyS) input.uy -= sp;
      input.ux = clamp(input.ux, -0.85, 0.85); input.uy = clamp(input.uy, -0.48, 0.48);
    }
    if (film) autopilot(dtReal, t);
    // auto-fire on the 8th-note grid while held (always in time with the music)
    const step8 = Math.floor(t / (SPB / 2));
    if (step8 !== g.lastStep8) { g.lastStep8 = step8; if (input.fire && !film && clock() - input.lastPress > SPB * 0.6) fire(false); }
    // player follows the reticle ray
    const d = aimDir(); let tx = g.cam.x + d[0] / d[2] * PZ * 1.25, ty = g.cam.y + d[1] / d[2] * PZ * 1.25;
    [tx, ty] = octClamp(tx, ty, OCT);
    const pl = g.pl, k = 14;
    pl.vx += ((tx - pl.x) * k - pl.vx * 2 * Math.sqrt(k)) * dtReal; pl.vy += ((ty - pl.y) * k - pl.vy * 2 * Math.sqrt(k)) * dtReal;
    pl.x += pl.vx * dtReal; pl.y += pl.vy * dtReal; [pl.x, pl.y] = octClamp(pl.x, pl.y, OCT);
    g.cam.x = lerp(g.cam.x, pl.x * 0.55, 1 - Math.exp(-dtReal * 4)); g.cam.y = lerp(g.cam.y, pl.y * 0.55, 1 - Math.exp(-dtReal * 4));
    g.cam.roll = lerp(g.cam.roll, clamp(-pl.vx * 0.05, -0.18, 0.18), 1 - Math.exp(-dtReal * 5));
    // timers
    g.inv = Math.max(0, g.inv - dtReal); g.dmg = Math.max(0, g.dmg - dtReal * 2.5); g.choir = Math.max(0, g.choir - dtReal); g.over = Math.max(0, g.over - dtReal);
    g.sectorVis = lerp(g.sectorVis, g.sector, 1 - Math.exp(-dtReal * 1.2));
    g.bossVis = lerp(g.bossVis, g.phase === 'boss' ? 1 : 0, 1 - Math.exp(-dtReal * 1.5));
    // lock-on sweep
    if (input.lock && g.phase !== 'dead') {
      g.lockCharge = Math.min(1, g.lockCharge + dtReal * 1.5);
      const rx = input.ux * R.sh + R.sw / 2, ry = input.uy * R.sh + R.sh / 2, rad = 0.16 * R.sh;
      for (const e of g.en) {
        if (e.dead || e.locked || g.locks.length >= 8 || e.rz < PZ + 2 || e.rz > 50) continue;
        if (e.type === 'eye' && g.en.some(o => o.type === 'pipe' && !o.dead)) continue;
        const p = proj(e.x, e.y, e.rz); if (Math.hypot(p[0] - rx, p[1] - ry) < rad + p[2] * ETYPE[e.type].r) { e.locked = true; g.locks.push(e); sfx('lock', g.locks.length - 1); }
      }
    } else g.lockCharge = Math.max(0, g.lockCharge - dtReal * 3);
    // queued lock lasers fire on successive 16ths
    const nowC = clock();
    for (let i = g.lockQ.length - 1; i >= 0; i--) {
      const q = g.lockQ[i]; if (nowC < q.at) continue; g.lockQ.splice(i, 1);
      q.e.locked = false; if (q.e.dead) continue;
      g.beams.push({ x0: g.pl.x, y0: g.pl.y, z0: PZ, e: q.e, life: 0.16 });
      sfx('lockFire', q.i); hitEnemy(q.e, 3, true); g.score += 50 * (q.i + 1);
    }
    // enemies
    for (const e of g.en) {
      if (e.dead) continue;
      const age = g.t - e.born;
      e.flash = Math.max(0, e.flash - dtReal);
      if (e.boss) {
        g.boss.rot += 0; const a = e.idx / 6 * 6.28 + g.t * 0.55;
        e.x = Math.cos(a) * 1.75; e.y = Math.sin(a) * 1.35; e.rz = lerp(e.rz, e.hover, 1 - Math.exp(-sdt * 1.2));
      } else if (e.type === 'eye') {
        e.x = Math.sin(g.t * 0.7) * 0.4; e.y = Math.cos(g.t * 0.5) * 0.3; e.rz = lerp(e.rz, e.hover, 1 - Math.exp(-sdt * 0.8));
      } else {
        if (!e.dive && age > e.life) e.dive = true;
        const target = e.dive ? -3 : e.hover;
        e.rz = e.dive ? e.rz - sdt * 14 : lerp(e.rz, target, 1 - Math.exp(-sdt * 1.1));
        if (e.type === 'moth') {
          if (e.orbit) { e.oa += e.os * sdt; e.x = Math.cos(e.oa) * e.orbit; e.y = Math.sin(e.oa) * e.orbit * 0.8; }
          else { e.x = e.ox + Math.sin(g.t * 1.7 + e.ph) * 0.6; e.y = e.oy + Math.cos(g.t * 1.3 + e.ph) * 0.4; }
        } else if (e.type === 'seraph') { e.x = e.ox + Math.sin(g.t * 0.8 + e.ph) * 0.8; e.y = e.oy + Math.sin(g.t * 1.1 + e.ph) * 0.4; }
        else if (e.type === 'hulk') { e.x = e.ox + Math.sin(g.t * 0.4 + e.ph) * 0.3; }
        if (e.rz < -2) e.dead = true;
      }
    }
    // wraiths teleport on snares
    const snareEnv = envFrom(A.snares, clock() - A.lat, 30);
    if (snareEnv > 0.9) for (const e of g.en) if (e.type === 'wraith' && !e.dead && !e.tp) { e.ox = rr(-1.8, 1.8); e.oy = rr(-1.3, 1.3); e.x = e.ox; e.y = e.oy; e.tp = true; g.pt.push({ x: e.x, y: e.y, rz: e.rz, vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, type: 2, size: 1.2, col: [1, 0.2, 0.9] }); }
    if (snareEnv < 0.5) for (const e of g.en) e.tp = false;
    // player bullets
    for (const b of g.pb) {
      const ox = b.x, oy = b.y, oz = b.rz;
      b.x += b.vx * sdt; b.y += b.vy * sdt; b.rz += (b.vz - 0) * sdt; b.life -= sdt;
      for (const e of g.en) {
        if (e.dead || e.rz < 0) continue;
        if (segSphere(ox, oy, oz, b.x, b.y, b.rz, e.x, e.y, e.rz, ETYPE[e.type].r + (b.harm ? 0.2 : 0.1))) {
          if (hitEnemy(e, b.harm ? 2 : 1, b.harm)) burst(b.x, b.y, b.rz, b.harm ? [1, 0.4, 0.9] : [0.4, 0.9, 1], 4, 0.5);
          b.life = 0; break;
        }
      }
    }
    g.pb = g.pb.filter(b => b.life > 0 && b.rz < 80);
    // enemy bullets
    for (const b of g.eb) {
      const oz = b.rz; b.x += b.vx * sdt; b.y += b.vy * sdt; b.rz += b.vz * sdt;
      if ((oz - PZ) * (b.rz - PZ) <= 0 && Math.hypot(b.x - g.pl.x, b.y - g.pl.y) < 0.30 + b.big * 0.2) { b.dead = true; damagePlayer(); }
    }
    g.eb = g.eb.filter(b => !b.dead && b.rz > -1 && b.rz < 90);
    // pickups
    for (const p of g.pk) {
      const oz = p.rz; p.rz -= sdt * 9;
      if ((oz - PZ) * (p.rz - PZ) <= 0 && Math.hypot(p.x - g.pl.x, p.y - g.pl.y) < 0.75) { p.dead = true; collect(p.kind); }
      p.x = lerp(p.x, g.pl.x, 1 - Math.exp(-sdt * 0.8)); p.y = lerp(p.y, g.pl.y, 1 - Math.exp(-sdt * 0.8));
    }
    g.pk = g.pk.filter(p => !p.dead && p.rz > -1);
    // particles
    for (const p of g.pt) { p.x += p.vx * sdt; p.y += p.vy * sdt; p.rz += p.vz * sdt - (p.type === 2 ? 0 : SPEED * 0.15 * sdt); p.vx *= 0.96; p.vy *= 0.96; p.vz *= 0.96; p.life -= dtReal; }
    g.pt = g.pt.filter(p => p.life > 0); if (g.pt.length > 1400) g.pt.splice(0, g.pt.length - 1400);
    for (const b of g.beams) b.life -= dtReal; g.beams = g.beams.filter(b => b.life > 0);
    g.en = g.en.filter(e => !e.dead || e.locked);
    // boss progression
    if (g.phase === 'boss') {
      const pipes = g.en.filter(e => e.type === 'pipe' && !e.dead).length;
      if (pipes === 0 && !g.en.some(e => e.type === 'eye')) { if (!g.boss.eyeSpawned) { g.boss.eyeSpawned = true; spawn('eye', 0, 0, 60, { hover: 24, life: 1e9 }); banner('the eye opens', 1.6); } else bossDown(); }
    }
  }
  function songTGame() { return clock() - A.start - A.lat + g.t0; }
  function onBeat(beat, barInSector) {
    const bInBar = ((beat % 4) + 4) % 4;
    if (g.phase === 'run' && bInBar === 0 && barInSector !== g.lastSpawnBar) { g.lastSpawnBar = barInSector; if (barInSector < g.sectBars - 1) spawnWave(barInSector); }
    // enemy fire on the grid
    for (const e of g.en) {
      if (e.dead || e.rz > 40 || e.rz < 8) continue;
      if (e.type === 'seraph' && bInBar === 0) enemyFire(e, 'ring');
      if (e.type === 'seraph' && bInBar === 2) enemyFire(e, 'triple');
      if (e.type === 'moth' && rnd() < 0.10 + g.sector * 0.05) enemyFire(e, 'aim');
      if (e.type === 'wraith' && (bInBar === 1 || bInBar === 3)) enemyFire(e, 'aim');
      if (e.type === 'pipe') enemyFire(e, 'spiral');
      if (e.type === 'eye') { if (bInBar === 0) enemyFire(e, 'ring'); else enemyFire(e, 'triple'); }
    }
  }
  function collect(kind) {
    sfx('power');
    if (kind < 0.34) { g.hp = Math.min(5, g.hp + 1); updateHalo(); banner('tear · +1 halo shard', 1.4); }
    else if (kind < 0.67) { g.choir = BAR * 4; banner('choir · spread shot', 1.4); }
    else { g.over = BAR * 4; banner('overclock · time dilates', 1.4); }
  }
  function bossDown() {
    g.phase = 'clear'; flash = 1; flashCol = [1, 0.9, 1]; fx.shake = 1; g.score += 5000;
    sfx('explode', 1);
    setTimeout(() => {
      if (state !== 'game') return;
      if (g.sector >= 2) { winGame(); return; }
      g.sector++; g.phase = 'run'; g.lastSpawnBar = -1; g.boss = null;
      if (A.music) { A.music.setSector(g.sector); A.music.setIntensity(0); }
      const nb = switchSection('game');
      g.sectorT0 = songTGame() + (nb - clock()) + 0.01;
      showChapter(g.sector);
    }, 1400);
  }
  function autopilot(dt, t) {
    // choose a target: nearest threatening enemy, prefer boss parts
    let best = null, bd = 1e9;
    for (const e of g.en) { if (e.dead || e.rz < 6 || e.rz > 45) continue; if (e.type === 'eye' && g.en.some(o => o.type === 'pipe' && !o.dead)) continue; const d = e.rz + Math.hypot(e.x - g.pl.x, e.y - g.pl.y) * 4; if (d < bd) { bd = d; best = e; } }
    let gx = Math.sin(t * 0.45) * 0.35, gy = Math.sin(t * 0.31 + 1) * 0.18;
    if (best) { const p = proj(best.x, best.y, best.rz); gx = (p[0] - R.sw / 2) / R.sh; gy = (p[1] - R.sh / 2) / R.sh; }
    // dodge: steer away from the nearest incoming bullet
    for (const b of g.eb) { if (b.rz > PZ + 6 || b.rz < PZ) continue; const dx = g.pl.x - b.x, dy = g.pl.y - b.y; const d = Math.hypot(dx, dy); if (d < 0.6) { gx += dx / (d + 0.1) * 0.08; gy += dy / (d + 0.1) * 0.08; } }
    input.ux = lerp(input.ux, clamp(gx, -0.8, 0.8), 1 - Math.exp(-dt * 3.2)); input.uy = lerp(input.uy, clamp(gy, -0.45, 0.45), 1 - Math.exp(-dt * 3.2));
    // press exactly on every beat when a target is in view
    const beat = Math.floor(t / SPB);
    if (best && beat !== g.apBeat) { g.apBeat = beat; press(A.start + A.lat + beat * SPB - g.t0); }
    // lock-on sweeps
    const groups = g.en.filter(e => !e.dead && e.rz > 8 && e.rz < 40).length;
    if (!input.lock && groups >= 3 && (beat % 8 === 0) && g.apLock !== beat) { g.apLock = beat; input.lock = true; g.apLockEnd = t + SPB * 1.5; }
    if (input.lock && t > (g.apLockEnd || 0)) { input.lock = false; releaseLock(); }
  }
  function gameOver() {
    state = 'over'; playSection('silence'); flash = 0.6; flashCol = [1, 0.1, 0.2];
    const best = Math.max(store.get('best', 0), g.score); store.set('best', best);
    $('hud').hidden = true; $('touchlock').hidden = true;
    endScreen('SIGNAL LOST', 'the hymn breaks off mid-verse', false);
  }
  function winGame() {
    state = 'ending'; g.endT0 = clock();
    const best = Math.max(store.get('best', 0), g.score); if (!film) store.set('best', best);
    $('hud').hidden = true; $('touchlock').hidden = true;
    playSection('ending');
  }
  function grade() { const s = g.presses ? g.onBeat / g.presses : 0; return s > 0.9 ? 'S' : s > 0.75 ? 'A' : s > 0.55 ? 'B' : 'C'; }
  function endScreen(title, sub, won) {
    const el = $('end'); el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    el.querySelector('.et').textContent = title; el.querySelector('.es').textContent = sub;
    const sync = g.presses ? Math.round(g.onBeat / g.presses * 100) : 0;
    $('st-score').textContent = g.score.toLocaleString(); $('st-sync').textContent = sync + '%'; $('st-combo').textContent = '×' + g.maxCombo; $('st-best').textContent = store.get('best', 0).toLocaleString();
    $('grade').textContent = won ? grade() : '—';
  }
  function endingFrame(t) {
    const et = clock() - g.endT0;
    const U = baseU(songT()); U.local = et;
    U.p0 = [sstep(5, 18, et), 1, lerp(0.2, 0.05, sstep(0, 8, et)), 0];
    post.letterbox = film ? 1 : 0; post.glitch = 0;
    if (et > 2.0 && !g.endShown) { g.endShown = 1; const l = $('lastsong'); l.hidden = false; l.classList.remove('in'); void l.offsetWidth; l.classList.add('in'); }
    if (et > 9 && g.endShown === 1) {
      g.endShown = 2; $('lastsong').hidden = true;
      if (film) { $('credits').hidden = false; $('credits').classList.add('in'); setTimeout(() => { stopRecording(); $('creditsBack').hidden = false; }, 9000); }
      else endScreen('THE REQUIEM IS COMPLETE', 'you are the last song', true);
    }
    return { scene: 'angel', U };
  }
  function overFrame() {
    const U = baseU(songTGame()); U.p0 = [g.cam.x, g.cam.y, (songTGame()) * SPEED * 0.1, g.cam.roll]; U.p1 = [g.sector, 0, 0.6, 0];
    post.glitch = reduceMotion ? 0 : 0.25; post.fade = 0.55;
    return { scene: 'tunnel', U };
  }

  // ---------------------------------------------------------------- HUD
  let hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function updateHalo() { const h = $('halo'); h.innerHTML = ''; for (let i = 0; i < 5; i++) { const s = document.createElement('i'); if (i >= g.hp) s.className = 'lost'; h.appendChild(s); } }
  function hud() {
    setText('h-score', g.score.toLocaleString());
    setText('h-combo', '×' + (1 + Math.min(g.combo, 32) * 0.125).toFixed(2).replace(/0$/, ''));
    setText('h-sync', (g.presses ? Math.round(g.onBeat / g.presses * 100) : 100) + '%');
    setText('h-sector', SECTORS[g.sector].num + ' · ' + SECTORS[g.sector].name);
    const pw = g.choir > 0 ? 'choir ' + Math.ceil(g.choir) + 's' : g.over > 0 ? 'overclock ' + Math.ceil(g.over) + 's' : '';
    setText('h-power', pw);
    const boss = g.en.find(e => e.type === 'eye') ; const pipes = g.en.filter(e => e.type === 'pipe' && !e.dead);
    const bb = $('bossbar');
    if (g.phase === 'boss') { bb.hidden = false; const tot = pipes.reduce((a, e) => a + e.hp / e.max, 0) / 6 * 0.5 + (boss && !boss.dead ? boss.hp / boss.max * 0.5 : (g.boss && g.boss.eyeSpawned ? 0 : 0.5)); bb.querySelector('i').style.transform = 'scaleX(' + clamp(tot, 0, 1).toFixed(3) + ')'; }
    else bb.hidden = true;
  }

  // ---------------------------------------------------------------- frame
  function baseU(t) {
    const tc = clock() - A.lat;
    return { time: performance.now() / 1000 % 3600, local: t, prog: 0, beat: ((t % SPB) + SPB) % SPB / SPB, kick: reduceMotion ? 0 : envFrom(A.kicks, tc, 9), bass: A.bass, high: A.high, p0: [0, 0, 0, 0], p1: [0, 0, 0, 0] };
  }
  function gameFrame(dtReal) {
    if (!paused) updateGame(dtReal);
    const t = g.t;
    const U = baseU(t);
    U.p0 = [g.cam.x, g.cam.y, t * SPEED, g.cam.roll];
    U.p1 = [g.sectorVis, g.bossVis, g.dmg, g.over > 0 ? 1 : 0];
    post.letterbox = film ? 1 : 0; post.fade = 1;
    post.ca = 0.0016 + U.kick * 0.0025 + g.dmg * 0.01; post.exposure = 1 + U.kick * 0.05;
    post.glitch = reduceMotion ? 0 : g.dmg * 0.5 + (g.sector === 2 ? U.kick * 0.08 : 0);
    post.bloom = 0.6; post.threshold = 1.15;
    if (!film) hud();
    return { scene: 'tunnel', U };
  }
  function drawSprites() {
    SP.begin();
    if (state !== 'game' || !g) return;
    const S = R.sh;
    // enemy bullets
    for (const b of g.eb) { const p = proj(b.x, b.y, b.rz); const s = Math.max(3, p[2] * (0.13 + b.big * 0.1)); SP.push(p[0], p[1], s * 2.2, s * 2.2, 0, 0, b.col[0], b.col[1], b.col[2], 1.25, 0, 0); }
    // enemies
    for (const e of g.en) {
      if (e.dead || e.rz < 0.6) continue; const T = ETYPE[e.type]; const p = proj(e.x, e.y, e.rz);
      const s = p[2] * T.r * 1.25; const fl = (e.flash > 0 ? 2.2 : 1) * (e.type === 'eye' ? 0.55 : 1); const fade = sstep(68, 52, e.rz);
      const ang = e.type === 'hulk' ? g.t * (e.spin || 0.5) : e.type === 'moth' ? Math.sin(g.t * 2 + e.ph) * 0.3 : 0;
      SP.push(p[0], p[1], s, s, T.spr, ang, T.col[0], T.col[1], T.col[2], 1.0 * fl * fade, e.type === 'seraph' ? e.shield : e.type === 'moth' ? g.t : e.type === 'pipe' ? (e.flash > 0 ? 1 : 0) : e.type === 'eye' ? (g.en.some(o => o.type === 'pipe' && !o.dead) ? 0 : 1) : 0, e.seed);
      if (e.locked) SP.push(p[0], p[1], s * 1.5, s * 1.5, 9, g.t * 3, 1, 0.3, 0.85, 1.8, 0, 0);
    }
    // pickups
    for (const k of g.pk) { const p = proj(k.x, k.y, k.rz); const s = p[2] * 0.45; SP.push(p[0], p[1], s, s, 11, 0, 0.5, 1, 0.9, 1.6, 0, k.kind); }
    // player bullets
    for (const b of g.pb) {
      const p = proj(b.x, b.y, b.rz), q = proj(b.x - b.vx * 0.035, b.y - b.vy * 0.035, b.rz - b.vz * 0.035);
      const dx = p[0] - q[0], dy = p[1] - q[1]; const L = Math.max(4, Math.hypot(dx, dy)); const w = Math.max(2, p[2] * (b.harm ? 0.09 : 0.05));
      SP.push((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L * 0.75, w * 1.6, 1, Math.atan2(dy, dx), b.harm ? 1 : 0.35, b.harm ? 0.35 : 0.9, b.harm ? 0.9 : 1, b.harm ? 3 : 2, 0, 0);
    }
    // lock beams
    for (const bm of g.beams) {
      if (bm.e.dead && bm.life < 0.08) continue; const a = proj(g.pl.x, g.pl.y, PZ), b = proj(bm.e.x, bm.e.y, Math.max(bm.e.rz, 1));
      const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy);
      SP.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2, 4 + 6 * bm.life / 0.16, 14, Math.atan2(dy, dx), 1, 0.25, 0.85, 3 * bm.life / 0.16, 0, 0);
    }
    // particles
    for (const pt of g.pt) {
      if (pt.rz < 0.5) continue; const p = proj(pt.x, pt.y, pt.rz); const k = pt.life / pt.max;
      if (pt.type === 2) { const s = p[2] * pt.size; SP.push(p[0], p[1], s, s, 2, 0, pt.col[0], pt.col[1], pt.col[2], 2.4, 1 - k, 0); }
      else if (pt.type === 12) { const s = Math.max(1.5, p[2] * pt.size); SP.push(p[0], p[1], s * 3, s, 12, Math.atan2(pt.vy, pt.vx), pt.col[0], pt.col[1], pt.col[2], 2.5 * k, 0, 0); }
      else { const s = Math.max(1.5, p[2] * pt.size); SP.push(p[0], p[1], s, s, 0, 0, pt.col[0], pt.col[1], pt.col[2], 2.5 * k, 0, 0); }
    }
    // player
    const pp = proj(g.pl.x, g.pl.y, PZ); const ps = pp[2] * 0.19;
    const blink = g.inv > 0 && !film ? (Math.floor(performance.now() / 70) % 2 ? 0.25 : 1) : 1;
    SP.push(pp[0], pp[1], ps, ps, 7, -g.cam.roll * 1.5 + g.pl.vx * -0.05, 0.85, 0.95, 1.0, 1.15 * blink, Math.min(1, Math.hypot(g.pl.vx, g.pl.vy) * 0.3), 0);
    if (g.choir > 0) SP.push(pp[0], pp[1], ps * 1.6, ps * 1.6, 2, 0, 1, 0.3, 0.9, 0.8, 0.3 + 0.2 * Math.sin(g.t * 8), 0);
    // reticle
    if (!film) { const rx = input.ux * S + R.sw / 2, ry = input.uy * S + R.sh / 2; SP.push(rx, ry, S * 0.035, S * 0.035, 8, g.t * 0.8, 0.95, 0.9, 1, 1.6, g.lockCharge, 0); if (input.lock) SP.push(rx, ry, S * 0.16, S * 0.16, 2, 0, 1, 0.3, 0.85, 0.35, 0.65, 0); }
  }

  let last = performance.now(), ema = 16, lastScaleChange = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dtReal = clamp((ts - last) / 1000, 0, 0.05); last = ts;
    if (A.ctx && A.ctx.state === 'running') A.music.tick(A.ctx.currentTime);
    bands();
    let out = null;
    post.ca = 0.0018; post.exposure = 1; post.glitch = 0; post.fade = 1; post.letterbox = 0; post.bloom = 0.85; post.threshold = 0.9;
    if (state === 'boot') { const U = baseU(performance.now() / 1000); U.p0 = [0.15, 0, 0, 0]; out = { scene: 'void', U }; post.letterbox = 0; post.fade = 1; post.glitch = 0; }
    else if (state === 'intro') out = introFrame(songT());
    else if (state === 'title') { const U = baseU(songT()); U.p0 = [0, 1, 0.06, 0]; out = { scene: 'angel', U }; post.exposure = 0.75; }
    else if (state === 'game') out = gameFrame(dtReal);
    else if (state === 'over') out = overFrame();
    else if (state === 'ending') out = endingFrame();
    // shake (camera jolt via uv offset is done in-game by roll; here: tiny post CA burst)
    fx.shake = Math.max(0, fx.shake - dtReal * 2.5);
    flash = Math.max(0, flash - dtReal * 2.2); glitchKick = Math.max(0, glitchKick - dtReal * 2.5);
    post.flash = reduceMotion ? flash * 0.3 : flash; post.flashCol = flashCol;
    post.glitch = Math.min(1, post.glitch + (reduceMotion ? 0 : glitchKick));
    post.ca += reduceMotion ? 0 : fx.shake * 0.006;
    post.crt = crt ? 1 : 0; post.scan = crt ? 0.12 : 0; post.grain = crt ? 0.06 : 0.03;
    if (cssW / cssH < 1.3) post.letterbox = 0;   // no cinema bars on portrait screens
    if (out) R.beginScene(out.scene, out.U);
    drawSprites(); SP.flush(performance.now() / 1000 % 3600);
    R.finish(performance.now() / 1000 % 3600);
    // adaptive resolution
    ema = lerp(ema, dtReal * 1000, 0.05);
    if (ts - lastScaleChange > 1500) {
      if (ema > 21 && R.scale > 0.42) { R.setScale(R.scale - 0.08); lastScaleChange = ts; }
      else if (ema < 13.5 && R.scale < 0.95) { R.setScale(R.scale + 0.05); lastScaleChange = ts; }
    }
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- recording (film)
  let rec = null, recChunks = [], recURL = null;
  function canRecord() { return !IN_FRAME && typeof MediaRecorder !== 'undefined' && !!cv.captureStream && !!(window.AudioContext || window.webkitAudioContext); }
  function startRecording() {
    if (!canRecord() || !A.ctx) return false;
    try {
      A.recDest = A.ctx.createMediaStreamDestination(); A.out.connect(A.recDest);
      const stream = new MediaStream([...cv.captureStream(60).getVideoTracks(), ...A.recDest.stream.getAudioTracks()]);
      const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined);
      recChunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
      rec.onstop = () => { const blob = new Blob(recChunks, { type: 'video/webm' }); if (recURL) URL.revokeObjectURL(recURL); recURL = URL.createObjectURL(blob); const a = $('dl'); a.href = recURL; a.hidden = false; };
      rec.start(500); recording = true; $('rec').hidden = false; return true;
    } catch (e) { console.warn(e); return false; }
  }
  function stopRecording() { if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) { } } recording = false; $('rec').hidden = true; }

  // ---------------------------------------------------------------- flows
  function enter() { initAudio(); film = false; startIntro(); }
  function startFilm(record) {
    initAudio(); film = true; hideAll(); $('dl').hidden = true; $('creditsBack').hidden = true;
    if (record) startRecording();
    filmStage = 'intro'; startIntro();
  }
  let filmStage = null;
  // film: after the title card holds, descend automatically
  setInterval(() => {
    if (!film) return;
    if (state === 'intro' && songT() > 63.5) { startGame(); }
  }, 100);
  function exitFilm() { stopRecording(); film = false; toTitle(); }
  function toTitle() { hideAll(); state = 'title'; if (A.music) playSection('intro', clock() + 0.06 - 58.2); showTitle(); }
  function togglePause() {
    if (state !== 'game' || film) return; paused = !paused; $('pause').hidden = !paused;
    if (A.ctx) { if (paused) A.ctx.suspend(); else A.ctx.resume(); }
  }

  // ---------------------------------------------------------------- input wiring
  $('boot').addEventListener('click', e => { if (e.target.closest('button')) return; enter(); });
  $('btnEnter').onclick = e => { e.stopPropagation(); enter(); };
  $('btnFilmBoot').onclick = e => { e.stopPropagation(); startFilm(false); };
  $('btnDescend').onclick = () => startGame();
  $('btnFilm').onclick = () => startFilm(false);
  $('btnRec').onclick = () => startFilm(true);
  $('btnIntro').onclick = () => { film = false; startIntro(); };
  $('btnCrt').onclick = () => { crt = !crt; store.set('crt', crt); syncToggles(); };
  $('btnRm').onclick = () => { reduceMotion = !reduceMotion; store.set('rm', reduceMotion); syncToggles(); };
  $('btnFs').onclick = () => { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { }); else document.exitFullscreen(); } catch (e) { } };
  $('skip').onclick = () => skipIntro();
  $('mute').onclick = () => setMute(!A.muted);
  $('btnResume').onclick = () => togglePause();
  $('btnQuit').onclick = () => { paused = false; if (A.ctx) A.ctx.resume(); toTitle(); };
  $('btnRetry').onclick = () => startGame();
  $('btnMenu').onclick = () => toTitle();
  $('creditsBack').onclick = () => exitFilm();
  const toUV = (cx, cy) => [(cx - cssW / 2) / cssH, (cssH / 2 - cy) / cssH];
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') { if (!input.touchActive) return; const [ux, uy] = toUV(e.clientX, e.clientY - 70); input.ux = clamp(ux, -0.85, 0.85); input.uy = clamp(uy, -0.48, 0.48); return; }
    input.kbd = false; const [ux, uy] = toUV(e.clientX, e.clientY); input.ux = clamp(ux, -0.85, 0.85); input.uy = clamp(uy, -0.48, 0.48);
  });
  cv.addEventListener('pointerdown', e => {
    if (state === 'title' && !$('titlecard').hidden) return;
    if (e.pointerType === 'touch') { input.touch = true; input.touchActive = true; if (state === 'game' && !film) $('touchlock').hidden = false; const [ux, uy] = toUV(e.clientX, e.clientY - 70); input.ux = ux; input.uy = uy; }
    if (state === 'intro' && songT() > 58.2 && !film) { startGame(); return; }
    if (state !== 'game' || film) return;
    if (e.button === 2) { input.lock = true; return; }
    input.fire = true; input.lastPress = clock(); press(clock());
  });
  addEventListener('pointerup', e => { if (e.pointerType === 'touch') input.touchActive = false; if (e.button === 2) { input.lock = false; releaseLock(); } else input.fire = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  const tl = $('touchlock');
  tl.addEventListener('pointerdown', e => { e.stopPropagation(); input.lock = true; tl.classList.add('on'); });
  tl.addEventListener('pointerup', e => { e.stopPropagation(); input.lock = false; releaseLock(); tl.classList.remove('on'); });
  addEventListener('keydown', e => {
    if (e.repeat) { if (e.code.startsWith('Arrow') || 'KeyWKeyAKeySKeyD'.includes(e.code)) e.preventDefault(); return; }
    input.keys[e.code] = true;
    if (/^(Arrow|Key[WASD])/.test(e.code)) { input.kbd = true; e.preventDefault(); }
    if (e.code === 'KeyM') setMute(!A.muted);
    if (e.code === 'KeyF') $('btnFs').onclick();
    if (e.code === 'Escape' || e.code === 'KeyP') { if (film && (state === 'game' || state === 'intro' || state === 'ending')) exitFilm(); else togglePause(); }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') {
      e.preventDefault();
      if (state === 'boot') enter();
      else if (state === 'title' || (state === 'intro' && songT() > 58.2 && !film)) startGame();
      else if (state === 'game' && !film) { input.fire = true; input.lastPress = clock(); press(clock()); }
      else if (state === 'over') startGame();
    }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') && state === 'game') input.lock = true;
  });
  addEventListener('keyup', e => {
    input.keys[e.code] = false;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') input.fire = false;
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') && state === 'game') { input.lock = false; releaseLock(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'game' && !paused && !film) togglePause(); });
  $('btnRec').hidden = !canRecord(); $('btnRecBoot').hidden = !canRecord();
  $('btnRecBoot').onclick = e => { e.stopPropagation(); startFilm(true); };
  syncToggles();

  // test hooks
  window.NRR = { get state() { return state; }, get g() { return g; }, get film() { return film; }, R, A, songT, skipIntro, startGame, startFilm, toTitle, seekIntro(t) { playSection('intro', clock() + 0.06 - t); }, win: () => winGame(), boss: () => { if (g) g.sectorT0 = g.t - BAR * (g.sectBars + 1); }, killAll: () => g && g.en.forEach(e => { if (!e.dead) killEnemy(e); }) };
})();
