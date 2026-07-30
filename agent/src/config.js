import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))

export function loadConfig() {
  const p = process.env.MAILIQ_AGENT_CONFIG || path.join(here, '..', 'config.json')
  if (!fs.existsSync(p)) {
    console.error(`\n[config] No config file at:\n  ${p}\n`)
    console.error('Copy config.example.json to config.json and fill in your apiUrl, ingestKey and hotFolder.\n')
    process.exit(1)
  }
  let cfg
  try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')) }
  catch (e) { console.error(`[config] ${p} is not valid JSON: ${e.message}`); process.exit(1) }

  for (const k of ['apiUrl', 'ingestKey', 'hotFolder']) {
    if (!cfg[k]) { console.error(`[config] Missing "${k}" in ${p}`); process.exit(1) }
  }
  cfg.apiUrl = cfg.apiUrl.replace(/\/+$/, '')
  cfg.scale = cfg.scale || 2
  cfg.processedFolder = cfg.processedFolder || path.join(cfg.hotFolder, 'Processed')
  cfg.errorFolder = cfg.errorFolder || path.join(cfg.hotFolder, 'Error')
  return cfg
}
