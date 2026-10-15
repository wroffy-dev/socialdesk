#!/bin/sh
# Daily PostgreSQL backups with retention. Runs inside the `backup` compose service.
#   BACKUP_INTERVAL_SECONDS (default 86400), BACKUP_RETENTION_DAYS (default 14)
set -eu
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
DIR=/backups
mkdir -p "$DIR"

while true; do
  STAMP=$(date -u +%Y%m%d-%H%M%S)
  FILE="$DIR/socialdesk-$STAMP.dump"
  echo "[backup] starting $FILE"
  if pg_dump --format=custom --no-owner --file="$FILE.partial" "$DATABASE_URL"; then
    mv "$FILE.partial" "$FILE"
    echo "[backup] done $(du -h "$FILE" | cut -f1)"
  else
    echo "[backup] FAILED" >&2
    rm -f "$FILE.partial"
  fi
  find "$DIR" -name 'socialdesk-*.dump' -mtime "+$RETENTION" -print -delete || true
  sleep "$INTERVAL"
done
