/*
 * Separator detection + batch splitting — pure WASM/JS, no native binaries.
 *  - Rasterise each page with mupdf (WASM) to RGBA pixels.
 *  - Detect the QR separator with jsQR, plus a JS grayscale+contrast retry pass.
 *  - A separator page is a hard document boundary and is dropped from output.
 *  - Split the original PDF (pdf-lib) into one PDF per document.
 */
import * as mupdf from 'mupdf'
import jsQR from 'jsqr'
import { PDFDocument } from 'pdf-lib'

export const SEPARATOR_TOKEN = 'MAILIQ:SEPARATOR:V1'

// Rasterise and detect page-by-page. IMPORTANT: getPixels() is a view into WASM
// memory reused on the next page, so decode each page before rendering the next.
function detectSeparators(pdfBuffer, scale, token) {
  const doc = mupdf.Document.openDocument(new Uint8Array(pdfBuffer), 'application/pdf')
  const n = doc.countPages()
  const mtx = mupdf.Matrix.scale(scale, scale)
  const flags = []
  for (let i = 0; i < n; i++) {
    const pix = doc.loadPage(i).toPixmap(mtx, mupdf.ColorSpace.DeviceRGB, false, false)
    const w = pix.getWidth(), h = pix.getHeight()
    const rgba = toRGBA(pix.getPixels(), w, h) // toRGBA copies into a fresh buffer
    flags.push(detect(rgba, w, h, token))
  }
  return flags
}

// mupdf may hand back 3 (RGB) or 4 (RGBA) channels; jsQR needs a 4-channel clamped array.
function toRGBA(data, width, height) {
  const px = width * height
  const ch = Math.round(data.length / px)
  const out = new Uint8ClampedArray(px * 4)
  for (let i = 0; i < px; i++) {
    const b = i * ch
    out[i * 4] = data[b]
    out[i * 4 + 1] = ch >= 3 ? data[b + 1] : data[b]
    out[i * 4 + 2] = ch >= 3 ? data[b + 2] : data[b]
    out[i * 4 + 3] = 255
  }
  return out
}

function hardened(rgba) {
  const out = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    let l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    l = (l - 128) * 1.8 + 128
    l = l < 0 ? 0 : l > 255 ? 255 : l
    out[i] = out[i + 1] = out[i + 2] = l
    out[i + 3] = 255
  }
  return out
}

function detect(rgba, width, height, token) {
  let code = jsQR(rgba, width, height)
  if (code && code.data && code.data.indexOf(token) !== -1) return { sep: true }
  code = jsQR(hardened(rgba), width, height)
  if (code && code.data && code.data.indexOf(token) !== -1) return { sep: true }
  return { sep: false }
}

function groupIntoItems(pageFlags) {
  const items = []
  const warnings = []
  let current = []
  let prevWasSep = false
  pageFlags.forEach((f, idx) => {
    if (f.sep) {
      if (current.length) { items.push(current); current = [] }
      else if (prevWasSep) warnings.push(`empty section between separators near page ${idx + 1}`)
      prevWasSep = true
    } else {
      current.push(idx)
      prevWasSep = false
    }
  })
  if (current.length) items.push(current)
  return { items, warnings }
}

/**
 * Split a batch PDF at QR separator sheets.
 * @returns {Promise<{docs:{buffer:Buffer,pageCount:number}[], warnings:string[], pageCount:number, separatorCount:number}>}
 */
export async function splitBatch(pdfBuffer, scale = 2.5) {
  const flags = detectSeparators(pdfBuffer, scale, SEPARATOR_TOKEN)
  const { items, warnings } = groupIntoItems(flags)

  const src = await PDFDocument.load(pdfBuffer)
  const docs = []
  for (const idxs of items) {
    const out = await PDFDocument.create()
    const copied = await out.copyPages(src, idxs)
    copied.forEach((pg) => out.addPage(pg))
    docs.push({ buffer: Buffer.from(await out.save()), pageCount: idxs.length })
  }
  return { docs, warnings, pageCount: flags.length, separatorCount: flags.filter((f) => f.sep).length }
}
