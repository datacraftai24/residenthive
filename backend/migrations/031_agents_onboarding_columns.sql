-- Migration 031: Add onboarding columns to agents table
-- Adds brokerage FK, phone (WhatsApp/iMessage auth key), license, designation,
-- coverage areas, MLS member ID, verification status, compliance ack, and role.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS brokerage_id INTEGER REFERENCES brokerages(id) ON DELETE SET NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS designation TEXT
    CHECK (designation IN ('salesperson', 'broker', 'associate_broker'));
ALTER TABLE agents ADD COLUMN IF NOT EXISTS coverage_areas TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mls_member_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('verified', 'pending_review', 'unverified'));
ALTER TABLE agents ADD COLUMN IF NOT EXISTS compliance_acknowledged_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent'
    CHECK (role IN ('agent', 'brokerage_admin', 'admin'));

CREATE INDEX IF NOT EXISTS idx_agents_brokerage ON agents(brokerage_id);
CREATE INDEX IF NOT EXISTS idx_agents_phone ON agents(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);
