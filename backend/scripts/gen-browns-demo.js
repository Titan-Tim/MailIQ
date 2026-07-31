/**
 * Generate a CHUNKY single-law-firm demo batch for Mail-IQ.
 *
 *   node scripts/gen-browns-demo.js
 *
 * Scenario: "Browns Solicitors" is the prospect. Their day's incoming post is
 * scanned as ONE PDF, documents separated by QR separator sheets:
 *   • 6 legal letters — each quotes a Browns matter reference in ONE consistent
 *     format  (BRN/YYYY/NNNN)  → classify as "legal", export to Proclaim named
 *     by the reference (e.g. BRN-2024-0142.pdf).
 *   • 4 supplier invoices → classify as "invoice", forward to Invoice-IQ.
 *   • 2 general letters → classify as "general", stay in the mailroom mailbox.
 *
 * Filing rule to set in the portal for the demo:
 *   Legal   → document type "legal", format  BRN/####/####, filename {ref}.pdf, target Proclaim
 *   Invoice → document type "invoice", format BLANK (forward), target Invoice-IQ
 *
 * Output:
 *   C:\Mail-IQ Demo Documents\Hot Folder Batches\browns-solicitors-demo-batch.pdf
 *   C:\Mail-IQ Demo Documents\Browns Solicitors Demo\   (the individual PDFs, for reference)
 */
const fs = require('fs')
const path = require('path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const OUT = 'C:\\Mail-IQ Demo Documents'
const SEP = path.join(OUT, 'Separator Sheet', 'mailiq-separator-sheet.pdf')
const INK = rgb(0.12, 0.12, 0.14)
const GREY = rgb(0.42, 0.42, 0.46)
const LIGHT = rgb(0.90, 0.90, 0.93)
const NAVY = rgb(0.10, 0.20, 0.42)
const A4 = [595.28, 841.89]
const M = 56

// ── shared helpers (self-contained; mirror gen-demo-docs.js) ──────────────────
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
function paras(page, font, bold, y, blocks, size = 11, lead = 15.5) {
  const maxW = A4[0] - M * 2
  for (const b of blocks) {
    const f = b.bold ? bold : font
    for (const ln of wrap(b.text, f, b.size || size, maxW)) {
      if (y < 80) return y
      page.drawText(ln, { x: M, y, size: b.size || size, font: f, color: b.color || INK })
      y -= b.lead || lead
    }
    y -= b.gap != null ? b.gap : 8
  }
  return y
}
function letterhead(page, bold, font, org, tagline, accent = NAVY) {
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: accent })
  page.drawText(org, { x: M, y: height - 54, size: 20, font: bold, color: INK })
  if (tagline) page.drawText(tagline, { x: M, y: height - 72, size: 9.5, font, color: GREY })
  page.drawLine({ start: { x: M, y: height - 86 }, end: { x: width - M, y: height - 86 }, thickness: 0.8, color: LIGHT })
  return height - 116
}
async function letter({ org, tagline, accent, date, to, subject, body, signName, signTitle, footer }) {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  let y = letterhead(page, bold, font, org, tagline, accent)
  y = paras(page, font, bold, y, [
    { text: date, color: GREY, size: 10, gap: 14 },
    ...to.split('\n').map((t, i) => ({ text: t, bold: i === 0, gap: 0, lead: 14 })),
  ])
  y -= 10
  y = paras(page, font, bold, y, [{ text: subject, bold: true, size: 12, gap: 12 }])
  y = paras(page, font, bold, y, body.map((t) => ({ text: t })))
  y -= 6
  y = paras(page, font, bold, y, [
    { text: 'Yours faithfully,', gap: 26 },
    { text: signName, bold: true, gap: 0, lead: 14 },
    { text: signTitle, color: GREY, size: 10 },
  ])
  if (footer) page.drawText(footer, { x: M, y: 52, size: 8, font, color: GREY })
  return pdf.save()
}
async function invoice({ supplier, supplierLines, invoiceNo, date, due, billTo, lines, vatRate = 0.20 }) {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  const blue = rgb(0.15, 0.35, 0.6)
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: blue })
  page.drawText(supplier, { x: M, y: height - 54, size: 18, font: bold, color: INK })
  let sy = height - 70
  for (const l of supplierLines) { page.drawText(l, { x: M, y: sy, size: 9, font, color: GREY }); sy -= 12 }
  page.drawText('INVOICE', { x: width - M - 140, y: height - 54, size: 26, font: bold, color: blue })
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
  page.drawText('Registered in England. This is a demo document.', { x: M, y: 52, size: 8, font, color: GREY })
  return pdf.save()
}

