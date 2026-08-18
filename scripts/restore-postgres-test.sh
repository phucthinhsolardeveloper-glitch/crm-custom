#!/bin/bash
# Restore test script for crm-custom PostgreSQL database
# Usage: ./restore-postgres-test.sh <backup_file.sql.gz>

set -e

BACKUP_FILE="${1}"
DB_CONTAINER="crm-postgres"
DB_NAME="${POSTGRES_DB:-crm_v4}"
DB_USER="${POSTGRES_USER:-crm}"
TEST_DB="${DB_NAME}_restore_test_$(date +%s)"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Example: $0 ./backups/postgres_20260818_020000.sql.gz"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[ERROR] Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting restore test..."
echo "  Backup file: $BACKUP_FILE"
echo "  Test DB: $TEST_DB"
echo ""

# Check if container is running
if ! docker ps | grep -q "$DB_CONTAINER"; then
  echo "[ERROR] Container $DB_CONTAINER is not running"
  exit 1
fi

# Step 1: Create test database
echo "[STEP 1] Creating test database: $TEST_DB..."
docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$TEST_DB" || true

# Step 2: Restore backup into test database
echo "[STEP 2] Restoring backup into $TEST_DB..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB"

# Step 3: Verify restoration
echo "[STEP 3] Verifying restoration..."
TABLE_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")

echo "  Total tables in restored DB: $TABLE_COUNT"

# Step 4: Sample data check
echo "[STEP 4] Sampling data from key tables..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c \
  "SELECT COUNT(*) as lead_count FROM leads LIMIT 1;" || echo "  (leads table not found or empty)"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c \
  "SELECT COUNT(*) as customer_count FROM customers LIMIT 1;" || echo "  (customers table not found or empty)"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c \
  "SELECT COUNT(*) as order_count FROM orders LIMIT 1;" || echo "  (orders table not found or empty)"

echo ""
echo "[SUCCESS] Restore test completed!"
echo ""
echo "To cleanup test database, run:"
echo "  docker exec $DB_CONTAINER dropdb -U $DB_USER $TEST_DB"
echo ""
echo "To inspect test database manually:"
echo "  docker exec -it $DB_CONTAINER psql -U $DB_USER -d $TEST_DB"
