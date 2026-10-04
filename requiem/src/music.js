
function createMusic(ctx, destination) {
  // ---------- PRNG ----------
  let seed = 1337;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function randRange(a, b) { return a + rand() * (b - a); }

  // ---------- constants ----------
  const BPM = 128;
  const SPB = 60 / BPM;           // seconds per beat
  const SPB16 = SPB / 4;          // 16th
  const LOOKAHEAD = 0.15;
  const LOOKBACK = 0.02;

  // F# minor scale (semitones from F#4=66)
  const SCALE = [0, 2, 3, 5, 7, 8, 10];
  function noteMidiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function scaleDegToMidi(deg, octave) {
    // deg 0..7 within scale, octave offset from F#4
    const oct = Math.floor(deg / 7);
    const idx = deg % 7;
    const semi = SCALE[idx] + oct * 12;
    return 66 + semi + octave * 12;
  }

  // ---------- master chain ----------
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.85;
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSoftCurve(2.0);
  shaper.oversample = '2x';
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  comp.knee.value = 6;
  comp.connect(masterGain);
  masterGain.connect(destination);

  // buses
  function bus(gainVal) { const g = ctx.createGain(); g.gain.value = gainVal; g.connect(comp); return g; }
  const kickBus = bus(1.0);
  const snareBus = bus(0.9);
  const hatBus = bus(0.7);
  const bassBus = bus(1.0);
  const padBus = bus(0.8);
  const arpBus = bus(0.7);
  const choirBus = bus(0.8);
  const leadBus = bus(0.8);
  const sfxBus = bus(0.9);
  const glitchBus = bus(0.8);

  // ---------- shared reverb ----------
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(3.2, 0.35);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.5;
  reverb.connect(reverbGain);
  reverbGain.connect(comp);

  // ---------- ping-pong delay ----------
  const delayL = ctx.createDelay(1.0);
  const delayR = ctx.createDelay(1.0);
  const fbL = ctx.createGain(); fbL.gain.value = 0.35;
  const fbR = ctx.createGain(); fbR.gain.value = 0.35;
  const wetL = ctx.createGain(); wetL.gain.value = 0.4;
  const wetR = ctx.createGain(); wetR.gain.value = 0.4;
  const panL = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const panR = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panL) panL.pan.value = -0.5;
  if (panR) panR.pan.value = 0.5;
  const delayTime = SPB * 0.75; // dotted 8th
  delayL.delayTime.value = delayTime;
  delayR.delayTime.value = delayTime;
  const delayInput = ctx.createGain();
  const delayOut = ctx.createGain();
  delayOut.connect(comp);
  delayInput.connect(delayL);
  delayL.connect(fbR);
  delayL.connect(panL ? panL : delayOut);
  delayR.connect(fbL);
  delayR.connect(panR ? panR : delayOut);
  fbL.connect(delayR);
  fbR.connect(delayL);
  if (panL) panL.connect(delayOut);
  if (panR) panR.connect(delayOut);

  function sendReverb(node, amt) {
    const g = ctx.createGain(); g.gain.value = amt;
    node.connect(g); g.connect(reverb);
    return g;
  }
  function sendDelay(node, amt) {
    const g = ctx.createGain(); g.gain.value = amt;
    node.connect(g); g.connect(delayInput);
    return g;
  }

  // ---------- noise buffer ----------
  const noiseBuf = makeNoise(2.0);

  // ---------- helpers ----------
  function makeNoise(dur) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1;
    return b;
  }
  function makeImpulse(dur, decay) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const n = rand() * 2 - 1;
        // lowpass-ish averaging to darken
        prev = prev * 0.6 + n * 0.4;
        d[i] = prev * Math.pow(1 - i / len, decay * 3);
      }
    }
    return b;
  }
  function makeSoftCurve(amount) {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(amount * x) / Math.tanh(amount);
    }
    return c;
  }
  function makeStairCurve(steps) {
    const n = 256;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.round(x * steps) / steps;
    }
    return c;
  }

  // ---------- state ----------
  let section = null;
  let sectionStart = null;
  let intensity = 1;
  let sector = 0;
  let lastSchedBeat = -1;
  let lastSchedBar = -1;
  let running = false;
  let fadeOutStart = -1;
  let fadeOutDur = 0;
  let fadeOutFrom = 1;
  let masterFade = 1;

  // sector transposition: 0 F#m, 1 Am (+3), 2 C#m (+7)
  function sectorSemi() { return [0, 3, 7][sector] || 0; }
  // chord progression i - VI - III - VII in minor, roots as scale degrees from tonic
  // F#m: F#m(0) D(8) A(5) E(2)  -> as semitone offsets from tonic: 0, 9, 5, 7
  function chordRoots(bar) {
    const b = bar % 4;
    const base = [0, 9, 5, 7]; // i, VI, III, VII
    return base[b];
  }
  function chordTones(bar) {
    const b = bar % 4;
    const root = chordRoots(bar) + sectorSemi();
    // minor triad + add9/sus colour
    const sets = [
      [0, 3, 7, 14],   // i add9
      [0, 4, 7, 11],   // VI maj add9
      [0, 4, 7, 14],   // III maj add9
      [0, 4, 7, 11]    // VII maj
    ];
    return sets[b].map(s => root + s);
  }
  function tonicMidi() { return 66 + sectorSemi(); } // F#4 base

  // ---------- instrument voices ----------
  function playKick(t, vel) {
    vel = vel || 1;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    // distortion
    const sh = ctx.createWaveShaper();
    sh.curve = makeSoftCurve(3.0);
    osc.connect(sh); sh.connect(g); g.connect(kickBus);
    // click
    const click = ctx.createBufferSource();
    click.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2000;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.3 * vel, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    click.connect(hp); hp.connect(cg); cg.connect(kickBus);
    osc.start(t); osc.stop(t + 0.4);
    click.start(t); click.stop(t + 0.05);
    if (api.onKick) api.onKick(t);
  }

  function playSnare(t, vel) {
    vel = vel || 1;
    // noise burst bandpassed
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.7 * vel, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); // gated
    n.connect(bp); bp.connect(ng); ng.connect(snareBus);
    // tonal body
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = 190;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.4 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og); og.connect(snareBus);
    // big reverb send then gate
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.linearRampToValueAtTime(0.6 * vel, t + 0.005);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    ng.connect(rg); rg.connect(reverb);
    n.start(t); n.stop(t + 0.2);
    o.start(t); o.stop(t + 0.15);
    if (api.onSnare) api.onSnare(t);
  }

  function playHat(t, open, vel) {
    vel = vel || 1;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = ctx.createGain();
    const dur = open ? 0.18 : 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp); hp.connect(g); g.connect(hatBus);
    n.start(t); n.stop(t + dur + 0.02);
  }

  function playSub(t, midi, dur, glideFrom) {
    const f = noteMidiToFreq(midi);
    const o1 = ctx.createOscillator(); o1.type = 'sine';
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(f, t);
    o2.frequency.setValueAtTime(f * 2, t);
    if (glideFrom != null) {
      o1.frequency.setValueAtTime(noteMidiToFreq(glideFrom), t);
      o1.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      o2.frequency.setValueAtTime(noteMidiToFreq(glideFrom) * 2, t);
      o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.08);
    }
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    const sh = ctx.createWaveShaper(); sh.curve = makeSoftCurve(1.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    o1.connect(g1); o2.connect(g2); g2.connect(sh); sh.connect(lp);
    g1.connect(lp);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.9, t + 0.02);
    env.gain.setValueAtTime(0.9, t + dur - 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(env); env.connect(bassBus);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function playPad(t, midis, dur) {
    const n = midis.length;
    for (let i = 0; i < n; i++) {
      const f = noteMidiToFreq(midis[i]);
      const voices = 6;
      for (let v = 0; v < voices; v++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const det = (v - voices / 2) * 0.006;
        o.frequency.setValueAtTime(f * Math.pow(2, det), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.4);
        g.gain.setValueAtTime(0.06, t + dur - 0.5);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1200;
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (pan) pan.pan.value = (v / (voices - 1)) * 2 - 1;
        o.connect(g);
        if (pan) { g.connect(lp); lp.connect(pan); pan.connect(padBus); }
        else { g.connect(lp); lp.connect(padBus); }
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
    // slow LFO sweep on a shared filter is complex; approximate with static lowpass
  }

  function playArp(t, midi) {
    const f = noteMidiToFreq(midi);
    const carrier = ctx.createOscillator();
    carrier.type = 'sine'; carrier.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine'; mod.frequency.value = f * 3.5;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * 0.5, t);
    modGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    mod.connect(modGain); modGain.connect(carrier.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    carrier.connect(g);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = randRange(-0.4, 0.4);
    if (pan) { g.connect(pan); pan.connect(arpBus); } else { g.connect(arpBus); }
    sendDelay(g, 0.5);
    carrier.start(t); mod.start(t);
    carrier.stop(t + 0.35); mod.stop(t + 0.35);
  }

  function playChoir(t, midis, dur, vowel) {
    const formants = vowel === 'oo' ? [350, 600, 2700] : [800, 1150, 2900];
    for (let i = 0; i < midis.length; i++) {
      const f = noteMidiToFreq(midis[i]);
      const src = ctx.createOscillator();
      src.type = 'sawtooth'; src.frequency.value = f;
      // vibrato
      const vib = ctx.createOscillator();
      vib.type = 'sine'; vib.frequency.value = 5.5;
      const vibGain = ctx.createGain();
      vibGain.gain.value = f * 0.002; // ~12 cents
      vib.connect(vibGain); vibGain.connect(src.frequency);
      // 3 bandpass formants
      const sum = ctx.createGain(); sum.gain.value = 1;
      for (let k = 0; k < 3; k++) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = formants[k]; bp.Q.value = 6;
        const fg = ctx.createGain(); fg.gain.value = [0.6, 0.5, 0.3][k];
        src.connect(bp); bp.connect(fg); fg.connect(sum);
      }
      // breath noise
      const bn = ctx.createBufferSource(); bn.buffer = noiseBuf;
      const bhp = ctx.createBiquadFilter(); bhp.type = 'bandpass'; bhp.frequency.value = 2000; bhp.Q.value = 1;
      const bg = ctx.createGain(); bg.gain.value = 0.05;
      bn.connect(bhp); bhp.connect(bg); bg.connect(sum);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.25, t + 0.4);
      env.gain.setValueAtTime(0.25, t + dur - 0.6);
      env.gain.linearRampToValueAtTime(0.0001, t + dur);
      sum.connect(env); env.connect(choirBus);
      sendReverb(env, 0.7);
      src.start(t); vib.start(t); bn.start(t);
      src.stop(t + dur + 0.1); vib.stop(t + dur + 0.1); bn.stop(t + dur + 0.1);
    }
  }

  function playLead(t, midi, dur) {
    const f = noteMidiToFreq(midi);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    o1.frequency.value = f; o2.frequency.value = f * 1.003;
    const sh = ctx.createWaveShaper(); sh.curve = makeStairCurve(8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.setValueAtTime(0.3, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(sh); o2.connect(sh); sh.connect(g);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = 0;
    if (pan) { g.connect(pan); pan.connect(leadBus); } else { g.connect(leadBus); }
    sendDelay(g, 0.4);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  function playGlitch(t, bar) {
    // accelerating snare/hat roll + pitch-rising noise riser
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const st = t + (i / steps) * SPB;
      const vel = 0.3 + (i / steps) * 0.5;
      if (i % 2 === 0) playHat(st, false, vel);
      else playSnare(st, vel * 0.5);
    }
    // noise riser
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + SPB);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + SPB);
    g.gain.exponentialRampToValueAtTime(0.0001, t + SPB + 0.05);
    n.connect(bp); bp.connect(g); g.connect(glitchBus);
    n.start(t); n.stop(t + SPB + 0.1);
  }

  // ---------- sidechain pumping ----------
  function pumpKick(t, depth) {
    const buses = [padBus, choirBus, arpBus];
    for (const b of buses) {
      const g = b.gain;
      const base = b._baseGain || 1;
      g.setValueAtTime(base, t);
      g.linearRampToValueAtTime(base * (1 - depth * 0.65), t + 0.03);
      g.linearRampToValueAtTime(base, t + 0.25);
    }
  }

  // store base gains
  [padBus, choirBus, arpBus].forEach(b => b._baseGain = b.gain.value);

  // ---------- arrangement scheduling ----------
  function barTime(bar) { return sectionStart + bar * SPB * 4; }
  function beatTime(beat) { return sectionStart + beat * SPB; }

  function scheduleBar(bar) {
    const t0 = barTime(bar);
    const sec = section;
    const root = chordRoots(bar) + sectorSemi();
    const tones = chordTones(bar);
    const barInLoop = bar % 16;

    if (sec === 'silence') return;

    if (sec === 'intro') {
      scheduleIntroBar(bar, t0, tones, root);
      return;
    }
    if (sec === 'ending') {
      scheduleEndingBar(bar, t0, tones, root);
      return;
    }

    // game / boss
    const isBoss = (sec === 'boss');
    const fullBeat = intensity >= 2 || isBoss;
    const hasHats = intensity >= 1 || isBoss;
    const hasArp = intensity >= 1 || isBoss;
    const hasChoir = intensity >= 2 || isBoss;
    const hasLead = intensity >= 3 || isBoss;

    // pad every bar
    playPad(t0, tones, SPB * 4);

    // sub bass: eighth-note syncopated pattern
    const bassPat = isBoss ? [1,0,1,1,0,1,0,1] : [1,0,1,0,1,0,1,0];
    let prevRoot = null;
    for (let e = 0; e < 8; e++) {
      if (bassPat[e]) {
        const bt = t0 + e * SPB * 0.5;
        let m = tonicMidi() - 12 + root;
        if (e % 4 === 2) m += 12; // octave jump
        playSub(bt, m, SPB * 0.45, prevRoot);
        prevRoot = m;
      }
    }

    // kick
    if (fullBeat || intensity >= 0) {
      for (let b = 0; b < 4; b++) {
        const kt = t0 + b * SPB;
        playKick(kt, 1);
        pumpKick(kt, isBoss ? 0.9 : 0.6 + intensity * 0.1);
      }
    }

    // snare on 2 & 4
    if (fullBeat) {
      playSnare(t0 + SPB, 1);
      playSnare(t0 + SPB * 3, 1);
    }

    // hats
    if (hasHats) {
      const is32 = isBoss && (barInLoop % 2 === 1);
      const steps = is32 ? 8 : 4;
      for (let s = 0; s < steps; s++) {
        const ht = t0 + s * (SPB / steps);
        const open = (s % 2 === 1) && rand() > 0.6;
        const vel = 0.5 + rand() * 0.4;
        playHat(ht, open, vel);
      }
    }

    // arp 16ths
    if (hasArp) {
      const arpPat = [0,1,2,3,2,1,0,1,2,3,2,1,0,1,2,3];
      for (let s = 0; s < 16; s++) {
        const at = t0 + s * SPB16;
        const deg = arpPat[s];
        const midi = tonicMidi() + 12 + tones[deg % tones.length] - chordRoots(bar) - sectorSemi();
        playArp(at, midi);
      }
    }

    // choir
    if (hasChoir) {
      const vowel = (bar % 4 === 1) ? 'oo' : 'ah';
      playChoir(t0, tones, SPB * 4, vowel);
    }

    // lead hook (4-bar)
    if (hasLead) {
      const hook = [
        [0, 12, 0.5], [1, 12, 0.5], [2, 12, 0.5], [3, 12, 0.5],
        [4, 12, 0.5], [3, 12, 0.5], [2, 12, 0.5], [1, 12, 0.5]
      ];
      const barInHook = bar % 4;
      if (barInHook === 0) {
        // C#5 E5 F#5 A5 G#5 F#5 E5 C#5 -> degrees in F#m: 5,7,0,2,1,0,7,5
        const mel = [5,7,0,2,1,0,7,5];
        for (let i = 0; i < 8; i++) {
          const lt = t0 + i * SPB * 0.5;
          const midi = tonicMidi() + 12 + SCALE[mel[i] % 7] + Math.floor(mel[i] / 7) * 12;
          playLead(lt, midi, SPB * 0.45);
        }
      }
    }

    // glitch fill every 8 bars
    if (bar % 8 === 7) {
      playGlitch(t0, bar);
    }
  }

  function scheduleIntroBar(bar, t0, tones, root) {
    if (bar < 4) {
      // dark drone + heartbeat + radio static
      playPad(t0, [tonicMidi() - 12 + root, tonicMidi() - 12 + root + 7], SPB * 4);
      playKick(t0, 0.5);
      playKick(t0 + SPB * 0.5, 0.3);
      // radio static
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.03;
      n.connect(bp); bp.connect(g); g.connect(glitchBus);
      n.start(t0); n.stop(t0 + SPB * 4);
    } else if (bar < 10) {
      playPad(t0, tones, SPB * 4);
      playSub(t0, tonicMidi() - 12 + root, SPB * 4);
      playChoir(t0, tones, SPB * 4, 'oo');
    } else if (bar < 17) {
      playPad(t0, tones, SPB * 4);
      playSub(t0, tonicMidi() - 12 + root, SPB * 4);
      for (let s = 0; s < 4; s++) playHat(t0 + s * SPB, false, 0.5);
      const arpPat = [0,1,2,3,2,1,0,1,2,3,2,1,0,1,2,3];
      for (let s = 0; s < 16; s++) {
        const midi = tonicMidi() + 12 + tones[arpPat[s] % tones.length] - chordRoots(bar) - sectorSemi();
        playArp(t0 + s * SPB16, midi);
      }
      if (bar >= 12) {
        for (let b = 0; b < 4; b++) { playKick(t0 + b * SPB, 0.8); pumpKick(t0 + b * SPB, 0.5); }
      }
    } else if (bar < 25) {
      playPad(t0, tones, SPB * 4);
      playSub(t0, tonicMidi() - 12 + root, SPB * 4);
      for (let b = 0; b < 4; b++) { playKick(t0 + b * SPB, 1); pumpKick(t0 + b * SPB, 0.6); }
      playSnare(t0 + SPB, 0.8); playSnare(t0 + SPB * 3, 0.8);
      for (let s = 0; s < 4; s++) playHat(t0 + s * SPB, false, 0.6);
      playChoir(t0, tones, SPB * 4, 'ah');
      // lead hook octave down
      const mel = [5,7,0,2,1,0,7,5];
      if (bar % 4 === 0) {
        for (let i = 0; i < 8; i++) {
          const midi = tonicMidi() + SCALE[mel[i] % 7] + Math.floor(mel[i] / 7) * 12;
          playLead(t0 + i * SPB * 0.5, midi, SPB * 0.45);
        }
      }
    } else if (bar < 30) {
      // crescendo
      playPad(t0, tones, SPB * 4);
      playSub(t0, tonicMidi() - 12 + root, SPB * 4);
      // snare roll accelerating
      const steps = [4, 8, 8, 16, 32][Math.min(4, Math.max(0, bar - 25))];
      for (let i = 0; i < steps; i++) {
        playSnare(t0 + (i / steps) * SPB * 4, 0.3 + (i / steps) * 0.5);
      }
      playChoir(t0, tones, SPB * 4, 'ah');
      // noise riser
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(500, t0);
      bp.frequency.exponentialRampToValueAtTime(5000, t0 + SPB * 4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.2, t0 + SPB * 4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + SPB * 4 + 0.05);
      n.connect(bp); bp.connect(g); g.connect(glitchBus);
      n.start(t0); n.stop(t0 + SPB * 4 + 0.1);
    } else if (bar === 30) {
      // near silence + reverse cymbal swell
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 4000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.4, t0 + SPB * 4);
      g.gain.linearRampToValueAtTime(0.0001, t0 + SPB * 4 + 0.05);
      n.connect(bp); bp.connect(g); g.connect(glitchBus);
      n.start(t0); n.stop(t0 + SPB * 4 + 0.1);
    } else {
      // bar 31+: big chord stab + sustain pad
      if (bar === 31) {
        playKick(t0, 1);
        pumpKick(t0, 0.8);
        playChoir(t0, tones, SPB * 4, 'ah');
        playPad(t0, tones, SPB * 4);
      } else {
        playPad(t0, tones, SPB * 4);
      }
    }
  }

  function scheduleEndingBar(bar, t0, tones, root) {
    // F# major picardy: shift tonic up 2 semis for major
    const majTones = [0, 4, 7, 11].map(s => tonicMidi() + 2 + s);
    if (bar < 8) {
      // no drums, choir + pad + arp
      playPad(t0, majTones, SPB * 4);
      playChoir(t0, majTones, SPB * 4, 'ah');
      const arpPat = [0,1,2,3,2,1,0,1,2,3,2,1,0,1,2,3];
      for (let s = 0; s < 16; s++) {
        const midi = tonicMidi() + 2 + 12 + majTones[arpPat[s] % majTones.length] - 2;
        playArp(t0 + s * SPB16, midi);
      }
    } else {
      // final soft kick heartbeat fading
      const fade = Math.max(0, 1 - (bar - 8) / 8);
      playPad(t0, majTones, SPB * 4);
      playKick(t0, 0.3 * fade);
      playKick(t0 + SPB * 0.5, 0.2 * fade);
      if (bar >= 16) {
        // fade out
      }
    }
  }

  // ---------- API ----------
  const api = {
    bpm: BPM,
    onKick: null,
    onSnare: null,

    play(sectionName, when) {
      // crossfade old
      const now = ctx.currentTime;
      const at = Math.max(when, now + 0.03);   // 'when' may be in the past when seeking
      if (running && sectionStart !== null) {
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0.0001, at);
      }
      section = sectionName;
      sectionStart = when;
      lastSchedBeat = -1;
      lastSchedBar = -1;
      running = (sectionName !== 'silence');
      // fade master back in
      masterGain.gain.setValueAtTime(0.0001, at);
      masterGain.gain.linearRampToValueAtTime(0.85, at + (when < now ? 0.25 : SPB));
    },

    tick(now) {
      if (!running || sectionStart === null) return;
      const end = now + LOOKAHEAD;
      // schedule bars
      let bar = Math.floor((now - sectionStart) / (SPB * 4));
      if (bar < 0) bar = 0;
      // after a seek, never dump a bar that is already well under way
      if (lastSchedBar < 0 && barTime(bar) < now - 0.25) { lastSchedBar = bar; bar++; }
      while (barTime(bar) < end) {
        if (bar > lastSchedBar) {
          scheduleBar(bar);
          lastSchedBar = bar;
        }
        bar++;
      }
    },

    setIntensity(level) {
      intensity = Math.max(0, Math.min(3, level | 0));
    },

    setSector(i) {
      sector = Math.max(0, Math.min(2, i | 0));
    },

    beatPhase(now) {
      if (sectionStart === null) return 0;
      const t = now - sectionStart;
      if (t < 0) return 0;
      return (t % SPB) / SPB;
    },

    beatIndex(now) {
      if (sectionStart === null) return 0;
      const t = now - sectionStart;
      if (t < 0) return 0;
      return Math.floor(t / SPB);
    },

    harmonic(time, combo) {
      const c = combo % 8;
      const oct = Math.floor(combo / 8) % 2;   // stay within two octaves
      const deg = c;
      const midi = tonicMidi() + 12 + SCALE[deg % 7] + Math.floor(deg / 7) * 12 + oct * 12;
      const f = noteMidiToFreq(midi);
      // plucked bell
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.4, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);
      o.connect(g);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) pan.pan.value = randRange(-0.5, 0.5);
      if (pan) { g.connect(pan); pan.connect(sfxBus); } else { g.connect(sfxBus); }
      sendReverb(g, 0.4);
      // soft saw layer
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth'; o2.frequency.value = f;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, time);
      g2.gain.linearRampToValueAtTime(0.1, time + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
      o2.connect(g2); g2.connect(sfxBus);
      o.start(time); o.stop(time + 0.7);
      o2.start(time); o2.stop(time + 0.5);
    },

    sfx: {
      hit(time) {
        const o = ctx.createOscillator(); o.type = 'square';
        o.frequency.setValueAtTime(800, time);
        o.frequency.exponentialRampToValueAtTime(200, time + 0.08);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
        o.connect(g); g.connect(sfxBus);
        o.start(time); o.stop(time + 0.12);
      },
      explode(time, size) {
        size = size || 0.5;
        const n = ctx.createBufferSource(); n.buffer = noiseBuf;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(4000, time);
        lp.frequency.exponentialRampToValueAtTime(100, time + 0.3 + size * 0.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3 + size * 0.5);
        n.connect(lp); lp.connect(g); g.connect(sfxBus);
        sendReverb(g, 0.5);
        n.start(time); n.stop(time + 0.4 + size * 0.6);
      },
      shieldBreak(time) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(600, time);
        o.frequency.exponentialRampToValueAtTime(100, time + 0.2);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
        o.connect(g); g.connect(sfxBus);
        o.start(time); o.stop(time + 0.3);
      },
      hurt(time) {
        const o = ctx.createOscillator(); o.type = 'square';
        o.frequency.setValueAtTime(150, time);
        o.frequency.exponentialRampToValueAtTime(60, time + 0.15);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
        o.connect(g); g.connect(sfxBus);
        o.start(time); o.stop(time + 0.25);
      },
      lock(time, i) {
        const midi = tonicMidi() + 12 + SCALE[(i % 7)] + Math.floor(i / 7) * 12;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = noteMidiToFreq(midi);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.3, time + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
        o.connect(g); g.connect(sfxBus);
        sendReverb(g, 0.3);
        o.start(time); o.stop(time + 0.35);
      },
      lockFire(time, i) {
        const midi = tonicMidi() + 12 + SCALE[(i % 7)] + Math.floor(i / 7) * 12 + 12;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = noteMidiToFreq(midi);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.4, time + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
        o.connect(g); g.connect(sfxBus);
        sendReverb(g, 0.4);
        o.start(time); o.stop(time + 0.45);
      },
      power(time) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, time);
        o.frequency.exponentialRampToValueAtTime(1600, time + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
        o.connect(g); g.connect(sfxBus);
        sendReverb(g, 0.3);
        o.start(time); o.stop(time + 0.4);
      },
      whoosh(time) {
        const n = ctx.createBufferSource(); n.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
        bp.frequency.setValueAtTime(500, time);
        bp.frequency.exponentialRampToValueAtTime(3000, time + 0.15);
        bp.frequency.exponentialRampToValueAtTime(500, time + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.3, time + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
        n.connect(bp); bp.connect(g); g.connect(sfxBus);
        n.start(time); n.stop(time + 0.35);
      }
    },

    stop(when) {
      const t = when != null ? when : ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
      running = false;
      section = null;
      sectionStart = null;
    }
  };

  return api;
}
