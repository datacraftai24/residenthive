-- Migration 025: Platform Events & Report Engagement Tracking
-- Adds event tracking tables for analytics dashboard

-- ============================================================
-- platform_events: Agent action tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_events (
    id          BIGSERIAL PRIMARY KEY,
    agent_id    INTEGER NOT NULL REFERENCES agents(id),
    event_type  TEXT NOT NULL,           -- e.g. profile.create, lead.convert, search.run
    event_category TEXT NOT NULL,        -- profile, lead, search, report, auth, chat, email
    entity_type TEXT,                    -- buyer_profile, lead, search_transaction, etc.
    entity_id   TEXT,                    -- ID of the related entity
    metadata    JSONB DEFAULT '{}',      -- Flexible event-specific data
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_agent_id ON platform_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_event_type ON platform_events(event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_event_category ON platform_events(event_category);
CREATE INDEX IF NOT EXISTS idx_platform_events_created_at ON platform_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_agent_created ON platform_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_category_created ON platform_events(event_category, created_at DESC);

-- ============================================================
-- report_engagement_events: Client engagement (public, no auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS report_engagement_events (
    id                  BIGSERIAL PRIMARY KEY,
    share_id            TEXT NOT NULL,           -- References buyer_reports.share_id
    event_type          TEXT NOT NULL,           -- page_view, property_click, chat_open, chat_message
    property_listing_id TEXT,                    -- For property_click events
    session_id          TEXT,                    -- Anonymous session tracking
    metadata            JSONB DEFAULT '{}',      -- duration_ms, referrer, etc.
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_engagement_share_id ON report_engagement_events(share_id);
CREATE INDEX IF NOT EXISTS idx_report_engagement_created_at ON report_engagement_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_engagement_share_created ON report_engagement_events(share_id, created_at DESC);
