const { Resend } = require('resend')

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM = `${process.env.FROM_NAME || 'Jasmitan Mail'} <${process.env.FROM_EMAIL || 'noreply@mailiq.app'}>`
const API_URL = process.env.API_URL || 'http://localhost:3002'

/**
 * Send a dispatch document digitally.
 * Uses a tracking link rather than an attachment so opens can be recorded.
 *
 * @param {object} dispatch
 * @param {object} recipient
 * @param {object} digitalSend   - the DigitalSend record (contains trackingToken)
 * @param {object} tenant
 */
async function sendDispatchEmail(dispatch, recipient, digitalSend, tenant) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — skipping send')
    return false
  }

  const trackingUrl = `${API_URL}/api/track/${digitalSend.trackingToken}`
  const recipientName = [recipient?.firstName, recipient?.lastName].filter(Boolean).join(' ') || 'Customer'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:${tenant?.brandColor || '#7c3aed'};padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:18px;">${tenant?.name || 'Jasmitan Mail'}</h1>
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

  const result = await resend.emails.send({
    from:    FROM,
    to:      [digitalSend.toEmail],
    subject: digitalSend.subject,
    html,
  })

  return !result.error
}

/**
 * Send a forgot-password temporary password email.
 */
async function sendPasswordResetEmail(user, tenant, tempPassword) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — skipping password reset email')
    return false
  }

  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000'
  const loginUrl = `${portalUrl}/login`
  const brandColor = tenant?.brandColor || '#7c3aed'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:${brandColor};padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:18px;">Jasmitan Mail</h1>
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
        Sign in to Jasmitan Mail
      </a>
    </div>
    <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px;">
      If you didn't request this, please contact your administrator immediately.
    </p>
  </div>
</body>
</html>`

  const result = await resend.emails.send({
    from:    FROM,
    to:      [user.email],
    subject: 'Your Jasmitan Mail password has been reset',
    html,
  })

  return !result.error
}

module.exports = { sendDispatchEmail, sendPasswordResetEmail }
