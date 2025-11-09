#!/bin/bash
set -e

# Database Migration Script for Google Cloud SQL
# This script runs SQL migrations on Cloud SQL PostgreSQL instance

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-resident-hive-ai-agent-pilot}"
REGION="${GCP_REGION:-us-central1}"
INSTANCE_NAME="real-estate-db"
DATABASE_NAME="residenthive"
DB_USER="residenthive_app"

echo "======================================"
echo "Running Database Migration"
echo "======================================"
echo "Project: ${PROJECT_ID}"
echo "Instance: ${INSTANCE_NAME}"
echo "Database: ${DATABASE_NAME}"
echo ""

# Check if migration file is provided
if [ -z "$1" ]; then
    echo "Error: Migration file not specified"
    echo "Usage: ./run-migration.sh <migration-file.sql>"
    echo ""
    echo "Example: ./run-migration.sh backend/migrations/006_add_raw_listing_json.sql"
    exit 1
fi

MIGRATION_FILE="$1"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "Migration file: $MIGRATION_FILE"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed"
    exit 1
fi

# Set the project
echo "Setting GCP project..."
gcloud config set project ${PROJECT_ID}

# Get database password from Secret Manager
echo "Retrieving database credentials from Secret Manager..."
DATABASE_URL=$(gcloud secrets versions access latest --secret="DATABASE_URL" 2>/dev/null || echo "")
# Extract password from DATABASE_URL (format: postgresql://user:password@host/db)
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

if [ -z "$DB_PASSWORD" ]; then
    echo "Warning: Could not retrieve password from Secret Manager"
    echo "Attempting connection without password (will prompt if needed)..."

    # Try direct connection with gcloud (will prompt for password)
    echo "Running migration via gcloud sql connect..."
    gcloud sql connect ${INSTANCE_NAME} --user=${DB_USER} --database=${DATABASE_NAME} < ${MIGRATION_FILE}
else
    echo "Password retrieved successfully"

    # Get instance connection info
    INSTANCE_IP=$(gcloud sql instances describe ${INSTANCE_NAME} --format="value(ipAddresses[0].ipAddress)")

    echo "Allowlisting your IP address..."
    # Allowlist current IP for 5 minutes
    gcloud sql connect ${INSTANCE_NAME} --user=${DB_USER} --quiet &
    CONNECT_PID=$!
    sleep 5
    kill $CONNECT_PID 2>/dev/null || true

    echo "Running migration with psql..."
    # Use psql directly with password
    PGPASSWORD="${DB_PASSWORD}" psql -h ${INSTANCE_IP} -U ${DB_USER} -d ${DATABASE_NAME} -f ${MIGRATION_FILE}
fi

echo ""
echo "======================================"
echo "Migration Complete!"
echo "======================================"
echo ""
