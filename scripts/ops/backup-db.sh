#!/usr/bin/env bash
# Backup de UAT (docs/deploy.md, "Backups"). Corre en el VPS, desde la carpeta del deploy.
#
#   scripts/ops/backup-db.sh pre-deploy   # antes de migrar: solo la base
#   scripts/ops/backup-db.sh daily        # cron diario: base + archivos subidos
#
# Toma la base de `DATABASE_URL` en apps/gestion/.env (una sola base para las tres apps, ADR 0015).
# Deja los archivos en BACKUP_DIR, borra los de más de BACKUP_KEEP_DAYS días y, si está
# BACKUP_S3_URI, copia cada uno fuera del servidor con la CLI de AWS.
set -euo pipefail

KIND="${1:-}"
if [ "$KIND" != "pre-deploy" ] && [ "$KIND" != "daily" ]; then
  echo "Uso: $0 pre-deploy|daily" >&2
  exit 2
fi

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/norde-uat}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STORAGE_DIR="${STORAGE_DIR:-/var/www/norde-uat-storage}"

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/apps/gestion/.env" | cut -d= -f2-)"
if [ -z "$DATABASE_URL" ]; then
  echo "No hay DATABASE_URL en apps/gestion/.env" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILES=()

DB_FILE="$BACKUP_DIR/db-$KIND-$STAMP.dump"
# Formato custom: comprimido y se restaura con pg_restore (por tabla si hace falta).
pg_dump --format=custom --no-owner --file="$DB_FILE" "$DATABASE_URL"
FILES+=("$DB_FILE")

if [ "$KIND" = "daily" ]; then
  FILES_FILE="$BACKUP_DIR/files-$STAMP.tar.gz"
  SOURCES=()
  [ -d "$STORAGE_DIR" ] && SOURCES+=("$STORAGE_DIR")
  [ -d "$APP_DIR/apps/web/media" ] && SOURCES+=("$APP_DIR/apps/web/media")
  if [ "${#SOURCES[@]}" -gt 0 ]; then
    tar -czf "$FILES_FILE" "${SOURCES[@]}"
    FILES+=("$FILES_FILE")
  fi
fi

if [ -n "${BACKUP_S3_URI:-}" ]; then
  for file in "${FILES[@]}"; do
    aws s3 cp --only-show-errors "$file" "$BACKUP_S3_URI/$(basename "$file")"
  done
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) \
  -mtime +"$BACKUP_KEEP_DAYS" -delete

for file in "${FILES[@]}"; do
  echo "Backup: $file ($(du -h "$file" | cut -f1))"
done
