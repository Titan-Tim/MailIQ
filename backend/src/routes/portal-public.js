/**
 * Recipient portal — PUBLIC (no login), gated by the unguessable per-recipient
 * tracking token. The digital email links here. The recipient can view/download
 * their document and upload a completed response back; the upload registers the
 * dispatch as returned (via='PORTAL') — the same closed loop as a scanned QR.
 *
 * Mounted at /api/portal.
 */
const router = require('express').Router()
const multer = require('multer')
const prisma = require('../db')
const storage = require('../services/storage')
const { markReturned } = require('../services/mail-item')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

async function loadByToken(token) {
  return prisma.digitalSend.findUnique({
    where: { trackingToken: token },
    include: { dispatch: { include: { tenant: true, recipient: true, campaign: true, portalUploads: { orderBy: { uploadedAt: 'asc' } } } } },
  })
}

// GET /api/portal/:token — page metadata (records the open).
router.get('/:token', async (req, res) => {
  const send = await loadByToken(req.params.token)
  if (!send) return res.status(404).json({ error: 'Not found' })
  const now = new Date()
  await prisma.digitalSend.update({
    where: { id: send.id },
    data: { openCount: { increment: 1 }, lastOpenedAt: now, firstOpenedAt: send.firstOpenedAt ?? now },
  })
  const d = send.dispatch
  const recipientName = [d.recipient?.firstName, d.recipient?.lastName].filter(Boolean).join(' ') || 'there'
  res.json({
    org: { name: d.tenant?.name || 'Mail-IQ', brandColor: d.tenant?.brandColor || '#7c3aed' },
    recipientName,
    subject: send.subject,
    documentName: d.originalFileName || 'document.pdf',
    reference: d.reference || null,
    campaign: d.campaign?.name || null,
    returned: !!d.returnedAt,
    uploads: d.portalUploads.map((u) => ({ fileName: u.fileName, uploadedAt: u.uploadedAt })),
  })
})

// GET /api/portal/:token/document — stream the document (records the download).
router.get('/:token/document', async (req, res) => {
  const send = await loadByToken(req.params.token)
  if (!send) return res.status(404).send('Document not found.')
  const now = new Date()
  await prisma.digitalSend.update({
    where: { id: send.id },
    data: { downloadCount: { increment: 1 }, firstDownloadAt: send.firstDownloadAt ?? now },
  })
  const d = send.dispatch
  const fileKey = d.composedFileKey || d.originalFileKey
  try {
    const buf = await storage.readFile(fileKey)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${(d.originalFileName || 'document.pdf').replace(/"/g, '')}"`)
    res.send(buf)
  } catch { res.status(404).send('Document not available.') }
})

// POST /api/portal/:token/upload — recipient uploads one or more completed
// documents in a single go (e.g. a form + passport photo + licence + certificate).
// Accepts multipart fields "files" (multi) and/or "file" (legacy single).
router.post('/:token/upload', upload.fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const send = await loadByToken(req.params.token)
  if (!send) return res.status(404).json({ error: 'Not found' })
  const incoming = [...(req.files?.files || []), ...(req.files?.file || [])]
  if (!incoming.length) return res.status(400).json({ error: 'No files uploaded' })

  for (const f of incoming) {
    const fileKey = await storage.saveFile(f.buffer, 'portal-upload')
    await prisma.portalUpload.create({
      data: { dispatchId: send.dispatch.id, fileKey, fileName: f.originalname, fileSizeBytes: f.size },
    })
  }
  await markReturned(send.dispatch, 'PORTAL')

  const uploads = await prisma.portalUpload.findMany({ where: { dispatchId: send.dispatch.id }, orderBy: { uploadedAt: 'asc' } })
  res.status(201).json({ ok: true, uploads: uploads.map((u) => ({ fileName: u.fileName, uploadedAt: u.uploadedAt })) })
})

module.exports = router
