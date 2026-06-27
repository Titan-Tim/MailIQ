const router = require('express').Router()
const multer = require('multer')
const { parse } = require('csv-parse/sync')
const prisma = require('../db')
const { requireAuth } = require('../middleware/auth')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.use(requireAuth)

// GET /api/recipients?search=&limit=&offset=
router.get('/', async (req, res) => {
  const { search, limit = '100', offset = '0', deliveryMethod } = req.query
  const where = { tenantId: req.user.tenantId, isActive: true }

  if (deliveryMethod) where.deliveryMethod = deliveryMethod
  if (search) {
    where.OR = [
      { lastName:     { contains: search, mode: 'insensitive' } },
      { firstName:    { contains: search, mode: 'insensitive' } },
      { email:        { contains: search, mode: 'insensitive' } },
      { accountNumber:{ contains: search, mode: 'insensitive' } },
      { reference:    { contains: search, mode: 'insensitive' } },
      { companyName:  { contains: search, mode: 'insensitive' } },
    ]
  }

  const [recipients, total] = await Promise.all([
    prisma.recipient.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take:  parseInt(limit),
      skip:  parseInt(offset),
      include: { _count: { select: { dispatches: true } } }
    }),
    prisma.recipient.count({ where })
  ])

  res.json({ recipients, total })
})

// GET /api/recipients/:id
router.get('/:id', async (req, res) => {
  const r = await prisma.recipient.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      dispatches: {
        orderBy: { uploadedAt: 'desc' },
        take: 20,
        select: { id: true, originalFileName: true, status: true, uploadedAt: true, reference: true }
      }
    }
  })
  if (!r) return res.status(404).json({ error: 'Not found' })
  res.json(r)
})

// POST /api/recipients
router.post('/', async (req, res) => {
  const {
    title, firstName, lastName, companyName,
    accountNumber, reference, externalId, email,
    addressLine1, addressLine2, city, county, postcode, country,
    deliveryMethod
  } = req.body
  if (!lastName) return res.status(400).json({ error: 'lastName required' })

  const recipient = await prisma.recipient.create({
    data: {
      tenantId: req.user.tenantId,
      title, firstName, lastName, companyName,
      accountNumber: accountNumber || null,
      reference: reference || null,
      externalId: externalId || null,
      email: email?.toLowerCase() || null,
      addressLine1, addressLine2, city, county,
      postcode: postcode?.toUpperCase() || null,
      country: country || 'GB',
      deliveryMethod: deliveryMethod || 'AUTO',
    }
  })
  res.status(201).json(recipient)
})

// PUT /api/recipients/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.recipient.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const {
    title, firstName, lastName, companyName,
    accountNumber, reference, externalId, email,
    addressLine1, addressLine2, city, county, postcode, country,
    deliveryMethod, isActive
  } = req.body

  const updated = await prisma.recipient.update({
    where: { id: req.params.id },
    data: {
      title, firstName, lastName, companyName,
      accountNumber: accountNumber ?? undefined,
      reference:     reference     ?? undefined,
      externalId:    externalId    ?? undefined,
      email:         email         !== undefined ? (email?.toLowerCase() || null) : undefined,
      addressLine1, addressLine2, city, county,
      postcode:       postcode !== undefined ? (postcode?.toUpperCase() || null) : undefined,
      country:        country  ?? undefined,
      deliveryMethod: deliveryMethod ?? undefined,
      isActive:       isActive !== undefined ? isActive : undefined,
    }
  })
  res.json(updated)
})

// DELETE /api/recipients/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.recipient.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId }
  })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  // Soft delete
  await prisma.recipient.update({ where: { id: req.params.id }, data: { isActive: false } })
  res.json({ deleted: true })
})

// POST /api/recipients/import  (CSV upload)
// Expected columns: lastName, firstName, title, companyName, accountNumber,
//   reference, email, addressLine1, addressLine2, city, county, postcode, deliveryMethod
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' })

  let rows
  try {
    rows = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV: ' + e.message })
  }

  const results = { created: 0, updated: 0, errors: [] }

  for (const row of rows) {
    try {
      if (!row.lastName) { results.errors.push('Row missing lastName — skipped'); continue }

      const data = {
        tenantId:      req.user.tenantId,
        title:         row.title         || null,
        firstName:     row.firstName      || null,
        lastName:      row.lastName,
        companyName:   row.companyName    || null,
        accountNumber: row.accountNumber  || null,
        reference:     row.reference      || null,
        externalId:    row.externalId     || null,
        email:         row.email?.toLowerCase() || null,
        addressLine1:  row.addressLine1   || null,
        addressLine2:  row.addressLine2   || null,
        city:          row.city           || null,
        county:        row.county         || null,
        postcode:      row.postcode?.toUpperCase() || null,
        country:       row.country        || 'GB',
        deliveryMethod:row.deliveryMethod || 'AUTO',
        isActive:      true,
      }

      // Try to match on accountNumber or externalId for upsert
      if (data.accountNumber) {
        const existing = await prisma.recipient.findFirst({
          where: { tenantId: req.user.tenantId, accountNumber: data.accountNumber }
        })
        if (existing) {
          await prisma.recipient.update({ where: { id: existing.id }, data })
          results.updated++
          continue
        }
      }

      await prisma.recipient.create({ data })
      results.created++
    } catch (e) {
      results.errors.push(`Row error: ${e.message}`)
    }
  }

  res.json(results)
})

module.exports = router
