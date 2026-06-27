const jwt = require('jsonwebtoken')
const prisma = require('../db')

async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' })
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: true }
    })
    if (!user) return res.status(401).json({ error: 'Unauthorised' })
    if (user.tenant.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Account suspended' })
    }
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

module.exports = { requireAuth, requireRole }
