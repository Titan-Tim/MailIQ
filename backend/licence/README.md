# Mail-IQ Licensing

Mail-IQ resolves entitlements (which modules are enabled + expiry) through one
place: `src/services/licence.js` → `getLicence()`. It runs in one of two modes,
chosen automatically:

- **SaaS** (default) — entitlements come from the tenant record in the database
  (`Tenant.enabledModules`, `Tenant.licenceExpiresAt`), managed from the Platform
  admin page. This is what mail.sol-iq.co.uk runs today.
- **On-prem** — when a **signed licence** is configured, it OVERRIDES the database
  for the whole instance. On-prem the customer controls their own database, so a
  DB flag can't be trusted; the licence is an **RS256 JWT** signed by the
  provider's private key and verified with the bundled public key.

## The keypair (provider, once)

```bash
node licence/licence-keygen.js
```

- `licence-private.pem` — **SECRET.** The signing key. Gitignored. **Back it up
  securely** (offline). If lost you can't re-issue matching licences; if leaked,
  anyone can mint valid licences.
- `licence-public.pem` — public; committed and bundled with the app so every
  instance can verify licences.

## Minting a licence (provider, per customer)

```bash
node licence/licence-mint.js --org "Browns Solicitors" --modules inbound --months 12 --maxUsers 25 --out browns.licence
node licence/licence-mint.js --org "Acme Ltd"          --modules inbound,outbound --expires 2027-03-31
```

Options: `--org` (required), `--modules inbound,outbound`, `--months N` **or**
`--expires YYYY-MM-DD`, `--maxUsers N` (optional), `--out FILE` (optional),
`--key PATH` (private key; defaults to `licence/licence-private.pem` or env
`MAILIQ_LICENCE_PRIVATE_KEY`). The signed token is printed to stdout (and written
to `--out`). Hand the token/file to the customer.

## Installing a licence (on the on-prem instance)

Set **one** of these for the backend:

```bash
MAILIQ_LICENCE_FILE=/etc/mailiq/browns.licence   # path to the licence file
# or
MAILIQ_LICENCE=<token>                            # the token inline
```

The public key is bundled (`licence/licence-public.pem`); override with
`MAILIQ_LICENCE_PUBLIC_KEY` (PEM, `\n`-escaped) if needed. On boot the API logs
the licence status (org, modules, expiry). Behaviour:

- **valid** → those modules are enabled; others show the locked/upsell screen.
- **expired** → users are blocked at login with a renewal message.
- **invalid / wrong key / tampered** → all modules locked.

**Renewal** = mint a new file and swap it in (restart the backend). No phone-home.

## Checking a licence

```bash
node licence/licence-verify.js browns.licence
```

Prints the signature status, org, modules, expiry and id.
