-- Migration 008: Add Vision Checklist field to buyer_profiles
-- Adds field for AI-generated photo requirements

ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS vision_checklist JSON DEFAULT '{}'::json;
