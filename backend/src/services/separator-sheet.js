/** Generate the Mail-IQ QR document-separator sheet PDF (bytes). */
const QRCode = require('qrcode')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const TOKEN = 'MAILIQ:SEPARATOR:V1'
const VIOLET = rgb(0.486, 0.227, 0.929)
const INK = rgb(0.12, 0.12, 0.14)
const GREY = rgb(0.32, 0.32, 0.36)

async function generateSeparatorSheet() {
  const png = await QRCode.toBuffer(TOKEN, { errorCorrectionLevel: 'H', margin: 2, scale: 14 })
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: VIOLET })
  page.drawRectangle({ x: 0, y: 0, width, height: 10, color: VIOLET })
  page.drawText('MAIL-IQ', { x: 56, y: height - 78, size: 34, font: bold, color: VIOLET })
  page.drawText('DOCUMENT SEPARATOR', { x: 56, y: height - 108, size: 18, font: bold, color: INK })

  const img = await pdf.embedPng(png)
  const qs = 300
  page.drawImage(img, { x: (width - qs) / 2, y: (height - qs) / 2 - 10, width: qs, height: qs })
  page.drawText('— SEPARATOR —', { x: (width - 120) / 2, y: (height - qs) / 2 - 34, size: 12, font: bold, color: GREY })

  const lines = [
    'Place one of these sheets BETWEEN each document when scanning a batch.',
    'The scanner reads it as a boundary, and Mail-IQ splits the batch into',
    'separate documents automatically — the separator page itself is discarded.',
  ]
  let y = 150
  for (const l of lines) { page.drawText(l, { x: 56, y, size: 11, font, color: GREY }); y -= 16 }
  page.drawText('Tip: print a stack and keep them by the scanner.', { x: 56, y: y - 6, size: 11, font: bold, color: INK })

  return pdf.save()
}

module.exports = { generateSeparatorSheet, TOKEN }
