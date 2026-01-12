-- Migration: 019_add_missing_profile_columns.sql
-- Adds missing columns to buyer_profiles that may not exist on some environments
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Work/commute related columns (from 013_location_preferences)
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS work_address TEXT,
  ADD COLUMN IF NOT EXISTS max_commute_mins INTEGER,
  ADD COLUMN IF NOT EXISTS prioritize_quiet_street BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS prioritize_walkability BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_kids BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_preferences JSONB DEFAULT '{}';

-- Columns from initial schema that may be missing
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS nlp_confidence INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_profile_id INTEGER;

-- Lead link columns (from 015_profiles_lead_link)
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS parent_lead_id INTEGER,
  ADD COLUMN IF NOT EXISTS created_by_method VARCHAR(50);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_work_address
  ON buyer_profiles(work_address)
  WHERE work_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_parent_lead
  ON buyer_profiles(parent_lead_id)
  WHERE parent_lead_id IS NOT NULL;

-- Add foreign key if not exists (wrapped in DO block for safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_buyer_profiles_parent_profile'
  ) THEN
    ALTER TABLE buyer_profiles
      ADD CONSTRAINT fk_buyer_profiles_parent_profile
      FOREIGN KEY (parent_profile_id) REFERENCES buyer_profiles(id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if constraint already exists or can't be created
  NULL;
END $$;

-- Comments
COMMENT ON COLUMN buyer_profiles.work_address IS
  'Work/office address for commute calculations';
COMMENT ON COLUMN buyer_profiles.max_commute_mins IS
  'Maximum acceptable commute time in minutes';
COMMENT ON COLUMN buyer_profiles.nlp_confidence IS
  'Confidence score from NLP extraction (0-100)';
COMMENT ON COLUMN buyer_profiles.version IS
  'Version number for profile iterations';
COMMENT ON COLUMN buyer_profiles.parent_profile_id IS
  'Reference to parent profile if this is a refined version';
