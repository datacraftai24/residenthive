-- Add investment-related fields to buyer_profiles table
ALTER TABLE buyer_profiles 
ADD COLUMN IF NOT EXISTS buyer_type TEXT NOT NULL DEFAULT 'traditional',
ADD COLUMN IF NOT EXISTS investor_type TEXT,
ADD COLUMN IF NOT EXISTS investment_capital INTEGER,
ADD COLUMN IF NOT EXISTS target_monthly_return INTEGER,
ADD COLUMN IF NOT EXISTS target_cap_rate NUMERIC(4,2),
ADD COLUMN IF NOT EXISTS investment_strategy TEXT;

-- Create investment_strategies table
CREATE TABLE IF NOT EXISTS investment_strategies (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE,
  
  -- Strategy Data
  strategy_json JSON NOT NULL,
  market_analysis JSON NOT NULL,
  property_recommendations JSON NOT NULL,
  financial_projections JSON NOT NULL,
  
  -- Generation Metadata
  generation_time INTEGER NOT NULL,
  data_sources_used JSON NOT NULL,
  
  -- Strategy Status
  status TEXT NOT NULL DEFAULT 'generating',
  document_url TEXT,
  
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- Add index for faster lookups
CREATE INDEX idx_investment_strategies_session_id ON investment_strategies(session_id);
CREATE INDEX idx_investment_strategies_profile_id ON investment_strategies(profile_id);
CREATE INDEX idx_buyer_profiles_buyer_type ON buyer_profiles(buyer_type);
CREATE INDEX idx_buyer_profiles_investor_type ON buyer_profiles(investor_type);