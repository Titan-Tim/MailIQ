/**
 * Platform-admin API — the provider (Tim) managing all subscriber tenancies.
 * Mounted at /api/platform. Requires a platform admin (isPlatformAdmin flag or
 * PLATFORM_ADMIN_EMAIL). Operates ACROSS tenants — not tenant-scoped.
 */
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const prisma = require('../db')
const { requireAuth, requirePlatformAdmin } = require('../middleware/auth')
const { sendInviteEmail } = require('../services/email')
const { ensurePersonalMailbox } = require('../services/inbound-access')
const { MODULES, DEFAULT_MODULES } = require('../services/licence')

// Validate/normalise a requested module list; falls back to both if empty/invalid.
function cleanModules(input) {
  if (!Array.isArray(input)) return null
  const m = input.filter((x) => MODULES.includes(x))
  return m.length ? Array.from(new Set(m)) : DEFAULT_MODULES
}

router.use(requireAuth, requirePlatformAdmin)

function tempPassword() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ', a = 'abcdefghjkmnpqrstuvwxyz', d = '23456789', s = '!@#$'
  const pick = (c) => c[crypto.randomInt(c.length)]
  const chars = [pick(A), pick(a), pick(d), pick(s), ...Array.from({ length: 8 }, () => pick(A + a + d))]
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1);[chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}
const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

const shape = (t) => ({
  id: t.id, name: t.name, slug: t.slug, status: t.status, plan: t.plan,
  licenceExpiresAt: t.licenceExpiresAt, suspendReason: t.suspendReason, createdAt: t.createdAt,
  enabledModules: t.enabledModules,
  users: t._count?.users, inboundItems: t._count?.inboundItems,
})

// GET /api/platform/tenants
router.get('/tenants', async (req, res) => {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true, inboundItems: true } } },
  })
  res.json({ tenants: tenants.map(shape) })
})

// POST /api/platform/tenants — provision a clean tenant + its first admin
router.post('/tenants', async (req, res) => {
  const { name, adminEmail, adminName, slug: slugIn, licenceMonths, enabledModules } = req.body
  if (!name?.trim() || !adminEmail?.trim()) return res.status(400).json({ error: 'name and adminEmail are required' })
  const cleanEmail = adminEmail.toLowerCase().trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Invalid admin email' })
  if (await prisma.user.findUnique({ where: { email: cleanEmail } })) return res.status(409).json({ error: 'A user with that email already exists' })

  let slug = slugify(slugIn) || slugify(name) || 'tenant'
  while (await prisma.tenant.findUnique({ where: { slug } })) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`

  const months = Number(licenceMonths) > 0 ? Number(licenceMonths) : 12
  const expiry = new Date(); expiry.setMonth(expiry.getMonth() + months)

  const modules = cleanModules(enabledModules) || DEFAULT_MODULES
  const tenant = await prisma.tenant.create({ data: { name: name.trim(), slug, licenceExpiresAt: expiry, enabledModules: modules } })
  const tp = tempPassword()
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id, email: cleanEmail, name: adminName?.trim() || null,
      role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(tp, 10), mustChangePassword: true,
    },
  })
  try { await ensurePersonalMailbox(admin) } catch (e) { console.error('personal mailbox:', e.message) }

  let emailSent = false
  try { emailSent = await sendInviteEmail(admin, tenant, tp, 'Your Mail-IQ provider') } catch (e) { console.error('invite email:', e.message) }

  res.status(201).json({ tenant: shape(tenant), adminEmail: admin.email, emailSent, ...(emailSent ? {} : { tempPassword: tp }) })
})

// POST /api/platform/tenants/:id/suspend  — switch a tenant off
router.post('/tenants/:id/suspend', async (req, res) => {
  const t = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: req.body?.reason || null },
    include: { _count: { select: { users: true, inboundItems: true } } },
  })
  res.json(shape(t))
})

// POST /api/platform/tenants/:id/activate
router.post('/tenants/:id/activate', async (req, res) => {
  const t = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
    include: { _count: { select: { users: true, inboundItems: true } } },
  })
  res.json(shape(t))
})

// PUT /api/platform/tenants/:id/licence  — set an expiry date, or extend by months
router.put('/tenants/:id/licence', async (req, res) => {
  const { expiresAt, extendMonths } = req.body
  let licenceExpiresAt
  if (extendMonths) {
    const t = await prisma.tenant.findUnique({ where: { id: req.params.id } })
    if (!t) return res.status(404).json({ error: 'Not found' })
    const base = t.licenceExpiresAt && t.licenceExpiresAt > new Date() ? new Date(t.licenceExpiresAt) : new Date()
    base.setMonth(base.getMonth() + Number(extendMonths))
    licenceExpiresAt = base
  } else if (expiresAt) {
    licenceExpiresAt = new Date(expiresAt)
  } else {
    return res.status(400).json({ error: 'Provide expiresAt or extendMonths' })
  }
  const t = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { licenceExpiresAt },
    include: { _count: { select: { users: true, inboundItems: true } } },
  })
  res.json(shape(t))
})

// PUT /api/platform/tenants/:id/modules — set which modules the tenant is licensed for
router.put('/tenants/:id/modules', async (req, res) => {
  const modules = cleanModules(req.body?.enabledModules)
  if (!modules) return res.status(400).json({ error: 'enabledModules must be an array of: ' + MODULES.join(', ') })
  const t = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { enabledModules: modules },
    include: { _count: { select: { users: true, inboundItems: true } } },
  })
  res.json(shape(t))
})

module.exports = router
