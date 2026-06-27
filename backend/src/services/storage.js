/**
 * Storage service — wraps local filesystem.
 * Swap readFile/writeFile/deleteFile for S3 calls when going to cloud.
 */
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const UPLOADS_DIR = path.resolve(
  process.cwd(),
  process.env.UPLOADS_DIR || 'uploads'
)

// Ensure directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
ensureDir(UPLOADS_DIR)

/**
 * Save a buffer to storage.
 * @param {Buffer} buffer
 * @param {string} prefix  e.g. "original", "composed", "insert", "batch"
 * @param {string} [ext]   e.g. "pdf"
 * @returns {string} fileKey (relative path from uploads root)
 */
function saveFile(buffer, prefix = 'file', ext = 'pdf') {
  const name = `${prefix}-${uuidv4()}.${ext}`
  const fullPath = path.join(UPLOADS_DIR, name)
  fs.writeFileSync(fullPath, buffer)
  return name
}

/**
 * Read a file by its key (relative path from uploads root).
 * @param {string} fileKey
 * @returns {Buffer}
 */
function readFile(fileKey) {
  const fullPath = path.join(UPLOADS_DIR, fileKey)
  return fs.readFileSync(fullPath)
}

/**
 * Delete a file by its key.
 */
function deleteFile(fileKey) {
  try {
    const fullPath = path.join(UPLOADS_DIR, fileKey)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  } catch (e) {
    console.error('deleteFile error:', e)
  }
}

/**
 * Return the absolute filesystem path for a file key.
 * Used by Express res.sendFile().
 */
function absolutePath(fileKey) {
  return path.join(UPLOADS_DIR, fileKey)
}

module.exports = { saveFile, readFile, deleteFile, absolutePath }
