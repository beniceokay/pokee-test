precision highp float;

#define TAU 6.28318530718

uniform vec2 uRes;
uniform float uTime, uBeat, uBass, uTreble, uSection, uShift, uFlash, uCamY, uCamX, uZoom, uSat, uShake;
uniform float uStrobe, uKale, uUnder, uSun, uFade, uMoonFill, uKick;
uniform vec3 uCyan, uMag, uCream, uUV, uEmber, uTide;

float hash11(float n){ return fract(sin(n * 127.1) * 43758.5453123); }
float hash21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }
vec2 hash22(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 sat3(vec3 c, float s){
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(l), c, s);
}

vec3 skyBase(vec2 uv){
    float h = clamp((uv.y - 0.58) / 0.42, 0.0, 1.0);
    vec3 top = vec3(0.0196, 0.0235, 0.0588); // #05060F
    vec3 deep = uTide * 0.8;
    vec3 uvv = uUV;
    vec3 mag = uMag;
    vec3 col = mix(deep, top, smoothstep(0.10, 1.0, h));
    col = mix(col, uvv * 0.6, smoothstep(0.0, 0.35, h) * 0.5);
    
    // Narrow magenta haze just above horizon
    float haze = exp(-abs(uv.y - 0.58) * 18.0);
    col += mag * haze * 0.5;
    
    if(uSun > 0.001){
        vec3 sunTop = mix(uEmber, uMag, 0.3);
        vec3 sunDeep = mix(uEmber * 0.5, uTide, 0.5);
        vec3 sunCol = mix(sunDeep, sunTop, smoothstep(0.10, 1.0, h));
        col = mix(col, sunCol, uSun);
    }
    return col;
}

vec3 stars(vec2 uv){
    vec2 g1 = floor(uv * 140.0);
    float s1 = hash21(g1);
    vec2 o1 = hash22(g1) - 0.5;
    float d1 = length(uv * 140.0 - g1 - o1);
    float tw1 = 0.5 + 0.5 * sin(uTime * (2.0 + 4.0 * hash21(g1 + 7.0)) + hash21(g1) * TAU);
    float star1 = smoothstep(0.08, 0.0, d1) * step(0.82, s1) * (0.3 + 0.7 * tw1);
    vec2 g2 = floor(uv * 60.0);
    float s2 = hash21(g2 + 3.0);
    vec2 o2 = hash22(g2 + 3.0) - 0.5;
    float d2 = length(uv * 60.0 - g2 - o2);
    float star2 = smoothstep(0.10, 0.0, d2) * step(0.88, s2) * 0.6;
    float shoot = 0.0;
    float st = fract(uTime / 4.0);
    if(st < 0.12){
        float p = st / 0.12;
        vec2 a = vec2(0.10, 0.90);
        vec2 b = vec2(0.70, 0.55);
        vec2 pos = mix(a, b, p);
        float dd = length(uv - pos);
        shoot = smoothstep(0.02, 0.0, dd) * (1.0 - p);
    }
    vec3 col = vec3(star1) * (0.7 + 0.6 * uTreble) + vec3(star2) * (0.5 + 0.5 * uTreble) + vec3(shoot);
    return col;
}

// moon / sunrise sun: written by Claude
vec3 moon(vec2 uv){
    float aspect = uRes.x / uRes.y;
    vec2 p = (uv - vec2(0.5, 0.70)) * vec2(aspect, 1.0);
    float r = 0.17 * (1.0 + 2.5 * uMoonFill);
    float d = length(p);
    float px = 1.5 / uRes.y;
    float disk = 1.0 - smoothstep(r - px, r, d);
    float ny = clamp(p.y / r * 0.5 + 0.5, 0.0, 1.0);          // 0 bottom .. 1 top
    vec3 moonTop = uCream * 1.05;
    vec3 moonBot = mix(uMag, uUV, 0.25);
    vec3 sunTop = vec3(1.0, 0.78, 0.30);
    vec3 sunBot = mix(uMag, uEmber, 0.25);
    vec3 top = mix(moonTop, sunTop, uSun);
    vec3 bot = mix(moonBot, sunBot, uSun);
    vec3 col = mix(bot, top, smoothstep(0.35, 1.0, ny));
    col *= 0.92 + 0.08 * sin(p.y * 220.0);                      // fine scan texture
    // classic cutout bands in the lower half, thicker toward the bottom, drifting down
    float t = clamp(-p.y / r, 0.0, 1.0);                         // 0 at centre .. 1 at bottom
    float bands = 7.0;
    float bp = t * bands + fract(uTime * 0.15);
    float bf = fract(bp);
    float thick = mix(0.08, 0.55, t) * step(0.04, t);
    float aa = px / r * bands;
    float cut = smoothstep(0.5 - thick * 0.5 - aa, 0.5 - thick * 0.5, bf) * (1.0 - smoothstep(0.5 + thick * 0.5, 0.5 + thick * 0.5 + aa, bf));
    cut *= step(p.y, 0.0);
    float mask = disk * (1.0 - cut);
    float halo = exp(-max(d - r, 0.0) * 9.0) * (0.35 + 0.45 * uBass) * (1.0 - disk);
    vec3 haloCol = mix(mix(uMag, uCream, 0.35), uEmber, uSun);
    return col * mask * 0.8 + haloCol * halo * 0.5;
}

