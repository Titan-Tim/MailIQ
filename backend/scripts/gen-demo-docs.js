/**
 * One-off: generate a Mail-IQ demo document pack (PDFs + recipients CSV).
 * Run from the backend dir so pdf-lib resolves:  node scripts/gen-demo-docs.js
 */
const fs = require('fs')
const path = require('path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const OUT = 'C:\\Mail-IQ Demo Documents'
const VIOLET = rgb(0.486, 0.227, 0.929)
const INK = rgb(0.12, 0.12, 0.14)
const GREY = rgb(0.42, 0.42, 0.46)
const LIGHT = rgb(0.90, 0.90, 0.93)
const A4 = [595.28, 841.89]
const M = 56

function dir(p) { fs.mkdirSync(path.join(OUT, p), { recursive: true }) }

async function newDoc() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  return { pdf, font, bold }
}
function wrap(text, font, size, maxW) {
  const out = []
  for (const para of String(text).split('\n')) {
    if (para === '') { out.push(''); continue }
    let line = ''
    for (const w of para.split(' ')) {
      const t = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w }
      else line = t
    }
    if (line) out.push(line)
  }
  return out
}
function save(sub, name, bytes) {
  dir(sub)
  fs.writeFileSync(path.join(OUT, sub, name), bytes)
  console.log('  ✓', path.join(sub, name))
}

// ── Generic company letterhead ────────────────────────────────────────────────
function letterhead(page, bold, font, org, tagline) {
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: VIOLET })
  page.drawText(org, { x: M, y: height - 54, size: 20, font: bold, color: INK })
  if (tagline) page.drawText(tagline, { x: M, y: height - 72, size: 9.5, font, color: GREY })
  page.drawLine({ start: { x: M, y: height - 86 }, end: { x: width - M, y: height - 86 }, thickness: 0.8, color: LIGHT })
  return height - 116
}
function paras(page, font, bold, y, blocks, size = 11, lead = 15.5) {
  const maxW = A4[0] - M * 2
  for (const b of blocks) {
    const f = b.bold ? bold : font
    for (const ln of wrap(b.text, f, b.size || size, maxW)) {
      if (y < 90) return y
      page.drawText(ln, { x: M, y, size: b.size || size, font: f, color: b.color || INK })
      y -= b.lead || lead
    }
    y -= b.gap != null ? b.gap : 8
  }
  return y
}

// ── Letters (outbound) ────────────────────────────────────────────────────────
async function letter({ org, tagline, date, to, subject, body, signName, signTitle, footer }) {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  let y = letterhead(page, bold, font, org, tagline)
  y = paras(page, font, bold, y, [
    { text: date, color: GREY, size: 10, gap: 14 },
    ...to.split('\n').map((t, i) => ({ text: t, bold: i === 0, gap: 0, lead: 14 })),
  ])
  y -= 10
  y = paras(page, font, bold, y, [{ text: subject, bold: true, size: 12, gap: 12 }])
  y = paras(page, font, bold, y, body.map((t) => ({ text: t })))
  y -= 6
  y = paras(page, font, bold, y, [
    { text: 'Yours sincerely,', gap: 26 },
    { text: signName, bold: true, gap: 0, lead: 14 },
    { text: signTitle, color: GREY, size: 10 },
  ])
  if (footer) page.drawText(footer, { x: M, y: 56, size: 8, font, color: GREY })
  return pdf.save()
}

