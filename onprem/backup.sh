#!/usr/bin/env bash
# Back up Mail-IQ: database + uploaded files. Run from the onprem/ directory.
#   ./backup.sh [output-dir]
set -euo pipefail
set -a; [ -f .env ] && . ./.env; set +a

OUT="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "→ Database…"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-mailiq}" "${POSTGRES_DB:-mailiq}" | gzip > "$OUT/mailiq-db-$STAMP.sql.gz"

echo "→ Uploaded files…"
docker run --rm -v mail-iq_uploads:/data -v "$(pwd)/$OUT:/backup" alpine \
  tar czf "/backup/mailiq-uploads-$STAMP.tar.gz" -C /data .

echo "✓ Backup complete:"
echo "   $OUT/mailiq-db-$STAMP.sql.gz"
echo "   $OUT/mailiq-uploads-$STAMP.tar.gz"
echo "  (also keep a copy of your .env and licence/ file.)"
