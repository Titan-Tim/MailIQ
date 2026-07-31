/**
 * INBOUND module API — Digital Mailroom.
 * Mounted at /api/inbound. Entirely separate from the outbound routers.
 *
 * Sub-resources:
 *   /mailboxes   internal routing destinations
 *   /rules       routing rules
 *   /items       inbound post + pipeline (intake, process, deliver, triage)
 *   /stats       overview counts
 */
const router = require('express').Router()
const multer = require('multer')
const prisma = require('../db')
const { requireAuth, requireModule } = require('../middleware/auth')
const ocr = require('../services/ocr')
const { decideRoute, deliverToMailbox } = require('../services/inbound-router')
const storage = require('../services/storage')
const { getInboundAccess, canAccessItem } = require('../services/inbound-access')
const { logEvent, runPipeline, createAndProcess } = require('../services/inbound-pipeline')

// Gate for management actions (log post, route, mailboxes, rules) — staff only.
function requireManage(req, res, next) {
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'OPERATOR') return next()
  return res.status(403).json({ error: 'Forbidden' })
}
function requireAdmin(req, res, next) {
  if (req.user.role === 'SUPER_ADMIN') return next()
  return res.status(403).json({ error: 'Forbidden' })
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

router.use(requireAuth)
router.use(requireModule('inbound'))

// ─────────────────────────────── MAILBOXES ───────────────────────────────────
router.get('/mailboxes', requireManage, async (req, res) => {
  const isAdmin = req.user.role === 'SUPER_ADMIN'
  const all = await prisma.mailbox.findMany({
    where: { tenantId: req.user.tenantId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { items: true } },
      team: { select: { id: true, name: true } },
      ownerUser: { select: { id: true, name: true, email: true } },
    },
  })
  // Operators don't see other people's personal mailboxes; admins see that they
  // exist (owner + count) but the contents stay private via the item endpoints.
  const visible = (isAdmin ? all : all.filter((m) => !m.ownerUserId || m.ownerUserId === req.user.id))
    .map((m) => ({ ...m, kind: m.ownerUserId ? 'PERSONAL' : m.teamId ? 'TEAM' : 'GENERAL' }))
  res.json({ mailboxes: visible })
})

// Mailboxes whose CONTENT the caller may open (personal + their teams + admin's
// shared/general). Available to any role — powers "open your mailbox".
router.get('/my-mailboxes', async (req, res) => {
  const access = await getInboundAccess(req.user)
  const ids = [...access.contentMailboxIds]
  const mailboxes = await prisma.mailbox.findMany({
    where: { id: { in: ids }, isActive: true },
    orderBy: [{ ownerUserId: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { items: true } },
      team: { select: { id: true, name: true } },
      ownerUser: { select: { id: true, name: true } },
    },
  })
  res.json({
    mailboxes: mailboxes.map((m) => ({
      ...m, kind: m.ownerUserId ? 'PERSONAL' : m.teamId ? 'TEAM' : 'GENERAL',
    })),
  })
})

// Open a mailbox's contents — only if the caller has content access to it
// (so an admin cannot open someone else's personal inbox).
router.get('/mailboxes/:id/items', async (req, res) => {
  const mailbox = await prisma.mailbox.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: { team: { select: { name: true } }, ownerUser: { select: { name: true, email: true } } },
  })
  if (!mailbox) return res.status(404).json({ error: 'Not found' })
  const kind = mailbox.ownerUserId ? 'PERSONAL' : mailbox.teamId ? 'TEAM' : 'GENERAL'

  const access = await getInboundAccess(req.user)
  if (!access.contentMailboxIds.has(mailbox.id)) {
    // Reveal that it's a private inbox, but never its contents.
    return res.status(403).json({ error: 'private', mailbox: { name: mailbox.name, kind } })
  }
  const items = await prisma.inboundItem.findMany({
    where: { tenantId: req.user.tenantId, matchedMailboxId: mailbox.id },
    orderBy: { receivedAt: 'desc' },
    take: 200,
  })
  res.json({ mailbox: { id: mailbox.id, name: mailbox.name, email: mailbox.email, kind }, items })
})

