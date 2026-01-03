-- Migration: 014_leads_table.sql
-- Create leads table for lead intake mode
-- Leads have a separate lifecycle from buyer_profiles

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,

    -- Status (state machine)
    status TEXT DEFAULT 'new',  -- new -> classified -> engaged -> converted -> archived

    -- Classification (deterministic, set before LLM)
    role TEXT NOT NULL,                    -- buyer_lead, investor, agent, unknown
    role_reason TEXT NOT NULL,             -- Why this role was assigned
    lead_type TEXT NOT NULL,               -- property_specific, area_search, general
    lead_type_reason TEXT NOT NULL,        -- Why this lead type was assigned

    -- Source
    source TEXT DEFAULT 'unknown',         -- zillow, redfin, google, referral, unknown
    property_url TEXT,                     -- Property URL if provided
    property_address TEXT,                 -- Property address if provided

    -- Intent (deterministic scoring)
    intent_score INTEGER NOT NULL,         -- 0-100
    intent_reasons JSONB DEFAULT '[]',     -- Array of scoring reasons

    -- Extracted Data (from LLM)
    extracted_name TEXT,
    extracted_email TEXT,
    extracted_phone TEXT,
    extracted_location TEXT,
    extracted_budget TEXT,                 -- Display format: "$500K-$600K"
    extracted_budget_min INTEGER,
    extracted_budget_max INTEGER,
    extracted_bedrooms INTEGER,
    extracted_bathrooms TEXT,
    extracted_home_type TEXT,
    extracted_timeline TEXT,
    hints JSONB DEFAULT '[]',              -- Soft signals: ["good schools", "quiet area"]

    -- Response
    suggested_message TEXT,                -- AI-generated response
    clarifying_question TEXT,              -- 0 or 1 question only
    what_to_clarify JSONB DEFAULT '[]',    -- Prioritized missing fields

    -- MLS Search
    mls_search_status TEXT,                -- null, performed, failed, no_results, skipped_no_constraints
    mls_matches JSONB,                     -- Top 3 property matches if search performed

    -- Confidence
    extraction_confidence INTEGER,         -- 0-100, heuristic based on fields extracted

    -- Raw Input (audit trail)
    raw_input TEXT NOT NULL,               -- Original paste (for audit/debug)
    raw_input_normalized TEXT NOT NULL,    -- Normalized (for dedupe/indexing)

    -- Conversion
    converted_profile_id INTEGER,          -- References buyer_profiles(id) - FK added later to avoid circular deps

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    engaged_at TIMESTAMP,                  -- When agent copied/sent message
    converted_at TIMESTAMP                 -- When converted to buyer profile
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_role ON leads(role);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_raw_input_normalized ON leads(raw_input_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_extracted_email ON leads(extracted_email);
CREATE INDEX IF NOT EXISTS idx_leads_extracted_phone ON leads(extracted_phone);

-- Add FK constraint for converted_profile_id after table exists
-- (This allows referencing buyer_profiles which may be created in a different order)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'leads_converted_profile_id_fkey'
    ) THEN
        ALTER TABLE leads
        ADD CONSTRAINT leads_converted_profile_id_fkey
        FOREIGN KEY (converted_profile_id) REFERENCES buyer_profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
