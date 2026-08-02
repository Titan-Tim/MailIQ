# Mail-IQ — On-Premise Deployment

Run the whole of Mail-IQ inside the customer's own network with one command.
Nothing leaves the building: the database, uploaded documents and processing all
stay local. This is the alternative to the SaaS edition for compliance-sensitive
customers; the same codebase powers both.

## What's in the box

`docker compose up` starts four containers:

| Service   | What it is                                            |
|-----------|-------------------------------------------------------|
| `db`      | PostgreSQL (data on a durable volume)                 |
| `backend` | The API — runs migrations + first-run setup on boot   |
| `portal`  | The web app (Next.js)                                 |
| `caddy`   | Reverse proxy + HTTPS on one origin (`/api` → backend)|

The scan-folder **agent** still runs on the mailroom PC (as with SaaS), pointing
at this server's URL — that's what watches the hot folder and writes filed
documents into local folders (e.g. Proclaim). See the agent's own setup.

## Requirements

- A Linux host (or Windows Server with Docker Desktop) with **Docker** + the
  **Docker Compose** plugin.
- A hostname for the server on the LAN (e.g. `mailiq.yourfirm.local`) pointing at
  its IP, or a public domain if internet-facing.

## Install

```bash
cd onprem
cp .env.example .env
# edit .env — set PUBLIC_HOST/PUBLIC_URL, a DB password, JWT secrets
#   (generate secrets with:  openssl rand -hex 32 )
# and the first-run admin (BOOTSTRAP_*).

docker compose up -d --build
```

First build takes a few minutes (it compiles the portal). When it's up, browse to
`https://PUBLIC_HOST` and sign in with the BOOTSTRAP admin.

> **TLS:** by default Caddy issues a local certificate (works offline). Trust the
> Caddy root CA on client machines, or drop in your own cert — see `Caddyfile`.
> For a public domain, delete the `tls internal` line and Caddy will obtain a
> Let's Encrypt certificate automatically.

## Licence (module entitlements)

Entitlements are enforced by a **signed licence file** issued by the provider
(see `../backend/licence/`).

1. Provider mints one: `node licence/licence-mint.js --org "Firm" --modules inbound --months 12 --out mailiq.licence`
2. Put it at `onprem/licence/mailiq.licence`.
3. `docker compose restart backend` — the boot log shows the licence status.

Without a licence file the app runs **unlicensed in database mode** (both modules,
handy for initial testing). With one, only the licensed modules are usable and the
app locks at expiry. Renewal = drop in a new file and restart the backend.

## Email (optional)

Set `SMTP_*` in `.env` to the customer's mail server for password-reset and invite
emails. Leave `SMTP_HOST` blank to disable outgoing email entirely.

## Backups

```bash
./backup.sh                 # writes db + uploads archives to ./backups
./restore.sh backups/mailiq-db-YYYYMMDD-HHMMSS.sql.gz backups/mailiq-uploads-YYYYMMDD-HHMMSS.tar.gz
```

Also keep a copy of `.env` and your `licence/` file. Schedule `backup.sh` via cron.

## Updating

```bash
git pull            # get the new code
docker compose up -d --build   # rebuild + restart; migrations apply automatically
```

## Handy commands

```bash
docker compose ps            # status
docker compose logs -f backend
docker compose down          # stop (data volumes are kept)
```