router.post('/mailboxes', requireManage, async (req, res) => {
  const { name, department, email, keywords, isDefault, teamId } = req.body
  if (!name || !email) return res.status(400).json({ error: 'name and email required' })

  // A manually-created mailbox is either TEAM-owned (teamId) or GENERAL.
  // Personal mailboxes are auto-created per user, not through this form.
  let team = null
  if (teamId) {
    team = await prisma.team.findFirst({ where: { id: teamId, tenantId: req.user.tenantId } })
    if (!team) return res.status(400).json({ error: 'Invalid team' })
  }

  // Only one default catch-all per tenant.
  if (isDefault) {
    await prisma.mailbox.updateMany({
      where: { tenantId: req.user.tenantId, isDefault: true },
      data: { isDefault: false },
    })
  }
  const mailbox = await prisma.mailbox.create({
    data: {
      tenantId: req.user.tenantId,
      name,
      department: department || null,
      email: email.toLowerCase(),
      keywords: keywords || null,
      isDefault: !!isDefault,
      teamId: team ? team.id : null,
    },
  })
  res.status(201).json(mailbox)
})

router.put('/mailboxes/:id', requireManage, async (req, res) => {
  const existing = await prisma.mailbox.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const { name, department, email, keywords, isDefault, isActive, teamId } = req.body

  // Team reassignment only applies to non-personal mailboxes.
  let teamUpdate
  if (teamId !== undefined && !existing.ownerUserId) {
    if (teamId) {
      const team = await prisma.team.findFirst({ where: { id: teamId, tenantId: req.user.tenantId } })
      if (!team) return res.status(400).json({ error: 'Invalid team' })
      teamUpdate = team.id
    } else {
      teamUpdate = null
    }
  }

  if (isDefault) {
    await prisma.mailbox.updateMany({
      where: { tenantId: req.user.tenantId, isDefault: true, id: { not: existing.id } },
      data: { isDefault: false },
    })
  }
  const updated = await prisma.mailbox.update({
    where: { id: existing.id },
    data: {
      name: name ?? undefined,
      department: department !== undefined ? (department || null) : undefined,
      email: email !== undefined ? email.toLowerCase() : undefined,
      keywords: keywords !== undefined ? (keywords || null) : undefined,
      isDefault: isDefault !== undefined ? !!isDefault : undefined,
      isActive: isActive !== undefined ? !!isActive : undefined,
      teamId: teamUpdate !== undefined ? teamUpdate : undefined,
    },
  })
  res.json(updated)
})

router.delete('/mailboxes/:id', requireManage, async (req, res) => {
  const existing = await prisma.mailbox.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  await prisma.mailbox.update({ where: { id: existing.id }, data: { isActive: false } })
  res.json({ deleted: true })
})

// ───────────────────────────────── RULES ─────────────────────────────────────
router.get('/rules', requireManage, async (req, res) => {
  const rules = await prisma.inboundRoutingRule.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: { targetMailbox: { select: { id: true, name: true } } },
  })
  res.json({ rules })
})

router.post('/rules', requireManage, async (req, res) => {
  const { name, priority, matchType, documentType, keyword, targetMailboxId } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  if (!documentType && !keyword) {
    return res.status(400).json({ error: 'A rule needs at least a documentType or a keyword' })
  }
  const rule = await prisma.inboundRoutingRule.create({
    data: {
      tenantId: req.user.tenantId,
      name,
      priority: Number.isFinite(+priority) ? +priority : 0,
      matchType: matchType === 'ALL' ? 'ALL' : 'ANY',
      documentType: documentType || null,
      keyword: keyword || null,
      targetMailboxId: targetMailboxId || null,
    },
  })
  res.status(201).json(rule)
})

