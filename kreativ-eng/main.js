// Kjersti & Håkon — kreativ versjon

const PRICE_PER_PERSON = 1500;
const WEDDING = new Date('2027-06-26T13:00:00+02:00');
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

const DAYS = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
function osloParts(date) {
    const f = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
    const wd = parts.weekday.charAt(0).toUpperCase() + parts.weekday.slice(1);
    return { weekday: wd, time: `${parts.hour}.${parts.minute}` };
}
// data-at values are Oslo local time in June (CEST, UTC+2)
const parseLocal = (s) => new Date(`${s}:00+02:00`);

/* ======================================================================
   Hero meadow
   ====================================================================== */
const hero = document.querySelector('.hero');
const canvas = document.getElementById('meadow');
const heroCopy = document.getElementById('hero-copy');
const hint = document.getElementById('hero-hint');
let meadow = null;

function useFallback() {
    const img = document.getElementById('meadow-fallback');
    img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    hero.classList.add('no-webgl');
}

function webglOk() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

if (webglOk()) {
    const lowPower = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
    import('./meadow.js').then(({ createMeadow }) => {
        meadow = createMeadow(canvas, { lowPower, reducedMotion: reduceMotion });
        if (location.search.includes('still')) { meadow.renderOnce(); return; } // for screenshots
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !document.hidden) meadow.start(); else meadow.stop(); });
        io.observe(hero);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) meadow.stop();
            else if (hero.getBoundingClientRect().bottom > 0) meadow.start();
        });
        if (reduceMotion) meadow.renderOnce();
    }).catch((err) => { console.error(err); useFallback(); });
} else {
    useFallback();
}

let hintTimer = setTimeout(() => hint.classList.add('is-gone'), 9000);
hero.addEventListener('pointermove', () => {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('is-gone'), 3500);
}, { passive: true, once: true });

/* ======================================================================
   Scroll: top bar, programme sky
   ====================================================================== */
const topbar = document.getElementById('topbar');
const program = document.getElementById('program');
const events = [...program.querySelectorAll('[data-at]')];
const root = document.documentElement;
const sunEl = document.getElementById('sun');
const dialSun = document.getElementById('dial-sun');
const readTime = document.getElementById('readout-time');
const readSun = document.getElementById('readout-sun');

let anchors = [];
function measure() {
    anchors = events.map((el) => {
        const r = el.getBoundingClientRect();
        return { y: r.top + scrollY + Math.min(r.height, innerHeight) * 0.3, t: parseLocal(el.dataset.at).getTime() };
    });
}

function targetTime() {
    const probe = scrollY + innerHeight * 0.4;
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
let lastLabel = '';
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
    const dark = alt < 2.5;
    root.style.setProperty('--sky-ink', dark ? '#f6f1e7' : '#1c2347');
    root.style.setProperty('--sky-ink-soft', dark ? 'rgba(246,241,231,.78)' : 'rgba(28,35,71,.74)');
    root.style.setProperty('--trees', css(mix([20, 32, 34], bot, dark ? 0.12 : 0.28)));
    sunEl.style.opacity = alt < -1.5 ? '0' : '1';
    // little dial: semicircle, sun position by azimuth/altitude
    const da = ((Math.min(Math.max(az, 30), 330) - 30) / 300) * Math.PI;
    dialSun.setAttribute('cx', (32 - Math.cos(da) * 28).toFixed(1));
    dialSun.setAttribute('cy', (32 - Math.max(-4, alt) / 55 * 28).toFixed(1));
    const p = osloParts(new Date(time));
    const label = `${p.weekday} ${p.time}`;
    if (label !== lastLabel) {
        lastLabel = label;
        readTime.textContent = label;
        const deg = Math.round(Math.abs(alt));
        readSun.textContent = alt >= 0 ? `Sola står ${deg}° over horisonten` : `Sola er ${deg}° under horisonten`;
    }
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
function onScroll() {
    const y = scrollY;
    const h = hero.offsetHeight;
    const p = Math.min(1, y / h);
    if (meadow) meadow.setScroll(p);
    if (!reduceMotion) {
        heroCopy.style.transform = `translate3d(0, ${(-y * 0.25).toFixed(1)}px, 0)`;
        heroCopy.style.opacity = String(Math.max(0, 1 - p * 1.6));
    }
    topbar.classList.toggle('is-on', y > h * 0.75);
}

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

addEventListener('scroll', () => { onScroll(); kick(); }, { passive: true });
addEventListener('resize', () => { drawTrees(); measure(); kick(); });
drawTrees();
measure();
onScroll();
paintSky(targetTime());
// fonts and lazy images shift layout; re-measure once things settle
document.fonts?.ready.then(() => { measure(); kick(); });
addEventListener('load', () => { measure(); kick(); });

// Sunrise/sunset text for the wedding day, computed rather than typed
(function sunTimes() {
    let prev = sunPosition(parseLocal('2027-06-26T00:00')).alt, rise = null, set = null;
    for (let m = 1; m <= 1440; m++) {
        const t = parseLocal('2027-06-26T00:00').getTime() + m * 60000;
        const a = sunPosition(new Date(t)).alt;
        if (prev < -0.833 && a >= -0.833) rise = t;
        if (prev >= -0.833 && a < -0.833) set = t;
        prev = a;
    }
    if (rise) document.getElementById('sunrise').textContent = osloParts(new Date(rise)).time;
    if (set) document.getElementById('sunset').textContent = osloParts(new Date(set)).time;
})();

// Highlight current nav section
const navLinks = [...topbar.querySelectorAll('.topbar-links a')];
const navIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === `#${e.target.id}`));
    });
}, { rootMargin: '-45% 0px -50% 0px' });
['stedet', 'program', 'svar', 'gave'].forEach((id) => navIO.observe(document.getElementById(id)));

