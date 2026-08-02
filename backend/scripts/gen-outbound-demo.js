/**
 * Generate an OUTBOUND campaign demo pack (base documents + inserts + recipients).
 *   node scripts/gen-outbound-demo.js
 *
 * Produces, under  C:\Mail-IQ Demo Documents\Outbound Campaign\ :
 *   branch-opening-letter.pdf   – base letter for the mailshot
 *   new-branch-map.pdf          – an insert (attach in the campaign / Insert Library)
 *   members-ballot-paper.pdf    – base ballot for the closed-loop (QR return) demo
 *   campaign-recipients.csv     – ~10 recipients, mixed email / post preferences
 *   README.txt                  – the end-to-end demo runbook
 */
const fs = require('fs')
const path = require('path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const OUT = 'C:\\Mail-IQ Demo Documents\\Outbound Campaign'
const INK = rgb(0.12, 0.12, 0.14), GREY = rgb(0.42, 0.42, 0.46), LIGHT = rgb(0.9, 0.9, 0.93)
const TEAL = rgb(0.06, 0.4, 0.38), NAVY = rgb(0.10, 0.20, 0.42)
const A4 = [595.28, 841.89], M = 56

function dir() { fs.mkdirSync(OUT, { recursive: true }) }
function save(name, bytes) { dir(); fs.writeFileSync(path.join(OUT, name), bytes); console.log('  ✓', name) }
async function newDoc() { const pdf = await PDFDocument.create(); return { pdf, font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) } }
function wrap(t, font, size, maxW) { const out = []; for (const para of String(t).split('\n')) { if (para === '') { out.push(''); continue } let line = ''; for (const w of para.split(' ')) { const s = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(s, size) > maxW && line) { out.push(line); line = w } else line = s } if (line) out.push(line) } return out }
function head(page, bold, font, org, tag, accent) { const { width, height } = page.getSize(); page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: accent }); page.drawText(org, { x: M, y: height - 54, size: 20, font: bold, color: INK }); if (tag) page.drawText(tag, { x: M, y: height - 72, size: 9.5, font, color: GREY }); page.drawLine({ start: { x: M, y: height - 86 }, end: { x: width - M, y: height - 86 }, thickness: 0.8, color: LIGHT }); return height - 116 }
function paras(page, font, bold, y, blocks) { const maxW = A4[0] - M * 2; for (const b of blocks) { const f = b.bold ? bold : font; for (const ln of wrap(b.text, f, b.size || 11, maxW)) { if (y < 90) return y; page.drawText(ln, { x: M, y, size: b.size || 11, font: f, color: b.color || INK }); y -= b.lead || 15.5 } y -= b.gap != null ? b.gap : 8 } return y }

async function letter() {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  let y = head(page, bold, font, 'Northwind Stores', 'Customer Services · Freepost NORTHWIND', TEAL)
  y = paras(page, font, bold, y, [
    { text: '2 December 2026', color: GREY, size: 10, gap: 14 },
    { text: 'Dear Customer,', gap: 12 },
    { text: 'We’re opening a new branch!', bold: true, size: 13, gap: 10 },
    { text: 'We’re delighted to let you know that our newest Northwind store opens on Saturday 17th January at 41 Market Square. To celebrate, members will enjoy double points on everything for the whole of opening week.' },
    { text: 'A map showing exactly where to find us — with parking and the nearest station — is enclosed with this letter. We’d love to see you there.' },
    { text: 'If you’d prefer to receive future updates by email, or to confirm your attendance at our opening morning, simply use the secure link in your email or the QR on this letter to let us know.' },
    { text: 'Warm regards,', gap: 22 },
    { text: 'Sam Rivera', bold: true, gap: 0, lead: 14 },
    { text: 'Store Manager, Northwind Stores', color: GREY, size: 10 },
  ])
  page.drawText('Northwind Stores · Registered in England · This is a demo document.', { x: M, y: 52, size: 8, font, color: GREY })
  return pdf.save()
}

