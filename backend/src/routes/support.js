/**
 * Support requests — a logged-in user sends a message to the provider's support
 * inbox. Emailed with the user + tenant context; reply-to is the user so support
 * can reply straight back.
 */
const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const { deliver } = require('../services/email')

router.use(requireAuth)

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// GET /api/support — where should the UI point people?
router.get('/', (req, res) => {
  res.json({ supportEmail: process.env.SUPPORT_EMAIL || 'support@sol-iq.co.uk' })
})

// POST /api/support — { subject, message }
router.post('/', async (req, res) => {
  const subject = (req.body.subject || '').trim()
  const message = (req.body.message || '').trim()
  if (!message) return res.status(400).json({ error: 'Please describe how we can help' })

  const to = process.env.SUPPORT_EMAIL || 'support@sol-iq.co.uk'
  const u = req.user
  const who = u.name || u.email
  const html = `
    <p><strong>Support request via Mail-IQ</strong></p>
    <table style="font-size:14px;color:#334">
      <tr><td style="padding:2px 12px 2px 0;color:#889">From</td><td>${esc(who)} &lt;${esc(u.email)}&gt;</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#889">Organisation</td><td>${esc(u.tenant?.name || '')}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#889">Role</td><td>${esc(u.role)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#889">Subject</td><td>${esc(subject) || '(none)'}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #e5e4ef;margin:14px 0">
    <p style="white-space:pre-wrap;font-size:14px;color:#223">${esc(message)}</p>`

  const sent = await deliver({
    to,
    subject: `[Mail-IQ Support] ${subject || 'Request'}${u.tenant?.name ? ' — ' + u.tenant.name : ''}`,
    html,
    replyTo: u.email,
  })
  if (!sent) return res.status(502).json({ error: 'Could not send your message right now. Please email us directly.' })
  res.json({ ok: true })
})

module.exports = router
