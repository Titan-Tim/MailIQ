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

// Fill a filename template. Tokens: {ref} {type} {date} (date = YYYY-MM-DD).
function buildFilename(template, { ref, type }) {
  const date = new Date().toISOString().slice(0, 10)
  const safe = (s) => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-')
  let name = (template || '{ref}.pdf')
    .replace(/\{ref\}/g, safe(ref))
    .replace(/\{type\}/g, safe(type))
    .replace(/\{date\}/g, date)
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
  for (const rule of [...rules].sort((a, b) => b.priority - a.priority)) {
    if (rule.matchDocumentType && (item.documentType || '').toLowerCase() !== rule.matchDocumentType.toLowerCase()) continue
    if (rule.matchKeyword && !hay.includes(rule.matchKeyword.toLowerCase())) continue

    if (rule.format && rule.format.trim()) {
      // Extraction rule — identify a reference; skip if not found.
      const ref = extractRef(text, rule.format)
      if (!ref) continue
      return {
        ref,
        filename: buildFilename(rule.filenameTemplate, { ref, type: item.documentType }),
        target: rule.exportTarget || 'default',
        ruleName: rule.name,
      }
    } else {
      // Forward rule (no format) — export the document as-is (e.g. invoices → Invoice-IQ).
      const custom = rule.filenameTemplate && rule.filenameTemplate !== '{ref}.pdf'
      const filename = custom ? buildFilename(rule.filenameTemplate, { ref: '', type: item.documentType }) : (item.fileName || 'document.pdf')
      return { ref: null, filename, target: rule.exportTarget || 'default', ruleName: rule.name, forwarded: true }
    }
  }
  return null
}

module.exports = { maskToRegex, extractRef, buildFilename, decideExport }
