const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const prisma  = require('../db')

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

module.exports = router
