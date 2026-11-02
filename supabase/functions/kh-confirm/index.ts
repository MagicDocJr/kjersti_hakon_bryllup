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

function emailHtml(rows: Row[]) {
    const people = rows.map((r) => {
        const lines: string[] = [];
        if (!r.attending) lines.push('Kommer ikke');
        else {
            lines.push(r.stay ? 'Kommer og sover over' : 'Kommer, sover ikke over');
            if (r.allergies) lines.push(`Mat: ${esc(r.allergies)}`);
        }
        if (r.message) lines.push(`Kommentar: ${esc(r.message)}`);
        return `<p style="margin:0 0 14px"><strong>${esc(`${r.first_name} ${r.last_name}`)}</strong><br>${lines.join('<br>')}</p>`;
    }).join('');
    const staying = rows.filter((r) => r.attending && r.stay).length;
    const paid = rows.some((r) => r.paid_lodging === true);
    const pay = !staying ? ''
        : paid ? '<p style="margin:18px 0 0">Takk for at dere har betalt for overnatting.</p>'
        : `<p style="margin:18px 0 0;padding:12px 14px;background:#eef4fc;border-left:3px solid #b5442f">Husk å betale <strong>${kr(staying * PRICE_PER_PERSON)}</strong> for overnatting til kontonummer <strong>${ACCOUNT}</strong>.<br><strong>VIKTIG:</strong> Dere må legge inn navnet på hver enkelt når dere overfører for overnatting.</p>`;
    const name = esc(rows[0].first_name);
    return `<div style="background:#f3efe6;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#2b2724">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px 28px">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#5a534d;font-family:Arial,sans-serif">Kjersti &amp; Håkon · 25.–27. juni 2027</p>
    <h1 style="margin:0 0 24px;font-size:26px;font-weight:normal">Takk for svaret, ${name}!</h1>
    <p style="margin:0 0 12px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#5a534d;font-family:Arial,sans-serif">Svaret ditt</p>
    <div style="font-size:16px;line-height:1.5;padding:16px 0 4px;border-top:1px solid #e4ddd2">${people}${pay}</div>
    <p style="margin:24px 0 0"><a href="${SITE}/" style="display:inline-block;background:#2b2724;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;text-transform:uppercase;padding:12px 22px;border-radius:4px">Til nettsiden</a></p>
    <p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#5a534d;font-family:Arial,sans-serif">Endringer eller spørsmål? Svar på denne e-posten.</p>
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
            subject: 'Vi har fått svaret ditt – Kjersti og Håkon',
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
