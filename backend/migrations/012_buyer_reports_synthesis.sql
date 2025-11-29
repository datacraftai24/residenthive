-- Add synthesis_data column to buyer_reports table
-- Stores LLM-generated report synthesis (intro, ranked_picks, next_steps)

ALTER TABLE buyer_reports
ADD COLUMN synthesis_data JSONB DEFAULT NULL;

-- Add index for better JSON query performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_buyer_reports_synthesis_data
ON buyer_reports USING GIN (synthesis_data);

COMMENT ON COLUMN buyer_reports.synthesis_data IS 'LLM-generated report synthesis with intro, ranked_picks, and next_steps';
