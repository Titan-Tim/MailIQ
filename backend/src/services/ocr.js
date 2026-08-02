/**
 * OCR / document-classification service — INBOUND module.
 *
 * Pluggable by design: everything downstream (routing, delivery, triage) talks
 * to the single `extract()` interface below, so the underlying engine can be
 * swapped from the zero-cost stub to Azure Document Intelligence, Google
 * Document AI, or AWS Textract without touching the pipeline.
 *
 * Select the driver with env OCR_DRIVER (default: "stub").
 *
 * extract(input) -> {
 *   text:          string,   // full extracted text
 *   extractedName: string,   // best-guess addressee / recipient
 *   documentType:  string,   // classified type: invoice | legal | hr | statement | general
 *   confidence:    number,   // 0..1 overall extraction confidence
 * }
 */

const { execFile } = require('child_process')
const { promisify } = require('util')
const os = require('os')
const fs = require('fs')
const path = require('path')
const execFileP = promisify(execFile)

const DRIVER = process.env.OCR_DRIVER || 'stub'

// Local (offline) OCR via the Tesseract binary — used by the on-prem image
// (apt install tesseract-ocr). SaaS stays on the 'stub' text-layer driver.
const TESS_BIN = process.env.TESSERACT_BIN || 'tesseract'
const TESS_LANG = process.env.TESSERACT_LANG || 'eng'
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 3)
const OCR_DPI = Number(process.env.OCR_DPI || 300)

// Document-type keyword signals used by the stub classifier.
const TYPE_SIGNALS = [
  { type: 'invoice',   words: ['invoice', 'remittance', 'amount due', 'vat', 'payable', 'purchase order', 'po number'] },
  { type: 'statement', words: ['statement', 'balance', 'account summary', 'sort code'] },
  { type: 'legal',     words: ['solicitor', 'claim', 'court', 'tribunal', 'without prejudice', 'notice of', 'proceedings'] },
  { type: 'hr',        words: ['payslip', 'p45', 'p60', 'contract of employment', 'grievance', 'annual leave'] },
]

/**
 * Very small heuristic classifier used by the stub driver and as a fallback.
 * Works over whatever text we have (OCR output, or hints supplied at intake).
 */
function classify(text = '') {
  const t = text.toLowerCase()
  let best = { type: 'general', hits: 0 }
  for (const sig of TYPE_SIGNALS) {
    const hits = sig.words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0)
    if (hits > best.hits) best = { type: sig.type, hits }
  }
  return best
}

/**
 * Naive addressee extraction: looks for a line after "FAO" / "Attn" / "Dear",
 * otherwise returns the first non-empty line. Good enough for the stub.
 */
function guessAddressee(text = '') {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const m = line.match(/^(?:fao|attn|attention|dear|for the attention of)[:\s]+(.+)$/i)
    if (m) return m[1].replace(/[,.]$/, '').trim()
  }
  return lines[0] || ''
}

/**
 * STUB driver.
 *
 * We do not have a real OCR engine wired yet, so the stub derives plausible
 * output from (a) any hints passed in at intake (ocrText / extractedName /
 * documentType — e.g. typed by an operator or supplied by a scan-email agent),
 * and (b) the file name. This lets the whole inbound pipeline and demo run
 * end-to-end with zero cloud cost. Replace with a real driver later.
 */
// mupdf is ESM-with-top-level-await — load it lazily via dynamic import and cache.
let _mupdf = null
async function getMupdf() { if (!_mupdf) _mupdf = await import('mupdf'); return _mupdf }

const looksLikePdf = (buf) => Buffer.isBuffer(buf) && buf.slice(0, 5).toString('latin1') === '%PDF-'

// Read the embedded text layer of a digital PDF (no OCR needed for text-based PDFs;
// genuinely scanned/image-only PDFs return '' and fall back to the file name / hints).
async function extractPdfText(buffer) {
  try {
    const mupdf = await getMupdf()
    const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf')
    const n = Math.min(doc.countPages(), 5)
    let t = ''
    for (let i = 0; i < n; i++) t += doc.loadPage(i).toStructuredText('preserve-whitespace').asText() + '\n'
    return t.trim()
  } catch { return '' }
}

async function extractStub({ buffer, fileName = '', hints = {} }) {
  const nameHint = (fileName || '').replace(/[._-]+/g, ' ')

  // Prefer supplied text, else the PDF's own text layer, else just the file name.
  let bodyText = hints.ocrText || ''
  let readText = false
  if (!bodyText && looksLikePdf(buffer)) {
    bodyText = await extractPdfText(buffer)
    readText = bodyText.length > 40
  }

  const basis = bodyText || nameHint
  const documentType = hints.documentType || classify(basis).type
  const extractedName = hints.extractedName || guessAddressee(bodyText || nameHint)
  const text = bodyText || `${nameHint}\n[stub OCR — no text layer; needs real OCR]`

  // Confidence: reading a real text layer is high-trust; filename-only is low.
  let confidence = 0.3
  if (readText) confidence = 0.8
  else if (hints.ocrText) confidence = 0.7
  if (hints.extractedName) confidence += 0.1
  if (hints.documentType) confidence += 0.1
  if (documentType !== 'general') confidence += 0.05
  confidence = Math.min(1, Number(confidence.toFixed(2)))

  return { text, extractedName, documentType, confidence, engine: readText ? 'text-layer' : 'stub' }
}

