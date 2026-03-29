-- Migration 033: Add compliance tracking fields to brokerages
-- office_address and compliance_setup_at for pre-pilot verification

ALTER TABLE brokerages ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE brokerages ADD COLUMN IF NOT EXISTS compliance_setup_at TIMESTAMPTZ;
