#!/bin/bash
# Run PostgreSQL migration on GCP Cloud SQL
# Usage: ./scripts/run-gcp-migration.sh <migration_file.sql>
#
# This script uses Cloud SQL Auth Proxy with gcloud credentials (no IP allowlisting needed)

set -e

# Configuration
PROJECT_ID="resident-hive-ai-agent-pilot"
INSTANCE="real-estate-db"
REGION="us-central1"
DB_USER="residenthive_app"
DB_NAME="residenthive"
DB_PASSWORD="Taylors_9876"
PROXY_PORT=5434

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide migration file path${NC}"
    echo "Usage: $0 <migration_file.sql>"
    echo "Example: $0 backend/migrations/024_prevent_duplicate_profiles.sql"
    exit 1
fi

MIGRATION_FILE="$1"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}======================================${NC}"
echo -e "${YELLOW}Running GCP Cloud SQL Migration${NC}"
echo -e "${YELLOW}======================================${NC}"
echo "Project: $PROJECT_ID"
echo "Instance: $INSTANCE"
echo "Database: $DB_NAME"
echo "Migration: $MIGRATION_FILE"
echo ""

# Check if gcloud is authenticated
echo -e "${YELLOW}Checking gcloud authentication...${NC}"
if ! gcloud auth print-access-token &>/dev/null; then
    echo -e "${RED}gcloud not authenticated. Running: gcloud auth login${NC}"
    gcloud auth login
fi

# Set project
gcloud config set project $PROJECT_ID &>/dev/null

# Check if cloud-sql-proxy is installed
if ! command -v cloud-sql-proxy &>/dev/null; then
    echo -e "${RED}Error: cloud-sql-proxy not installed${NC}"
    echo "Install with: brew install cloud-sql-proxy"
    exit 1
fi

# Kill any existing proxy on our port
echo -e "${YELLOW}Cleaning up existing proxy processes...${NC}"
pkill -f "cloud-sql-proxy.*$PROXY_PORT" 2>/dev/null || true
sleep 2

# Start Cloud SQL Proxy with gcloud auth (key flag!)
echo -e "${YELLOW}Starting Cloud SQL Proxy...${NC}"
cloud-sql-proxy --port $PROXY_PORT --gcloud-auth ${PROJECT_ID}:${REGION}:${INSTANCE} &
PROXY_PID=$!

# Wait for proxy to start
sleep 5

# Test connection
echo -e "${YELLOW}Testing database connection...${NC}"
if ! PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p $PROXY_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" &>/dev/null; then
    echo -e "${RED}Failed to connect to database${NC}"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi
echo -e "${GREEN}Connection successful!${NC}"

# Run migration
echo ""
echo -e "${YELLOW}Running migration: $MIGRATION_FILE${NC}"
echo "----------------------------------------"
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p $PROXY_PORT -U $DB_USER -d $DB_NAME -f "$MIGRATION_FILE"
RESULT=$?
echo "----------------------------------------"

# Cleanup
echo -e "${YELLOW}Stopping Cloud SQL Proxy...${NC}"
kill $PROXY_PID 2>/dev/null || true

if [ $RESULT -eq 0 ]; then
    echo ""
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}Migration completed successfully!${NC}"
    echo -e "${GREEN}======================================${NC}"
else
    echo ""
    echo -e "${RED}======================================${NC}"
    echo -e "${RED}Migration failed with exit code: $RESULT${NC}"
    echo -e "${RED}======================================${NC}"
    exit $RESULT
fi
