/*
 * Interactive setup wizard for the Mail-IQ scan-folder agent.
 *   npm run setup
 * Asks for the Mail-IQ URL, ingest key and hot folder, runs a live connection
 * test, then writes config.json and creates the hot folder. Replaces hand-editing
 * config.json + running ping.
 */
import fs from 'fs'
import os from 'node:os'
import path from 'path'
import readline from 'node:readline'
import { execSync } from 'node:child_process'
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

// Pop a native Windows "Browse For Folder" dialog and return the chosen path.
// Works like picking your browser's Downloads folder — set once, files flow there.
// Returns '' if cancelled, unavailable, or not on Windows (caller falls back to typing).
function browseForFolder(description) {
  if (process.platform !== 'win32') return ''
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$d.Description = ${JSON.stringify(description || 'Select folder')}`,
    '$d.ShowNewFolderButton = $true',
    "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }",
  ].join('\n')
  const tmp = path.join(os.tmpdir(), `miq-browse-${process.pid}.ps1`)
  try {
    fs.writeFileSync(tmp, script)
    return execSync(`powershell -NoProfile -STA -ExecutionPolicy Bypass -File "${tmp}"`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch { return '' } finally { try { fs.unlinkSync(tmp) } catch { /* ignore */ } }
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

  // 5. Filing destinations — where identified/forwarded files land, like a
  //    browser's Downloads folder. Each one maps a Filing Rule "target" name to
  //    a folder on this PC (e.g. proclaim → a Proclaim watch folder).
  const exportFolders = { ...(cur.exportFolders || {}) }
  if (cur.exportFolder && !Object.keys(exportFolders).length) exportFolders.default = cur.exportFolder // migrate old single folder

  console.log('\n5. Filing destinations  (optional)')
  console.log('   Where filed/forwarded files are saved on this PC — like a Downloads folder.')
  console.log("   The target name must match the one you set on the Filing Rule in the portal")
  console.log('   (e.g. "proclaim" for legal, "invoice-iq" for invoices).')
  if (Object.keys(exportFolders).length) {
    console.log('\n   Current:')
    for (const [t, f] of Object.entries(exportFolders)) console.log(`     • ${t} → ${f}`)
  }
  let more = (await ask('\n   Add / change a filing destination now? (y/N)', 'N')).toLowerCase().startsWith('y')
  while (more) {
    const target = await ask('   Target name  (e.g. proclaim or invoice-iq)', '')
    if (target) {
      let folder = await ask("   Folder — type/paste a path, or type 'browse' to pick one", exportFolders[target] || '')
      if (folder.toLowerCase() === 'browse') {
        console.log('   …opening the folder picker (check for a dialog window)')
        const picked = browseForFolder(`Mail-IQ — choose the folder for "${target}"`)
        folder = picked || (await ask('   (nothing picked) type/paste the folder path, or leave blank to skip', ''))
      }
      if (folder) {
        exportFolders[target] = folder
        try { fs.mkdirSync(folder, { recursive: true }) } catch { /* create manually */ }
        console.log(`     ✓ ${target} → ${folder}`)
      }
    }
    more = (await ask('   Add another destination? (y/N)', 'N')).toLowerCase().startsWith('y')
  }

  const config = { apiUrl, ingestKey, hotFolder, scale }
  if (Object.keys(exportFolders).length) config.exportFolders = exportFolders
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  try { fs.mkdirSync(hotFolder, { recursive: true }) } catch { /* may need creating manually */ }

  console.log(`\n✓ Saved config to  ${CONFIG_PATH}`)
  console.log(`✓ Hot folder ready: ${hotFolder}`)
  for (const [t, f] of Object.entries(exportFolders)) console.log(`✓ Filing destination: ${t} → ${f}`)
  console.log('\nAll set. Start watching with:\n\n   npm start\n')
  rl.close()
}
main().catch((e) => { console.error('\nSetup error:', e.message); process.exitCode = 1 })
