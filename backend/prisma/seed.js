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

  // ══════════════════════ INBOUND MODULE — demo data ════════════════════════
  // Mailboxes (internal routing destinations)
  const mailboxSeeds = [
    { name: 'Accounts',   department: 'Finance', email: 'accounts@titanbm.co.uk', keywords: 'invoice,remittance,accounts,payable,statement', isDefault: false },
    { name: 'HR',         department: 'People',  email: 'hr@titanbm.co.uk',       keywords: 'hr,payslip,p45,p60,employment,grievance',       isDefault: false },
    { name: 'Legal',      department: 'Legal',   email: 'legal@titanbm.co.uk',    keywords: 'solicitor,court,claim,notice,tribunal',         isDefault: false },
    { name: 'Reception',  department: 'Admin',   email: 'reception@titanbm.co.uk',keywords: '',                                              isDefault: true  },
  ]
  const mailboxes = {}
  for (const m of mailboxSeeds) {
    let mb = await prisma.mailbox.findFirst({ where: { tenantId: tenant.id, name: m.name } })
    if (!mb) mb = await prisma.mailbox.create({ data: { tenantId: tenant.id, ...m } })
    mailboxes[m.name] = mb
  }
  console.log('Sample mailboxes created')

  // Routing rules
  const ruleSeeds = [
    { name: 'Invoices → Accounts', documentType: 'invoice',   keyword: null,        priority: 100, target: 'Accounts' },
    { name: 'Statements → Accounts', documentType: 'statement', keyword: null,      priority: 90,  target: 'Accounts' },
    { name: 'Legal correspondence', documentType: 'legal',    keyword: null,        priority: 80,  target: 'Legal' },
    { name: 'HR / payroll',         documentType: 'hr',       keyword: null,        priority: 70,  target: 'HR' },
  ]
  for (const r of ruleSeeds) {
    const exists = await prisma.inboundRoutingRule.findFirst({ where: { tenantId: tenant.id, name: r.name } })
    if (!exists) {
      await prisma.inboundRoutingRule.create({
        data: {
          tenantId: tenant.id, name: r.name, documentType: r.documentType,
          keyword: r.keyword, priority: r.priority, matchType: 'ANY',
          targetMailboxId: mailboxes[r.target].id,
        },
      })
    }
  }
  console.log('Sample inbound rules created')

  // A couple of sample inbound items (skip if any already exist)
  const itemCount = await prisma.inboundItem.count({ where: { tenantId: tenant.id } })
  if (itemCount === 0) {
    const acc = mailboxes['Accounts']
    const i1 = await prisma.inboundItem.create({
      data: {
        tenantId: tenant.id, fileName: 'acme-invoice-4471.pdf', source: 'scan-email',
        ocrText: 'INVOICE  Acme Supplies Ltd  Amount due £1,240.00  VAT included',
        extractedName: 'Accounts Department', documentType: 'invoice', confidence: 0.9,
        status: 'DELIVERED', matchedMailboxId: acc.id, deliveredEmail: acc.email,
        deliveredAt: new Date(), routingReason: 'Matched rule "Invoices → Accounts" (type=invoice)',
      },
    })
    await prisma.inboundEvent.createMany({ data: [
      { itemId: i1.id, type: 'RECEIVED',  detail: 'source=scan-email', actor: 'system' },
      { itemId: i1.id, type: 'CLASSIFIED', detail: 'type=invoice', actor: 'system' },
      { itemId: i1.id, type: 'DELIVERED', detail: `Emailed ${acc.email}`, actor: 'system' },
    ]})

    // One low-confidence item to populate the triage queue
    await prisma.inboundItem.create({
      data: {
        tenantId: tenant.id, fileName: 'handwritten-letter.pdf', source: 'upload',
        ocrText: 'Dear Sir or Madam,  I am writing regarding...', extractedName: '',
        documentType: 'general', confidence: 0.3, status: 'TRIAGE',
        routingReason: 'No rule or keyword matched — sent to default mailbox "Reception"',
      },
    })
    console.log('Sample inbound items created (1 delivered, 1 in triage)')
  }

  console.log('\n✓ Seed complete')
  console.log('  Login: admin@titanbm.co.uk / changeme123')
  console.log('  Login: operator@titanbm.co.uk / changeme123')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
