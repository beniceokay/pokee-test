// ===== GAMEPLAY TUNNEL — the cathedral nave (Claude, on Isaac's layout: octagon ribs, stained glass, beat wave, rose-window eye) =====
// uP0.xy cam offset, uP0.z cam z, uP0.w roll; uP1.x sector 0..2, uP1.y boss, uP1.z damage, uP1.w overclock
const float TN_R = 3.2;      // octagon apothem
const float TN_SP = 2.5;     // rib spacing
float tn_oct(vec2 p){ p = abs(p); return max(max(p.x, p.y), (p.x + p.y)*0.70710678); }
vec3 tn_pal(float s, int k){
  // k: 0 neon, 1 fog, 2 glass A, 3 glass B, 4 metal tint
  vec3 a, b, c;
  if(k==0){ a = C_MAGENTA; b = C_CYAN; c = iridescent(uTime*0.15); }
  else if(k==1){ a = vec3(0.05,0.012,0.07); b = vec3(0.02,0.05,0.07); c = vec3(0.09,0.01,0.06); }
  else if(k==2){ a = vec3(1.0,0.45,0.08); b = C_CYAN; c = C_MAGENTA; }
  else if(k==3){ a = C_MAGENTA; b = C_BONE; c = vec3(0.5,0.25,1.0); }
  else { a = vec3(0.30,0.10,0.04); b = vec3(0.16,0.20,0.24); c = vec3(0.22,0.10,0.24); }
  return s < 1.0 ? mix(a, b, s) : mix(b, c, s - 1.0);
}
float tn_map(vec3 p, out float mat){
  float r = tn_oct(p.xy);
  float wall = TN_R - r;
  float zi = floor(p.z/TN_SP + 0.5);
  float zc = p.z - zi*TN_SP;
  bool grand = mod(zi, 4.0) < 0.5;
  float depth = grand ? 0.62 : 0.36;
  float thick = grand ? 0.22 : 0.13;
  float rib = max(TN_R - depth - r, abs(zc) - thick);
  // chamfer the rib's inner edge
  rib = max(rib, (TN_R - depth - r) + abs(zc) - thick - 0.06);
  // corner struts (octagon corners sit at 22.5deg + k*45deg); rot(a)*v rotates v by -a
  float ang = atan(p.y, p.x);
  float cang = (floor(ang/(PI/4.0)) + 0.5)*(PI/4.0);
  vec2 q = rot(cang) * p.xy;
  float strut = length(q - vec2(TN_R*1.0824 - 0.12, 0.0)) - 0.16;
  float d = min(wall, rib);
  d = min(d, strut);
  mat = d == wall ? 0.0 : (d == rib ? (grand ? 2.0 : 1.0) : 3.0);
  return d;
}
float tn_mapD(vec3 p){ float m; return tn_map(p, m); }
vec3 tn_normal(vec3 p){
  const vec2 e = vec2(0.002, -0.002);
  return normalize(e.xyy*tn_mapD(p+e.xyy) + e.yyx*tn_mapD(p+e.yyx) + e.yxy*tn_mapD(p+e.yxy) + e.xxx*tn_mapD(p+e.xxx));
}
// beat wave: a bright front travelling from far away toward the camera each beat
float tn_wave(float ribZ, float camZ){
  float ahead = ribZ - camZ;
  float front = mix(55.0, -2.0, uBeat);
  return exp(-pow((ahead - front)/3.0, 2.0)) * smoothstep(-2.0, 4.0, ahead);
}
vec3 tn_glass(vec3 p, float s, float segZ, float side){
  // panel-local coordinates
  float a = atan(p.y, p.x);
  float u = fract((a + PI)/(PI/4.0)) ;
  float v = fract(p.z/TN_SP + 0.5);
  vec2 g = vec2(u*4.0, v*6.0);
  vec2 id = floor(g), f = fract(g);
  vec2 jit = hash22(id + segZ*7.0 + side*13.0);
  // lead lines
  float lead = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float leadMask = smoothstep(0.02, 0.07, lead);
  // pointed arch window shape inside panel
  float archX = abs(u - 0.5)*2.0;
  float arch = step(archX, 0.85) * step(0.08, v) * step(v, 0.92 - archX*archX*0.25);
  vec3 c = mix(tn_pal(s, 2), tn_pal(s, 3), step(0.5, jit.x));
  c = mix(c, C_BONE, step(0.85, jit.y)*0.6);
  float pulse = 0.85 + 0.15*sin(uTime*1.3 + segZ + side);
  return c * leadMask * arch * pulse * (1.4 + 1.6*jit.y);
}
vec3 sceneMain(vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5*uRes)/uRes.y;
  float s = clamp(uP1.x, 0.0, 2.0);
  float boss = uP1.y;
  // Heaven.exe glitch slices
  float gl = smoothstep(1.4, 2.0, s);
  if(gl > 0.0){
    float band = floor(uv.y*22.0);
    float h = hash12(vec2(band, floor(uTime*9.0)));
    if(h > 1.0 - 0.06*gl) uv.x += (hash11(band + floor(uTime*9.0)) - 0.5)*0.08;
  }
  // damage: radial punch
  uv *= 1.0 - uP1.z*0.06*length(uv);
  vec2 ruv = rot(uP0.w) * uv;
  vec3 ro = vec3(uP0.xy, uP0.z);
  vec3 rd = normalize(vec3(ruv, 1.6));

  float t = 0.05, mat = 0.0; bool hit = false;
  for(int i=0;i<90;i++){
    vec3 p = ro + rd*t;
    float d = tn_map(p, mat);
    if(d < 0.0015*t){ hit = true; break; }
    t += d*0.9;
    if(t > 75.0) break;
  }
  vec3 fogC = mix(tn_pal(s, 1), vec3(0.06, 0.0, 0.02), boss*0.8);
  vec3 neon = mix(tn_pal(s, 0), vec3(1.0, 0.08, 0.25), boss*0.6);
  vec3 col = fogC;
  if(hit){
    vec3 p = ro + rd*t;
    vec3 n = tn_normal(p);
    float zi = floor(p.z/TN_SP + 0.5);
    float zc = p.z - zi*TN_SP;
    float r = tn_oct(p.xy);
    // rusted metal albedo
    float nz = noise(p*vec3(1.6,1.6,0.9)) * 0.6 + noise(p*7.0)*0.4;
    vec3 metal = tn_pal(s, 4);
    vec3 alb = mix(vec3(0.035,0.032,0.04), metal, smoothstep(0.35, 0.8, nz)) * mix(1.0, 0.6, boss);
    float rough = mix(0.3, 0.9, smoothstep(0.35, 0.8, nz));
    // light: headlight + neon bounce from nearest rib + wave
    float wave = tn_wave(zi*TN_SP, ro.z);
    float ribLight = exp(-abs(zc)*1.6) * (0.25 + 1.6*wave + 0.8*uKick);
    float head = max(dot(n, -rd), 0.0) / (1.0 + t*t*0.012);
    vec3 v = -rd; vec3 h = normalize(v - rd);
    float spec = pow(max(dot(n, v), 0.0), mix(60.0, 8.0, rough)) * (1.0 - rough);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    col = alb * (head*0.9 + 0.02) + alb * neon * ribLight * 0.55;
    col += spec * head * 0.5 + fres * neon * 0.02 * (1.0 - rough) * (0.3 + wave);
    vec3 em = vec3(0.0);
    if(mat > 0.5 && mat < 2.5){
      // neon outline along the rib's inner edge (thin octagon per rib)
      float depthR = (mat > 1.5 ? 0.62 : 0.36);
      float edge = 1.0 - smoothstep(0.0, 0.035, r - (TN_R - depthR));
      float faceSide = smoothstep(0.0, 0.02, abs(zc) - (mat > 1.5 ? 0.22 : 0.13) + 0.02);
      float strip = edge * faceSide;
      // secondary faint line near the wall
      strip += (1.0 - smoothstep(0.0, 0.02, abs(r - (TN_R - 0.08)))) * faceSide * 0.35;
      float k = 0.45 + 4.0*wave + 1.4*uKick;
      em += neon * strip * k * (mat > 1.5 ? 1.4 : 1.0);
    } else if(mat < 0.5){
      // stained glass panels
      float side = floor((atan(p.y, p.x) + PI)/(PI/4.0));
      float hs = hash12(vec2(zi, side) + 0.37);
      if(hs < 0.22 && boss < 0.5) em += tn_glass(p, s, zi, side) * (1.0 + 0.6*wave);
      // grime seams between plates
      float seam = smoothstep(0.02, 0.0, abs(fract(p.z*1.2) - 0.5) - 0.47);
      col *= 1.0 - seam*0.5;
    } else {
      // struts: tiny running lights
      float run = smoothstep(0.92, 1.0, fract(p.z*0.25 - uTime*1.5));
      em += neon * run * 2.0;
    }
    // Cryo Choir ice glints
    float ice = 1.0 - abs(s - 1.0);
    if(ice > 0.0){ float g = hash12(floor(p.xy*30.0) + floor(p.z*30.0)); em += C_CYAN * step(0.995, g) * ice * 3.0 * (0.5 + 0.5*sin(uTime*6.0 + g*40.0)); }
    float fog = 1.0 - exp(-t*0.06);
    col = mix(col + em, fogC, fog);
  }
  // vanishing point: glowing core pulls the eye forward
  float vp = length(ruv);
  col += neon * (0.7*exp(-vp*10.0) + 0.05*exp(-vp*3.0)) * (0.7 + 0.5*uBass) * (1.0 - boss*0.6);
  // boss: rose-window eye at the end of the nave
  if(boss > 0.01){
    float rr = vp/0.32, ang = atan(ruv.y, ruv.x);
    float ring = exp(-pow((rr - 1.0)/0.04, 2.0)) + exp(-pow((rr - 0.72)/0.03, 2.0))*0.7;
    float petals = exp(-pow((rr - 0.86)/0.12, 2.0)) * pow(abs(cos(ang*6.0)), 6.0);
    float spokes = exp(-pow(abs(sin(ang*12.0))*rr*0.32/0.006, 2.0)) * step(0.25, rr) * step(rr, 0.72);
    float iris = 0.35 + 0.12*uKick;
    float irisR = exp(-pow((rr - iris)/0.05, 2.0)) * 1.6;
    float pupil = smoothstep(iris*0.7, iris*0.55, rr);
    vec3 eyeC = mix(vec3(1.0,0.15,0.3), C_MAGENTA, 0.4);
    vec3 eye = eyeC*(ring*2.4 + petals*1.2 + spokes*1.2) + vec3(1.0,0.6,0.2)*irisR + vec3(1.0,0.9,0.95)*pupil*0.15;
    col += eye * boss * 0.7;
  }
  // embers drifting toward the camera
  for(int layer=0; layer<4; layer++){
    float z = 3.0 + float(layer)*5.0 - mod(ro.z, 5.0);
    vec3 pp = ro + rd*(z/rd.z);
    vec2 g = floor(pp.xy*1.6 + float(layer)*7.0);
    float h = hash12(g + floor((ro.z + z)/5.0)*3.1);
    if(h > 0.88){
      vec2 c = (g + 0.5 + 0.3*(hash22(g) - 0.5))/1.6 - float(layer)*7.0/1.6;
      float dd = length(pp.xy - c);
      col += mix(neon, C_BONE, h) * exp(-dd*dd/0.0009) * 1.3 / (1.0 + z*0.1);
    }
  }
  // damage tint, overclock grade
  col = mix(col, col*vec3(1.6,0.25,0.3) + vec3(0.15,0.0,0.01), uP1.z*0.7);
  float lum = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(col, lum*vec3(0.55,1.0,1.1)*1.2, uP1.w*0.6);
  return col;
}
