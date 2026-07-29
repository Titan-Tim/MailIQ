/**
 * User management API — SUPER_ADMIN only, tenant-scoped.
 * Mounted at /api/users.
 *
 * Invite flow: create the user with a temporary password + mustChangePassword,
 * email it via Resend; the user is forced to set their own password on first
 * login (handled by the existing change-password flow).
 */
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const prisma = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { sendInviteEmail } = require('../services/email')
const { ensurePersonalMailbox } = require('../services/inbound-access')

const ROLES = ['SUPER_ADMIN', 'OPERATOR', 'VIEWER']

function generateTempPassword() {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$'
  const pick = (chars) => chars[crypto.randomInt(chars.length)]
  const required = [pick(upper), pick(lower), pick(digits), pick(special)]
  const all = upper + lower + digits
  const extra = Array.from({ length: 8 }, () => pick(all))
  const chars = [...required, ...extra]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role,
  isActive: u.isActive, mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt,
})

// All routes require an authenticated SUPER_ADMIN.
router.use(requireAuth, requireRole('SUPER_ADMIN'))

// GET /api/users — list users in the caller's tenant
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  })
  res.json({ users: users.map(publicUser) })
})

// POST /api/users — invite a new user
router.post('/', async (req, res) => {
  const { email, name, role } = req.body
  const cleanEmail = (email || '').toLowerCase().trim()
  if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'A valid email is required' })
  }
  const finalRole = ROLES.includes(role) ? role : 'OPERATOR'

  // Email is globally unique in the schema — surface a clear conflict.
  const existing = await prisma.user.findUnique({ where: { email: cleanEmail } })
  if (existing) {
    return res.status(409).json({ error: 'A user with that email already exists' })
  }

  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  const user = await prisma.user.create({
    data: {
      tenantId: req.user.tenantId,
      email: cleanEmail,
      name: name?.trim() || null,
      role: finalRole,
      passwordHash,
      mustChangePassword: true,
    },
  })

  // Every user gets their own private personal mailbox.
  try { await ensurePersonalMailbox(user) } catch (e) { console.error('personal mailbox create failed:', e.message) }

  let emailSent = false
  try {
    emailSent = await sendInviteEmail(user, req.user.tenant, tempPassword, req.user.name || req.user.email)
  } catch (err) {
    console.error('Invite email failed:', err.message)
  }

  // If email isn't configured, return the temp password so the admin can share it manually.
  res.status(201).json({
    user: publicUser(user),
    emailSent,
    ...(emailSent ? {} : { tempPassword }),
  })
})

// PUT /api/users/:id — update name and/or role
router.put('/:id', async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!target) return res.status(404).json({ error: 'Not found' })

  const { name, role } = req.body
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }
  // Don't let an admin change their own role (avoids locking out the last admin).
  if (target.id === req.user.id && role && role !== target.role) {
    return res.status(400).json({ error: "You can't change your own role" })
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      name: name !== undefined ? (name?.trim() || null) : undefined,
      role: role ?? undefined,
    },
  })
  res.json({ user: publicUser(updated) })
})

// POST /api/users/:id/deactivate
router.post('/:id/deactivate', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You can't deactivate your own account" })
  }
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!target) return res.status(404).json({ error: 'Not found' })
  const updated = await prisma.user.update({ where: { id: target.id }, data: { isActive: false } })
  res.json({ user: publicUser(updated) })
})

// POST /api/users/:id/reactivate
router.post('/:id/reactivate', async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!target) return res.status(404).json({ error: 'Not found' })
  const updated = await prisma.user.update({ where: { id: target.id }, data: { isActive: true } })
  res.json({ user: publicUser(updated) })
})

// POST /api/users/:id/resend-invite — new temp password + re-send the invite
router.post('/:id/resend-invite', async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  })
  if (!target) return res.status(404).json({ error: 'Not found' })

  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 10)
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, mustChangePassword: true },
  })

  let emailSent = false
  try {
    emailSent = await sendInviteEmail(target, req.user.tenant, tempPassword, req.user.name || req.user.email)
  } catch (err) {
    console.error('Resend invite email failed:', err.message)
  }
  res.json({ emailSent, ...(emailSent ? {} : { tempPassword }) })
})

module.exports = router
