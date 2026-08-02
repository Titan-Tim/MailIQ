/**
 * Campaigns (outbound mailshots) — mounted at /api/campaigns.
 *
 * A campaign = one base document sent to many recipients. On "generate" it fans
 * out to one Dispatch per recipient: each copy is personalised by the composer
 * (address + unique barcode + a unique return QR), inserts appended, then routed
 * to email or the print queue based on the recipient's delivery preference.
 * The per-copy QR lets returns be matched back through the inbound scanner (P2).
 */
const router = require('express').Router()
const multer = require('multer')
const { PDFDocument } = require('pdf-lib')
const prisma = require('../db')
const storage = require('../services/storage')
const composer = require('../services/composer')
const { sendDispatchEmail } = require('../services/email')
const { requireAuth, requireModule } = require('../middleware/auth')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDF files are accepted')),
})

router.use(requireAuth)
router.use(requireModule('outbound'))

// ── helpers (mirrors dispatches.js) ───────────────────────────────────────────
async function uniqueBarcodeCode() {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 12; attempt++) {
    let code = 'MQ-'
    for (let i = 0; i < 8; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)]
    if (!(await prisma.dispatch.findUnique({ where: { barcodeCode: code } }))) return code
  }
  throw new Error('Could not generate unique barcode code')
}
function resolveDeliveryMethod(recipient) {
  if (!recipient) return 'POST'
  if (recipient.deliveryMethod === 'DIGITAL') return recipient.email ? 'DIGITAL' : 'POST'
  if (recipient.deliveryMethod === 'POST') return 'POST'
  return recipient.email ? 'DIGITAL' : 'POST' // AUTO
}
async function addToOpenBatch(tenantId, dispatch) {
  let batch = await prisma.printBatch.findFirst({ where: { tenantId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } })
  if (!batch) {
    const label = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    batch = await prisma.printBatch.create({ data: { tenantId, name: `Print run — ${label}` } })
  }
  await prisma.printBatchItem.create({ data: { batchId: batch.id, dispatchId: dispatch.id, pageCount: dispatch.pageCount, order: batch.itemCount } })
  await prisma.printBatch.update({ where: { id: batch.id }, data: { itemCount: { increment: 1 }, totalPages: { increment: dispatch.pageCount } } })
}

const shape = (c) => ({
  id: c.id, name: c.name, baseFileName: c.baseFileName, subject: c.subject, addQr: c.addQr,
  status: c.status, createdAt: c.createdAt, count: c._count?.dispatches,
})

// ── list ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { dispatches: true } } },
  })
  // Returned counts per campaign (closed loop).
  const grouped = await prisma.dispatch.groupBy({
    by: ['campaignId'],
    where: { tenantId: req.user.tenantId, campaignId: { not: null }, returnedAt: { not: null } },
    _count: { _all: true },
  })
  const returnedMap = Object.fromEntries(grouped.map((g) => [g.campaignId, g._count._all]))
  res.json({ campaigns: campaigns.map((c) => ({ ...shape(c), returned: returnedMap[c.id] || 0 })) })
})

// ── detail (with per-recipient breakdown) ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  const c = await prisma.campaign.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      dispatches: {
        orderBy: { createdAt: 'asc' },
        include: {
          recipient: { select: { firstName: true, lastName: true, email: true, accountNumber: true } },
          digitalSend: { select: { emailSent: true, firstOpenedAt: true, openCount: true } },
        },
      },
    },
  })
  if (!c) return res.status(404).json({ error: 'Not found' })
  res.json(c)
})

// ── create (upload base document) ──────────────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' })
  const baseFileKey = await storage.saveFile(req.file.buffer, 'campaign')
  const campaign = await prisma.campaign.create({
    data: {
      tenantId: req.user.tenantId,
      name: (req.body.name || '').trim() || req.file.originalname.replace(/\.pdf$/i, ''),
      baseFileKey,
      baseFileName: req.file.originalname,
      subject: (req.body.subject || '').trim() || null,
      addQr: req.body.addQr !== 'false' && req.body.addQr !== false,
    },
    include: { _count: { select: { dispatches: true } } },
  })
  res.status(201).json(shape(campaign))
})

