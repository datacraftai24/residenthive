-- Migration 032: Add email to brokerages for auto-linking
-- When broker of record signs up via Clerk, system matches their email
-- to this field and auto-links them as brokerage_admin.

ALTER TABLE brokerages ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_brokerages_email ON brokerages(email) WHERE email IS NOT NULL;