// ── document data ─────────────────────────────────────────────────────────────
// 6 legal letters — all quote a Browns matter ref in one format: BRN/YYYY/NNNN
const BROWNS_TO = 'The Litigation Team\nBrowns Solicitors\n18 King Street\nManchester M2 6AG'

const LEGAL = [
  { ref: 'BRN/2024/0142', file: 'court-notice-of-hearing-BRN-2024-0142.pdf', doc: {
    org: 'HM Courts & Tribunals Service', tagline: 'Business and Property Courts', accent: rgb(0.5, 0.1, 0.1),
    date: '9 December 2024', to: BROWNS_TO,
    subject: 'NOTICE OF HEARING — Claim No. HC-2024-000914  ·  Your ref: BRN/2024/0142',
    body: [
      'Dear Sirs,',
      'TAKE NOTICE that a case management hearing in the above claim has been listed before the Court. You are acting for the Claimant and are required to ensure that counsel and instructing solicitors are in attendance.',
      'Please quote your reference BRN/2024/0142 and the claim number in all future correspondence with the Court. All directions previously ordered must be complied with, and trial bundles lodged not less than 7 clear days before the hearing.',
      'Failure to attend or to comply with directions may result in an order being made in your client’s absence.',
    ],
    signName: 'For the Court Manager', signTitle: 'Business and Property Courts',
    footer: 'HM Courts & Tribunals Service · Demo document — not a real court notice' } },

  { ref: 'BRN/2024/0318', file: 'without-prejudice-marsden-BRN-2024-0318.pdf', doc: {
    org: 'Marsden Vale LLP', tagline: 'Solicitors & Notaries · Regulated by the SRA', accent: rgb(0.20, 0.28, 0.16),
    date: '6 December 2024', to: BROWNS_TO,
    subject: 'WITHOUT PREJUDICE — Delgado v Ashworth  ·  Your ref: BRN/2024/0318',
    body: [
      'Dear Sirs,',
      'We act for Mr Ashworth in the above matter. We write further to your letter of 21 November concerning the disputed boundary and the associated claim for damages.',
      'Our client remains willing to resolve this dispute without recourse to further proceedings. We are instructed to propose a without-prejudice meeting between the parties’ solicitors before the next hearing.',
      'Kindly confirm within 14 days whether your client will agree to such a meeting. Please quote your reference BRN/2024/0318 in reply. This letter is written without prejudice and all our client’s rights are reserved.',
    ],
    signName: 'C. Marsden', signTitle: 'Senior Partner, Marsden Vale LLP',
    footer: 'Marsden Vale LLP · Regulated by the Solicitors Regulation Authority · Demo document' } },

  { ref: 'BRN/2023/0907', file: 'client-instruction-proceedings-BRN-2023-0907.pdf', doc: {
    org: 'Pennine Facilities Group', tagline: 'Property & Estates', accent: rgb(0.16, 0.24, 0.34),
    date: '5 December 2024', to: BROWNS_TO,
    subject: 'Instructions to issue proceedings — Your ref: BRN/2023/0907',
    body: [
      'Dear Sirs,',
      'Thank you for your advice of 28 November. Having considered your view of the merits, we confirm our instruction for you to issue proceedings against the contractor in respect of the defective works at our Salford site.',
      'We understand a claim will be filed at Court and that the matter may proceed to trial if not settled. Please keep us informed of each step and of the anticipated costs as the claim progresses.',
      'Please continue to use our reference and yours (BRN/2023/0907) on all documents.',
    ],
    signName: 'D. Ferguson', signTitle: 'Head of Estates, Pennine Facilities Group',
    footer: 'Pennine Facilities Group · Demo document' } },

  { ref: 'BRN/2024/0563', file: 'tribunal-notice-BRN-2024-0563.pdf', doc: {
    org: 'Employment Tribunal', tagline: 'Manchester Employment Tribunal', accent: rgb(0.5, 0.1, 0.1),
    date: '4 December 2024', to: BROWNS_TO,
    subject: 'NOTICE OF PRELIMINARY HEARING — Case 2410883/2024  ·  Your ref: BRN/2024/0563',
    body: [
      'Dear Sirs,',
      'You are recorded as representative for the Respondent. The Tribunal has listed a preliminary hearing to determine case management directions in the above proceedings.',
      'Please confirm your availability and that of the Respondent’s witnesses. Any application to postpone must be made in writing with reasons. Quote your reference BRN/2024/0563 in all correspondence with the Tribunal office.',
    ],
    signName: 'For the Regional Employment Judge', signTitle: 'Manchester Employment Tribunal',
    footer: 'Employment Tribunals · Demo document — not a real tribunal notice' } },

  { ref: 'BRN/2024/0771', file: 'counsel-advice-claim-BRN-2024-0771.pdf', doc: {
    org: 'Deansgate Chambers', tagline: 'Barristers · Commercial & Chancery', accent: rgb(0.24, 0.14, 0.30),
    date: '3 December 2024', to: BROWNS_TO,
    subject: 'Advice on merits — Harbrook Ltd claim  ·  Your ref: BRN/2024/0771',
    body: [
      'Dear Instructing Solicitors,',
      'Thank you for your instructions to advise on the prospects of the above claim. In my opinion the claim in contract is properly arguable and, if the correspondence is as described, the Court is likely to find the term was incorporated.',
      'I would advise that proceedings be issued promptly given the approaching limitation date. I am available for a conference before the claim is filed should you wish to take further instructions.',
      'Please retain your reference BRN/2024/0771 on the brief for my clerks.',
    ],
    signName: 'Miss E. Okafor', signTitle: 'Counsel, Deansgate Chambers',
    footer: 'Deansgate Chambers · Demo document' } },

  { ref: 'BRN/2023/0489', file: 'settlement-offer-hartwell-BRN-2023-0489.pdf', doc: {
    org: 'Hartwell & Grange Solicitors', tagline: 'Commercial & Litigation · Regulated by the SRA', accent: rgb(0.20, 0.28, 0.16),
    date: '2 December 2024', to: BROWNS_TO,
    subject: 'WITHOUT PREJUDICE SAVE AS TO COSTS — Your ref: BRN/2023/0489',
    body: [
      'Dear Sirs,',
      'We act for Meridian Office Group. Further to the exchange of witness statements, our client is prepared to make an offer in full and final settlement of the claim and counterclaim between the parties.',
      'The terms are set out in the enclosed schedule. This offer is made without prejudice save as to costs and is open for acceptance for 21 days, after which our client reserves the right to bring it to the attention of the Court on the question of costs.',
      'Please quote your reference BRN/2023/0489 in your response.',
    ],
    signName: 'A. Hartwell', signTitle: 'Partner, Hartwell & Grange Solicitors',
    footer: 'Hartwell & Grange LLP · Regulated by the SRA · Demo document' } },
]

