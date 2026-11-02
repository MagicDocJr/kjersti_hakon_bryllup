// Sends the reply confirmation for the K&H wedding through Resend.
//
// The reply form calls this right after saving, with the reply's
// household_id. The function claims the reply (confirmation_sent_at), so
// each reply gets exactly one e-mail, and only within 15 minutes of being
// saved: the endpoint cannot be used to mail arbitrary addresses.
//
// Secrets (Supabase → Edge Functions → Secrets): RESEND_API_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const FROM = 'Kjersti og Håkon <vigifteross@kjerstioghakon.no>';
const COUPLE = 'kjerstioghakon@gmail.com';
const PRICE_PER_PERSON = 1600;
const ACCOUNT = '9492 08 35907';
const SITE = 'https://www.kjerstioghakon.no';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const kr = (n: number) => `${n.toLocaleString('nb-NO')} kr`;

type Row = {
    first_name: string; last_name: string; email: string | null;
    attending: boolean; stay: boolean | null; paid_lodging: boolean | null;
    allergies: string | null; message: string | null; created_at: string;
};

const SUBJECT = 'Tusen takk for registreringen din';

// Readable on a phone: large text, one person per block with a thin line
// between, payment details on their own lines, signed by the couple.
function emailHtml(rows: Row[]) {
    const label = 'font-family:Arial,sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#5a534d';
    const people = rows.map((r, i) => {
        const status = !r.attending ? 'Kommer ikke' : r.stay ? 'Kommer · Sover over' : 'Kommer · Sover ikke over';
        const extra = [
            r.attending && r.allergies ? `Mat: ${esc(r.allergies)}` : '',
            r.message ? `Kommentar: ${esc(r.message)}` : '',
        ].filter(Boolean).map((t) => `<br><span style="color:#5a534d">${t}</span>`).join('');
        const top = i ? 'border-top:1px solid #ece6dc;' : '';
        return `<p style="margin:0;padding:14px 0;${top}"><strong style="font-size:18px">${esc(`${r.first_name} ${r.last_name}`)}</strong><br>${status}${extra}</p>`;
    }).join('');
    const staying = rows.filter((r) => r.attending && r.stay).length;
    const paid = rows.some((r) => r.paid_lodging === true);
    const pay = !staying ? ''
        : paid ? '<p style="margin:20px 0 0">Takk for at dere har betalt for overnatting.</p>'
        : `<div style="margin:20px 0 0;padding:16px 18px;background:#eef4fc;border-radius:8px">
        <p style="margin:0 0 10px;${label}">Husk å betale for overnatting</p>
        <p style="margin:0">Beløp: <strong>${kr(staying * PRICE_PER_PERSON)}</strong><br>Kontonummer: <strong>${ACCOUNT}</strong></p>
        <p style="margin:10px 0 0"><strong>VIKTIG:</strong> Dere må legge inn navnet på hver enkelt når dere overfører for overnatting.</p>
      </div>`;
    return `<div style="background:#f3efe6;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#2b2724">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:34px 28px;font-size:17px;line-height:1.6">
    <p style="margin:0 0 6px;${label}">Kjersti &amp; Håkon · 25.–27. juni 2027</p>
    <h1 style="margin:0 0 26px;font-size:28px;line-height:1.2;font-weight:normal">${SUBJECT}</h1>
    <p style="margin:0 0 4px;${label}">Svaret ditt</p>
    <div style="border-top:1px solid #e4ddd2;border-bottom:1px solid #e4ddd2">${people}</div>
    ${pay}
    <p style="margin:26px 0 0"><a href="${SITE}/" style="display:inline-block;background:#2b2724;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;text-transform:uppercase;padding:13px 24px;border-radius:4px">Til nettsiden</a></p>
    <p style="margin:26px 0 0;font-size:15px;color:#5a534d;font-family:Arial,sans-serif">Endringer eller spørsmål? Svar på denne e-posten.</p>
    <p style="margin:30px 0 0">Vi gleder oss til å feire med dere!</p>
    <p style="margin:6px 0 0">Hilsen Kjersti og Håkon</p>
    <img src="${SITE}/assets/monogram-mail.png" width="44" height="47" alt="KH" style="display:block;margin:16px 0 0;border:0">
  </div>
</div>`;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    const { household_id } = await req.json().catch(() => ({}));
    if (typeof household_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(household_id)) return json({ error: 'household_id' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // claim the reply: only rows not yet confirmed, saved in the last 15 minutes
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: rows, error } = await sb.from('kh_responses')
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq('household_id', household_id).is('confirmation_sent_at', null).gte('created_at', since)
        .select('first_name, last_name, email, attending, stay, paid_lodging, allergies, message, created_at');
    if (error) return json({ error: 'db' }, 500);
    const to = rows?.find((r) => r.email)?.email;
    if (!rows?.length || !to) return json({ sent: false });
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: FROM,
            to: [to],
            bcc: [COUPLE],
            reply_to: COUPLE,
            subject: SUBJECT,
            html: emailHtml(rows as Row[]),
        }),
    });
    if (!res.ok) {
        // give the reply back so a retry can send it
        await sb.from('kh_responses').update({ confirmation_sent_at: null }).eq('household_id', household_id);
        console.error('resend', res.status, await res.text());
        return json({ sent: false, error: 'mail' }, 502);
    }
    return json({ sent: true, to });
});
