// "To tråder, én knute": two silk ribbons, cornflower and champagne, drift
// through the night and braid tighter as the wedding gets closer. On the day
// itself they tie into a knot. Everything is computed on the GPU from one
// shared centre curve, so the ribbons stay smooth at any frame rate.
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.186.1/three.module.min.js';

const WEDDING = new Date('2027-06-26T13:00:00+02:00').getTime();
const DAY = 86400000;

// days left -> how loosely the threads wander (1 = far apart, 0 = tied)
export function separationFor(now) {
    const days = Math.max(0, (WEDDING - now) / DAY);
    return Math.min(1, days / 420);
}

const CURVE = /* glsl */ `
uniform float uTime, uSep, uKnot, uWidthW, uYOff, uAmp;
uniform vec2 uKnotC, uKnotR; // centre and radii of the ring, in world units
const float TAU = 6.28318530718;

// shared path for both threads: a slow wave across the screen
vec3 centre(float u) {
    float t = uTime;
    vec3 p = vec3(
        (u - 0.5) * uWidthW * 1.35,
        uAmp * (0.85 * sin(u * TAU * 0.9 + t * 0.11) + 0.4 * sin(u * TAU * 2.1 - t * 0.08)) + uYOff,
        uAmp * 1.4 * cos(u * TAU * 0.7 + t * 0.09)
    );
    // on the day, the shared path leaves its wave and runs once around the
    // countdown: a ring of silk around the number, entered and left at the bottom
    float s = smoothstep(0.4, 0.6, u);
    float a = s * TAU;
    vec3 ring = vec3(uKnotC.x + uKnotR.x * sin(a) + (u - 0.5) * 0.8, uKnotC.y - uKnotR.y * cos(a), 0.7 * sin(a));
    float w = smoothstep(0.28, 0.4, u) * (1.0 - smoothstep(0.6, 0.72, u));
    p = mix(p, ring, uKnot * w);
    return p;
}

vec3 frameN(vec3 T) { return normalize(cross(T, vec3(0.0, 0.0, 1.0)) + vec3(1e-4)); }

// one thread winds around the shared path; the other is half a turn away
vec3 strand(float u, float phase, out float theta) {
    vec3 c = centre(u);
    vec3 T = normalize(centre(u + 0.0015) - centre(u - 0.0015));
    vec3 N = frameN(T);
    vec3 B = normalize(cross(T, N));
    float twists = mix(5.5, 1.4, uSep);
    theta = TAU * twists * u + uTime * 0.22 + phase;
    float r = (0.07 + uSep * 1.15) * uAmp;
    return c + r * (N * cos(theta) + B * sin(theta));
}
`;

