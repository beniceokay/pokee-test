// NEON RUST REQUIEM — ANGEL scene
// Helper functions prefixed an_. Returns LINEAR HDR.

// ---------- small math helpers ----------
float an_smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
    return mix(b, a, h) - k*h*(1.0-h);
}
float an_smax(float a, float b, float k) {
    return -an_smin(-a, -b, k);
}
float an_smix(float a, float b, float t) {
    return a*(1.0-t) + b*t;
}
float an_hash11(float p) {
    p = fract(p*0.1031);
    p *= p+33.33;
    p *= p+p;
    return fract(p);
}
float an_hash21(vec2 p) {
    p = fract(p*vec2(123.34, 345.45));
    p += dot(p, p+34.345);
    return fract(p.x*p.y);
}
float an_noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000 = an_hash11(dot(i, vec3(1.0,57.0,113.0)));
    float n100 = an_hash11(dot(i+vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
    float n010 = an_hash11(dot(i+vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n110 = an_hash11(dot(i+vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n001 = an_hash11(dot(i+vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n101 = an_hash11(dot(i+vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n011 = an_hash11(dot(i+vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
    float n111 = an_hash11(dot(i+vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    float y0 = mix(x00, x10, f.y);
    float y1 = mix(x01, x11, f.y);
    return mix(y0, y1, f.z);
}
float an_fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        s += a * an_noise(p);
        p = p * 2.02 + vec3(11.3, 7.1, 3.7);
        a *= 0.5;
    }
    return s;
}
float an_sdfBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float an_sdfSphere(vec3 p, float r) {
    return length(p) - r;
}
float an_sdfEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p/r);
    float k1 = length(p/(r*r));
    return k0*(k0-1.0)/k1;
}
float an_sdfCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
    return length(pa - ba*h) - r;
}
float an_sdfCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float an_sdfTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}
vec3 an_iridescent(float t) {
    return 0.5 + 0.5*cos(TAU*(t + vec3(0.0, 0.33, 0.67)));
}
float an_starfield(vec3 rd, float density) {
    vec3 p = rd*120.0;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = an_hash11(dot(id, vec3(12.9898, 78.233, 37.719)));
    float star = 0.0;
    if (h > 1.0 - density) {
        vec3 off = vec3(an_hash11(h*1.7), an_hash11(h*2.3), an_hash11(h*3.1)) - 0.5;
        vec3 d = f - off*0.6;
        float tw = 0.5 + 0.5*sin(uTime*3.0 + h*40.0);
        star = (0.0016/(dot(d,d)+0.0008)) * tw;
    }
    return star;
}

// ---------- SDFs ----------
float an_headSDF(vec3 p) {
    // head local space: origin at head centre
    float d = 1e5;
    // cranium
    d = min(d, an_sdfEllipsoid(p - vec3(0.0, 0.05, 0.0), vec3(0.30, 0.34, 0.32)));
    // forehead
    d = an_smin(d, an_sdfEllipsoid(p - vec3(0.0, 0.18, 0.10), vec3(0.24, 0.16, 0.20)), 0.10);
    // brow ridge
    d = an_smin(d, an_sdfEllipsoid(p - vec3(0.0, 0.10, 0.20), vec3(0.20, 0.05, 0.10)), 0.06);
    // cheekbones
    d = an_smin(d, an_sdfEllipsoid(p - vec3( 0.14, -0.02, 0.16), vec3(0.10, 0.09, 0.12)), 0.08);
    d = an_smin(d, an_sdfEllipsoid(p - vec3(-0.14, -0.02, 0.16), vec3(0.10, 0.09, 0.12)), 0.08);
    // jaw / chin taper
    d = an_smin(d, an_sdfEllipsoid(p - vec3(0.0, -0.16, 0.10), vec3(0.16, 0.14, 0.16)), 0.08);
    d = an_smin(d, an_sdfEllipsoid(p - vec3(0.0, -0.26, 0.14), vec3(0.08, 0.08, 0.10)), 0.06);
    // nose ridge
    d = an_smin(d, an_sdfCapsule(p, vec3(0.0, 0.08, 0.22), vec3(0.0, -0.06, 0.30), 0.045), 0.05);
    d = an_smin(d, an_sdfEllipsoid(p - vec3(0.0, -0.06, 0.30), vec3(0.05, 0.05, 0.06)), 0.04);
    // eye sockets (subtract)
    float eyeL = an_sdfEllipsoid(p - vec3( 0.11, 0.06, 0.22), vec3(0.07, 0.045, 0.06));
    float eyeR = an_sdfEllipsoid(p - vec3(-0.11, 0.06, 0.22), vec3(0.07, 0.045, 0.06));
    d = an_smax(d, -eyeL, 0.02);
    d = an_smax(d, -eyeR, 0.02);
    // closed eyelids (small ellipsoids sitting in sockets)
    d = an_smin(d, an_sdfEllipsoid(p - vec3( 0.11, 0.05, 0.24), vec3(0.06, 0.02, 0.05)), 0.02);
    d = an_smin(d, an_sdfEllipsoid(p - vec3(-0.11, 0.05, 0.24), vec3(0.06, 0.02, 0.05)), 0.02);
    // lips
    float lipU = an_sdfEllipsoid(p - vec3(0.0, -0.18, 0.24), vec3(0.08, 0.025, 0.05));
    float lipL = an_sdfEllipsoid(p - vec3(0.0, -0.21, 0.24), vec3(0.07, 0.025, 0.05));
    d = an_smin(d, an_smin(lipU, lipL, 0.015), 0.02);
    // parting groove
    float groove = an_sdfCapsule(p, vec3(-0.06, -0.195, 0.26), vec3(0.06, -0.195, 0.26), 0.012);
    d = an_smax(d, -groove, 0.01);
    return d;
}

float an_neckSDF(vec3 p) {
    // neck in bust space
    return an_sdfCapsule(p, vec3(0.0, -0.30, 0.05), vec3(0.0, -0.75, 0.0), 0.10);
}

float an_shouldersSDF(vec3 p) {
    float d = 1e5;
    // collarbones
    d = an_smin(d, an_sdfCapsule(p, vec3(-0.30, -0.72, 0.05), vec3(0.0, -0.78, 0.08), 0.05), 0.05);
    d = an_smin(d, an_sdfCapsule(p, vec3( 0.30, -0.72, 0.05), vec3(0.0, -0.78, 0.08), 0.05), 0.05);
    // shoulders
    d = an_smin(d, an_sdfEllipsoid(p - vec3(-0.34, -0.80, 0.0), vec3(0.16, 0.12, 0.14)), 0.06);
    d = an_smin(d, an_sdfEllipsoid(p - vec3( 0.34, -0.80, 0.0), vec3(0.16, 0.12, 0.14)), 0.06);
    // chest truncation
    d = an_smin(d, an_sdfEllipsoid(p - vec3(0.0, -0.95, 0.05), vec3(0.34, 0.18, 0.20)), 0.08);
    return d;
}

float an_crownSDF(vec3 p) {
    // 7 spires fanning from top of head (head local space)
    float d = 1e5;
    for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float ang = mix(-0.6, 0.6, fi/6.0);
        vec3 base = vec3(sin(ang)*0.22, 0.30, cos(ang)*0.10);
        vec3 tip  = vec3(sin(ang)*0.45, 0.75, cos(ang)*0.15);
        d = min(d, an_sdfCapsule(p, base, tip, 0.012));
    }
    return d;
}

float an_haloSDF(vec3 p) {
    // 3 concentric tori behind head, tilted to face camera
    float d = 1e5;
    mat2 tilt = rot(0.35);
    vec3 q = vec3(tilt * p.xz, p.y);
    q -= vec3(0.0, 0.10, -0.55); // behind head
    float rot1 = uTime * 0.15;
    float rot2 = -uTime * 0.10;
    float rot3 = uTime * 0.07;
    vec3 q1 = vec3(rot(rot1) * q.xz, q.y);
    vec3 q2 = vec3(rot(rot2) * q.xz, q.y);
    vec3 q3 = vec3(rot(rot3) * q.xz, q.y);
    d = min(d, an_sdfTorus(q1, vec2(0.55, 0.012)));
    d = min(d, an_sdfTorus(q2, vec2(0.72, 0.010)));
    d = min(d, an_sdfTorus(q3, vec2(0.90, 0.008)));
    return d;
}

// Full bust SDF (head + neck + shoulders + crown + halo), in bust space
float an_bustSDF(vec3 p) {
    float d = 1e5;
    // head local space: head centre at (0, 0.15, 0) in bust space
    vec3 hp = p - vec3(0.0, 0.15, 0.0);
    d = min(d, an_headSDF(hp));
    d = min(d, an_neckSDF(p));
    d = min(d, an_shouldersSDF(p));
    // crown in head local space
    d = min(d, an_crownSDF(hp));
    // halo in bust space
    d = min(d, an_haloSDF(p));
    return d;
}

// Bounding sphere for bust (in bust space)
float an_bustBound(vec3 p) {
    // bust roughly spans y from -1.1 to 0.9, x/z radius ~1.0
    vec3 c = vec3(0.0, -0.1, 0.0);
    return an_sdfSphere(p - c, 1.25);
}

// ---------- shading ----------
vec3 an_porcelain(vec3 p, vec3 n, vec3 rd, float reveal) {
    // p in bust space
    vec3 Lkey = normalize(vec3(0.3, 1.0, 0.6));
    vec3 LrimL = normalize(vec3(-0.8, 0.3, -1.0));
    vec3 LrimR = normalize(vec3(0.8, 0.2, -1.0));

    float ndl = dot(n, Lkey);
    float wrap = (ndl + 0.4) / 1.4;
    float key = max(wrap, 0.0);

    float rimL = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * max(dot(n, LrimL), 0.0);
    float rimR = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * max(dot(n, LrimR), 0.0);

    // base porcelain: pale bone with violet in shadows
    vec3 albedo = mix(C_BONE, C_VIOLET, 0.4 * (1.0 - key));
    vec3 col = albedo * (0.25 + 0.9 * key);

    // rims
    col += C_CYAN * rimL * 2.5;
    col += C_MAGENTA * rimR * 2.0;

    // specular glaze
    vec3 H = normalize(Lkey - rd);
    float spec = pow(max(dot(n, H), 0.0), 60.0);
    col += vec3(1.0, 0.95, 1.0) * spec * 1.5;

    // subtle subsurface scatter (violet)
    float sss = pow(max(dot(rd, -Lkey), 0.0), 2.0);
    col += C_VIOLET * sss * 0.3;

    return col;
}

float an_crackMask(vec3 p) {
    // voronoi-like ridge cracks on cheek/temple/neck
    vec3 q = p * 6.0;
    float n1 = an_noise(q);
    float n2 = an_noise(q + 3.7);
    float ridge = abs(n1 - n2);
    // threshold to thin lines
    float crack = smoothstep(0.06, 0.0, ridge);
    // gate to face region (front hemisphere, upper)
    float faceGate = smoothstep(0.0, 0.3, p.z) * smoothstep(-0.4, 0.2, p.y);
    return crack * faceGate;
}

vec3 an_crackGlow(vec3 p, vec3 n, vec3 rd) {
    float cm = an_crackMask(p);
    if (cm < 0.001) return vec3(0.0);
    // molten rust/orange emission
    vec3 col = C_RUST * (3.0 + 3.0 * cm);
    // bleed into nearby surface
    float bleed = an_noise(p * 3.0) * cm * 0.5;
    col += C_RUST * bleed * 2.0;
    return col;
}

vec3 an_tearGlow(vec3 p, vec3 n, vec3 rd) {
    // two cyan streaks from inner eye corners down cheeks
    // inner eye corners approx at (±0.06, 0.06, 0.26) in head local -> bust (±0.06, 0.21, 0.26)
    // path curves down cheek
    vec3 hp = p - vec3(0.0, 0.15, 0.0); // head local
    float tear = 0.0;
    // left tear
    vec3 tl0 = vec3(0.06, 0.06, 0.26);
    vec3 tl1 = vec3(0.10, -0.10, 0.24);
    vec3 tl2 = vec3(0.12, -0.22, 0.20);
    // sample distance to polyline
    float d1 = an_sdfCapsule(hp, tl0, tl1, 0.015);
    float d2 = an_sdfCapsule(hp, tl1, tl2, 0.015);
    float dl = min(d1, d2);
    tear += exp(-dl * 80.0);
    // right tear
    vec3 tr0 = vec3(-0.06, 0.06, 0.26);
    vec3 tr1 = vec3(-0.10, -0.10, 0.24);
    vec3 tr2 = vec3(-0.12, -0.22, 0.20);
    float d3 = an_sdfCapsule(hp, tr0, tr1, 0.015);
    float d4 = an_sdfCapsule(hp, tr1, tr2, 0.015);
    float dr = min(d3, d4);
    tear += exp(-dr * 80.0);

    if (tear < 0.01) return vec3(0.0);
    // bright droplet sliding cyclically
    float t = fract(uTime * 0.3);
    float dropletL = exp(-abs(hp.y - (0.06 - t*0.28)) * 40.0) * exp(-abs(hp.x - 0.08) * 30.0);
    float dropletR = exp(-abs(hp.y - (0.06 - t*0.28)) * 40.0) * exp(-abs(hp.x + 0.08) * 30.0);
    float drop = dropletL + dropletR;
    vec3 col = C_CYAN * (5.0 * tear + 8.0 * drop);
    return col;
}

vec3 an_haloShade(vec3 p, vec3 n, vec3 rd) {
    // halo: bone -> iridescent, pulses on uKick
    vec3 q = vec3(rot(0.35) * p.xz, p.y);
    q -= vec3(0.0, 0.10, -0.55);
    float r = length(q.xz);
    // sigil notches: angular repetition
    float ang = atan(q.z, q.x);
    float notches = 0.5 + 0.5 * cos(ang * 12.0 + uTime * 0.5);
    float notchGate = smoothstep(0.3, 0.7, notches);
    vec3 irid = an_iridescent(r * 0.8 + uTime * 0.1);
    vec3 col = mix(C_BONE, irid, 0.5) * (1.0 + uKick * 2.0);
    col += C_CYAN * notchGate * (2.0 + uKick * 3.0);
    return col;
}

vec3 an_crownShade(vec3 p, vec3 n, vec3 rd) {
    // crown spires: dark chrome with emissive tips
    vec3 hp = p - vec3(0.0, 0.15, 0.0);
    float tipGlow = 0.0;
    for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float ang = mix(-0.6, 0.6, fi/6.0);
        vec3 tip = vec3(sin(ang)*0.45, 0.75, cos(ang)*0.15);
        float d = length(hp - tip);
        float blink = 0.5 + 0.5 * sin(uTime * 4.0 + fi * 1.2);
        vec3 tipCol = (fi < 3.5) ? C_CYAN : C_MAGENTA;
        tipGlow += exp(-d * 30.0) * blink;
    }
    vec3 col = vec3(0.1, 0.1, 0.12); // dark chrome
    col += C_CYAN * tipGlow * 3.0;
    col += C_MAGENTA * tipGlow * 2.0;
    return col;
}

// ---------- wings (glow accumulation) ----------
vec3 an_wingGlow(vec3 ro, vec3 rd, vec3 shoulderL, vec3 shoulderR, float reveal, float ascend) {
    vec3 glow = vec3(0.0);
    float breathe = sin(uTime * 0.8) * 0.15;
    float flare = uKick * 0.2;
    float openAngle = 0.6 + breathe + flare;

    // two wings (left and right), each with two pairs (front + back)
    for (int w = 0; w < 2; w++) {
        float side = (w == 0) ? 1.0 : -1.0;
        vec3 shoulder = (w == 0) ? shoulderL : shoulderR;
        shoulder.y -= ascend * 2.5;

        for (int pair = 0; pair < 2; pair++) {
            float pairScale = (pair == 0) ? 1.0 : 1.4;
            float pairDim = (pair == 0) ? 1.0 : 0.5;
            float pairAngle = (pair == 0) ? 0.0 : 0.3;

            for (int f = 0; f < 28; f++) {
                float fi = float(f);
                float t = fi / 27.0;
                // feather fan: angle from shoulder
                float featherAng = mix(-0.4, 0.8, t) + pairAngle + openAngle * side;
                float featherLen = mix(0.8, 2.2, t) * pairScale;
                vec3 dir = vec3(sin(featherAng) * side, cos(featherAng) * 0.5, -0.3);
                dir = normalize(dir);
                vec3 a = shoulder;
                vec3 b = shoulder + dir * featherLen;

                // distance from ray to segment
                vec3 oa = ro - a;
                vec3 ba = b - a;
                float tSeg = clamp(dot(oa, ba) / dot(ba, ba), 0.0, 1.0);
                vec3 closest = a + ba * tSeg;
                float d = length(ro + rd * 0.0 - closest); // approximate: use ray-point
                // better: project ray onto segment
                vec3 v = closest - ro;
                float proj = dot(v, rd);
                if (proj < 0.0) proj = 0.0;
                vec3 rayPoint = ro + rd * proj;
                float dist = length(rayPoint - closest);

                // emission
                float intensity = 1.0 / (dist * dist * 8.0 + 0.01);
                intensity *= pairDim * reveal;
                // colour gradient: bone at root to iridescent at tips
                vec3 featherCol = mix(C_BONE, an_iridescent(fi * 0.03 + uTime * 0.05), t);
                glow += featherCol * intensity * 0.8;
            }
        }
    }
    return glow;
}

// ---------- hair (glow accumulation) ----------
vec3 an_hairGlow(vec3 ro, vec3 rd, vec3 headCentre, float reveal, float ascend) {
    vec3 glow = vec3(0.0);
    headCentre.y -= ascend * 2.5;
    for (int i = 0; i < 24; i++) {
        float fi = float(i);
        float ang = fi * TAU / 24.0 + uTime * 0.1;
        vec3 start = headCentre + vec3(cos(ang) * 0.3, 0.2, sin(ang) * 0.3);
        vec3 end = headCentre + vec3(cos(ang + 0.5) * 0.8, -0.5, sin(ang + 0.5) * 0.8);
        // sine displacement
        vec3 mid = (start + end) * 0.5;
        mid += vec3(sin(uTime * 0.5 + fi) * 0.1, 0.0, cos(uTime * 0.4 + fi) * 0.1);

        // distance from ray to segment (start->mid->end)
        vec3 v1 = start - ro;
        vec3 v2 = mid - ro;
        vec3 v3 = end - ro;
        float d1 = length(cross(v1, rd));
        float d2 = length(cross(v2, rd));
        float d3 = length(cross(v3, rd));
        float d = min(min(d1, d2), d3);
        float intensity = 0.5 / (d * d * 10.0 + 0.05);
        intensity *= reveal * 0.6;
        vec3 col = an_iridescent(fi * 0.05 + uTime * 0.08);
        glow += col * intensity;
    }
    return glow;
}

// ---------- background ----------
vec3 an_background(vec3 rd) {
    vec3 col = C_VOID;
    // starfield
    float stars = an_starfield(rd, 0.015);
    col += vec3(1.0) * stars * 0.8;
    // violet-magenta nebula behind (low intensity)
    float neb = an_fbm(rd * 3.0 + vec3(0.0, 0.0, uTime * 0.02));
    col += mix(C_VIOLET, C_MAGENTA, neb) * neb * 0.3;
    // vertical god-rays from above
    float ray = 0.5 + 0.5 * cos(rd.x * 20.0 + uTime * 0.3);
    ray *= smoothstep(0.0, 0.5, rd.y);
    col += C_BONE * ray * 0.15;
    return col;
}

// ---------- dust motes ----------
vec3 an_dustMotes(vec2 uv, vec3 rd) {
    vec3 col = vec3(0.0);
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        vec2 p = vec2(
            fract(an_hash11(fi * 1.3 + uTime * 0.05) * 10.0) - 0.5,
            fract(an_hash11(fi * 2.7 + uTime * 0.08) * 10.0) - 0.5
        );
        float d = length(uv - p);
        float mote = exp(-d * 40.0) * 0.3;
        col += C_CYAN * mote;
    }
    return col;
}

// ---------- main ----------
vec3 sceneMain(vec2 fragCoord) {
    float push = uP0.z;
    float reveal = uP0.y;
    float ascend = uP0.x;

    // camera
    vec3 ro = vec3(0.0, 0.2, 4.2 - push * 1.8);
    ro.x += sin(uTime * 0.15) * 0.15;
    vec3 target = vec3(0.0, 0.15 + (1.0 - push) * -0.2, 0.0);
    vec3 fwd = normalize(target - ro);
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, fwd);

    vec2 uv = (fragCoord - 0.5 * uRes) / uRes.y;
    vec3 rd = normalize(uv.x * right + uv.y * up + 1.8 * fwd);

    // bust space: figure rises with ascend
    vec3 bustOffset = vec3(0.0, -ascend * 2.5, 0.0);
    vec3 roBust = ro - bustOffset;

    // bounding sphere check
    vec3 boundCentre = vec3(0.0, -0.1, 0.0);
    float boundRadius = 1.25;
    vec3 toCentre = boundCentre - roBust;
    float tca = dot(toCentre, rd);
    float dca = dot(toCentre, toCentre) - tca * tca;
    float hit = false;
    float tHit = 0.0;
    if (dca < boundRadius * boundRadius) {
        float thc = sqrt(boundRadius * boundRadius - dca);
        float t0 = tca - thc;
        if (t0 > 0.0) {
            hit = true;
            tHit = t0;
        }
    }

    vec3 col;
    if (!hit) {
        col = an_background(rd);
    } else {
        // raymarch bust
        float t = tHit;
        float d = 0.0;
        vec3 p = vec3(0.0);
        vec3 n = vec3(0.0);
        bool found = false;
        for (int i = 0; i < 100; i++) {
            p = roBust + rd * t;
            d = an_bustSDF(p);
            if (d < 0.001) {
                found = true;
                break;
            }
            t += d * 0.9;
            if (t > 8.0) break;
        }
        if (found) {
            // normal
            vec2 e = vec2(0.002, 0.0);
            n = normalize(vec3(
                an_bustSDF(p + e.xyy) - an_bustSDF(p - e.xyy),
                an_bustSDF(p + e.yxy) - an_bustSDF(p - e.yxy),
                an_bustSDF(p + e.yyx) - an_bustSDF(p - e.yyx)
            ));

            // determine region
            vec3 hp = p - vec3(0.0, 0.15, 0.0);
            float headDist = an_headSDF(hp);
            float neckDist = an_neckSDF(p);
            float shoulderDist = an_shouldersSDF(p);
            float crownDist = an_crownSDF(hp);
            float haloDist = an_haloSDF(p);

            vec3 shade;
            if (haloDist < 0.05 && haloDist < headDist && haloDist < neckDist) {
                shade = an_haloShade(p, n, rd);
            } else if (crownDist < 0.05 && crownDist < headDist) {
                shade = an_crownShade(p, n, rd);
            } else {
                // porcelain
                shade = an_porcelain(p, n, rd, reveal);
                // cracks
                shade += an_crackGlow(p, n, rd);
                // tears
                shade += an_tearGlow(p, n, rd);
            }

            // reveal dissolve
            float dissolveNoise = an_noise(p * 4.0 + uTime * 0.2);
            float dissolveEdge = smoothstep(reveal - 0.05, reveal + 0.05, dissolveNoise);
            shade *= dissolveEdge;
            // dissolve edge glow
            float edgeGlow = smoothstep(0.0, 0.1, abs(dissolveNoise - reveal)) * (1.0 - dissolveEdge);
            shade += C_CYAN * edgeGlow * 3.0;

            // ascend: lower parts dissolve upward into light
            float ascendFade = smoothstep(-1.0, -0.3, p.y + ascend * 2.5);
            shade *= ascendFade;
            shade += C_BONE * (1.0 - ascendFade) * 2.0;

            col = shade;
        } else {
            col = an_background(rd);
        }
    }

    // wings glow (always add, even if bust not hit)
    vec3 shoulderL = vec3(-0.34, -0.80, 0.0);
    vec3 shoulderR = vec3(0.34, -0.80, 0.0);
    col += an_wingGlow(ro, rd, shoulderL, shoulderR, reveal, ascend);

    // hair glow
    vec3 headCentre = vec3(0.0, 0.15, 0.0);
    col += an_hairGlow(ro, rd, headCentre, reveal, ascend);

    // dust motes
    col += an_dustMotes(uv, rd);

    return col;
}