/* ======================================================================
   Countdown
   ====================================================================== */
const countdown = document.getElementById('countdown');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function renderCountdown() {
    let ms = WEDDING - Date.now();
    if (ms <= 0) { countdown.textContent = 'I dag sier vi ja.'; return; }
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000);
    countdown.textContent = `Om ${plural(d, 'dag', 'dager')}, ${plural(h, 'time', 'timer')} og ${plural(m, 'minutt', 'minutter')} sier vi ja på tunet.`;
}
renderCountdown();
setInterval(renderCountdown, 30000);

/* ======================================================================
   Pakkeliste
   ====================================================================== */
const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const packed = store.get('kh-pakk') || {};
document.querySelectorAll('#pakkeliste input').forEach((box) => {
    box.checked = !!packed[box.id];
    box.addEventListener('change', () => { packed[box.id] = box.checked; store.set('kh-pakk', packed); });
});

/* ======================================================================
   RSVP
   ====================================================================== */
const form = document.getElementById('rsvp');
const guestsEl = document.getElementById('guests');
const errorEl = document.getElementById('rsvp-error');
const doneEl = document.getElementById('rsvp-done');
const tally = document.getElementById('tally');
const summaryEl = document.getElementById('rsvp-summary');
const submitBtn = document.getElementById('rsvp-submit');
let seq = 0;

function guestHTML(n) {
    const id = `g${n}`;
    return `
    <div class="guest">
        <div class="guest-head"><h3>Gjest</h3>${n ? '<button type="button" class="guest-remove">Fjern gjest</button>' : ''}</div>
        <div class="row-2">
            <div class="field"><label for="${id}-first">Fornavn</label><input type="text" id="${id}-first" name="first_name" autocomplete="${n ? 'off' : 'given-name'}" /></div>
            <div class="field"><label for="${id}-last">Etternavn</label><input type="text" id="${id}-last" name="last_name" autocomplete="${n ? 'off' : 'family-name'}" /></div>
        </div>
        <fieldset class="field">
            <legend>Kommer du?</legend>
            <div class="choices" data-group="attending">
                <label class="choice"><input type="radio" name="${id}-att" value="yes" /><span>Ja, gleder meg</span></label>
                <label class="choice"><input type="radio" name="${id}-att" value="no" /><span>Nei, dessverre</span></label>
            </div>
        </fieldset>
        <fieldset class="field" data-when="yes">
            <legend>Overnatting på Malungen, 1500 kr</legend>
            <div class="choices" data-group="stay">
                <label class="choice"><input type="radio" name="${id}-stay" value="yes" /><span>Ja, fredag til søndag</span></label>
                <label class="choice"><input type="radio" name="${id}-stay" value="no" /><span>Nei, ordner meg selv</span></label>
            </div>
        </fieldset>
        <div class="field" data-when="yes"><label for="${id}-allergies">Allergier eller matpreferanser</label><textarea id="${id}-allergies" name="allergies" rows="2" placeholder="F.eks. glutenfri, vegetar"></textarea></div>
    </div>`;
}

function sync(guest) {
    const att = guest.querySelector('[data-group="attending"] input:checked')?.value;
    guest.querySelectorAll('[data-when="yes"]').forEach((el) => { el.hidden = att !== 'yes'; });
}

function renumber() {
    const all = guestsEl.querySelectorAll('.guest');
    all.forEach((g, i) => { g.querySelector('h3').textContent = all.length > 1 ? `Gjest ${i + 1}` : 'Gjest'; });
}

function addGuest() {
    guestsEl.insertAdjacentHTML('beforeend', guestHTML(seq++));
    const g = guestsEl.lastElementChild;
    sync(g);
    g.addEventListener('change', () => sync(g));
    g.querySelector('.guest-remove')?.addEventListener('click', () => { g.remove(); renumber(); updateTally(); });
    renumber();
    updateTally();
    return g;
}

