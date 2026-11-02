// Svarskjemaet, felles for alle versjonene av siden.
// Kept deliberately plain so every guest, whatever their age, can fill it in:
// one person per block, yes/no buttons, free text for food, nothing hidden
// behind jargon. Each version styles the same markup with its own CSS.

const PRICE_PER_PERSON = 1600;
const ACCOUNT = '9492 08 35907';

// Replies go to `kh_responses` in the shared Supabase project. The anon key
// is public by design: it can only INSERT into that table (no reads), see
// supabase/kh_responses.sql.
const SUPABASE_URL = 'https://bevrttmvumfodpkauiio.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJldnJ0dG12dW1mb2Rwa2F1aWlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MTE4NjksImV4cCI6MjA2NjE4Nzg2OX0.DEZl36UgcM_KOlnbVlxfIdW_ZRdmkAMbbdHfF3KLCyk';

const form = document.getElementById('rsvp');
const guestsEl = document.getElementById('guests');
const errorEl = document.getElementById('rsvp-error');
const doneEl = document.getElementById('rsvp-done');
const summaryEl = document.getElementById('rsvp-summary');
const submitBtn = document.getElementById('rsvp-submit');
const paidField = document.getElementById('paid-field');
let seq = 0;

// crypto.randomUUID only exists on https pages and newer browsers; some
// in-app browsers (Messenger, Instagram) lack it, so build one by hand there
function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const kr = (n) => `${n.toLocaleString('nb-NO')} kr`;
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function guestHTML(n) {
    const id = `g${n}`;
    return `
    <div class="guest">
        <div class="guest-head">
            <h3>Person 1</h3>
            ${n ? '<button type="button" class="guest-remove">Fjern</button>' : ''}
        </div>
        <div class="row-2">
            <div class="field">
                <label for="${id}-first">Fornavn</label>
                <input type="text" id="${id}-first" name="first_name" autocomplete="${n ? 'off' : 'given-name'}" />
            </div>
            <div class="field">
                <label for="${id}-last">Etternavn</label>
                <input type="text" id="${id}-last" name="last_name" autocomplete="${n ? 'off' : 'family-name'}" />
            </div>
        </div>
        <fieldset class="field">
            <legend>Kommer du?</legend>
            <div class="choices" data-group="attending">
                <label class="choice"><input type="radio" name="${id}-attending" value="yes" /><span>Ja</span></label>
                <label class="choice"><input type="radio" name="${id}-attending" value="no" /><span>Nei</span></label>
            </div>
        </fieldset>
        <fieldset class="field" data-when="yes">
            <legend>Skal du sove over?</legend>
            <p class="hint">Fredag til søndag, ${kr(PRICE_PER_PERSON)} per gjest.</p>
            <div class="choices" data-group="stay">
                <label class="choice"><input type="radio" name="${id}-stay" value="yes" /><span>Ja</span></label>
                <label class="choice"><input type="radio" name="${id}-stay" value="no" /><span>Nei</span></label>
            </div>
        </fieldset>
        <div class="field" data-when="yes">
            <label for="${id}-allergies">Er det mat du ikke tåler? <span class="opt">(valgfritt)</span></label>
            <input type="text" id="${id}-allergies" name="allergies" autocomplete="off" />
        </div>
        <div class="field">
            <label for="${id}-comment">Kommentar <span class="opt">(valgfritt)</span></label>
            <textarea id="${id}-comment" name="comment" rows="2"></textarea>
        </div>
    </div>`;
}

function readForm() {
    return {
        email: form.email.value.trim(),
        paid: form.querySelector('[data-group="paid"] input:checked')?.value ?? null,
        guests: [...guestsEl.querySelectorAll('.guest')].map((g) => ({
            first_name: g.querySelector('[name="first_name"]').value.trim(),
            last_name: g.querySelector('[name="last_name"]').value.trim(),
            attending: g.querySelector('[data-group="attending"] input:checked')?.value ?? null,
            stay: g.querySelector('[data-group="stay"] input:checked')?.value ?? null,
            allergies: g.querySelector('[name="allergies"]').value.trim(),
            comment: g.querySelector('[name="comment"]').value.trim(),
        })),
    };
}

const stayingCount = (data) => data.guests.filter((g) => g.attending === 'yes' && g.stay === 'yes').length;

// follow-up questions show only once they matter
function sync() {
    guestsEl.querySelectorAll('.guest').forEach((g, i, all) => {
        const attending = g.querySelector('[data-group="attending"] input:checked')?.value;
        g.querySelectorAll('[data-when="yes"]').forEach((el) => { el.hidden = attending !== 'yes'; });
        g.querySelector('h3').textContent = all.length > 1 ? `Person ${i + 1}` : 'Deg';
    });
    const staying = stayingCount(readForm());
    paidField.hidden = staying === 0;
    document.getElementById('paid-sum').textContent = kr(Math.max(staying, 1) * PRICE_PER_PERSON);
}

