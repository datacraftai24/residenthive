-- Migration 003: Property Analysis Cache
-- Stores AI-generated property analyses to avoid redundant API calls
-- TTL: 24 hours (managed by application layer)

CREATE TABLE IF NOT EXISTS property_analysis_cache (
    id SERIAL PRIMARY KEY,
    listing_id TEXT NOT NULL,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    analysis_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_listing_profile UNIQUE (listing_id, profile_id)
);

-- Index for fast lookups by listing + profile
CREATE INDEX IF NOT EXISTS idx_property_analysis_cache_lookup
ON property_analysis_cache(listing_id, profile_id, created_at DESC);

-- Index for cleanup of old entries
CREATE INDEX IF NOT EXISTS idx_property_analysis_cache_created
ON property_analysis_cache(created_at);

-- Comment
COMMENT ON TABLE property_analysis_cache IS
'Caches AI-generated property analysis to reduce OpenAI API costs. TTL managed by application (24 hours).';

COMMENT ON COLUMN property_analysis_cache.listing_id IS
'MLS number or listing ID from Repliers API';

COMMENT ON COLUMN property_analysis_cache.analysis_json IS
'AI-generated analysis including headline, agent_insight, matched_features, why_it_works, match_reasoning';
