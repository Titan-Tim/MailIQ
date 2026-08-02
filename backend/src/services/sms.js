/**
 * SMS delivery via Twilio's REST API (no SDK — a single fetch). Used to text a
 * recipient their portal link. Graceful no-op when not configured, so the rest of
 * a campaign still runs.
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (or SMS_FROM).
 */
function smsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.SMS_FROM))
}

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM || process.env.SMS_FROM
  if (!sid || !token || !from) { console.warn(`[sms] not configured (TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM) — skipping SMS to ${to}`); return false }
  if (!to) { console.warn('[sms] no phone number — skipping'); return false }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    })
    if (!res.ok) { console.error('[sms] send failed', res.status, (await res.text()).slice(0, 200)); return false }
    return true
  } catch (e) { console.error('[sms] error:', e.message); return false }
}

module.exports = { sendSms, smsConfigured }
