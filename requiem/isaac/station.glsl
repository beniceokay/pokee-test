```glsl
// STATION scene — NEON RUST REQUIEM
// All helpers prefixed st_. sceneMain returns LINEAR HDR.

// ---------- small helpers ----------
float st_smin(float a, float b, float k) { return smin(a, b, k); }

// cheap 2D hash for segment ids
float st_segHash(int id) {
    float f = float(id);
    return hash11(f * 127.1 + 311.7);
}

// panel seam carving: returns a "seam factor" 0..1 (1 = on a seam line)
float st_seamFactor(float ang, float segCount) {
    float a = ang * segCount / TAU;
    float f = fract(a);
    float d = min(f, 1.0 - f);          // distance to nearest seam in cell units
    return smoothstep(0.0, 0.03, d);    // 0 at seam, 1 away
}

// jagged broken-edge mask: 1 near the jagged boundary of a broken segment
float st_brokenEdge(float ang, float segCount, int id, float segLen) {
    // only for broken segments
    if (st_segHash(id) > 0.82) { // ~18% broken
        float a = ang * segCount / TAU;
        float f = fract(a);
        // jagged boundary via noise on angle
        float jag = noise(vec3(ang * 3.0, 1.5, float(id) * 0.13));
        float edge = smoothstep(0.0, 0.06, abs(f - jag));
        return 1.0 - edge; // 1 near the jagged edge
    }
    return 0.0;
}

// ---------- SDF primitives for the station ----------

// main segmented ring
float st_mainRing(vec3 p) {
    // rotate into ring plane (ring is in XZ, so p.y is the tube axis)
    float ang = atan(p.z, p.x);
    float r = length(p.xz);
    float segCount = 48.0;
    int id = int(floor(ang * segCount / TAU + 0.5));
    if (id < 0) id += int(segCount);
    float segLen = TAU / segCount;

    // torus distance
    float d = sdTorus(p, vec2(6.0, 0.55));

    // carve panel seams: push distance out near seams (grooves)
    float seam = st_seamFactor(ang, segCount);
    d += (1.0 - seam) * 0.04;

    // rib bands: periodic ridges along the tube
    float rib = sin(ang * 96.0) * 0.5 + 0.5;
    d += rib * 0.015;

    // greebles: small boxes on outer face (r > 6.0)
    if (r > 5.7 && r < 6.6) {
        float gAng = ang * 12.0;
        float g = hash22(vec2(floor(gAng), floor(p.y * 4.0)));
        if (g > 0.6) {
            vec3 gp = p;
            gp.xz = rot(-gAng) * gp.xz;
            float gb = sdBox(gp - vec3(6.3, 0.0, 0.0), vec3(0.08, 0.12, 0.12));
            d = min(d, gb);
        }
    }

    // broken segments: subtract a chunk
    float brk = st_segHash(id);
    if (brk > 0.82) {
        // carve a jagged hole in this segment
        float a = ang * segCount / TAU;
        float f = fract(a);
        float jag = noise(vec3(ang * 3.0, 1.5, float(id) * 0.13));
        float hole = smoothstep(0.15, 0.35, abs(f - jag));
        d = max(d, -hole * 0.4); // subtract where hole is
    }

    return d;
}

// counter-rotating thin ring with spikes
float st_counterRing(vec3 p) {
    // tilt 20 degrees around X
    vec3 q = p;
    q.yz = rot(-0.349) * q.yz; // ~20 deg
    float d = sdTorus(q, vec2(7.5, 0.12));
    // spikes
    float ang = atan(q.z, q.x);
    float spike = sin(ang * 24.0);
    if (spike > 0.7) {
        vec3 sp = q;
        sp.xz = rot(-ang) * sp.xz;
        float s = sdCapsule(sp, vec3(7.5, 0.0, 0.0), vec3(7.5, 0.35, 0.0), 0.04);
        d = min(d, s);
    }
    return d;
}

// central gothic spire
float st_spire(vec3 p) {
    float d = 1e5;
    // stacked tapered cylinders
    d = min(d, sdCylinder(p - vec3(0.0, 0.0, 0.0), 1.2, 0.4));
    d = min(d, sdCylinder(p - vec3(0.0, 1.5, 0.0), 1.0, 0.3));
    d = min(d, sdCylinder(p - vec3(0.0, 2.8, 0.0), 0.8, 0.2));
    d = min(d, sdCylinder(p - vec3(0.0, 4.0, 0.0), 0.5, 0.12));
    d = min(d, sdCylinder(p - vec3(0.0, 5.0, 0.0), 0.3, 0.08));
    // crown of 12 organ pipes
    for (int i = 0; i < 12; i++) {
        float a = float(i) * TAU / 12.0;
        float h = 1.5 + 1.5 * hash11(float(i) * 7.3);
        vec3 base = vec3(cos(a) * 0.5, 5.0, sin(a) * 0.5);
        vec3 tip  = vec3(cos(a) * 0.5, 5.0 + h, sin(a) * 0.5);
        d = min(d, sdCapsule(p, base, tip, 0.06));
        // downward pipes
        vec3 base2 = vec3(cos(a) * 0.5, -1.0, sin(a) * 0.5);
        vec3 tip2  = vec3(cos(a) * 0.5, -1.0 - h * 0.6, sin(a) * 0.5);
        d = min(d, sdCapsule(p, base2, tip2, 0.05));
    }
    return d;
}

// 4 thin spokes
float st_spokes(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < 4; i++) {
        float a = float(i) * TAU / 4.0 + TAU / 8.0;
        vec3 hub = vec3(0.0, 0.0, 0.0);
        vec3 ring = vec3(cos(a) * 6.0, 0.0, sin(a) * 6.0);
        d = min(d, sdCapsule(p, hub, ring, 0.08));
    }
    return d;
}

// dangling cables
float st_cables(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < 8; i++) {
        float a = float(i) * TAU / 8.0 + 0.3;
        float r = 6.0;
        vec3 top = vec3(cos(a) * r, 0.55, sin(a) * r);
        float sag = 1.5 + 0.5 * hash11(float(i) * 3.1);
        vec3 mid = vec3(cos(a) * (r - 0.3), -sag * 0.5, sin(a) * (r - 0.3));
        vec3 bot = vec3(cos(a) * (r - 0.6), -sag, sin(a) * (r - 0.6));
        // approximate sag with two capsules
        d = min(d, sdCapsule(p, top, mid, 0.025));
        d = min(d, sdCapsule(p, mid, bot, 0.025));
    }
    return d;
}

// full station SDF
float st_station(vec3 p) {
    // slow Y rotation
    p.xz = rot(-uTime * 0.05) * p.xz;
    float d = st_mainRing(p);
    d = min(d, st_counterRing(p));
    d = min(d, st_spire(p));
    d = min(d, st_spokes(p));
    d = min(d, st_cables(p));
    return d;
}

// bounding sphere check
bool st_inBounds(vec3 p) {
    return length(p) < 12.0;
}

// ---------- raymarch ----------
vec3 st_raymarch(vec3 ro, vec3 rd, out float t, out int prim) {
    t = 0.0;
    prim = 0;
    for (int i = 0; i < 90; i++) {
        vec3 p = ro + rd * t;
        if (!st_inBounds(p)) break;
        float d = st_station(p);
        if (d < 0.001) {
            // determine which primitive
            p.xz = rot(-uTime * 0.05) * p.xz;
            float dRing = st_mainRing(p);
            float dSpire = st_spire(p);
            float dSpoke = st_spokes(p);
            float dCable = st_cables(p);
            if (dRing < 0.002) prim = 1;
            else if (dSpire < 0.002) prim = 2;
            else if (dSpoke < 0.002) prim = 3;
            else if (dCable < 0.002) prim = 4;
            else prim = 1;
            return p;
        }
        t += d * 0.9;
        if (t > 40.0) break;
    }
    return vec3(0.0);
}

// ---------- normal ----------
vec3 st_normal(vec3 p) {
    const float e = 0.001;
    vec2 k = vec2(1.0, -1.0);
    return normalize(
        k.xyy * st_station(p + k.xyy * e) +
        k.yyx * st_station(p + k.yyx * e) +
        k.yxy * st_station(p + k.yxy * e) +
        k.xxx * st_station(p + k.xxx * e)
    );
}

// ---------- soft shadow ----------
float st_shadow(vec3 ro, vec3 rd) {
    float res = 1.0;
    float t = 0.02;
    for (int i = 0; i < 24; i++) {
        vec3 p = ro + rd * t;
        if (!st_inBounds(p)) break;
        float d = st_station(p);
        if (d < 0.001) return 0.0;
        res = min(res, 8.0 * d / t);
        t += clamp(d, 0.02, 0.2);
        if (t > 10.0) break;
    }
    return clamp(res, 0.0, 1.0);
}

// ---------- shading ----------
vec3 st_shade(vec3 p, vec3 rd, int prim, vec3 ro) {
    vec3 n = st_normal(p);
    vec3 L = normalize(vec3(-0.6, 0.35, -0.4));
    float ndl = max(dot(n, L), 0.0);
    float shadow = st_shadow(p + n * 0.01, L);

    // rust/chrome albedo
    float rustMask = noise(p * 2.0);
    vec3 albedo = mix(vec3(0.05, 0.045, 0.05), C_RUST * 0.35, rustMask * 0.7);

    // grime in seams (cheap: use distance to ring center as proxy)
    float grime = 1.0 - 0.5 * smoothstep(0.0, 0.3, abs(length(p.xz) - 6.0));
    albedo *= (1.0 - grime * 0.4);

    // diffuse
    vec3 diff = albedo * ndl * shadow * 1.2;

    // fresnel rim
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 rim = mix(C_MAGENTA, C_VIOLET, 0.5) * fres * 2.0;

    // hub magenta point light
    vec3 toHub = -p;
    float hubDist = length(toHub);
    vec3 hubLight = C_MAGENTA * 6.0 / (1.0 + hubDist * hubDist * 2.0);
    hubLight *= max(dot(n, normalize(toHub)), 0.0);
    hubLight *= (1.0 + uKick * 2.0);

    // emissive windows on ring
    vec3 emissive = vec3(0.0);
    if (prim == 1) {
        float ang = atan(p.z, p.x);
        float r = length(p.xz);
        // outer face: r > 6.0, inner face: r < 6.0
        bool outer = r > 6.0;
        float cellAng = ang * 48.0 / TAU;
        float cellY = p.y * 8.0;
        vec2 cellId = vec2(floor(cellAng), floor(cellY));
        float h = hash22(cellId);
        if (h < 0.35) { // 35% lit
            float flicker = 0.8 + 0.2 * sin(uTime * 10.0 + h * 50.0);
            if (h < 0.05) flicker = 0.5 + 0.5 * uKick; // strobing
            vec3 winCol = mix(C_BONE, C_CYAN, hash11(h * 7.0));
            emissive = winCol * 3.0 * flicker * (1.0 + uKick * 0.3);
        }
    }

    // broken segment glow
    if (prim == 1) {
        float ang = atan(p.z, p.x);
        float segCount = 48.0;
        int id = int(floor(ang * segCount / TAU + 0.5));
        if (id < 0) id += int(segCount);
        float brk = st_segHash(id);
        if (brk > 0.82) {
            float a = ang * segCount / TAU;
            float f = fract(a);
            float jag = noise(vec3(ang * 3.0, 1.5, float(id) * 0.13));
            float edge = 1.0 - smoothstep(0.0, 0.06, abs(f - jag));
            emissive += vec3(1.0, 0.4, 0.1) * edge * 3.0;
        }
    }

    // hub core glow
    if (prim == 2) {
        emissive = C_MAGENTA * (6.0 + uKick * 4.0);
    }

    // cables: dark silhouette
    if (prim == 4) {
        albedo = vec3(0.02);
        diff *= 0.3;
    }

    return diff + rim + hubLight + emissive;
}

// ---------- background ----------
vec3 st_background(vec3 rd) {
    // starfield
    float stars = starfield(rd, 0.02);
    vec3 col = vec3(stars) * 0.8;

    // nebula wash
    float neb = fbm(rd * 2.0);
    col += mix(C_MAGENTA, C_VIOLET, 0.5) * neb * 0.05;

    // distant sun
    vec3 sunDir = normalize(vec3(-0.6, 0.35, -0.4));
    float sunDot = dot(rd, sunDir);
    float sunDisk = smoothstep(0.9995, 0.9999, sunDot);
    float halo = pow(max(sunDot, 0.0), 64.0) * 0.3;
    col += vec3(1.0, 0.6, 0.3) * (sunDisk * 5.0 + halo);

    return col;
}

// ---------- volumetric glow accumulation ----------
vec3 st_volumetricGlow(vec3 ro, vec3 rd, float tMax) {
    vec3 glow = vec3(0.0);
    int steps = 32;
    float stepSize = tMax / float(steps);
    for (int i = 0; i < steps; i++) {
        float t = (float(i) + 0.5) * stepSize;
        vec3 p = ro + rd * t;
        // hub core glow
        float hubDist = length(p);
        float hubGlow = 6.0 / (1.0 + hubDist * hubDist * 3.0);
        hubGlow *= (1.0 + uKick * 2.0);
        glow += C_MAGENTA * hubGlow * stepSize;
        // window glow (approximate: check if near ring)
        float ringDist = abs(length(p.xz) - 6.0);
        if (ringDist < 0.8 && abs(p.y) < 0.6) {
            float ang = atan(p.z, p.x);
            float cellAng = ang * 48.0 / TAU;
            float cellY = p.y * 8.0;
            vec2 cellId = vec2(floor(cellAng), floor(cellY));
            float h = hash22(cellId);
            if (h < 0.35) {
                float flicker = 0.8 + 0.2 * sin(uTime * 10.0 + h * 50.0);
                glow += mix(C_BONE, C_CYAN, hash11(h * 7.0)) * 3.0 * flicker * stepSize * 0.3;
            }
        }
    }
    return glow;
}

// ---------- spark particles ----------
vec3 st_sparks(vec3 ro, vec3 rd) {
    vec3 col = vec3(0.0);
    for (int i = 0; i < 6; i++) {
        float a = float(i) * TAU / 6.0 + 1.0;
        float r = 6.0;
        vec3 base = vec3(cos(a) * r, 0.0, sin(a) * r);
        float life = fract(uTime * 0.5 + float(i) * 0.17);
        vec3 pos = base + vec3(0.0, life * 1.5, 0.0) + vec3(sin(uTime * 3.0 + i), 0.0, cos(uTime * 2.0 + i)) * life * 0.5;
        float d = length(pos - ro);
        float proj = dot(pos - ro, rd);
        if (proj > 0.0 && proj < d) {
            float dist = length(pos - (ro + rd * proj));
            float glow = 0.01 / (0.01 + dist * dist);
            col += vec3(1.0, 0.5, 0.2) * glow * (1.0 - life) * 2.0;
        }
    }
    return col;
}

// ---------- main scene ----------
vec3 sceneMain(vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * uRes) / uRes.y;

    // camera orbit
    float camAngle = 0.55 + uLocal * 0.045;
    float camHeight = mix(2.5, 1.2, smoothstep(0.0, 1.0, uProg));
    float camDist = mix(17.0, 12.0, smoothstep(0.0, 1.0, uProg));
    vec3 camPos = vec3(cos(camAngle) * camDist, camHeight, sin(camAngle) * camDist);
    vec3 lookAt = vec3(0.0, 0.5, 0.0);

    // camera basis
    vec3 fwd = normalize(lookAt - camPos);
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, fwd);

    // slight roll
    float roll = -0.08;
    right = rot(roll) * right;
    up = rot(roll) * up;

    vec3 rd = normalize(uv.x * right + uv.y * up + 1.7 * fwd);
    vec3 ro = camPos;

    // raymarch
    float t;
    int prim;
    vec3 hit = st_raymarch(ro, rd, t, prim);

    vec3 col;
    if (t < 40.0 && st_inBounds(hit)) {
        col = st_shade(hit, rd, prim, ro);
        // volumetric glow
        col += st_volumetricGlow(ro, rd, t);
        // sparks
        col += st_sparks(ro, rd);
    } else {
        col = st_background(rd);
        // volumetric glow in space
        col += st_volumetricGlow(ro, rd, 40.0);
        col += st_sparks(ro, rd);
    }

    // shockwave ring on beat
    float swRadius = 2.0 + fract(uBeat) * 8.0;
    float swFade = 1.0 - fract(uBeat);
    vec3 swDir = rd;
    float swDist = length(swDir.xz);
    float swGlow = exp(-pow((swDist - swRadius) * 4.0, 2.0)) * swFade * 0.5;
    col += C_MAGENTA * swGlow;

    return col;
}
```