vec3 sectionFx(vec2 uv, vec3 col){
    float sec = uSection;
    
    if((sec > 1.5 && sec < 2.5) || (sec > 4.5 && sec < 5.5)){
        col = sat3(col, 0.6);
        col *= 1.0 + uStrobe * 0.7;
    }
    
    if((sec > 2.5 && sec < 3.5) || (sec > 5.5 && sec < 6.5)){
        col = sat3(col, 1.6);
        float aspect = uRes.x / uRes.y;
        vec2 p = (uv - vec2(0.5, 0.58)) * vec2(aspect, 1.0);
        float ang = atan(p.y, p.x);
        float rad = length(p);
        
        // Crisp thin bright lines
        float streak = 0.5 + 0.5 * sin(ang * 20.0 + uTime * 5.0);
        streak = smoothstep(0.95, 1.0, streak); // Make crisp
        float ring = 0.5 + 0.5 * sin(rad * 30.0 - uTime * 4.0);
        ring = smoothstep(0.95, 1.0, ring); // Make crisp
        col += uCyan * streak * 0.1 * smoothstep(0.0, 0.5, rad);
        col += uMag * ring * 0.15 * uKick * smoothstep(0.0, 0.8, rad);
        
        float beam = floor((ang + 3.14159) * 48.0 / TAU);
        float angHash = hash21(vec2(beam, 7.0));
        float inBeam = 1.0 - smoothstep(0.0, 0.07, abs(fract((ang + 3.14159) * 48.0 / TAU) - 0.5));
        float streakSpeed = smoothstep(0.55, 1.0, sin(rad * 5.0 - uTime * 14.0 + angHash * 40.0));
        col += mix(uCyan, uCream, angHash) * streakSpeed * inBeam * step(0.55, angHash) * 0.35 * smoothstep(0.05, 0.6, rad);
        
        // Crisp rings
        for(int i = 0; i < 3; i++){
            float fi = float(i);
            float ringRad = fract(uTime * 0.5 + fi * 0.33) * 1.5;
            float ringWidth = 0.01 + 0.01 * uKick; // Thinner
            float ringMask = smoothstep(ringWidth, 0.0, abs(rad - ringRad));
            col += uMag * ringMask * 0.3 * uKick;
        }
    }
    
    if(uUnder > 0.001){
        vec2 uvU = uv;
        uvU.x += 0.02 * sin(uTime * 0.5 + uv.y * 5.0);
        uvU.y += 0.01 * cos(uTime * 0.3 + uv.x * 3.0);
        
        // True caustics: iterated-sin
        vec2 pU = uvU * 15.0;
        float caustic = 0.0;
        vec2 q = pU;
        for(int i = 0; i < 5; i++){
            float fi = float(i);
            q.x += 0.8 * sin(q.y + uTime * 0.5 + fi * 0.5);
            q.y += 0.8 * sin(q.x - uTime * 0.4 + fi * 0.3);
            caustic += 1.0 / length(q - pU);
        }
        caustic = smoothstep(0.5, 2.0, caustic);
        col += uCyan * caustic * 0.3 * uUnder;
        
        // Small crisp bubbles
        for(int i = 0; i < 12; i++){
            float fi = float(i);
            float bx = hash21(vec2(fi, 1.0)) * 0.8 + 0.1;
            float by = fract(uTime * 0.2 * (0.5 + hash21(vec2(fi, 2.0))) + hash21(vec2(fi, 3.0)));
            float br = 0.003 + 0.003 * hash21(vec2(fi, 4.0)); // Smaller
            float d = length(uvU - vec2(bx, by));
            float bubble = smoothstep(br, 0.0, d);
            float highlight = smoothstep(br * 0.3, 0.0, length(uvU - vec2(bx - br * 0.3, by + br * 0.3)));
            col += uCream * bubble * 0.3 * uUnder;
            col += vec3(1.0) * highlight * 0.5 * uUnder;
        }
        
        // God rays
        vec2 rayCenter = vec2(0.5, 1.5);
        vec2 rayDir = uvU - rayCenter;
        float rayAng = atan(rayDir.y, rayDir.x);
        float rayRad = length(rayDir);
        float rayStripe = 0.5 + 0.5 * sin(rayAng * 15.0 + uTime * 0.5);
        rayStripe = smoothstep(0.8, 1.0, rayStripe); // Crisp
        float rayFade = smoothstep(2.0, 0.0, rayRad);
        col += uUV * rayStripe * rayFade * 0.15 * uUnder;
        
        // Deep blue base
        col = mix(col, vec3(0.01, 0.02, 0.08) * 0.5, uUnder * 0.4);
        col += uCyan * sin(uTime * 2.0 + uv.y * 5.0) * 0.05 * uUnder;
    }
    
    if(sec > 7.5 && sec < 8.5){
        col = mix(col, col * vec3(1.2, 0.8, 1.3), uSun * 0.5);
    }
    
    if(sec > 8.5){
        // Fade to warm cream, keep moon visible
        col = mix(col, uCream * 0.8, uFade);
    }
    
    return col;
}

