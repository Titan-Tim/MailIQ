/**
 * Public document tracking route — no auth required.
 * When a recipient clicks their email link, this endpoint:
 *   1. Logs the open event
 *   2. Serves the composed PDF inline
 */
const router  = require('express').Router()
const prisma  = require('../db')
const storage = require('../services/storage')

// GET /api/track/:token
router.get('/:token', async (req, res) => {
  const send = await prisma.digitalSend.findUnique({
    where: { trackingToken: req.params.token },
    include: { dispatch: true }
  })

  if (!send) return res.status(404).send('Document not found.')

  // Update open tracking
  const now = new Date()
  await prisma.digitalSend.update({
    where: { id: send.id },
    data: {
      openCount:     { increment: 1 },
      lastOpenedAt:  now,
      firstOpenedAt: send.firstOpenedAt ?? now,
    }
  })

  const { dispatch } = send
  const fileKey = dispatch.composedFileKey || dispatch.originalFileKey
  if (!fileKey) return res.status(404).send('Document not available.')

  const filePath = storage.absolutePath(fileKey)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="document.pdf"`)
  res.sendFile(filePath)
})

// GET /api/track/:token/download — same but force download
router.get('/:token/download', async (req, res) => {
  const send = await prisma.digitalSend.findUnique({
    where: { trackingToken: req.params.token },
    include: { dispatch: true }
  })
  if (!send) return res.status(404).send('Document not found.')

  const now = new Date()
  await prisma.digitalSend.update({
    where: { id: send.id },
    data: {
      downloadCount:  { increment: 1 },
      firstDownloadAt: send.firstDownloadAt ?? now,
    }
  })

  const { dispatch } = send
  const fileKey = dispatch.composedFileKey || dispatch.originalFileKey
  if (!fileKey) return res.status(404).send('Document not available.')

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="document.pdf"`)
  res.sendFile(storage.absolutePath(fileKey))
})

module.exports = router
