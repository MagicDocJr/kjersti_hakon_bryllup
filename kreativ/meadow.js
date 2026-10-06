// Live cornflower-and-daisy meadow at midsummer evening light.
// Grass, stems and flower heads are instanced and bent on the GPU by one
// shared wind function, so heads always ride on the tips of their stems.
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.186.1/three.module.min.js';

THREE.ColorManagement.enabled = false;

const SUN_DIR = new THREE.Vector3(0.3, 0.075, -0.95).normalize();

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

// Bend for a point at normalised height h on a stalk rooted at base.
const BEND = /* glsl */ `
uniform float uTime;
uniform vec3 uPointer;   // xy = ground hit (x, z)
uniform float uPush;
uniform vec3 uSunDir;
vec2 windAt(vec2 p, float phase) {
    float t = uTime;
    float gust = vnoise(p * 0.05 + vec2(-t * 0.22, t * 0.05));
    float ripple = vnoise(p * 0.32 + vec2(-t * 0.9, t * 0.3));
    float sway = sin(t * 1.9 + phase * 6.2831 + p.x * 0.7) * 0.08;
    float s = gust * 0.75 + ripple * 0.35 - 0.42 + sway;
    return vec2(0.9, -0.25) * s;
}
vec3 bendOffset(vec3 base, float h, float height, float phase, float stiff) {
    vec2 w = windAt(base.xz, phase) / stiff;
    vec2 d = base.xz - uPointer.xy;
    float dist = length(d);
    float push = uPush * pow(max(0.0, 1.0 - dist / 1.5), 2.0);
    w += (d / max(dist, 0.001)) * push * 1.4;
    float k = h * h;
    vec3 o = vec3(w.x, 0.0, w.y) * k * height;
    o.y -= dot(w, w) * k * height * 0.35;
    return o;
}
`;

const FOG = /* glsl */ `
uniform vec3 uFogColor;
float fogAmount(float dist) { return smoothstep(4.0, 40.0, dist) * 0.92; }
`;

