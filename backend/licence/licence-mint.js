#!/usr/bin/env node
/*
 * Mint a signed Mail-IQ licence (provider only — needs the private key).
 *
 *   node licence/licence-mint.js --org "Browns Solicitors" --modules inbound,outbound --months 12 [--maxUsers 25] [--out browns.licence]
 *   node licence/licence-mint.js --org "Acme"             --modules inbound            --expires 2027-03-31
 *
 * The signed token (or the --out file) is handed to the customer. On the on-prem
 * instance set  MAILIQ_LICENCE_FILE=/path/to/browns.licence  (or MAILIQ_LICENCE=<token>).
 *
 * Private key: --key <path>, or env MAILIQ_LICENCE_PRIVATE_KEY, or licence/licence-private.pem.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const MODULES = ['inbound', 'outbound']
const argv = process.argv
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def }
const has = (name) => argv.includes('--' + name)

const org = arg('org')
if (!org) {
  console.error('Usage: --org "Name" --modules inbound,outbound [--months 12 | --expires YYYY-MM-DD] [--maxUsers N] [--out file] [--key path]')
  process.exit(1)
}

const modules = String(arg('modules', 'inbound,outbound')).split(',').map((s) => s.trim()).filter((m) => MODULES.includes(m))
if (!modules.length) { console.error('No valid modules. Use --modules inbound,outbound'); process.exit(1) }

const maxUsers = arg('maxUsers') ? Number(arg('maxUsers')) : undefined

let expSec
if (arg('expires')) {
  const d = new Date(arg('expires') + 'T23:59:59Z')
  if (isNaN(d)) { console.error('Invalid --expires date (use YYYY-MM-DD)'); process.exit(1) }
  expSec = Math.floor(d.getTime() / 1000)
} else {
  const months = Number(arg('months', '12'))
  const d = new Date(); d.setMonth(d.getMonth() + months)
  expSec = Math.floor(d.getTime() / 1000)
}

let key = process.env.MAILIQ_LICENCE_PRIVATE_KEY
const keyPath = arg('key', path.join(__dirname, 'licence-private.pem'))
if (!key) {
  try { key = fs.readFileSync(keyPath, 'utf8') }
  catch { console.error(`No private key. Run licence-keygen.js, set MAILIQ_LICENCE_PRIVATE_KEY, or pass --key (looked for ${keyPath}).`); process.exit(1) }
}

const jti = crypto.randomBytes(8).toString('hex')
const payload = { org, modules, iat: Math.floor(Date.now() / 1000), exp: expSec, iss: 'mail-iq', jti }
if (maxUsers) payload.maxUsers = maxUsers

let token
try { token = jwt.sign(payload, key, { algorithm: 'RS256' }) }
catch (e) { console.error('Signing failed:', e.message); process.exit(1) }

const expIso = new Date(expSec * 1000).toISOString().slice(0, 10)
console.error(`Licence minted for "${org}" — modules: ${modules.join(', ')} — expires ${expIso}${maxUsers ? ` — maxUsers ${maxUsers}` : ''} — id ${jti}`)
if (has('out')) { const out = arg('out'); fs.writeFileSync(out, token + '\n'); console.error('  ✓ written to ' + out) }
console.log(token)
