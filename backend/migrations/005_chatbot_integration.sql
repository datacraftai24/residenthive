-- Migration 005: Chatbot Integration
-- Bridges ResidentHive database with chatbot's expected schema
-- Creates views and tables that the chatbot expects for seamless integration

-- ============================================================================
-- PART 1: Update repliers_listings for multi-tenant support
-- ============================================================================

-- Add agent_id column for multi-tenant filtering
ALTER TABLE repliers_listings
    ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS profile_id INTEGER REFERENCES buyer_profiles(id);

-- Create index for efficient multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_repliers_listings_agent
    ON repliers_listings(agent_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_repliers_listings_profile
    ON repliers_listings(profile_id, created_at DESC);

-- ============================================================================
-- PART 2: Create 'properties' view for chatbot compatibility
-- ============================================================================

-- Chatbot expects a table called 'properties', we create a view pointing to repliers_listings
CREATE OR REPLACE VIEW properties AS
SELECT
    id,
    address,
    city,
    state,
    zip_code,
    price,
    bedrooms,
    bathrooms,
    square_feet,
    property_type,
    mls_number,
    lot_size,
    year_built,
    garage_spaces,
    description,
    features,
    images,
    listing_date,
    status,
    agent_id,
    profile_id,
    created_at::timestamp with time zone as created_at,
    updated_at
FROM repliers_listings;

COMMENT ON VIEW properties IS
'Chatbot-compatible view of repliers_listings. Maps ResidentHive schema to chatbot expected schema.';

-- ============================================================================
-- PART 3: Create 'property_summaries' view from AI analysis cache
-- ============================================================================

-- Chatbot expects property_summaries with short_summary and detailed_summary
-- We extract these from our property_analysis_cache JSONB
CREATE OR REPLACE VIEW property_summaries AS
SELECT
    pac.id,
    pac.listing_id as property_id,
    pac.analysis_json->>'headline' as short_summary,
    CONCAT(
        pac.analysis_json->>'agent_insight',
        E'\n\nWhy it works:\n',
        pac.analysis_json->'why_it_works'->>'budget',
        E'\n',
        pac.analysis_json->'why_it_works'->>'location',
        E'\n',
        COALESCE(
            pac.analysis_json->'why_it_works'->>'lifestyle_fit',
            pac.analysis_json->'why_it_works'->>'family_fit',
            pac.analysis_json->'why_it_works'->>'investment_fit',
            ''
        )
    ) as detailed_summary,
    bp.agent_id,
    bp.id as client_id,
    pac.created_at
FROM property_analysis_cache pac
JOIN buyer_profiles bp ON pac.profile_id = bp.id;

COMMENT ON VIEW property_summaries IS
'AI-generated property summaries extracted from property_analysis_cache. Provides chatbot with agent insights.';

-- ============================================================================
-- PART 4: Create property_images table
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_images (
    id SERIAL PRIMARY KEY,
    property_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_order INTEGER DEFAULT 0,
    ai_description TEXT,
    visual_tags JSONB DEFAULT '[]',
    agent_id INTEGER REFERENCES agents(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_property_images_listing FOREIGN KEY (property_id)
        REFERENCES repliers_listings(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_property_images_property
    ON property_images(property_id, image_order);

CREATE INDEX IF NOT EXISTS idx_property_images_agent
    ON property_images(agent_id, created_at DESC);

-- Unique constraint to prevent duplicate image URLs for same property
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_images_unique
    ON property_images(property_id, image_url);

COMMENT ON TABLE property_images IS
'Property images with AI-generated descriptions for visual search. Enables chatbot to search by visual features.';

COMMENT ON COLUMN property_images.visual_tags IS
'JSONB array of visual features extracted from image (e.g., ["modern kitchen", "granite countertops", "hardwood floors"])';

-- ============================================================================
-- PART 5: Create property_insights table for investment analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_insights (
    id SERIAL PRIMARY KEY,
    property_id TEXT NOT NULL,
    estimated_rental INTEGER,
    price_per_sqft NUMERIC(10,2),
    investment_summary TEXT,
    risk_factors JSONB DEFAULT '[]',
    market_trends JSONB DEFAULT '{}',
    cap_rate NUMERIC(5,2),
    roi_estimate NUMERIC(5,2),
    agent_id INTEGER REFERENCES agents(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_property_insights_listing FOREIGN KEY (property_id)
        REFERENCES repliers_listings(id) ON DELETE CASCADE,
    CONSTRAINT unique_property_insights UNIQUE (property_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_insights_property
    ON property_insights(property_id);

CREATE INDEX IF NOT EXISTS idx_property_insights_agent
    ON property_insights(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_insights_rental
    ON property_insights(estimated_rental DESC) WHERE estimated_rental IS NOT NULL;

COMMENT ON TABLE property_insights IS
'Market and investment insights for properties. Supports chatbot investment analysis queries.';

COMMENT ON COLUMN property_insights.cap_rate IS
'Capitalization rate (annual rental income / property price * 100)';

COMMENT ON COLUMN property_insights.roi_estimate IS
'Estimated return on investment percentage';

-- ============================================================================
-- PART 6: Create llm_contexts view for conversation history
-- ============================================================================

-- Chatbot expects llm_contexts with user_query and llm_response
-- We create a view that combines chat_sessions and chat_messages
CREATE OR REPLACE VIEW llm_contexts AS
SELECT
    cm.id,
    cs.id as session_id,
    cm.message as user_query,
    cm.ai_response as llm_response,
    cs.agent_id,
    cs.profile_id as client_id,
    cm.created_at::timestamp with time zone as created_at,
    cs.started_at as session_started
FROM chat_messages cm
JOIN chat_sessions cs ON cm.session_id = cs.id
ORDER BY cs.started_at DESC, cm.created_at ASC;

COMMENT ON VIEW llm_contexts IS
'Conversation history view for chatbot. Combines chat_sessions and chat_messages for LLM context tracking.';

-- ============================================================================
-- PART 7: Create helper function to calculate property insights
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_property_insights(p_property_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_price INTEGER;
    v_sqft INTEGER;
    v_bedrooms INTEGER;
    v_city TEXT;
    v_estimated_rental INTEGER;
    v_price_per_sqft NUMERIC(10,2);
BEGIN
    -- Get property data
    SELECT price, square_feet, bedrooms, city
    INTO v_price, v_sqft, v_bedrooms, v_city
    FROM repliers_listings
    WHERE id = p_property_id;

    -- Calculate price per sqft
    IF v_sqft > 0 THEN
        v_price_per_sqft := v_price::NUMERIC / v_sqft;
    END IF;

    -- Estimate rental (rough formula: 0.8-1.2% of property value per month)
    v_estimated_rental := (v_price * 0.01)::INTEGER;

    -- Insert or update insights
    INSERT INTO property_insights (
        property_id,
        price_per_sqft,
        estimated_rental,
        created_at,
        updated_at
    ) VALUES (
        p_property_id,
        v_price_per_sqft,
        v_estimated_rental,
        NOW(),
        NOW()
    )
    ON CONFLICT (property_id)
    DO UPDATE SET
        price_per_sqft = EXCLUDED.price_per_sqft,
        estimated_rental = EXCLUDED.estimated_rental,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_property_insights IS
'Calculates basic property insights (price per sqft, estimated rental) for a given property.';

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 005 completed successfully!';
    RAISE NOTICE 'Chatbot integration schema is ready.';
    RAISE NOTICE 'Next step: Update search endpoint to persist listings.';
END $$;