function rand(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function valueNoise(x, y) {
    const h = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function scatter(rng, depth) {
    // biased toward the camera, widening with the view frustum
    const z = 0.7 - Math.pow(rng(), 1.55) * depth;
    const spread = 2.6 + Math.max(0, 1.2 - z) * 0.95;
    const x = (rng() - 0.5) * 2 * spread;
    return [x, z];
}

function bladeGeometry(segments) {
    const g = new THREE.PlaneGeometry(1, 1, 1, segments);
    g.translate(0, 0.5, 0);
    return g;
}

function petalHead(petals, inner, outer, cup, jag) {
    // a fan of petals around the origin in the xz plane, cupped upward
    const pos = [], col = [];
    for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        const a0 = a - (Math.PI / petals) * 0.62, a1 = a + (Math.PI / petals) * 0.62;
        const r0 = 0.12, r1 = 1.0;
        const lift = cup;
        const p0 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0];
        const p1 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
        const q0 = [Math.cos(a0) * r1, lift, Math.sin(a0) * r1];
        const q1 = [Math.cos(a1) * r1, lift, Math.sin(a1) * r1];
        const tip = [Math.cos(a) * (r1 + jag), lift * 1.2, Math.sin(a) * (r1 + jag)];
        pos.push(...p0, ...q0, ...p1, ...p1, ...q0, ...q1, ...q0, ...tip, ...q1);
        for (let k = 0; k < 9; k++) {
            const isOuter = [0, 1, 0, 0, 1, 1, 1, 1, 1][k];
            const c = isOuter ? outer : inner;
            col.push(c.r, c.g, c.b);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
}

function cornflowerHead(seed) {
    // ragged ring of trumpet florets radiating up and out from a small bud
    const r = rand(seed), pos = [], col = [];
    const inner = new THREE.Color('#2a2170'), mid = new THREE.Color('#3f52d6'), outer = new THREE.Color('#6688f4');
    const bud = new THREE.Color('#556042');
    const push = (p, c) => { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); };
    const up = new THREE.Vector3(0, 1, 0);
    const florets = 17;
    for (let i = 0; i < florets; i++) {
        const a = (i / florets) * Math.PI * 2 + (r() - 0.5) * 0.35;
        const e = (12 + r() * 48) * Math.PI / 180;
        const L = 0.62 + r() * 0.42;
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        const o = dir.clone().multiplyScalar(0.12).add(new THREE.Vector3(0, 0.12, 0));
        const m = o.clone().addScaledVector(dir, L * 0.62);
        const t = o.clone().addScaledVector(dir, L);
        const w0 = 0.05, w1 = 0.13, w2 = 0.22;
        const o0 = o.clone().addScaledVector(side, -w0), o1 = o.clone().addScaledVector(side, w0);
        const m0 = m.clone().addScaledVector(side, -w1), m1 = m.clone().addScaledVector(side, w1);
        const t0 = t.clone().addScaledVector(side, -w2), t1 = t.clone().addScaledVector(side, w2);
        push(o0, inner); push(m0, mid); push(o1, inner);
        push(o1, inner); push(m0, mid); push(m1, mid);
        push(m0, mid); push(t0, outer); push(m1, mid);
        push(m1, mid); push(t0, outer); push(t1, outer);
        // fringed tip: three little teeth
        for (let k = 0; k < 3; k++) {
            const a0 = t0.clone().lerp(t1, k / 3), a1 = t0.clone().lerp(t1, (k + 1) / 3);
            const tip = a0.clone().lerp(a1, 0.5).addScaledVector(dir, 0.14 + r() * 0.06);
            push(a0, outer); push(tip, outer); push(a1, outer);
        }
    }
    // bud / involucre under the florets
    const segs = 9;
    for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const rr = 0.2;
        push(new THREE.Vector3(0, -0.12, 0), bud);
        push(new THREE.Vector3(Math.cos(a0) * rr, 0.14, Math.sin(a0) * rr), bud);
        push(new THREE.Vector3(Math.cos(a1) * rr, 0.14, Math.sin(a1) * rr), bud);
        push(new THREE.Vector3(0, 0.22, 0), inner);
        push(new THREE.Vector3(Math.cos(a0) * rr, 0.14, Math.sin(a0) * rr), inner);
        push(new THREE.Vector3(Math.cos(a1) * rr, 0.14, Math.sin(a1) * rr), inner);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
}

function discGeometry(radius, segs, color) {
    const g = new THREE.CircleGeometry(radius, segs);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.06, 0);
    const n = g.attributes.position.count, col = [];
    for (let i = 0; i < n; i++) col.push(color.r, color.g, color.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
}

function mergeColored(a, b) {
    const pa = a.index ? a.toNonIndexed() : a, pb = b.index ? b.toNonIndexed() : b;
    const g = new THREE.BufferGeometry();
    const join = (n) => {
        const x = pa.attributes[n].array, y = pb.attributes[n].array;
        const out = new Float32Array(x.length + y.length); out.set(x); out.set(y, x.length); return out;
    };
    g.setAttribute('position', new THREE.BufferAttribute(join('position'), 3));
    g.setAttribute('color', new THREE.BufferAttribute(join('color'), 3));
    return g;
}

function instanced(base, count, fill) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    g.instanceCount = count;
    const offset = new Float32Array(count * 4), vary = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) fill(i, offset, vary);
    g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 4));
    g.setAttribute('aVar', new THREE.InstancedBufferAttribute(vary, 3));
    return g;
}