// ---- skyline + ocean + compositing: written by Claude ----
// Skyline returns rgb + coverage so towers occlude the moon instead of adding to it.
vec4 skyline(vec2 uv){
    float aspect = uRes.x / uRes.y;
    float y = uv.y - 0.58;
    float px = 1.0 / uRes.y;
    vec4 acc = vec4(0.0);
    for(int layer = 0; layer < 2; layer++){
        float ll = float(layer);
        float cellW = mix(0.05, 0.075, ll);
        float x = (uv.x - 0.5) * aspect + uCamX * (0.3 + 0.5 * ll) + ll * 7.31;
        float id = floor(x / cellW);
        float lx = fract(x / cellW) - 0.5;
        float r = hash21(vec2(id, ll * 17.0 + 3.0));
        float w = 0.5 * (0.55 + 0.4 * hash21(vec2(id, ll + 5.0)));
        float h = (0.012 + 0.09 * r * r) * mix(1.0, 0.75, ll);
        float stepped = step(0.55, hash21(vec2(id, ll + 40.0)));
        float pxc = px / cellW;
        float inX  = 1.0 - smoothstep(w - pxc, w, abs(lx));
        float inX2 = 1.0 - smoothstep(w * 0.55 - pxc, w * 0.55, abs(lx));
        float lowTop  = 1.0 - smoothstep(h * 0.72 - px, h * 0.72, y);
        float fullTop = 1.0 - smoothstep(h - px, h, y);
        float body = mix(inX * fullTop, max(inX * lowTop, inX2 * fullTop), stepped);
        body *= smoothstep(-px, 0.0, y);
        // antenna on the tallest towers
        float ant = step(0.8, r) * (1.0 - smoothstep(0.0, px * 1.2, abs(lx))) * step(y, h + 0.025) * step(h, y);
        body = max(body, ant);
        // windows: small lit cells on a grid, ~25% lit, slow flicker
        vec2 wc = vec2(lx * cellW / 0.0055, y / 0.0075);
        vec2 wcell = floor(wc);
        vec2 wf = fract(wc);
        float wr = hash21(wcell + vec2(id * 13.0, ll * 71.0));
        float inWin = step(0.25, wf.x) * step(wf.x, 0.75) * step(0.3, wf.y) * step(wf.y, 0.75);
        float lit = step(0.74, wr) * (0.65 + 0.35 * sin(uTime * (0.3 + wr * 1.7) + wr * 40.0));
        lit *= step(y, h * 0.95) * step(0.004, y) * inX;
        vec3 winCol = mix(uCream, uCyan, step(0.88, wr)) * (1.2 - 0.5 * ll);
        // back layer: hazy ultraviolet; front layer: near-black silhouette
        vec3 baseCol = ll < 0.5 ? (uUV * 0.16 + uMag * 0.06) : vec3(0.008, 0.008, 0.022);
        vec3 layerCol = baseCol + winCol * lit * inWin * 0.9;
        acc.rgb = mix(acc.rgb, layerCol, body);
        acc.a = max(acc.a, body);
    }
    return acc;
}