async function mapInsert() {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  head(page, bold, font, 'Northwind Stores', 'How to find our new branch', TEAL)
  const mx = M, my = height - 470, mw = width - M * 2, mh = 320
  page.drawRectangle({ x: mx, y: my, width: mw, height: mh, color: rgb(0.95, 0.97, 0.96), borderColor: LIGHT, borderWidth: 1 })
  const road = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 10, color: rgb(0.8, 0.83, 0.86) })
  road(mx + 30, my + 70, mx + mw - 30, my + 70)
  road(mx + mw / 2, my + 20, mx + mw / 2, my + mh - 20)
  page.drawText('Market Square (A6)', { x: mx + 40, y: my + 54, size: 9, font, color: GREY })
  page.drawText('Church Street', { x: mx + mw / 2 + 6, y: my + mh - 40, size: 9, font, color: GREY })
  const dx = mx + mw / 2 + 40, dy = my + 130
  page.drawRectangle({ x: dx, y: dy, width: 74, height: 40, color: TEAL })
  page.drawText('STORE', { x: dx + 14, y: dy + 13, size: 12, font: bold, color: rgb(1, 1, 1) })
  page.drawText('41 Market Square', { x: dx - 6, y: dy - 14, size: 8.5, font, color: INK })
  let y = my - 24
  page.drawText('Getting here', { x: M, y, size: 13, font: bold, color: INK }); y -= 20
  for (const s of [
    'By car: Leave the A6 at Market Square. Customer parking is behind the store on Church Street.',
    'By rail: 5-minute walk from the station — head down Church Street to the square.',
    'Postcode for sat-nav: NW1 4MS',
  ]) { for (const ln of wrap(s, font, 10.5, width - M * 2)) { page.drawText(ln, { x: M, y, size: 10.5, font, color: INK }); y -= 15 } y -= 6 }
  page.drawText('Demo directions insert · Northwind Stores', { x: M, y: 52, size: 8, font, color: GREY })
  return pdf.save()
}

async function ballot() {
  const { pdf, font, bold } = await newDoc()
  const page = pdf.addPage(A4)
  const { width, height } = page.getSize()
  let y = head(page, bold, font, 'United Members Union', 'Official Ballot 2026 · Confidential', NAVY)
  y = paras(page, font, bold, y, [
    { text: 'MEMBERS’ BALLOT — 2026 PAY OFFER', bold: true, size: 14, gap: 12 },
    { text: 'This ballot paper is issued to you as a member. Please mark ONE box below, then return the completed paper in the enclosed envelope. Your response is confidential; the QR code is used only to confirm your ballot has been received and to prevent duplicate returns.' },
  ])
  y -= 10
  const boxes = ['I ACCEPT the proposed pay offer', 'I REJECT the proposed pay offer']
  for (const label of boxes) {
    page.drawRectangle({ x: M, y: y - 16, width: 26, height: 26, borderColor: INK, borderWidth: 1.4, color: rgb(1, 1, 1) })
    page.drawText(label, { x: M + 40, y: y - 8, size: 12, font: bold, color: INK })
    y -= 46
  }
  y -= 10
  y = paras(page, font, bold, y, [
    { text: 'Return by 5:00pm on Friday 30th January 2026. Ballots received after this time cannot be counted.', color: GREY, size: 10 },
    { text: 'Scrutineer: Independent Ballot Services Ltd.', color: GREY, size: 10 },
  ])
  page.drawText('Demo ballot paper · United Members Union · not a real ballot', { x: M, y: 52, size: 8, font, color: GREY })
  return pdf.save()
}

