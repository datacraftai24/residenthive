-- Migration 013: Add location preferences to buyer_profiles
-- Enables location intelligence feature with work address and commute analysis

-- Add location-related fields to buyer_profiles
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS work_address TEXT,
  ADD COLUMN IF NOT EXISTS max_commute_mins INTEGER DEFAULT 35,
  ADD COLUMN IF NOT EXISTS location_preferences JSONB DEFAULT '{
    "prioritize_quiet_street": false,
    "prioritize_walkability": false,
    "has_kids": false
  }'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN buyer_profiles.work_address IS
  'Buyer work address for commute calculations. NULL = skip commute analysis in location intelligence';

COMMENT ON COLUMN buyer_profiles.max_commute_mins IS
  'Maximum acceptable commute time in minutes. Used for location verdict computation. Default: 35';

COMMENT ON COLUMN buyer_profiles.location_preferences IS
  'JSONB preferences for location analysis:
  - prioritize_quiet_street (boolean): Prefer low-traffic residential streets
  - prioritize_walkability (boolean): Prefer walkable neighborhoods
  - has_kids (boolean): Has children (affects park/playground importance)';

-- Create index for queries filtering by work_address presence
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_work_address
  ON buyer_profiles(work_address)
  WHERE work_address IS NOT NULL;

-- Create GIN index for JSONB location_preferences
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_location_prefs
  ON buyer_profiles USING GIN (location_preferences);
