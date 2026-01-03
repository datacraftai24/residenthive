-- Migration: 017_lead_report_tracking.sql
-- Add report tracking fields to leads table for lead lifecycle management

-- Track when buyer report was sent to this lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS report_sent_at TIMESTAMP;

-- Link to the buyer report that was sent
ALTER TABLE leads ADD COLUMN IF NOT EXISTS report_share_id TEXT;

-- Indexes for report tracking queries
CREATE INDEX IF NOT EXISTS idx_leads_report_sent_at ON leads(report_sent_at);
CREATE INDEX IF NOT EXISTS idx_leads_report_share_id ON leads(report_share_id);

-- Add comments for documentation
COMMENT ON COLUMN leads.report_sent_at IS 'Timestamp when buyer report was emailed to this lead';
COMMENT ON COLUMN leads.report_share_id IS 'Share ID of the buyer report sent to this lead';
