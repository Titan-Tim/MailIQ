/**
 * PDF Composition Service
 *
 * Takes an uploaded PDF and:
 *   1. Overlays the recipient's address in the window-envelope zone
 *   2. Stamps a Code 128 barcode (dispatch code) bottom-right of page 1
 *   3. Appends any insert documents as additional pages
 *
 * Returns a Buffer of the composed PDF.
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const bwipjs = require('bwip-js')
const storage = require('./storage')

const MM = 2.8346   // 1 mm in PDF points
const A4_H = 841.89 // A4 height in points

// ── Address overlay ──────────────────────────────────────────────────────────

/**
 * Build ordered address lines from recipient + optional override.
 */
function buildAddressLines(recipient, addressOverride) {
  const o = addressOverride || {}
  const fullName = [
    o.title      ?? recipient?.title,
    o.firstName  ?? recipient?.firstName,
    o.lastName   ?? (recipient?.lastName || ''),
  ].filter(Boolean).join(' ')

  return [
    fullName,
    o.companyName   ?? recipient?.companyName,
    o.addressLine1  ?? recipient?.addressLine1,
    o.addressLine2  ?? recipient?.addressLine2,
    o.city          ?? recipient?.city,
    o.county        ?? recipient?.county,
    o.postcode      ?? recipient?.postcode,
  ].filter(l => l && l.trim())
}

// ── Barcode ───────────────────────────────────────────────────────────────────

async function generateBarcodePng(text) {
  return bwipjs.toBuffer({
    bcid:            'code128',
    text:            text,
    scale:           2,
    height:          10,
    includetext:     false,
    backgroundcolor: 'ffffff',
  })
}

// ── Main compose function ─────────────────────────────────────────────────────

/**
 * @param {object} dispatch     - Dispatch record from DB
 * @param {object|null} recipient - Recipient record (or null if unmatched)
 * @param {object[]} inserts    - Array of Insert records, each with .fileKey
 * @param {object} tenant       - Tenant record (carries addressZone config)
 * @returns {Buffer} composed PDF bytes
 */
async function composeDispatch(dispatch, recipient, inserts, tenant) {
  // Load original document
  const originalBytes = storage.readFile(dispatch.originalFileKey)
  const pdfDoc = await PDFDocument.load(originalBytes)

  const helvetica     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const { width: pageW, height: pageH } = firstPage.getSize()

  // ── Address overlay ──────────────────────────────────────────────────────
  if (recipient || dispatch.addressOverride) {
    const addrLines = buildAddressLines(recipient, dispatch.addressOverride)

    // Zone config from tenant (stored in mm, convert to pt)
    const zoneX = (tenant?.addressZoneX ?? 20) * MM
    const zoneY = (tenant?.addressZoneY ?? 49) * MM   // mm from top
    const zoneH = (tenant?.addressZoneHeight ?? 35) * MM

    // PDF y=0 is bottom; convert top-of-zone from page top
    const zoneTopY = pageH - zoneY              // y of top of window
    const lineH    = 11                         // pt between lines
    const fontSize = 9
    const padding  = 4                          // pt inside zone top

    addrLines.slice(0, 6).forEach((line, i) => {
      const font = i === 0 ? helveticaBold : helvetica
      firstPage.drawText(line, {
        x:    zoneX + 2,
        y:    zoneTopY - padding - i * lineH,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: (tenant?.addressZoneWidth ?? 85) * MM - 4,
      })
    })
  }

  // ── Barcode overlay ───────────────────────────────────────────────────────
  const barcodeText = dispatch.barcodeCode
  try {
    const barcodePng = await generateBarcodePng(barcodeText)
    const barcodeImg = await pdfDoc.embedPng(barcodePng)

    const bW = 42 * MM   // barcode width in pt
    const bH = 14 * MM   // barcode height in pt
    const bX = pageW - bW - 8 * MM   // right-aligned with 8mm margin
    const bY = 8 * MM                // 8mm from bottom

    firstPage.drawImage(barcodeImg, { x: bX, y: bY, width: bW, height: bH })

    // Tiny reference text under barcode
    firstPage.drawText(barcodeText, {
      x: bX,
      y: bY - 6,
      size: 5.5,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    })
  } catch (barcodeErr) {
    console.error('Barcode generation error:', barcodeErr)
    // Non-fatal — continue without barcode
  }

  // ── Append inserts ────────────────────────────────────────────────────────
  for (const ins of inserts) {
    try {
      const insBytes = storage.readFile(ins.fileKey)
      const insPdf   = await PDFDocument.load(insBytes)
      const copied   = await pdfDoc.copyPages(insPdf, insPdf.getPageIndices())
      copied.forEach(p => pdfDoc.addPage(p))
    } catch (insErr) {
      console.error(`Failed to append insert ${ins.id}:`, insErr)
      // Non-fatal — skip this insert
    }
  }

  const composedBytes = await pdfDoc.save()
  return Buffer.from(composedBytes)
}

/**
 * Merge multiple PDFs (by fileKey) into a single print-ready PDF.
 * Used when generating a print batch.
 * @param {string[]} fileKeys  ordered list of storage file keys
 * @returns {Buffer}
 */
async function mergePdfs(fileKeys) {
  const merged = await PDFDocument.create()
  for (const key of fileKeys) {
    try {
      const bytes = storage.readFile(key)
      const src   = await PDFDocument.load(bytes)
      const pages = await merged.copyPages(src, src.getPageIndices())
      pages.forEach(p => merged.addPage(p))
    } catch (e) {
      console.error(`mergePdfs: failed to load ${key}:`, e)
    }
  }
  return Buffer.from(await merged.save())
}

module.exports = { composeDispatch, mergePdfs }
