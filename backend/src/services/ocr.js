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

const DRIVER = process.env.OCR_DRIVER || 'stub'

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
async function extractStub({ buffer, fileName = '', hints = {} }) {
  const nameHint = (fileName || '').replace(/[._-]+/g, ' ')
  const text = hints.ocrText || `${nameHint}\n[stub OCR — no engine configured]`

  const documentType =
    hints.documentType ||
    (classify(`${hints.ocrText || ''} ${nameHint}`).type)

  const extractedName = hints.extractedName || guessAddressee(hints.ocrText || nameHint)

  // Confidence: high when a human/agent supplied structured hints, lower when we
  // only had the filename to go on. A real engine would return its own score.
  let confidence = 0.35
  if (hints.ocrText) confidence += 0.35
  if (hints.extractedName) confidence += 0.15
  if (hints.documentType) confidence += 0.15
  if (documentType !== 'general') confidence += 0.05
  confidence = Math.min(1, Number(confidence.toFixed(2)))

  return { text, extractedName, documentType, confidence, engine: 'stub' }
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
    case 'azure':    return extractUnimplemented('azure')
    case 'google':   return extractUnimplemented('google')
    case 'textract': return extractUnimplemented('textract')
    default:         return extractStub(input)
  }
}

module.exports = { extract, classify, guessAddressee, DRIVER }