function readForm() {
    return {
        email: form.email.value.trim(),
        message: form.message.value.trim(),
        guests: [...guestsEl.querySelectorAll('.guest')].map((g) => ({
            first_name: g.querySelector('[name="first_name"]').value.trim(),
            last_name: g.querySelector('[name="last_name"]').value.trim(),
            attending: g.querySelector('[data-group="attending"] input:checked')?.value ?? null,
            stay: g.querySelector('[data-group="stay"] input:checked')?.value ?? null,
            allergies: g.querySelector('[name="allergies"]').value.trim(),
        })),
    };
}

function updateTally() {
    const { guests } = readForm();
    const coming = guests.filter((g) => g.attending === 'yes');
    const staying = coming.filter((g) => g.stay === 'yes').length;
    document.getElementById('t-guests').textContent = guests.length;
    document.getElementById('t-coming').textContent = coming.length;
    document.getElementById('t-staying').textContent = staying;
    document.getElementById('t-price').textContent = `${(staying * PRICE_PER_PERSON).toLocaleString('nb-NO')} kr`;
}

function validate(data) {
    let first = null;
    const mark = (el, bad) => { el.setAttribute('aria-invalid', bad ? 'true' : 'false'); if (bad && !first) first = el; };
    guestsEl.querySelectorAll('.guest').forEach((g, i) => {
        const d = data.guests[i];
        mark(g.querySelector('[name="first_name"]'), !d.first_name);
        mark(g.querySelector('[name="last_name"]'), !d.last_name);
        const att = g.querySelector('[data-group="attending"]');
        att.classList.toggle('invalid', !d.attending);
        if (!d.attending && !first) first = att.querySelector('input');
        const stay = g.querySelector('[data-group="stay"]');
        const bad = d.attending === 'yes' && !d.stay;
        stay.classList.toggle('invalid', bad);
        if (bad && !first) first = stay.querySelector('input');
    });
    mark(form.email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email));
    return first;
}

// Hook for the real backend (Supabase insert + EmailJS, as on the
// Ragnhild & Vetle site). Replace the body when the project exists.
async function sendRsvp(data) {
    await new Promise((r) => setTimeout(r, 700));
    return data;
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') e.target.setAttribute('aria-invalid', 'false');
});
form.addEventListener('change', (e) => { e.target.closest('.choices')?.classList.remove('invalid'); updateTally(); });

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm();
    const bad = validate(data);
    if (bad) {
        errorEl.textContent = 'Noen felter mangler. Fyll inn navn og svar for hver gjest, og en gyldig e-postadresse.';
        errorEl.hidden = false;
        bad.focus();
        return;
    }
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender…';
    try {
        await sendRsvp(data);
        const staying = data.guests.filter((g) => g.attending === 'yes' && g.stay === 'yes').length;
        summaryEl.innerHTML = `<ul>${data.guests.map((g) => {
            const n = esc(`${g.first_name} ${g.last_name}`);
            if (g.attending !== 'yes') return `<li>${n} kommer ikke</li>`;
            return `<li>${n} kommer${g.stay === 'yes' ? ' og overnatter' : ''}${g.allergies ? ` (${esc(g.allergies)})` : ''}</li>`;
        }).join('')}</ul>${staying ? `<p>Overnatting: ${(staying * PRICE_PER_PERSON).toLocaleString('nb-NO')} kr. Merk overføringen med navn.</p>` : ''}<p>Bekreftelsen sendes til ${esc(data.email)}.</p>`;
        form.hidden = true;
        tally.hidden = true;
        doneEl.hidden = false;
        doneEl.focus();
    } catch (err) {
        console.error(err);
        errorEl.textContent = 'Svaret ble ikke sendt. Sjekk nettforbindelsen og prøv igjen.';
        errorEl.hidden = false;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send svar';
    }
});

document.getElementById('add-guest').addEventListener('click', () => addGuest().querySelector('input').focus());
document.getElementById('rsvp-again').addEventListener('click', () => {
    form.reset();
    guestsEl.innerHTML = '';
    seq = 0;
    addGuest();
    doneEl.hidden = true;
    form.hidden = false;
    tally.hidden = false;
    guestsEl.querySelector('input').focus();
});
addGuest();

/* ======================================================================
   Photo reel: drag to scroll with a mouse
   ====================================================================== */
const reel = document.getElementById('reel');
let drag = null;
reel.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    drag = { x: e.clientX, left: reel.scrollLeft };
    reel.setPointerCapture(e.pointerId);
    reel.classList.add('is-drag');
});
reel.addEventListener('pointermove', (e) => { if (drag) reel.scrollLeft = drag.left - (e.clientX - drag.x); });
const endDrag = () => { drag = null; reel.classList.remove('is-drag'); };
reel.addEventListener('pointerup', endDrag);
reel.addEventListener('pointercancel', endDrag);
