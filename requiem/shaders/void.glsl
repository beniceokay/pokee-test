// ===== VOID / TRANSMISSION — opening signal (Claude) =====
// uP0.x = signal strength 0..1
vec3 sceneMain(vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5*uRes)/uRes.y;
  float sig = uP0.x;
  // analog static, coarse and fine
  float st = hash12(floor(fragCoord/2.0) + floor(uTime*24.0)*13.1);
  float st2 = hash12(fragCoord + fract(uTime*7.0)*311.0);
  vec3 col = vec3(mix(st, st2, 0.5)) * (0.045 - 0.025*sig) * vec3(0.8, 0.75, 1.0);
  // rolling interference band
  float band = exp(-pow((fract(uv.y*0.5 - uTime*0.13) - 0.5)*9.0, 2.0));
  col += vec3(0.25, 0.08, 0.3) * band * 0.08;
  // heartbeat ring expanding from centre on each kick
  float r = length(uv);
  float ringR = 0.12 + (1.0 - uKick)*0.5;
  col += C_MAGENTA * exp(-pow((r - ringR)/0.004, 2.0)) * uKick * 1.6;
  col += C_MAGENTA * exp(-pow((r - 0.10)/0.0025, 2.0)) * (0.25 + 0.6*uKick) * sig;
  // radar sweep
  float a = atan(uv.y, uv.x);
  float sweep = fract((a/TAU) - uTime*0.15);
  col += C_CYAN * pow(sweep, 18.0) * smoothstep(0.42, 0.1, r) * smoothstep(0.08, 0.12, r) * 0.25 * sig;
  // coordinate graticule
  vec2 g = abs(fract(uv*6.0) - 0.5);
  float grid = (1.0 - smoothstep(0.0, 0.012, min(g.x, g.y))) * smoothstep(0.75, 0.2, r);
  col += vec3(0.25, 0.1, 0.35) * grid * 0.05 * sig;
  // the signal: a waveform line across the lower third
  float wx = uv.x;
  float w = sin(wx*40.0 + uTime*6.0)*0.012*sin(wx*3.0 + uTime) + sin(wx*130.0 - uTime*20.0)*0.004*uHigh;
  w *= (0.3 + 1.5*uKick) * sig;
  float wd = abs(uv.y + 0.28 - w);
  col += mix(C_CYAN, C_MAGENTA, 0.5 + 0.5*sin(wx*3.0)) * exp(-wd*wd/0.000012) * 1.2 * sig * smoothstep(0.75, 0.55, abs(wx));
  // distant pinprick: the station, very far away
  vec2 sp = uv - vec2(0.31, 0.12);
  col += vec3(1.0, 0.6, 0.9) * 0.00002/(dot(sp,sp) + 0.00002) * sig * (0.6 + 0.4*sin(uTime*3.0));
  return col;
}
