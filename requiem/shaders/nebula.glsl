// ===== NEBULA FLY-THROUGH (Claude, after Isaac's layout: corridor of gas, dying sun + anamorphic flare, debris, satellite) =====
const vec3 NB_SUN = vec3(5.0, -2.2, 80.0);
float nb_n(vec3 p){ return noise(p); }
float nb_density(vec3 p){
  // domain-warped billows with a flight corridor
  vec3 q = p*0.16;
  vec3 w = vec3(nb_n(q*1.3 + 1.7), nb_n(q*1.3 + 9.2), nb_n(q*1.3 + 4.4)) - 0.5;
  q += w*1.6;
  float d = nb_n(q)*0.62 + nb_n(q*2.3 + 3.0)*0.28 + nb_n(q*5.1 + 7.0)*0.10;
  float corridor = smoothstep(1.2, 4.5, length(p.xy - vec2(sin(p.z*0.05)*1.5, cos(p.z*0.04)*0.8)));
  d = smoothstep(0.50, 0.82, d) * corridor;
  return d;
}
// rusted shard: intersection of rotated boxes, local space
float nb_shard(vec3 p, float seed){
  vec3 q = p;
  q.xy = rot(seed*3.0) * q.xy; q.yz = rot(seed*5.0) * q.yz;
  float a = sdBox(q, vec3(0.55, 0.12, 0.30)*(0.6 + seed));
  q.xz = rot(0.7) * q.xz;
  float b = sdBox(q, vec3(0.40, 0.25, 0.35)*(0.6 + seed));
  return max(a, b) - 0.01;
}
float nb_sat(vec3 p){
  // body + snapped solar wings + dish
  float body = sdBox(p, vec3(0.35, 0.35, 0.55));
  vec3 w1 = p - vec3(1.35, 0.0, 0.0);
  float wing1 = sdBox(w1, vec3(0.95, 0.025, 0.42));
  vec3 w2 = p - vec3(-0.55, 0.0, 0.0); w2.xy = rot(-0.6) * w2.xy; w2 -= vec3(-0.75, 0.0, 0.0);
  float wing2 = sdBox(w2, vec3(0.75, 0.025, 0.42));
  float strut = sdCapsule(p, vec3(-0.35,0.0,0.0), vec3(0.45,0.0,0.0), 0.04);
  vec3 dp = p - vec3(0.0, 0.55, 0.2);
  float dish = max(sdSphere(dp, 0.45), -sdSphere(dp - vec3(0.0, 0.25, 0.0), 0.45));
  dish = max(dish, dp.y - 0.05);
  return min(min(min(body, wing1), min(wing2, strut)), dish);
}
vec3 sceneMain(vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5*uRes)/uRes.y;
  float roll = sin(uLocal*0.2)*0.06;
  uv = rot(roll) * uv;
  vec3 ro = vec3(0.0, 0.0, uLocal*2.2);
  vec3 rd = normalize(vec3(uv + vec2(0.04, -0.02)*uProg, 1.6));
  vec3 sunDir = normalize(NB_SUN - ro);
  float sd = dot(rd, sunDir);

  // background: stars + dying sun
  vec3 rdS = normalize(rd + vec3(uv*0.06*uKick, 0.0));
  vec3 bg = vec3(0.8,0.8,1.0) * starfield(rdS, 0.025) * 0.9;
  float sunA = acos(clamp(sd, -1.0, 1.0));
  float pulse = 1.0 + 0.15*uKick;
  bg += vec3(1.0, 0.55, 0.45) * smoothstep(0.035, 0.028, sunA) * 7.0 * pulse;          // disc
  bg += vec3(1.0, 0.35, 0.45) * exp(-sunA*18.0) * 1.6 * pulse;                         // corona
  bg += vec3(0.9, 0.25, 0.55) * exp(-sunA*4.0) * 0.18;                                 // wide halo

  // volumetric gas (front-to-back)
  vec3 col = vec3(0.0); float T = 1.0;
  float jitter = hash12(fragCoord + fract(uTime)*91.0);
  float stepL = 0.55;
  for(int i=0;i<56;i++){
    float t = 0.4 + (float(i) + jitter)*stepL;
    vec3 p = ro + rd*t;
    float d = nb_density(p);
    if(d > 0.001){
      // sun-facing rim light: sample density toward the sun
      float dl = nb_density(p + sunDir*0.9);
      float lit = clamp((d - dl)*2.2 + 0.25, 0.0, 1.0);
      float sunNear = exp(-length(p - NB_SUN)*0.02);
      vec3 body = mix(vec3(0.05, 0.01, 0.10), vec3(0.45, 0.03, 0.32), smoothstep(0.3, 0.95, d));
      vec3 rim = mix(vec3(1.0, 0.35, 0.55), vec3(1.0, 0.55, 0.25), sunNear);
      vec3 em = body*0.3 + rim*lit*lit*1.1;
      em += C_CYAN * smoothstep(0.75, 0.95, nb_n(p*0.9 + 20.0)) * d * 0.6;            // ionised wisps
      float a = 1.0 - exp(-d*stepL*0.9);
      col += T * em * a;
      T *= 1.0 - a;
      if(T < 0.02) break;
    }
  }
  col += bg * T;
  // anamorphic flare through the sun + ghosts toward screen centre
  vec2 sunUV = sunDir.xy/sunDir.z*1.6;
  float streak = exp(-abs(uv.y - sunUV.y)*90.0) * exp(-abs(uv.x - sunUV.x)*1.6);
  col += vec3(0.35, 0.75, 1.0) * streak * 1.4 * pulse;
  for(int g=1; g<4; g++){
    vec2 gp = sunUV * (1.0 - float(g)*0.55);
    float gd = length(uv - gp);
    col += mix(C_MAGENTA, C_CYAN, float(g)/3.0) * smoothstep(0.05 + 0.02*float(g), 0.0, gd) * 0.06;
  }
  // rusted debris tumbling past (raymarched shards)
  float tHit = 1e5; vec3 nrm = vec3(0.0); float seedHit = 0.0;
  for(int k=0;k<9;k++){
    float fk = float(k);
    float seed = hash11(fk*7.31);
    float zrel = mod(fk*3.4 + 7.0 - ro.z, 30.0) + 1.2;
    float side = hash11(fk*3.1) < 0.5 ? -1.0 : 1.0;
    vec3 c = vec3(side*(1.4 + hash11(fk*9.1)*3.2), (hash11(fk*5.7) - 0.5)*3.6, ro.z + zrel);
    vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc,oc) - 1.2*1.2;
    if(b*b - cc < 0.0) continue;
    float t = max(-b - sqrt(b*b - cc), 0.0);
    for(int j=0;j<28;j++){
      vec3 p = ro + rd*t - c;
      p.xy = rot(uTime*0.3*(seed - 0.5)) * p.xy; p.yz = rot(uTime*0.2*seed) * p.yz;
      float d = nb_shard(p, seed);
      if(d < 0.003){ if(t < tHit){ tHit = t; seedHit = seed;
          vec2 e = vec2(0.004, 0.0);
          nrm = normalize(vec3(nb_shard(p+e.xyy,seed)-nb_shard(p-e.xyy,seed), nb_shard(p+e.yxy,seed)-nb_shard(p-e.yxy,seed), nb_shard(p+e.yyx,seed)-nb_shard(p-e.yyx,seed)));
          nrm.yz = rot(-uTime*0.2*seed) * nrm.yz; nrm.xy = rot(-uTime*0.3*(seed-0.5)) * nrm.xy; }
        break; }
      t += d;
      if(t > 30.0) break;
    }
  }
  // the broken satellite drifts past on the left mid-shot
  float satT = smoothstep(0.30, 0.85, uProg);
  vec3 satC = ro + vec3(-3.4 + satT*1.2, 0.9 - satT*0.4, 12.0 - satT*7.5);
  {
    vec3 oc = ro - satC; float b = dot(oc, rd); float cc = dot(oc,oc) - 2.6*2.6;
    if(b*b - cc > 0.0 && uProg > 0.25 && uProg < 0.95){
      float t = max(-b - sqrt(b*b - cc), 0.0);
      for(int j=0;j<48;j++){
        vec3 p = ro + rd*t - satC; p.xz = rot(uTime*0.25) * p.xz; p.xy = rot(0.4) * p.xy;
        float d = nb_sat(p);
        if(d < 0.003){ if(t < tHit){ tHit = t; seedHit = -1.0;
            vec2 e = vec2(0.004, 0.0);
            nrm = normalize(vec3(nb_sat(p+e.xyy)-nb_sat(p-e.xyy), nb_sat(p+e.yxy)-nb_sat(p-e.yxy), nb_sat(p+e.yyx)-nb_sat(p-e.yyx)));
            nrm.xy = rot(-0.4) * nrm.xy; nrm.xz = rot(-uTime*0.25) * nrm.xz; }
          break; }
        t += d*0.9;
        if(t > 30.0) break;
      }
    }
  }
  if(tHit < 1e4){
    vec3 p = ro + rd*tHit;
    float ndl = max(dot(nrm, sunDir), 0.0);
    float rim = pow(1.0 - max(dot(nrm, -rd), 0.0), 3.0);
    float rust = noise(p*6.0);
    vec3 alb = mix(vec3(0.03,0.028,0.035), vec3(0.22,0.07,0.025), smoothstep(0.4, 0.7, rust));
    vec3 sc = alb*(ndl*vec3(1.0,0.55,0.4)*2.2 + 0.015) + vec3(1.0,0.45,0.25)*rim*ndl*1.2 + C_MAGENTA*rim*0.15;
    if(seedHit < 0.0){
      // satellite: solar cells sheen + blinking beacon
      sc += vec3(0.1,0.25,0.5) * pow(max(dot(reflect(rd, nrm), sunDir), 0.0), 20.0) * 2.0;
    }
    float fogD = 1.0 - exp(-tHit*0.03);
    col = mix(sc, col, fogD*0.6);
  }
  // satellite beacon
  if(uProg > 0.25 && uProg < 0.95){
    vec3 bc = satC + vec3(0.0, 0.42, 0.0);
    vec3 v = bc - ro; float pr = dot(v, rd);
    if(pr > 0.0 && pr < tHit + 0.5){ float dd = length(v - rd*pr); col += C_CYAN * (0.0006/(dd*dd + 0.0006)) * step(0.5, fract(uTime*1.2)) * 1.5; }
  }
  return col * smoothstep(0.0, 1.5, uLocal);
}
