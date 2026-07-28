/**
 * Mail-IQ admin recovery tool (maintenance / one-off use).
 *
 * READ-ONLY by default: lists every user (email, role, tenant) so you can see
 * which account to recover.
 *
 * To reset a password, pass RESET_EMAIL and RESET_PASSWORD:
 *   RESET_EMAIL=you@example.com RESET_PASSWORD='NewPass123' node scripts/admin-tool.js
 * That sets the password and clears the force-change flag so you can log straight in.
 *
 * If RESET_EMAIL doesn't match any user, and CREATE=1 is set, it creates a new
 * SUPER_ADMIN in the first tenant with that email + password.
 *
 * Reads DATABASE_URL from the environment — run it with the PROD database URL
 * (e.g. via `railway run` so Railway injects it, or by exporting it yourself).
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    include: { tenant: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`\n=== Users in this database (${users.length}) ===`)
  for (const u of users) {
    console.log(
      ` • ${u.email}  [${u.role}]  tenant="${u.tenant?.name}" (${u.tenant?.slug})` +
      `${u.mustChangePassword ? '  (must-change-password)' : ''}`
    )
  }

  const email = process.env.RESET_EMAIL?.toLowerCase()
  const newPassword = process.env.RESET_PASSWORD
  if (!email || !newPassword) {
    console.log('\n(No RESET_EMAIL / RESET_PASSWORD provided — read-only listing done.)')
    return
  }

  const existing = users.find((u) => u.email === email)
  const hash = await bcrypt.hash(newPassword, 10)

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: hash, mustChangePassword: false },
    })
    console.log(`\n✓ Password reset for ${email}. You can now log in with the new password.`)
  } else if (process.env.CREATE === '1') {
    const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!tenant) { console.log('\n✗ No tenant exists to attach a new admin to.'); return }
    const created = await prisma.user.create({
      data: {
        tenantId: tenant.id, email, passwordHash: hash,
        name: 'Admin', role: 'SUPER_ADMIN', mustChangePassword: false,
      },
    })
    console.log(`\n✓ Created SUPER_ADMIN ${created.email} in tenant "${tenant.name}". Log in with the new password.`)
  } else {
    console.log(`\n✗ No user with email ${email}. Re-run with CREATE=1 to create a new SUPER_ADMIN with it.`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