function ribbonMaterial(color, phase, shared) {
    return new THREE.ShaderMaterial({
        uniforms: { ...shared, uColor: { value: new THREE.Color(color) }, uPhase: { value: phase } },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true,
        vertexShader: /* glsl */ `
            ${CURVE}
            uniform float uPhase, uWidth, uPointerOn;
            uniform vec2 uPointer;
            attribute float aU; attribute float aV;
            varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vU; varying float vV;
            void main() {
                float th, th2, th3;
                vec3 p = strand(aU, uPhase, th);
                vec3 T = normalize(strand(aU + 0.0012, uPhase, th2) - strand(aU - 0.0012, uPhase, th3));
                vec3 N = frameN(T);
                vec3 B = normalize(cross(T, N));
                // the ribbon face turns slowly as it travels, like silk in water
                float phi = th * 0.5 + uTime * 0.17;
                vec3 W = N * cos(phi) + B * sin(phi);
                float width = uWidth * (0.85 + 0.15 * sin(aU * 23.0 + uTime * 0.4));
                vec3 pos = p + W * aV * width;
                // drawn softly toward the pointer
                vec2 d = uPointer - pos.xy;
                float fall = exp(-dot(d, d) / 3.2);
                pos.xy += d * fall * 0.22 * uPointerOn;
                pos.z += fall * 0.6 * uPointerOn;
                vT = T; vN = normalize(cross(T, W)); vPos = pos; vU = aU; vV = aV;
                gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
            }`,
        fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vU; varying float vV;
            void main() {
                vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
                vec3 V = normalize(cameraPosition - vPos);
                vec3 L = normalize(vec3(-0.35, 0.65, 1.0));
                vec3 H = normalize(L + V);
                // satin: an anisotropic sheen that runs along the thread
                float TdH = dot(normalize(vT), H);
                float aniso = sqrt(max(0.0, 1.0 - TdH * TdH));
                float sheen = pow(aniso, 90.0) * 0.95 + pow(aniso, 14.0) * 0.18;
                float diff = 0.32 + 0.68 * abs(dot(n, L));
                float rim = pow(1.0 - abs(dot(n, V)), 3.0);
                vec3 col = uColor * diff + vec3(1.0, 0.96, 0.9) * sheen + uColor * rim * 0.7;
                // soft selvedge and fading tails
                float edge = smoothstep(1.0, 0.55, abs(vV));
                float tails = smoothstep(0.0, 0.1, vU) * smoothstep(1.0, 0.9, vU);
                gl_FragColor = vec4(col, edge * tails * 0.96);
            }`,
    });
}

export function startThreads(canvas, { reducedMotion = false, onFrame, ringAround = null } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 20);

    const compact = matchMedia('(max-width: 640px)').matches;
    const shared = {
        uTime: { value: 0 },
        uSep: { value: separationFor(Date.now()) },
        uKnot: { value: 0 },
        uWidthW: { value: 16 },
        uYOff: { value: 0 },
        uAmp: { value: 1 },
        uKnotC: { value: new THREE.Vector2(0, 0) },
        uKnotR: { value: new THREE.Vector2(2, 1.2) },
        uWidth: { value: compact ? 0.2 : 0.24 },
        uPointer: { value: new THREE.Vector2(999, 999) },
        uPointerOn: { value: 0 },
    };

    const seg = compact ? 260 : 420;
    const base = new THREE.PlaneGeometry(1, 1, seg, 1);
    const pos = base.attributes.position;
    const aU = new Float32Array(pos.count), aV = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { aU[i] = pos.getX(i) + 0.5; aV[i] = pos.getY(i) * 2; }
    base.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    base.setAttribute('aV', new THREE.BufferAttribute(aV, 1));

    const blue = new THREE.Mesh(base, ribbonMaterial('#4c69e6', 0, shared));
    const ivory = new THREE.Mesh(base, ribbonMaterial('#ecdcbc', Math.PI, shared));
    for (const m of [blue, ivory]) { m.frustumCulled = false; scene.add(m); }

    /* a few slow motes of light, far behind */
    const MOTES = compact ? 90 : 180;
    const mp = new Float32Array(MOTES * 3), mr = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) { mp.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 16, -4 - Math.random() * 8], i * 3); mr[i] = Math.random(); }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    moteGeo.setAttribute('aR', new THREE.BufferAttribute(mr, 1));
    const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uPx: { value: renderer.getPixelRatio() } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
            uniform float uTime, uPx; attribute float aR; varying float vA;
            void main() {
                vec3 p = position;
                p.y += sin(uTime * 0.05 + aR * 30.0) * 0.6;
                p.x += cos(uTime * 0.04 + aR * 20.0) * 0.8;
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = (1.0 + aR * 1.8) * uPx;
                vA = 0.15 + 0.35 * (0.5 + 0.5 * sin(uTime * (0.2 + aR * 0.4) + aR * 40.0));
            }`,
        fragmentShader: /* glsl */ `
            varying float vA;
            void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.8, 0.84, 1.0, smoothstep(0.5, 0.0, d) * vA); }`,
    }));
    motes.frustumCulled = false;
    scene.add(motes);

    function resize() {
        const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
        shared.uWidthW.value = visH * camera.aspect;
        // narrow screens get a flatter, finer path so it reads as ribbons, not a tangle
        const amp = Math.min(1, Math.max(0.34, shared.uWidthW.value / 17));
        shared.uAmp.value = amp;
        shared.uWidth.value = (compact ? 0.2 : 0.24) * Math.sqrt(amp);
        shared.uYOff.value = camera.aspect < 0.8 ? visH * 0.06 : visH * 0.04;
    }
    resize();
    new ResizeObserver(resize).observe(canvas);

    let pointerTarget = 0;
    addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
        shared.uPointer.value.set(((e.clientX - r.left) / r.width - 0.5) * visH * camera.aspect, -((e.clientY - r.top) / r.height - 0.5) * visH);
        pointerTarget = 1;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { pointerTarget = 0; });

    // "Se dem knytes": fast-forward to the day, hold, and ease back
    let preview = null;
    function playKnot() {
        if (preview) return false;
        preview = { t0: performance.now() / 1000 };
        return true;
    }
    const smooth = (x) => x * x * x * (x * (x * 6 - 15) + 10);
    function previewAmount(now) {
        if (!preview) return 0;
        const t = now - preview.t0, IN = 6.5, HOLD = 4.5, OUT = 5.5;
        if (t < IN) return smooth(t / IN);
        if (t < IN + HOLD) return 1;
        if (t < IN + HOLD + OUT) return 1 - smooth((t - IN - HOLD) / OUT);
        preview = null;
        return 0;
    }

    let running = false, raf = 0, elapsed = 30;
    let last = performance.now() / 1000;
    function frame() {
        const now = performance.now() / 1000;
        const dt = Math.min(0.05, now - last);
        last = now;
        if (!reducedMotion) elapsed += dt;
        shared.uTime.value = elapsed;
        const p = previewAmount(now);
        const sep = separationFor(Date.now()) * (1 - p);
        shared.uSep.value = sep;
        const k = 1 - Math.min(1, sep / 0.22);
        shared.uKnot.value = k * k * (3 - 2 * k);
        shared.uPointerOn.value += (pointerTarget - shared.uPointerOn.value) * 0.03;
        if (ringAround && shared.uKnot.value > 0) {
            // follow the countdown on screen so the ring always circles it
            const r = ringAround.getBoundingClientRect(), c = canvas.getBoundingClientRect();
            const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360), visW = visH * camera.aspect;
            const toX = (px) => ((px - c.left) / c.width - 0.5) * visW, toY = (py) => -((py - c.top) / c.height - 0.5) * visH;
            shared.uKnotC.value.set(toX(r.left + r.width / 2), toY(r.top + r.height / 2));
            shared.uKnotR.value.set(Math.abs(toX(r.right) - toX(r.left)) * 0.62 + 0.3, Math.abs(toY(r.top) - toY(r.bottom)) * 0.62 + 0.25);
        }
        renderer.render(scene, camera);
        onFrame?.(p);
        if (running) raf = requestAnimationFrame(frame);
    }
    const start = () => { if (!running) { running = true; last = performance.now() / 1000; raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if (reducedMotion) frame(); else start();
    return { playKnot, stop, renderOnce: frame };
}