const RECIPIENTS = [
  ['title', 'firstName', 'lastName', 'companyName', 'accountNumber', 'email', 'addressLine1', 'city', 'postcode', 'deliveryMethod'],
  ['Mr', 'James', 'Whitfield', '', 'NW-1001', 'james.whitfield@example.com', '14 Maple Avenue', 'Birmingham', 'B1 2AB', 'DIGITAL'],
  ['Mrs', 'Sandra', 'Okonkwo', '', 'NW-1002', 'sandra.okonkwo@example.com', '7 Elm Street', 'Manchester', 'M2 4CD', 'DIGITAL'],
  ['Dr', 'Robert', 'Chen', '', 'NW-1003', 'r.chen@example.com', '82 Oak Road', 'Leeds', 'LS1 3EF', 'AUTO'],
  ['Ms', 'Priya', 'Nair', '', 'NW-1004', 'priya.nair@example.com', '31 Cedar Close', 'Bristol', 'BS1 5GH', 'DIGITAL'],
  ['Mr', 'Thomas', 'Boyle', '', 'NW-1005', '', '5 Birch Way', 'Glasgow', 'G1 2JK', 'POST'],
  ['Miss', 'Ava', 'Lindqvist', '', 'NW-1006', 'ava.l@example.com', '19 Willow Court', 'Cardiff', 'CF10 1LM', 'AUTO'],
  ['Mr', 'Daniel', 'Osei', '', 'NW-1007', '', '44 Ash Grove', 'Sheffield', 'S1 2NO', 'POST'],
  ['Mrs', 'Helen', 'Marsh', '', 'NW-1008', '', '2 Rowan Terrace', 'Newcastle', 'NE1 4PQ', 'POST'],
  ['Mr', 'Kofi', 'Mensah', '', 'NW-1009', 'kofi.mensah@example.com', '8 Hazel Lane', 'Nottingham', 'NG1 5RS', 'DIGITAL'],
  ['Ms', 'Grace', 'Fletcher', '', 'NW-1010', '', '27 Sycamore Drive', 'Liverpool', 'L1 6TU', 'POST'],
]

const README = `MAIL-IQ — OUTBOUND CAMPAIGN DEMO PACK
=======================================

Files
  branch-opening-letter.pdf   Base letter for the mailshot
  new-branch-map.pdf          Insert (the map) to attach
  members-ballot-paper.pdf    Base ballot for the closed-loop (QR return) demo
  campaign-recipients.csv     10 recipients: 4 DIGITAL, 4 POST, 2 AUTO

END-TO-END DEMO RUNBOUND
  1. Recipients → Import CSV → campaign-recipients.csv  (10 people, mixed preferences)
  2. (Outbound) Insert Library → upload new-branch-map.pdf
  3. Campaigns → New campaign → upload branch-opening-letter.pdf,
        name "New branch opening", tick the map insert, keep "Add return QR" on → Create & send
  4. Result screen: ~6 emailed, ~4 to print. Open the campaign to see the per-recipient breakdown.
  5. DIGITAL PORTAL: on a digital recipient's row click "Open portal" → the recipient page opens
        → View & download the letter → Upload any PDF as their "reply" → the row flips to "uploaded".
  6. PRINT: Print Queue → Generate PDF → each copy shows the recipient's address + a unique QR.
  7. CLOSED LOOP (QR return): run a second campaign with members-ballot-paper.pdf to the POST
        recipients → open a printed/downloaded ballot (it has the QR) → drop it into the inbound
        hot folder → run the scan agent → the campaign dashboard flips that member to "returned".

All documents are clearly marked as demos.
`

async function main() {
  console.log('Generating outbound campaign demo →', OUT)
  save('branch-opening-letter.pdf', await letter())
  save('new-branch-map.pdf', await mapInsert())
  save('members-ballot-paper.pdf', await ballot())
  const csv = RECIPIENTS.map((r) => r.map((c) => /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\r\n')
  save('campaign-recipients.csv', csv)
  fs.writeFileSync(path.join(OUT, 'README.txt'), README); console.log('  ✓ README.txt')
  console.log('\nDone.')
}
main().catch((e) => { console.error(e); process.exit(1) })
