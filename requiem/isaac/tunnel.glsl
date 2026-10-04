```glsl
// NEON RUST REQUIEM — GAMEPLAY TUNNEL
// sceneMain(fragCoord) -> linear HDR vec3

// ---------- helpers ----------
float tn_octDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 0.41421356))), dot(p, normalize(vec2(0.41421356, 1.0))));
}

// octagon SDF: negative inside, positive outside; apothem ~3.2
float tn_octSDF(vec2 p) {
    return tn_octDist(p) - 3.2;
}

// rib frame: octagon ring protruding inward ~0.35, chamfered
float tn_ribSDF(vec2 p, float z) {
    // distance to octagon wall
    float d = tn_octSDF(p);
    // ring: between wall and wall-0.35 (inside)
    // we want a frame: |d| small, but only on the inside side
    // frame occupies d in [-0.35, 0.0] (inside the tunnel)
    float ring = abs(d + 0.175) - 0.175; // centered at d=-0.175, half-width 0.175
    // chamfer: round the edges
    ring = max(ring, -0.04); // slight bevel
    // z thickness
    float dz = abs(fract(z / 2.5) - 0.5) * 2.5;
    dz = max(dz - 0.12, 0.0);
    return max(ring, dz);
}

// grand arch tracery: thin inner ring with spokes (every 4th rib)
float tn_archTracerySDF(vec2 p, float z) {
    float d = tn_octSDF(p);
    // inner ring at d = -0.6, thin
    float ring = abs(d + 0.6) - 0.04;
    // spokes: 8 radial lines
    float ang = atan(p.y, p.x);
    float spoke = abs(sin(ang * 4.0)) - 0.03;
    float spokeMask = smoothstep(0.0, 0.3, abs(d + 0.3)); // only in middle band
    float spokes = max(spoke, spokeMask);
    float dz = abs(fract(z / 2.5) - 0.5) * 2.5;
    dz = max(dz - 0.1, 0.0);
    return max(min(ring, spokes), dz);
}

// longitudinal strut at octagon corner
float tn_strutSDF(vec2 p, float z) {
    // 8 corners of octagon
    float d = tn_octDist(p);
    // corner radius ~0.15
    float corner = d - 3.05; // slightly inside
    float dz = abs(z - floor(z)) * 0.0; // continuous along z
    // struts are thin cylinders at corners
    // approximate: distance to nearest corner point in xy
    vec2 pp = p;
    float minD = 1e5;
    for (int i = 0; i < 8; i++) {
        float a = float(i) * TAU / 8.0;
        vec2 c = vec2(cos(a), sin(a)) * 3.05;
        minD = min(minD, length(pp - c));
    }
    return minD - 0.12;
}

// main scene distance: octagon interior + ribs + struts
float tn_map(vec3 p) {
    // octagon interior (negative inside)
    float dOct = -tn_octSDF(p.xy);

    // ribs every 2.5 units
    float zRib = p.z;
    float ribD = tn_ribSDF(p.xy, zRib);

    // grand arch every 10 units (4th rib)
    float zArch = p.z;
    float archD = tn_archTracerySDF(p.xy, zArch);

    // struts
    float strutD = tn_strutSDF(p.xy, p.z);

    // combine: interior is the main volume, ribs/struts protrude inward
    // dOct is negative inside; ribs are positive outside their own SDF
    // We want the scene to be: inside octagon, but ribs/struts block
    // So: min(dOct, ribD, archD, strutD) won't work directly because dOct is negative
    // Actually: the tunnel is the region where dOct < 0 (inside octagon)
    // Ribs protrude inward, so they occupy dOct < 0 AND ribD < 0
    // For raymarching: distance to surface = min of distances to all surfaces
    // dOct < 0 means we're inside the octagon (good, keep marching)
    // ribD < 0 means we're inside a rib (hit)
    // So: if ribD < 0, return ribD (hit rib)
    //     else if dOct > 0, return dOct (hit wall)
    //     else return max(dOct, -ribD) ... no
    // Simpler: the scene is the union of (octagon interior boundary) and (ribs) and (struts)
    // For raymarching a tunnel: we march until we hit the wall or a rib
    // Distance to octagon wall: -dOct when dOct < 0 (we're inside, distance to wall is -dOct)
    // Distance to rib: ribD when ribD < 0
    // So: d = min(-dOct, ribD, archD, strutD) but only where they're negative
    // Actually standard: d = min(dOct_wall, ribD, archD, strutD)
    // where dOct_wall = -tn_octSDF(p.xy) is positive when inside (distance to wall)
    // and ribD etc are positive when outside the rib geometry
    // Wait: tn_ribSDF returns positive outside, negative inside
    // So distance to rib surface = ribD (when positive, we're outside; when negative, inside)
    // For raymarching: we want the distance to the nearest surface
    // If we're inside the octagon (dOct < 0), distance to wall = -dOct
    // If we're outside a rib (ribD > 0), distance to rib = ribD
    // The scene surface is: octagon wall OR rib surface OR strut surface
    // d = min(-dOct, ribD, archD, strutD)
    // But -dOct is only valid when dOct < 0 (inside). When dOct > 0, we've already hit the wall.
    // So: d = min(-dOct, ribD, archD, strutD) works because:
    //   - if dOct < 0, -dOct > 0 (distance to wall)
    //   - if dOct > 0, -dOct < 0 (we're outside, but we shouldn't be)
    // Since we start inside the tunnel, dOct starts negative.
    // Ribs protrude inward, so ribD can be negative (inside rib) even when dOct is negative.
    // min(-dOct, ribD): if ribD < -dOct, we hit the rib first.
    // This is correct.

    float dWall = -tn_octSDF(p.xy);
    float d = min(dWall, ribD);
    d = min(d, archD);
    d = min(d, strutD);
    return d;
}

// normal via tetrahedron
vec3 tn_normal(vec3 p) {
    const float h = 0.001;
    vec2 k = vec2(1.0, -1.0);
    return normalize(
        k.xyy * tn_map(p + k.xyy * h) +
        k.yyx * tn_map(p + k.yyx * h) +
        k.yxy * tn_map(p + k.yxy * h) +
        k.xxx * tn_map(p + k.xxx * h)
    );
}

// sector palette blend
vec3 tn_sectorColor(float sector, float t) {
    // t: 0..1 for interpolation within sector
    vec3 c0 = vec3(0.0);
    vec3 c1 = vec3(0.0);
    float s = sector;
    if (s < 1.0) {
        c0 = C_RUST;
        c1 = C_CYAN;
        c0 = mix(c0, C_VIOLET, 0.3);
        c1 = mix(c1, C_BONE, 0.2);
    } else if (s < 2.0) {
        c0 = C_CYAN;
        c1 = C_MAGENTA;
        c0 = mix(c0, C_BONE, 0.3);
        c1 = mix(c1, C_VIOLET, 0.2);
    } else {
        c0 = C_MAGENTA;
        c1 = C_CYAN;
        c0 = mix(c0, C_VIOLET, 0.3);
        c1 = mix(c1, C_RUST, 0.2);
    }
    return mix(c0, c1, t);
}

vec3 tn_fogColor(float sector) {
    if (sector < 1.0) return C_VIOLET * 0.4;
    if (sector < 2.0) return C_CYAN * 0.3 + C_BONE * 0.2;
    return C_MAGENTA * 0.4;
}

vec3 tn_neonColor(float sector, float z) {
    if (sector < 1.0) return C_MAGENTA;
    if (sector < 2.0) return C_CYAN;
    return iridescent(z * 0.1 + uTime * 0.5);
}

// beat pulse: wave from far to near
float tn_beatPulse(float ribZ, float camZ) {
    float dist = ribZ - camZ;
    if (dist < 0.0) return 0.0;
    // wave front travels from 60 to 0 over one beat
    float wavePos = mix(60.0, 0.0, uBeat);
    float pulse = exp(-abs(dist - wavePos) * 0.15) * (1.0 - uBeat);
    return pulse;
}

// stained glass check
bool tn_isStainedGlass(float segZ, float side) {
    float h = hash22(vec2(segZ, side));
    return h > 0.8; // ~20%
}

// stained glass color
vec3 tn_stainedGlassColor(float segZ, float side, float sector) {
    float h = hash22(vec2(segZ * 1.3, side * 2.7));
    vec3 base = tn_sectorColor(sector, h);
    // voronoi-ish cells
    vec2 cell = vec2(segZ * 2.0, side * 3.0);
    float v = hash22(floor(cell) + vec2(0.5));
    base = mix(base, C_BONE, v * 0.3);
    return base;
}

// ice crystal glint (cryo choir)
float tn_iceGlint(vec3 p, float sector) {
    if (sector < 0.5 || sector > 1.5) return 0.0;
    float h = hash33(floor(p * 8.0));
    float glint = step(0.95, h) * (0.5 + 0.5 * sin(uTime * 10.0 + h * 100.0));
    return glint * smoothstep(0.5, 1.0, sector) * smoothstep(1.5, 1.0, sector);
}

// glitch slice (heaven.exe)
vec2 tn_glitchUV(vec2 uv, float sector) {
    if (sector < 1.5) return uv;
    float band = floor(uv.y * 20.0);
    float h = hash22(vec2(band, floor(uTime * 8.0)));
    if (h > 0.97) {
        uv.x += (h - 0.97) * 2.0 * 0.1;
    }
    return uv;
}

// dust/embers
vec3 tn_dust(vec2 uv, vec3 ro, vec3 rd, float sector) {
    vec3 col = vec3(0.0);
    for (int layer = 0; layer < 3; layer++) {
        float z = float(layer) * 20.0 + 5.0;
        float t = z / rd.z;
        vec3 p = ro + rd * t;
        vec2 grid = floor(p.xy * 2.0);
        float h = hash22(grid + vec2(float(layer)));
        if (h > 0.92) {
            vec2 center = (grid + 0.5) / 2.0;
            vec2 d = p.xy - center;
            float dist = length(d);
            float size = 0.02 + h * 0.03;
            float glow = exp(-dist * dist / (size * size)) * 0.5;
            vec3 dustCol = tn_sectorColor(sector, h);
            col += dustCol * glow;
        }
    }
    return col;
}

// main scene
vec3 sceneMain(vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * uRes) / uRes.y;
    uv = rot(uP0.w) * uv;

    // overclock ghosting
    vec3 col = vec3(0.0);
    if (uP1.w > 0.01) {
        vec2 uvGhost = uv + vec2(0.005, 0.002) * uP1.w;
        // simplified: just add a slight offset contribution
    }

    vec3 ro = vec3(uP0.xy, uP0.z);
    vec3 rd = normalize(vec3(uv, 1.6));

    // glitch
    uv = tn_glitchUV(uv, uP1.x);
    rd = normalize(vec3(uv, 1.6));

    // raymarch
    float t = 0.0;
    float hit = 0.0;
    vec3 p = ro;
    vec3 n = vec3(0.0);
    float d = 0.0;

    for (int i = 0; i < 80; i++) {
        p = ro + rd * t;
        d = tn_map(p);
        if (d < 0.001) {
            hit = 1.0;
            n = tn_normal(p);
            break;
        }
        t += d;
        if (t > 70.0) break;
    }

    // fog
    vec3 fogCol = tn_fogColor(uP1.x);
    float fog = 1.0 - exp(-t * 0.05);

    // vanishing point glow
    float vpGlow = exp(-t * 0.08) * 2.0;
    vec3 vpCol = tn_sectorColor(uP1.x, 0.5);

    // boss eye
    if (uP1.y > 0.01) {
        float eyeGlow = exp(-t * 0.05) * 4.0 * uP1.y;
        vec3 eyeCol = C_MAGENTA * 0.8 + C_RUST * 0.2;
        // iris dilation
        float iris = 0.5 + 0.5 * uKick;
        eyeCol = mix(eyeCol, C_VIOLET, iris * 0.3);
        vpGlow += eyeGlow;
        vpCol = mix(vpCol, eyeCol, uP1.y);
    }

    // base color
    vec3 baseCol = fogCol * fog + vpCol * vpGlow * (1.0 - fog);

    // shading if hit
    if (hit > 0.5) {
        vec3 albedo = vec3(0.05);
        float specular = 0.5;
        vec3 emissive = vec3(0.0);

        // determine surface type
        float zRib = p.z;
        float ribD = tn_ribSDF(p.xy, zRib);
        float strutD = tn_strutSDF(p.xy, p.z);
        float wallD = -tn_octSDF(p.xy);

        // rib?
        if (ribD < 0.05) {
            // neon strip on rib
            float beatPulse = tn_beatPulse(zRib, uP0.z);
            vec3 neonCol = tn_neonColor(uP1.x, zRib);
            emissive = neonCol * (0.5 + beatPulse * 2.0 + uKick * 1.5);
            albedo = vec3(0.03);
            specular = 0.8;
        } else if (strutD < 0.05) {
            // strut
            albedo = vec3(0.04);
            specular = 0.6;
        } else {
            // wall panel
            float segZ = floor(p.z / 2.5);
            float side = floor(atan(p.y, p.x) / (TAU / 8.0)) + 4.0;
            if (tn_isStainedGlass(segZ, side)) {
                // stained glass
                vec3 glassCol = tn_stainedGlassColor(segZ, side, uP1.x);
                emissive = glassCol * (1.5 + 0.5 * sin(uTime + segZ));
                albedo = vec3(0.02);
                specular = 0.3;
            } else {
                // rusted chrome
                albedo = vec3(0.06);
                specular = 0.7;
                // ice glint
                float glint = tn_iceGlint(p, uP1.x);
                emissive += C_CYAN * glint * 0.5;
            }
        }

        // lighting
        vec3 lightDir = normalize(ro - p);
        float diff = max(dot(n, lightDir), 0.0);
        vec3 halfVec = normalize(lightDir + rd);
        float spec = pow(max(dot(n, halfVec), 0.0), 32.0);
        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        vec3 lightCol = tn_sectorColor(uP1.x, 0.5) * 0.5 + vec3(0.3);
        vec3 shaded = albedo * (0.1 + diff * lightCol) + spec * lightCol * specular + fresnel * tn_neonColor(uP1.x, p.z) * 0.3;

        baseCol = mix(baseCol, shaded + emissive, 1.0 - fog);
    }

    // volumetric haze from emissive strips
    float haze = 0.0;
    for (int i = 0; i < 10; i++) {
        float tH = float(i) * 7.0 + 1.0;
        vec3 pH = ro + rd * tH;
        float zRibH = floor(pH.z / 2.5) * 2.5;
        float beatPulseH = tn_beatPulse(zRibH, uP0.z);
        vec3 neonColH = tn_neonColor(uP1.x, zRibH);
        float distToRib = abs(pH.z - zRibH);
        float ribGlow = exp(-distToRib * 2.0) * (0.3 + beatPulseH * 1.0 + uKick * 0.5);
        haze += ribGlow;
    }
    baseCol += tn_neonColor(uP1.x, uP0.z) * haze * 0.1;

    // dust
    baseCol += tn_dust(uv, ro, rd, uP1.x);

    // damage flash
    if (uP1.z > 0.01) {
        baseCol = mix(baseCol, vec3(1.0, 0.1, 0.1), uP1.z * 0.5);
        // radial distortion
        float r = length(uv);
        uv += uv * r * uP1.z * 0.1;
    }

    // overclock: desaturate toward cyan
    if (uP1.w > 0.01) {
        float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
        vec3 cyanTint = vec3(0.5, 0.8, 0.9);
        baseCol = mix(baseCol, lum * cyanTint, uP1.w * 0.5);
    }

    // keep center clean
    float centerMask = smoothstep(0.15, 0.3, length(uv));
    baseCol = mix(baseCol * 0.6, baseCol, centerMask);

    return baseCol;
}
```