CREATE TABLE "agent_action_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"action_id" text NOT NULL,
	"action_taken" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_insight_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"tag_name" text,
	"persona_field" text,
	"feedback_type" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"profile_id" integer NOT NULL,
	"interaction_type" text NOT NULL,
	"listing_id" text,
	"interaction_data" json NOT NULL,
	"session_duration" integer,
	"agent_confidence" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"note" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"brokerage_name" text NOT NULL,
	"invite_token" text,
	"is_activated" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "agents_email_unique" UNIQUE("email"),
	CONSTRAINT "agents_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "buyer_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"location" text NOT NULL,
	"agent_id" integer,
	"buyer_type" text DEFAULT 'traditional' NOT NULL,
	"budget" text NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"home_type" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" text NOT NULL,
	"investor_type" text,
	"investment_capital" integer,
	"target_monthly_return" integer,
	"target_cap_rate" numeric(5, 2),
	"investment_strategy" text,
	"must_have_features" json DEFAULT '[]'::json NOT NULL,
	"dealbreakers" json DEFAULT '[]'::json NOT NULL,
	"preferred_areas" json DEFAULT '[]'::json NOT NULL,
	"lifestyle_drivers" json DEFAULT '[]'::json NOT NULL,
	"special_needs" json DEFAULT '[]'::json NOT NULL,
	"budget_flexibility" integer DEFAULT 50 NOT NULL,
	"location_flexibility" integer DEFAULT 50 NOT NULL,
	"timing_flexibility" integer DEFAULT 50 NOT NULL,
	"emotional_context" text,
	"voice_transcript" text,
	"inferred_tags" json DEFAULT '[]'::json NOT NULL,
	"emotional_tone" text,
	"priority_score" integer DEFAULT 50 NOT NULL,
	"raw_input" text NOT NULL,
	"input_method" text DEFAULT 'form' NOT NULL,
	"nlp_confidence" integer DEFAULT 100,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_profile_id" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cached_search_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"profile_fingerprint" text NOT NULL,
	"search_method" text NOT NULL,
	"top_picks" json NOT NULL,
	"other_matches" json NOT NULL,
	"properties_without_images" json DEFAULT '[]'::json NOT NULL,
	"chat_blocks" json DEFAULT '[]'::json NOT NULL,
	"search_summary" json NOT NULL,
	"total_listings_processed" integer NOT NULL,
	"visual_analysis_count" integer DEFAULT 0 NOT NULL,
	"execution_time_ms" integer NOT NULL,
	"cache_version" integer DEFAULT 1 NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL,
	"last_accessed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_agent_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"profile_id" integer NOT NULL,
	"agent_id" integer NOT NULL,
	"insight_type" text NOT NULL,
	"insight_message" text NOT NULL,
	"confidence_score" numeric(3, 2) NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"action_suggested" text,
	"status" text DEFAULT 'new' NOT NULL,
	"generated_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"message" text NOT NULL,
	"ai_response" text,
	"timestamp" text NOT NULL,
	"question_category" text,
	"sentiment_score" numeric(3, 2),
	"property_mentioned" text,
	"intent_classification" text,
	"agent_path" text,
	"search_transaction_id" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_search_context" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"search_transaction_id" text NOT NULL,
	"context_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"agent_id" integer NOT NULL,
	"session_start" text NOT NULL,
	"last_activity" text NOT NULL,
	"total_questions" integer DEFAULT 0 NOT NULL,
	"engagement_score" numeric(3, 1) DEFAULT '0.0' NOT NULL,
	"return_visits" integer DEFAULT 0 NOT NULL,
	"decision_stage" text DEFAULT 'browsing' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"strategy_json" json NOT NULL,
	"market_analysis" json NOT NULL,
	"property_recommendations" json NOT NULL,
	"financial_projections" json NOT NULL,
	"generation_time" bigint NOT NULL,
	"data_sources_used" json NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"document_url" text,
	"created_at" text NOT NULL,
	"completed_at" text,
	CONSTRAINT "investment_strategies_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "investment_strategy_scores" (
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
--> statement-breakpoint
CREATE TABLE "listing_shareable_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"share_id" text NOT NULL,
	"profile_id" integer,
	"agent_name" text,
	"agent_email" text,
	"custom_message" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed" text,
	"expires_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "listing_shareable_links_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
