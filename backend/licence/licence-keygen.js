#!/usr/bin/env node
/*
 * Generate the Mail-IQ licence signing keypair (run ONCE, by the provider).
 *
 *   node licence/licence-keygen.js
 *
 *   licence-private.pem  → SECRET. The provider's signing key. NEVER commit it
 *                          (it's gitignored). Back it up securely — if lost you
 *                          cannot re-issue matching licences; if leaked, anyone
 *                          can mint valid licences.
 *   licence-public.pem   → safe to commit / bundle in the app. Used to VERIFY
 *                          licences on every Mail-IQ instance (SaaS + on-prem).
 *
 * Re-running is refused unless --force (regenerating invalidates every licence
 * already issued with the old key).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DIR = __dirname
const privPath = path.join(DIR, 'licence-private.pem')
const pubPath = path.join(DIR, 'licence-public.pem')

if (fs.existsSync(privPath) && !process.argv.includes('--force')) {
  console.error('A keypair already exists. Re-run with --force to regenerate (this INVALIDATES all previously issued licences).')
  process.exit(1)
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

fs.writeFileSync(privPath, privateKey, { mode: 0o600 })
fs.writeFileSync(pubPath, publicKey)

console.log('Mail-IQ licence keypair generated:')
console.log('  ✓', privPath, ' (SECRET — gitignored; back this up securely)')
console.log('  ✓', pubPath, '  (public — commit/bundle with the app)')
console.log('\nNext: mint a licence with  node licence/licence-mint.js --org "Customer Name" --modules inbound,outbound --months 12')
