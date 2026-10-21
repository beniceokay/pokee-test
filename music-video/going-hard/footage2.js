(function () {
  'use strict';

  const VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUV;',
    'void main(){',
    '  vUV = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  const FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 vUV;',
    'uniform sampler2D uBg;',
    'uniform sampler2D uFg;',
    'uniform sampler2D uDepth;',
    'uniform sampler2D uBehind;',
    'uniform vec2 uRes;',
    'uniform vec2 uImageSize;',
    'uniform vec2 uBaseScale;',
    'uniform vec2 uBaseOx;',
    'uniform vec2 uBaseOy;',
    'uniform vec2 uBaseFocus;',
    'uniform vec2 uPar;',
    'uniform vec2 uBreath;',
    'uniform float uU;',
    'uniform float uSubjectDepth;',
    'uniform float uHasSubject;',
    'uniform int uBgMode;',
    'uniform int uFgMode;',
    'uniform vec2 uPivot;',
    'uniform float uBob;',
    'uniform float uRot;',
    'uniform float uScale;',
    'uniform vec2 uTrans;',
    'uniform float uKick;',
    'uniform float uKickPulse;',
    'uniform float uBeatPhase;',
    'uniform float uDownPulse;',
    'uniform int uMood;',
    'uniform float uSinceStart;',
    'uniform float uShotDur;',
    'uniform float uSeed;',
    'uniform vec2 uBbox;',
    'uniform float uMaxOff;',
    'uniform float uEchoK;',
    'const float PI = 3.141592653589793;',
    'const float TWO_PI = 6.283185307179586;',
    'const vec3 RED = vec3(0.88235, 0.14510, 0.10588);',
    'const vec3 IVORY = vec3(0.95686, 0.93725, 0.90196);',
    'const vec3 MIDNIGHT = vec3(0.04314, 0.05882, 0.10196);',
    'const vec3 WARM = vec3(1.0, 0.91373, 0.82353);',
    'const vec3 STRIPE_RED = vec3(0.84314, 0.14902, 0.11765);',
    'const vec3 STRIPE_IVORY = vec3(0.95686, 0.93725, 0.90196);',
    'const vec3 DRED = vec3(0.10, 0.01, 0.04);',
    'const vec3 CYAN = vec3(0.098, 0.902, 1.0);',
    'const vec3 MAGENTA = vec3(1.0, 0.169, 0.839);',
    'const vec3 DEEP = vec3(0.020, 0.024, 0.059);',
    'const float KICK_FRAMES = 0.08;',
    'const float KICK_FRAMES2 = 0.16;',
    'const float KICK_FRAMES3 = 0.24;',
    'float hash11(float n){',
    '  return fract(sin(n * 127.1 + 311.7) * 43758.5453123);',
    '}',
    'float hash21(vec2 p){',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    'float smoothstep01(float e0, float e1, float x){',
    '  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);',
    '  return t * t * (3.0 - 2.0 * t);',
    '}',
    'float easeOutExpo(float x){',
    '  if (x >= 1.0) return 1.0;',
    '  if (x <= 0.0) return 0.0;',
    '  return 1.0 - pow(2.0, -10.0 * x);',
    '}',
    'float easeOutBack(float x){',
    '  float c1 = 1.70158;',
    '  float c3 = c1 + 1.0;',
    '  return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0);',
    '}',
    'vec4 TI(sampler2D s, vec2 p){ return texture2D(s, vec2(p.x, 1.0 - p.y)); }',
    'vec2 coverFit(vec2 uv, vec2 img, vec2 res){',
    '  vec2 r = res / img;',
    '  vec2 k = r / max(r.x, r.y);',
    '  vec2 d = vec2(uv.x, 1.0 - uv.y);',
    '  return (d - 0.5) * k + 0.5;',
    '}',
    'vec2 baseTransform(vec2 uv){',
    '  vec2 c = coverFit(uv, uImageSize, uRes);',
    '  vec2 f = uBaseFocus;',
    '  c = (c - f) / uBaseScale + f + uBaseOx;',
    '  return c;',
    '}',
    'vec2 screenToImage(vec2 uv){',
    '  return baseTransform(uv);',
    '}',
    'float depthAt(vec2 p){',
    '  return TI(uDepth, p).r;',
    '}',
    'vec3 sampleBg(vec2 uv){',
    '  vec2 p = screenToImage(uv);',
    '  float d = depthAt(p);',
    '  float dd = d - uSubjectDepth;',
    '  vec2 c = uPar * 0.035 * smoothstep01(0.0, 1.0, uU) + uBreath;',
    '  p += c * dd;',
    '  float dolly = 1.0 + 0.05 * uU * dd;',
    '  p = (p - uBaseFocus) * dolly + uBaseFocus;',
    '  vec3 col = TI(uBg, p).rgb;',
    '  if (uBgMode == 1){',
    '    float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '    col = col * 0.35 + vec3(0.0, 0.03, 0.05);',
    '    col = mix(col, col * vec3(0.75, 1.0, 1.15), 0.4);',
    '  } else if (uBgMode == 2){',
    '    float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '    col = mix(DRED, vec3(1.0, 0.165, 0.239), smoothstep01(0.0, 1.0, lum));',
    '  } else if (uBgMode == 3){',
    '    float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '    vec2 pos = uv * uRes;',
    '    float ang = 28.0 * PI / 180.0;',
    '    float ca = cos(ang);',
    '    float sa = sin(ang);',
    '    float hz = 0.42;',
    '    vec3 base = mix(DEEP, vec3(0.16, 0.05, 0.22), lum) ;',
    '    if (uv.y < hz) {',
    '      float d = max(hz - uv.y, 0.002);',
    '      float z = 0.09 / d;',
    '      float gx = (uv.x - 0.5) * z * 2.6;',
    '      float gz = z - uSinceStart * 1.6;',
    '      float lx = 1.0 - smoothstep(0.0, 0.035 * z, abs(fract(gx) - 0.5) * 2.0 - (1.0 - 0.06 * z));',
    '      float lz = 1.0 - smoothstep(0.0, 0.05, abs(fract(gz) - 0.5) * 2.0 - 0.9);',
    '      float g = clamp(max(lx, lz), 0.0, 1.0) * smoothstep(0.0, 0.12, d);',
    '      col = base * 0.6 + MAGENTA * g * 0.9 + MAGENTA * 0.12 * (1.0 - smoothstep(0.0, 0.2, d));',
    '    } else {',
    '      float sky = (uv.y - hz) / (1.0 - hz);',
    '      col = mix(MAGENTA * 0.35 + base, base * 0.7 + CYAN * 0.06, smoothstep(0.0, 0.6, sky));',
    '    }',
    '  } else if (uBgMode == 4){',
    '    float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '    vec2 pos = uv * uRes;',
    '    float ang = 45.0 * PI / 180.0;',
    '    float ca = cos(ang);',
    '    float sa = sin(ang);',
    '    vec2 rp = vec2(pos.x * ca + pos.y * sa, -pos.x * sa + pos.y * ca);',
    '    float cell = 9.0;',
    '    vec2 g = rp / cell;',
    '    vec2 id = floor(g);',
    '    vec2 f = fract(g) - 0.5;',
    '    float r = length(f);',
    '    float rad = 0.5 * (0.15 + 0.85 * lum);',
    '    float dotm = smoothstep01(rad, rad - 0.05, r);',
    '    col = mix(DEEP, CYAN, dotm);',
    '  }',
    '  return col;',
    '}',
    'vec3 blurBg(vec2 uv){',
    '  vec2 p = screenToImage(uv);',
    '  float d = depthAt(p);',
    '  float dd = d - uSubjectDepth;',
    '  vec2 c = uPar * 0.035 * smoothstep01(0.0, 1.0, uU) + uBreath;',
    '  p += c * dd;',
    '  float dolly = 1.0 + 0.05 * uU * dd;',
    '  p = (p - uBaseFocus) * dolly + uBaseFocus;',
    '  float radius = abs(dd) * 0.004;',
    '  if (radius < 0.0005) return TI(uBg, p).rgb;',
    '  vec2 off = vec2(radius * uRes.y / uRes.x, radius);',
    '  vec3 acc = vec3(0.0);',
    '  acc += TI(uBg, p).rgb;',
    '  acc += TI(uBg, p + vec2(off.x, 0.0)).rgb;',
    '  acc += TI(uBg, p - vec2(off.x, 0.0)).rgb;',
    '  acc += TI(uBg, p + vec2(0.0, off.y)).rgb;',
    '  acc += TI(uBg, p - vec2(0.0, off.y)).rgb;',
    '  return acc * 0.2;',
    '}',
    'vec2 subjectPivot(vec2 uv){',
    '  vec2 p = screenToImage(uv);',
    '  vec2 c = uPivot;',
    '  float cs = cos(uRot);',
    '  float sn = sin(uRot);',
    '  vec2 rel = (p - c) * uScale;',
    '  p = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) + c + uTrans;',
    '  return p;',
    '}',
    'vec4 sampleFg(vec2 uv){',
    '  return TI(uFg, subjectPivot(uv));',
    '}',
    'vec3 contrastSat(vec3 c, float ct, float st){',
    '  c = (c - 0.5) * (1.0 + ct) + 0.5;',
    '  float lum = dot(c, vec3(0.299, 0.587, 0.114));',
    '  c = mix(vec3(lum), c, 1.0 + st);',
    '  return c;',
    '}',
    'vec3 applyFgMode(vec3 col, float a, vec2 uv){',
    '  if (uFgMode == 5){',
    '    float bp = fract(uBeatPhase);',
    '    if (bp < 0.08 / max(uShotDur, 0.001)) {',
    '      col = IVORY;',
    '    }',
    '  } else if (uFgMode == 6){',
    '    float row = floor(uv.y * 24.0);',
    '    float seed = hash11(row + floor(uSinceStart * 24.0) * 100.0);',
    '    float off = (seed - 0.5) * 2.4 * uKick * 0.012;',
    '    vec2 uvR = uv + vec2(off, 0.0);',
    '    vec2 uvG = uv;',
    '    vec2 uvB = uv - vec2(off, 0.0);',
    '    float split = 0.004 * uKick;',
    '    uvR += vec2(split, 0.0);',
    '    uvB -= vec2(split, 0.0);',
    '    float r = TI(uFg, subjectPivot(uvR)).r;',
    '    float g = TI(uFg, subjectPivot(uvG)).g;',
    '    float b = TI(uFg, subjectPivot(uvB)).b;',
    '    col = vec3(r, g, b);',
    '  }',
    '  return col;',
    '}',
    'void main(){',
    '  vec3 outCol;',
    '  if (uHasSubject > 0.5){',
    '    vec3 bg = blurBg(vUV);',
    '    vec4 behind = texture2D(uBehind, vUV);',
    '    vec3 comp = mix(bg, behind.rgb, behind.a);',
    '    vec2 shOff = vec2(0.005 * uRes.x, -0.006 * uRes.y);',
    '    vec2 uvSh = vUV - shOff / uRes;',
    '    float aSh = 0.0;',
    '    float shR = 0.009 * uRes.x;',
    '    vec2 shOff2 = shR / uRes;',
    '    aSh += TI(uFg, subjectPivot(uvSh)).a;',
    '    aSh += TI(uFg, subjectPivot(uvSh + vec2(shOff2.x, 0.0))).a;',
    '    aSh += TI(uFg, subjectPivot(uvSh - vec2(shOff2.x, 0.0))).a;',
    '    aSh += TI(uFg, subjectPivot(uvSh + vec2(0.0, shOff2.y))).a;',
    '    aSh += TI(uFg, subjectPivot(uvSh - vec2(0.0, shOff2.y))).a;',
    '    aSh += TI(uFg, subjectPivot(uvSh + vec2(shOff2.x, shOff2.y))).a;',
    '    aSh *= 0.24 / 6.0;',
    '    comp *= 1.0 - aSh;',
    '    if (uFgMode == 4){',
    '      float lag1 = 0.07;',
    '      float lag2 = 0.14;',
    '      float lag3 = 0.21;',
    '      float ph1 = uSinceStart - lag1;',
    '      float ph2 = uSinceStart - lag2;',
    '      float ph3 = uSinceStart - lag3;',
    '      float bob1 = sin((ph1 / max(uShotDur, 0.001)) * TWO_PI) * 0.012;',
    '      float bob2 = sin((ph2 / max(uShotDur, 0.001)) * TWO_PI) * 0.012;',
    '      float bob3 = sin((ph3 / max(uShotDur, 0.001)) * TWO_PI) * 0.012;',
    '      float s1 = 1.015;',
    '      float s2 = 1.030;',
    '      float s3 = 1.045;',
    '      vec2 pivot = uPivot;',
    '      vec2 p1 = (vUV - pivot) * s1 + pivot + vec2(0.0, -bob1);',
    '      vec2 p2 = (vUV - pivot) * s2 + pivot + vec2(0.0, -bob2);',
    '      vec2 p3 = (vUV - pivot) * s3 + pivot + vec2(0.0, -bob3);',
    '      float a1 = TI(uFg, screenToImage(p1)).a;',
    '      float a2 = TI(uFg, screenToImage(p2)).a;',
    '      float a3 = TI(uFg, screenToImage(p3)).a;',
    '      float k = 0.6 + 0.4 * uKick;',
    '      comp = mix(comp, MAGENTA, a1 * 0.38 * k);',
    '      comp = mix(comp, CYAN, a2 * 0.24 * k);',
    '      comp = mix(comp, MAGENTA, a3 * 0.12 * k);',
    '    }',
    '    vec4 fg = sampleFg(vUV);',
    '    float a = fg.a;',
    '    if (a > 0.001){',
    '      vec3 col = fg.rgb;',
    '      col = applyFgMode(col, a, vUV);',
    '      col = contrastSat(col, 0.06, 0.08);',
    '      comp = mix(comp, col, a);',
    '      float rim = 0.0;',
    '      float rOff = 0.0025 * uRes.x / uRes.x;',
    '      float rOffY = 0.0025 * uRes.y / uRes.y;',
    '      float aL = TI(uFg, subjectPivot(vUV - vec2(rOff, 0.0))).a;',
    '      float aR = TI(uFg, subjectPivot(vUV + vec2(rOff, 0.0))).a;',
    '      float aU = TI(uFg, subjectPivot(vUV + vec2(0.0, rOffY))).a;',
    '      float aD = TI(uFg, subjectPivot(vUV - vec2(0.0, rOffY))).a;',
    '      float avg = (aL + aR + aU + aD) * 0.25;',
    '      rim = clamp(a - avg, 0.0, 1.0);',
    '      vec3 rimCol = (uMood == 1 || uMood == 4) ? MAGENTA : ((uMood == 3 || uMood == 6 || uMood == 5) ? CYAN : WARM);',
    '      float rimInt = 0.35 + uKickPulse * 0.9;',
    '      comp += rimCol * rim * rimInt;',
    '    }',
    '    outCol = comp;',
    '  } else {',
    '    vec3 bg = blurBg(vUV);',
    '    vec4 behind = texture2D(uBehind, vUV);',
    '    outCol = mix(bg, behind.rgb, behind.a);',
    '  }',
    '  gl_FragColor = vec4(outCol, 1.0);',
    '}'
  ].join('\n');

  const state = {
    gl: null,
    program: null,
    quadBuf: null,
    textures: {},
    ready: {},
    attrib: null,
    uniforms: {},
    initialized: false
  };

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error('Shader compile error:', log);
      console.error('Source:\n', src);
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function linkProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      console.error('Program link error:', log);
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  function getUniforms(gl, program) {
    const names = [
      'uRes', 'uImageSize', 'uBaseScale', 'uBaseOx', 'uBaseOy', 'uBaseFocus',
      'uPar', 'uBreath', 'uU', 'uSubjectDepth', 'uHasSubject', 'uBgMode',
      'uFgMode', 'uPivot', 'uBob', 'uRot', 'uScale', 'uTrans', 'uKick',
      'uKickPulse', 'uBeatPhase', 'uDownPulse', 'uMood', 'uSinceStart',
      'uShotDur', 'uSeed', 'uBbox', 'uMaxOff', 'uEchoK'
    ];
    const u = {};
    for (let i = 0; i < names.length; i++) {
      u[names[i]] = gl.getUniformLocation(program, names[i]);
    }
    return u;
  }

  function loadAndUpload(gl, url, tex) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          if (img.decode) {
            img.decode().then(function () {
              uploadTexture(gl, img, tex);
              resolve();
            }, function (e) {
              uploadTexture(gl, img, tex);
              resolve();
            });
          } else {
            uploadTexture(gl, img, tex);
            resolve();
          }
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        reject(new Error('Failed to load ' + url));
      };
      img.src = url;
    });
  }

  function uploadTexture(gl, img, tex) {
    gl.activeTexture(gl.TEXTURE15);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
  }

  function makeTexture(gl) {
    return gl.createTexture();
  }

  function parseFgModes(fgStr) {
    if (!fgStr || fgStr === 'none') return [];
    const parts = fgStr.split(',');
    const modes = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      if (p) modes.push(p);
    }
    return modes;
  }

  function fgModeToInt(mode) {
    if (mode === 'float') return 0;
    if (mode === 'sway') return 1;
    if (mode === 'rise') return 2;
    if (mode === 'slidein') return 3;
    if (mode === 'zoompop') return 4;
    if (mode === 'echo') return 5;
    if (mode === 'strobe') return 6;
    if (mode === 'glitch') return 7;
    return 0;
  }

  function bgModeToInt(bg) {
    if (bg === 'plate') return 0;
    if (bg === 'dark') return 1;
    if (bg === 'mono-red') return 2;
    if (bg === 'stripes') return 3;
    if (bg === 'halftone') return 4;
    return 0;
  }

  function moodToInt(mood) {
    if (mood === 'vault') return 0;
    if (mood === 'drop') return 1;
    if (mood === 'verse') return 2;
    if (mood === 'build') return 3;
    if (mood === 'chorus') return 4;
    if (mood === 'bridge') return 5;
    if (mood === 'denied') return 6;
    if (mood === 'outro') return 7;
    return 0;
  }

  function computeSubjectTransform(o, modes) {
    const img = o.image;
    const shot = o.shot;
    const W = o.W;
    const H = o.H;
    const bar2Phase = o.bar2Phase || 0;
    const kick = o.kick || 0;
    const kickPulse = o.kickPulse || 0;
    const downPulse = o.downPulse || 1.0;
    const sinceStart = o.sinceStart || 0;
    const u = o.u || 0;

    let pivotX = 0.5;
    let pivotY = 0.8;
    if (img.hasSubject && img.subject && img.subject.bbox) {
      const bb = img.subject.bbox;
      pivotX = (bb[0] + bb[2]) * 0.5;
      pivotY = bb[3];
    }

    let bob = 0;
    let rot = 0;
    let scale = 1.0;
    let transX = 0;
    let transY = 0;
    let fgMode = 0;

    const hasFloat = modes.indexOf('float') !== -1;
    const hasSway = modes.indexOf('sway') !== -1;
    const hasRise = modes.indexOf('rise') !== -1;
    const hasSlidein = modes.indexOf('slidein') !== -1;
    const hasZoompop = modes.indexOf('zoompop') !== -1;
    const hasEcho = modes.indexOf('echo') !== -1;
    const hasStrobe = modes.indexOf('strobe') !== -1;
    const hasGlitch = modes.indexOf('glitch') !== -1;

    if (hasFloat) {
      bob = Math.sin(bar2Phase * Math.PI * 2) * 0.012;
      rot += Math.sin(bar2Phase * Math.PI * 2) * 0.5 * Math.PI / 180;
      scale *= 1.0 + 0.008 * (downPulse - 1.0) / 0.006;
      fgMode = 0;
    }
    if (hasSway) {
      rot += Math.sin(bar2Phase * Math.PI * 2) * 1.2 * Math.PI / 180;
      if (fgMode === 0) fgMode = 1;
    }
    if (hasRise) {
      const riseT = Math.min(1.0, Math.max(0.0, sinceStart / (0.4 * (shot.end - shot.start))));
      const e = easeOutExpo(riseT);
      transY += (1.0 - e) * 0.06;
      scale *= 1.0 - (1.0 - e) * 0.03;
      if (fgMode === 0 || fgMode === 1) fgMode = 2;
    }
    if (hasSlidein) {
      const slideT = Math.min(1.0, Math.max(0.0, sinceStart / 0.4));
      const e = easeOutBack(slideT);
      const dir = shot.par || [0, 0];
      const dx = -dir[0] * 0.08 * (1.0 - e);
      const dy = -dir[1] * 0.08 * (1.0 - e);
      transX += dx;
      transY += dy;
      if (fgMode === 0 || fgMode === 1 || fgMode === 2) fgMode = 3;
    }
    if (hasZoompop) {
      scale *= 1.0 + 0.04 * kickPulse;
      if (fgMode === 0 || fgMode === 1 || fgMode === 2 || fgMode === 3) fgMode = 4;
    }
    if (hasEcho) {
      if (fgMode === 0 || fgMode === 1 || fgMode === 2 || fgMode === 3 || fgMode === 4) fgMode = 5;
    }
    if (hasStrobe) {
      if (fgMode === 0 || fgMode === 1 || fgMode === 2 || fgMode === 3 || fgMode === 4 || fgMode === 5) fgMode = 6;
    }
    if (hasGlitch) {
      if (fgMode === 0 || fgMode === 1 || fgMode === 2 || fgMode === 3 || fgMode === 4 || fgMode === 5 || fgMode === 6) fgMode = 7;
    }

    return {
      pivotX: pivotX,
      pivotY: pivotY,
      bob: bob,
      rot: rot,
      scale: scale,
      transX: transX,
      transY: transY,
      fgMode: fgMode
    };
  }

  function easeOutExpo(x) {
    if (x >= 1.0) return 1.0;
    if (x <= 0.0) return 0.0;
    return 1.0 - Math.pow(2.0, -10.0 * x);
  }

  function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1.0;
    return 1.0 + c3 * Math.pow(x - 1.0, 3.0) + c1 * Math.pow(x - 1.0, 2.0);
  }

  function init(gl) {
    if (state.initialized) return true;
    state.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    if (!vs) return false;
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!fs) return false;

    const program = linkProgram(gl, vs, fs);
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    state.program = program;
    state.uniforms = getUniforms(gl, program);
    state.attrib = gl.getAttribLocation(program, 'aPos');

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    state.quadBuf = quadBuf;

    state.initialized = true;
    console.log('Footage2 initialized successfully.');
    return true;
  }

  function prepare(images, shots, t0, t1) {
    const gl = state.gl;
    if (!gl) return Promise.reject(new Error('Not initialized'));
    state.pending = state.pending || {};
    const need = new Set(), keep = new Set();
    for (let k = 0; k < shots.length; k++) {
      const s = shots[k];
      if (s.start <= t1 + 1 && s.end >= t0 - 1) need.add(s.img);
      if (s.start <= t1 + 3 && s.end >= t0 - 3) keep.add(s.img);
    }
    // release assets of shots far from the window (never while a load is in flight)
    Object.keys(state.textures).forEach(function (key) {
      if (keep.has(+key) || state.pending[key]) return;
      const t = state.textures[key];
      ['file', 'fg', 'plate', 'depth'].forEach(function (n) { if (t[n]) gl.deleteTexture(t[n]); });
      delete state.textures[key];
      delete state.ready[key];
    });
    const waits = [];
    need.forEach(function (i) {
      const key = String(i);
      if (state.ready[key]) return;
      if (state.pending[key]) { waits.push(state.pending[key]); return; }
      const img = images[i];
      const t = { file: makeTexture(gl), fg: img.hasSubject ? makeTexture(gl) : null,
                  plate: img.hasSubject ? makeTexture(gl) : null, depth: makeTexture(gl) };
      const tasks = [loadAndUpload(gl, img.file, t.file), loadAndUpload(gl, img.depth, t.depth)];
      if (img.hasSubject) { tasks.push(loadAndUpload(gl, img.fg, t.fg)); tasks.push(loadAndUpload(gl, img.plate, t.plate)); }
      state.textures[key] = t;
      const p = Promise.all(tasks).then(function () { state.ready[key] = true; delete state.pending[key]; },
        function (e) { console.error('Failed to load image', key, e); delete state.pending[key]; });
      state.pending[key] = p;
      waits.push(p);
    });
    return Promise.all(waits);
  }

  function has(imageIndex) {
    const key = String(imageIndex);
    return state.ready[key] === true;
  }

  function renderShot(o) {
    const gl = state.gl;
    if (!gl || !state.initialized) return;

    const img = o.image;
    const shot = o.shot;
    const W = o.W;
    const H = o.H;
    const uProg = o.u;
    const bar2Phase = o.bar2Phase || 0;
    const kick = o.kick || 0;
    const kickPulse = o.kickPulse || 0;
    const beatPhase = o.beatPhase || 0;
    const downPulse = o.downPulse || 1.0;
    const mood = o.mood || 'verse';
    const sinceStart = o.sinceStart || 0;
    const t = o.t || 0;

    const key = String(o.imageIndex);
    const texs = state.textures[key];
    if (!texs || !state.ready[key]) { console.error('asset not prepared', key); return; }

    const hasSubject = img.hasSubject && shot.fg && shot.fg !== 'none';

    gl.viewport(0, 0, W, H);
    if (o.fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbo);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.useProgram(state.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuf);
    gl.enableVertexAttribArray(state.attrib);
    gl.vertexAttribPointer(state.attrib, 2, gl.FLOAT, false, 0, 0);

    const base = o.base;
    const scale = base.scale;
    const ox = base.ox;
    const oy = base.oy;
    const focus = base.focus;

    const par = shot.par || [0, 0];
    const breath = 0.006 * Math.sin(bar2Phase * Math.PI * 2);

    const subjectDepth = (img.hasSubject && img.subject && img.subject.depth !== undefined) ? img.subject.depth : 0.5;

    const bgMode = bgModeToInt(shot.bg);
    const modes = parseFgModes(shot.fg);
    const st = computeSubjectTransform(o, modes);

    const u = state.uniforms;

    gl.uniform2f(u.uRes, W, H);
    gl.uniform2f(u.uImageSize, img.w, img.h);
    gl.uniform2f(u.uBaseScale, scale, scale);
    gl.uniform2f(u.uBaseOx, ox, oy);
    gl.uniform2f(u.uBaseOy, 0, 0);
    gl.uniform2f(u.uBaseFocus, focus[0], focus[1]);
    gl.uniform2f(u.uPar, par[0], par[1]);
    gl.uniform2f(u.uBreath, breath, breath);
    gl.uniform1f(u.uU, uProg);
    gl.uniform1f(u.uSubjectDepth, subjectDepth);
    gl.uniform1f(u.uHasSubject, hasSubject ? 1.0 : 0.0);
    gl.uniform1i(u.uBgMode, bgMode);
    gl.uniform1i(u.uFgMode, st.fgMode);
    gl.uniform2f(u.uPivot, st.pivotX, st.pivotY);
    gl.uniform1f(u.uBob, st.bob);
    gl.uniform1f(u.uRot, st.rot);
    gl.uniform1f(u.uScale, st.scale);
    gl.uniform2f(u.uTrans, st.transX, st.transY);
    gl.uniform1f(u.uKick, kick);
    gl.uniform1f(u.uKickPulse, kickPulse);
    gl.uniform1f(u.uBeatPhase, beatPhase);
    gl.uniform1f(u.uDownPulse, downPulse);
    gl.uniform1i(u.uMood, moodToInt(mood));
    gl.uniform1f(u.uSinceStart, sinceStart);
    gl.uniform1f(u.uShotDur, shot.end - shot.start);
    gl.uniform1f(u.uSeed, t * 24.0);
    gl.uniform2f(u.uBbox, img.hasSubject && img.subject && img.subject.bbox ? img.subject.bbox[0] : 0, img.hasSubject && img.subject && img.subject.bbox ? img.subject.bbox[3] : 0);
    gl.uniform1f(u.uMaxOff, 0.012);
    gl.uniform1f(u.uEchoK, 0.6 + 0.4 * kick);

    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, hasSubject ? texs.plate : texs.file);
    gl.uniform1i(gl.getUniformLocation(state.program, 'uBg'), 8);

    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, hasSubject ? texs.fg : texs.file);
    gl.uniform1i(gl.getUniformLocation(state.program, 'uFg'), 9);

    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, texs.depth);
    gl.uniform1i(gl.getUniformLocation(state.program, 'uDepth'), 10);

    gl.activeTexture(gl.TEXTURE11);
    if (o.behindTex) {
      gl.bindTexture(gl.TEXTURE_2D, o.behindTex);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texs.file);
    }
    gl.uniform1i(gl.getUniformLocation(state.program, 'uBehind'), 11);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  window.Footage2 = {
    init: init,
    prepare: prepare,
    has: has,
    renderShot: renderShot
  };
})();
