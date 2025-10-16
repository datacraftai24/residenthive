-- Migration: Add max_bedrooms column to buyer_profiles
-- Date: 2025-10-15
-- Description: Add support for bedroom range filtering (min-max bedrooms)

-- Add max_bedrooms column
ALTER TABLE buyer_profiles
ADD COLUMN max_bedrooms INT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN buyer_profiles.max_bedrooms IS
  'Maximum bedrooms desired (NULL = no maximum limit)';

-- Add index for better query performance
CREATE INDEX idx_buyer_profiles_bedrooms
ON buyer_profiles(bedrooms, max_bedrooms)
WHERE bedrooms IS NOT NULL OR max_bedrooms IS NOT NULL;
