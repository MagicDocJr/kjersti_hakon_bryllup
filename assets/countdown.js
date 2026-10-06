// Particle countdown: every digit is a cloud of glowing points sampled from
// the glyph. It changes once a minute, and the changed digits drift slowly
// into their new shape in a wave from left to right.
// Coordinates are CSS pixels inside the stage (orthographic camera, y down).
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.186.1/three.module.min.js';

const WEDDING = new Date('2027-06-26T13:00:00+02:00').getTime();
const FONT = '"Bodoni Moda", Didot, Georgia, serif';
const DUR = 3.2; // seconds a particle spends drifting between shapes

function parts(now) {
    let ms = Math.max(0, WEDDING - now);
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const two = (n) => String(n).padStart(2, '0');
    return { days: String(d), clock: `${two(h)}:${two(m)}` };
}

export async function startCountdown(stage, { reducedMotion = false } = {}) {
    const canvas = stage.querySelector('canvas');
    const labelBox = stage.querySelector('.labels');
    await document.fonts.load(`600 200px ${FONT}`);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);

    const compact = stage.clientWidth < 640;
    const BIG = compact ? 1700 : 2800, SMALL = compact ? 800 : 1300, COLON = compact ? 180 : 280, DUST = compact ? 160 : 320;

    // 3 slots for days (right-aligned) + "HH:MM"
    const slots = [];
    for (let i = 0; i < 3; i++) slots.push({ row: 0, count: BIG });
    for (const ch of 'HH:MM') slots.push({ row: 1, count: ch === ':' ? COLON : SMALL });
    let offset = 0;
    for (const s of slots) { s.start = offset; offset += s.count; s.char = null; }
    const N = offset;

    const from = new Float32Array(N * 3), to = new Float32Array(N * 3);
    const startAt = new Float32Array(N), rnd = new Float32Array(N * 4), big = new Float32Array(N);
    for (const sl of slots) if (sl.row === 0) big.fill(1, sl.start, sl.start + sl.count);
    for (let i = 0; i < N; i++) rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);

    const geo = new THREE.BufferGeometry();
    const aFrom = new THREE.BufferAttribute(from, 3), aTo = new THREE.BufferAttribute(to, 3), aStart = new THREE.BufferAttribute(startAt, 1);
    geo.setAttribute('position', aTo); // used only for bounds; shader reads aFrom/aTo
    geo.setAttribute('aFrom', aFrom);
    geo.setAttribute('aTo', aTo);
    geo.setAttribute('aStart', aStart);
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    geo.setAttribute('aBig', new THREE.BufferAttribute(big, 1));

    const uniforms = {
        uTime: { value: 0 },
        uDur: { value: reducedMotion ? 0.001 : DUR },
        uPx: { value: renderer.getPixelRatio() },
        uPointer: { value: new THREE.Vector2(-9999, -9999) },
        uPointerOn: { value: 0 },
        uScale: { value: 1 },
    };
    const points = new THREE.Points(geo, new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
            attribute vec3 aFrom; attribute vec3 aTo; attribute float aStart; attribute vec4 aRnd; attribute float aBig;
            uniform float uTime, uDur, uPx, uPointerOn, uScale; uniform vec2 uPointer;
            varying vec3 vColor; varying float vAlpha;
            float ease(float t) { return t < 0.5 ? 16.0 * t * t * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 5.0) / 2.0; }
            void main() {
                float t = clamp((uTime - aStart) / uDur, 0.0, 1.0);
                float e = ease(t);
                vec3 p = mix(aFrom, aTo, e);
                // fly in a soft arc rather than a straight line
                float arc = sin(e * 3.14159265);
                float ang = aRnd.z * 6.2831853;
                p.xy += arc * vec2(cos(ang), sin(ang) - 0.6) * (30.0 + 90.0 * aRnd.w) * uScale;
                // a slow drift at rest, never a jitter
                p.xy += vec2(sin(uTime * 0.23 + aRnd.z * 50.0), cos(uTime * 0.19 + aRnd.w * 40.0)) * 1.1 * uScale;
                // the pointer parts the cloud
                vec2 d = p.xy - uPointer;
                float dist = length(d);
                float reach = 120.0 * uScale;
                float fall = max(0.0, 1.0 - dist / reach);
                p.xy += (d / max(dist, 1.0)) * fall * fall * 38.0 * uScale * uPointerOn;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                // the big day digits spread their points wider, so each point is a little larger
                gl_PointSize = (1.0 + aRnd.x * 1.9) * mix(1.0, 1.4, aBig) * uPx * uScale * (1.0 + arc * 0.8);
                vec3 blue = mix(vec3(0.33, 0.45, 1.0), vec3(0.62, 0.71, 1.0), aRnd.y);
                vColor = aRnd.y > 0.985 ? vec3(1.0, 0.84, 0.6) : mix(blue, vec3(0.9, 0.92, 1.0), smoothstep(0.8, 0.98, aRnd.y));
                // the whole cloud breathes slowly; each point twinkles at its own pace
                float breath = 0.82 + 0.18 * sin(uTime * 0.45);
                float twinkle = 0.82 + 0.18 * sin(uTime * (0.3 + aRnd.w * 0.5) + aRnd.z * 60.0);
                vAlpha = (0.55 + 0.45 * aRnd.x) * mix(1.0, 1.2, aBig) * breath * twinkle * (1.0 - 0.25 * arc);
            }`,
        fragmentShader: /* glsl */ `
            varying vec3 vColor; varying float vAlpha;
            void main() {
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.05, d) * vAlpha;
                gl_FragColor = vec4(vColor, a);
            }`,
    }));
    points.frustumCulled = false;
    scene.add(points);

    /* ---------- drifting dust: the quiet background ---------- */
    const dustPos = new Float32Array(DUST * 3), dustRnd = new Float32Array(DUST * 4);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('aRnd', new THREE.BufferAttribute(dustRnd, 4));
    for (let i = 0; i < DUST; i++) dustRnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
        uniforms: { uTime: uniforms.uTime, uPx: uniforms.uPx, uSize: { value: new THREE.Vector2(1, 1) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
            attribute vec4 aRnd; uniform float uTime, uPx; uniform vec2 uSize; varying float vA;
            void main() {
                vec2 p = aRnd.xy * uSize;
                p.x += sin(uTime * (0.03 + aRnd.z * 0.05) + aRnd.w * 20.0) * 24.0;
                p.y = mod(p.y - uTime * (1.5 + aRnd.z * 3.5), uSize.y);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
                gl_PointSize = (0.8 + aRnd.w * 1.6) * uPx;
                vA = 0.12 + 0.3 * aRnd.z * (0.5 + 0.5 * sin(uTime * (0.6 + aRnd.w) + aRnd.x * 30.0));
            }`,
        fragmentShader: /* glsl */ `
            varying float vA;
            void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.75, 0.8, 1.0, smoothstep(0.5, 0.0, d) * vA); }`,
    }));
    dust.frustumCulled = false;
    scene.add(dust);

    /* ---------- layout + glyph sampling ---------- */
    const scratch = document.createElement('canvas');
    const sctx = scratch.getContext('2d', { willReadFrequently: true });
    let W = 0, H = 0, metrics = null;
    const glyphCache = new Map();

    function measure() {
        sctx.font = `600 100px ${FONT}`;
        const zero = sctx.measureText('0');
        const colon = sctx.measureText(':');
        return { adv: zero.width / 100, colon: colon.width / 100, cap: zero.actualBoundingBoxAscent / 100 };
    }

    function layout() {
        const r = stage.getBoundingClientRect();
        W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
        renderer.setSize(W, H, false);
        camera.right = W; camera.bottom = H; camera.updateProjectionMatrix();
        dust.material.uniforms.uSize.value.set(W, H);
        uniforms.uScale.value = Math.min(1.4, Math.max(0.7, W / 900));
        metrics = measure();
        const m = metrics;
        // days row as large as fits; clock row about a third of it
        const s0 = Math.min((W * 0.86) / (3 * m.adv), (H * 0.5) / m.cap);
        const s1 = s0 * (compact ? 0.38 : 0.32);
        const gap = s0 * 0.3;
        const blockH = m.cap * s0 + gap + m.cap * s1 + 22;
        const y0 = (H - blockH) / 2 + m.cap * s0;
        const y1 = y0 + gap + m.cap * s1;
        const clockW = (4 * m.adv * 1.12 + m.colon * 2.2) * s1;
        let x = (W - clockW) / 2;
        const clock = [];
        for (const ch of 'HH:MM') {
            const w = (ch === ':' ? m.colon * 2.2 : m.adv * 1.12) * s1;
            clock.push({ x: x + w / 2, w });
            x += w;
        }
        glyphCache.clear();
        return { s0, s1, y0, y1, clock };
    }

    let L = null;

    function glyphPoints(ch, size, cx, baseline) {
        const key = `${ch}|${size.toFixed(1)}|${cx.toFixed(1)}|${baseline.toFixed(1)}`;
        if (glyphCache.has(key)) return glyphCache.get(key);
        const pad = 4;
        sctx.font = `600 ${size}px ${FONT}`;
        const mt = sctx.measureText(ch);
        const left = Math.floor(cx - mt.width / 2 - pad), top = Math.floor(baseline - mt.actualBoundingBoxAscent - pad);
        const bw = Math.ceil(mt.width + pad * 2), bh = Math.ceil(mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent + pad * 2);
        scratch.width = Math.max(1, bw); scratch.height = Math.max(1, bh);
        sctx.font = `600 ${size}px ${FONT}`;
        sctx.textAlign = 'center';
        sctx.textBaseline = 'alphabetic';
        sctx.fillStyle = '#fff';
        sctx.fillText(ch, cx - left, baseline - top);
        const data = sctx.getImageData(0, 0, scratch.width, scratch.height).data;
        const pts = [];
        for (let y = 0; y < scratch.height; y++) {
            for (let x = 0; x < scratch.width; x++) {
                if (data[(y * scratch.width + x) * 4 + 3] > 140) pts.push(left + x + Math.random(), top + y + Math.random());
            }
        }
        glyphCache.set(key, pts);
        return pts;
    }

    function targetsFor(slotIndex, ch) {
        const slot = slots[slotIndex];
        let pts;
        if (slot.row === 0) {
            const daysLen = Math.max(1, Math.min(3, ch.daysLen));
            const used = slotIndex - (3 - daysLen); // index within the visible digits
            const xs = (W / 2) - (daysLen * metrics.adv * L.s0) / 2 + metrics.adv * L.s0 * (Math.max(0, used) + 0.5);
            // unused leading slots borrow the first visible digit, adding glow
            pts = glyphPoints(used < 0 ? ch.days[0] : ch.days[used], L.s0, used < 0 ? (W / 2) - (daysLen * metrics.adv * L.s0) / 2 + metrics.adv * L.s0 * 0.5 : xs, L.y0);
        } else {
            const i = slotIndex - 3;
            pts = glyphPoints(ch.clock[i], L.s1, L.clock[i].x, L.y1);
        }
        const out = new Float32Array(slot.count * 2);
        for (let k = 0; k < slot.count; k++) {
            const j = pts.length ? (Math.random() * (pts.length / 2)) | 0 : 0;
            out[k * 2] = pts[j * 2] ?? W / 2;
            out[k * 2 + 1] = pts[j * 2 + 1] ?? H / 2;
        }
        return out;
    }

    function placeLabels() {
        const lab = (text, x, y, cls) => `<span class="${cls}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${text}</span>`;
        const c = L.clock;
        const under = L.y1 + 10;
        labelBox.innerHTML =
            lab('dager', W / 2, L.y0 + L.s0 * 0.06, 'lab lab-days') +
            lab('timer', (c[0].x + c[1].x) / 2, under, 'lab') +
            lab('minutter', (c[3].x + c[4].x) / 2, under, 'lab');
    }

    function charKey(slotIndex, st) {
        if (slotIndex < 3) {
            const daysLen = st.days.length;
            const used = slotIndex - (3 - daysLen);
            return `${daysLen}:${used < 0 ? '_' : st.days[used]}`;
        }
        return st.clock[slotIndex - 3];
    }

    function update(now, { intro = false, force = false } = {}) {
        const st = parts(Date.now());
        const ch = { days: st.days, daysLen: st.days.length, clock: st.clock };
        for (let si = 0; si < slots.length; si++) {
            const slot = slots[si];
            const key = charKey(si, st);
            if (!force && slot.char === key) continue;
            slot.char = key;
            const t = targetsFor(si, ch);
            for (let k = 0; k < slot.count; k++) {
                const i = slot.start + k;
                if (intro) {
                    // rise from the glow below the stage, the days first
                    from[i * 3] = W / 2 + (Math.random() - 0.5) * W * 1.3;
                    from[i * 3 + 1] = H + 30 + Math.random() * H * 0.7;
                    startAt[i] = now + 0.9 + (slot.row ? 0.6 : 0) + Math.random() * 1.6;
                } else if (force) {
                    from[i * 3] = t[k * 2]; from[i * 3 + 1] = t[k * 2 + 1];
                    startAt[i] = -100;
                } else {
                    from[i * 3] = to[i * 3]; from[i * 3 + 1] = to[i * 3 + 1];
                    // a wave across the row rather than everything at once
                    startAt[i] = now + (t[k * 2] / W) * 0.9 + Math.random() * 0.5;
                }
                to[i * 3] = t[k * 2]; to[i * 3 + 1] = t[k * 2 + 1];
            }
        }
        aFrom.needsUpdate = aTo.needsUpdate = aStart.needsUpdate = true;
    }

    function burst(now, cx, cy) {
        for (let i = 0; i < N; i++) {
            const dx = to[i * 3] - cx, dy = to[i * 3 + 1] - cy;
            const len = Math.hypot(dx, dy) || 1;
            const push = (20 + Math.random() * 70) * uniforms.uScale.value;
            from[i * 3] = to[i * 3] + (dx / len) * push;
            from[i * 3 + 1] = to[i * 3 + 1] + (dy / len) * push;
            startAt[i] = now + (len / 900) + Math.random() * 0.3;
        }
        aFrom.needsUpdate = aStart.needsUpdate = true;
    }

    const clock = () => performance.now() / 1000;
    L = layout();
    placeLabels();
    update(clock(), { intro: !reducedMotion, force: reducedMotion });

    new ResizeObserver(() => {
        const prev = W + 'x' + H;
        L = layout();
        if (prev === W + 'x' + H) return;
        placeLabels();
        slots.forEach((s) => { s.char = null; });
        update(clock(), { force: true });
    }).observe(stage);

    let pointerTarget = 0;
    const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    stage.addEventListener('pointermove', (e) => { const [x, y] = local(e); uniforms.uPointer.value.set(x, y); pointerTarget = 1; }, { passive: true });
    stage.addEventListener('pointerleave', () => { pointerTarget = 0; });
    stage.addEventListener('pointerup', (e) => { if (!reducedMotion) { const [x, y] = local(e); burst(clock(), x, y); } });

    let lastSecond = -1, raf = 0, running = false;
    function frame() {
        const now = clock();
        uniforms.uTime.value = now;
        uniforms.uPointerOn.value += (pointerTarget - uniforms.uPointerOn.value) * 0.025;
        const sec = Math.floor(Date.now() / 1000);
        if (sec !== lastSecond) { lastSecond = sec; update(now); }
        renderer.render(scene, camera);
        if (running) raf = requestAnimationFrame(frame);
    }
    const startLoop = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
    const stopLoop = () => { running = false; cancelAnimationFrame(raf); };
    document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()));
    startLoop();
    return { stop: stopLoop };
}
