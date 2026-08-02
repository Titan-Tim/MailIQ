/*
 * First-run bootstrap (on-prem). If the database has NO tenants yet, create the
 * initial tenant + SUPER_ADMIN from environment variables:
 *   BOOTSTRAP_ORG, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, [BOOTSTRAP_ADMIN_NAME]
 *
 * Idempotent and non-fatal: if a tenant already exists, or the vars aren't all
 * set, it exits 0 without changing anything (so the API still starts). On-prem
 * entitlements come from the signed licence, so enabledModules here is just a
 * placeholder the licence overrides.
 */
const bcrypt = require('bcryptjs')
const prisma = require('../src/db')

async function main() {
  const count = await prisma.tenant.count()
  if (count > 0) { console.log('[bootstrap] tenant already exists — nothing to do'); return }

  const org = (process.env.BOOTSTRAP_ORG || '').trim()
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').toLowerCase().trim()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
  if (!org || !email || !password) {
    console.warn('[bootstrap] no tenants and BOOTSTRAP_ORG/ADMIN_EMAIL/ADMIN_PASSWORD not all set — skipping first-run setup')
    return
  }
  if (password.length < 8) { console.warn('[bootstrap] BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters — skipping'); return }

  const slug = org.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org'
  const tenant = await prisma.tenant.create({ data: { name: org, slug, enabledModules: ['inbound', 'outbound'] } })
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id, email, name: (process.env.BOOTSTRAP_ADMIN_NAME || '').trim() || null,
      role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false,
    },
  })
  // Give the admin a personal inbox (best-effort).
  try { const { ensurePersonalMailbox } = require('../src/services/inbound-access'); await ensurePersonalMailbox(admin) } catch (e) { console.error('[bootstrap] personal mailbox:', e.message) }

  console.log(`[bootstrap] created tenant "${org}" (/${slug}) and admin ${email}`)
}

// Never block boot on bootstrap: log and exit 0 regardless.
main()
  .catch((e) => console.error('[bootstrap] error:', e.message))
  .finally(async () => { try { await prisma.$disconnect() } catch {} process.exit(0) })