router.put('/rules/:id', requireManage, async (req, res) => {
  const existing = await prisma.inboundRoutingRule.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const { name, priority, matchType, documentType, keyword, targetMailboxId, isActive } = req.body
  const updated = await prisma.inboundRoutingRule.update({
    where: { id: existing.id },
    data: {
      name: name ?? undefined,
      priority: priority !== undefined ? +priority : undefined,
      matchType: matchType !== undefined ? (matchType === 'ALL' ? 'ALL' : 'ANY') : undefined,
      documentType: documentType !== undefined ? (documentType || null) : undefined,
      keyword: keyword !== undefined ? (keyword || null) : undefined,
      targetMailboxId: targetMailboxId !== undefined ? (targetMailboxId || null) : undefined,
      isActive: isActive !== undefined ? !!isActive : undefined,
    },
  })
  res.json(updated)
})

router.delete('/rules/:id', requireManage, async (req, res) => {
  const existing = await prisma.inboundRoutingRule.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  await prisma.inboundRoutingRule.delete({ where: { id: existing.id } })
  res.json({ deleted: true })
})

// ─────────────────────────── EXPORT (FILING) RULES ───────────────────────────
router.get('/export-rules', requireManage, async (req, res) => {
  const rules = await prisma.inboundExportRule.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  })
  res.json({ rules })
})
router.post('/export-rules', requireManage, async (req, res) => {
  const { name, priority, matchDocumentType, matchKeyword, format, filenameTemplate, exportTarget } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  // A rule needs either a case-number format, or a match condition (forward rule).
  if (!format?.trim() && !matchKeyword && !matchDocumentType) {
    return res.status(400).json({ error: 'Add a case-number format, or a match keyword / document type to forward matching documents' })
  }
  const rule = await prisma.inboundExportRule.create({
    data: {
      tenantId: req.user.tenantId, name: name.trim(),
      priority: Number.isFinite(+priority) ? +priority : 0,
      matchDocumentType: matchDocumentType || null,
      matchKeyword: matchKeyword || null,
      format: format?.trim() || '',
      filenameTemplate: filenameTemplate?.trim() || '{ref}.pdf',
      exportTarget: exportTarget?.trim() || 'default',
    },
  })
  res.status(201).json(rule)
})
router.put('/export-rules/:id', requireManage, async (req, res) => {
  const existing = await prisma.inboundExportRule.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const { name, priority, matchDocumentType, matchKeyword, format, filenameTemplate, exportTarget, isActive } = req.body
  const rule = await prisma.inboundExportRule.update({
    where: { id: existing.id },
    data: {
      name: name ?? undefined,
      priority: priority !== undefined ? +priority : undefined,
      matchDocumentType: matchDocumentType !== undefined ? (matchDocumentType || null) : undefined,
      matchKeyword: matchKeyword !== undefined ? (matchKeyword || null) : undefined,
      format: format ?? undefined,
      filenameTemplate: filenameTemplate ?? undefined,
      exportTarget: exportTarget ?? undefined,
      isActive: isActive !== undefined ? !!isActive : undefined,
    },
  })
  res.json(rule)
})
router.delete('/export-rules/:id', requireManage, async (req, res) => {
  const existing = await prisma.inboundExportRule.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  await prisma.inboundExportRule.delete({ where: { id: existing.id } })
  res.json({ deleted: true })
})

// ───────────────────────────────── ITEMS ─────────────────────────────────────
router.get('/items', async (req, res) => {
  const { status, limit = '100', offset = '0' } = req.query
  const access = await getInboundAccess(req.user)
  const ids = [...access.contentMailboxIds]
  const scope = access.canSeeTriage
    ? { OR: [{ matchedMailboxId: { in: ids } }, { matchedMailboxId: null }] }
    : { matchedMailboxId: { in: ids } }
  const and = [{ tenantId: req.user.tenantId }, scope]
  if (status) and.push({ status })
  const where = { AND: and }
  const [items, total] = await Promise.all([
    prisma.inboundItem.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: { matchedMailbox: { select: { id: true, name: true } } },
    }),
    prisma.inboundItem.count({ where }),
  ])
  res.json({ items, total })
})