export function createMeadow(canvas, { lowPower = false, reducedMotion = false } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 1.75));
    // colours below are authored as display values, so skip linear conversion
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 600);

    const fogColor = new THREE.Color('#cdc193');
    const shared = {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector3(99, 99, 0) },
        uPush: { value: 0 },
        uFogColor: { value: fogColor },
        uSunDir: { value: SUN_DIR },
    };

    /* ---------- sky ---------- */
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(400, 48, 24),
        new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: { ...shared, uTop: { value: new THREE.Color('#93b4e2') }, uMid: { value: new THREE.Color('#d9dfe9') }, uHorizon: { value: new THREE.Color('#f1cf9f') } },
            vertexShader: /* glsl */ `
                varying vec3 vDir;
                void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
            fragmentShader: /* glsl */ `
                uniform vec3 uTop, uMid, uHorizon, uSunDir, uFogColor; uniform float uTime;
                varying vec3 vDir;
                ${NOISE}
                // one spruce per cell: narrow cone with stepped branch tiers
                float spruce(float az, float n, float hMin, float hMax, float seed) {
                    float x = az / 6.2831853 * n;
                    float i = floor(x);
                    float best = 0.0;
                    for (int k = -2; k <= 2; k++) {
                        float id = i + float(k);
                        float r1 = hash(vec2(id, seed)), r2 = hash(vec2(id, seed + 3.7));
                        float clump = smoothstep(0.25, 0.75, vnoise(vec2(id * 0.06, seed)));
                        if (r2 < 0.08) continue;
                        float h = mix(hMin, hMax, r1 * 0.45 + clump * 0.55);
                        float c = id + 0.5 + (r2 - 0.5) * 0.9;
                        float halfw = (0.42 + r2 * 0.3) * (0.55 + 0.45 * h / hMax);
                        float t = 1.0 - abs(x - c) / halfw;
                        if (t <= 0.0) continue;
                        float tier = fract(t * 7.0 + r1 * 4.0);
                        float prof = h * (pow(t, 0.85) - tier * 0.09);
                        best = max(best, prof);
                    }
                    return best;
                }
                void main() {
                    vec3 d = normalize(vDir);
                    float y = d.y;
                    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.16, y));
                    col = mix(col, uTop, smoothstep(0.12, 0.62, y));
                    float sd = max(dot(d, uSunDir), 0.0);
                    col += vec3(1.0, 0.66, 0.36) * pow(sd, 14.0) * 0.2 * (1.0 - smoothstep(0.0, 0.5, y));
                    col += vec3(1.0, 0.84, 0.6) * pow(sd, 260.0) * 0.45;
                    col += vec3(1.0, 0.92, 0.75) * pow(sd, 2400.0) * 0.6;
                    // soft high cloud streaks
                    vec2 cp = d.xz / max(y + 0.12, 0.05);
                    float c = fbm(cp * 0.55 + vec2(uTime * 0.004, 0.0));
                    c = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.2, y) * (1.0 - smoothstep(0.4, 0.8, y));
                    col = mix(col, vec3(1.0, 0.93, 0.86) + pow(sd, 3.0) * vec3(0.12, 0.05, -0.02), c * 0.45);
                    // spruce forest on low hills along the horizon, two hazy layers
                    float az = atan(d.x, -d.z);
                    float hillFar = 0.006 + fbm(vec2(az * 1.3, 5.0)) * 0.016;
                    float hillNear = 0.001 + fbm(vec2(az * 2.4, 1.7)) * 0.008;
                    float far = hillFar + spruce(az, 760.0, 0.006, 0.018, 2.0);
                    float near = hillNear + spruce(az, 430.0, 0.01, 0.036, 7.0);
                    vec3 farCol = mix(uHorizon, vec3(0.45, 0.53, 0.56), 0.42);
                    vec3 nearCol = mix(vec3(0.17, 0.24, 0.22), uHorizon, 0.32);
                    float aa = fwidth(y) * 1.2;
                    col = mix(col, farCol, 1.0 - smoothstep(far - aa, far + aa, y));
                    col = mix(col, nearCol, 1.0 - smoothstep(near - aa, near + aa, y));
                    if (y < 0.0) col = uFogColor;
                    gl_FragColor = vec4(col, 1.0);
                }`,
        })
    );
    scene.add(sky);

    /* ---------- ground ---------- */
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(800, 800, 1, 1).rotateX(-Math.PI / 2),
        new THREE.ShaderMaterial({
            uniforms: shared,
            vertexShader: /* glsl */ `
                varying vec3 vWorld;
                void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
            fragmentShader: /* glsl */ `
                ${NOISE}
                ${FOG}
                varying vec3 vWorld;
                void main() {
                    float n = fbm(vWorld.xz * 0.35);
                    vec3 col = mix(vec3(0.20, 0.27, 0.12), vec3(0.42, 0.45, 0.2), n);
                    float m = fbm(vWorld.xz * 0.9 + 7.0);
                    col = mix(col, vec3(0.34, 0.4, 0.78), smoothstep(0.62, 0.78, m) * 0.5);
                    float dist = length(vWorld - cameraPosition);
                    col = mix(col, uFogColor, smoothstep(4.0, 60.0, dist));
                    gl_FragColor = vec4(col, 1.0);
                }`,
        })
    );
    scene.add(ground);

    /* ---------- grass ---------- */
    const rng = rand(20270626);
    const DEPTH = 34;
    const grassCount = lowPower ? 22000 : 70000;
    const grassGeo = instanced(bladeGeometry(5), grassCount, (i, o, v) => {
        const [x, z] = scatter(rng, DEPTH);
        o[i * 4] = x; o[i * 4 + 1] = z;
        o[i * 4 + 2] = 0.22 + rng() * 0.4;           // height
        o[i * 4 + 3] = rng() * Math.PI * 2;          // yaw
        v[i * 3] = rng(); v[i * 3 + 1] = rng(); v[i * 3 + 2] = 0.9 + rng() * 0.6; // colour, phase, stiffness
    });

    const stalkVertex = (widthBase) => /* glsl */ `
        ${NOISE}
        ${BEND}
        ${FOG}
        attribute vec4 aOffset; attribute vec3 aVar;
        varying float vH; varying float vVar; varying float vFog; varying float vBack;
        void main() {
            float h = position.y;
            float height = aOffset.z;
            float wdt = ${widthBase} * (1.0 - h * 0.92);
            float c = cos(aOffset.w), s = sin(aOffset.w);
            vec3 base = vec3(aOffset.x, 0.0, aOffset.y);
            vec3 p = vec3(position.x * wdt * c, h * height, position.x * wdt * s);
            p += bendOffset(base, h, height, aVar.y, aVar.z);
            vec4 world = vec4(base + p, 1.0);
            vec3 toCam = cameraPosition - world.xyz;
            vFog = fogAmount(length(toCam));
            vBack = pow(max(dot(normalize(-toCam), uSunDir), 0.0), 3.0);
            vH = h; vVar = aVar.x;
            gl_Position = projectionMatrix * viewMatrix * world;
        }`;

    const grassMat = new THREE.ShaderMaterial({
        uniforms: shared,
        side: THREE.DoubleSide,
        vertexShader: stalkVertex('0.034'),
        fragmentShader: /* glsl */ `
            ${FOG}
            varying float vH; varying float vVar; varying float vFog; varying float vBack;
            void main() {
                vec3 root = vec3(0.09, 0.15, 0.07);
                vec3 mid = mix(vec3(0.27, 0.37, 0.14), vec3(0.4, 0.42, 0.17), vVar);
                vec3 tip = mix(vec3(0.66, 0.63, 0.34), vec3(0.5, 0.57, 0.27), vVar);
                vec3 col = mix(root, mid, smoothstep(0.0, 0.5, vH));
                col = mix(col, tip, smoothstep(0.45, 1.0, vH));
                col += vec3(1.0, 0.7, 0.36) * vBack * vH * 0.45;
                col = mix(col, uFogColor, vFog);
                gl_FragColor = vec4(col, 1.0);
            }`,
    });
    scene.add(new THREE.Mesh(grassGeo, grassMat));
    const lodTargets = [grassGeo];

    /* ---------- flowers: stems + heads ---------- */
    const flowerRng = rand(250627);
    const cornCount = lowPower ? 1300 : 3200;
    const daisyCount = lowPower ? 260 : 650;
    const flowers = [];
    const patch = (x, z, seed) => valueNoise(x * 0.32 + seed, z * 0.32) * 0.65 + valueNoise(x * 0.9, z * 0.9 + seed) * 0.35;
    for (let i = 0; i < cornCount + daisyCount; i++) {
        const daisy = i >= cornCount;
        let x, z, tries = 0;
        do { [x, z] = scatter(flowerRng, DEPTH * 0.9); tries++; }
        while (tries < 8 && patch(x, z, daisy ? 17.3 : 5.71) < (daisy ? 0.5 : 0.3) + flowerRng() * 0.15);
        flowers.push({
            x, z,
            h: 0.42 + flowerRng() * 0.36,
            yaw: flowerRng() * Math.PI * 2,
            phase: flowerRng(),
            stiff: 1.2 + flowerRng() * 0.5,
            daisy,
            tone: flowerRng(),
        });
    }
    const stemGeo = instanced(bladeGeometry(6), flowers.length, (i, o, v) => {
        const f = flowers[i];
        o.set([f.x, f.z, f.h, f.yaw], i * 4);
        v.set([f.tone, f.phase, f.stiff], i * 3);
    });
    const stemMat = new THREE.ShaderMaterial({
        uniforms: shared,
        side: THREE.DoubleSide,
        vertexShader: stalkVertex('0.016'),
        fragmentShader: /* glsl */ `
            ${FOG}
            varying float vH; varying float vVar; varying float vFog; varying float vBack;
            void main() {
                vec3 col = mix(vec3(0.16, 0.26, 0.12), vec3(0.42, 0.54, 0.3), vH);
                col += vec3(0.9, 0.7, 0.4) * vBack * vH * 0.35;
                col = mix(col, uFogColor, vFog);
                gl_FragColor = vec4(col, 1.0);
            }`,
    });
    scene.add(new THREE.Mesh(stemGeo, stemMat));

    const headVertex = /* glsl */ `
        ${NOISE}
        ${BEND}
        ${FOG}
        attribute vec4 aOffset; attribute vec3 aVar;
        uniform float uScale;
        varying vec3 vColor; varying float vFog; varying float vBack; varying float vTone;
        void main() {
            vec3 base = vec3(aOffset.x, 0.0, aOffset.y);
            float height = aOffset.z;
            vec3 tip = base + vec3(0.0, height, 0.0) + bendOffset(base, 1.0, height, aVar.y, aVar.z);
            vec3 below = base + vec3(0.0, height * 0.9, 0.0) + bendOffset(base, 0.9, height, aVar.y, aVar.z);
            vec3 up = normalize(tip - below);
            // tilt the head with its stem, then nod it toward the camera a little
            vec3 toCam = normalize(cameraPosition - tip);
            up = normalize(up + vec3(toCam.x, 0.0, toCam.z) * 0.55);
            vec3 side = normalize(cross(up, vec3(cos(aOffset.w), 0.0, sin(aOffset.w))));
            vec3 fwd = cross(side, up);
            vec3 local = position * uScale * (0.8 + aVar.x * 0.45);
            vec3 world = tip + side * local.x + up * local.y + fwd * local.z;
            vec3 tc = cameraPosition - world;
            vFog = fogAmount(length(tc));
            vBack = pow(max(dot(normalize(-tc), uSunDir), 0.0), 3.0);
            vColor = color; vTone = aVar.x;
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`;
    const headFragment = (warm) => /* glsl */ `
        ${FOG}
        varying vec3 vColor; varying float vFog; varying float vBack; varying float vTone;
        void main() {
            vec3 col = vColor * (0.86 + vTone * 0.28);
            col += vec3(${warm}) * vBack * 0.5;
            col = mix(col, uFogColor, vFog * 0.92);
            gl_FragColor = vec4(col, 1.0);
        }`;

    const cornHead = cornflowerHead(31);
    const cornGeo = instanced(cornHead, cornCount, (i, o, v) => {
        const f = flowers[i];
        o.set([f.x, f.z, f.h, f.yaw], i * 4);
        v.set([f.tone, f.phase, f.stiff], i * 3);
    });
    const cornMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, uScale: { value: 0.046 } },
        side: THREE.DoubleSide, vertexColors: true,
        vertexShader: headVertex, fragmentShader: headFragment('0.45, 0.35, 0.6'),
    });
    scene.add(new THREE.Mesh(cornGeo, cornMat));

    const daisyHead = mergeColored(
        petalHead(20, new THREE.Color('#dedbd0'), new THREE.Color('#f6f2e6'), 0.05, 0.1),
        discGeometry(0.26, 14, new THREE.Color('#e3a823')),
    );
    const daisyGeo = instanced(daisyHead, daisyCount, (i, o, v) => {
        const f = flowers[cornCount + i];
        o.set([f.x, f.z, f.h + 0.06, f.yaw], i * 4);
        v.set([f.tone, f.phase, f.stiff], i * 3);
    });
    const daisyMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, uScale: { value: 0.05 } },
        side: THREE.DoubleSide, vertexColors: true,
        vertexShader: headVertex, fragmentShader: headFragment('0.5, 0.35, 0.15'),
    });
    scene.add(new THREE.Mesh(daisyGeo, daisyMat));
    // flowers keep their count: stems and heads share instance order
    const fullCounts = lodTargets.map((g) => g.instanceCount);

    /* ---------- drifting pollen in the low sun ---------- */
    const pollenCount = lowPower ? 140 : 320;
    const pp = new Float32Array(pollenCount * 3), pr = new Float32Array(pollenCount);
    const pRng = rand(7);
    for (let i = 0; i < pollenCount; i++) {
        pp[i * 3] = (pRng() - 0.5) * 9; pp[i * 3 + 1] = 0.15 + pRng() * 1.4; pp[i * 3 + 2] = 1.5 - pRng() * 10; pr[i] = pRng();
    }
    const pollenGeo = new THREE.BufferGeometry();
    pollenGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pollenGeo.setAttribute('aRnd', new THREE.BufferAttribute(pr, 1));
    const pollen = new THREE.Points(pollenGeo, new THREE.ShaderMaterial({
        uniforms: { ...shared, uPx: { value: renderer.getPixelRatio() } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
            uniform float uTime, uPx; attribute float aRnd; varying float vA;
            void main() {
                vec3 p = position;
                float t = uTime * (0.15 + aRnd * 0.2) + aRnd * 30.0;
                p.x += sin(t) * 0.35 + uTime * 0.05; p.y += sin(t * 1.7) * 0.12; p.z += cos(t * 0.8) * 0.3;
                p.x = mod(p.x + 4.5, 9.0) - 4.5;
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_PointSize = (2.0 + aRnd * 3.0) * uPx * (2.2 / -mv.z);
                vA = (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 3.0))) * smoothstep(9.0, 2.0, -mv.z);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */ `
            varying float vA;
            void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(1.0, 0.92, 0.74, a * 0.8); }`,
    }));
    scene.add(pollen);

    /* ---------- camera rig, pointer, scroll ---------- */
    const rig = { px: 0, py: 0, tx: 0, ty: 0, scroll: 0 };
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    let pushTarget = 0;

    function setPointer(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        rig.tx = ndc.x; rig.ty = ndc.y;
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
            shared.uPointer.value.lerp(new THREE.Vector3(hit.x, hit.z, 0), shared.uPointer.value.x > 90 ? 1 : 0.35);
            pushTarget = 1;
        }
    }
    const onMove = (e) => setPointer(e.clientX, e.clientY);
    const onLeave = () => { pushTarget = 0; rig.tx = 0; rig.ty = 0; };
    const target = canvas.closest('.hero') || canvas;
    target.addEventListener('pointermove', onMove, { passive: true });
    target.addEventListener('pointerdown', onMove, { passive: true });
    target.addEventListener('pointerleave', onLeave);

    let width = 0, height = 0;
    function resize() {
        const r = canvas.getBoundingClientRect();
        width = Math.max(1, Math.round(r.width)); height = Math.max(1, Math.round(r.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // keep the meadow wide on portrait phones
        camera.fov = camera.aspect < 0.8 ? 62 : camera.aspect < 1.2 ? 54 : 46;
        camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    let last = performance.now();
    let running = false, raf = 0, elapsed = 8;

    // adaptive quality: if the device can't keep up, render less
    let lod = 1, sampleT = 0, sampleN = 0, warm = 0;
    function adapt(rawDt) {
        if (warm < 30) { warm++; return; }
        sampleT += rawDt; sampleN++;
        if (sampleN < 60) return;
        const avg = sampleT / sampleN;
        sampleT = 0; sampleN = 0;
        if (avg > 0.026 && lod > 0.35) {
            lod = Math.max(0.35, lod * 0.7);
            renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.8));
            resize();
            lodTargets.forEach((g, i) => { g.instanceCount = Math.floor(fullCounts[i] * lod); });
        }
    }

    function frame() {
        const now = performance.now();
        const rawDt = (now - last) / 1000;
        const dt = Math.min(rawDt, 0.05);
        last = now;
        if (running && !reducedMotion) adapt(rawDt);
        if (!reducedMotion) elapsed += dt;
        shared.uTime.value = elapsed;
        shared.uPush.value += (pushTarget - shared.uPush.value) * 0.06;
        rig.px += (rig.tx - rig.px) * 0.04; rig.py += (rig.ty - rig.py) * 0.04;
        const s = rig.scroll;
        const drift = reducedMotion ? 0 : Math.sin(elapsed * 0.07) * 0.25;
        camera.position.set(drift + rig.px * 0.2, 1.08 + rig.py * 0.05 + s * 0.5, 2.4 - s * 0.4);
        camera.lookAt(drift * 0.6 + rig.px * 0.5, 0.86 + s * 4.0 + rig.py * 0.12, -12);
        renderer.render(scene, camera);
        if (running) raf = requestAnimationFrame(frame);
    }

    return {
        start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
        stop() { running = false; cancelAnimationFrame(raf); },
        renderOnce() { frame(); },
        setScroll(v) { rig.scroll = v; if (!running) frame(); },
        dispose() { this.stop(); ro.disconnect(); renderer.dispose(); },
    };
}
