-- Migration: Add raw JSON storage and quality analysis fields
-- Purpose: Preserve all Repliers API data and enable quality analysis
-- Date: 2025-11-08

-- Add raw_json column to store complete Repliers API response
ALTER TABLE repliers_listings
ADD COLUMN raw_json JSONB;

-- Add extracted date/price fields for fast queries
ALTER TABLE repliers_listings
ADD COLUMN list_date TIMESTAMP,
ADD COLUMN original_price INTEGER,
ADD COLUMN last_status_date TIMESTAMP,
ADD COLUMN days_on_market INTEGER;

-- Create GIN index on raw_json for fast JSON queries
CREATE INDEX idx_repliers_listings_raw_json ON repliers_listings USING GIN (raw_json);

-- Create index on days_on_market for sorting by listing age
CREATE INDEX idx_repliers_listings_days_on_market ON repliers_listings (days_on_market);

-- Add comments explaining the purpose of each new column
COMMENT ON COLUMN repliers_listings.raw_json IS 'Complete raw JSON response from Repliers API, preserving all fields';
COMMENT ON COLUMN repliers_listings.list_date IS 'Parsed listDate from Repliers API for calculating days on market';
COMMENT ON COLUMN repliers_listings.original_price IS 'Original listing price from Repliers API for detecting price changes';
COMMENT ON COLUMN repliers_listings.last_status_date IS 'Date of last status change from Repliers API';
COMMENT ON COLUMN repliers_listings.days_on_market IS 'Calculated days on market since list_date';
