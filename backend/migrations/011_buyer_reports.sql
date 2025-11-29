-- Migration 011: Create buyer_reports table for auto-generated shareable reports
-- Every search auto-creates a buyer report that agent can customize and share

CREATE TABLE buyer_reports (
  share_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL,
  search_id TEXT NOT NULL,
  agent_name TEXT,
  agent_email TEXT,
  agent_phone TEXT,
  included_listing_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE buyer_reports IS
  'Auto-generated shareable buyer reports. Created automatically on each search, agent customizes which listings to include.';

COMMENT ON COLUMN buyer_reports.share_id IS
  'Public shareable ID (UUID). Used in buyer-facing URL: /buyer-report/:shareId';

COMMENT ON COLUMN buyer_reports.included_listing_ids IS
  'Array of MLS numbers to include in buyer report. Defaults to top 5 by fitScore.';

COMMENT ON COLUMN buyer_reports.search_id IS
  'Links to search_transactions.transaction_id to retrieve full listing data';

-- Indexes for common queries
CREATE INDEX idx_buyer_reports_profile ON buyer_reports(profile_id);
CREATE INDEX idx_buyer_reports_search ON buyer_reports(search_id);
CREATE INDEX idx_buyer_reports_agent ON buyer_reports(agent_id);
CREATE INDEX idx_buyer_reports_created ON buyer_reports(created_at DESC);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_buyer_reports_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER buyer_reports_update_timestamp
  BEFORE UPDATE ON buyer_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_buyer_reports_timestamp();
