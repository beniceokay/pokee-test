```glsl
// NEBULA FLY-THROUGH — NEON RUST REQUIEM
// Helpers prefixed nb_

vec3 nb_sunDir() {
    // Sun position in world space: far ahead, slightly right and below center
    vec3 sunPos = vec3(4.0, -2.0, 60.0);
    return normalize(sunPos);
}

float nb_nebulaDensity(vec3 p, vec3 sunDir) {
    // Cheaper noise: 2-3 octaves of noise() with domain warping
    // Large billowing structures
    float t = uTime * 0.03;
    
    // Domain warp for wispy filaments
    vec3 warp = vec3(
        noise(p * 0.4 + vec3(0.0, t, 0.0)),
        noise(p * 0.4 + vec3(5.2, 0.0, t)),
        noise(p * 0.4 + vec3(0.0, 1.3, t))
    ) - 0.5;
    
    vec3 pw = p * 0.35 + warp * 1.8;
    
    // 2 octaves of noise for density
    float d1 = noise(pw);
    float d2 = noise(pw * 2.1 + vec3(10.0));
    
    float density = d1 * 0.7 + d2 * 0.3;
    
    // Empty corridor along flight path (z-axis) to fly between walls of gas
    float corridor = smoothstep(0.8, 2.5, length(p.xy));
    density *= corridor;
    
    // Fade out with distance from camera to keep it local
    float fade = 1.0 - smoothstep(15.0, 45.0, p.z);
    density *= fade;
    
    // Boost near sun for rust-orange dusty regions
    float sunDist = length(p - vec3(4.0, -2.0, 60.0));
    float sunInfluence = smoothstep(30.0, 5.0, sunDist);
    density *= 1.0 + sunInfluence * 0.5;
    
    return density;
}

vec3 nb_nebulaColor(vec3 p, float density, vec3 sunDir) {
    // Colour by density and position
    vec3 sunPos = vec3(4.0, -2.0, 60.0);
    float sunDist = length(p - sunPos);
    
    // Base: deep violet
    vec3 col = C_VIOLET * 0.3;
    
    // Hot magenta filaments (high density regions)
    float filament = smoothstep(0.5, 0.9, density);
    col += C_MAGENTA * filament * 0.8;
    
    // Rust-orange dusty regions near the sun
    float rustFactor = smoothstep(30.0, 5.0, sunDist) * density;
    col += C_RUST * rustFactor * 1.2;
    
    // Cyan ionised highlights (sparse, high frequency)
    float cyanNoise = noise(p * 3.0 + vec3(20.0));
    float cyan = smoothstep(0.7, 0.9, cyanNoise) * density * 0.5;
    col += C_CYAN * cyan;
    
    // Lighting: brighter rims facing the sun
    vec3 lightDir = normalize(sunPos - p);
    float rim = dot(lightDir, sunDir) * 0.5 + 0.5;
    float lightFalloff = 1.0 / (1.0 + 0.01 * sunDist * sunDist);
    col *= (0.3 + rim * lightFalloff * 2.0);
    
    return col * density * 0.6;
}

vec3 nb_sunColor(vec3 rd, vec3 ro, vec3 sunDir) {
    vec3 sunPos = vec3(4.0, -2.0, 60.0);
    vec3 toSun = sunPos - ro;
    float sunDist = length(toSun);
    vec3 sunDirNorm = normalize(toSun);
    
    // Angle between ray and sun direction
    float cosAngle = dot(rd, sunDirNorm);
    
    // Sun disk: swollen pink-orange
    float sunRadius = 0.08;
    float disk = smoothstep(sunRadius, sunRadius - 0.01, acos(cosAngle));
    
    // Corona: pow falloff
    float corona = pow(max(0.0, 1.0 - acos(cosAngle) / 0.3), 3.0) * 0.5;
    
    // Sun color: pink-orange
    vec3 sunCol = mix(vec3(1.0, 0.4, 0.3), vec3(1.0, 0.6, 0.5), 0.5);
    
    // Pulse on uKick
    float pulse = 1.0 + uKick * 0.3;
    
    vec3 col = sunCol * (disk * 5.0 + corona * 2.0) * pulse;
    
    // Lens flare: horizontal anamorphic streak (cyan-tinted)
    float streak = exp(-abs(rd.y) * 50.0) * smoothstep(0.0, 0.1, cosAngle);
    col += C_CYAN * streak * 3.0 * pulse;
    
    // Ghost discs along the line from sun through screen center
    vec3 sunToCenter = normalize(-sunDirNorm);
    float ghost1 = smoothstep(0.02, 0.0, length(rd - sunToCenter * 0.5)) * 0.3;
    float ghost2 = smoothstep(0.015, 0.0, length(rd - sunToCenter * 1.0)) * 0.2;
    col += vec3(0.8, 0.5, 0.6) * (ghost1 + ghost2) * pulse;
    
    return col;
}

float nb_debrisSDF(vec3 p, float idx) {
    // 8-12 rusted wreckage shards
    // Each shard: intersected rotated boxes, tumbling slowly
    float t = uTime * 0.1;
    
    // Position shards in a ring around the flight path
    float angle = idx * 0.5 + t * 0.05;
    float radius = 3.0 + hash11(idx * 1.7) * 4.0;
    float zPos = 5.0 + hash11(idx * 2.3) * 30.0;
    
    vec3 shardPos = vec3(
        cos(angle) * radius,
        sin(angle) * radius * 0.5,
        zPos
    );
    
    // Tumbling rotation
    float roll = t * (0.5 + hash11(idx * 3.1) * 0.5);
    vec3 lp = p - shardPos;
    lp = rot(roll) * lp.xy;
    lp = vec3(lp.x, lp.y, rot(roll * 0.7) * lp.zy);
    
    // Jagged shape: intersected rotated boxes
    float size = 0.3 + hash11(idx * 4.7) * 0.5;
    float b1 = sdBox(lp, vec3(size, size * 0.6, size * 0.4));
    float b2 = sdBox(lp * rot(0.5), vec3(size * 0.7, size * 0.8, size * 0.3));
    float b3 = sdBox(lp * rot(-0.3), vec3(size * 0.5, size * 0.5, size * 0.6));
    
    float d = max(b1, b2);
    d = max(d, b3);
    
    return d;
}

vec3 nb_debrisColor(vec3 p, vec3 rd, vec3 sunDir) {
    // Dark with hot orange rim from sun side
    vec3 sunPos = vec3(4.0, -2.0, 60.0);
    vec3 lightDir = normalize(sunPos - p);
    float rim = max(0.0, dot(rd, lightDir));
    
    vec3 col = vec3(0.05, 0.03, 0.02); // Dark rust
    col += C_RUST * rim * rim * 3.0;   // Hot orange rim
    col += C_MAGENTA * rim * 0.5;      // Slight magenta tint
    
    return col;
}

float nb_satelliteSDF(vec3 p, float prog) {
    // Larger recognisable broken SATELLITE passes close to camera on the left during uProg 0.4-0.8
    if (prog < 0.4 || prog > 0.8) return 100.0;
    
    // Satellite position: left side, passing by
    float satT = (prog - 0.4) / 0.4; // 0..1 within the window
    vec3 satPos = vec3(-3.0, 0.5, 10.0 + satT * 20.0);
    
    vec3 lp = p - satPos;
    float roll = uTime * 0.2;
    lp = rot(roll) * lp.xy;
    
    // Box body
    float body = sdBox(lp, vec3(1.0, 0.8, 0.6));
    
    // Solar panel wings (one snapped and bent)
    float wing1 = sdBox(lp - vec3(2.0, 0.0, 0.0), vec3(1.5, 0.05, 0.8));
    float wing2 = sdBox(lp - vec3(-1.5, 0.3, 0.2) * rot(0.5), vec3(1.2, 0.05, 0.7));
    
    // Antenna dish
    vec3 dishPos = vec3(0.0, 1.0, 0.0);
    float dish = sdSphere(lp - dishPos, 0.4);
    dish = max(dish, -length(lp - dishPos - vec3(0.0, 0.2, 0.0)) + 0.3);
    
    float d = min(body, min(wing1, wing2));
    d = min(d, dish);
    
    return d;
}

vec3 nb_satelliteColor(vec3 p, vec3 rd, vec3 sunDir) {
    // Silhouette with cyan blinking light and rim-lit edges
    vec3 sunPos = vec3(4.0, -2.0, 60.0);
    vec3 lightDir = normalize(sunPos - p);
    float rim = max(0.0, dot(rd, lightDir));
    
    vec3 col = vec3(0.02, 0.02, 0.03); // Dark silhouette
    
    // Rim light
    col += C_CYAN * rim * rim * 2.0;
    col += C_RUST * rim * 1.0;
    
    // Cyan blinking light
    float blink = step(0.5, fract(uTime * 2.0));
    vec3 lightPos = vec3(-3.0, 1.5, 10.0 + ((uProg - 0.4) / 0.4) * 20.0);
    float lightDist = length(p - lightPos);
    col += C_CYAN * blink * exp(-lightDist * 5.0) * 5.0;
    
    return col;
}

vec3 sceneMain(vec2 fragCoord) {
    // Camera setup
    vec2 uv = (fragCoord - 0.5 * uRes) / uRes.y;
    
    // Slow banking: roll and slight yaw toward the sun
    float roll = sin(uLocal * 0.2) * 0.06;
    float yaw = 0.05 * sin(uLocal * 0.1);
    
    vec3 ro = vec3(0.0, 0.0, uLocal * 1.2 + 0.0);
    vec3 rd = normalize(vec3(uv, 1.6));
    
    // Apply roll and yaw
    rd = rot(roll) * rd.xy;
    rd = vec3(rd.x, rd.y, rot(yaw) * rd.zy);
    rd = normalize(rd);
    
    // Jittered ray start to hide banding
    float jitter = hash12(fragCoord) - 0.5;
    ro += rd * jitter * 0.1;
    
    vec3 sunDir = nb_sunDir();
    
    // STARS: behind the nebula, attenuated by nebula transmittance
    // On each kick, stretch stars radially slightly
    vec3 rdStar = rd;
    if (uKick > 0.01) {
        // Push rd toward motion direction proportional to uKick
        vec3 motionDir = normalize(vec3(0.0, 0.0, 1.0));
        rdStar = normalize(rd + motionDir * uKick * 0.1);
    }
    float stars = starfield(rdStar, 0.025);
    
    // VOLUMETRIC NEBULA: raymarch density field
    const int STEPS = 48;
    float stepSize = 0.8;
    vec3 col = vec3(0.0);
    float transmittance = 1.0;
    
    for (int i = 0; i < STEPS; i++) {
        float t = float(i) * stepSize + 0.1;
        vec3 p = ro + rd * t;
        
        // Stop if we've passed the sun or too far
        if (t > 50.0) break;
        
        float density = nb_nebulaDensity(p, sunDir);
        if (density < 0.01) continue;
        
        vec3 emission = nb_nebulaColor(p, density, sunDir);
        
        // Front-to-back compositing with absorption + emission
        float alpha = density * stepSize * 0.5;
        col += transmittance * emission * alpha;
        transmittance *= (1.0 - alpha);
        
        if (transmittance < 0.01) break;
    }
    
    // Stars attenuated by nebula transmittance
    col += stars * transmittance * 2.0;
    
    // DYING SUN
    vec3 sunCol = nb_sunColor(rd, ro, sunDir);
    col += sunCol * transmittance;
    
    // DEBRIS: 8-12 rusted wreckage shards
    for (int i = 0; i < 10; i++) {
        float fi = float(i);
        float d = nb_debrisSDF(ro + rd * 5.0, fi);
        
        // Simple raymarch for each shard (limited steps)
        float t = 0.0;
        bool hit = false;
        for (int j = 0; j < 16; j++) {
            vec3 p = ro + rd * t;
            float sd = nb_debrisSDF(p, fi);
            if (sd < 0.01) { hit = true; break; }
            t += sd * 0.8;
            if (t > 30.0) break;
        }
        
        if (hit) {
            vec3 p = ro + rd * t;
            vec3 dCol = nb_debrisColor(p, rd, sunDir);
            // Blend with existing color (simple alpha)
            float alpha = 0.8;
            col = mix(col, dCol, alpha);
            break; // Only one debris hit per ray
        }
    }
    
    // SATELLITE
    float satD = nb_satelliteSDF(ro + rd * 5.0, uProg);
    float tSat = 0.0;
    bool satHit = false;
    for (int j = 0; j < 24; j++) {
        vec3 p = ro + rd * tSat;
        float sd = nb_satelliteSDF(p, uProg);
        if (sd < 0.01) { satHit = true; break; }
        tSat += sd * 0.8;
        if (tSat > 30.0) break;
    }
    
    if (satHit) {
        vec3 p = ro + rd * tSat;
        vec3 sCol = nb_satelliteColor(p, rd, sunDir);
        float alpha = 0.9;
        col = mix(col, sCol, alpha);
    }
    
    // Fade in from near black over the first 1.5s
    float fadeIn = smoothstep(0.0, 1.5, uLocal);
    col *= fadeIn;
    
    return col;
}
```