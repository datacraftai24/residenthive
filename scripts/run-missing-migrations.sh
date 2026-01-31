#!/bin/bash
set -e

# Script to run missing migrations on Cloud SQL production database
# This adds the columns needed for profile saving to work correctly

PROJECT_ID="resident-hive-ai-agent-pilot"
INSTANCE_NAME="real-estate-db"
DATABASE_NAME="residenthive"
USER="residenthive_app"

echo "========================================"
echo "Running Missing Migrations on Cloud SQL"
echo "========================================"
echo "Project: $PROJECT_ID"
echo "Instance: $INSTANCE_NAME"
echo "Database: $DATABASE_NAME"
echo ""

# Get the database password from Secret Manager
echo "Retrieving database credentials..."
DB_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=$PROJECT_ID)
DB_PASSWORD=$(echo $DB_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

if [ -z "$DB_PASSWORD" ]; then
    echo "Error: Could not extract password from DATABASE_URL secret"
    exit 1
fi

echo "Password retrieved successfully"
echo ""

# Create a combined migration file
MIGRATION_FILE="/tmp/combined_migrations.sql"

echo "Creating combined migration file..."
cat > $MIGRATION_FILE << 'EOF'
-- Combined migrations: 002, 007, 008
-- These add the missing columns needed for AI-enhanced buyer profiles

-- Migration 002: Add max_bedrooms column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'buyer_profiles' AND column_name = 'max_bedrooms'
    ) THEN
        ALTER TABLE buyer_profiles ADD COLUMN max_bedrooms INT DEFAULT NULL;

        COMMENT ON COLUMN buyer_profiles.max_bedrooms IS
          'Maximum bedrooms desired (NULL = no maximum limit)';

        CREATE INDEX IF NOT EXISTS idx_buyer_profiles_bedrooms
        ON buyer_profiles(bedrooms, max_bedrooms)
        WHERE bedrooms IS NOT NULL OR max_bedrooms IS NOT NULL;

        RAISE NOTICE 'Added max_bedrooms column';
    ELSE
        RAISE NOTICE 'max_bedrooms column already exists, skipping';
    END IF;
END $$;

-- Migration 007: Add AI Insights fields
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'buyer_profiles' AND column_name = 'ai_summary'
    ) THEN
        ALTER TABLE buyer_profiles
          ADD COLUMN ai_summary TEXT,
          ADD COLUMN decision_drivers JSON DEFAULT '[]'::json,
          ADD COLUMN constraints JSON DEFAULT '[]'::json,
          ADD COLUMN nice_to_haves JSON DEFAULT '[]'::json,
          ADD COLUMN flexibility_explanations JSON DEFAULT '{}'::json;

        RAISE NOTICE 'Added AI insights columns';
    ELSE
        RAISE NOTICE 'AI insights columns already exist, skipping';
    END IF;
END $$;

-- Migration 008: Add Vision Checklist field
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'buyer_profiles' AND column_name = 'vision_checklist'
    ) THEN
        ALTER TABLE buyer_profiles
          ADD COLUMN vision_checklist JSON DEFAULT '{}'::json;

        RAISE NOTICE 'Added vision_checklist column';
    ELSE
        RAISE NOTICE 'vision_checklist column already exists, skipping';
    END IF;
END $$;

-- Verify all columns exist
SELECT
    CASE
        WHEN COUNT(*) = 7 THEN 'SUCCESS: All required columns exist'
        ELSE 'WARNING: Missing ' || (7 - COUNT(*)) || ' columns'
    END as migration_status
FROM information_schema.columns
WHERE table_name = 'buyer_profiles'
AND column_name IN (
    'max_bedrooms',
    'ai_summary',
    'decision_drivers',
    'constraints',
    'nice_to_haves',
    'flexibility_explanations',
    'vision_checklist'
);
EOF

echo "Combined migration file created at $MIGRATION_FILE"
echo ""

# Upload the migration file to the Cloud SQL instance
echo "Uploading migration file to Cloud SQL..."
gcloud sql import sql $INSTANCE_NAME $MIGRATION_FILE \
    --database=$DATABASE_NAME \
    --project=$PROJECT_ID \
    --quiet

echo ""
echo "========================================"
echo "Migration Complete!"
echo "========================================"
echo ""
echo "The following columns have been added to buyer_profiles table:"
echo "  - max_bedrooms (INT)"
echo "  - ai_summary (TEXT)"
echo "  - decision_drivers (JSON)"
echo "  - constraints (JSON)"
echo "  - nice_to_haves (JSON)"
echo "  - flexibility_explanations (JSON)"
echo "  - vision_checklist (JSON)"
echo ""
echo "Profile saving should now work correctly!"
echo ""
