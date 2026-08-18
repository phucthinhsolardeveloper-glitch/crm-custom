#!/bin/bash
# Backup script for crm-custom PostgreSQL database
# Run daily via cron: 0 2 * * * /path/to/backup-postgres.sh

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="crm-postgres"
DB_NAME="${POSTGRES_DB:-crm_v4}"
DB_USER="${POSTGRES_USER:-crm}"
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting PostgreSQL backup..."

# Check if container is running
if ! docker ps | grep -q "$DB_CONTAINER"; then
  echo "[ERROR] Container $DB_CONTAINER is not running"
  exit 1
fi

# Perform backup
docker exec "$DB_CONTAINER" pg_dump \
  -U "$DB_USER" \
  --format=plain \
  --no-password \
  "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[SUCCESS] Backup saved to: $BACKUP_FILE (Size: $FILE_SIZE)"
else
  echo "[ERROR] Backup failed"
  exit 1
fi

# Cleanup old backups (keep last 7 days)
echo "[INFO] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "postgres_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup complete!"