router.get('/items/:id', async (req, res) => {
  const item = await prisma.inboundItem.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      matchedMailbox: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })
  // Privacy: only reveal items the caller may see (404 avoids leaking existence).
  const access = await getInboundAccess(req.user)
  if (!canAccessItem(access, item)) return res.status(404).json({ error: 'Not found' })
  res.json(item)
})

// Serve the stored scan for an inbound item (token via header or ?auth= query,
// so <embed>/<iframe> previews work).
router.get('/items/:id/file', async (req, res) => {
  const item = await prisma.inboundItem.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!item || !item.fileKey) return res.status(404).json({ error: 'No file for this item' })
  const access = await getInboundAccess(req.user)
  if (!canAccessItem(access, item)) return res.status(404).json({ error: 'Not found' })

  const ext = (item.fileName.split('.').pop() || '').toLowerCase()
  const type =
    ext === 'pdf' ? 'application/pdf' :
    ['png', 'gif', 'webp'].includes(ext) ? `image/${ext}` :
    ['jpg', 'jpeg'].includes(ext) ? 'image/jpeg' :
    ['tif', 'tiff'].includes(ext) ? 'image/tiff' :
    'application/octet-stream'

  try {
    const buf = await storage.readFile(item.fileKey)
    res.setHeader('Content-Type', type)
    res.setHeader('Content-Disposition', `inline; filename="${item.fileName}"`)
    res.send(buf)
  } catch {
    res.status(404).json({ error: 'File not found' })
  }
})

/**
 * Intake. Accepts either a multipart file upload, or a JSON body with a
 * fileName plus optional OCR hints (ocrText / extractedName / documentType) —
 * the latter lets an operator feed the pipeline without a real OCR engine.
 * Runs the full pipeline immediately.
 */
router.post('/items', requireManage, upload.single('file'), async (req, res) => {
  try {
    const body = req.body || {}
    const full = await createAndProcess({
      tenantId: req.user.tenantId,
      fileBuffer: req.file ? req.file.buffer : null,
      originalName: req.file ? req.file.originalname : body.fileName,
      source: body.source || (req.file ? 'upload' : 'manual'),
      hints: { ocrText: body.ocrText, extractedName: body.extractedName, documentType: body.documentType },
      actor: req.user.email,
    })
    res.status(201).json(full)
  } catch (e) {
    console.error('[inbound intake]', e)
    res.status(500).json({ error: e.message })
  }
})

// Re-run the pipeline (e.g. after rules changed).
router.post('/items/:id/process', requireManage, async (req, res) => {
  const item = await prisma.inboundItem.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })
  const access = await getInboundAccess(req.user)
  if (!canAccessItem(access, item)) return res.status(404).json({ error: 'Not found' })
  const updated = await runPipeline(item, req.user.email)
  res.json(updated)
})

// Manual triage: reroute to a chosen mailbox and deliver.
router.post('/items/:id/reroute', requireManage, async (req, res) => {
  const { mailboxId } = req.body
  const item = await prisma.inboundItem.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })
  const access = await getInboundAccess(req.user)
  if (!canAccessItem(access, item)) return res.status(404).json({ error: 'Not found' })
  const mailbox = await prisma.mailbox.findFirst({
    where: { id: mailboxId, tenantId: req.user.tenantId, isActive: true },
  })
  if (!mailbox) return res.status(400).json({ error: 'Invalid mailbox' })

  const tenant = await prisma.tenant.findUnique({ where: { id: item.tenantId } })
  const sent = await deliverToMailbox(item, mailbox, tenant)
  const updated = await prisma.inboundItem.update({
    where: { id: item.id },
    data: {
      matchedMailboxId: mailbox.id,
      matchedRuleId: null,
      routingReason: `Manually routed to "${mailbox.name}" by ${req.user.email}`,
      status: 'DELIVERED',
      deliveredEmail: mailbox.email,
      deliveredAt: new Date(),
    },
  })
  await logEvent(item.id, 'REROUTED', `→ ${mailbox.name} (${mailbox.email})`, req.user.email)
  await logEvent(item.id, 'DELIVERED', sent ? `Emailed ${mailbox.email}` : `Queued for ${mailbox.email}`, req.user.email)
  res.json(updated)
})

