/**
 * Email delivery. One transport is chosen automatically:
 *   1. SMTP (nodemailer)  — when SMTP_HOST is set (on-prem / customer mail server)
 *   2. Resend             — when RESEND_API_KEY is set (SaaS)
 *   3. none               — logged and skipped (dev / not configured)
 *
 * All three message types build their HTML and hand it to deliver().
 */
const { Resend } = require('resend')

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = `${process.env.FROM_NAME || 'Mail-IQ'} <${process.env.FROM_EMAIL || 'noreply@mailiq.app'}>`
const API_URL = process.env.API_URL || 'http://localhost:3002'

// Lazily-built SMTP transport (only when configured, so nodemailer isn't required otherwise).
let _smtp
function smtpTransport() {
  if (_smtp !== undefined) return _smtp
  if (!process.env.SMTP_HOST) { _smtp = null; return _smtp }
  const nodemailer = require('nodemailer')
  const port = Number(process.env.SMTP_PORT || 587)
  _smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  return _smtp
}

// Send one message via whichever transport is configured. Returns true on success.
async function deliver({ to, subject, html }) {
  const recipients = Array.isArray(to) ? to : [to]
  const smtp = smtpTransport()
  if (smtp) {
    try { await smtp.sendMail({ from: FROM, to: recipients.join(', '), subject, html }); return true }
    catch (e) { console.error('[email] SMTP send failed:', e.message); return false }
  }
  if (resend) {
    const result = await resend.emails.send({ from: FROM, to: recipients, subject, html })
    if (result.error) console.error('[email] Resend error:', result.error)
    return !result.error
  }
  console.warn(`[email] No transport configured (set SMTP_HOST or RESEND_API_KEY) — skipping: "${subject}"`)
  return false
}

/**
 * Send a dispatch document digitally.
 * Uses a tracking link rather than an attachment so opens can be recorded.
 */
async function sendDispatchEmail(dispatch, recipient, digitalSend, tenant) {
  // Link to the recipient portal (view + download + upload back). Falls back to
  // the raw tracking URL if no portal URL is configured.
  const portalBase = process.env.PORTAL_URL
  const trackingUrl = portalBase
    ? `${portalBase.replace(/\/$/, '')}/p/${digitalSend.trackingToken}`
    : `${API_URL}/api/track/${digitalSend.trackingToken}`
  const recipientName = [recipient?.firstName, recipient?.lastName].filter(Boolean).join(' ') || 'Customer'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:${tenant?.brandColor || '#7c3aed'};padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:18px;">${tenant?.name || 'Mail-IQ'}</h1>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 16px 0;">Dear ${recipientName},</p>
    <p style="margin:0 0 16px 0;">
      Please find your document attached below. Click the button to view and download your document securely.
    </p>
    ${dispatch.reference ? `<p style="margin:0 0 16px 0;color:#64748b;font-size:13px;">Reference: <strong>${dispatch.reference}</strong></p>` : ''}
    <div style="text-align:center;margin:28px 0;">
      <a href="${trackingUrl}"
         style="background:${tenant?.brandColor || '#7c3aed'};color:white;padding:12px 28px;
                border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;
                display:inline-block;">
        View Your Document
      </a>
    </div>
    <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px;">
      This link is unique to you. If you did not expect this document, please contact us.
    </p>
  </div>
</body>
</html>`

  return deliver({ to: digitalSend.toEmail, subject: digitalSend.subject, html })
}

/**
 * Send a forgot-password temporary password email.
 */
async function sendPasswordResetEmail(user, tenant, tempPassword) {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000'
  const loginUrl = `${portalUrl}/login`
  const brandColor = tenant?.brandColor || '#7c3aed'
  const orgName = tenant?.name || 'Mail-IQ'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:${brandColor};padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:18px;">${orgName}</h1>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 16px 0;">${user.name ? `Hi ${user.name},` : 'Hi,'}</p>
    <p style="margin:0 0 16px 0;">
      Use the temporary password below to sign in — you'll be asked to set your own password right away.
    </p>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:16px 20px;margin:0 0 20px 0;">
      <p style="margin:2px 0;font-size:14px;">Email: <strong>${user.email}</strong></p>
      <p style="margin:2px 0;font-size:14px;">Temporary password: <strong style="font-family:monospace;">${tempPassword}</strong></p>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${loginUrl}"
         style="background:${brandColor};color:white;padding:12px 28px;
                border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;
                display:inline-block;">
        Sign in
      </a>
    </div>
    <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px;">
      If you didn't request this, please contact your administrator immediately.
    </p>
  </div>
</body>
</html>`

  return deliver({ to: user.email, subject: `Your ${orgName} password has been reset`, html })
}

/**
 * Send a new-user invite with a temporary password.
 * They're forced to set their own password on first login.
 */
async function sendInviteEmail(user, tenant, tempPassword, invitedByName) {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000'
  const loginUrl = `${portalUrl}/login`
  const brandColor = tenant?.brandColor || '#7c3aed'
  const orgName = tenant?.name || 'Mail-IQ'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:${brandColor};padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:18px;">${orgName}</h1>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 16px 0;">${user.name ? `Hi ${user.name},` : 'Hi,'}</p>
    <p style="margin:0 0 16px 0;">
      ${invitedByName ? `${invitedByName} has` : 'You have been'} invited you to <strong>${orgName}</strong> on Mail-IQ.
      Use the temporary password below to sign in — you'll set your own password right away.
    </p>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:16px 20px;margin:0 0 20px 0;">
      <p style="margin:2px 0;font-size:14px;">Email: <strong>${user.email}</strong></p>
      <p style="margin:2px 0;font-size:14px;">Temporary password: <strong style="font-family:monospace;">${tempPassword}</strong></p>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${loginUrl}"
         style="background:${brandColor};color:white;padding:12px 28px;
                border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;
                display:inline-block;">
        Sign in
      </a>
    </div>
    <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px;">
      If you weren't expecting this invitation, you can ignore this email.
    </p>
  </div>
</body>
</html>`

  return deliver({ to: user.email, subject: `You've been invited to ${orgName} on Mail-IQ`, html })
}

module.exports = { sendDispatchEmail, sendPasswordResetEmail, sendInviteEmail, deliver }
