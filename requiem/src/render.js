// ===== NEON RUST REQUIEM — renderer core (WebGL2, HDR, bloom, filmic post) =====
const SCENE_HEAD = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime, uLocal, uProg, uBeat, uKick, uBass, uHigh;
uniform vec4 uP0, uP1;
out vec4 outColor;
`;
const SCENE_FOOT = `
void main(){ vec3 c = sceneMain(gl_FragCoord.xy); c = max(c, vec3(0.0)); if(any(isnan(c))) c = vec3(0.0); outColor = vec4(min(c, vec3(64.0)), 1.0); }
`;
const VS_FULL = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUv;
void main(){ vec2 p = P[gl_VertexID]; vUv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

// --- bloom: prefilter (soft knee) + 13-tap downsample + tent upsample ---
const FS_PREFILTER = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee;
in vec2 vUv; out vec4 o;
vec3 tap(vec2 off){ return texture(uSrc, vUv + off*uTexel).rgb; }
void main(){
  vec3 c = (tap(vec2(-1,-1))+tap(vec2(1,-1))+tap(vec2(-1,1))+tap(vec2(1,1)))*0.25;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0*uKnee); rq = rq*rq/(4.0*uKnee+1e-4);
  float w = max(rq, br - uThreshold) / max(br, 1e-4);
  o = vec4(c * w, 1.0);
}`;
const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel; in vec2 vUv; out vec4 o;
vec3 t(vec2 d){ return texture(uSrc, vUv + d*uTexel).rgb; }
void main(){
  vec3 a=t(vec2(-2,2)), b=t(vec2(0,2)), c=t(vec2(2,2));
  vec3 d=t(vec2(-2,0)), e=t(vec2(0,0)), f=t(vec2(2,0));
  vec3 g=t(vec2(-2,-2)), h=t(vec2(0,-2)), i=t(vec2(2,-2));
  vec3 j=t(vec2(-1,1)), k=t(vec2(1,1)), l=t(vec2(-1,-1)), m=t(vec2(1,-1));
  vec3 r = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  o = vec4(r,1.0);
}`;
const FS_UP = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uRadius; in vec2 vUv; out vec4 o;
vec3 t(vec2 d){ return texture(uSrc, vUv + d*uTexel*uRadius).rgb; }
void main(){
  vec3 r = t(vec2(0,0))*4.0 + (t(vec2(-1,0))+t(vec2(1,0))+t(vec2(0,-1))+t(vec2(0,1)))*2.0
         + t(vec2(-1,-1))+t(vec2(1,-1))+t(vec2(-1,1))+t(vec2(1,1));
  o = vec4(r/16.0, 1.0);
}`;
// --- final composite: CA, bloom, ACES, grade, grain, scanlines, vignette, glitch, letterbox ---
const FS_COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uScene, uBloom; uniform vec2 uRes; uniform float uTime;
uniform float uBloomAmt, uExposure, uCA, uGrain, uScan, uVignette, uGlitch, uLetterbox, uFade, uFlash, uCrt, uWarp;
uniform vec3 uFlashCol, uTint;
in vec2 vUv; out vec4 o;
float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
void main(){
  vec2 uv = vUv;
  // warp-speed radial zoom smear
  vec2 cc = uv - 0.5;
  // glitch: horizontal slice displacement + block jitter
  if(uGlitch > 0.001){
    float band = floor(uv.y*28.0 + floor(uTime*12.0)*3.1);
    float g = h12(vec2(band, floor(uTime*14.0)));
    if(g > 1.0 - uGlitch*0.5) uv.x += (h12(vec2(band,7.0))-0.5)*0.12*uGlitch;
    float blk = h12(floor(uv*vec2(16.0,9.0)) + floor(uTime*10.0));
    if(blk > 1.0 - uGlitch*0.08) uv += (vec2(h12(vec2(blk,1.0)),h12(vec2(blk,2.0)))-0.5)*0.05;
  }
  // chromatic aberration (radial)
  vec2 dir = (uv-0.5); float r2 = dot(dir,dir);
  float ca = uCA*(0.25 + r2*2.5) + uGlitch*0.01;
  vec3 col;
  if(uWarp > 0.001){
    vec3 acc = vec3(0.0);
    for(int i=0;i<8;i++){ float k = float(i)/7.0; vec2 u2 = 0.5 + dir*(1.0 - k*uWarp*0.35);
      acc += vec3(texture(uScene, u2 + dir*ca).r, texture(uScene, u2).g, texture(uScene, u2 - dir*ca).b); }
    col = acc/8.0;
  } else {
    col = vec3(texture(uScene, uv + dir*ca).r, texture(uScene, uv).g, texture(uScene, uv - dir*ca).b);
  }
  vec3 bl = vec3(texture(uBloom, uv + dir*ca*1.5).r, texture(uBloom, uv).g, texture(uBloom, uv - dir*ca*1.5).b);
  col += bl * uBloomAmt;
  col *= uTint;
  col = aces(col * uExposure);
  // grade: lift shadows toward violet, cool the mids slightly, warm highlights
  float l = dot(col, vec3(0.2126,0.7152,0.0722));
  col += vec3(0.022,0.006,0.040) * (1.0 - smoothstep(0.0,0.35,l));
  col = mix(col, col*vec3(1.03,0.98,1.05), 0.5);
  col = pow(col, vec3(1.0/2.2));
  // vignette
  vec2 vv = vUv - 0.5; col *= mix(1.0, smoothstep(0.85, 0.2, length(vv*vec2(1.0, uRes.y/uRes.x)*1.6)), uVignette);
  // scanlines + CRT mask
  if(uCrt > 0.5){
    float sl = 0.5 + 0.5*sin(gl_FragCoord.y*3.14159);
    col *= 1.0 - uScan*(1.0 - sl);
    float m = mod(gl_FragCoord.x, 3.0);
    col *= mix(vec3(1.0), m<1.0?vec3(1.06,0.97,0.97):m<2.0?vec3(0.97,1.06,0.97):vec3(0.97,0.97,1.06), 0.35*uScan*3.0);
  }
  // film grain (luma-weighted)
  float gr = h12(gl_FragCoord.xy + fract(uTime*37.0)*500.0) - 0.5;
  col += gr * uGrain * (0.6 + 0.4*(1.0-l));
  // flash + fade
  col = mix(col, uFlashCol, clamp(uFlash,0.0,1.0));
  col *= uFade;
  // letterbox (2.39:1)
  float barH = uLetterbox * max(0.0, (1.0 - (uRes.x/uRes.y)/2.39) * 0.5);
  if(vUv.y < barH || vUv.y > 1.0 - barH) col = vec3(0.0);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`;

function createRenderer(canvas, opts) {
  opts = opts || {};
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
  if (!gl) return null;
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  const vao = gl.createVertexArray();

  function compile(type, src, label) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s); gl.deleteShader(s);
      throw new Error('[' + label + '] ' + log);
    }
    return s;
  }
  function program(vs, fs, label) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs, label + ':vs'));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs, label + ':fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('[' + label + '] link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function makeTarget(w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hasFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }
  function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

  const pPre = program(VS_FULL, FS_PREFILTER, 'prefilter');
  const pDown = program(VS_FULL, FS_DOWN, 'down');
  const pUp = program(VS_FULL, FS_UP, 'up');
  const pComp = program(VS_FULL, FS_COMPOSITE, 'composite');

  const R = {
    gl, hasFloat, program, scale: opts.scale || 1, sceneTarget: null, mips: [], W: 0, H: 0, sw: 0, sh: 0,
    scenes: {}, post: {
      bloom: 0.85, threshold: 0.9, knee: 0.6, exposure: 1.0, ca: 0.0025, grain: 0.06, scan: 0.12, vignette: 0.9,
      glitch: 0, letterbox: 0, fade: 1, flash: 0, flashCol: [1, 1, 1], tint: [1, 1, 1], crt: 1, warp: 0, radius: 1.0
    }
  };
  R.resize = function (cssW, cssH, dpr) {
    const W = Math.max(2, Math.floor(cssW * dpr)), H = Math.max(2, Math.floor(cssH * dpr));
    canvas.width = W; canvas.height = H; R.W = W; R.H = H;
    R.setScale(R.scale, true);
  };
  R.setScale = function (s, force) {
    s = Math.max(0.3, Math.min(1, s));
    if (!force && Math.abs(s - R.scale) < 0.01) return;
    R.scale = s;
    const sw = Math.max(2, Math.floor(R.W * s)), sh = Math.max(2, Math.floor(R.H * s));
    R.sw = sw; R.sh = sh;
    freeTarget(R.sceneTarget); R.mips.forEach(freeTarget); R.mips = [];
    R.sceneTarget = makeTarget(sw, sh);
    let w = sw >> 1, h = sh >> 1;
    for (let i = 0; i < 6 && w > 4 && h > 4; i++) { R.mips.push(makeTarget(w, h)); w >>= 1; h >>= 1; }
  };
  R.addScene = function (name, body) {
    const src = SCENE_HEAD + (opts.lib || '') + '\n' + body + '\n' + SCENE_FOOT;
    R.scenes[name] = program(VS_FULL, src, name);
    return R.scenes[name];
  };
  function bindDraw(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : R.W, target ? target.h : R.H);
  }
  R.beginScene = function (name, U) {
    const s = R.scenes[name]; if (!s) return;
    bindDraw(R.sceneTarget); gl.disable(gl.BLEND); gl.useProgram(s.p); gl.bindVertexArray(vao);
    gl.uniform2f(s.u.uRes, R.sw, R.sh);
    gl.uniform1f(s.u.uTime, U.time || 0); gl.uniform1f(s.u.uLocal, U.local || 0); gl.uniform1f(s.u.uProg, U.prog || 0);
    gl.uniform1f(s.u.uBeat, U.beat || 0); gl.uniform1f(s.u.uKick, U.kick || 0); gl.uniform1f(s.u.uBass, U.bass || 0); gl.uniform1f(s.u.uHigh, U.high || 0);
    const p0 = U.p0 || [0, 0, 0, 0], p1 = U.p1 || [0, 0, 0, 0];
    gl.uniform4f(s.u.uP0, p0[0], p0[1], p0[2], p0[3]); gl.uniform4f(s.u.uP1, p1[0], p1[1], p1[2], p1[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  R.clearScene = function () { bindDraw(R.sceneTarget); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  // hook for drawing sprites into the HDR scene target (additive)
  R.bindSceneTarget = function () { bindDraw(R.sceneTarget); };
  function fullPass(prog, srcTex, target, setU) {
    bindDraw(target); gl.useProgram(prog.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(prog.u.uSrc, 0);
    if (setU) setU(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  R.finish = function (time) {
    const P = R.post; gl.disable(gl.BLEND);
    const m = R.mips; if (!m.length) return;
    fullPass(pPre, R.sceneTarget.tex, m[0], u => { gl.uniform2f(u.uTexel, 1 / R.sw, 1 / R.sh); gl.uniform1f(u.uThreshold, P.threshold); gl.uniform1f(u.uKnee, P.knee); });
    for (let i = 1; i < m.length; i++) fullPass(pDown, m[i - 1].tex, m[i], u => gl.uniform2f(u.uTexel, 1 / m[i - 1].w, 1 / m[i - 1].h));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = m.length - 1; i > 0; i--) fullPass(pUp, m[i].tex, m[i - 1], u => { gl.uniform2f(u.uTexel, 1 / m[i].w, 1 / m[i].h); gl.uniform1f(u.uRadius, P.radius); });
    gl.disable(gl.BLEND);
    bindDraw(null); gl.useProgram(pComp.p); gl.bindVertexArray(vao);
    const u = pComp.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.sceneTarget.tex); gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m[0].tex); gl.uniform1i(u.uBloom, 1);
    gl.uniform2f(u.uRes, R.W, R.H); gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uBloomAmt, P.bloom); gl.uniform1f(u.uExposure, P.exposure); gl.uniform1f(u.uCA, P.ca);
    gl.uniform1f(u.uGrain, P.grain); gl.uniform1f(u.uScan, P.scan); gl.uniform1f(u.uVignette, P.vignette);
    gl.uniform1f(u.uGlitch, P.glitch); gl.uniform1f(u.uLetterbox, P.letterbox); gl.uniform1f(u.uFade, P.fade);
    gl.uniform1f(u.uFlash, P.flash); gl.uniform3fv(u.uFlashCol, P.flashCol); gl.uniform3fv(u.uTint, P.tint);
    gl.uniform1f(u.uCrt, P.crt); gl.uniform1f(u.uWarp, P.warp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  return R;
}
