-- Migration 030: Brokerage entity, invite codes, agent invitations, manual reviews
-- Foundation for pilot activation & agent onboarding system

-- ============================================================================
-- PART 1: Brokerages (first-class entity, pre-created by admin for pilots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS brokerages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    broker_of_record_name TEXT NOT NULL,
    phone TEXT,
    license_number TEXT,
    jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('MA', 'ON')),
    mls_pin_brokerage_id TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('verified', 'unverified', 'invite_code')),
    payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'active', 'suspended')),
    clerk_user_id TEXT UNIQUE,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brokerages_clerk_user ON brokerages(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_brokerages_verification ON brokerages(verification_status);

-- ============================================================================
-- PART 2: Invite codes (admin-generated fallback for Ontario, pilots, edge cases)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invite_codes (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    brokerage_name TEXT,
    jurisdiction TEXT CHECK (jurisdiction IN ('MA', 'ON')),
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_by_brokerage_id INTEGER REFERENCES brokerages(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

-- ============================================================================
-- PART 3: Agent invitations (brokerage admin invites agents via email)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_invitations (
    id SERIAL PRIMARY KEY,
    brokerage_id INTEGER NOT NULL REFERENCES brokerages(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_invitations_token ON agent_invitations(token);
CREATE INDEX IF NOT EXISTS idx_agent_invitations_brokerage ON agent_invitations(brokerage_id);

-- ============================================================================
-- PART 4: Manual review requests (internal queue, customer never sees)
-- ============================================================================

CREATE TABLE IF NOT EXISTS manual_review_requests (
    id SERIAL PRIMARY KEY,
    brokerage_id INTEGER NOT NULL REFERENCES brokerages(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_reviews_status ON manual_review_requests(status);
