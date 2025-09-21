-- Add LLM Decision Logging Tables
CREATE TABLE IF NOT EXISTS "llm_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"decision_type" text NOT NULL,
	"user_requirements" json,
	"market_context" json,
	"system_prompt" text,
	"user_prompt" text NOT NULL,
	"raw_response" text NOT NULL,
	"parsed_response" json,
	"reasoning" json,
	"confidence" numeric(3, 2),
	"model" text DEFAULT 'gpt-4o' NOT NULL,
	"temperature" numeric(2, 1) DEFAULT '0.7',
	"tokens_used" integer,
	"response_time_ms" integer,
	"parent_decision_id" integer,
	"decision_path" json,
	"outcome_success" boolean,
	"outcome_notes" text,
	"human_override" boolean DEFAULT false,
	"timestamp" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "investment_strategy_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"property_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"property_address" text NOT NULL,
	"property_price" integer NOT NULL,
	"property_data" json NOT NULL,
	"strategy_name" text NOT NULL,
	"strategy_type" text,
	"down_payment_percent" numeric(5, 2),
	"down_payment_amount" integer,
	"monthly_income" integer,
	"monthly_expenses" integer,
	"monthly_cash_flow" integer,
	"cap_rate" numeric(5, 2),
	"cash_on_cash_return" numeric(5, 2),
	"overall_score" numeric(5, 2) NOT NULL,
	"scoring_factors" json,
	"ai_reasoning" text,
	"is_feasible" boolean DEFAULT true NOT NULL,
	"feasibility_issues" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "llm_decisions" ADD CONSTRAINT "llm_decisions_parent_decision_id_fk" 
FOREIGN KEY ("parent_decision_id") REFERENCES "llm_decisions"("id") ON DELETE no action ON UPDATE no action;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_llm_decisions_session" ON "llm_decisions"("session_id");
CREATE INDEX IF NOT EXISTS "idx_llm_decisions_agent" ON "llm_decisions"("agent_name", "decision_type");
CREATE INDEX IF NOT EXISTS "idx_strategy_scores_session" ON "investment_strategy_scores"("session_id");
CREATE INDEX IF NOT EXISTS "idx_strategy_scores_property" ON "investment_strategy_scores"("property_id", "strategy_id");