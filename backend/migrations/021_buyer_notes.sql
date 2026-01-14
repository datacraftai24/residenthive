-- Add buyer notes columns to buyer_reports table
-- Allows buyers to leave notes that sync to agent dashboard

ALTER TABLE buyer_reports ADD COLUMN IF NOT EXISTS buyer_notes TEXT;
ALTER TABLE buyer_reports ADD COLUMN IF NOT EXISTS buyer_notes_updated_at TIMESTAMPTZ;

-- Add index for efficient querying of reports with notes
CREATE INDEX IF NOT EXISTS idx_buyer_reports_notes_updated
ON buyer_reports (buyer_notes_updated_at)
WHERE buyer_notes IS NOT NULL AND buyer_notes != '';

COMMENT ON COLUMN buyer_reports.buyer_notes IS 'Notes written by the buyer on their report, visible to the agent';
COMMENT ON COLUMN buyer_reports.buyer_notes_updated_at IS 'Timestamp when buyer notes were last updated';
