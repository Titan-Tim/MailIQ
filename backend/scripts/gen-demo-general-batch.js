/**
 * Create a "general" document (no invoice/legal signals) and an all-scenarios
 * batch that demonstrates all three routing outcomes in one drop:
 *   invoice → Accounts,  legal → Legal,  general → Reception (default catch-all).
 *   node scripts/gen-demo-general-batch.js
 */
const fs = require('fs')
const path = require('path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const BASE = 'C:\\Mail-IQ Demo Documents'
const SEP = path.join(BASE, 'Separator Sheet', 'mailiq-separator-sheet.pdf')
const A4 = [595.28, 841.89]
const M = 56
const VIOLET = rgb(0.486, 0.227, 0.929)
const INK = rgb(0.12, 0.12, 0.14)
const GREY = rgb(0.42, 0.42, 0.46)

function wrap(text, font, size, maxW) {
  const out = []
  for (const para of text.split('\n')) {
    if (!para) { out.push(''); continue }
    let line = ''
    for (const w of para.split(' ')) {
      const t = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w } else line = t
    }
    if (line) out.push(line)
  }
  return out
}

async function generalLetter() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: VIOLET })
  page.drawText('Meridian Office Group', { x: M, y: height - 54, size: 20, font: bold, color: INK })
  page.drawText('Facilities & Workplace Services', { x: M, y: height - 72, size: 9.5, font, color: GREY })
  page.drawLine({ start: { x: M, y: height - 86 }, end: { x: width - M, y: height - 86 }, thickness: 0.8, color: rgb(0.9, 0.9, 0.93) })

  let y = height - 116
  const blocks = [
    { t: '9 December 2024', c: GREY, s: 10, gap: 14 },
    { t: 'Titan Business Machines\nTitan House, 14 Mill Lane\nAbingdon OX14 3ML', gap: 12 },
    { t: 'Re: Update to our main office contact details', b: true, s: 12, gap: 12 },
    { t: 'Dear Sir or Madam,' },
    { t: 'We are writing to let you know that our head office has recently relocated. From 1 January 2025 our main contact details will change, and we would be grateful if you could update your records accordingly.' },
    { t: 'Our new address is Meridian House, 5 Riverside Way, Reading RG1 7QT, and our main telephone number will be 0118 496 0000. Email addresses remain unchanged. There is no action required on your part beyond updating our details for future correspondence and deliveries.' },
    { t: 'Thank you for your continued partnership. Please don’t hesitate to get in touch if you have any questions.' },
    { t: 'Kind regards,', gap: 24 },
    { t: 'Elaine Fisher', b: true, gap: 0, lead: 13 },
    { t: 'Office Manager, Meridian Office Group', c: GREY, s: 10 },
  ]
  for (const bl of blocks) {
    const f = bl.b ? bold : font
    for (const ln of wrap(bl.t, f, bl.s || 11, width - M * 2)) { page.drawText(ln, { x: M, y, size: bl.s || 11, font: f, color: bl.c || INK }); y -= bl.lead || 15.5 }
    y -= bl.gap != null ? bl.gap : 8
  }
  page.drawText('This is a demo document.', { x: M, y: 56, size: 8, font, color: GREY })
  return pdf.save()
}

async function append(target, file) {
  const src = await PDFDocument.load(fs.readFileSync(file))
  const pages = await target.copyPages(src, src.getPageIndices())
  pages.forEach((p) => target.addPage(p))
}
async function appendBytes(target, bytes) {
  const src = await PDFDocument.load(bytes)
  const pages = await target.copyPages(src, src.getPageIndices())
  pages.forEach((p) => target.addPage(p))
}

async function main() {
  // Save the general letter into the demo pack
  const genBytes = await generalLetter()
  const genDir = path.join(BASE, 'Inbound', 'General Post')
  fs.mkdirSync(genDir, { recursive: true })
  const genFile = path.join(genDir, 'general-contact-details-update.pdf')
  fs.writeFileSync(genFile, genBytes)
  console.log('  ✓', genFile)

  // Build the all-scenarios batch: invoice + legal + general
  const b = await PDFDocument.create()
  await append(b, path.join(BASE, 'Inbound', 'Supplier Invoices', 'invoice-acme-supplies-ltd-ACM-4471.pdf'))
  await append(b, SEP)
  await append(b, path.join(BASE, 'Inbound', 'Legal Post', 'solicitor-letter-hartwell-2024-0192.pdf'))
  await append(b, SEP)
  await appendBytes(b, genBytes)
  const outDir = path.join(BASE, 'Hot Folder Batches')
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, 'demo-batch-all-scenarios.pdf')
  fs.writeFileSync(out, await b.save())
  console.log('  ✓', out, '(3 documents: invoice + legal + general)')
  console.log('Done.')
}
main().catch((e) => { console.error(e); process.exit(1) })
