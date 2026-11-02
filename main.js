// Kjersti & Håkon — bryllupssiden: brudens skisse, med et program der himmelen følger sola

const CHECK_IN = new Date('2027-06-25T17:00:00+02:00');
const MALUNGEN = { lat: 60.77, lon: 11.45 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ======================================================================
   Sun position (low-precision solar ephemeris, good to ~0.5°)
   ====================================================================== */
const RAD = Math.PI / 180;
function sunPosition(date, lat = MALUNGEN.lat, lon = MALUNGEN.lon) {
    const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
    const g = (357.529 + 0.98560028 * d) * RAD;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const H = ((gmst * 15 + lon) * RAD) - ra;
    const φ = lat * RAD;
    const alt = Math.asin(Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(H));
    let az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(φ) - Math.sin(φ) * Math.cos(H));
    az = (az / RAD + 360) % 360;
    return { alt: alt / RAD, az };
}

// Sky colours keyed on solar altitude (degrees): [alt, top, bottom]
const SKY = [
    [-9, '#1d2752', '#3f4680'],
    [-5, '#283569', '#7a72a6'],
    [-2, '#3c4b8c', '#c98c8c'],
    [0.5, '#5a6fb2', '#efa47f'],
    [3, '#7790cf', '#f4bf90'],
    [7, '#8eaee2', '#f6d4a8'],
    [13, '#93b6e9', '#f1e2c8'],
    [24, '#7fb0ee', '#d9e8f8'],
    [45, '#6aa3ec', '#cfe3fa'],
];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
function skyAt(alt) {
    if (alt <= SKY[0][0]) return [hex(SKY[0][1]), hex(SKY[0][2])];
    for (let i = 1; i < SKY.length; i++) {
        if (alt <= SKY[i][0]) {
            const t = (alt - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
            return [mix(hex(SKY[i - 1][1]), hex(SKY[i][1]), t), mix(hex(SKY[i - 1][2]), hex(SKY[i][2]), t)];
        }
    }
    const last = SKY[SKY.length - 1];
    return [hex(last[1]), hex(last[2])];
}

// data-at values are Oslo local time in June (CEST, UTC+2)
const parseLocal = (s) => new Date(`${s}:00+02:00`);


/* ======================================================================
   Scroll: top bar, programme sky
   ====================================================================== */
const program = document.querySelector('.program');
const events = [...program.querySelectorAll('[data-at]')];
const root = document.documentElement;
const sunEl = document.getElementById('sun');

let anchors = [];
function measure() {
    anchors = events.map((el) => {
        const r = el.getBoundingClientRect();
        return { y: r.top + scrollY + Math.min(r.height, innerHeight) * 0.3, t: parseLocal(el.dataset.at).getTime() };
    });
}

function targetTime() {
    const probe = scrollY + innerHeight * 0.65;
    if (probe <= anchors[0].y) return anchors[0].t;
    for (let i = 1; i < anchors.length; i++) {
        if (probe < anchors[i].y) {
            const a = anchors[i - 1], b = anchors[i];
            return a.t + (b.t - a.t) * ((probe - a.y) / (b.y - a.y));
        }
    }
    return anchors[anchors.length - 1].t;
}

let shownTime = parseLocal(events[0].dataset.at).getTime();
function paintSky(time) {
    const { alt, az } = sunPosition(new Date(time));
    const [top, bot] = skyAt(alt);
    root.style.setProperty('--sky-top', css(top));
    root.style.setProperty('--sky-bot', css(bot));
    // map the summer sun's sweep (NE → S → NW) across the screen
    const x = 6 + ((Math.min(Math.max(az, 30), 330) - 30) / 300) * 88;
    const y = 90 - Math.max(alt, -10) * 1.45;
    root.style.setProperty('--sun-x', `${x.toFixed(2)}%`);
    root.style.setProperty('--sun-y', `${y.toFixed(2)}%`);
    root.style.setProperty('--sun-glow', Math.max(0, Math.min(0.75, 0.75 - Math.abs(alt - 3) / 30)).toFixed(3));
    root.style.setProperty('--sun-color', alt < 8 ? '#ffc98a' : '#fff1cf');
    const dark = alt < -0.5;
    root.style.setProperty('--sky-ink', dark ? '#f6f1e7' : '#1c2347');
    root.style.setProperty('--sky-ink-soft', dark ? 'rgba(246,241,231,.82)' : 'rgba(28,35,71,.74)');
    root.style.setProperty('--sky-shadow', dark ? '0 1px 14px rgba(16, 20, 52, 0.55)' : 'none');
    root.style.setProperty('--trees', css(mix([20, 32, 34], bot, dark ? 0.12 : 0.28)));
    sunEl.style.opacity = alt < -1.5 ? '0' : '1';
}

let treesW = 0;
function drawTrees() {
    const svg = document.getElementById('trees');
    // draw in a coordinate space matching the band's real proportions,
    // so spruces keep their shape on narrow phones
    const W = Math.round(120 * Math.max(4, svg.clientWidth / Math.max(1, svg.clientHeight)));
    if (W === treesW) return;
    treesW = W;
    svg.setAttribute('viewBox', `0 0 ${W} 120`);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let d = 'M0 120 ';
    let x = -10;
    while (x < W + 20) {
        const h = 40 + rnd() * 60 + (Math.sin(x * 0.004) + 1) * 12;
        const w = h * (0.22 + rnd() * 0.12);
        const tiers = 5 + Math.floor(rnd() * 3);
        const base = 120;
        d += `L${x.toFixed(1)} ${base} `;
        // stepped spruce: zig-zag up one side, down the other
        for (let i = 0; i < tiers; i++) {
            const t0 = i / tiers, t1 = (i + 1) / tiers;
            const yo = base - h * t0 * 0.95, yi = base - h * t1 * 0.95;
            d += `L${(x + w * 0.5 * t0 - w * 0.08).toFixed(1)} ${(yo - h * 0.04).toFixed(1)} L${(x + w * 0.5 * t1).toFixed(1)} ${yi.toFixed(1)} `;
        }
        d += `L${(x + w / 2).toFixed(1)} ${(base - h).toFixed(1)} `;
        for (let i = tiers - 1; i >= 0; i--) {
            const t0 = (i + 1) / tiers, t1 = i / tiers;
            const yo = base - h * t0 * 0.95, yi = base - h * t1 * 0.95;
            d += `L${(x + w - w * 0.5 * t0).toFixed(1)} ${yo.toFixed(1)} L${(x + w - w * 0.5 * t1 + w * 0.08).toFixed(1)} ${(yi - h * 0.04).toFixed(1)} `;
        }
        d += `L${(x + w).toFixed(1)} ${base} `;
        x += w * (0.32 + rnd() * 0.34);
    }
    d += `L${W + 20} 120 Z`;
    // solid forest floor so nothing shows through low between trunks
    svg.innerHTML = `<path d="${d}"/><rect x="-20" y="78" width="${W + 40}" height="44"/>`;
}

let ticking = false;
function frame() {
    const target = targetTime();
    const k = reduceMotion ? 1 : 0.14;
    shownTime += (target - shownTime) * k;
    if (Math.abs(target - shownTime) < 20000) shownTime = target;
    paintSky(shownTime);
    if (shownTime !== target) requestAnimationFrame(frame);
    else ticking = false;
}
function kick() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

addEventListener('scroll', kick, { passive: true });
addEventListener('resize', () => { drawTrees(); measure(); kick(); });
drawTrees();
measure();
paintSky(targetTime());
// fonts and lazy images shift layout; re-measure once things settle
document.fonts?.ready.then(() => { measure(); kick(); });
addEventListener('load', () => { measure(); kick(); });


/* ---------- Menu ----------
   One long page; the links scroll to each part. Svar is its own page
   (/svar/), and old links to #svar are sent there. */
if (location.hash === '#svar') location.replace('svar/');
if (location.hash === '#gave') history.replaceState(null, '', '#onskeliste');

// underline the part of the page you are reading
const navLinks = [...document.querySelectorAll('.tabbar a[href^="#"]')];
const sections = navLinks.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
function markCurrent() {
    const probe = innerHeight * 0.35;
    let current = sections[0];
    for (const sec of sections) if (sec.getBoundingClientRect().top <= probe) current = sec;
    navLinks.forEach((a, i) => {
        if (sections[i] === current) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
    });
}
addEventListener('scroll', markCurrent, { passive: true });
markCurrent();

// a link straight to a part (#program, #praktisk) can land short when the
// display fonts and photos finish loading after the jump; aim again then
addEventListener('load', async () => {
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (!target) return;
    await document.fonts?.ready;
    requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant' }));
});

/* ---------- Countdown to check-in, Friday 17.00 ---------- */
const countdown = document.getElementById('countdown');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function renderCountdown() {
    let ms = CHECK_IN - Date.now();
    if (ms <= 0) { countdown.textContent = ''; return; }
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000);
    countdown.textContent = `${plural(d, 'dag', 'dager')}, ${plural(h, 'time', 'timer')} og ${plural(m, 'minutt', 'minutter')} til innsjekk`;
}
renderCountdown();
setInterval(renderCountdown, 30000);

/* ---------- Pakkeliste (remembered per device) ---------- */
const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const packed = store.get('kh-pakkeliste') || {};
document.querySelectorAll('#pakkeliste input').forEach((box) => {
    box.checked = !!packed[box.id];
    box.addEventListener('change', () => {
        packed[box.id] = box.checked;
        store.set('kh-pakkeliste', packed);
    });
});
