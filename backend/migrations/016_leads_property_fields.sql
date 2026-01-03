-- Migration: 016_leads_property_fields.sql
-- Add property details fields to leads table for property-specific leads

-- Property details from Repliers API lookup
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_listing_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_list_price INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_bedrooms INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_bathrooms TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_sqft INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_image_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_raw JSONB;

-- Index for property lookup
CREATE INDEX IF NOT EXISTS idx_leads_property_listing_id ON leads(property_listing_id);

-- Add comment for documentation
COMMENT ON COLUMN leads.property_listing_id IS 'MLS listing ID from Repliers API';
COMMENT ON COLUMN leads.property_list_price IS 'Property list price at time of lead';
COMMENT ON COLUMN leads.property_raw IS 'Full Repliers API response for property';
