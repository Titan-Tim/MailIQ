/**
 * Assemble ready-made batch scans (documents interleaved with QR separator
 * sheets) for demoing the hot folder. Drop one into the hot folder and the
 * agent splits it into separate documents.
 *   node scripts/gen-demo-batch.js
 */
const fs = require('fs')
const path = require('path')
const { PDFDocument } = require('pdf-lib')

const BASE = 'C:\\Mail-IQ Demo Documents'
const SEP = path.join(BASE, 'Separator Sheet', 'mailiq-separator-sheet.pdf')
const INV = (f) => path.join(BASE, 'Inbound', 'Supplier Invoices', f)
const LEG = (f) => path.join(BASE, 'Inbound', 'Legal Post', f)

async function append(target, file) {
  const src = await PDFDocument.load(fs.readFileSync(file))
  const pages = await target.copyPages(src, src.getPageIndices())
  pages.forEach((p) => target.addPage(p))
}

async function buildBatch(name, files) {
  const b = await PDFDocument.create()
  for (let i = 0; i < files.length; i++) {
    if (i > 0) await append(b, SEP) // separator between documents
    await append(b, files[i])
  }
  const outDir = path.join(BASE, 'Hot Folder Batches')
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, name)
  fs.writeFileSync(out, await b.save())
  console.log('  ✓', out, `(${files.length} documents)`)
}

async function main() {
  await buildBatch('demo-batch-mixed.pdf', [
    INV('invoice-acme-supplies-ltd-ACM-4471.pdf'),
    LEG('solicitor-letter-hartwell-2024-0192.pdf'),
    INV('invoice-brightoffice-stationery-BOS-22319.pdf'),
    LEG('court-notice-claim-HC-2024-556.pdf'),
  ])
  await buildBatch('demo-batch-invoices.pdf', [
    INV('invoice-northgate-fuels-NGF-90872.pdf'),
    INV('invoice-cityprint-media-CPM-5563.pdf'),
    INV('invoice-summit-it-services-SIT-1120.pdf'),
  ])
  console.log('Done.')
}
main().catch((e) => { console.error(e); process.exit(1) })
