-- Migration 016: Create chatbot session persistence tables
-- For persistent chatbot sessions linked to buyer_reports via share_id

-- Chatbot sessions (linked to share_id from buyer_reports)
CREATE TABLE IF NOT EXISTS chatbot_sessions (
    session_id TEXT PRIMARY KEY,

    -- Link to ResidentHive
    share_id TEXT NOT NULL,  -- Links to buyer_reports.share_id
    profile_id INTEGER,       -- Links to buyer_profiles.id
    agent_id INTEGER,
    lead_id INTEGER,          -- If from lead (not buyer profile)

    -- Identity state (NO PII here - PII stays on lead/profile record)
    buyer_identity_state TEXT DEFAULT 'anonymous',  -- anonymous | partial | verified
    contact_captured BOOLEAN DEFAULT FALSE,
    contact_id INTEGER,  -- FK to leads.id or buyer_profiles.id

    -- Session state
    preferences JSONB DEFAULT '{}',
    properties_discussed TEXT[] DEFAULT '{}',
    cta_shown BOOLEAN DEFAULT FALSE,
    cta_clicked BOOLEAN DEFAULT FALSE,
    message_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Chatbot messages (for conversation history)
CREATE TABLE IF NOT EXISTS chatbot_messages (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chatbot_sessions(session_id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- user | assistant
    content TEXT NOT NULL,

    -- Optional metadata
    intent TEXT,  -- classified intent
    intent_confidence FLOAT,
    claims JSONB,  -- truth metadata (source + confidence per claim)

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_share ON chatbot_sessions(share_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_lead ON chatbot_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_profile ON chatbot_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_activity ON chatbot_sessions(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON chatbot_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created ON chatbot_messages(created_at DESC);

-- Comments
COMMENT ON TABLE chatbot_sessions IS 'Persisted chatbot sessions linked to buyer_reports via share_id';
COMMENT ON COLUMN chatbot_sessions.buyer_identity_state IS 'anonymous = no contact, partial = email or phone, verified = both + name';
COMMENT ON COLUMN chatbot_sessions.contact_id IS 'FK to leads.id or buyer_profiles.id where PII is stored';
