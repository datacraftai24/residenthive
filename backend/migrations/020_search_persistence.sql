-- Add search persistence fields to buyer_profiles
-- Allows agents to resume searches after page refresh or tab switch

-- Store last search reference on buyer profile
ALTER TABLE buyer_profiles
ADD COLUMN IF NOT EXISTS last_search_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS last_search_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_search_data JSONB;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_last_search
ON buyer_profiles(last_search_id) WHERE last_search_id IS NOT NULL;

COMMENT ON COLUMN buyer_profiles.last_search_id IS 'UUID of the most recent search for this profile';
COMMENT ON COLUMN buyer_profiles.last_search_at IS 'Timestamp of the most recent search';
COMMENT ON COLUMN buyer_profiles.last_search_data IS 'Cached search results for resume functionality';