// 4 supplier invoices billed to Browns — classify as "invoice" (forward to Invoice-IQ)
const BILL = 'Accounts Department\nBrowns Solicitors LLP\n18 King Street\nManchester M2 6AG'
const INVOICES = [
  { supplier: 'LexPoint Office Supplies', supplierLines: ['Unit 9, Trafford Park', 'Manchester M17 1AB', 'VAT 481 2290 61'], invoiceNo: 'LP-88214', date: '01 Dec 2024', due: '31 Dec 2024', lines: [{ desc: 'A4 archive boxes (pack of 10)', qty: 15, unit: 9.4 }, { desc: 'Toner cartridge — mono', qty: 4, unit: 72.0 }, { desc: 'Manuscript files (box of 50)', qty: 6, unit: 21.5 }] },
  { supplier: 'DX Secure Mail', supplierLines: ['Exchange House', 'Leeds LS1 4DY', 'VAT 662 1174 30'], invoiceNo: 'DX-405591', date: '30 Nov 2024', due: '14 Dec 2024', lines: [{ desc: 'Document Exchange — monthly membership', qty: 1, unit: 168.0 }, { desc: 'Additional secure pouches', qty: 20, unit: 1.85 }] },
  { supplier: 'Thameside IT Managed Services', supplierLines: ['Innovation Court', 'Warrington WA1 1XX', 'VAT 903 5521 18'], invoiceNo: 'TIT-3097', date: '29 Nov 2024', due: '29 Dec 2024', lines: [{ desc: 'Managed IT support & case-management hosting', qty: 1, unit: 1150.0 }, { desc: 'Additional fee-earner licences', qty: 8, unit: 14.0 }] },
  { supplier: 'Citywide Legal Searches Ltd', supplierLines: ['5 Cornmarket Street', 'Chester CH1 2HT', 'VAT 771 6642 09'], invoiceNo: 'CLS-51120', date: '28 Nov 2024', due: '28 Dec 2024', lines: [{ desc: 'Local authority searches', qty: 7, unit: 34.0 }, { desc: 'Bankruptcy & priority searches', qty: 12, unit: 4.5 }, { desc: 'Office copy entries', qty: 9, unit: 3.0 }] },
]

