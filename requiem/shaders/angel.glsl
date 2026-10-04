// ===== THE ANGEL — porcelain cyber-goddess (Claude, built on Isaac's halo/crown/wing layout) =====
// uP0.x ascend 0..1, uP0.y reveal 0..1, uP0.z camera push 0..1

// ---------- head SDF (units ~ metres, head height ~0.25) ----------
float ag_head(vec3 p){
  // p: head-local (y up, +z toward viewer)
  vec3 q = p; q.x = abs(q.x);
  // cranium + face mass
  float d = sdEllipsoid(p - vec3(0.0, 0.035, -0.012), vec3(0.083, 0.102, 0.098));
  // jaw / lower face tapering to chin
  float jaw = sdEllipsoid(p - vec3(0.0, -0.045, 0.012), vec3(0.060, 0.070, 0.074));
  d = smin(d, jaw, 0.035);
  float chin = sdEllipsoid(p - vec3(0.0, -0.103, 0.045), vec3(0.022, 0.020, 0.022));
  d = smin(d, chin, 0.03);
  // cheekbones
  float cheek = sdEllipsoid(q - vec3(0.048, -0.008, 0.052), vec3(0.030, 0.024, 0.030));
  d = smin(d, cheek, 0.025);
  // brow ridge
  float brow = sdEllipsoid(q - vec3(0.030, 0.042, 0.072), vec3(0.034, 0.012, 0.020));
  d = smin(d, brow, 0.018);
  // eye sockets (carve)
  float sock = sdEllipsoid(q - vec3(0.032, 0.020, 0.088), vec3(0.023, 0.014, 0.020));
  d = smax(d, -sock, 0.014);
  // closed eyelids (soft domes inside the socket)
  float lid = sdEllipsoid(q - vec3(0.032, 0.018, 0.075), vec3(0.019, 0.010, 0.014));
  d = smin(d, lid, 0.006);
  // nose: bridge + tip + alae
  float bridge = sdCapsule(p, vec3(0.0, 0.030, 0.088), vec3(0.0, -0.022, 0.110), 0.0085);
  d = smin(d, bridge, 0.012);
  float tip = sdEllipsoid(p - vec3(0.0, -0.026, 0.108), vec3(0.012, 0.010, 0.010));
  d = smin(d, tip, 0.008);
  float ala = sdEllipsoid(q - vec3(0.011, -0.031, 0.096), vec3(0.008, 0.006, 0.007));
  d = smin(d, ala, 0.006);
  // philtrum dip + lips
  float upperLip = sdEllipsoid(p - vec3(0.0, -0.053, 0.093), vec3(0.023, 0.0065, 0.010));
  float lowerLip = sdEllipsoid(p - vec3(0.0, -0.066, 0.089), vec3(0.020, 0.0075, 0.010));
  d = smin(d, upperLip, 0.007);
  d = smin(d, lowerLip, 0.007);
  float mouthLine = sdBox(p - vec3(0.0, -0.0595, 0.100), vec3(0.020, 0.0008, 0.012));
  d = smax(d, -mouthLine, 0.003);
  // ear hint
  float ear = sdEllipsoid(q - vec3(0.084, 0.008, -0.006), vec3(0.010, 0.026, 0.016));
  d = smin(d, ear, 0.01);
  return d;
}
float ag_body(vec3 p){
  // neck, collarbones, shoulders, chest
  float neck = sdCapsule(p, vec3(0.0, -0.17, -0.025), vec3(0.0, -0.06, -0.008), 0.039);
  float chest = sdEllipsoid(p - vec3(0.0, -0.30, -0.06), vec3(0.15, 0.09, 0.07));
  vec3 q = p; q.x = abs(q.x);
  float sh = sdEllipsoid(q - vec3(0.165, -0.215, -0.05), vec3(0.080, 0.038, 0.058));
  float clav = sdCapsule(q, vec3(0.02, -0.185, 0.005), vec3(0.15, -0.195, -0.025), 0.009);
  float d = smin(neck, chest, 0.06);
  d = smin(d, sh, 0.05);
  d = smin(d, clav, 0.02);
  // fade the torso out below the chest (cut)
  d = max(d, -(p.y + 0.40));
  return d;
}
// head pose: slight tilt down and 3/4 turn
vec3 ag_toHead(vec3 p){
  vec3 h = p - vec3(0.0, 0.02, 0.0);
  h.xz = rot(-0.33) * h.xz;   // turn
  h.yz = rot(0.12) * h.yz;    // tilt down
  return h;
}
float ag_map(vec3 p){
  return smin(ag_head(ag_toHead(p)), ag_body(p), 0.025);
}
vec3 ag_normal(vec3 p){
  const vec2 e = vec2(0.0007, -0.0007);
  return normalize(e.xyy*ag_map(p+e.xyy) + e.yyx*ag_map(p+e.yyx) + e.yxy*ag_map(p+e.yxy) + e.xxx*ag_map(p+e.xxx));
}
float ag_ao(vec3 p, vec3 n){
  float o = 0.0, s = 1.0;
  for(int i=0;i<5;i++){ float h = 0.004 + 0.018*float(i); o += (h - ag_map(p + n*h))*s; s *= 0.7; }
  return clamp(1.0 - 6.0*o, 0.0, 1.0);
}
// crack network: ridged noise on the surface, masked to one side of the face
float ag_crack(vec3 hp){
  float n1 = abs(noise(hp*38.0) - 0.5);
  float n2 = abs(noise(hp*80.0 + 3.1) - 0.5);
  float c = 1.0 - smoothstep(0.0, 0.035, n1) ;
  c = max(c, (1.0 - smoothstep(0.0, 0.03, n2))*0.6);
  // mask: left cheek / temple / jaw
  float m = smoothstep(0.01, 0.06, -hp.x) * smoothstep(0.09, -0.02, hp.y) * smoothstep(-0.13, -0.05, hp.y + 0.0);
  m = max(m, smoothstep(0.03, 0.08, -hp.x) * smoothstep(0.02, 0.09, hp.y)*0.7);
  return c * m;
}
// tear streak distance (face-local, both eyes)
float ag_tear(vec3 hp, float side){
  vec2 s = vec2(0.020*side, 0.006);
  float y = hp.y;
  float x = s.x + side*0.006*sin((s.y - y)*30.0) + side*(s.y - y)*0.10;
  float along = smoothstep(0.012, -0.005, y) * smoothstep(-0.11, -0.04, y);
  return abs(hp.x - x) / max(along, 0.001);
}

