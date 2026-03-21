-- Migration 025: Conversational WhatsApp - Agentic Architecture
-- Adds lead codes, search context persistence, and lead_context session state

-- Part A: Lead codes (unified namespace with buyers)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_code_per_agent
  ON leads(agent_id, whatsapp_code) WHERE whatsapp_code IS NOT NULL;

-- Part B: Search context persistence (replaces in-memory cache)
CREATE TABLE IF NOT EXISTS search_contexts (
    search_id         TEXT PRIMARY KEY,
    profile           JSONB NOT NULL,
    ranked_listings   JSONB NOT NULL,
    analysis_status   JSONB DEFAULT '{}',
    photo_analysis    JSONB,
    location_analysis JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours'
);
CREATE INDEX IF NOT EXISTS idx_search_contexts_expires ON search_contexts(expires_at);

-- Part C: Add lead_context session state
ALTER TABLE whatsapp_sessions DROP CONSTRAINT IF EXISTS whatsapp_sessions_state_check;
ALTER TABLE whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_state_check
  CHECK (state IN ('idle','buyer_list','buyer_context','creating_buyer',
                   'editing_buyer','confirming','searching','lead_context'));
