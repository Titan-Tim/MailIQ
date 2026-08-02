#!/usr/bin/env bash
# Restore Mail-IQ from a backup. Run from the onprem/ directory.
#   ./restore.sh <mailiq-db-*.sql.gz> [mailiq-uploads-*.tar.gz]
set -euo pipefail
set -a; [ -f .env ] && . ./.env; set +a

DB_DUMP="${1:?usage: ./restore.sh <db .sql.gz> [uploads .tar.gz]}"
UPLOADS="${2:-}"

echo "→ Restoring database from $DB_DUMP…"
gunzip -c "$DB_DUMP" | docker compose exec -T db psql -U "${POSTGRES_USER:-mailiq}" -d "${POSTGRES_DB:-mailiq}"

if [ -n "$UPLOADS" ]; then
  echo "→ Restoring uploaded files from $UPLOADS…"
  docker run --rm -v mail-iq_uploads:/data -v "$(pwd):/backup" alpine \
    sh -c "rm -rf /data/* && tar xzf /backup/$UPLOADS -C /data"
fi

echo "✓ Restore complete. Restart the app:  docker compose restart backend"
