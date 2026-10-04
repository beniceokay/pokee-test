// ===== instanced SDF sprites, drawn additively into the HDR scene target =====
const SPR_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aRect;   // centre px (GL coords), half-size px
layout(location=2) in vec4 aMeta;   // angle, type, param, seed
layout(location=3) in vec4 aCol;    // rgb, intensity
uniform vec2 uRes;
out vec2 vUv; flat out vec4 vMeta; flat out vec4 vCol; flat out vec2 vSize;
void main(){
  float c = cos(aMeta.x), s = sin(aMeta.x);
  vec2 p = aCorner*aRect.zw; p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
  gl_Position = vec4((aRect.xy + p)/uRes*2.0 - 1.0, 0.0, 1.0);
  vUv = aCorner; vMeta = aMeta; vCol = aCol; vSize = aRect.zw;
}`;
const SPR_FS = `#version 300 es
precision highp float;
in vec2 vUv; flat in vec4 vMeta; flat in vec4 vCol; flat in vec2 vSize;
uniform float uTime;
out vec4 o;
#define TAU 6.28318531
float line(float d, float w){ return exp(-d*d/(w*w)); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
float sdHex(vec2 p, float r){ const vec3 k = vec3(-0.866025404,0.5,0.577350269); p = abs(p); p -= 2.0*min(dot(k.xy,p),0.0)*k.xy; p -= vec2(clamp(p.x,-k.z*r,k.z*r), r); return length(p)*sign(p.y); }
float h11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
void main(){
  vec2 uv = vUv; float r = length(uv);
  int type = int(vMeta.y + 0.5); float prm = vMeta.z, seed = vMeta.w;
  float px = 1.5/max(vSize.x, 1.0);               // ~1.5 pixels in uv units
  float lw = max(px, 0.035);
  float m = 0.0; vec3 col = vCol.rgb; vec3 extra = vec3(0.0);
  if(type == 0){            // glow orb
    m = exp(-r*r*7.0) + exp(-r*r*60.0)*1.5;
  } else if(type == 1 || type == 12 || type == 14){ // spear / spark / beam (long axis = x)
    float ax = abs(uv.x);
    float w = type == 14 ? 0.35 : 0.22;
    float core = line(uv.y, max(w*(1.0 - ax*0.7), px*2.0));
    m = core * smoothstep(1.0, 0.55, ax) * (type == 1 ? smoothstep(-1.0, 0.6, uv.x) : 1.0);
    m += line(uv.y, max(px*1.2, 0.05)) * smoothstep(1.0, 0.0, ax) * 1.5;
  } else if(type == 2){     // shockwave ring; prm = age 0..1
    float R = 0.25 + prm*0.7;
    m = line(r - R, max(0.03 + 0.06*(1.0 - prm), px)) * (1.0 - prm);
  } else if(type == 3){     // rust moth: two pairs of patterned wings + body; prm = time
    float flap = 0.55 + 0.45*abs(sin(prm*9.0 + seed*6.0));
    vec2 q = vec2(abs(uv.x), uv.y);
    vec2 w1 = (q - vec2(0.42, 0.18))/vec2(0.42*flap + 0.08, 0.36);
    vec2 w2 = (q - vec2(0.32, -0.30))/vec2(0.30*flap + 0.06, 0.24);
    float d1 = length(w1) - 1.0, d2 = length(w2) - 1.0;
    float d = min(d1, d2);
    float fill = smoothstep(0.05, -0.05, d);
    float edge = line(d, 0.08 + px);
    float eye = line(length(q - vec2(0.45*flap + 0.05, 0.2)) - 0.09, 0.04);
    float veins = fill * (0.5 + 0.5*sin(atan(uv.y - 0.1, q.x)*14.0)) * 0.25;
    float body = line(sdSeg(uv, vec2(0.0, 0.35), vec2(0.0, -0.45)), 0.06);
    m = fill*0.18 + veins + edge*0.9 + body*1.2;
    extra = vec3(0.1, 0.9, 1.0)*eye*2.0;
  } else if(type == 4){     // chrome seraph: hexagon + rotating triangle + eye; prm = shield 0..1
    float hx = sdHex(uv, 0.52);
    m = line(hx, 0.035 + px)*1.2 + smoothstep(0.02, -0.04, hx)*0.10;
    float a = atan(uv.y, uv.x) + uTime*1.5 + seed*6.0;
    float tri = cos(floor(0.5 + a/(TAU/3.0))*(TAU/3.0) - a)*r - 0.30;
    m += line(tri, 0.03 + px)*0.9;
    float eye = line(r - 0.11, 0.035) + exp(-r*r*400.0)*2.0;
    m += eye;
    // six feathered spikes
    float sp = pow(abs(cos(atan(uv.y, uv.x)*3.0)), 30.0) * smoothstep(0.95, 0.55, r) * smoothstep(0.5, 0.6, r);
    m += sp*0.8;
    if(prm > 0.01){ // shield bubble with hex cells
      float sh = line(r - 0.88, 0.05 + px);
      vec2 g = uv*6.0; vec2 cell = abs(fract(g) - 0.5);
      float lattice = (1.0 - smoothstep(0.0, 0.08, min(cell.x, cell.y))) * smoothstep(0.92, 0.6, r) * smoothstep(0.5, 0.8, r);
      extra = vec3(0.2, 0.8, 1.0) * (sh*1.5 + lattice*0.4) * prm;
    }
  } else if(type == 5){     // debris hulk: jagged rock, dark core, rust fissures
    float a = atan(uv.y, uv.x);
    float rad = 0.72 + 0.10*sin(a*5.0 + seed*9.0) + 0.06*sin(a*11.0 + seed*3.0) + 0.04*sin(a*23.0);
    float d = r - rad;
    float fill = smoothstep(0.02, -0.02, d);
    float rim = line(d, 0.04 + px);
    float fiss = fill * line(sin(a*3.0 + r*9.0 + seed*4.0)*0.3, 0.05) * smoothstep(0.1, 0.5, r);
    m = rim*1.1 + fiss*1.4;
    col = mix(col, vec3(1.0, 0.45, 0.1), 0.5);
    extra = vec3(0.01, 0.005, 0.01)*fill;          // near-black body (additive darkness approximated by low value)
  } else if(type == 6){     // glitch wraith: RGB-split ghost with scanline dissolve
    vec3 acc = vec3(0.0);
    for(int c=0;c<3;c++){
      vec2 q = uv + vec2((float(c) - 1.0)*0.06*(0.5 + 0.5*sin(uTime*13.0 + seed)), 0.0);
      float d = length(q*vec2(1.0, 0.7) - vec2(0.0, 0.1)) - 0.55;
      d = max(d, -q.y - 0.75 + 0.15*sin(q.x*14.0 + uTime*6.0));
      float g = line(d, 0.06 + px) + smoothstep(0.0, -0.3, d)*0.15;
      float scan = step(0.35, fract(uv.y*14.0 + uTime*3.0));
      g *= mix(1.0, scan, 0.7);
      acc[c] = g;
    }
    m = 1.0; col = acc * mix(vec3(1.0,0.2,0.9), vec3(0.2,0.9,1.0), 0.4) * 1.3;
    float eyes = exp(-pow(length(vec2(abs(uv.x) - 0.17, uv.y - 0.12))/0.07, 2.0));
    extra = vec3(1.0)*eyes*1.5;
  } else if(type == 7){     // player seraph drone: swept chevron wings, core, mini halo
    vec2 q = vec2(abs(uv.x), uv.y);
    float wing = 1e3;
    for(int i=0;i<4;i++){ float fi = float(i);
      wing = min(wing, sdSeg(q, vec2(0.10, 0.02 - fi*0.10), vec2(0.92 - fi*0.12, 0.30 - fi*0.16))); }
    m = line(wing, 0.035 + px)*1.1;
    m += exp(-r*r*50.0)*2.5 + line(length(uv - vec2(0.0, 0.32)) - 0.13, 0.025 + px)*0.9;
    float thr = line(sdSeg(uv, vec2(0.0, -0.05), vec2(0.0, -0.55 - 0.15*prm)), 0.06)*(0.6 + 0.4*sin(uTime*40.0));
    extra = vec3(0.3, 0.9, 1.0)*thr*1.5;
  } else if(type == 8){     // reticle: rotating brackets + charge arc; prm = lock charge 0..1
    vec2 q = abs(uv);
    float br = min(sdSeg(q, vec2(0.55, 0.8), vec2(0.8, 0.8)), sdSeg(q, vec2(0.8, 0.55), vec2(0.8, 0.8)));
    m = line(br, 0.04 + px)*1.2 + exp(-r*r*300.0)*1.5;
    float a = fract(atan(uv.y, uv.x)/TAU + 0.25);
    float arc = line(r - 0.62, 0.025 + px) * step(a, prm);
    extra = vec3(1.0, 0.3, 0.8)*arc*1.6;
  } else if(type == 9){     // lock marker: rotating diamond
    vec2 q = abs(uv);
    float d = abs(q.x + q.y - 0.75);
    m = line(d, 0.05 + px)*1.4 + exp(-r*r*80.0)*0.8;
  } else if(type == 10){    // organ-pipe weak point
    vec2 q = uv;
    float box = max(abs(q.x) - 0.32, abs(q.y) - 0.92);
    float cap = length(q - vec2(0.0, 0.92)) - 0.32;
    float d = min(box, cap);
    m = line(d, 0.04 + px)*1.0 + smoothstep(0.02, -0.03, d)*0.06;
    float slits = smoothstep(0.02, -0.02, box) * line(fract(q.y*4.0 + uTime*1.5) - 0.5, 0.08) * step(abs(q.x), 0.18);
    float eye = exp(-pow(length(q - vec2(0.0, 0.92))/0.14, 2.0));
    m += slits*1.2;
    extra = vec3(1.0, 0.85, 0.5)*eye*(1.5 + prm*3.0);
  } else if(type == 11){    // power-up glyph inside a ring; seed picks glyph
    m = line(r - 0.78, 0.05 + px) + exp(-r*r*3.0)*0.15;
    float g = 0.0;
    if(seed < 0.34){ g = line(length(uv*vec2(1.0, 0.8) - vec2(0.0, -0.1)) - 0.25, 0.05) + line(sdSeg(uv, vec2(0.0, 0.5), vec2(0.0, 0.1)), 0.05); }
    else if(seed < 0.67){ for(int i=0;i<3;i++) g += line(sdSeg(uv, vec2(-0.35, 0.25 - float(i)*0.25), vec2(0.35, 0.25 - float(i)*0.25)), 0.045); }
    else { g = line(r - 0.4, 0.045) + line(sdSeg(uv, vec2(0.0), vec2(0.0, 0.3)), 0.045) + line(sdSeg(uv, vec2(0.0), vec2(0.22, 0.0)), 0.045); }
    m += g*1.4;
  } else if(type == 13){    // boss eye core
    float a = atan(uv.y, uv.x);
    m = line(r - 0.9, 0.03 + px)*1.2 + line(r - 0.55 - 0.05*sin(a*12.0 + uTime*2.0), 0.03 + px)*1.0;
    m += exp(-r*r*20.0)*(1.0 + prm*2.0) + pow(abs(cos(a*6.0 + uTime)), 40.0)*smoothstep(0.9, 0.6, r)*smoothstep(0.2, 0.5, r)*0.6;
  }
  float fade = smoothstep(1.0, 0.92, max(abs(uv.x), abs(uv.y)));
  vec3 c = (col*m + extra) * vCol.a * fade;
  o = vec4(max(c, vec3(0.0)), 1.0);
}`;
function createSprites(R, max) {
  const gl = R.gl; max = max || 4096;
  const prog = R.program(SPR_VS, SPR_FS, 'sprites');
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const data = new Float32Array(max * 12);
  const ibuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 3; i++) {
    gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16); gl.vertexAttribDivisor(1 + i, 1);
  }
  gl.bindVertexArray(null);
  let n = 0;
  const S = {
    count: () => n,
    begin() { n = 0; },
    // x,y: GL pixel centre in scene target; w,h half-size px; type; angle; rgb; intensity; param; seed
    push(x, y, w, h, type, angle, r, g, b, inten, param, seed) {
      if (n >= max) return;
      const o = n * 12;
      data[o] = x; data[o + 1] = y; data[o + 2] = w; data[o + 3] = h;
      data[o + 4] = angle || 0; data[o + 5] = type; data[o + 6] = param || 0; data[o + 7] = seed || 0;
      data[o + 8] = r; data[o + 9] = g; data[o + 10] = b; data[o + 11] = inten;
      n++;
    },
    flush(time) {
      if (!n) return;
      R.bindSceneTarget();
      gl.useProgram(prog.p); gl.bindVertexArray(vao);
      gl.uniform2f(prog.u.uRes, R.sw, R.sh); gl.uniform1f(prog.u.uTime, time);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 12);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      gl.disable(gl.BLEND); gl.bindVertexArray(null);
    }
  };
  return S;
}
