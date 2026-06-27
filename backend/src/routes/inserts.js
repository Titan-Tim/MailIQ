const router  = require('express').Router()
const multer  = require('multer')
const prisma  = require('../db')
const storage = require('../services/storage')
const { requireAuth } = require('../middleware/auth')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files accepted'))
  }
})

router.use(requireAuth)

// GET /api/inserts
router.get('/', async (req, res) => {
  const { category } = req.query
  const where = { tenantId: req.user.tenantId, isActive: true }
  if (category) where.category = category

  const inserts = await prisma.insert.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { dispatchInserts: true } } }
  })
  res.json(inserts)
})

// POST /api/inserts  (multipart: file + name + description + category)
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' })
  const { name, description, category } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const fileKey = storage.saveFile(req.file.buffer, 'insert')

  const ins = await prisma.insert.create({
    data: {
      tenantId:     req.user.tenantId,
      name,
      description:  description || null,
      category:     category    || null,
      fileKey,
      fileName:     req.file.originalname,
      fileSizeBytes:req.file.size,
    }
  })
  res.status(201).json(ins)
})

// GET /api/inserts/:id/file  — serve the insert PDF
router.get('/:id/file', async (req, res) => {
  const ins = await prisma.insert.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!ins) return res.status(404).json({ error: 'Not found' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${ins.fileName}"`)
  res.sendFile(storage.absolutePath(ins.fileKey))
})

// PUT /api/inserts/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.insert.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const { name, description, category, isActive } = req.body
  const updated = await prisma.insert.update({
    where: { id: req.params.id },
    data: {
      name:        name        ?? undefined,
      description: description ?? undefined,
      category:    category    ?? undefined,
      isActive:    isActive    !== undefined ? isActive : undefined,
    }
  })
  res.json(updated)
})

// DELETE /api/inserts/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.insert.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  storage.deleteFile(existing.fileKey)
  await prisma.insert.delete({ where: { id: req.params.id } })
  res.json({ deleted: true })
})

module.exports = router