// ── Invoice (inbound) ─────────────────────────────────────────────────────────
async function invoice({ supplier, supplierLines, invoiceNo, date, due, billTo, lines, vatRate = 0.20 }) {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: rgb(0.15, 0.35, 0.6) })
  page.drawText(supplier, { x: M, y: height - 54, size: 18, font: bold, color: INK })
  let sy = height - 70
  for (const l of supplierLines) { page.drawText(l, { x: M, y: sy, size: 9, font, color: GREY }); sy -= 12 }
  page.drawText('INVOICE', { x: width - M - 140, y: height - 54, size: 26, font: bold, color: rgb(0.15, 0.35, 0.6) })
  page.drawText(`Invoice no:  ${invoiceNo}`, { x: width - M - 200, y: height - 78, size: 10, font, color: INK })
  page.drawText(`Date:          ${date}`, { x: width - M - 200, y: height - 92, size: 10, font, color: INK })
  page.drawText(`Payment due: ${due}`, { x: width - M - 200, y: height - 106, size: 10, font: bold, color: INK })

  let y = height - 150
  page.drawText('Bill to:', { x: M, y, size: 9, font: bold, color: GREY }); y -= 14
  for (const l of billTo.split('\n')) { page.drawText(l, { x: M, y, size: 10.5, font, color: INK }); y -= 13 }

  y -= 20
  page.drawRectangle({ x: M, y: y - 4, width: width - M * 2, height: 22, color: rgb(0.94, 0.96, 0.99) })
  page.drawText('Description', { x: M + 8, y, size: 9.5, font: bold, color: INK })
  page.drawText('Qty', { x: width - M - 190, y, size: 9.5, font: bold, color: INK })
  page.drawText('Unit £', { x: width - M - 140, y, size: 9.5, font: bold, color: INK })
  page.drawText('Amount £', { x: width - M - 75, y, size: 9.5, font: bold, color: INK })
  y -= 24
  let net = 0
  for (const l of lines) {
    const amt = l.qty * l.unit; net += amt
    page.drawText(l.desc, { x: M + 8, y, size: 10, font, color: INK })
    page.drawText(String(l.qty), { x: width - M - 190, y, size: 10, font, color: INK })
    page.drawText(l.unit.toFixed(2), { x: width - M - 140, y, size: 10, font, color: INK })
    page.drawText(amt.toFixed(2), { x: width - M - 75, y, size: 10, font, color: INK })
    y -= 18
  }
  const vat = net * vatRate, total = net + vat
  y -= 6; page.drawLine({ start: { x: width - M - 220, y: y + 8 }, end: { x: width - M, y: y + 8 }, thickness: 0.7, color: LIGHT })
  const row = (label, val, b) => { page.drawText(label, { x: width - M - 190, y, size: 10, font: b ? bold : font, color: INK }); page.drawText('£' + val.toFixed(2), { x: width - M - 75, y, size: 10, font: b ? bold : font, color: INK }); y -= 16 }
  row('Net total', net); row(`VAT @ ${(vatRate * 100).toFixed(0)}%`, vat); row('Amount due', total, true)
  y -= 20
  page.drawText('Please remit payment within the stated terms, quoting the invoice number above.', { x: M, y, size: 9, font, color: GREY })
  page.drawText('Registered in England. VAT applied where shown. This is a demo document.', { x: M, y: 56, size: 8, font, color: GREY })
  return pdf.save()
}

