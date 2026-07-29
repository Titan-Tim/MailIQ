/**
 * Storage service — durable file storage.
 *
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production), otherwise
 * falls back to the local filesystem (local dev). Either way a "fileKey" is
 * returned and later used to read/delete — for Blob it's the full blob URL,
 * for local it's a relative filename.
 *
 * IMPORTANT: blob URLs are never handed to the browser. The file-serving
 * endpoints read the bytes here and stream them behind our own auth, so the
 * mailbox privacy model holds.
 *
 * All functions are async.
 */
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN
const blob = BLOB_TOKEN ? require('@vercel/blob') : null

const UPLOADS_DIR = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads')
if (!blob && !fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const CONTENT_TYPE = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff',
}

const isBlobKey = (fileKey) => /^https?:\/\//.test(fileKey || '')

/**
 * Save a buffer. Returns a fileKey (blob URL or local filename).
 * @param {Buffer} buffer
 * @param {string} [prefix]  e.g. "original", "composed", "insert", "batch", "inbound"
 * @param {string} [ext]     e.g. "pdf"
 * @returns {Promise<string>}
 */
async function saveFile(buffer, prefix = 'file', ext = 'pdf') {
  const name = `${prefix}-${uuidv4()}.${ext}`
  if (blob) {
    const res = await blob.put(name, buffer, {
      access: 'public',            // unguessable URL; never exposed — we proxy it
      token: BLOB_TOKEN,
      contentType: CONTENT_TYPE[ext.toLowerCase()] || 'application/octet-stream',
      addRandomSuffix: true,
    })
    return res.url
  }
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer)
  return name
}

/** Read a file by its key. @returns {Promise<Buffer>} */
async function readFile(fileKey) {
  if (isBlobKey(fileKey)) {
    const r = await fetch(fileKey)
    if (!r.ok) throw new Error(`Blob fetch failed (${r.status})`)
    return Buffer.from(await r.arrayBuffer())
  }
  return fs.readFileSync(path.join(UPLOADS_DIR, fileKey))
}

/** Delete a file by its key. Never throws. */
async function deleteFile(fileKey) {
  try {
    if (isBlobKey(fileKey)) {
      if (blob) await blob.del(fileKey, { token: BLOB_TOKEN })
      return
    }
    const full = path.join(UPLOADS_DIR, fileKey)
    if (fs.existsSync(full)) fs.unlinkSync(full)
  } catch (e) {
    console.error('deleteFile error:', e.message)
  }
}

module.exports = { saveFile, readFile, deleteFile }
