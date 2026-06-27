const router = require('express').Router()
const prisma = require('../db')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// GET /api/rules
router.get('/', async (req, res) => {
  const rules = await prisma.dispatchRule.findMany({
    where: { tenantId: req.user.tenantId },
    include: {
      inserts: {
        include: { insert: { select: { id: true, name: true, category: true } } },
        orderBy: { order: 'asc' }
      }
    },
    orderBy: { priority: 'desc' }
  })
  res.json(rules)
})

// POST /api/rules
router.post('/', async (req, res) => {
  const { name, documentType, priority, deliveryOverride, insertIds } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const rule = await prisma.dispatchRule.create({
    data: {
      tenantId:         req.user.tenantId,
      name,
      documentType:     documentType     || null,
      priority:         priority         || 0,
      deliveryOverride: deliveryOverride || null,
    }
  })

  // Attach inserts
  if (Array.isArray(insertIds) && insertIds.length > 0) {
    await prisma.dispatchRuleInsert.createMany({
      data: insertIds.map((insertId, i) => ({
        ruleId: rule.id,
        insertId,
        order: i,
      }))
    })
  }

  const full = await prisma.dispatchRule.findUnique({
    where: { id: rule.id },
    include: { inserts: { include: { insert: true }, orderBy: { order: 'asc' } } }
  })
  res.status(201).json(full)
})

// PUT /api/rules/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.dispatchRule.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const { name, documentType, priority, deliveryOverride, isActive, insertIds } = req.body

  await prisma.dispatchRule.update({
    where: { id: req.params.id },
    data: {
      name:             name             ?? undefined,
      documentType:     documentType     !== undefined ? (documentType || null) : undefined,
      priority:         priority         !== undefined ? priority  : undefined,
      deliveryOverride: deliveryOverride !== undefined ? (deliveryOverride || null) : undefined,
      isActive:         isActive         !== undefined ? isActive  : undefined,
    }
  })

  // Replace inserts if provided
  if (Array.isArray(insertIds)) {
    await prisma.dispatchRuleInsert.deleteMany({ where: { ruleId: req.params.id } })
    if (insertIds.length > 0) {
      await prisma.dispatchRuleInsert.createMany({
        data: insertIds.map((insertId, i) => ({ ruleId: req.params.id, insertId, order: i }))
      })
    }
  }

  const full = await prisma.dispatchRule.findUnique({
    where: { id: req.params.id },
    include: { inserts: { include: { insert: true }, orderBy: { order: 'asc' } } }
  })
  res.json(full)
})

// DELETE /api/rules/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.dispatchRule.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  await prisma.dispatchRule.delete({ where: { id: req.params.id } })
  res.json({ deleted: true })
})

module.exports = router
