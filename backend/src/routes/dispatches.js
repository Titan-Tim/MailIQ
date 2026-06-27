const router   = require('express').Router()
const multer   = require('multer')
const path     = require('path')
const prisma   = require('../db')
const storage  = require('../services/storage')
const composer = require('../services/composer')
const { sendDispatchEmail } = require('../services/email')
const { requireAuth } = require('../middleware/auth')

// ── Multer: parse PDF uploads into memory ─────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files are accepted'))
  }
})

router.use(requireAuth)

// ── Helpers ───────────────────────────────────────────────────────────────

/** Generate a short unique barcode code, e.g. MQ-A1B2C3D4 */
async function uniqueBarcodeCode() {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = 'MQ-'
    for (let i = 0; i < 8; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)]
    const exists = await prisma.dispatch.findUnique({ where: { barcodeCode: code } })
    if (!exists) return code
  }
  throw new Error('Could not generate unique barcode code')
}

/** Resolve which inserts to auto-apply from rules, given a documentType */
async function resolveRuleInserts(tenantId, documentType) {
  if (!documentType) return []
  const rules = await prisma.dispatchRule.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { documentType: null },
        { documentType: documentType }
      ]
    },
    include: { inserts: { include: { insert: true }, orderBy: { order: 'asc' } } },
    orderBy: { priority: 'desc' }
  })
  // Collect unique inserts in priority order
  const seen = new Set()
  const result = []
  for (const rule of rules) {
    for (const ri of rule.inserts) {
      if (!seen.has(ri.insertId) && ri.insert.isActive) {
        seen.add(ri.insertId)
        result.push({ insert: ri.insert, source: 'rule' })
      }
    }
  }
  return result
}

/** Resolve delivery method for a dispatch */
function resolveDeliveryMethod(recipient, ruleOverride) {
  if (ruleOverride) return ruleOverride
  if (!recipient) return 'POST'
  if (recipient.deliveryMethod === 'DIGITAL') return recipient.email ? 'DIGITAL' : 'POST'
  if (recipient.deliveryMethod === 'POST')    return 'POST'
  // AUTO: use digital if they have email
  return recipient.email ? 'DIGITAL' : 'POST'
}

// ═══════════════════════════════════════════════════════════════════════════
//  UPLOAD — POST /api/dispatches/ingest
// ═══════════════════════════════════════════════════════════════════════════
router.post('/ingest', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' })

  const fileKey     = storage.saveFile(req.file.buffer, 'original')
  const barcodeCode = await uniqueBarcodeCode()

  const dispatch = await prisma.dispatch.create({
    data: {
      tenantId:        req.user.tenantId,
      originalFileKey: fileKey,
      originalFileName: req.file.originalname,
      fileSizeBytes:   req.file.size,
      barcodeCode,
      status:          'PENDING',
      documentType:    req.body.documentType || null,
      reference:       req.body.reference   || null,
    }
  })

  res.status(201).json(dispatch)
})

// ═══════════════════════════════════════════════════════════════════════════
//  LIST — GET /api/dispatches
// ═══════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const { status, search, limit = '50', offset = '0' } = req.query

  const where = { tenantId: req.user.tenantId }
  if (status) where.status = status
  if (search) {
    where.OR = [
      { originalFileName: { contains: search, mode: 'insensitive' } },
      { reference:        { contains: search, mode: 'insensitive' } },
      { barcodeCode:      { contains: search, mode: 'insensitive' } },
      { recipient: { OR: [
        { lastName:     { contains: search, mode: 'insensitive' } },
        { email:        { contains: search, mode: 'insensitive' } },
        { accountNumber:{ contains: search, mode: 'insensitive' } },
      ]}},
    ]
  }

  const [dispatches, total] = await Promise.all([
    prisma.dispatch.findMany({
      where,
      include: {
        recipient:     { select: { id: true, firstName: true, lastName: true, email: true, accountNumber: true } },
        digitalSend:   { select: { emailSent: true, firstOpenedAt: true, openCount: true } },
        printBatchItem:{ select: { batchId: true } },
        _count:        { select: { inserts: true } },
      },
      orderBy: { uploadedAt: 'desc' },
      take:   parseInt(limit),
      skip:   parseInt(offset),
    }),
    prisma.dispatch.count({ where })
  ])

  res.json({ dispatches, total })
})

