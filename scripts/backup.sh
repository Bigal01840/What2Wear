#!/bin/sh
# Nightly backup: SQLite snapshot + photos, keeping 30 days.
# Cron (crontab -e):  15 3 * * * cd /home/pi/sleep-outfit && sh scripts/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
DATA_DIR="${DATA_DIR:-./data}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR/photos"
node scripts/backup.mjs "$BACKUP_DIR"
# Photos never change once written, so a plain copy of new files is enough.
cp -Rn "$DATA_DIR/photos/." "$BACKUP_DIR/photos/" 2>/dev/null || true
cp -n "$DATA_DIR/vapid.json" "$BACKUP_DIR/" 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 -name 'sleep-outfit-*.db' -mtime +30 -delete
