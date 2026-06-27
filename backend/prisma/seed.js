const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { slug: 'titan' },
    update: {},
    create: {
      name:       'Titan Business Machines',
      slug:       'titan',
      brandColor: '#7c3aed',
      plan:       'BRANDED',
    }
  })
  console.log('Tenant:', tenant.name)

  // ── Admin user ────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('changeme123', 10)

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@titanbm.co.uk' },
    update: {},
    create: {
      tenantId:     tenant.id,
      email:        'admin@titanbm.co.uk',
      passwordHash: hash,
      name:         'MailIQ Admin',
      role:         'SUPER_ADMIN',
    }
  })
  console.log('Admin user:', admin.email)

  // ── Operator user ─────────────────────────────────────────────────────────
  const operator = await prisma.user.upsert({
    where:  { email: 'operator@titanbm.co.uk' },
    update: {},
    create: {
      tenantId:     tenant.id,
      email:        'operator@titanbm.co.uk',
      passwordHash: hash,
      name:         'Jane Operator',
      role:         'OPERATOR',
    }
  })
  console.log('Operator user:', operator.email)

  // ── Sample recipients ─────────────────────────────────────────────────────
  const recipients = [
    {
      title: 'Mr',  firstName: 'James',   lastName: 'Whitfield',
      accountNumber: 'ACC-001', email: 'james.whitfield@example.com',
      addressLine1: '14 Maple Avenue', city: 'Birmingham', postcode: 'B1 2AB',
      deliveryMethod: 'DIGITAL',
    },
    {
      title: 'Mrs', firstName: 'Sandra',  lastName: 'Okonkwo',
      accountNumber: 'ACC-002', email: null,
      addressLine1: '7 Elm Street', city: 'Manchester', postcode: 'M2 4CD',
      deliveryMethod: 'POST',
    },
    {
      title: 'Dr',  firstName: 'Robert',  lastName: 'Chen',
      accountNumber: 'ACC-003', email: 'r.chen@example.com',
      addressLine1: '82 Oak Road', city: 'Leeds', postcode: 'LS1 3EF',
      deliveryMethod: 'AUTO',
    },
  ]

  for (const r of recipients) {
    const exists = await prisma.recipient.findFirst({
      where: { tenantId: tenant.id, accountNumber: r.accountNumber }
    })
    if (!exists) {
      await prisma.recipient.create({ data: { tenantId: tenant.id, ...r } })
    }
  }
  console.log('Sample recipients created')

  // ── Sample insert documents ───────────────────────────────────────────────
  // (No real PDFs seeded — they require uploaded files.
  //  Placeholders are created so rules can reference them.)

  // ── Sample dispatch rule ─────────────────────────────────────────────────
  const existing = await prisma.dispatchRule.findFirst({
    where: { tenantId: tenant.id, name: 'All documents — no auto-inserts' }
  })
  if (!existing) {
    await prisma.dispatchRule.create({
      data: {
        tenantId:         tenant.id,
        name:             'All documents — no auto-inserts',
        documentType:     null,
        priority:         0,
        deliveryOverride: null,
      }
    })
  }
  console.log('Sample rule created')

  console.log('\n✓ Seed complete')
  console.log('  Login: admin@titanbm.co.uk / changeme123')
  console.log('  Login: operator@titanbm.co.uk / changeme123')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