router.post('/items/:id/reject', requireManage, async (req, res) => {
  const item = await prisma.inboundItem.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })
  const access = await getInboundAccess(req.user)
  if (!canAccessItem(access, item)) return res.status(404).json({ error: 'Not found' })
  const updated = await prisma.inboundItem.update({
    where: { id: item.id },
    data: { status: 'REJECTED' },
  })
  await logEvent(item.id, 'REJECTED', req.body?.reason || 'Marked as junk', req.user.email)
  res.json(updated)
})

// Permanently delete an item and its stored file. Managers can delete anything
// they can access; a personal-mailbox owner can delete their own post.
router.delete('/items/:id', async (req, res) => {
  const item = await prisma.inboundItem.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })
  const access = await getInboundAccess(req.user)
  if (!canAccessItem(access, item)) return res.status(404).json({ error: 'Not found' })

  const mailbox = item.matchedMailboxId
    ? await prisma.mailbox.findUnique({ where: { id: item.matchedMailboxId } })
    : null
  const ownsPersonal = mailbox && mailbox.ownerUserId === req.user.id
  if (!access.canManage && !ownsPersonal) return res.status(403).json({ error: 'Forbidden' })

  if (item.fileKey) await storage.deleteFile(item.fileKey)
  await prisma.inboundItem.delete({ where: { id: item.id } }) // events cascade
  res.json({ deleted: true })
})

// ─────────────────────────── SCAN-FOLDER INGEST KEY ──────────────────────────
// The watcher agent authenticates with this per-tenant key (admin manages it).
router.get('/ingest-key', requireAdmin, async (req, res) => {
  const t = await prisma.tenant.findUnique({ where: { id: req.user.tenantId }, select: { ingestKey: true } })
  res.json({ ingestKey: t?.ingestKey || null })
})
router.post('/ingest-key/regenerate', requireAdmin, async (req, res) => {
  const key = 'miqk_' + require('crypto').randomBytes(24).toString('base64url')
  await prisma.tenant.update({ where: { id: req.user.tenantId }, data: { ingestKey: key } })
  res.json({ ingestKey: key })
})

// Serve the QR separator sheet (token via header or ?auth= query for the download link).
router.get('/separator-sheet', requireManage, async (req, res) => {
  const { generateSeparatorSheet } = require('../services/separator-sheet')
  const bytes = await generateSeparatorSheet()
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'inline; filename="mailiq-separator-sheet.pdf"')
  res.send(Buffer.from(bytes))
})

// ───────────────────────────────── STATS ─────────────────────────────────────
// Counts are scoped to what the caller may see (respects the privacy model).
router.get('/stats', async (req, res) => {
  const access = await getInboundAccess(req.user)
  const ids = [...access.contentMailboxIds]
  const scope = access.canSeeTriage
    ? { OR: [{ matchedMailboxId: { in: ids } }, { matchedMailboxId: null }] }
    : { matchedMailboxId: { in: ids } }
  const forStatus = (s) => ({ AND: [{ tenantId: req.user.tenantId }, scope, { status: s }] })
  const [received, triage, delivered, rejected] = await Promise.all([
    prisma.inboundItem.count({ where: forStatus('RECEIVED') }),
    prisma.inboundItem.count({ where: forStatus('TRIAGE') }),
    prisma.inboundItem.count({ where: forStatus('DELIVERED') }),
    prisma.inboundItem.count({ where: forStatus('REJECTED') }),
  ])
  res.json({
    received, triage, delivered, rejected,
    mailboxes: access.contentMailboxIds.size,
    canManage: access.canManage,
    isAdmin: access.isAdmin,
  })
})

module.exports = router
