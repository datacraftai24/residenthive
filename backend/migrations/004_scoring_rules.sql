-- Migration 004: Agent Scoring Rules
-- Allows agents to customize property scoring rules without code changes
-- Supports per-agent tuning of matching criteria

CREATE TABLE IF NOT EXISTS agent_scoring_rules (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    rule_name TEXT NOT NULL,
    config_json JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- Index for fast lookups by agent
CREATE INDEX IF NOT EXISTS idx_agent_scoring_rules_agent
ON agent_scoring_rules(agent_id, is_active, created_at DESC);

-- Index for rule management
CREATE INDEX IF NOT EXISTS idx_agent_scoring_rules_name
ON agent_scoring_rules(rule_name);

-- Comments
COMMENT ON TABLE agent_scoring_rules IS
'Custom scoring rules per agent. Allows agents to tune property matching without code changes.';

COMMENT ON COLUMN agent_scoring_rules.rule_name IS
'Identifier for this rule set (e.g., "default", "luxury_market", "first_time_buyers")';

COMMENT ON COLUMN agent_scoring_rules.config_json IS
'JSON object containing scoring weights and criteria. Merged with DEFAULT_SCORING_RULES from code.';

COMMENT ON COLUMN agent_scoring_rules.is_active IS
'Only active rules are used. Allows keeping history of old configurations.';

COMMENT ON COLUMN agent_scoring_rules.notes IS
'Agent notes about why these rules were customized (e.g., "Adjusted for Boston luxury market")';

-- Example custom rule (commented out, for reference):
/*
INSERT INTO agent_scoring_rules (agent_id, rule_name, config_json, notes) VALUES (
    3,
    'luxury_market_focus',
    '{
        "budget_match": {
            "weight": 40,
            "enabled": true
        },
        "must_have_features": {
            "weight": 30,
            "keywords": {
                "high_end_finishes": ["marble", "imported", "custom", "luxury"],
                "smart_home": ["smart home", "automated", "control4", "nest"]
            }
        }
    }'::jsonb,
    'Increased budget weight for luxury buyers who are less price-sensitive'
);
*/