// ---------- glow geometry ----------
// distance from ray (ro,rd) to segment ab, also returns t along segment
float ag_raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, out float h, out float tr){
  vec3 ba = b - a, oa = ro - a;
  float bb = dot(ba,ba), bd = dot(ba,rd), od = dot(oa,rd), ob = dot(oa,ba);
  float den = bb - bd*bd;
  h = clamp((ob - od*bd) / max(den, 1e-5), 0.0, 1.0);
  vec3 pa = a + ba*h;
  tr = max(dot(pa - ro, rd), 0.0);
  vec3 pr = ro + rd*tr;
  return length(pr - pa);
}
vec3 ag_armPt(float u, float sd, float lift, float spread){
  // wing arm: shoulder -> elbow -> wrist -> tip (quadratic segments)
  vec3 S = vec3(sd*0.15, -0.20 + lift, -0.12);
  vec3 E = vec3(sd*(0.40 + 0.05*spread), -0.12 + 0.10*spread + lift, -0.20);
  vec3 W = vec3(sd*(0.78 + 0.10*spread), 0.22 + 0.12*spread + lift, -0.28);
  vec3 T = vec3(sd*(1.02 + 0.12*spread), 0.30 + 0.05*spread + lift, -0.34);
  if(u < 0.5){ float k = u*2.0; return mix(mix(S,E,k), mix(E,W,k), k); }
  float k = (u - 0.5)*2.0; return mix(mix(E,W,k), mix(W,T,k), k);
}
vec3 ag_wings(vec3 ro, vec3 rd, float reveal, float lift){
  vec3 acc = vec3(0.0);
  float spread = 0.6*sin(uTime*0.7)*0.25 + 0.12*uKick;
  for(int side=0; side<2; side++){
    float sd = side==0 ? -1.0 : 1.0;
    // leading edge (the arm) as a bright line
    vec3 prev = ag_armPt(0.0, sd, lift, spread);
    for(int j=1;j<9;j++){
      vec3 cur = ag_armPt(float(j)/8.0, sd, lift, spread);
      float h, tr; float d = ag_raySeg(ro, rd, prev, cur, h, tr);
      acc += C_BONE * exp(-d*d/(0.0035*0.0035)) * 1.4;
      prev = cur;
    }
    for(int layer=0; layer<2; layer++){
      float cov = float(layer);           // 0 = flight feathers, 1 = coverts
      for(int f=0; f<36; f++){
        float u = (float(f) + 0.5)/36.0;
        vec3 root = ag_armPt(u, sd, lift, spread);
        float lenF = mix(0.38, 1.05, pow(u, 0.75)) * mix(1.0, 0.42, cov);
        // flight feathers hang down and sweep outward toward the tip
        vec3 dir = normalize(vec3(sd*(0.10 + 0.95*u*u), -1.0 + 0.55*u*u, -0.15 - 0.1*u));
        dir.xy = rot(sd*(0.06*sin(uTime*1.1 + u*6.0) + 0.05*uKick)) * dir.xy;
        vec3 mid = root + dir*lenF*0.5 + vec3(sd*0.015, 0.0, -0.02);
        vec3 tip = root + dir*lenF + vec3(sd*0.05*u, 0.03, -0.05);
        float h1, t1, h2, t2;
        float d1 = ag_raySeg(ro, rd, root, mid, h1, t1);
        float d2 = ag_raySeg(ro, rd, mid, tip, h2, t2);
        float d = min(d1, d2);
        float along = d1 < d2 ? h1*0.5 : 0.5 + h2*0.5;
        float w = mix(0.0026, 0.0010, along);
        float core = exp(-d*d/(w*w));
        float vaneW = mix(0.010, 0.030, sin(clamp(along,0.0,1.0)*2.9)) * mix(1.0, 0.7, cov);
        float vane = exp(-d*d/(vaneW*vaneW)) * 0.26;
        float haze = 0.00001/(d*d + 0.0006);
        core += vane;
        vec3 col = mix(C_BONE, iridescent(u*0.5 + cov*0.25 + uTime*0.035 + along*0.3), smoothstep(0.1, 0.85, along));
        float ramp = mix(0.25, 1.0, smoothstep(0.0, 0.7, along)) * (1.0 + 1.2*smoothstep(0.85, 1.0, along));
        float shimmer = 0.8 + 0.2*sin(uTime*2.3 + u*25.0 + float(side)*2.0);
        acc += col * (core*1.5 + haze) * ramp * shimmer * mix(1.0, 0.6, cov);
      }
    }
  }
  return acc * reveal;
}
vec3 ag_halo(vec3 ro, vec3 rd, vec3 c, float reveal){
  // three rings in a plane facing the camera (slightly tilted), behind the head
  vec3 acc = vec3(0.0);
  vec3 n = normalize(vec3(0.0, 0.18, 1.0));
  float den = dot(rd, n);
  if(abs(den) < 1e-4) return acc;
  float t = dot(c - ro, n)/den;
  if(t < 0.0) return acc;
  vec3 p = ro + rd*t - c;
  vec3 ax = normalize(cross(vec3(0.0,1.0,0.0), n)), ay = cross(n, ax);
  vec2 q = vec2(dot(p,ax), dot(p,ay));
  float r = length(q), a = atan(q.y, q.x);
  for(int i=0;i<3;i++){
    float fi = float(i);
    float R = 0.165 + fi*0.045;
    float spin = uTime*(0.25 - fi*0.17) + fi;
    float ring = abs(r - R);
    float w = 0.0014 + fi*0.0004;
    float glow = exp(-ring*ring/(w*w)) + 0.00004/(ring*ring + 0.0002)*0.25;
    // sigil notches: angular gating + glyph ticks
    float seg = fract((a + spin)/TAU*(18.0 + fi*6.0));
    float gate = smoothstep(0.0, 0.08, seg)*smoothstep(1.0, 0.82, seg);
    float tick = exp(-pow((seg-0.5)*10.0,2.0)) * exp(-pow((r - R - 0.012)/0.006, 2.0));
    vec3 col = mix(C_BONE, iridescent(fi*0.33 + uTime*0.05 + a*0.08), 0.35 + 0.3*fi);
    acc += col * (glow*(0.5 + 0.5*gate)*0.9 + tick*1.4) * (1.0 + uKick*0.6);
  }
  // soft disc of light behind the head
  acc += mix(C_MAGENTA, C_BONE, 0.4) * 0.08 * exp(-r*r*30.0);
  return acc * reveal;
}
vec3 ag_crown(vec3 ro, vec3 rd, vec3 headTop, float reveal){
  vec3 acc = vec3(0.0);
  for(int i=0;i<7;i++){
    float fi = float(i) - 3.0;
    vec3 dir = normalize(vec3(fi*0.16, 1.0, -0.05 - abs(fi)*0.02));
    float len = 0.13 - abs(fi)*0.018;
    vec3 a = headTop + vec3(fi*0.012, -0.01, 0.0);
    vec3 b = a + dir*len;
    float h, tr; float d = ag_raySeg(ro, rd, a, b, h, tr);
    float w = 0.0012;
    acc += C_BONE * exp(-d*d/(w*w)) * 0.9;
    float blink = 0.5 + 0.5*sin(uTime*3.0 + float(i)*1.7);
    float dt = length(cross(b - ro, rd));
    vec3 tc = (i/2)*2 == i ? C_CYAN : C_MAGENTA;
    acc += tc * (0.00004/(dt*dt + 0.00004)) * (1.0 + 2.0*blink);
  }
  return acc * reveal;
}
vec3 ag_hair(vec3 ro, vec3 rd, vec3 head, float reveal){
  vec3 acc = vec3(0.0);
  for(int i=0;i<22;i++){
    float fi = float(i);
    float s = fi/21.0;
    float ang = mix(-2.7, -0.45, s);         // roots around the back of the skull
    vec3 root = head + vec3(cos(ang)*0.085, 0.055 + sin(ang)*0.02, -0.05 - 0.03*sin(s*3.14));
    vec3 prev = root;
    float dmin = 1e5; float best = 0.0;
    for(int j=1;j<5;j++){
      float u = float(j)/4.0;
      vec3 p = root + vec3((root.x - head.x)*3.6*u + sign(root.x - head.x)*0.10*u*u + 0.06*sin(uTime*0.6 + fi*1.3 + u*3.0)*u,
                           -0.22*u + 0.07*sin(uTime*0.5 + fi + u*2.0)*u,
                           -0.10*u + 0.04*cos(uTime*0.4 + fi*0.7)*u);
      float h, tr; float d = ag_raySeg(ro, rd, prev, p, h, tr);
      if(d < dmin){ dmin = d; best = u; }
      prev = p;
    }
    float w = 0.0016;
    vec3 col = iridescent(s*0.8 + uTime*0.03 + best*0.3);
    acc += col * (exp(-dmin*dmin/(w*w))*0.9 + 0.00003/(dmin*dmin + 0.00006)) * (1.0 - best*0.6);
  }
  return acc * reveal;
}
vec3 ag_background(vec3 rd, vec2 uv){
  vec3 col = C_VOID;
  col += vec3(0.85,0.8,1.0) * starfield(rd, 0.012) * 0.6;
  float neb = fbm(vec3(rd.xy*2.2, uTime*0.015));
  col += mix(C_VIOLET, C_MAGENTA*0.5, neb) * pow(neb, 2.5) * 0.25;
  // light falling from above (god rays)
  float rays = pow(0.5 + 0.5*sin(uv.x*14.0 + sin(uv.x*3.0 + uTime*0.2)*2.0), 6.0);
  col += mix(C_BONE, C_MAGENTA, 0.3) * rays * smoothstep(-0.2, 0.6, uv.y) * 0.05;
  // backlight bloom behind figure
  col += C_MAGENTA * 0.06 * exp(-dot(uv,uv)*3.0) + C_VIOLET * 0.12 * exp(-dot(uv,uv)*1.2);
  return col;
}

