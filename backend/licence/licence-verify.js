#!/usr/bin/env node
/*
 * Inspect / verify a Mail-IQ licence against the public key.
 *
 *   node licence/licence-verify.js browns.licence
 *   node licence/licence-verify.js <token-string>
 *
 * Public key: --key <path>, or env MAILIQ_LICENCE_PUBLIC_KEY, or licence/licence-public.pem.
 */
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')

let input = process.argv[2]
if (!input || input.startsWith('--')) { console.error('Usage: licence-verify.js <token-or-file>'); process.exit(1) }
if (fs.existsSync(input)) input = fs.readFileSync(input, 'utf8').trim()

let pub = process.env.MAILIQ_LICENCE_PUBLIC_KEY && process.env.MAILIQ_LICENCE_PUBLIC_KEY.replace(/\\n/g, '\n')
const ki = process.argv.indexOf('--key')
const pubPath = ki >= 0 ? process.argv[ki + 1] : path.join(__dirname, 'licence-public.pem')
if (!pub) { try { pub = fs.readFileSync(pubPath, 'utf8') } catch { console.error('No public key at ' + pubPath); process.exit(1) } }

try {
  const c = jwt.verify(input, pub, { algorithms: ['RS256'], ignoreExpiration: true })
  const exp = c.exp ? new Date(c.exp * 1000) : null
  const expired = exp && new Date() > exp
  console.log('VALID signature')
  console.log('  org      :', c.org)
  console.log('  modules  :', (c.modules || []).join(', '))
  if (c.maxUsers) console.log('  maxUsers :', c.maxUsers)
  console.log('  expires  :', exp ? exp.toISOString().slice(0, 10) : '—', expired ? '  ** EXPIRED **' : '')
  console.log('  id       :', c.jti)
} catch (e) {
  console.log('INVALID:', e.message)
  process.exit(1)
}
