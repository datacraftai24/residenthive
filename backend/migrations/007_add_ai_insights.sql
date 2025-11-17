-- Migration 007: Add AI Insights fields to buyer_profiles
-- Adds fields for AI-generated insights and nice-to-haves grouping

-- Add AI insights fields
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS decision_drivers JSON DEFAULT '[]'::json,
  ADD COLUMN IF NOT EXISTS constraints JSON DEFAULT '[]'::json,
  ADD COLUMN IF NOT EXISTS nice_to_haves JSON DEFAULT '[]'::json,
  ADD COLUMN IF NOT EXISTS flexibility_explanations JSON DEFAULT '{}'::json;

-- Note: special_needs column is kept for backwards compatibility but will not be shown in UI
