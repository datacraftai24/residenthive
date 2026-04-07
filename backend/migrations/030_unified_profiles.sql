-- Migration 030: Unified Profiles
-- Adds lead-specific fields to buyer_profiles so a single table
-- can represent both leads and buyers via profile_type column.

ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS profile_type TEXT DEFAULT 'buyer';
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS intent_score INTEGER;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS lead_type TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS property_url TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS property_address TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS property_listing_id TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS property_list_price INTEGER;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS property_bedrooms INTEGER;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS property_bathrooms INTEGER;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS property_sqft INTEGER;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS suggested_message TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS hints JSONB;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS lead_raw_input TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS extraction_confidence INTEGER;

-- Index for filtering by profile_type
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_profile_type ON buyer_profiles(profile_type);
