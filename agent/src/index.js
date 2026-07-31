/*
 * Mail-IQ scan-folder agent.
 *   node src/index.js          watch the hot folder forever
 *   node src/index.js --once   process whatever is in the hot folder now, then exit
 *   node src/index.js --ping   check the config + connection, then exit
 *
 * Drops a batch scan (documents separated by QR separator sheets) into the hot
 * folder → the agent splits it → uploads each document to Mail-IQ → moves the
 * original batch to Processed/ (or Error/ on failure).
 */
import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import { loadConfig } from './config.js'
import { splitBatch } from './split.js'

const cfg = loadConfig()
const ONCE = process.argv.includes('--once')
const PING = process.argv.includes('--ping')

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
const log = (m) => console.log(`[${ts()}] ${m}`)

async function ping() {
  const res = await fetch(`${cfg.apiUrl}/api/ingest/ping`, { headers: { 'X-Ingest-Key': cfg.ingestKey } })
  if (!res.ok) throw new Error(`ping failed (${res.status}) — check apiUrl and ingestKey`)
  const j = await res.json()
  return j.tenant
}

async function uploadDoc(buffer, filename) {
  const fd = new FormData()
  fd.append('file', new Blob([buffer], { type: 'application/pdf' }), filename)
  const res = await fetch(`${cfg.apiUrl}/api/ingest`, {
    method: 'POST',
    headers: { 'X-Ingest-Key': cfg.ingestKey },
    body: fd,
  })
  if (!res.ok) throw new Error(`ingest ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// Avoid overwriting a file already sitting in a watch folder.
function uniquePath(folder, filename) {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let candidate = path.join(folder, filename)
  let i = 1
  while (fs.existsSync(candidate)) candidate = path.join(folder, `${base}-${i++}${ext}`)
  return candidate
}

function moveTo(folder, filePath) {
  fs.mkdirSync(folder, { recursive: true })
  const base = path.basename(filePath)
  const dest = path.join(folder, `${Date.now()}-${base}`)
  fs.renameSync(filePath, dest)
  return dest
}

let chain = Promise.resolve() // serialise batches
function queue(filePath) {
  chain = chain.then(() => processBatch(filePath)).catch((e) => log(`ERROR: ${e.message}`))
  return chain
}

async function processBatch(filePath) {
  if (!fs.existsSync(filePath)) return
  const name = path.basename(filePath)
  try {
    const buf = fs.readFileSync(filePath)
    log(`processing "${name}" …`)
    const { docs, warnings, pageCount, separatorCount } = await splitBatch(buf, cfg.scale)
    log(`  ${pageCount} page(s), ${separatorCount} separator(s) → ${docs.length} document(s)`)
    warnings.forEach((w) => log(`  ⚠ ${w}`))

    let n = 0
    for (const doc of docs) {
      n++
      const docName = docs.length > 1 ? name.replace(/\.pdf$/i, '') + `-doc${n}.pdf` : name
      const r = await uploadDoc(doc.buffer, docName)
      log(`  ✓ uploaded ${docName} → ${r.status}${r.mailbox ? ` (${r.documentType} → ${r.mailbox})` : ` (${r.documentType || 'unclassified'})`}`)

      // Filing/forwarding: write the document to the folder mapped to its target
      // (e.g. proclaim → case-management, invoice-iq → AP automation hot folder).
      if (r.export && r.export.filename) {
        const target = r.export.target || 'default'
        const folder = (cfg.exportFolders && cfg.exportFolders[target]) || cfg.exportFolder
        if (folder) {
          fs.mkdirSync(folder, { recursive: true })
          const dest = uniquePath(folder, r.export.filename)
          fs.writeFileSync(dest, doc.buffer)
          log(`    ↳ ${r.export.ref ? `filed as` : `forwarded as`} ${path.basename(dest)} → ${target}`)
        } else {
          log(`    ↳ ${r.export.filename} for target "${target}" — no folder configured (add exportFolders["${target}"] in config.json)`)
        }
      }
    }
    const dest = moveTo(cfg.processedFolder, filePath)
    log(`  done — moved to ${path.relative(cfg.hotFolder, dest)}`)
  } catch (e) {
    log(`  FAILED "${name}": ${e.message}`)
    try { moveTo(cfg.errorFolder, filePath); log(`  moved to Error/`) } catch { /* file may be gone */ }
  }
}

async function main() {
  let tenant
  try { tenant = await ping() }
  catch (e) { console.error(`[connection] ${e.message}`); process.exit(1) }
  log(`connected to Mail-IQ as "${tenant}"`)

  if (PING) { log('config OK.'); return }

  fs.mkdirSync(cfg.hotFolder, { recursive: true })

  if (ONCE) {
    const pdfs = fs.readdirSync(cfg.hotFolder).filter((f) => f.toLowerCase().endsWith('.pdf'))
    log(`--once: ${pdfs.length} file(s) in hot folder`)
    for (const f of pdfs) await queue(path.join(cfg.hotFolder, f))
    await chain
    return
  }

  log(`watching "${cfg.hotFolder}" — drop batch scans here (Ctrl+C to stop)`)
  chokidar
    .watch(cfg.hotFolder, {
      depth: 0, // top level only — don't reprocess Processed/ or Error/
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    })
    .on('add', (p) => { if (p.toLowerCase().endsWith('.pdf')) queue(p) })
}

main()
