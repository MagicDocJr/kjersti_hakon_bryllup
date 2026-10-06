// Kjersti & Håkon — klassisk versjon

const PRICE_PER_PERSON = 1500;
const WEDDING = new Date('2027-06-26T13:00:00+02:00');

/* ---------- Countdown ---------- */
const countdown = document.getElementById('countdown');
function renderCountdown() {
    const days = Math.ceil((WEDDING - Date.now()) / 86400000);
    if (days > 1) countdown.textContent = `${days} dager igjen`;
    else if (days === 1) countdown.textContent = 'I morgen!';
    else if (days === 0) countdown.textContent = 'I dag!';
    else countdown.textContent = '';
}
renderCountdown();

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

/* ---------- RSVP ---------- */
const form = document.getElementById('rsvp');
const guestsEl = document.getElementById('guests');
const errorEl = document.getElementById('rsvp-error');
const doneEl = document.getElementById('rsvp-done');
const summaryEl = document.getElementById('rsvp-summary');
const submitBtn = document.getElementById('rsvp-submit');
let guestSeq = 0;

function guestTemplate(n) {
    const id = `g${n}`;
    return `
    <div class="guest" data-guest="${id}">
        <div class="guest-head">
            <h3>Gjest</h3>
            ${n > 0 ? '<button type="button" class="guest-remove">Fjern</button>' : ''}
        </div>
        <div class="row-2">
            <div class="field">
                <label for="${id}-first">Fornavn</label>
                <input type="text" id="${id}-first" name="first_name" autocomplete="${n ? 'off' : 'given-name'}" required />
            </div>
            <div class="field">
                <label for="${id}-last">Etternavn</label>
                <input type="text" id="${id}-last" name="last_name" autocomplete="${n ? 'off' : 'family-name'}" required />
            </div>
        </div>
        <fieldset class="field">
            <legend>Kommer du?</legend>
            <div class="choices" data-group="attending">
                <label class="choice"><input type="radio" name="${id}-attending" value="yes" required /><span>Ja, gleder meg</span></label>
                <label class="choice"><input type="radio" name="${id}-attending" value="no" /><span>Nei, dessverre</span></label>
            </div>
        </fieldset>
        <fieldset class="field" data-when="yes">
            <legend>Overnatting på Malungen</legend>
            <div class="choices" data-group="stay">
                <label class="choice"><input type="radio" name="${id}-stay" value="yes" /><span>Ja, fredag til søndag</span></label>
                <label class="choice"><input type="radio" name="${id}-stay" value="no" /><span>Nei, jeg ordner meg selv</span></label>
            </div>
        </fieldset>
        <div class="field" data-when="yes">
            <label for="${id}-allergies">Allergier eller matpreferanser</label>
            <textarea id="${id}-allergies" name="allergies" rows="2" placeholder="F.eks. glutenfri, vegetar"></textarea>
        </div>
    </div>`;
}

function syncConditional(guest) {
    const attending = guest.querySelector('[data-group="attending"] input:checked')?.value;
    guest.querySelectorAll('[data-when="yes"]').forEach((el) => { el.hidden = attending !== 'yes'; });
}

function addGuest() {
    guestsEl.insertAdjacentHTML('beforeend', guestTemplate(guestSeq++));
    const guest = guestsEl.lastElementChild;
    syncConditional(guest);
    guest.addEventListener('change', () => syncConditional(guest));
    guest.querySelector('.guest-remove')?.addEventListener('click', () => guest.remove());
    renumber();
    return guest;
}

function renumber() {
    const all = guestsEl.querySelectorAll('.guest');
    all.forEach((g, i) => { g.querySelector('h3').textContent = all.length > 1 ? `Gjest ${i + 1}` : 'Gjest'; });
}

document.getElementById('add-guest').addEventListener('click', () => {
    const g = addGuest();
    g.querySelector('input').focus();
});
addGuest();

function readForm() {
    const email = form.email.value.trim();
    const message = form.message.value.trim();
    const guests = [...guestsEl.querySelectorAll('.guest')].map((g) => ({
        first_name: g.querySelector('[name="first_name"]').value.trim(),
        last_name: g.querySelector('[name="last_name"]').value.trim(),
        attending: g.querySelector('[data-group="attending"] input:checked')?.value ?? null,
        stay: g.querySelector('[data-group="stay"] input:checked')?.value ?? null,
        allergies: g.querySelector('[name="allergies"]').value.trim(),
    }));
    return { email, message, guests };
}

function validate(data) {
    let firstBad = null;
    const mark = (el, bad) => {
        el.setAttribute('aria-invalid', bad ? 'true' : 'false');
        if (bad && !firstBad) firstBad = el;
    };
    guestsEl.querySelectorAll('.guest').forEach((g, i) => {
        const d = data.guests[i];
        mark(g.querySelector('[name="first_name"]'), !d.first_name);
        mark(g.querySelector('[name="last_name"]'), !d.last_name);
        const att = g.querySelector('[data-group="attending"]');
        att.classList.toggle('invalid', !d.attending);
        if (!d.attending && !firstBad) firstBad = att.querySelector('input');
        const stay = g.querySelector('[data-group="stay"]');
        const stayBad = d.attending === 'yes' && !d.stay;
        stay.classList.toggle('invalid', stayBad);
        if (stayBad && !firstBad) firstBad = stay.querySelector('input');
    });
    const emailEl = form.email;
    mark(emailEl, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email));
    return firstBad;
}

// Hook for the real backend. In the Ragnhild & Vetle site this was a
// Supabase insert into `responses` plus an EmailJS confirmation; drop the
// same calls in here when the project is created.
async function sendRsvp(data) {
    await new Promise((r) => setTimeout(r, 600));
    return data;
}

function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderSummary(data) {
    const staying = data.guests.filter((g) => g.attending === 'yes' && g.stay === 'yes').length;
    const items = data.guests.map((g) => {
        const name = esc(`${g.first_name} ${g.last_name}`);
        if (g.attending !== 'yes') return `<li>${name} kommer ikke</li>`;
        const stay = g.stay === 'yes' ? 'overnatter' : 'overnatter ikke';
        const allergy = g.allergies ? ` (${esc(g.allergies)})` : '';
        return `<li>${name} kommer og ${stay}${allergy}</li>`;
    }).join('');
    const pay = staying
        ? `<p>Overnatting for ${staying} ${staying === 1 ? 'person' : 'personer'} blir <strong>${(staying * PRICE_PER_PERSON).toLocaleString('nb-NO')} kr</strong>. Merk overføringen med navn.</p>`
        : '';
    summaryEl.innerHTML = `<ul>${items}</ul>${pay}<p>Bekreftelsen sendes til ${esc(data.email)}.</p>`;
}

form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') e.target.setAttribute('aria-invalid', 'false');
});
form.addEventListener('change', (e) => {
    e.target.closest('.choices')?.classList.remove('invalid');
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm();
    const bad = validate(data);
    if (bad) {
        errorEl.textContent = 'Noen felter mangler. Fyll inn navn, e-post og svar for hver gjest.';
        errorEl.hidden = false;
        bad.focus();
        return;
    }
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender…';
    try {
        await sendRsvp(data);
        renderSummary(data);
        form.hidden = true;
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

document.getElementById('rsvp-again').addEventListener('click', () => {
    form.reset();
    guestsEl.innerHTML = '';
    guestSeq = 0;
    addGuest();
    doneEl.hidden = true;
    form.hidden = false;
    guestsEl.querySelector('input').focus();
});
