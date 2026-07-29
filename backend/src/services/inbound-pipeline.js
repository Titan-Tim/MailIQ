/**
 * Inbound pipeline — shared by the portal intake and the scan-folder ingest.
 * OCR → classify → route → (deliver | triage), with an audit event per step.
 */
const prisma = require('../db')
const ocr = require('./ocr')
const { decideRoute, deliverToMailbox } = require('./inbound-router')
const storage = require('./storage')

async function logEvent(itemId, type, detail, actor = 'system') {
  await prisma.inboundEvent.create({ data: { itemId, type, detail, actor } })
}

async function safeRead(fileKey) {
  try { return await storage.readFile(fileKey) } catch { return null }
}

async function runPipeline(item, actor) {
  // 1. OCR + classify (stub honours any hints already stored on the item).
  const buffer = item.fileKey ? await safeRead(item.fileKey) : null
  const result = await ocr.extract({
    buffer,
    fileName: item.fileName,
    hints: {
      ocrText: item.ocrText || undefined,
      extractedName: item.extractedName || undefined,
      documentType: item.documentType || undefined,
    },
  })
  await logEvent(item.id, 'OCR', `engine=${result.engine} type=${result.documentType} conf=${result.confidence}`, actor)

  item = await prisma.inboundItem.update({
    where: { id: item.id },
    data: {
      ocrText: result.text,
      extractedName: result.extractedName || null,
      documentType: result.documentType,
      confidence: result.confidence,
      status: 'CLASSIFIED',
      processedAt: new Date(),
    },
  })
  await logEvent(item.id, 'CLASSIFIED', `addressee="${item.extractedName || ''}"`, actor)

  // 2. Route.
  const [rules, mailboxes] = await Promise.all([
    prisma.inboundRoutingRule.findMany({ where: { tenantId: item.tenantId, isActive: true } }),
    prisma.mailbox.findMany({ where: { tenantId: item.tenantId, isActive: true } }),
  ])
  const decision = decideRoute(item, rules, mailboxes)

  item = await prisma.inboundItem.update({
    where: { id: item.id },
    data: {
      matchedMailboxId: decision.mailboxId,
      matchedRuleId: decision.ruleId,
      routingReason: decision.reason,
      confidence: decision.confidence,
      status: decision.status === 'DELIVERED' ? 'CLASSIFIED' : 'TRIAGE',
    },
  })
  await logEvent(item.id, 'ROUTED', decision.reason, actor)

  // 3. Auto-deliver when confident and matched.
  if (decision.status === 'DELIVERED' && decision.mailboxId) {
    const mailbox = mailboxes.find((m) => m.id === decision.mailboxId)
    const tenant = await prisma.tenant.findUnique({ where: { id: item.tenantId } })
    const sent = await deliverToMailbox(item, mailbox, tenant)
    item = await prisma.inboundItem.update({
      where: { id: item.id },
      data: { status: 'DELIVERED', deliveredEmail: mailbox.email, deliveredAt: new Date() },
    })
    await logEvent(item.id, 'DELIVERED', sent ? `Emailed ${mailbox.email}` : `Queued for ${mailbox.email} (email not configured)`, actor)
  }
  return item
}

/**
 * Create an inbound item from a file buffer (and/or hints) and run the pipeline.
 * @returns the full item with matchedMailbox + events.
 */
async function createAndProcess({ tenantId, fileBuffer, originalName, source, hints = {}, actor = 'system' }) {
  let fileKey = null
  let fileName = originalName || hints.fileName || 'scan.pdf'
  let fileSizeBytes = 0
  if (fileBuffer) {
    const ext = (fileName.split('.').pop() || 'pdf').toLowerCase()
    fileKey = await storage.saveFile(fileBuffer, 'inbound', ext)
    fileSizeBytes = fileBuffer.length
  }
  let item = await prisma.inboundItem.create({
    data: {
      tenantId, fileKey, fileName, fileSizeBytes,
      source: source || (fileBuffer ? 'upload' : 'manual'),
      ocrText: hints.ocrText || null,
      extractedName: hints.extractedName || null,
      documentType: hints.documentType || null,
      status: 'RECEIVED',
    },
  })
  await logEvent(item.id, 'RECEIVED', `source=${item.source} file=${item.fileName}`, actor)
  item = await runPipeline(item, actor)
  return prisma.inboundItem.findUnique({
    where: { id: item.id },
    include: { matchedMailbox: true, events: { orderBy: { createdAt: 'asc' } } },
  })
}

module.exports = { logEvent, safeRead, runPipeline, createAndProcess }
