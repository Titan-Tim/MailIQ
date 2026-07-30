const jwt = require('jsonwebtoken')
const prisma = require('../db')

async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  // Accept the token from the Authorization header, or from a ?auth= / ?token=
  // query param — needed for <embed>/<iframe> file previews (e.g. the PDF
  // viewer), which cannot set request headers.
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : (req.query.auth || req.query.token)
  if (!token) {
    return res.status(401).json({ error: 'Unauthorised' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: true }
    })
    if (!user) return res.status(401).json({ error: 'Unauthorised' })
    if (!user.isActive) return res.status(403).json({ error: 'Account deactivated' })

    req.isPlatformAdmin = isPlatformAdmin(user)
    // Tenant-level gates don't apply to the provider (platform admin).
    if (!req.isPlatformAdmin) {
      if (user.tenant.status === 'SUSPENDED') {
        return res.status(403).json({ error: 'Account suspended', reason: user.tenant.suspendReason || undefined })
      }
      if (user.tenant.licenceExpiresAt && new Date() > user.tenant.licenceExpiresAt) {
        return res.status(403).json({ error: 'Licence expired', reason: 'Your Mail-IQ licence has expired. Please contact your provider.' })
      }
    }
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Platform admin = the provider (Tim). Set via the isPlatformAdmin flag, or by
// matching PLATFORM_ADMIN_EMAIL (for bootstrapping without a DB edit).
function isPlatformAdmin(user) {
  const envEmail = (process.env.PLATFORM_ADMIN_EMAIL || '').toLowerCase().trim()
  return !!user.isPlatformAdmin || (!!envEmail && user.email.toLowerCase() === envEmail)
}

function requirePlatformAdmin(req, res, next) {
  if (req.isPlatformAdmin) return next()
  return res.status(403).json({ error: 'Platform admin only' })
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

module.exports = { requireAuth, requireRole, requirePlatformAdmin, isPlatformAdmin }
