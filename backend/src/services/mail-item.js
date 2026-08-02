/**
 * Closed-loop returns. A document sent by a campaign carries a unique QR
 * (MAILIQ:ITEM:v1:<barcodeCode>). When it comes back — scanned by the inbound
 * mailroom (via='SCAN') or uploaded to the recipient portal (via='PORTAL') — we
 * match it to its Dispatch and mark it returned. Idempotent: the first return wins.
 */
const prisma = require('../db')
const { parseItemToken } = require('./composer')

// Mark a specific dispatch returned (first return wins). Both channels — the
// scanned QR (via='SCAN') and a portal upload (via='PORTAL') — flow through here.
async function markReturned(dispatch, via) {
  if (dispatch && !dispatch.returnedAt) {
    await prisma.dispatch.update({ where: { id: dispatch.id }, data: { returnedAt: new Date(), returnedVia: via } })
  }
  return dispatch
}

/**
 * @returns {Promise<object|null>} the matched Dispatch (with recipient + campaign), or null
 */
async function markReturnedByToken(tenantId, token, via = 'SCAN') {
  const code = parseItemToken(token)
  if (!code) return null
  const dispatch = await prisma.dispatch.findFirst({
    where: { barcodeCode: code, tenantId },
    include: { recipient: true, campaign: true },
  })
  if (!dispatch) return null
  return markReturned(dispatch, via)
}

module.exports = { markReturned, markReturnedByToken }
