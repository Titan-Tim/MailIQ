const router = require('express').Router()
const prisma = require('../db')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// POST /api/returns/scan  — operator scans the barcode on a returned letter
router.post('/scan', async (req, res) => {
  const { barcodeCode, returnReason, notes } = req.body
  if (!barcodeCode) return res.status(400).json({ error: 'barcodeCode required' })

  const dispatch = await prisma.dispatch.findFirst({
    where: { barcodeCode, tenantId: req.user.tenantId },
    include: { recipient: true, returnMail: true }
  })
  if (!dispatch) return res.status(404).json({ error: 'No dispatch found for this barcode' })
  if (dispatch.returnMail) return res.status(409).json({ error: 'Already logged as returned', returnMail: dispatch.returnMail })

  const returnMail = await prisma.returnMail.create({
    data: {
      dispatchId:  dispatch.id,
      scannedCode: barcodeCode,
      returnReason: returnReason || null,
      notes:        notes        || null,
    }
  })

  await prisma.dispatch.update({
    where: { id: dispatch.id },
    data:  { status: 'RETURNED' }
  })

  res.status(201).json({
    returnMail,
    dispatch: {
      id:       dispatch.id,
      reference: dispatch.reference,
      recipient: dispatch.recipient
        ? { name: [dispatch.recipient.firstName, dispatch.recipient.lastName].filter(Boolean).join(' '),
            email: dispatch.recipient.email,
            accountNumber: dispatch.recipient.accountNumber }
        : null
    }
  })
})

// GET /api/returns  — list returned mail
router.get('/', async (req, res) => {
  const { resolved } = req.query
  const where = { dispatch: { tenantId: req.user.tenantId } }
  if (resolved === 'true')  where.resolvedAt = { not: null }
  if (resolved === 'false') where.resolvedAt = null

  const returns = await prisma.returnMail.findMany({
    where,
    include: {
      dispatch: {
        include: {
          recipient: { select: { firstName: true, lastName: true, email: true, accountNumber: true, postcode: true } }
        }
      }
    },
    orderBy: { scannedAt: 'desc' }
  })
  res.json(returns)
})

// POST /api/returns/:id/resolve
router.post('/:id/resolve', async (req, res) => {
  const rm = await prisma.returnMail.findFirst({
    where: { id: req.params.id, dispatch: { tenantId: req.user.tenantId } }
  })
  if (!rm) return res.status(404).json({ error: 'Not found' })

  const updated = await prisma.returnMail.update({
    where: { id: req.params.id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: req.user.id,
      notes:      req.body.notes ?? rm.notes,
    }
  })
  res.json(updated)
})

module.exports = router
