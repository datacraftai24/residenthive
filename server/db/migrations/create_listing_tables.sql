-- Comprehensive listing storage using PostgreSQL as both relational and document store
-- This combines structured data for fast queries with JSONB for flexible storage

-- Main listings table with essential fields for queries
CREATE TABLE IF NOT EXISTS parsed_listings (
  -- Primary identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mls_number VARCHAR(100) UNIQUE NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'repliers', 'mls', etc.
  source_id VARCHAR(255) NOT NULL,
  
  -- Core searchable fields (denormalized for performance)
  price DECIMAL(12,2) NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  bathrooms DECIMAL(3,1) NOT NULL DEFAULT 0,
  property_type VARCHAR(100),
  square_feet INTEGER,
  year_built INTEGER,
  
  -- Location (denormalized for fast filtering)
  street_address VARCHAR(500) NOT NULL,
  city VARCHAR(200) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip_code VARCHAR(20),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  list_date DATE,
  days_on_market INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN list_date IS NOT NULL 
      THEN EXTRACT(DAY FROM NOW() - list_date)::INTEGER 
      ELSE 0 
    END
  ) STORED,
  
  -- Complete parsed data in JSONB
  data JSONB NOT NULL,
  
  -- Raw data for debugging/reprocessing
  raw_data JSONB,
  
  -- Data quality
  parse_quality_score INTEGER DEFAULT 0,
  parse_issues JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  parser_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  
  -- Unique constraint on source + source_id
  UNIQUE(source, source_id)
);

-- Indexes for common queries
CREATE INDEX idx_listings_price ON parsed_listings(price);
CREATE INDEX idx_listings_bedrooms ON parsed_listings(bedrooms);
CREATE INDEX idx_listings_bathrooms ON parsed_listings(bathrooms);
CREATE INDEX idx_listings_city_state ON parsed_listings(city, state);
CREATE INDEX idx_listings_property_type ON parsed_listings(property_type);
CREATE INDEX idx_listings_list_date ON parsed_listings(list_date DESC);
CREATE INDEX idx_listings_status ON parsed_listings(status);

-- GIN index for JSONB queries
CREATE INDEX idx_listings_data ON parsed_listings USING GIN (data);
CREATE INDEX idx_listings_features ON parsed_listings USING GIN ((data->'features'));

-- Geographic index if we add PostGIS
-- CREATE INDEX idx_listings_location ON parsed_listings USING GIST (
--   ST_MakePoint(longitude, latitude)
-- );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_parsed_listings_updated_at 
  BEFORE UPDATE ON parsed_listings 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Table for tracking parse history
CREATE TABLE IF NOT EXISTS listing_parse_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES parsed_listings(id) ON DELETE CASCADE,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  parser_version VARCHAR(20) NOT NULL,
  source_data_hash VARCHAR(64), -- SHA256 of raw data
  changes JSONB, -- What changed from previous parse
  quality_score INTEGER,
  issues JSONB
);

-- View for easy querying with computed fields
CREATE OR REPLACE VIEW listings_view AS
SELECT 
  id,
  mls_number,
  source,
  price,
  bedrooms,
  bathrooms,
  property_type,
  square_feet,
  year_built,
  street_address,
  city,
  state,
  zip_code,
  status,
  list_date,
  days_on_market,
  
  -- Extract common fields from JSONB
  data->>'description' as description,
  data->'images' as images,
  jsonb_array_length(COALESCE(data->'images', '[]'::jsonb)) as image_count,
  data->'features' as features,
  data->'agent' as agent_info,
  
  -- Computed price per sqft
  CASE 
    WHEN square_feet > 0 
    THEN ROUND(price / square_feet, 2) 
    ELSE NULL 
  END as price_per_sqft,
  
  parse_quality_score,
  created_at,
  updated_at
FROM parsed_listings;

-- Function to search listings with filters
CREATE OR REPLACE FUNCTION search_listings(
  p_min_price DECIMAL DEFAULT NULL,
  p_max_price DECIMAL DEFAULT NULL,
  p_bedrooms INTEGER DEFAULT NULL,
  p_bathrooms DECIMAL DEFAULT NULL,
  p_city VARCHAR DEFAULT NULL,
  p_state VARCHAR DEFAULT NULL,
  p_property_types VARCHAR[] DEFAULT NULL,
  p_features VARCHAR[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  listing JSONB,
  score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_jsonb(l.*) - 'raw_data' as listing,
    CASE 
      WHEN p_features IS NOT NULL THEN
        (SELECT COUNT(*)::FLOAT / array_length(p_features, 1)
         FROM jsonb_array_elements_text(l.data->'features'->'all') AS feature
         WHERE feature = ANY(p_features))
      ELSE 1.0
    END as score
  FROM parsed_listings l
  WHERE 
    (p_min_price IS NULL OR l.price >= p_min_price) AND
    (p_max_price IS NULL OR l.price <= p_max_price) AND
    (p_bedrooms IS NULL OR l.bedrooms >= p_bedrooms) AND
    (p_bathrooms IS NULL OR l.bathrooms >= p_bathrooms) AND
    (p_city IS NULL OR l.city ILIKE p_city) AND
    (p_state IS NULL OR l.state = p_state) AND
    (p_property_types IS NULL OR l.property_type = ANY(p_property_types)) AND
    l.status = 'active'
  ORDER BY score DESC, l.list_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;