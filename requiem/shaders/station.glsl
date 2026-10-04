
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
        float g = hash12(vec2(floor(gAng), floor(p.y * 4.0)));
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
    return length(p) < 30.0;
}

// ---------- raymarch ----------
vec3 st_raymarch(vec3 ro, vec3 rd, out float t, out int prim) {
    t = 0.0;
    prim = 0;
    // enter the bounding sphere (radius 9.5) before marching
    float bb = dot(ro, rd), cc = dot(ro, ro) - 9.5*9.5, disc = bb*bb - cc;
    if (disc < 0.0) { t = 1e5; return vec3(0.0); }
    t = max(-bb - sqrt(disc), 0.0);
    float tExit = -bb + sqrt(disc);
    for (int i = 0; i < 110; i++) {
        vec3 p = ro + rd * t;
        if (t > tExit) break;
        float d = st_station(p);
        if (d < 0.0015 * max(1.0, t*0.2)) {
            vec3 world = p;
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
            return world;
        }
        t += d * 0.9;
        if (t > 40.0) break;
    }
    t = 1e5;
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
vec3 st_shade(vec3 pw, vec3 rd, int prim, vec3 ro) {
    vec3 n = st_normal(pw);
    vec3 p = pw; p.xz = rot(-uTime * 0.05) * p.xz;           // station-local for patterns
    vec3 L = normalize(vec3(-0.6, 0.35, -0.4));
    float ndl = max(dot(n, L), 0.0);
    float shadow = st_shadow(pw + n * 0.02, L);
    // rusted chrome
    float rustMask = noise(p * 2.3) * 0.65 + noise(p * 9.0) * 0.35;
    vec3 albedo = mix(vec3(0.045, 0.042, 0.050), vec3(0.28, 0.085, 0.03), smoothstep(0.35, 0.75, rustMask));
    float rough = mix(0.25, 0.85, smoothstep(0.35, 0.75, rustMask));
    vec3 v = -rd, h = normalize(L + v);
    float spec = pow(max(dot(n, h), 0.0), mix(120.0, 12.0, rough)) * (1.0 - rough*0.8);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 sunCol = vec3(1.0, 0.62, 0.42);
    vec3 col = albedo * (ndl * shadow * sunCol * 1.6 + vec3(0.025, 0.012, 0.04));
    col += sunCol * spec * shadow * 2.5;
    // sky reflection on chrome: violet/magenta fresnel
    col += mix(C_VIOLET, C_MAGENTA, 0.35) * fres * (1.0 - rough) * 0.6;
    // magenta core light spilling onto the structure
    vec3 toHub = vec3(0.0, 0.0, 0.0) - pw; float hd = length(toHub);
    float hubAmt = max(dot(n, toHub / hd), 0.0) * 2.2 / (1.0 + hd * hd * 0.35) * (1.0 + uKick * 1.5);
    col += albedo * C_MAGENTA * hubAmt * 3.0 + C_MAGENTA * hubAmt * 0.04;
    vec3 emissive = vec3(0.0);
    if (prim == 1) {
        // small lit windows in a fine grid on the ring hull
        float ang = atan(p.z, p.x);
        vec2 g = vec2(ang * 384.0 / TAU, p.y * 22.0);
        vec2 id = floor(g), f = fract(g);
        float hsh = hash12(id);
        float win = step(0.30, f.x) * step(f.x, 0.70) * step(0.25, f.y) * step(f.y, 0.62);
        float band = step(abs(p.y), 0.42);
        if (hsh < 0.33) {
            float flicker = 0.75 + 0.25 * sin(uTime * (3.0 + hsh * 30.0) + hsh * 50.0);
            if (hsh < 0.03) flicker = 0.3 + 1.2 * uKick;
            vec3 winCol = mix(vec3(1.0, 0.78, 0.55), C_CYAN, step(0.22, hsh));
            emissive += winCol * win * band * 2.2 * flicker;
        }
        // broken segments: molten edges
        float segCount = 48.0;
        int sid = int(floor(ang * segCount / TAU + 0.5));
        if (sid < 0) sid += int(segCount);
        if (st_segHash(sid) > 0.82) {
            float a = ang * segCount / TAU;
            float fa = fract(a);
            float jag = noise(vec3(ang * 3.0, 1.5, float(sid) * 0.13));
            float edge = 1.0 - smoothstep(0.0, 0.05, abs(fa - jag));
            emissive += vec3(1.0, 0.35, 0.06) * edge * 3.5;
        }
    }
    if (prim == 2) {
        // gothic spire: dark metal with glowing tracery bands and a hot core at the hub
        float bands = smoothstep(0.035, 0.0, abs(fract(p.y * 1.6) - 0.5) - 0.44);
        emissive += C_MAGENTA * bands * 0.8 * (1.0 + uKick);
        emissive += C_MAGENTA * 4.0 * smoothstep(0.9, 0.0, length(p)) * (1.0 + uKick * 1.5);
    }
    if (prim == 4) { col *= 0.25; }
    return col + emissive;
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
        float hubGlow = 0.08 / (0.03 + hubDist * hubDist * 2.5);
        hubGlow *= (1.0 + uKick * 2.0);
        glow += C_MAGENTA * hubGlow * stepSize;
        // window glow (approximate: check if near ring)
        float ringDist = abs(length(p.xz) - 6.0);
        if (ringDist < 0.8 && abs(p.y) < 0.6) {
            float ang = atan(p.z, p.x);
            float cellAng = ang * 48.0 / TAU;
            float cellY = p.y * 8.0;
            vec2 cellId = vec2(floor(cellAng), floor(cellY));
            float h = hash12(cellId);
            if (h < 0.35) {
                float flicker = 0.8 + 0.2 * sin(uTime * 10.0 + h * 50.0);
                glow += mix(C_BONE, C_CYAN, hash11(h * 7.0)) * 0.12 * flicker * stepSize;
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
        vec3 pos = base + vec3(0.0, life * 1.5, 0.0) + vec3(sin(uTime * 3.0 + float(i)), 0.0, cos(uTime * 2.0 + float(i))) * life * 0.5;
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
    right.xy = rot(roll) * right.xy;
    up.xy = rot(roll) * up.xy;

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
    float swGlow = 0.0;
    if (abs(rd.y) > 1e-3) { float tp = -ro.y / rd.y; if (tp > 0.0 && tp < t + 0.01) { vec3 pp = ro + rd*tp; swGlow = exp(-pow((length(pp.xz) - swRadius) * 3.0, 2.0)) * swFade * swFade * 1.2; } }
    col += C_MAGENTA * swGlow;

    return col;
}