CREATE TABLE "listing_visual_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"image_url" text NOT NULL,
	"image_type" text NOT NULL,
	"visual_tags" text NOT NULL,
	"summary" text NOT NULL,
	"flags" text NOT NULL,
	"confidence" integer DEFAULT 85 NOT NULL,
	"analyzed_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_decisions" (
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
--> statement-breakpoint
CREATE TABLE "nlp_search_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"agent_id" integer NOT NULL,
	"nlp_query" text NOT NULL,
	"nlp_response" json NOT NULL,
	"search_url" text NOT NULL,
	"search_results" json NOT NULL,
	"execution_time" integer NOT NULL,
	"nlp_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_insights_lock" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"is_locked" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_persona" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"emotional_tone" text,
	"communication_style" text,
	"decision_making_style" text,
	"urgency_level" integer DEFAULT 50 NOT NULL,
	"price_orientation" text,
	"personality_traits" json DEFAULT '[]'::json NOT NULL,
	"confidence_score" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_shareable_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"share_id" text NOT NULL,
	"agent_name" text,
	"agent_email" text,
	"agent_phone" text,
	"custom_message" text,
	"branding_colors" text,
	"show_visual_analysis" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed" text,
	"expires_at" text,
	"created_at" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "profile_shareable_links_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
CREATE TABLE "profile_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"tag" text NOT NULL,
	"category" text NOT NULL,
	"confidence" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"interaction_type" text NOT NULL,
	"rating" integer,
	"reason" text,
	"emotional_response" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"note_text" text NOT NULL,
	"note_type" text DEFAULT 'personal' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repliers_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"price" integer NOT NULL,
	"bedrooms" integer DEFAULT 0 NOT NULL,
	"bathrooms" numeric(3, 1) DEFAULT '0' NOT NULL,
	"square_feet" integer,
	"property_type" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text,
	"description" text,
	"features" text,
	"images" text,
	"listing_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"mls_number" text,
	"lot_size" numeric(10, 2),
	"year_built" integer,
	"garage_spaces" integer,
	"created_at" text DEFAULT 'now()' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"profile_id" integer NOT NULL,
	"properties_clicked" json,
	"properties_saved" json,
	"properties_shared" json,
	"agent_satisfaction_rating" integer,
	"search_quality_rating" integer,
	"agent_notes" text,
	"search_refinement_needed" boolean DEFAULT false NOT NULL,
	"client_meeting_scheduled" boolean DEFAULT false NOT NULL,
	"total_session_time" integer,
	"most_viewed_listings" json,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "search_transaction_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"top_results" json NOT NULL,
	"top_picks_data" json NOT NULL,
	"other_matches_data" json NOT NULL,
	"visual_analysis_data" json,
	"search_summary" json NOT NULL,
	"chat_blocks" json,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"profile_id" integer NOT NULL,
	"agent_id" integer,
	"session_id" text,
	"profile_snapshot" json NOT NULL,
	"search_parameters" json NOT NULL,
	"search_method" text NOT NULL,
	"search_trigger" text NOT NULL,
	"raw_listings_count" integer NOT NULL,
	"scored_listings_count" integer NOT NULL,
	"top_picks_count" integer NOT NULL,
	"other_matches_count" integer NOT NULL,
	"no_image_count" integer NOT NULL,
	"visual_analysis_count" integer NOT NULL,
	"total_execution_time" integer NOT NULL,
	"api_calls_count" integer NOT NULL,
	"visual_analysis_time" integer,
	"average_score" numeric(5, 2),
	"score_distribution" json,
	"dealbreaker_properties_count" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "search_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "agent_action_feedback" ADD CONSTRAINT "agent_action_feedback_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insight_feedback" ADD CONSTRAINT "agent_insight_feedback_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_transaction_id_search_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."search_transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cached_search_results" ADD CONSTRAINT "cached_search_results_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent_insights" ADD CONSTRAINT "chat_agent_insights_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent_insights" ADD CONSTRAINT "chat_agent_insights_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent_insights" ADD CONSTRAINT "chat_agent_insights_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_search_context" ADD CONSTRAINT "chat_search_context_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_search_context" ADD CONSTRAINT "chat_search_context_search_transaction_id_search_transactions_transaction_id_fk" FOREIGN KEY ("search_transaction_id") REFERENCES "public"."search_transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_strategies" ADD CONSTRAINT "investment_strategies_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_shareable_links" ADD CONSTRAINT "listing_shareable_links_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_decisions" ADD CONSTRAINT "llm_decisions_parent_decision_id_llm_decisions_id_fk" FOREIGN KEY ("parent_decision_id") REFERENCES "public"."llm_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nlp_search_logs" ADD CONSTRAINT "nlp_search_logs_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nlp_search_logs" ADD CONSTRAINT "nlp_search_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_insights_lock" ADD CONSTRAINT "profile_insights_lock_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_persona" ADD CONSTRAINT "profile_persona_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_shareable_links" ADD CONSTRAINT "profile_shareable_links_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_tags" ADD CONSTRAINT "profile_tags_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_interactions" ADD CONSTRAINT "property_interactions_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_notes" ADD CONSTRAINT "property_notes_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_outcomes" ADD CONSTRAINT "search_outcomes_transaction_id_search_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."search_transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_outcomes" ADD CONSTRAINT "search_outcomes_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_transaction_results" ADD CONSTRAINT "search_transaction_results_transaction_id_search_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."search_transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_transactions" ADD CONSTRAINT "search_transactions_profile_id_buyer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."buyer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_transactions" ADD CONSTRAINT "search_transactions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;