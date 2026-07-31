/**
 * Export/filing extraction — identify a reference (e.g. a case number) in a
 * document's text using a per-rule FORMAT MASK, and build the export filename.
 *
 * Mask syntax (what the user types when setting up a client's rule):
 *   #    a single digit
 *   #+   one or more digits
 *   everything else is a literal character (letters, - / . etc.)
 * e.g.  HC-####-######   HG/####/####   #######   ACC-#+
 *
 * Phase 1 = pattern only. A lookup-table method comes in Phase 2.
 */

// Convert a friendly mask to a regex source string.
function maskToRegex(mask) {
  let re = ''
  for (let i = 0; i < mask.length; i++) {
    const ch = mask[i]
    if (ch === '#') {
      if (mask[i + 1] === '+') { re += '\\d+'; i++ } else re += '\\d'
    } else {
      re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex specials
    }
  }
  return re
}

// Find the first reference matching `mask` in `text`. Returns the match or null.
function extractRef(text, mask) {
  if (!mask || !text) return null
  let rx
  try { rx = new RegExp(maskToRegex(mask)) } catch { return null }
  const m = rx.exec(text)
  return m ? m[0] : null
}

// Heuristic named-field extraction for invoices (works on a text layer / OCR text).
// A real document-AI invoice model can replace these for messy scans; the output
// (vendor / invoice number) and the filename tokens stay the same.
function extractInvoiceNumber(text) {
  if (!text) return null
  const m = text.match(/invoice\s*(?:no|number|no\.|num|#|ref)\b[:.\s]*([A-Za-z0-9][A-Za-z0-9\-\/]{2,})/i)
  return m ? m[1].replace(/[.,;:]+$/, '') : null
}
function extractVendor(text) {
  if (!text) return null
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const l of lines) {
    if (/^invoice\b/i.test(l)) continue                       // skip the big "INVOICE" heading
    if (/^(bill to|date|payment|vat|invoice|remittance|tax)\b/i.test(l)) continue // skip labels
    return l.replace(/\s+INVOICE\s*$/i, '').trim()            // first real letterhead line = vendor
  }
  return lines[0] || null
}

// Fill a filename template. Tokens: {ref} {type} {date} {vendor} {invoiceNo}
// (date = YYYY-MM-DD). Unknown tokens resolve to empty; separators are then tidied.
function buildFilename(template, { ref, type, vendor, invoiceNo } = {}) {
  const date = new Date().toISOString().slice(0, 10)
  const safe = (s) => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  let name = (template || '{ref}.pdf')
    .replace(/\{ref\}/g, safe(ref))
    .replace(/\{type\}/g, safe(type))
    .replace(/\{vendor\}/g, safe(vendor))
    .replace(/\{invoiceNo\}/gi, safe(invoiceNo))
    .replace(/\{date\}/g, date)
  // Tidy separators left by any empty tokens (e.g. "Acme__Invoice" or "_Invoice").
  name = name.replace(/_{2,}/g, '_').replace(/-{2,}/g, '-').replace(/^[_\-]+/, '')
  if (!/\.pdf$/i.test(name)) name += '.pdf'
  return name
}

/**
 * Evaluate export rules against an item's text. Rules are tried by priority
 * (highest first); the first whose match condition applies AND whose format
 * finds a reference wins.
 * @returns {{ ref, filename, target, ruleName }|null}
 */
function decideExport(item, rules) {
  const text = `${item.extractedName || ''}\n${item.ocrText || ''}`
  const hay = text.toLowerCase()
  // Named invoice fields — extracted lazily, reused for the filename tokens.
  let invoiceFields = null
  const getInvoiceFields = () => {
    if (!invoiceFields) invoiceFields = { vendor: extractVendor(text), invoiceNo: extractInvoiceNumber(text) }
    return invoiceFields
  }
  for (const rule of [...rules].sort((a, b) => b.priority - a.priority)) {
    if (rule.matchDocumentType && (item.documentType || '').toLowerCase() !== rule.matchDocumentType.toLowerCase()) continue
    if (rule.matchKeyword && !hay.includes(rule.matchKeyword.toLowerCase())) continue

    const tpl = rule.filenameTemplate || ''
    const usesInvoiceTokens = /\{vendor\}|\{invoiceNo\}/i.test(tpl)
    const inv = usesInvoiceTokens ? getInvoiceFields() : {}

    if (rule.format && rule.format.trim()) {
      // Extraction rule — identify a reference; skip if not found.
      const ref = extractRef(text, rule.format)
      if (!ref) continue
      return {
        ref,
        filename: buildFilename(rule.filenameTemplate, { ref, type: item.documentType, ...inv }),
        target: rule.exportTarget || 'default',
        ruleName: rule.name,
      }
    } else {
      // Forward rule (no format) — export the document (e.g. invoices → Invoice-IQ).
      // With a custom filename template we rename it (e.g. {vendor}_{invoiceNo}_Invoice.pdf),
      // otherwise it keeps its original file name.
      const custom = tpl && tpl !== '{ref}.pdf'
      const filename = custom
        ? buildFilename(tpl, { ref: '', type: item.documentType, ...inv })
        : (item.fileName || 'document.pdf')
      return { ref: inv.invoiceNo || null, filename, target: rule.exportTarget || 'default', ruleName: rule.name, forwarded: true, vendor: inv.vendor, invoiceNo: inv.invoiceNo }
    }
  }
  return null
}

module.exports = { maskToRegex, extractRef, extractInvoiceNumber, extractVendor, buildFilename, decideExport }
