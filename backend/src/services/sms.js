/**
 * SMS delivery via Twilio's REST API (no SDK — a single fetch). Used to text a
 * recipient their portal link. Graceful no-op when not configured, so the rest of
 * a campaign still runs.
 *
 * Env (set on Railway / on-prem):
 *   TWILIO_ACCOUNT_SID              required (starts "AC…")
 *   TWILIO_AUTH_TOKEN              required
 *   TWILIO_FROM (or SMS_FROM)       a Twilio number "+44…" or an Alphanumeric Sender ID
 *   TWILIO_MESSAGING_SERVICE_SID    alternative to FROM (starts "MG…") — used if set
 */
function smsConfigured() {
  const hasSender = !!(process.env.TWILIO_FROM || process.env.SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && hasSender)
}

// Best-effort E.164 normalisation. Twilio requires "+<countrycode>…".
// Defaults bare/leading-0 numbers to UK (+44) — override by storing full E.164.
function normalizePhone(raw) {
  let p = String(raw || '').trim().replace(/[\s()\-.]/g, '')
  if (!p) return ''
  if (p.startsWith('+')) return p
  if (p.startsWith('00')) return '+' + p.slice(2)
  if (p.startsWith('0')) return '+44' + p.slice(1)
  return '+' + p
}

/**
 * @returns {Promise<{ok:boolean, error?:string, skipped?:boolean}>}
 */
async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM || process.env.SMS_FROM
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!sid || !token || (!from && !msid)) {
    console.warn('[sms] not configured — skipping SMS to', to)
    return { ok: false, skipped: true, error: 'SMS is not configured' }
  }
  const dest = normalizePhone(to)
  if (!dest) return { ok: false, error: 'No phone number' }

  const params = new URLSearchParams({ To: dest, Body: body })
  if (msid) params.set('MessagingServiceSid', msid)
  else params.set('From', from)

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { const j = await res.json(); if (j.message) msg = j.message + (j.code ? ` (code ${j.code})` : '') } catch { /* keep msg */ }
      console.error('[sms] send failed:', msg)
      return { ok: false, error: msg }
    }
    return { ok: true }
  } catch (e) {
    console.error('[sms] error:', e.message)
    return { ok: false, error: e.message }
  }
}

module.exports = { sendSms, smsConfigured, normalizePhone }
