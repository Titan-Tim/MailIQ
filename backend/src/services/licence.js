/**
 * Licence / entitlement resolver.
 *
 * Single source of truth for "what is this tenant/instance entitled to" — the
 * enabled modules and the licence expiry. Middleware gates, the login response,
 * and the portal all read through getLicence() so the rule lives in one place.
 *
 * TWO MODES, chosen automatically:
 *
 *  • SaaS (default): entitlements come from the Tenant record (enabledModules,
 *    licenceExpiresAt). The provider controls the database, so this is trusted.
 *
 *  • On-prem: when a SIGNED licence is configured (env MAILIQ_LICENCE or
 *    MAILIQ_LICENCE_FILE), it OVERRIDES the database for the whole instance —
 *    because on-prem the customer controls the database, so a DB flag can't be
 *    trusted. The licence is an RS256 JWT signed by the provider's private key
 *    and verified here with the bundled public key. Tamper or wrong key = no
 *    modules; past expiry = locked with a renewal message.
 *
 * Mint/verify tooling and the keypair live in backend/licence/.
 */
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')

const MODULES = ['inbound', 'outbound']
const DEFAULT_MODULES = ['inbound', 'outbound']

function readPublicKey() {
  if (process.env.MAILIQ_LICENCE_PUBLIC_KEY) return process.env.MAILIQ_LICENCE_PUBLIC_KEY.replace(/\\n/g, '\n')
  try { return fs.readFileSync(path.join(__dirname, '..', '..', 'licence', 'licence-public.pem'), 'utf8') } catch { return null }
}
function readLicenceToken() {
  if (process.env.MAILIQ_LICENCE) return process.env.MAILIQ_LICENCE.trim()
  if (process.env.MAILIQ_LICENCE_FILE) { try { return fs.readFileSync(process.env.MAILIQ_LICENCE_FILE, 'utf8').trim() } catch { return null } }
  return null
}

// Verify + parse the signed licence ONCE (cached). Expiry is recomputed per call
// so a licence can lapse while the process runs. Returns null in SaaS mode.
let _parsed
function parseSignedLicence() {
  if (_parsed !== undefined) return _parsed
  const token = readLicenceToken()
  if (!token) { _parsed = null; return _parsed } // SaaS mode
  const pub = readPublicKey()
  if (!pub) { _parsed = { valid: false, reason: 'No licence public key is configured on this instance.' }; return _parsed }
  try {
    const c = jwt.verify(token, pub, { algorithms: ['RS256'], ignoreExpiration: true })
    _parsed = {
      valid: true,
      org: c.org || null,
      modules: Array.isArray(c.modules) ? c.modules.filter((m) => MODULES.includes(m)) : [],
      expiresAt: c.exp ? new Date(c.exp * 1000) : (c.expiresAt ? new Date(c.expiresAt) : null),
      maxUsers: c.maxUsers || null,
      licenceId: c.jti || null,
    }
  } catch (e) {
    _parsed = { valid: false, reason: 'The licence on this instance is invalid (' + e.message + ').' }
  }
  return _parsed
}

// Resolve the effective licence. `tenant` is used only in SaaS mode.
function getLicence(tenant) {
  const signed = parseSignedLicence()
  if (signed) {
    // On-prem signed-licence mode — governs the whole instance; DB is ignored.
    if (!signed.valid) {
      return { source: 'signed', valid: false, invalid: true, modules: [], expiresAt: null, expired: false, reason: signed.reason, hasModule: () => false }
    }
    const expiresAt = signed.expiresAt || null
    const expired = !!(expiresAt && new Date() > expiresAt)
    return {
      source: 'signed', valid: true, invalid: false, org: signed.org, maxUsers: signed.maxUsers,
      modules: signed.modules, expiresAt, expired,
      reason: expired ? 'Your Mail-IQ licence has expired. Please contact your provider to renew it.' : null,
      hasModule: (m) => signed.modules.includes(m),
    }
  }
  // SaaS mode — entitlements from the tenant record.
  const raw = Array.isArray(tenant?.enabledModules) ? tenant.enabledModules.filter((m) => MODULES.includes(m)) : []
  const modules = raw.length ? raw : DEFAULT_MODULES // never lock a tenant out of everything by accident
  const expiresAt = tenant?.licenceExpiresAt || null
  const expired = !!(expiresAt && new Date() > expiresAt)
  return {
    source: 'db', valid: true, invalid: false, modules, expiresAt, expired,
    reason: expired ? 'Your Mail-IQ licence has expired. Please contact your provider.' : null,
    hasModule: (m) => modules.includes(m),
  }
}

// Instance-level status for boot logging / diagnostics (not tenant-specific).
function licenceStatus() {
  const s = parseSignedLicence()
  if (!s) return { mode: 'saas' }
  if (!s.valid) return { mode: 'on-prem', valid: false, reason: s.reason }
  const expired = !!(s.expiresAt && new Date() > s.expiresAt)
  return { mode: 'on-prem', valid: true, org: s.org, modules: s.modules, expiresAt: s.expiresAt, expired, maxUsers: s.maxUsers }
}

module.exports = { MODULES, DEFAULT_MODULES, getLicence, licenceStatus }
