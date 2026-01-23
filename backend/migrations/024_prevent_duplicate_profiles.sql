-- Migration 024: Prevent duplicate buyer profiles
-- Addresses: Multiple profiles being created for same email per agent
-- Root cause: No unique constraint + race conditions on lead conversion

-- This migration:
-- 1. Identifies duplicate profiles (same agent_id + email)
-- 2. Chooses a "keeper" for each group (oldest profile)
-- 3. Updates all FK references to point to the keeper
-- 4. Deletes duplicate profiles
-- 5. Adds unique constraints to prevent future duplicates

BEGIN;

-- Step 1: Create temp table with duplicate mapping (duplicate_id -> keeper_id)
CREATE TEMP TABLE profile_duplicates AS
WITH ranked AS (
    SELECT
        id,
        agent_id,
        email,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY agent_id, email ORDER BY created_at, id) as rn
    FROM buyer_profiles
    WHERE email IS NOT NULL AND email != ''
),
keepers AS (
    SELECT agent_id, email, id as keeper_id
    FROM ranked
    WHERE rn = 1
)
SELECT r.id as duplicate_id, k.keeper_id
FROM ranked r
JOIN keepers k ON r.agent_id = k.agent_id AND r.email = k.email
WHERE r.rn > 1;

-- Log what we're about to do
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM profile_duplicates;
    RAISE NOTICE 'Found % duplicate profiles to merge', dup_count;
END $$;

-- Step 2: Update all FK references from duplicates to keepers
-- Each table that references buyer_profiles.id needs to be updated

UPDATE agent_action_feedback SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE agent_action_feedback.profile_id = pd.duplicate_id;

UPDATE agent_insight_feedback SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE agent_insight_feedback.profile_id = pd.duplicate_id;

UPDATE agent_interactions SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE agent_interactions.profile_id = pd.duplicate_id;

UPDATE agent_notes SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE agent_notes.profile_id = pd.duplicate_id;

UPDATE buyer_reports SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE buyer_reports.profile_id = pd.duplicate_id;

UPDATE cached_search_results SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE cached_search_results.profile_id = pd.duplicate_id;

UPDATE chat_agent_insights SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE chat_agent_insights.profile_id = pd.duplicate_id;

UPDATE chat_sessions SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE chat_sessions.profile_id = pd.duplicate_id;

UPDATE ingestion_jobs SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE ingestion_jobs.profile_id = pd.duplicate_id;

UPDATE investment_strategies SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE investment_strategies.profile_id = pd.duplicate_id;

UPDATE leads SET converted_profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE leads.converted_profile_id = pd.duplicate_id;

UPDATE listing_shareable_links SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE listing_shareable_links.profile_id = pd.duplicate_id;

UPDATE nlp_search_logs SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE nlp_search_logs.profile_id = pd.duplicate_id;

UPDATE profile_chat_links SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE profile_chat_links.profile_id = pd.duplicate_id;

UPDATE profile_insights_lock SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE profile_insights_lock.profile_id = pd.duplicate_id;

UPDATE profile_persona SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE profile_persona.profile_id = pd.duplicate_id;

UPDATE profile_shareable_links SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE profile_shareable_links.profile_id = pd.duplicate_id;

UPDATE profile_tags SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE profile_tags.profile_id = pd.duplicate_id;

UPDATE property_analysis_cache SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE property_analysis_cache.profile_id = pd.duplicate_id;

UPDATE repliers_listings SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE repliers_listings.profile_id = pd.duplicate_id;

UPDATE search_outcomes SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE search_outcomes.profile_id = pd.duplicate_id;

UPDATE search_transactions SET profile_id = pd.keeper_id
FROM profile_duplicates pd WHERE search_transactions.profile_id = pd.duplicate_id;

-- Step 3: Delete duplicate profiles (now safe since no FKs point to them)
DELETE FROM buyer_profiles
WHERE id IN (SELECT duplicate_id FROM profile_duplicates);

-- Step 4: Add unique constraint on (agent_id, email)
-- Prevents duplicate profiles for the same email per agent
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_profile_per_agent_email
ON buyer_profiles (agent_id, email)
WHERE email IS NOT NULL AND email != '';

-- Step 5: Add unique constraint for lead-converted profiles
-- Ensures each lead can only create one profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_profile_per_lead
ON buyer_profiles (parent_lead_id)
WHERE parent_lead_id IS NOT NULL;

-- Cleanup
DROP TABLE profile_duplicates;

COMMIT;
