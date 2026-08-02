/**
 * Field-merge letter renderer. For "compose a letter" campaigns: render a fresh,
 * personalised letter PDF per recipient from a template body with {tokens}.
 *
 * The address window (top-left, ~45–90mm) is left BLANK — composeDispatch overlays
 * the recipient's address, QR and barcode there, exactly as for an uploaded base.
 *
 * Tokens: {firstName} {lastName} {title} {fullName} {name} {company} {account}
 *         {reference} {city} {postcode} {date}
 */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const MM = 2.8346, A4 = [595.28, 841.89], M = 56
const INK = rgb(0.12, 0.12, 0.14), GREY = rgb(0.42, 0.42, 0.46), LIGHT = rgb(0.9, 0.9, 0.93)
const BODY_TOP = A4[1] - 96 * MM

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return rgb(0.10, 0.20, 0.42)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function fillTokens(text, r) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const fullName = [r?.title, r?.firstName, r?.lastName].filter(Boolean).join(' ')
  const map = {
    firstName: r?.firstName || '', lastName: r?.lastName || '', title: r?.title || '',
    fullName, name: r?.firstName || fullName || 'there', company: r?.companyName || '',
    account: r?.accountNumber || '', reference: r?.reference || '', city: r?.city || '',
    postcode: r?.postcode || '', date,
  }
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m))
}

function wrapText(text, font, size, maxW) {
  const out = []
  for (const para of String(text).split('\n')) {
    if (para.trim() === '') { out.push(''); continue }
    let line = ''
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w }
      else line = t
    }
    if (line) out.push(line)
  }
  return out
}

async function renderLetter({ tenant, recipient, campaign }) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  const accent = hexToRgb(tenant?.brandColor)
  const maxW = width - M * 2

  // Letterhead
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: accent })
  page.drawText(tenant?.name || 'Mail-IQ', { x: M, y: height - 54, size: 20, font: bold, color: INK })
  page.drawLine({ start: { x: M, y: height - 86 }, end: { x: width - M, y: height - 86 }, thickness: 0.8, color: LIGHT })

  // Body — starts below the (blank) address window
  let y = BODY_TOP
  const block = (text, f, size, color, lead, gap) => {
    for (const ln of wrapText(text, f, size, maxW)) {
      if (y < 80) return
      if (ln !== '') page.drawText(ln, { x: M, y, size, font: f, color: color || INK })
      y -= lead || size * 1.4
    }
    y -= gap != null ? gap : 8
  }

  block(fillTokens('{date}', recipient), font, 10, GREY, 14, 12)
  block(`Dear ${fillTokens('{firstName}', recipient) || 'Customer'},`, font, 11, INK, 15.5, 10)
  if (campaign.heading) block(fillTokens(campaign.heading, recipient), bold, 13, INK, 17, 8)
  block(fillTokens(campaign.bodyTemplate, recipient), font, 11, INK, 15.5, 10)
  block('Yours sincerely,', font, 11, INK, 15.5, 20)
  block(fillTokens(campaign.signOff || tenant?.name || '', recipient), bold, 11, INK, 14, 0)

  page.drawText('This is a demo document.', { x: M, y: 52, size: 8, font, color: GREY })
  return Buffer.from(await pdf.save())
}

module.exports = { renderLetter, fillTokens }
