const router   = require('express').Router()
const path     = require('path')
const prisma   = require('../db')
const storage  = require('../services/storage')
const composer = require('../services/composer')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// GET /api/batches
router.get('/', async (req, res) => {
  const batches = await prisma.printBatch.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } }
  })
  res.json(batches)
})

// GET /api/batches/:id
router.get('/:id', async (req, res) => {
  const batch = await prisma.printBatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      items: {
        include: {
          dispatch: {
            include: { recipient: { select: { firstName: true, lastName: true, postcode: true } } }
          }
        },
        orderBy: { order: 'asc' }
      }
    }
  })
  if (!batch) return res.status(404).json({ error: 'Not found' })
  res.json(batch)
})

// POST /api/batches  (create a named batch manually)
router.post('/', async (req, res) => {
  const { name } = req.body
  const batch = await prisma.printBatch.create({
    data: {
      tenantId: req.user.tenantId,
      name: name || `Print run — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    }
  })
  res.status(201).json(batch)
})

// POST /api/batches/:id/generate  — merge all item PDFs into one print-ready file
router.post('/:id/generate', async (req, res) => {
  const batch = await prisma.printBatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      items: {
        include: { dispatch: { select: { composedFileKey: true, originalFileKey: true } } },
        orderBy: { order: 'asc' }
      }
    }
  })
  if (!batch) return res.status(404).json({ error: 'Not found' })

  const fileKeys = batch.items.map(item =>
    item.dispatch.composedFileKey || item.dispatch.originalFileKey
  ).filter(Boolean)

  if (fileKeys.length === 0) return res.status(400).json({ error: 'No composed documents in batch' })

  try {
    const merged = await composer.mergePdfs(fileKeys)

    if (batch.mergedFileKey) storage.deleteFile(batch.mergedFileKey)
    const mergedKey = storage.saveFile(merged, 'batch')

    const updated = await prisma.printBatch.update({
      where: { id: req.params.id },
      data:  { mergedFileKey: mergedKey, status: 'READY' }
    })
    res.json(updated)
  } catch (e) {
    console.error('Batch generate error:', e)
    res.status(500).json({ error: 'PDF merge failed', detail: e.message })
  }
})

// GET /api/batches/:id/download  — serve the merged PDF
router.get('/:id/download', async (req, res) => {
  const batch = await prisma.printBatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!batch) return res.status(404).json({ error: 'Not found' })
  if (!batch.mergedFileKey) return res.status(404).json({ error: 'Not generated yet' })

  const fileName = `${batch.name.replace(/[^a-z0-9]/gi, '_')}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.sendFile(storage.absolutePath(batch.mergedFileKey))
})

// POST /api/batches/:id/mark-printed
router.post('/:id/mark-printed', async (req, res) => {
  const batch = await prisma.printBatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!batch) return res.status(404).json({ error: 'Not found' })

  const now = new Date()

  // Mark all dispatches in this batch as SENT
  await prisma.dispatch.updateMany({
    where: { printBatchItem: { batchId: req.params.id } },
    data:  { status: 'SENT', sentAt: now }
  })

  const updated = await prisma.printBatch.update({
    where: { id: req.params.id },
    data:  { status: 'PRINTED', printedAt: now }
  })
  res.json(updated)
})

// POST /api/batches/:id/mark-posted
router.post('/:id/mark-posted', async (req, res) => {
  const batch = await prisma.printBatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!batch) return res.status(404).json({ error: 'Not found' })

  const updated = await prisma.printBatch.update({
    where: { id: req.params.id },
    data:  { status: 'POSTED', postedAt: new Date() }
  })
  res.json(updated)
})

// DELETE /api/batches/:id  (only OPEN batches can be deleted)
router.delete('/:id', async (req, res) => {
  const batch = await prisma.printBatch.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!batch) return res.status(404).json({ error: 'Not found' })
  if (batch.status !== 'OPEN') return res.status(400).json({ error: 'Can only delete OPEN batches' })

  // Return dispatches to READY status
  await prisma.dispatch.updateMany({
    where: { printBatchItem: { batchId: req.params.id } },
    data:  { status: 'READY' }
  })

  if (batch.mergedFileKey) storage.deleteFile(batch.mergedFileKey)
  await prisma.printBatch.delete({ where: { id: req.params.id } })
  res.json({ deleted: true })
})

module.exports = router
