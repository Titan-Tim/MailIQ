/*
 * Interactive setup wizard for the Mail-IQ scan-folder agent.
 *   npm run setup
 * Asks for the Mail-IQ URL, ingest key and hot folder, runs a live connection
 * test, then writes config.json and creates the hot folder. Replaces hand-editing
 * config.json + running ping.
 */
import fs from 'fs'
import path from 'path'
import readline from 'node:readline'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.join(here, '..', 'config.json')

// Async line iterator — reads reliably from both a real terminal and piped input.
const rl = readline.createInterface({ input: process.stdin })
const lines = rl[Symbol.asyncIterator]()
async function ask(q, def) {
  process.stdout.write(def ? `${q}\n  [${def}] > ` : `${q}\n  > `)
  const { value, done } = await lines.next()
  const a = done ? '' : (value || '').trim()
  return a || def || ''
}

async function main() {
  console.log('\n────────────────────────────────────────')
  console.log('  Mail-IQ scan-folder agent — setup')
  console.log('────────────────────────────────────────')
  console.log('\n  Tip: a value shown in [brackets] is the default —')
  console.log('  just press Enter to accept it, or type to change it.')

  let cur = {}
  try { cur = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { /* first run */ }

  const apiUrl = (await ask('\n1. Your Mail-IQ address', cur.apiUrl || 'https://mailiq-production.up.railway.app')).replace(/\/+$/, '')
  let ingestKey = await ask('\n2. Ingest key  (portal → Inbound → Scan Folder → copy)', cur.ingestKey || '')
  while (!ingestKey) { console.log('   The ingest key is required.'); ingestKey = await ask('   Ingest key', '') }
  const hotFolder = await ask('\n3. Hot folder  (where the scanner saves)', cur.hotFolder || 'C:\\Mailroom Hot Folder')
  const scale = Number(await ask('\n4. Render quality  (higher = sharper QR, a little slower)', String(cur.scale || 2.5))) || 2.5
  const exportFolder = await ask('\n5. Filing folder  (optional — where case-number-named files are saved,\n   e.g. a Proclaim hot folder. Leave blank to skip.)', cur.exportFolder || '')

  process.stdout.write('\nTesting connection… ')
  try {
    const res = await fetch(`${apiUrl}/api/ingest/ping`, { headers: { 'X-Ingest-Key': ingestKey } })
    if (!res.ok) {
      console.log(`✗ failed (HTTP ${res.status}).`)
      console.log('  Check the Mail-IQ address and that the ingest key is current (regenerating it in the portal invalidates the old one).')
      rl.close(); process.exitCode = 1; return
    }
    const j = await res.json()
    console.log(`✓ connected to "${j.tenant}"`)
  } catch (e) {
    console.log(`✗ could not reach ${apiUrl}\n  ${e.message}`)
    rl.close(); process.exitCode = 1; return
  }

  const config = { apiUrl, ingestKey, hotFolder, scale }
  if (exportFolder) config.exportFolder = exportFolder
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  try { fs.mkdirSync(hotFolder, { recursive: true }) } catch { /* may need creating manually */ }
  if (exportFolder) { try { fs.mkdirSync(exportFolder, { recursive: true }) } catch { /* create manually */ } }

  console.log(`\n✓ Saved config to  ${CONFIG_PATH}`)
  console.log(`✓ Hot folder ready: ${hotFolder}`)
  if (exportFolder) console.log(`✓ Filing folder ready: ${exportFolder}`)
  console.log('\nAll set. Start watching with:\n\n   npm start\n')
  rl.close()
}
main().catch((e) => { console.error('\nSetup error:', e.message); process.exitCode = 1 })
