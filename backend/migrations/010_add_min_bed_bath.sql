-- Migration 010: Add min_bedrooms and min_bathrooms for Client Summary space bullets
-- These fields explicitly store buyer minimums for template generation

ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS min_bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS min_bathrooms DECIMAL(3,1);

COMMENT ON COLUMN buyer_profiles.min_bedrooms IS
  'Minimum bedrooms required by buyer (used for "You were looking for at least X" templates)';

COMMENT ON COLUMN buyer_profiles.min_bathrooms IS
  'Minimum bathrooms required by buyer (supports .5 increments for half baths)';

-- Create index for common queries filtering by bedroom/bathroom minimums
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_min_bed_bath
  ON buyer_profiles(min_bedrooms, min_bathrooms)
  WHERE min_bedrooms IS NOT NULL OR min_bathrooms IS NOT NULL;