// ═══════════════════════════════════════════════════════════════════════════
//  GET SINGLE — GET /api/dispatches/:id
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      recipient: true,
      inserts: {
        include: { insert: true },
        orderBy: { order: 'asc' }
      },
      digitalSend:    true,
      printBatchItem: { include: { batch: true } },
      returnMail:     true,
    }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })
  res.json(dispatch)
})

// ═══════════════════════════════════════════════════════════════════════════
//  SERVE FILE — GET /api/dispatches/:id/file?composed=1&token=JWT
//  Token can be in Authorization header OR ?token= query param (for iframes)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:id/file', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })

  const useComposed = req.query.composed === '1' && dispatch.composedFileKey
  const fileKey = useComposed ? dispatch.composedFileKey : dispatch.originalFileKey
  const filePath = storage.absolutePath(fileKey)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${dispatch.originalFileName}"`)
  res.sendFile(filePath)
})

// ═══════════════════════════════════════════════════════════════════════════
//  UPDATE — PATCH /api/dispatches/:id
// ═══════════════════════════════════════════════════════════════════════════
router.patch('/:id', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })

  const { recipientId, documentType, reference, notes, addressOverride, deliveryMethod } = req.body

  const updated = await prisma.dispatch.update({
    where: { id: req.params.id },
    data: {
      recipientId:     recipientId     !== undefined ? (recipientId || null) : undefined,
      documentType:    documentType    !== undefined ? documentType    : undefined,
      reference:       reference       !== undefined ? reference       : undefined,
      notes:           notes           !== undefined ? notes           : undefined,
      addressOverride: addressOverride !== undefined ? addressOverride : undefined,
      deliveryMethod:  deliveryMethod  !== undefined ? deliveryMethod  : undefined,
    },
    include: { recipient: true, inserts: { include: { insert: true } } }
  })
  res.json(updated)
})

// ═══════════════════════════════════════════════════════════════════════════
//  SET INSERTS — PUT /api/dispatches/:id/inserts
//  Replaces the full insert list for this dispatch
// ═══════════════════════════════════════════════════════════════════════════
router.put('/:id/inserts', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })

  const { inserts } = req.body  // [{ insertId, source }]
  if (!Array.isArray(inserts)) return res.status(400).json({ error: 'inserts array required' })

  await prisma.dispatchInsert.deleteMany({ where: { dispatchId: req.params.id } })

  if (inserts.length > 0) {
    await prisma.dispatchInsert.createMany({
      data: inserts.map((ins, i) => ({
        dispatchId: req.params.id,
        insertId:   ins.insertId,
        order:      i,
        source:     ins.source || 'manual',
      }))
    })
  }

  const updated = await prisma.dispatch.findFirst({
    where: { id: req.params.id },
    include: { inserts: { include: { insert: true }, orderBy: { order: 'asc' } } }
  })
  res.json(updated)
})

// ═══════════════════════════════════════════════════════════════════════════
//  SUGGEST INSERTS — GET /api/dispatches/:id/suggest-inserts
//  Returns rule-driven insert suggestions based on documentType
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:id/suggest-inserts', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })

  const suggestions = await resolveRuleInserts(req.user.tenantId, dispatch.documentType)
  res.json(suggestions.map(s => ({ insert: s.insert, source: s.source })))
})