// ── Special offer flyer (library insert) ──────────────────────────────────────
async function flyer() {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.97, 0.96, 1) })
  page.drawRectangle({ x: 0, y: height - 200, width, height: 200, color: VIOLET })
  page.drawText('NEW YEAR', { x: M, y: height - 96, size: 40, font: bold, color: rgb(1, 1, 1) })
  page.drawText('EXCLUSIVE OFFER', { x: M, y: height - 148, size: 40, font: bold, color: rgb(1, 1, 1) })
  page.drawText('20% OFF', { x: M, y: height - 300, size: 64, font: bold, color: VIOLET })
  const body = [
    'all managed print & document contracts',
    'booked before 31 January.',
    '',
    'Upgrade your office print fleet and cut running costs with a',
    'fully managed Titan Business Machines agreement — servicing,',
    'toner and support included, with transparent per-page pricing.',
    '',
    'Quote reference  NY-OFFER  when you get in touch.',
  ]
  let y = height - 360
  for (const l of body) { page.drawText(l, { x: M, y, size: 13, font: l.startsWith('Quote') ? bold : font, color: INK }); y -= 22 }
  page.drawRectangle({ x: M, y: 120, width: width - M * 2, height: 44, color: VIOLET })
  page.drawText('Call 0800 000 0000  ·  offers@titanbm.co.uk  ·  titanbm.co.uk', { x: M + 20, y: 137, size: 13, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Demo promotional insert · Titan Business Machines', { x: M, y: 56, size: 8, font, color: GREY })
  return pdf.save()
}

// ── Directions "map" (library insert) ─────────────────────────────────────────
async function directionsMap() {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  letterhead(page, bold, font, 'Titan Business Machines', 'How to find us')
  // schematic map box
  const mx = M, my = height - 470, mw = width - M * 2, mh = 320
  page.drawRectangle({ x: mx, y: my, width: mw, height: mh, color: rgb(0.95, 0.97, 0.95), borderColor: LIGHT, borderWidth: 1 })
  // roads
  const road = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 10, color: rgb(0.8, 0.83, 0.86) })
  road(mx + 30, my + 60, mx + mw - 30, my + 60)                 // High Street (horizontal)
  road(mx + mw / 2, my + 20, mx + mw / 2, my + mh - 20)          // Mill Lane (vertical)
  road(mx + 30, my + mh - 70, mx + mw - 120, my + mh - 70)       // Station Road
  page.drawText('High Street (A420)', { x: mx + 40, y: my + 44, size: 9, font, color: GREY })
  page.drawText('Mill Lane', { x: mx + mw / 2 + 6, y: my + mh - 40, size: 9, font, color: GREY })
  page.drawText('Station Road', { x: mx + 40, y: my + mh - 86, size: 9, font, color: GREY })
  // destination marker
  const dx = mx + mw / 2 + 40, dy = my + 120
  page.drawRectangle({ x: dx, y: dy, width: 70, height: 40, color: VIOLET })
  page.drawText('US', { x: dx + 24, y: dy + 13, size: 14, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Titan House, 14 Mill Lane', { x: dx - 6, y: dy - 14, size: 8.5, font, color: INK })
  // station marker
  page.drawRectangle({ x: mx + 40, y: my + mh - 110, width: 16, height: 16, color: rgb(0.15, 0.35, 0.6) })
  page.drawText('Rail station', { x: mx + 60, y: my + mh - 106, size: 8.5, font, color: INK })

  let y = my - 24
  page.drawText('Getting here', { x: M, y, size: 13, font: bold, color: INK }); y -= 20
  const steps = [
    'By car:  Leave the A420 at the Mill Lane junction. Titan House is 200m along Mill Lane on the right, opposite the library. Visitor parking is on-site.',
    'By rail:  We are a 6-minute walk from the station — turn left onto Station Road, then right onto Mill Lane.',
    'Postcode for sat-nav:  OX14 3ML',
  ]
  for (const s of steps) { for (const ln of wrap(s, font, 10.5, width - M * 2)) { page.drawText(ln, { x: M, y, size: 10.5, font, color: INK }); y -= 15 } y -= 6 }
  page.drawText('Demo directions insert · Titan Business Machines', { x: M, y: 56, size: 8, font, color: GREY })
  return pdf.save()
}

async function main() {
  console.log('Generating demo pack →', OUT)

  // ═══ OUTBOUND ═══
  save('Outbound/Letters to Send', 'invitation-open-evening.pdf', await letter({
    org: 'Titan Business Machines', tagline: 'Managed print & document solutions',
    date: '18 November 2024',
    to: 'Mr J Whitfield\n14 Maple Avenue\nBirmingham\nB1 2AB',
    subject: 'You’re invited — Titan Showroom Open Evening, Thursday 5th December',
    body: [
      'Dear Mr Whitfield,',
      'We would be delighted to welcome you to our winter Open Evening at Titan House on Thursday 5th December, from 6:00pm until 8:30pm.',
      'It’s a relaxed chance to see our latest managed-print and document-workflow technology in action, meet the team, and enjoy some seasonal refreshments. There is no charge to attend and guests are welcome.',
      'A map and directions are enclosed to help you find us. Please RSVP by 29th November to events@titanbm.co.uk or on 0800 000 0000 so we can be sure to save you a place.',
      'We look forward to seeing you there.',
    ],
    signName: 'Sandra Okonkwo', signTitle: 'Events & Marketing, Titan Business Machines',
    footer: 'Titan Business Machines · Titan House, 14 Mill Lane, Abingdon OX14 3ML · Demo document',
  }))

  save('Outbound/Letters to Send', 'christmas-closure-notice.pdf', await letter({
    org: 'Titan Business Machines', tagline: 'Managed print & document solutions',
    date: '2 December 2024',
    to: 'Dear Valued Client',
    subject: 'Festive closure & a New Year thank-you',
    body: [
      'As the year draws to a close, we wanted to write and thank you for your continued custom throughout 2024 — it is genuinely appreciated.',
      'Please note our offices will be closed for the festive period from 5:00pm on Tuesday 24th December, reopening at 9:00am on Thursday 2nd January. During this time our online support portal remains available, and urgent service issues can be logged at support@titanbm.co.uk for prioritised attention in the New Year.',
      'By way of thanks, we’ve enclosed an exclusive New Year offer for you. We hope it’s of interest as you plan for the year ahead.',
      'From everyone at Titan Business Machines, we wish you a peaceful Christmas and a prosperous New Year.',
    ],
    signName: 'David Chen', signTitle: 'Managing Director, Titan Business Machines',
    footer: 'Titan Business Machines · Titan House, 14 Mill Lane, Abingdon OX14 3ML · Demo document',
  }))

  save('Outbound/Library Inserts', 'special-offer-flyer.pdf', await flyer())
  save('Outbound/Library Inserts', 'directions-map.pdf', await directionsMap())

  // Recipients CSV
  const rows = [
    ['title', 'firstName', 'lastName', 'companyName', 'accountNumber', 'email', 'addressLine1', 'city', 'postcode', 'deliveryMethod'],
    ['Mr', 'James', 'Whitfield', '', 'ACC-1001', 'james.whitfield@example.com', '14 Maple Avenue', 'Birmingham', 'B1 2AB', 'DIGITAL'],
    ['Mrs', 'Sandra', 'Okonkwo', 'Okonkwo Interiors', 'ACC-1002', 'sandra@okonkwo-interiors.example', '7 Elm Street', 'Manchester', 'M2 4CD', 'POST'],
    ['Dr', 'Robert', 'Chen', 'Chen Dental Ltd', 'ACC-1003', 'r.chen@chendental.example', '82 Oak Road', 'Leeds', 'LS1 3EF', 'AUTO'],
    ['Ms', 'Priya', 'Nair', '', 'ACC-1004', 'priya.nair@example.com', '31 Cedar Close', 'Bristol', 'BS1 5GH', 'DIGITAL'],
    ['Mr', 'Thomas', 'Boyle', 'Boyle & Sons', 'ACC-1005', '', '5 Birch Way', 'Glasgow', 'G1 2JK', 'POST'],
    ['Miss', 'Ava', 'Lindqvist', '', 'ACC-1006', 'ava.l@example.com', '19 Willow Court', 'Cardiff', 'CF10 1LM', 'AUTO'],
    ['Mr', 'Daniel', 'Osei', 'Osei Logistics', 'ACC-1007', 'daniel@oseilogistics.example', '44 Ash Grove', 'Sheffield', 'S1 2NO', 'DIGITAL'],
    ['Mrs', 'Helen', 'Marsh', '', 'ACC-1008', 'helen.marsh@example.com', '2 Rowan Terrace', 'Newcastle', 'NE1 4PQ', 'POST'],
  ]
  const csv = rows.map((r) => r.map((c) => /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\r\n')
  dir('Outbound/Recipients'); fs.writeFileSync(path.join(OUT, 'Outbound/Recipients', 'demo-recipients.csv'), csv); console.log('  ✓ Outbound/Recipients/demo-recipients.csv')

  // ═══ INBOUND — supplier invoices ═══
  const BILL = 'Accounts Department\nTitan Business Machines\nTitan House, 14 Mill Lane\nAbingdon OX14 3ML'
  const invs = [
    { supplier: 'Acme Supplies Ltd', supplierLines: ['Unit 5, Kestrel Park', 'Reading RG1 8AA', 'VAT 442 1180 09'], invoiceNo: 'ACM-4471', date: '03 Dec 2024', due: '02 Jan 2025', lines: [{ desc: 'A4 copier paper (box of 5 reams)', qty: 12, unit: 18.5 }, { desc: 'Toner cartridge — black', qty: 6, unit: 64.0 }] },
    { supplier: 'Brightoffice Stationery', supplierLines: ['221 Harbour Road', 'Bristol BS1 6WE', 'VAT 771 3320 15'], invoiceNo: 'BOS-22319', date: '28 Nov 2024', due: '28 Dec 2024', lines: [{ desc: 'Assorted stationery bundle', qty: 3, unit: 42.75 }, { desc: 'Whiteboard markers (pack of 10)', qty: 8, unit: 6.9 }] },
    { supplier: 'Northgate Fuels', supplierLines: ['Depot 3, Canal Way', 'Leeds LS9 2QP', 'VAT 118 9987 22'], invoiceNo: 'NGF-90872', date: '30 Nov 2024', due: '14 Dec 2024', lines: [{ desc: 'Fleet fuel card — November usage', qty: 1, unit: 1240.55 }] },
    { supplier: 'CityPrint Media', supplierLines: ['12 Foundry Lane', 'Manchester M4 1DA', 'VAT 553 0091 77'], invoiceNo: 'CPM-5563', date: '01 Dec 2024', due: '31 Dec 2024', lines: [{ desc: 'Brochure print run (1,000)', qty: 1, unit: 480.0 }, { desc: 'Design & artwork', qty: 4, unit: 55.0 }] },
    { supplier: 'Summit IT Services', supplierLines: ['Innovation House', 'Cambridge CB2 3RT', 'VAT 990 4412 03'], invoiceNo: 'SIT-1120', date: '29 Nov 2024', due: '29 Dec 2024', lines: [{ desc: 'Managed IT support — monthly', qty: 1, unit: 850.0 }, { desc: 'Additional user licences', qty: 5, unit: 12.0 }] },
  ]
  for (const iv of invs) {
    const safe = iv.supplier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    save('Inbound/Supplier Invoices', `invoice-${safe}-${iv.invoiceNo}.pdf`, await invoice({ ...iv, billTo: BILL }))
  }

  // ═══ INBOUND — legal post (LawDoc-style) ═══
  save('Inbound/Legal Post', 'solicitor-letter-hartwell-2024-0192.pdf', await letter({
    org: 'Hartwell & Grange Solicitors', tagline: 'Commercial & Litigation · Regulated by the SRA',
    date: '27 November 2024',
    to: 'The Legal Department\nTitan Business Machines\nTitan House, 14 Mill Lane\nAbingdon OX14 3ML',
    subject: 'WITHOUT PREJUDICE — Our client: Meridian Office Group  ·  Our ref: HG/2024/0192',
    body: [
      'Dear Sirs,',
      'We act for Meridian Office Group in connection with the supply agreement dated 4 March 2023. We write further to correspondence regarding the disputed service charges under clause 7 of that agreement.',
      'Our client remains willing to resolve this matter without recourse to proceedings. We should be grateful if your legal representatives would confirm, within 14 days of the date of this letter, whether your organisation is prepared to enter into without-prejudice discussions.',
      'Please quote our reference HG/2024/0192 in all future correspondence. This letter is sent without prejudice to our client’s rights, all of which are expressly reserved.',
    ],
    signName: 'A. Hartwell', signTitle: 'Partner, Hartwell & Grange Solicitors',
    footer: 'Hartwell & Grange LLP · Regulated by the Solicitors Regulation Authority · Demo document',
  }))

  save('Inbound/Legal Post', 'court-notice-claim-HC-2024-556.pdf', await letter({
    org: 'HM Courts & Tribunals Service', tagline: 'Business and Property Courts',
    date: '25 November 2024',
    to: 'Titan Business Machines (Defendant)\nTitan House, 14 Mill Lane\nAbingdon OX14 3ML',
    subject: 'NOTICE OF HEARING — Claim No. HC-2024-000556',
    body: [
      'To the above-named Defendant,',
      'TAKE NOTICE that a case management hearing in the above claim has been listed before the Court. You are required to note the reference number and ensure your legal representatives are in attendance.',
      'Claim number:  HC-2024-000556.  Please ensure all directions previously ordered are complied with, and that any bundles are lodged with the Court not less than 7 clear days before the hearing date.',
      'Failure to comply with directions or to attend may result in an order being made in your absence.',
    ],
    signName: 'For the Court Manager', signTitle: 'Business and Property Courts',
    footer: 'HM Courts & Tribunals Service · Demo document — not a real court notice',
  }))

  save('Inbound/Legal Post', 'settlement-letter-marsden-2024-0207.pdf', await letter({
    org: 'Marsden Vale LLP', tagline: 'Solicitors & Notaries',
    date: '29 November 2024',
    to: 'The Directors\nTitan Business Machines\nAbingdon OX14 3ML',
    subject: 'Proposed settlement — Our ref: MV/LIT/2024/0207',
    body: [
      'Dear Sirs,',
      'We are instructed by Parkway Facilities Ltd in relation to the outstanding matter between our respective clients. Following review, our client is prepared to propose terms of settlement in full and final satisfaction of all claims.',
      'The proposed terms are set out in the enclosed schedule. This offer is open for acceptance for a period of 21 days from the date of this letter, after which it will lapse automatically unless extended in writing.',
      'We look forward to hearing from your solicitors. Kindly quote reference MV/LIT/2024/0207 in reply.',
    ],
    signName: 'C. Marsden', signTitle: 'Senior Partner, Marsden Vale LLP',
    footer: 'Marsden Vale LLP · Regulated by the SRA · Demo document',
  }))

  // README
  const readme = `MAIL-IQ — DEMO DOCUMENT PACK
================================

A set of realistic (but fictional) documents for demonstrating Mail-IQ end to end.
All documents are clearly marked as demos.

OUTBOUND  (things Titan Business Machines sends to its clients)
  Letters to Send/
    invitation-open-evening.pdf   – event invitation (pairs with the directions map)
    christmas-closure-notice.pdf  – festive closure letter (pairs with the special offer)
  Library Inserts/                 (upload these to Insert Library, then attach to letters)
    special-offer-flyer.pdf        – New Year 20% offer
    directions-map.pdf             – "how to find us" map + directions
  Recipients/
    demo-recipients.csv            – 8 recipients to import on the Recipients page
                                     (mix of DIGITAL / POST / AUTO delivery)

INBOUND  (post that arrives for Titan Business Machines)
  Supplier Invoices/               – 5 invoices → should route to your "Accounts" mailbox
  Legal Post/                      – 3 solicitor/court letters → route to a "Legal" mailbox

SUGGESTED DEMO FLOW
  Outbound: import recipients → upload the two inserts to the Library →
            upload a letter in the Outbox → attach an insert → choose delivery → send.
  Inbound:  add mailboxes (Accounts, Legal, + a default) and routing rules
            (invoice→Accounts, legal→Legal) → drop the invoices and legal letters
            through "Log incoming post" and watch them route.

Generated for the Mail-IQ demo instance.
`
  fs.writeFileSync(path.join(OUT, 'README.txt'), readme); console.log('  ✓ README.txt')
  console.log('\nDone.')
}
main().catch((e) => { console.error(e); process.exit(1) })
