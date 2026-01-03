-- Migration: 015_profiles_lead_link.sql
-- Add lead tracking columns to buyer_profiles
-- This is the ONLY lead-related change to buyer_profiles

-- Add parent_lead_id to link profile back to source lead
ALTER TABLE buyer_profiles
ADD COLUMN IF NOT EXISTS parent_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;

-- Add created_by_method for easy filtering/analytics
-- 'lead' if created from a lead, 'agent' if created directly
ALTER TABLE buyer_profiles
ADD COLUMN IF NOT EXISTS created_by_method TEXT DEFAULT 'agent';

-- Add check constraint for valid values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'buyer_profiles_created_by_method_check'
    ) THEN
        ALTER TABLE buyer_profiles
        ADD CONSTRAINT buyer_profiles_created_by_method_check
        CHECK (created_by_method IN ('lead', 'agent'));
    END IF;
END $$;

-- Index for joining back to leads
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_parent_lead_id ON buyer_profiles(parent_lead_id);

-- Index for filtering by creation method
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_created_by_method ON buyer_profiles(created_by_method);
