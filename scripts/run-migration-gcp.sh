#!/bin/bash

# PostgreSQL Migration Script for ResidentHive CloudSQL
# Usage: ./scripts/run-migration-gcp.sh [OPTIONS]
#
# Options:
#   --dry-run    Show SQL that would be executed without running it
#   --status     Show current database schema status
#   --help       Show this help message

set -e

# Configuration
GCP_PROJECT_ID="${GCP_PROJECT_ID:-resident-hive-ai-agent-pilot}"
INSTANCE_NAME="real-estate-db"
DB_NAME="residenthive"
DB_USER="residenthive_app"
MIGRATIONS_DIR="backend/migrations"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
STATUS_CHECK=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      echo -e "${YELLOW}🔍 Running in DRY RUN mode - no changes will be applied${NC}"
      shift
      ;;
    --status)
      STATUS_CHECK=true
      echo -e "${BLUE}📊 Checking database schema status${NC}"
      shift
      ;;
    --help)
      echo "ResidentHive Database Migration Script"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --dry-run    Show SQL that would be executed without running it"
      echo "  --status     Show current database schema status"
      echo "  --help       Show this help message"
      echo ""
      echo "Default: Run all pending migrations"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Get database password from Secret Manager
echo -e "${BLUE}🔐 Retrieving database password from Secret Manager...${NC}"
DB_PASSWORD=$(gcloud secrets versions access latest --secret="PGPASSWORD" --project="$GCP_PROJECT_ID" 2>&1)
if [ $? -ne 0 ] || [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}❌ Failed to retrieve database password from Secret Manager${NC}"
    echo "$DB_PASSWORD"
    exit 1
fi
echo -e "${GREEN}✅ Password retrieved successfully${NC}"

# Status check mode
if [ "$STATUS_CHECK" = true ]; then
    echo -e "${BLUE}📋 Database Schema Status:${NC}"
    echo ""
    {
        echo "$DB_PASSWORD"
        sleep 1
        cat << 'EOF'
\dt
\d buyer_profiles
\d buyer_reports
EOF
        sleep 1
    } | gcloud sql connect "$INSTANCE_NAME" \
        --user="$DB_USER" \
        --database="$DB_NAME" \
        --project="$GCP_PROJECT_ID" \
        --quiet 2>&1 | grep -v "^Password:"
    exit 0
fi

# Collect all migration files
echo -e "${BLUE}📂 Scanning for migration files in $MIGRATIONS_DIR...${NC}"
MIGRATION_FILES=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)

if [ -z "$MIGRATION_FILES" ]; then
    echo -e "${YELLOW}⚠️  No migration files found in $MIGRATIONS_DIR${NC}"
    exit 0
fi

echo -e "${GREEN}Found migrations:${NC}"
echo "$MIGRATION_FILES" | while read -r file; do
    echo "  - $(basename "$file")"
done
echo ""

# Combine all migration SQL
COMBINED_SQL=$(cat $MIGRATION_FILES)

# Dry run mode - just show SQL
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}📄 SQL that would be executed:${NC}"
    echo "----------------------------------------"
    echo "$COMBINED_SQL"
    echo "----------------------------------------"
    echo -e "${YELLOW}ℹ️  No changes were applied (dry-run mode)${NC}"
    exit 0
fi

# Execute migrations
echo -e "${BLUE}🚀 Running migrations on CloudSQL instance: $INSTANCE_NAME${NC}"
echo -e "${BLUE}   Database: $DB_NAME${NC}"
echo -e "${BLUE}   User: $DB_USER${NC}"
echo ""

# Run via gcloud sql connect with password
# Note: gcloud sql connect doesn't respect PGPASSWORD, so we use expect
{
    echo "$DB_PASSWORD"
    sleep 1
    echo "$COMBINED_SQL"
    sleep 1
} | gcloud sql connect "$INSTANCE_NAME" \
    --user="$DB_USER" \
    --database="$DB_NAME" \
    --project="$GCP_PROJECT_ID" \
    --quiet 2>&1 | tee /tmp/migration-output.log | grep -v "^Password:"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Migrations completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}📊 Verifying schema changes...${NC}"

    # Verify tables exist
    {
        echo "$DB_PASSWORD"
        sleep 1
        cat << 'EOF'
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buyer_profiles' AND column_name = 'min_bedrooms')
        THEN '✅ buyer_profiles.min_bedrooms'
        ELSE '❌ buyer_profiles.min_bedrooms'
    END,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'buyer_reports')
        THEN '✅ buyer_reports table'
        ELSE '❌ buyer_reports table'
    END,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buyer_reports' AND column_name = 'synthesis_data')
        THEN '✅ buyer_reports.synthesis_data'
        ELSE '❌ buyer_reports.synthesis_data'
    END;
EOF
        sleep 1
    } | gcloud sql connect "$INSTANCE_NAME" \
        --user="$DB_USER" \
        --database="$DB_NAME" \
        --project="$GCP_PROJECT_ID" \
        --quiet 2>&1 | grep -v "^Password:"

    echo ""
    echo -e "${GREEN}🎉 All done!${NC}"
else
    echo ""
    echo -e "${RED}❌ Migration failed!${NC}"
    exit 1
fi
