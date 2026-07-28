/**
 * Inbound routing engine + delivery — INBOUND module.
 *
 * Given an item's extracted fields, decide which Mailbox it belongs to:
 *   1. Evaluate active InboundRoutingRules (highest priority first).
 *   2. Fall back to matching a Mailbox by its keywords / name.
 *   3. Fall back to the tenant's default (catch-all) Mailbox.
 *   4. If nothing matches, or confidence is below threshold → TRIAGE.
 *
 * Every decision returns a human-readable `reason` for the audit trail.
 */
const { Resend } = require('resend')

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = `${process.env.FROM_NAME || 'Mail-IQ'} <${process.env.FROM_EMAIL || 'noreply@mailiq.app'}>`

// Below this combined confidence, always send to triage rather than auto-deliver.
const TRIAGE_THRESHOLD = Number(process.env.INBOUND_TRIAGE_THRESHOLD || 0.5)

function textOf(item) {
  return `${item.extractedName || ''} ${item.ocrText || ''}`.toLowerCase()
}

function ruleMatches(rule, item) {
  const hay = textOf(item)
  const conds = []
  if (rule.documentType) {
    conds.push((item.documentType || '').toLowerCase() === rule.documentType.toLowerCase())
  }
  if (rule.keyword) {
    conds.push(hay.includes(rule.keyword.toLowerCase()))
  }
  if (conds.length === 0) return false
  return rule.matchType === 'ALL' ? conds.every(Boolean) : conds.some(Boolean)
}

function mailboxKeywordMatch(mailbox, item) {
  const hay = textOf(item)
  const terms = [mailbox.name, mailbox.department, ...(mailbox.keywords || '').split(',')]
    .map((s) => (s || '').trim().toLowerCase())
    .filter(Boolean)
  return terms.some((term) => hay.includes(term))
}

/**
 * Decide routing for an item.
 * @param {object} item     InboundItem (with extracted fields populated)
 * @param {object[]} rules  active InboundRoutingRules for the tenant (any order)
 * @param {object[]} mailboxes active Mailboxes for the tenant
 * @returns {{ mailboxId: string|null, ruleId: string|null, reason: string,
 *             confidence: number, status: 'DELIVERED'|'TRIAGE' }}
 */
function decideRoute(item, rules, mailboxes) {
  const ocrConf = item.confidence || 0

  // 1. Rules, highest priority first.
  const ordered = [...rules].sort((a, b) => b.priority - a.priority)
  for (const rule of ordered) {
    if (!rule.targetMailboxId) continue
    if (ruleMatches(rule, item)) {
      const conf = Math.min(1, ocrConf + 0.2) // a matched rule adds confidence
      return {
        mailboxId: rule.targetMailboxId,
        ruleId: rule.id,
        reason: `Matched rule "${rule.name}" (${rule.documentType ? `type=${rule.documentType} ` : ''}${rule.keyword ? `keyword="${rule.keyword}"` : ''})`.trim(),
        confidence: Number(conf.toFixed(2)),
        status: conf >= TRIAGE_THRESHOLD ? 'DELIVERED' : 'TRIAGE',
      }
    }
  }

  // 2. Mailbox keyword match.
  const kwHit = mailboxes.find((m) => mailboxKeywordMatch(m, item))
  if (kwHit) {
    const conf = Math.min(1, ocrConf + 0.1)
    return {
      mailboxId: kwHit.id,
      ruleId: null,
      reason: `Keyword match on mailbox "${kwHit.name}"`,
      confidence: Number(conf.toFixed(2)),
      status: conf >= TRIAGE_THRESHOLD ? 'DELIVERED' : 'TRIAGE',
    }
  }

  // 3. Default catch-all mailbox.
  const fallback = mailboxes.find((m) => m.isDefault)
  if (fallback) {
    return {
      mailboxId: fallback.id,
      ruleId: null,
      reason: `No rule or keyword matched — sent to default mailbox "${fallback.name}"`,
      confidence: Number(ocrConf.toFixed(2)),
      // Default routing is low-trust: send to triage unless OCR was confident.
      status: ocrConf >= TRIAGE_THRESHOLD ? 'DELIVERED' : 'TRIAGE',
    }
  }

  // 4. Nothing matched.
  return {
    mailboxId: null,
    ruleId: null,
    reason: 'No matching rule, keyword, or default mailbox — needs manual routing',
    confidence: Number(ocrConf.toFixed(2)),
    status: 'TRIAGE',
  }
}

/**
 * Email an inbound item to its destination mailbox.
 * Uses a link back to the item in the portal rather than raw attachment.
 */
async function deliverToMailbox(item, mailbox, tenant) {
  if (!resend) {
    console.warn('[inbound] RESEND_API_KEY not configured — skipping delivery email')
    return false
  }
  const brand = tenant?.brandColor || '#7c3aed'
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000'
  const itemUrl = `${portalUrl}/dashboard/inbound/${item.id}`

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:${brand};padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:18px;">${tenant?.name || 'Mail-IQ'} · Mailroom</h1>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 12px 0;">A new piece of post has been routed to <strong>${mailbox.name}</strong>.</p>
    <table style="font-size:14px;border-collapse:collapse;margin:0 0 16px 0;">
      <tr><td style="color:#64748b;padding:2px 12px 2px 0;">Document</td><td><strong>${item.fileName}</strong></td></tr>
      <tr><td style="color:#64748b;padding:2px 12px 2px 0;">Type</td><td>${item.documentType || 'general'}</td></tr>
      <tr><td style="color:#64748b;padding:2px 12px 2px 0;">Addressed to</td><td>${item.extractedName || '—'}</td></tr>
      <tr><td style="color:#64748b;padding:2px 12px 2px 0;">Confidence</td><td>${Math.round((item.confidence || 0) * 100)}%</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="${itemUrl}" style="background:${brand};color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">View in Mailroom</a>
    </div>
  </div>
</body></html>`

  const result = await resend.emails.send({
    from: FROM,
    to: [mailbox.email],
    subject: `New post routed to ${mailbox.name}: ${item.documentType || 'document'}`,
    html,
  })
  return !result.error
}

module.exports = { decideRoute, deliverToMailbox, TRIAGE_THRESHOLD }