// ═══════════════════════════════════════════════════════════════════════════
//  COMPOSE — POST /api/dispatches/:id/compose
//  Generates the composed PDF (address overlay + barcode + inserts merged)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:id/compose', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      recipient: true,
      inserts: { include: { insert: true }, orderBy: { order: 'asc' } }
    }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })

  // Set status to COMPOSING
  await prisma.dispatch.update({ where: { id: req.params.id }, data: { status: 'COMPOSING' } })

  try {
    const tenant = req.user.tenant
    const inserts = dispatch.inserts.map(di => di.insert)
    const composedBuffer = await composer.composeDispatch(dispatch, dispatch.recipient, inserts, tenant)

    // Delete old composed file if present
    if (dispatch.composedFileKey) storage.deleteFile(dispatch.composedFileKey)

    const composedKey = storage.saveFile(composedBuffer, 'composed')

    // Resolve delivery method
    const ruleInserts = await resolveRuleInserts(req.user.tenantId, dispatch.documentType)
    const ruleOverride = null // could look up rule's deliveryOverride here
    const deliveryMethod = dispatch.deliveryMethod ||
      resolveDeliveryMethod(dispatch.recipient, ruleOverride)

    const updated = await prisma.dispatch.update({
      where: { id: req.params.id },
      data: {
        composedFileKey: composedKey,
        composedAt:      new Date(),
        status:          'READY',
        deliveryMethod,
        errorMessage:    null,
      },
      include: { recipient: true, inserts: { include: { insert: true } } }
    })
    res.json(updated)
  } catch (err) {
    console.error('Compose error:', err)
    await prisma.dispatch.update({
      where: { id: req.params.id },
      data: { status: 'FAILED', errorMessage: err.message }
    })
    res.status(500).json({ error: 'Composition failed', detail: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
//  SEND DIGITAL — POST /api/dispatches/:id/send-digital
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:id/send-digital', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: { recipient: true, digitalSend: true }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })
  if (!dispatch.composedFileKey) return res.status(400).json({ error: 'Document must be composed first' })

  const toEmail  = req.body.email || dispatch.recipient?.email
  const subject  = req.body.subject || `Your document${dispatch.reference ? ' — Ref: ' + dispatch.reference : ''}`

  if (!toEmail) return res.status(400).json({ error: 'Recipient email required' })

  // Create or update DigitalSend record
  const digitalSend = await prisma.digitalSend.upsert({
    where:  { dispatchId: req.params.id },
    create: { dispatchId: req.params.id, toEmail, subject },
    update: { toEmail, subject }
  })

  // Send email
  const sent = await sendDispatchEmail(dispatch, dispatch.recipient, digitalSend, req.user.tenant)

  const update = {
    status:    'QUEUED',
    deliveryMethod: 'DIGITAL',
  }

  if (sent) {
    update.status  = 'SENT'
    update.sentAt  = new Date()
    await prisma.digitalSend.update({
      where: { id: digitalSend.id },
      data:  { emailSent: true, emailSentAt: new Date() }
    })
  }

  const updated = await prisma.dispatch.update({
    where: { id: req.params.id },
    data:  update,
    include: { digitalSend: true }
  })
  res.json(updated)
})

// ═══════════════════════════════════════════════════════════════════════════
//  ADD TO PRINT BATCH — POST /api/dispatches/:id/add-to-batch
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:id/add-to-batch', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: { printBatchItem: true }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })
  if (!dispatch.composedFileKey) return res.status(400).json({ error: 'Document must be composed first' })
  if (dispatch.printBatchItem) return res.status(400).json({ error: 'Already in a batch' })

  // Find or create the open batch for this tenant
  let batch = await prisma.printBatch.findFirst({
    where: { tenantId: req.user.tenantId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' }
  })
  if (!batch) {
    const now = new Date()
    const label = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    batch = await prisma.printBatch.create({
      data: {
        tenantId: req.user.tenantId,
        name: `Print run — ${label}`,
      }
    })
  }

  await prisma.printBatchItem.create({
    data: {
      batchId:    batch.id,
      dispatchId: req.params.id,
      pageCount:  dispatch.pageCount,
      order:      batch.itemCount,
    }
  })

  await prisma.printBatch.update({
    where: { id: batch.id },
    data: {
      itemCount:  { increment: 1 },
      totalPages: { increment: dispatch.pageCount },
    }
  })

  const updated = await prisma.dispatch.update({
    where: { id: req.params.id },
    data:  { status: 'QUEUED', deliveryMethod: 'POST' },
    include: { printBatchItem: { include: { batch: true } } }
  })
  res.json(updated)
})

// ═══════════════════════════════════════════════════════════════════════════
//  DELETE — DELETE /api/dispatches/:id
// ═══════════════════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!dispatch) return res.status(404).json({ error: 'Not found' })

  // Clean up files
  if (dispatch.originalFileKey) storage.deleteFile(dispatch.originalFileKey)
  if (dispatch.composedFileKey) storage.deleteFile(dispatch.composedFileKey)

  await prisma.dispatch.delete({ where: { id: req.params.id } })
  res.json({ deleted: true })
})

module.exports = router
