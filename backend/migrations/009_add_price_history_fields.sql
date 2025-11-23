-- Migration: Add canonical price history fields to repliers_listings
-- These fields store stable, durable facts about listings for market intelligence queries
-- Derived fields (fit scores, priority tags) are NOT stored - they are computed at runtime

-- Price history fields
ALTER TABLE repliers_listings ADD COLUMN IF NOT EXISTS price_cuts_count INTEGER DEFAULT 0;
ALTER TABLE repliers_listings ADD COLUMN IF NOT EXISTS total_price_reduction INTEGER DEFAULT 0;
ALTER TABLE repliers_listings ADD COLUMN IF NOT EXISTS last_price_change_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE repliers_listings ADD COLUMN IF NOT EXISTS price_trend_direction VARCHAR(10);

-- Lot size in acres (for rural/suburban searches)
ALTER TABLE repliers_listings ADD COLUMN IF NOT EXISTS lot_acres DECIMAL(10,2);

-- Special flags (Cash Only, As-Is, Investor Special, etc.)
ALTER TABLE repliers_listings ADD COLUMN IF NOT EXISTS special_flags JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN repliers_listings.price_cuts_count IS 'Number of price reductions since original listing';
COMMENT ON COLUMN repliers_listings.total_price_reduction IS 'Total dollar amount reduced from original price';
COMMENT ON COLUMN repliers_listings.last_price_change_date IS 'Date of most recent price change';
COMMENT ON COLUMN repliers_listings.price_trend_direction IS 'Price trend: up, down, or flat';
COMMENT ON COLUMN repliers_listings.lot_acres IS 'Lot size in acres (for land/rural searches)';
COMMENT ON COLUMN repliers_listings.special_flags IS 'Special listing conditions: Cash Only, As-Is, Investor Special, etc.';

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_repliers_listings_price_cuts ON repliers_listings (price_cuts_count) WHERE price_cuts_count > 0;
CREATE INDEX IF NOT EXISTS idx_repliers_listings_price_trend ON repliers_listings (price_trend_direction) WHERE price_trend_direction IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repliers_listings_special_flags ON repliers_listings USING GIN (special_flags) WHERE special_flags != '[]'::jsonb;
