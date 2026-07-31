/**
 * AURA HSE — Emergency Notify Worker  (Cloudflare Worker)
 *
 * Sends the emergency SMS FROM the project's Twilio number to every tagged
 * contact, instead of opening the reporter's personal Messages app.
 *
 * WHY THIS EXISTS AS A SEPARATE SERVICE
 * Twilio's Auth Token can never live in the directory itself — that code is
 * public and runs in the browser, so the token would be readable by anyone.
 * It lives here as an encrypted Cloudflare secret and never leaves the server.
 *
 * SECURITY DESIGN
 * The endpoint is public, so it is built so that abuse is pointless:
 *   - It accepts ONLY {"building":"DSM4"} or {"building":"DSM3"}.
 *     No caller-supplied phone numbers. No caller-supplied message text.
 *   - Recipients are read live from Firestore (the notifyDSM4 / notifyDSM3
 *     flags), so the directory stays the single source of truth.
 *   - The message body is fixed here, server-side.
 *   - Requests must come from the directory's own origin.
 *   - A cooldown blocks repeat sends to the same building.
 * Worst case, someone who finds the URL can trigger one genuine safety
 * notification to the HSE team — not arbitrary texts to arbitrary people.
 */

const ALLOWED_ORIGINS = [
  'https://bdiaz8448-gif.github.io'
];

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/aura-hse-directory/databases/(default)/documents/contacts?pageSize=1000';

const COOLDOWN_SECONDS = 45;   // stops accidental double-taps and abuse loops

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

/** Pull the tagged recipients straight from the live directory. */
async function getRecipients(building) {
  const field = building === 'DSM4' ? 'notifyDSM4' : 'notifyDSM3';
  const res = await fetch(FIRESTORE);
  if (!res.ok) throw new Error('Could not read the contact directory');
  const data = await res.json();

  const out = [];
  for (const doc of (data.documents || [])) {
    const f = doc.fields || {};
    if (!(f[field] && f[field].booleanValue === true)) continue;

    const raw = (f.cellPhone && f.cellPhone.stringValue) || '';
    const name = (f.name && f.name.stringValue) || 'Unknown';
    for (const part of raw.split('/')) {
      const digits = part.replace(/[^\d]/g, '');
      let e164 = null;
      if (digits.length === 10) e164 = '+1' + digits;
      else if (digits.length === 11 && digits[0] === '1') e164 = '+' + digits;
      if (e164 && !out.some(r => r.to === e164)) out.push({ to: e164, name });
    }
  }
  return out;
}

async function sendOne(env, to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  const j = await res.json().catch(() => ({}));
  return { to, ok: res.ok, error: res.ok ? null : (j.message || `HTTP ${res.status}`) };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: cors });
    }

    let building;
    try {
      building = (await request.json()).building;
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: cors });
    }
    if (building !== 'DSM4' && building !== 'DSM3') {
      return new Response(JSON.stringify({ error: 'building must be DSM4 or DSM3' }), { status: 400, headers: cors });
    }

    // Cooldown (only if a KV namespace named NOTIFY_KV is bound; optional)
    if (env.NOTIFY_KV) {
      const key = 'cooldown:' + building;
      if (await env.NOTIFY_KV.get(key)) {
        return new Response(JSON.stringify({
          error: 'A notification for this building was just sent. Wait a moment before sending again.'
        }), { status: 429, headers: cors });
      }
      await env.NOTIFY_KV.put(key, '1', { expirationTtl: COOLDOWN_SECONDS });
    }

    // Message text is fixed server-side — callers cannot supply their own.
    const body = `EMERGENCY reported at ${building} (Fujifilm Aura Project). Assistance needed immediately.`;

    let recipients;
    try {
      recipients = await getRecipients(building);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: cors });
    }
    if (!recipients.length) {
      return new Response(JSON.stringify({ error: `No contacts are tagged for ${building}` }), { status: 404, headers: cors });
    }

    const results = await Promise.all(recipients.map(r => sendOne(env, r.to, body)));
    const sent = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    return new Response(JSON.stringify({
      ok: sent.length > 0,
      building,
      sentCount: sent.length,
      failedCount: failed.length,
      sentTo: sent.map(r => r.to),
      failures: failed
    }), { status: sent.length ? 200 : 502, headers: cors });
  }
};