// 2 general letters — no legal/invoice signal words, addressed to "Browns LLP"
// (avoiding the word "Solicitors" so the stub classifier lands them in general)
const GENERAL = [
  { file: 'networking-invitation-general.pdf', doc: {
    org: 'Thames Valley Business Network', tagline: 'Connecting local professionals', accent: rgb(0.10, 0.45, 0.40),
    date: '1 December 2024', to: 'The Office Manager\nBrowns LLP\n18 King Street\nManchester M2 6AG',
    subject: 'You’re invited — Winter Networking Breakfast, Friday 13th December',
    body: [
      'Dear Colleague,',
      'We would be delighted to welcome a representative from your practice to our Winter Networking Breakfast at the Bridgewater Rooms, from 8:00am until 10:00am.',
      'It’s a relaxed morning of introductions over breakfast, with a short talk from a guest speaker on building referral relationships across the professional community. Attendance is complimentary for member firms and their guests.',
      'Please let us know numbers by 9th December so we can reserve your places. We look forward to seeing you there.',
    ],
    signName: 'Rachel Tan', signTitle: 'Events Coordinator, Thames Valley Business Network',
    footer: 'Thames Valley Business Network · Demo document' } },

  { file: 'facilities-update-general.pdf', doc: {
    org: 'Evergreen Office Care', tagline: 'Workplace cleaning & facilities', accent: rgb(0.10, 0.45, 0.40),
    date: '27 November 2024', to: 'The Facilities Manager\nBrowns LLP\n18 King Street\nManchester M2 6AG',
    subject: 'Festive period service arrangements & a thank-you for 2024',
    body: [
      'Dear Customer,',
      'As the year draws to a close, we wanted to thank you for choosing Evergreen for your workplace care throughout 2024.',
      'Please note our cleaning teams will move to reduced festive hours from 24th December, resuming the usual schedule on 2nd January. There is nothing you need to do — your regular team will resume as normal in the New Year.',
      'From January we’re also switching to a new range of eco-certified products across all sites at no extra charge. We hope you have a restful break.',
    ],
    signName: 'Mark Ellison', signTitle: 'Account Manager, Evergreen Office Care',
    footer: 'Evergreen Office Care · Demo document' } },
]

