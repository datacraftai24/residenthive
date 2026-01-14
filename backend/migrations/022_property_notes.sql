-- Per-property notes for buyer reports
-- Allows buyers to add notes to individual properties (hybrid approach)
-- Complements report-level notes (021_buyer_notes.sql)

CREATE TABLE IF NOT EXISTS buyer_report_property_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_share_id TEXT NOT NULL REFERENCES buyer_reports(share_id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL,
    note_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(report_share_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_property_notes_report ON buyer_report_property_notes(report_share_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_property_notes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS property_notes_timestamp ON buyer_report_property_notes;
CREATE TRIGGER property_notes_timestamp
    BEFORE UPDATE ON buyer_report_property_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_property_notes_timestamp();
