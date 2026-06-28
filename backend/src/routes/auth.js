const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const crypto  = require('crypto')
const prisma  = require('../db')
const { requireAuth } = require('../middleware/auth')
const { sendPasswordResetEmail } = require('../services/email')

function generateTempPassword() {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
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

function signTokens(userId) {
  const access  = jwt.sign({ userId }, process.env.JWT_SECRET,         { expiresIn: '15m' })
  const refresh = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
  return { access, refresh }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { tenant: true }
  })
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  if (user.tenant.status === 'SUSPENDED') {
    return res.status(403).json({
      error: 'Account suspended',
      reason: user.tenant.suspendReason || 'Please contact support.'
    })
  }

  const { access, refresh } = signTokens(user.id)
  res.json({
    accessToken:  access,
    refreshToken: refresh,
    user: {
      id:   user.id,
      email: user.email,
      name:  user.name,
      role:  user.role,
      mustChangePassword: user.mustChangePassword,
      tenant: {
        id:         user.tenant.id,
        name:       user.tenant.name,
        slug:       user.tenant.slug,
        logoUrl:    user.tenant.logoUrl,
        brandColor: user.tenant.brandColor,
        plan:       user.tenant.plan,
      }
    }
  })
})

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' })
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    const { access, refresh } = signTokens(payload.userId)
    res.json({ accessToken: access, refreshToken: refresh })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

// POST /api/auth/change-password — authenticated user changes their own password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }

  const valid = await bcrypt.compare(currentPassword, req.user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash, mustChangePassword: false }
  })

  res.json({ ok: true })
})

// POST /api/auth/forgot-password — email a temporary password, force reset on next login
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' })
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { tenant: true }
  })

  // Always return ok regardless of whether the account exists.
  if (user) {
    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true }
    })
    try {
      await sendPasswordResetEmail(user, user.tenant, tempPassword)
    } catch (err) {
      console.error('Forgot-password email failed:', err.message)
    }
  }

  res.json({ ok: true })
})

module.exports = router