// ── build ─────────────────────────────────────────────────────────────────────
async function append(target, bytes) {
  const src = await PDFDocument.load(bytes)
  const pages = await target.copyPages(src, src.getPageIndices())
  pages.forEach((p) => target.addPage(p))
}

async function main() {
  console.log('Generating Browns Solicitors demo batch →', OUT)
  const refDir = path.join(OUT, 'Browns Solicitors Demo')
  fs.mkdirSync(refDir, { recursive: true })

  // Generate every document (bytes), and keep individual copies for reference.
  const items = [] // { kind, bytes }
  for (const L of LEGAL) { const b = await letter(L.doc); fs.writeFileSync(path.join(refDir, L.file), b); items.push({ kind: 'legal', ref: L.ref, bytes: b }) }
  for (const iv of INVOICES) { const b = await invoice({ ...iv, billTo: BILL }); const f = `invoice-${iv.supplier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${iv.invoiceNo}.pdf`; fs.writeFileSync(path.join(refDir, f), b); items.push({ kind: 'invoice', bytes: b }) }
  for (const G of GENERAL) { const b = await letter(G.doc); fs.writeFileSync(path.join(refDir, G.file), b); items.push({ kind: 'general', bytes: b }) }

  // Interleave into a realistic mixed scan order.
  const byKind = { legal: items.filter(i => i.kind === 'legal'), invoice: items.filter(i => i.kind === 'invoice'), general: items.filter(i => i.kind === 'general') }
  const order = ['legal', 'invoice', 'legal', 'general', 'legal', 'invoice', 'legal', 'legal', 'invoice', 'general', 'invoice', 'legal']
  const seq = []
  for (const k of order) { const next = byKind[k].shift(); if (next) seq.push(next) }
  // append any leftovers (safety)
  for (const k of Object.keys(byKind)) for (const it of byKind[k]) seq.push(it)

  const sepBytes = fs.readFileSync(SEP)
  const batch = await PDFDocument.create()
  for (let i = 0; i < seq.length; i++) {
    if (i > 0) await append(batch, sepBytes) // separator between documents
    await append(batch, seq[i].bytes)
  }
  const outDir = path.join(OUT, 'Hot Folder Batches')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'browns-solicitors-demo-batch.pdf')
  const batchBytes = await batch.save()
  fs.writeFileSync(outFile, batchBytes)
  // Also drop the merged "scanned post" file into the Browns folder, next to the
  // individual PDFs, so it can be shown/dropped from one place.
  const refCopy = path.join(refDir, 'browns-inbound-post-scan.pdf')
  fs.writeFileSync(refCopy, batchBytes)

  const legalRefs = LEGAL.map(l => l.ref).join(', ')
  console.log(`  ✓ ${outFile}`)
  console.log(`     ${seq.length} documents, ${seq.length - 1} separators`)
  console.log(`     legal: ${byKindCount(seq, 'legal')}  invoice: ${byKindCount(seq, 'invoice')}  general: ${byKindCount(seq, 'general')}`)
  console.log(`     legal refs: ${legalRefs}`)
  console.log(`  ✓ merged "scanned post" copy → ${refCopy}`)
  console.log(`  ✓ individual PDFs → ${refDir}`)
  console.log('\nDemo filing rules to set in the portal:')
  console.log('  Legal   → type "legal",  format  BRN/####/####,  filename {ref}.pdf,  target Proclaim')
  console.log('  Invoice → type "invoice", format BLANK (forward),               target Invoice-IQ')
  console.log('\nDone.')
}
function byKindCount(seq, k) { return seq.filter(i => i.kind === k).length }
main().catch((e) => { console.error(e); process.exit(1) })
