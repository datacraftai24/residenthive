-- Replace existing whatsapp_sessions with JSONB-based session store
-- The old table used separate columns; the new approach stores all session
-- data as JSONB for flexibility (message_history, pending_action, etc.)

DROP TABLE IF EXISTS whatsapp_sessions;

CREATE TABLE whatsapp_sessions (
    phone       TEXT PRIMARY KEY,
    agent_id    INTEGER NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_sessions_agent ON whatsapp_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_updated ON whatsapp_sessions(updated_at);