// ── generate & send (fan out to one dispatch per recipient) ────────────────────
router.post('/:id/generate', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } })
  if (!campaign) return res.status(404).json({ error: 'Not found' })
  if (campaign.status === 'SENT') return res.status(400).json({ error: 'This campaign has already been sent' })

  const { recipientIds, insertIds } = req.body
  const recipients = Array.isArray(recipientIds) && recipientIds.length
    ? await prisma.recipient.findMany({ where: { tenantId: req.user.tenantId, id: { in: recipientIds }, isActive: true } })
    : await prisma.recipient.findMany({ where: { tenantId: req.user.tenantId, isActive: true } })
  if (!recipients.length) return res.status(400).json({ error: 'No active recipients to send to' })

  const inserts = Array.isArray(insertIds) && insertIds.length
    ? await prisma.insert.findMany({ where: { tenantId: req.user.tenantId, id: { in: insertIds } } })
    : []

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENDING' } })
  const tenant = req.user.tenant
  let digital = 0, post = 0, failed = 0

  for (const r of recipients) {
    try {
      const barcodeCode = await uniqueBarcodeCode()
      let dispatch = await prisma.dispatch.create({
        data: {
          tenantId: req.user.tenantId, campaignId: campaign.id, recipientId: r.id,
          originalFileKey: campaign.baseFileKey, originalFileName: campaign.baseFileName,
          fileSizeBytes: 0, barcodeCode, documentType: 'campaign', reference: campaign.name, status: 'COMPOSING',
        },
      })
      for (let i = 0; i < inserts.length; i++) {
        await prisma.dispatchInsert.create({ data: { dispatchId: dispatch.id, insertId: inserts[i].id, order: i, source: 'campaign' } })
      }

      const composed = await composer.composeDispatch(dispatch, r, inserts, tenant, { qr: campaign.addQr })
      const composedFileKey = await storage.saveFile(composed, 'composed')
      let pageCount = 1
      try { pageCount = (await PDFDocument.load(composed)).getPageCount() } catch { /* keep 1 */ }

      const method = resolveDeliveryMethod(r)
      dispatch = await prisma.dispatch.update({
        where: { id: dispatch.id },
        data: { composedFileKey, composedAt: new Date(), status: 'READY', deliveryMethod: method, pageCount },
      })

      if (method === 'DIGITAL') {
        const ds = await prisma.digitalSend.create({
          data: { dispatchId: dispatch.id, toEmail: r.email, subject: campaign.subject || `Your document from ${tenant.name}` },
        })
        const sent = await sendDispatchEmail(dispatch, r, ds, tenant)
        await prisma.dispatch.update({ where: { id: dispatch.id }, data: { status: sent ? 'SENT' : 'QUEUED', sentAt: sent ? new Date() : null } })
        if (sent) await prisma.digitalSend.update({ where: { id: ds.id }, data: { emailSent: true, emailSentAt: new Date() } })
        digital++
      } else {
        await addToOpenBatch(req.user.tenantId, dispatch)
        await prisma.dispatch.update({ where: { id: dispatch.id }, data: { status: 'QUEUED', deliveryMethod: 'POST' } })
        post++
      }
    } catch (e) {
      console.error('[campaign] recipient failed:', e.message)
      failed++
    }
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id }, data: { status: 'SENT' },
    include: { _count: { select: { dispatches: true } } },
  })
  res.json({ campaign: shape(updated), summary: { total: recipients.length, digital, post, failed } })
})

// ── delete (campaign + its dispatches + files) ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  const c = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { dispatches: true } })
  if (!c) return res.status(404).json({ error: 'Not found' })
  const ids = c.dispatches.map((d) => d.id)
  if (ids.length) {
    await prisma.digitalSend.deleteMany({ where: { dispatchId: { in: ids } } })
    await prisma.returnMail.deleteMany({ where: { dispatchId: { in: ids } } })
    await prisma.printBatchItem.deleteMany({ where: { dispatchId: { in: ids } } })
    await prisma.dispatchInsert.deleteMany({ where: { dispatchId: { in: ids } } })
    await prisma.dispatch.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.campaign.delete({ where: { id: c.id } })
  for (const d of c.dispatches) { if (d.composedFileKey) await storage.deleteFile(d.composedFileKey).catch(() => {}) }
  await storage.deleteFile(c.baseFileKey).catch(() => {})
  res.json({ deleted: true })
})

module.exports = router