vec3 ocean(vec2 uv){
    float aspect = uRes.x / uRes.y;
    float dy = max(0.58 - uv.y, 0.0008);
    float z = 0.40 / dy;                       // z = 1 at the hit line (uv.y = 0.18)
    float dzdp = 0.40 / (dy * dy) / uRes.y;    // z change per pixel, for analytic AA
    vec3 col = mix(vec3(0.004, 0.006, 0.02), vec3(0.035, 0.03, 0.10), smoothstep(0.35, 0.0, dy));
    col += uMag * exp(-dy * 30.0) * 0.35;      // horizon glow on the water

    // rows scroll toward the viewer: one row per beat (0.6 s)
    float fr = fract(2.0 * z + uTime / 0.6);
    float dRow = min(fr, 1.0 - fr);
    float wRow = 2.0 * dzdp;
    float row = 1.0 - smoothstep(0.0, max(wRow * 1.4, 0.0008), dRow);
    row = row + 0.25 * exp(-dRow / max(wRow * 3.0, 0.002));
    row *= 1.0 - smoothstep(0.12, 0.5, wRow);

    // longitudinal lines converging on the vanishing point
    float f = (uv.x - 0.5) * aspect * z / 0.35;
    float dLon = abs(fract(f + 0.5) - 0.5);
    float wLon = z / (0.35 * uRes.y) + abs(f) * dzdp / z;
    float lon = 1.0 - smoothstep(0.0, max(wLon * 1.4, 0.0008), dLon);
    lon = lon + 0.25 * exp(-dLon / max(wLon * 3.0, 0.002));
    lon *= 1.0 - smoothstep(0.12, 0.5, wLon);

    vec3 gridCol = mix(uCyan, uMag, smoothstep(1.2, 9.0, z));
    float energy = 0.5 + 0.6 * uBass + 0.9 * uKick;
    float horizonFade = smoothstep(0.0, 0.04, dy);
    float playfield = 1.0 - 0.3 * smoothstep(0.08, 0.14, uv.y) * smoothstep(0.30, 0.22, uv.y);
    col += gridCol * clamp(row + lon, 0.0, 1.4) * energy * horizonFade * playfield * 0.85;

    // broken, rippling reflection of the moon
    float rx = abs(uv.x - 0.5) * aspect;
    float wdt = 0.05 + dy * 0.22;
    float streak = exp(-(rx * rx) / (wdt * wdt));
    float rip = smoothstep(0.2, 1.0, sin(z * 26.0 - uTime * 2.4 + sin(uv.x * 38.0 + uTime * 1.3) * 1.6));
    vec3 moonTint = mix(mix(uCream, uMag, 0.35), uEmber, uSun);
    col += moonTint * streak * rip * 0.55 * exp(-dy * 2.2);

    // shimmering reflection of the skyline windows
    vec4 sk = skyline(vec2(uv.x + 0.004 * sin(z * 30.0 + uTime * 2.0), 0.58 + dy * 0.9));
    col = mix(col, col * 0.6 + sk.rgb * 0.7, sk.a * 0.45 * smoothstep(0.12, 0.0, dy));
    return col;
}

vec3 world(vec2 uv){
    vec3 col;
    if(uv.y >= 0.58){
        float aspect = uRes.x / uRes.y;
        float md = length((uv - vec2(0.5, 0.70)) * vec2(aspect, 1.0));
        float occ = 1.0 - 0.85 * smoothstep(0.17 * (1.0 + 2.5 * uMoonFill), 0.17 * (1.0 + 2.5 * uMoonFill) - 0.003, md);
        col = (skyBase(uv) + stars(uv)) * occ + moon(uv);
        vec4 sk = skyline(uv);
        col = mix(col, sk.rgb, sk.a);
    } else {
        col = ocean(uv);
    }
    return sectionFx(uv, col);
}

vec3 scene(vec2 uv){
    vec3 col = world(uv);
    if(uKale > 0.001 && uv.x > 0.5){
        col = mix(col, world(vec2(1.0 - uv.x, uv.y)), uKale);
    }
    return col;
}

void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    uv += uShake * vec2(hash21(vec2(uTime * 10.0)), hash21(vec2(uTime * 10.0 + 1.0))) * 0.01;
    uv = (uv - 0.5) / uZoom + 0.5;
    
    if(uUnder > 0.001){
        uv.x += 0.01 * sin(uTime * 0.8 + uv.y * 10.0) * uUnder;
        uv.y += 0.005 * cos(uTime * 0.6 + uv.x * 8.0) * uUnder;
    }
    
    float ca = uKick * 0.002;
    vec3 col;
    if(ca > 0.0005){
        float r = scene(uv + vec2(ca, 0.0)).r;
        vec3 g = scene(uv);
        float b = scene(uv - vec2(ca, 0.0)).b;
        col = vec3(r, g.g, b);
    } else {
        col = scene(uv);
    }
    
    col = aces(col);
    col = pow(col, vec3(1.15)); // Contrast
    col = sat3(col, uSat);
    
    if(uShift > 0.001){
        vec3 inv = vec3(1.0) - col;
        inv = mix(inv, inv * uMag * 2.0, 0.5);
        col = mix(col, inv, uShift);
    }
    
    float vig = 1.0 - 0.3 * length(uv - 0.5);
    col *= vig;
    
    // Grain: amplitude 0.015 max, multiply by (0.3+luma)
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float grain = hash21(uv * uRes + uTime * 100.0) * 0.015 - 0.0075;
    col += grain * (0.3 + luma);
    
    col += vec3(uFlash);
    
    // Scanlines amplitude 0.015
    float scan = 0.985 + 0.015 * sin(uv.y * uRes.y * 3.14159);
    col *= scan;
    
    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, 1.0);
}