vec3 sceneMain(vec2 fragCoord){
  float ascend = uP0.x, reveal = clamp(uP0.y, 0.0, 1.0), push = uP0.z;
  float lift = ascend*1.6;
  vec2 uv = (fragCoord - 0.5*uRes)/uRes.y;
  // camera
  float dist = mix(2.4, 0.95, push);
  vec3 target = vec3(0.0, mix(-0.10, 0.0, push) + lift, 0.0);
  vec3 ro = target + vec3(sin(uTime*0.13)*0.06*dist, 0.03 + 0.02*sin(uTime*0.11), dist);
  vec3 fwd = normalize(target - ro), right = normalize(cross(fwd, vec3(0.0,1.0,0.0))), up = cross(right, fwd);
  vec3 rd = normalize(uv.x*right + uv.y*up + 1.9*fwd);

  vec3 col = ag_background(rd, uv);
  vec3 headC = vec3(0.0, 0.02 + lift, 0.0);
  // halo + wings behind the figure
  col += ag_halo(ro, rd, headC + vec3(0.0, 0.03, -0.11), reveal);
  col += ag_wings(ro, rd, reveal, lift);
  col += ag_hair(ro, rd, headC, reveal) * 0.45;

  // raymarch figure (bounding sphere)
  vec3 bc = vec3(0.0, -0.14 + lift, -0.02); float br = 0.36;
  vec3 oc = ro - bc; float b = dot(oc, rd); float c = dot(oc,oc) - br*br; float disc = b*b - c;
  if(disc > 0.0){
    float t = max(-b - sqrt(disc), 0.0), tmax = -b + sqrt(disc);
    bool hit = false; vec3 p = ro;
    for(int i=0;i<110;i++){
      p = ro + rd*t - vec3(0.0, lift, 0.0);
      float d = ag_map(p);
      if(d < 0.0004*t){ hit = true; break; }
      t += d*0.85;
      if(t > tmax) break;
    }
    if(hit){
      vec3 n = ag_normal(p);
      vec3 hp = ag_toHead(p);
      float ao = ag_ao(p, n);
      vec3 v = -rd;
      // porcelain: wrap diffuse + glaze spec + coloured rims
      vec3 L = normalize(vec3(0.35, 0.75, 0.55));
      float wrap = clamp((dot(n,L) + 0.35)/1.35, 0.0, 1.0);
      float sss = pow(clamp(dot(v, -L + n*0.3), 0.0, 1.0), 2.0)*0.25;
      vec3 alb = mix(vec3(0.05,0.04,0.07), vec3(0.62,0.58,0.66), smoothstep(-0.36, -0.08, p.y - lift));
      float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
      vec3 col2 = alb * (0.02 + 0.95*pow(wrap,1.6)*vec3(1.0,0.95,0.98)) * ao;
      col2 += alb * vec3(0.30,0.10,0.45) * (1.0 - wrap) * 0.35 * ao; // violet shadow fill
      col2 += sss * vec3(1.0,0.55,0.6);
      vec3 H = normalize(L + v);
      col2 += pow(max(dot(n,H),0.0), 90.0) * 1.2 * vec3(1.0,0.97,1.0);
      // rims: cyan from left-behind, magenta from right-behind
      float rimL = pow(clamp(dot(n, normalize(vec3(-0.9, 0.2, -0.4))), 0.0, 1.0), 2.0);
      float rimR = pow(clamp(dot(n, normalize(vec3( 0.9, 0.3, -0.4))), 0.0, 1.0), 2.0);
      col2 += (C_CYAN*rimL*0.9 + C_MAGENTA*rimR*1.1) * (0.15 + fres*1.8);
      // cracks bleeding rust light
      float isHead = step(ag_head(hp), ag_body(p) + 0.01);
      float cr = ag_crack(hp) * isHead;
      col2 = mix(col2, col2*0.35, cr*0.8);
      col2 += mix(C_RUST, vec3(1.0,0.55,0.1), 0.4) * cr * (3.5 + 2.0*uKick);
      // tears (two eyes, droplets cycling)
      for(int s=0;s<2;s++){
        float sd = s==0 ? -1.0 : 1.0;
        float td = ag_tear(hp, sd);
        float tear = exp(-td*td/(0.0016*0.0016)) * isHead;
        float drop = fract(uTime*0.35 + float(s)*0.5);
        float dy = 0.006 - drop*0.11;
        float dd = length(vec2(hp.x - (0.020*sd + sd*(0.006 - dy)*0.10), hp.y - dy));
        float dropG = exp(-dd*dd/(0.004*0.004)) * isHead * smoothstep(0.0, 0.1, drop)*smoothstep(1.0, 0.8, drop);
        col2 += C_CYAN * (tear*2.4 + dropG*6.0);
      }
      // reveal dissolve with cyan burning edge
      float dn = noise(p*26.0 + vec3(0.0, uTime*0.2, 0.0))*0.75 + noise(p*7.0)*0.25;
      float vis = 1.0 - smoothstep(reveal - 0.04, reveal + 0.01, dn);
      float edge = exp(-pow((dn - reveal)/0.025, 2.0)) * step(0.001, reveal) * step(reveal, 0.995);
      // ascend: lower body dissolves into light
      float cut = -0.42 + ascend*0.75;
      float an = noise(p*30.0 + vec3(0.0, -uTime*0.6, 0.0));
      float asc = step(0.001, ascend) * (1.0 - smoothstep(cut - 0.02, cut + 0.10, p.y + an*0.08));
      float bodyFade = smoothstep(-0.38, -0.20, p.y);
      float keep = vis * (1.0 - asc) * bodyFade;
      col = mix(col, col2, keep);
      float ascEdge = step(0.001, ascend) * exp(-pow((p.y + an*0.08 - cut - 0.04)/0.03, 2.0)) * vis * bodyFade;
      col += C_CYAN * edge * 4.0 + mix(C_BONE, C_CYAN, 0.4) * ascEdge * 3.0;
    }
  }
  // crown antennas (drawn over)
  vec3 headTop = headC + vec3(-0.012, 0.125, -0.03);
  col += ag_crown(ro, rd, headTop, reveal);
  // dust motes drifting upward
  for(int i=0;i<14;i++){
    float fi = float(i);
    vec2 mp = vec2(hash11(fi*7.3)*1.8 - 0.9, fract(hash11(fi*3.1) - uTime*(0.015 + 0.02*hash11(fi))) * 1.2 - 0.6);
    mp.x += 0.03*sin(uTime*0.5 + fi);
    float d = length(uv - mp);
    col += mix(C_BONE, C_CYAN, hash11(fi)) * 0.0004/(d*d + 0.0004) * 0.25 * (0.5 + 0.5*sin(uTime*2.0 + fi));
  }
  return col;
}
