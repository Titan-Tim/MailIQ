/**
 * Licence / entitlement resolver.
 *
 * Single source of truth for "what is this tenant entitled to" — the enabled
 * modules and the licence expiry. Everything else (middleware gates, the login
 * response, the portal) reads through getLicence() so the rule lives in one place.
 *
 * SaaS: entitlements come from the Tenant record (below).
 * On-prem (future): a cryptographically SIGNED licence file/env will override
 * this — same returned shape — because on-prem the customer controls the
 * database, so a DB flag can't be trusted. See mailiq-onprem-modular-licence.
 */

const MODULES = ['inbound', 'outbound']
const DEFAULT_MODULES = ['inbound', 'outbound']

// Resolve the effective licence for a tenant record.
function getLicence(tenant) {
  const raw = Array.isArray(tenant?.enabledModules) ? tenant.enabledModules.filter((m) => MODULES.includes(m)) : []
  const modules = raw.length ? raw : DEFAULT_MODULES // never lock a tenant out of everything by accident
  const expiresAt = tenant?.licenceExpiresAt || null
  return {
    modules,
    expiresAt,
    hasModule: (m) => modules.includes(m),
    expired: !!(expiresAt && new Date() > new Date(expiresAt)),
  }
}

module.exports = { MODULES, DEFAULT_MODULES, getLicence }