// ── Local OCR (Tesseract) driver ──────────────────────────────────────────────
// Rasterise pages with mupdf, then OCR each with the system tesseract binary.
// Fully offline (traineddata installed with the binary) — for scanned/image-only
// PDFs where there's no text layer to read.

let _tessChecked = false, _tessOk = false
async function tesseractAvailable() {
  if (_tessChecked) return _tessOk
  _tessChecked = true
  try { await execFileP(TESS_BIN, ['--version']); _tessOk = true }
  catch { _tessOk = false; console.warn(`[ocr] tesseract binary not found ("${TESS_BIN}") — image OCR disabled; digital PDFs still read via their text layer.`) }
  return _tessOk
}

async function rasterizePages(buffer, maxPages, dpi) {
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf')
  const n = Math.min(doc.countPages(), maxPages)
  const s = dpi / 72
  const mtx = mupdf.Matrix.scale(s, s)
  const pngs = []
  for (let i = 0; i < n; i++) {
    const pix = doc.loadPage(i).toPixmap(mtx, mupdf.ColorSpace.DeviceRGB, false, false)
    pngs.push(Buffer.from(pix.asPNG()))
  }
  return pngs
}

async function ocrPng(png) {
  const tmp = path.join(os.tmpdir(), `miq-ocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
  try {
    fs.writeFileSync(tmp, png)
    const { stdout } = await execFileP(TESS_BIN, [tmp, 'stdout', '-l', TESS_LANG], { maxBuffer: 32 * 1024 * 1024 })
    return (stdout || '').trim()
  } catch (e) { console.warn('[ocr] tesseract page failed:', e.message); return '' }
  finally { try { fs.unlinkSync(tmp) } catch { /* ignore */ } }
}

async function ocrPdf(buffer) {
  if (!looksLikePdf(buffer)) return ''
  if (!(await tesseractAvailable())) return ''
  let pngs
  try { pngs = await rasterizePages(buffer, OCR_MAX_PAGES, OCR_DPI) }
  catch (e) { console.warn('[ocr] rasterise failed:', e.message); return '' }
  let out = ''
  for (const png of pngs) { const t = await ocrPng(png); if (t) out += t + '\n' }
  return out.trim()
}

// Local driver: prefer a real text layer (free, exact); only OCR image-only PDFs.
async function extractLocal({ buffer, fileName = '', hints = {} }) {
  const nameHint = (fileName || '').replace(/[._-]+/g, ' ')
  let bodyText = hints.ocrText || ''
  let engine = 'stub'
  if (!bodyText && looksLikePdf(buffer)) {
    bodyText = await extractPdfText(buffer)
    if (bodyText.length > 40) engine = 'text-layer'
    else {
      const ocrText = await ocrPdf(buffer) // image-only PDF → real OCR
      if (ocrText && ocrText.length > bodyText.length) { bodyText = ocrText; engine = 'tesseract' }
    }
  }
  const basis = bodyText || nameHint
  const documentType = hints.documentType || classify(basis).type
  const extractedName = hints.extractedName || guessAddressee(bodyText || nameHint)
  const text = bodyText || `${nameHint}\n[no text layer; OCR unavailable]`

  let confidence = 0.3
  if (engine === 'text-layer') confidence = 0.8
  else if (engine === 'tesseract') confidence = 0.6
  else if (hints.ocrText) confidence = 0.7
  if (hints.extractedName) confidence += 0.1
  if (hints.documentType) confidence += 0.1
  if (documentType !== 'general') confidence += 0.05
  confidence = Math.min(1, Number(confidence.toFixed(2)))

  return { text, extractedName, documentType, confidence, engine }
}

// Placeholder drivers — throw until configured, so the swap is explicit.
async function extractUnimplemented(name) {
  throw new Error(
    `OCR_DRIVER="${name}" is not implemented yet. Set OCR_DRIVER=stub for now, ` +
    `or wire up the ${name} client in backend/src/services/ocr.js.`
  )
}

/**
 * Public interface. `input` = { buffer?, fileName?, hints? }.
 */
async function extract(input = {}) {
  switch (DRIVER) {
    case 'stub':     return extractStub(input)
    case 'tesseract':
    case 'local':    return extractLocal(input)
    case 'azure':    return extractUnimplemented('azure')
    case 'google':   return extractUnimplemented('google')
    case 'textract': return extractUnimplemented('textract')
    default:         return extractStub(input)
  }
}

module.exports = { extract, classify, guessAddressee, DRIVER }
