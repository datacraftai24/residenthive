-- Migration 023: WhatsApp Integration
-- Adds WhatsApp phone connection for agents, buyer codes for identification,
-- and message logging for debugging/compliance.

-- ============================================================================
-- PART 1: Agent WhatsApp Connection
-- ============================================================================

-- Add WhatsApp phone number to agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS whatsapp_connected_at TIMESTAMP WITH TIME ZONE;

-- Index for fast lookup by phone
CREATE INDEX IF NOT EXISTS idx_agents_whatsapp_phone 
ON agents(whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;

COMMENT ON COLUMN agents.whatsapp_phone IS 'WhatsApp phone number in E.164 format (e.g., +16175551234)';
COMMENT ON COLUMN agents.whatsapp_connected_at IS 'When the agent connected their WhatsApp';

-- ============================================================================
-- PART 2: Buyer Codes for WhatsApp Identification
-- ============================================================================

-- Add WhatsApp code to buyer_profiles (e.g., SC1, MJ1)
ALTER TABLE buyer_profiles
ADD COLUMN IF NOT EXISTS whatsapp_code TEXT;

-- Ensure codes are unique per agent
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_code_per_agent 
ON buyer_profiles(agent_id, whatsapp_code) WHERE whatsapp_code IS NOT NULL;

COMMENT ON COLUMN buyer_profiles.whatsapp_code IS 'Short code for WhatsApp identification (e.g., SC1 for Sarah Chen)';

-- ============================================================================
-- PART 3: WhatsApp Message Log
-- ============================================================================

-- Create message log table for debugging and compliance
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    wa_message_id TEXT UNIQUE,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'interactive', 'voice', 'image', 'button_reply', 'list_reply')),
    sender_phone TEXT,
    content JSONB,
    intent_detected TEXT,
    buyer_id INTEGER REFERENCES buyer_profiles(id) ON DELETE SET NULL,
    session_state TEXT,
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_wa_messages_agent 
ON whatsapp_messages(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_messages_phone 
ON whatsapp_messages(sender_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_messages_wa_id 
ON whatsapp_messages(wa_message_id);

COMMENT ON TABLE whatsapp_messages IS 'Log of all WhatsApp messages for debugging and compliance';
COMMENT ON COLUMN whatsapp_messages.wa_message_id IS 'WhatsApp message ID for deduplication';
COMMENT ON COLUMN whatsapp_messages.intent_detected IS 'Detected intent from message (VIEW_BUYERS, SEARCH, etc.)';

-- ============================================================================
-- PART 4: WhatsApp Session State (optional DB backup for Redis)
-- ============================================================================

-- Session state backup table (Redis is primary, this is for recovery)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
    phone TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'idle' CHECK (state IN ('idle', 'buyer_list', 'buyer_context', 'creating_buyer', 'editing_buyer', 'confirming')),
    active_buyer_id INTEGER REFERENCES buyer_profiles(id) ON DELETE SET NULL,
    active_buyer_code TEXT,
    sub_state TEXT,
    last_search_id TEXT,
    pending_action JSONB,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_sessions_phone 
ON whatsapp_sessions(phone);

COMMENT ON TABLE whatsapp_sessions IS 'Backup of WhatsApp session state (Redis is primary)';

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 023 completed successfully!';
    RAISE NOTICE 'WhatsApp integration schema is ready.';
END $$;
