/**
 * Scan-folder ingest API — mounted at /api/ingest (NO user login).
 * The local watcher agent authenticates with a per-tenant ingest key and posts
 * one already-split document per request; the shared inbound pipeline classifies
 * and routes it exactly like a portal upload.
 */
const router = require('express').Router()
const multer = require('multer')
const prisma = require('../db')
const { createAndProcess } = require('../services/inbound-pipeline')
const { getLicence } = require('../services/licence')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

async function requireIngestKey(req, res, next) {
  const key = req.headers['x-ingest-key'] || req.query.key
  if (!key) return res.status(401).json({ error: 'Missing ingest key' })
  const tenant = await prisma.tenant.findFirst({ where: { ingestKey: String(key) } })
  if (!tenant) return res.status(401).json({ error: 'Invalid ingest key' })
  if (tenant.status === 'SUSPENDED') return res.status(403).json({ error: 'Account suspended' })
  if (tenant.licenceExpiresAt && new Date() > tenant.licenceExpiresAt) return res.status(403).json({ error: 'Licence expired' })
  if (!getLicence(tenant).hasModule('inbound')) return res.status(403).json({ error: 'The inbound module is not included in your licence', code: 'MODULE_NOT_LICENSED' })
  req.tenant = tenant
  next()
}

// GET /api/ingest/ping — the agent validates its config on startup.
router.get('/ping', requireIngestKey, (req, res) => {
  res.json({ ok: true, tenant: req.tenant.name })
})

// POST /api/ingest — one document (already split by the agent at separator sheets).
router.post('/', requireIngestKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' })
    const item = await createAndProcess({
      tenantId: req.tenant.id,
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      source: 'scan-folder',
      actor: 'scan-agent',
    })
    res.status(201).json({
      id: item.id,
      fileName: item.fileName,
      status: item.status,
      documentType: item.documentType,
      mailbox: item.matchedMailbox?.name || null,
      routingReason: item.routingReason,
      // If a case number was identified, tell the agent how to file it.
      export: item.exportFilename ? { filename: item.exportFilename, target: item.exportTarget, ref: item.exportRef } : null,
    })
  } catch (e) {
    console.error('[ingest]', e)
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