function addGuest() {
    guestsEl.insertAdjacentHTML('beforeend', guestHTML(seq++));
    const g = guestsEl.lastElementChild;
    g.querySelector('.guest-remove')?.addEventListener('click', () => { g.remove(); sync(); });
    sync();
    return g;
}

function validate(data) {
    let first = null;
    const flag = (el, bad) => {
        el.classList.toggle('invalid', bad);
        if (el.matches('input, textarea')) el.setAttribute('aria-invalid', bad ? 'true' : 'false');
        if (bad && !first) first = el.matches('input') ? el : el.querySelector('input');
    };
    guestsEl.querySelectorAll('.guest').forEach((g, i) => {
        const d = data.guests[i];
        flag(g.querySelector('[name="first_name"]'), !d.first_name);
        flag(g.querySelector('[name="last_name"]'), !d.last_name);
        flag(g.querySelector('[data-group="attending"]'), !d.attending);
        flag(g.querySelector('[data-group="stay"]'), d.attending === 'yes' && !d.stay);
    });
    flag(paidField.querySelector('.choices'), !paidField.hidden && !data.paid);
    // one address per reply, so the couple can reach everyone with updates
    flag(form.email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email));
    return first;
}

async function send(data) {
    const household_id = uuid();
    const rows = data.guests.map((g) => {
        const attending = g.attending === 'yes';
        const stay = attending && g.stay === 'yes';
        return {
            household_id,
            first_name: g.first_name,
            last_name: g.last_name,
            email: data.email || null,
            attending,
            stay: attending ? stay : null,
            paid_lodging: stay ? data.paid === 'yes' : null,
            allergies: attending && g.allergies ? g.allergies : null,
            message: g.comment || null,
        };
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/kh_responses`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`RSVP failed ${res.status}: ${await res.text()}`);
    return household_id;
}

// Asks the kh-confirm function (supabase/functions) to e-mail the guest a
// confirmation. It sends at most one per reply; a failure never undoes the
// reply, which is already saved.
async function sendConfirmation(household_id) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/kh-confirm`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id }),
    });
    if (!res.ok) throw new Error(`kh-confirm ${res.status}: ${await res.text()}`);
    return (await res.json()).sent === true;
}

function summary(data) {
    const items = data.guests.map((g) => {
        const name = esc(`${g.first_name} ${g.last_name}`);
        if (g.attending !== 'yes') return `<li>${name} kommer ikke</li>`;
        return `<li>${name} kommer og ${g.stay === 'yes' ? 'sover over' : 'sover ikke over'}</li>`;
    }).join('');
    const staying = stayingCount(data);
    const pay = !staying ? ''
        : data.paid === 'yes' ? `<p>Takk for at du har betalt for overnatting.</p>`
        : `<p>Husk å betale <strong>${kr(staying * PRICE_PER_PERSON)}</strong> for overnatting til kontonummer <strong>${ACCOUNT}</strong>. Dere må legge inn navnet på hver enkelt når dere overfører.</p>`;
    summaryEl.innerHTML = `<ul>${items}</ul>${pay}`;
}

form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') e.target.setAttribute('aria-invalid', 'false');
});
form.addEventListener('change', (e) => {
    e.target.closest('.choices')?.classList.remove('invalid');
    sync();
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm();
    const bad = validate(data);
    if (bad) {
        errorEl.textContent = 'Noe mangler. Fyll inn navn og svar for hver person, og e-posten din.';
        errorEl.hidden = false;
        bad.focus();
        return;
    }
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender…';
    try {
        const household_id = await send(data);
        summary(data);
        let mailed = false;
        try { mailed = await sendConfirmation(household_id); } catch (err) { console.error(err); }
        if (mailed) summaryEl.insertAdjacentHTML('beforeend', `<p>Vi har sendt en bekreftelse til <strong>${esc(data.email)}</strong>. Finner du den ikke, sjekk søppelposten.</p>`);
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

document.getElementById('add-guest').addEventListener('click', () => addGuest().querySelector('input').focus());
document.getElementById('rsvp-again').addEventListener('click', () => {
    form.reset();
    guestsEl.innerHTML = '';
    seq = 0;
    addGuest();
    doneEl.hidden = true;
    form.hidden = false;
    guestsEl.querySelector('input').focus();
});
addGuest();
