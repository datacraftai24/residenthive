--
-- PostgreSQL database dump
--

\restrict J7XITiaEmEiMAVnaiHYGaSKvZeUYX3pFKVbcSypgGF4UhBjLJGJEySpxQAg9WHU

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ai; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ai;


--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: calculate_property_insights(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_property_insights(p_property_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_price INTEGER;
    v_sqft INTEGER;
    v_bedrooms INTEGER;
    v_city TEXT;
    v_estimated_rental INTEGER;
    v_price_per_sqft NUMERIC(10,2);
BEGIN
    -- Get property data
    SELECT price, square_feet, bedrooms, city
    INTO v_price, v_sqft, v_bedrooms, v_city
    FROM repliers_listings
    WHERE id = p_property_id;

    -- Calculate price per sqft
    IF v_sqft > 0 THEN
        v_price_per_sqft := v_price::NUMERIC / v_sqft;
    END IF;

    -- Estimate rental (rough formula: 0.8-1.2% of property value per month)
    v_estimated_rental := (v_price * 0.01)::INTEGER;

    -- Insert or update insights
    INSERT INTO property_insights (
        property_id,
        price_per_sqft,
        estimated_rental,
        created_at,
        updated_at
    ) VALUES (
        p_property_id,
        v_price_per_sqft,
        v_estimated_rental,
        NOW(),
        NOW()
    )
    ON CONFLICT (property_id)
    DO UPDATE SET
        price_per_sqft = EXCLUDED.price_per_sqft,
        estimated_rental = EXCLUDED.estimated_rental,
        updated_at = NOW();
END;
$$;


--
-- Name: FUNCTION calculate_property_insights(p_property_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calculate_property_insights(p_property_id text) IS 'Calculates basic property insights (price per sqft, estimated rental) for a given property.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agno_sessions; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.agno_sessions (
    session_id character varying NOT NULL,
    session_type character varying NOT NULL,
    agent_id character varying,
    team_id character varying,
    workflow_id character varying,
    user_id character varying,
    session_data json,
    agent_data json,
    team_data json,
    workflow_data json,
    metadata json,
    runs json,
    summary json,
    created_at bigint NOT NULL,
    updated_at bigint
);


--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: agent_action_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_action_feedback (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    action_id text NOT NULL,
    action_taken text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: agent_action_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_action_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_action_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_action_feedback_id_seq OWNED BY public.agent_action_feedback.id;


--
-- Name: agent_insight_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_insight_feedback (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    tag_name text,
    persona_field text,
    feedback_type text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: agent_insight_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_insight_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_insight_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_insight_feedback_id_seq OWNED BY public.agent_insight_feedback.id;


--
-- Name: agent_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_insights (
    id integer NOT NULL,
    profile_id integer,
    agent_id text,
    session_id text NOT NULL,
    client_personality text,
    client_motivations text,
    decision_style text,
    hidden_concerns text,
    off_market_opportunities text,
    neighborhood_dynamics text,
    local_development_plans text,
    timing_considerations text,
    recommended_strategy text,
    why_this_strategy text,
    alternative_approaches text,
    red_flags text,
    mitigation_strategies text,
    seller_motivations text,
    negotiation_tips text,
    next_steps text,
    agent_commitments text,
    full_conversation text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    insight_quality text,
    has_off_market_info boolean DEFAULT false,
    has_local_intelligence boolean DEFAULT false
);


--
-- Name: agent_insights_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_insights_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_insights_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_insights_id_seq OWNED BY public.agent_insights.id;


--
-- Name: agent_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_interactions (
    id integer NOT NULL,
    transaction_id text NOT NULL,
    profile_id integer NOT NULL,
    interaction_type text NOT NULL,
    listing_id text,
    interaction_data json NOT NULL,
    session_duration integer,
    agent_confidence integer,
    created_at text NOT NULL
);


--
-- Name: agent_interactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_interactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_interactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_interactions_id_seq OWNED BY public.agent_interactions.id;


--
-- Name: agent_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_notes (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    note text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: agent_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_notes_id_seq OWNED BY public.agent_notes.id;


--
-- Name: agent_scoring_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_scoring_rules (
    id integer NOT NULL,
    agent_id integer NOT NULL,
    rule_name text NOT NULL,
    config_json jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: TABLE agent_scoring_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_scoring_rules IS 'Custom scoring rules per agent. Allows agents to tune property matching without code changes.';


--
-- Name: COLUMN agent_scoring_rules.rule_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_scoring_rules.rule_name IS 'Identifier for this rule set (e.g., "default", "luxury_market", "first_time_buyers")';


--
-- Name: COLUMN agent_scoring_rules.config_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_scoring_rules.config_json IS 'JSON object containing scoring weights and criteria. Merged with DEFAULT_SCORING_RULES from code.';


--
-- Name: COLUMN agent_scoring_rules.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_scoring_rules.is_active IS 'Only active rules are used. Allows keeping history of old configurations.';


--
-- Name: COLUMN agent_scoring_rules.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_scoring_rules.notes IS 'Agent notes about why these rules were customized (e.g., "Adjusted for Boston luxury market")';


--
-- Name: agent_scoring_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_scoring_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_scoring_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_scoring_rules_id_seq OWNED BY public.agent_scoring_rules.id;


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id integer NOT NULL,
    email text NOT NULL,
    password_hash text,
    first_name text NOT NULL,
    last_name text NOT NULL,
    brokerage_name text NOT NULL,
    invite_token text,
    is_activated boolean DEFAULT false NOT NULL,
    created_at text NOT NULL,
    clerk_user_id text
);


--
-- Name: agents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agents_id_seq OWNED BY public.agents.id;


--
-- Name: buyer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_profiles (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    location text NOT NULL,
    agent_id integer,
    buyer_type text DEFAULT 'traditional'::text NOT NULL,
    budget text NOT NULL,
    budget_min integer,
    budget_max integer,
    home_type text NOT NULL,
    bedrooms integer NOT NULL,
    bathrooms text NOT NULL,
    investor_type text,
    investment_capital integer,
    target_monthly_return integer,
    target_cap_rate numeric(5,2),
    investment_strategy text,
    must_have_features json DEFAULT '[]'::json NOT NULL,
    dealbreakers json DEFAULT '[]'::json NOT NULL,
    preferred_areas json DEFAULT '[]'::json NOT NULL,
    lifestyle_drivers json DEFAULT '[]'::json NOT NULL,
    special_needs json DEFAULT '[]'::json NOT NULL,
    budget_flexibility integer DEFAULT 50 NOT NULL,
    location_flexibility integer DEFAULT 50 NOT NULL,
    timing_flexibility integer DEFAULT 50 NOT NULL,
    emotional_context text,
    voice_transcript text,
    inferred_tags json DEFAULT '[]'::json NOT NULL,
    emotional_tone text,
    priority_score integer DEFAULT 50 NOT NULL,
    raw_input text NOT NULL,
    input_method text DEFAULT 'form'::text NOT NULL,
    nlp_confidence integer DEFAULT 100,
    version integer DEFAULT 1 NOT NULL,
    parent_profile_id integer,
    created_at text NOT NULL,
    max_bedrooms integer
);


--
-- Name: COLUMN buyer_profiles.max_bedrooms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.buyer_profiles.max_bedrooms IS 'Maximum bedrooms desired (NULL = no maximum limit)';


--
-- Name: buyer_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.buyer_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: buyer_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.buyer_profiles_id_seq OWNED BY public.buyer_profiles.id;


--
-- Name: cached_search_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cached_search_results (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    profile_fingerprint text NOT NULL,
    search_method text NOT NULL,
    top_picks json NOT NULL,
    other_matches json NOT NULL,
    properties_without_images json DEFAULT '[]'::json NOT NULL,
    chat_blocks json DEFAULT '[]'::json NOT NULL,
    search_summary json NOT NULL,
    total_listings_processed integer NOT NULL,
    visual_analysis_count integer DEFAULT 0 NOT NULL,
    execution_time_ms integer NOT NULL,
    cache_version integer DEFAULT 1 NOT NULL,
    expires_at text NOT NULL,
    created_at text NOT NULL,
    last_accessed_at text NOT NULL
);


--
-- Name: cached_search_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cached_search_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cached_search_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cached_search_results_id_seq OWNED BY public.cached_search_results.id;


--
-- Name: chat_agent_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_agent_insights (
    id text NOT NULL,
    session_id text NOT NULL,
    profile_id integer NOT NULL,
    agent_id integer NOT NULL,
    insight_type text NOT NULL,
    insight_message text NOT NULL,
    confidence_score numeric(3,2) NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    action_suggested text,
    status text DEFAULT 'new'::text NOT NULL,
    generated_at text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id text NOT NULL,
    session_id text NOT NULL,
    message text NOT NULL,
    ai_response text,
    "timestamp" text NOT NULL,
    question_category text,
    sentiment_score numeric(3,2),
    property_mentioned text,
    intent_classification text,
    agent_path text,
    search_transaction_id text,
    created_at text NOT NULL
);


--
-- Name: chat_search_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_search_context (
    id integer NOT NULL,
    session_id text NOT NULL,
    search_transaction_id text NOT NULL,
    context_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at text NOT NULL
);


--
-- Name: chat_search_context_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_search_context_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_search_context_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_search_context_id_seq OWNED BY public.chat_search_context.id;


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    id text NOT NULL,
    profile_id integer NOT NULL,
    agent_id integer NOT NULL,
    session_start text NOT NULL,
    last_activity text NOT NULL,
    total_questions integer DEFAULT 0 NOT NULL,
    engagement_score numeric(3,1) DEFAULT 0.0 NOT NULL,
    return_visits integer DEFAULT 0 NOT NULL,
    decision_stage text DEFAULT 'browsing'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: config_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_access_log (
    id integer NOT NULL,
    config_key text NOT NULL,
    accessed_by text NOT NULL,
    accessed_at text NOT NULL,
    purpose text
);


--
-- Name: config_access_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.config_access_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_access_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.config_access_log_id_seq OWNED BY public.config_access_log.id;


--
-- Name: config_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_audit_log (
    id integer NOT NULL,
    config_key text NOT NULL,
    previous_value text,
    new_value text NOT NULL,
    updated_by text NOT NULL,
    updated_at text NOT NULL,
    provenance text NOT NULL,
    change_reason text
);


--
-- Name: config_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.config_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.config_audit_log_id_seq OWNED BY public.config_audit_log.id;


--
-- Name: config_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_values (
    id integer NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by text NOT NULL,
    updated_at text NOT NULL,
    ttl_expires_at text,
    provenance text NOT NULL
);


--
-- Name: config_values_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.config_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.config_values_id_seq OWNED BY public.config_values.id;


--
-- Name: ingestion_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_jobs (
    id integer NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    agent_id integer,
    profile_id integer,
    records_processed integer DEFAULT 0,
    records_total integer DEFAULT 0,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE ingestion_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ingestion_jobs IS 'Tracks data ingestion and processing jobs. Monitors listing imports, AI analysis, and image processing.';


--
-- Name: ingestion_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingestion_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ingestion_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingestion_jobs_id_seq OWNED BY public.ingestion_jobs.id;


--
-- Name: investment_strategies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investment_strategies (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    session_id text NOT NULL,
    strategy_json json NOT NULL,
    market_analysis json NOT NULL,
    property_recommendations json NOT NULL,
    financial_projections json NOT NULL,
    generation_time integer NOT NULL,
    data_sources_used json NOT NULL,
    status text DEFAULT 'generating'::text NOT NULL,
    document_url text,
    created_at text NOT NULL,
    completed_at text
);


--
-- Name: investment_strategies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.investment_strategies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: investment_strategies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.investment_strategies_id_seq OWNED BY public.investment_strategies.id;


--
-- Name: investment_strategy_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investment_strategy_scores (
    id integer NOT NULL,
    session_id text NOT NULL,
    property_id text NOT NULL,
    strategy_id text NOT NULL,
    property_address text NOT NULL,
    property_price integer NOT NULL,
    property_data json NOT NULL,
    strategy_name text NOT NULL,
    strategy_type text,
    down_payment_percent numeric(5,2),
    down_payment_amount integer,
    monthly_income integer,
    monthly_expenses integer,
    monthly_cash_flow integer,
    cap_rate numeric(5,2),
    cash_on_cash_return numeric(5,2),
    overall_score numeric(5,2) NOT NULL,
    scoring_factors json,
    ai_reasoning text,
    is_feasible boolean DEFAULT true NOT NULL,
    feasibility_issues json,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: investment_strategy_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.investment_strategy_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: investment_strategy_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.investment_strategy_scores_id_seq OWNED BY public.investment_strategy_scores.id;


--
-- Name: listing_shareable_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_shareable_links (
    id integer NOT NULL,
    listing_id text NOT NULL,
    share_id text NOT NULL,
    profile_id integer,
    agent_name text,
    agent_email text,
    custom_message text,
    view_count integer DEFAULT 0 NOT NULL,
    last_viewed text,
    expires_at text,
    created_at text NOT NULL
);


--
-- Name: listing_shareable_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.listing_shareable_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: listing_shareable_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.listing_shareable_links_id_seq OWNED BY public.listing_shareable_links.id;


--
-- Name: listing_visual_analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_visual_analysis (
    id integer NOT NULL,
    listing_id text NOT NULL,
    image_url text NOT NULL,
    image_type text NOT NULL,
    visual_tags text NOT NULL,
    summary text NOT NULL,
    flags text NOT NULL,
    confidence integer DEFAULT 85 NOT NULL,
    analyzed_at text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: listing_visual_analysis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.listing_visual_analysis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: listing_visual_analysis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.listing_visual_analysis_id_seq OWNED BY public.listing_visual_analysis.id;


--
-- Name: llm_contexts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.llm_contexts AS
 SELECT cm.id,
    cs.id AS session_id,
    cm.message AS user_query,
    cm.ai_response AS llm_response,
    cs.agent_id,
    cs.profile_id AS client_id,
    (cm.created_at)::timestamp with time zone AS created_at,
    cs.session_start
   FROM (public.chat_messages cm
     JOIN public.chat_sessions cs ON ((cm.session_id = cs.id)))
  ORDER BY cs.session_start DESC, cm.created_at;


--
-- Name: llm_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_decisions (
    id integer NOT NULL,
    session_id text NOT NULL,
    agent_name text NOT NULL,
    decision_type text NOT NULL,
    user_requirements json,
    market_context json,
    system_prompt text,
    user_prompt text NOT NULL,
    raw_response text NOT NULL,
    parsed_response json,
    reasoning json,
    confidence numeric(3,2),
    model text DEFAULT 'gpt-4o'::text NOT NULL,
    temperature numeric(2,1) DEFAULT 0.7,
    tokens_used integer,
    response_time_ms integer,
    parent_decision_id integer,
    decision_path json,
    outcome_success boolean,
    outcome_notes text,
    human_override boolean DEFAULT false,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: llm_decisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.llm_decisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: llm_decisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.llm_decisions_id_seq OWNED BY public.llm_decisions.id;


--
-- Name: nlp_search_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nlp_search_logs (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    agent_id integer NOT NULL,
    nlp_query text NOT NULL,
    nlp_response json NOT NULL,
    search_url text NOT NULL,
    search_results json NOT NULL,
    execution_time integer NOT NULL,
    nlp_id text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: nlp_search_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nlp_search_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nlp_search_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nlp_search_logs_id_seq OWNED BY public.nlp_search_logs.id;


--
-- Name: profile_chat_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_chat_links (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    agent_id integer NOT NULL,
    share_id text NOT NULL,
    client_identifier text,
    agent_name text,
    agent_email text,
    agent_phone text,
    buyer_name text,
    buyer_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    last_viewed timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: profile_chat_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_chat_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_chat_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_chat_links_id_seq OWNED BY public.profile_chat_links.id;


--
-- Name: profile_insights_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_insights_lock (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    is_locked integer DEFAULT 0 NOT NULL,
    created_at text NOT NULL
);


--
-- Name: profile_insights_lock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_insights_lock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_insights_lock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_insights_lock_id_seq OWNED BY public.profile_insights_lock.id;


--
-- Name: profile_persona; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_persona (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    emotional_tone text,
    communication_style text,
    decision_making_style text,
    urgency_level integer DEFAULT 50 NOT NULL,
    price_orientation text,
    personality_traits json DEFAULT '[]'::json NOT NULL,
    confidence_score integer NOT NULL,
    created_at text NOT NULL
);


--
-- Name: profile_persona_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_persona_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_persona_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_persona_id_seq OWNED BY public.profile_persona.id;


--
-- Name: profile_shareable_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_shareable_links (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    share_id text NOT NULL,
    agent_name text,
    agent_email text,
    agent_phone text,
    custom_message text,
    branding_colors text,
    show_visual_analysis boolean DEFAULT true NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    last_viewed text,
    expires_at text,
    created_at text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: profile_shareable_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_shareable_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_shareable_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_shareable_links_id_seq OWNED BY public.profile_shareable_links.id;


--
-- Name: profile_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_tags (
    id integer NOT NULL,
    profile_id integer NOT NULL,
    tag text NOT NULL,
    category text NOT NULL,
    confidence integer NOT NULL,
    source text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: profile_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_tags_id_seq OWNED BY public.profile_tags.id;


--
-- Name: repliers_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repliers_listings (
    id text NOT NULL,
    address text NOT NULL,
    price integer NOT NULL,
    bedrooms integer DEFAULT 0 NOT NULL,
    bathrooms numeric(3,1) DEFAULT '0'::numeric NOT NULL,
    square_feet integer,
    property_type text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    zip_code text,
    description text,
    features text,
    images text,
    listing_date text,
    status text DEFAULT 'active'::text NOT NULL,
    mls_number text,
    lot_size numeric(10,2),
    year_built integer,
    garage_spaces integer,
    created_at text DEFAULT 'now()'::text NOT NULL,
    agent_id integer,
    updated_at timestamp with time zone DEFAULT now(),
    profile_id integer
);


--
-- Name: properties; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.properties AS
 SELECT rl.id,
    rl.address,
    rl.city,
    rl.state,
    rl.zip_code,
    rl.price,
    rl.bedrooms,
    rl.bathrooms,
    rl.square_feet,
    rl.property_type,
    rl.mls_number,
    rl.lot_size,
    rl.year_built,
    rl.garage_spaces,
    rl.description,
    rl.features,
    rl.images,
    rl.listing_date,
    rl.status,
    rl.agent_id,
    rl.profile_id,
    COALESCE(bp.email, (rl.profile_id)::text) AS client_id,
    (rl.created_at)::timestamp with time zone AS created_at,
    rl.updated_at
   FROM (public.repliers_listings rl
     LEFT JOIN public.buyer_profiles bp ON ((rl.profile_id = bp.id)));


--
-- Name: property_analysis_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_analysis_cache (
    id integer NOT NULL,
    listing_id text NOT NULL,
    profile_id integer NOT NULL,
    analysis_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE property_analysis_cache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.property_analysis_cache IS 'Caches AI-generated property analysis to reduce OpenAI API costs. TTL managed by application (24 hours).';


--
-- Name: COLUMN property_analysis_cache.listing_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.property_analysis_cache.listing_id IS 'MLS number or listing ID from Repliers API';


--
-- Name: COLUMN property_analysis_cache.analysis_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.property_analysis_cache.analysis_json IS 'AI-generated analysis including headline, agent_insight, matched_features, why_it_works, match_reasoning';


--
-- Name: property_analysis_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_analysis_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_analysis_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_analysis_cache_id_seq OWNED BY public.property_analysis_cache.id;


--
-- Name: property_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_images (
    id integer NOT NULL,
    property_id text NOT NULL,
    image_url text NOT NULL,
    image_order integer DEFAULT 0,
    ai_description text,
    visual_tags jsonb DEFAULT '[]'::jsonb,
    agent_id integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE property_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.property_images IS 'Property images with AI-generated descriptions for visual search. Enables chatbot to search by visual features.';


--
-- Name: COLUMN property_images.visual_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.property_images.visual_tags IS 'JSONB array of visual features extracted from image (e.g., ["modern kitchen", "granite countertops", "hardwood floors"])';


--
-- Name: property_images_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_images_id_seq OWNED BY public.property_images.id;


--
-- Name: property_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_insights (
    id integer NOT NULL,
    property_id text NOT NULL,
    estimated_rental integer,
    price_per_sqft numeric(10,2),
    investment_summary text,
    risk_factors jsonb DEFAULT '[]'::jsonb,
    market_trends jsonb DEFAULT '{}'::jsonb,
    cap_rate numeric(5,2),
    roi_estimate numeric(5,2),
    agent_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE property_insights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.property_insights IS 'Market and investment insights for properties. Supports chatbot investment analysis queries.';


--
-- Name: COLUMN property_insights.cap_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.property_insights.cap_rate IS 'Capitalization rate (annual rental income / property price * 100)';


--
-- Name: COLUMN property_insights.roi_estimate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.property_insights.roi_estimate IS 'Estimated return on investment percentage';


--
-- Name: property_insights_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_insights_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_insights_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_insights_id_seq OWNED BY public.property_insights.id;


--
-- Name: property_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_interactions (
    id text NOT NULL,
    session_id text NOT NULL,
    listing_id text NOT NULL,
    interaction_type text NOT NULL,
    rating integer,
    reason text,
    emotional_response text,
    created_at text NOT NULL
);


--
-- Name: property_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_notes (
    id text NOT NULL,
    session_id text NOT NULL,
    listing_id text NOT NULL,
    note_text text NOT NULL,
    note_type text DEFAULT 'personal'::text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
);


--
-- Name: property_summaries; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.property_summaries AS
 SELECT pac.id,
    pac.listing_id AS property_id,
    (pac.analysis_json ->> 'headline'::text) AS short_summary,
    concat((pac.analysis_json ->> 'agent_insight'::text), '

Why it works:
', ((pac.analysis_json -> 'why_it_works'::text) ->> 'budget'::text), '
', ((pac.analysis_json -> 'why_it_works'::text) ->> 'location'::text), '
', COALESCE(((pac.analysis_json -> 'why_it_works'::text) ->> 'lifestyle_fit'::text), ((pac.analysis_json -> 'why_it_works'::text) ->> 'family_fit'::text), ((pac.analysis_json -> 'why_it_works'::text) ->> 'investment_fit'::text), ''::text)) AS detailed_summary,
    bp.agent_id,
    bp.id AS client_id,
    pac.created_at
   FROM (public.property_analysis_cache pac
     JOIN public.buyer_profiles bp ON ((pac.profile_id = bp.id)));


--
-- Name: VIEW property_summaries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.property_summaries IS 'AI-generated property summaries extracted from property_analysis_cache. Provides chatbot with agent insights.';


--
-- Name: search_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_outcomes (
    id integer NOT NULL,
    transaction_id text NOT NULL,
    profile_id integer NOT NULL,
    properties_clicked json,
    properties_saved json,
    properties_shared json,
    agent_satisfaction_rating integer,
    search_quality_rating integer,
    agent_notes text,
    search_refinement_needed boolean DEFAULT false NOT NULL,
    client_meeting_scheduled boolean DEFAULT false NOT NULL,
    total_session_time integer,
    most_viewed_listings json,
    created_at text NOT NULL,
    updated_at text
);


--
-- Name: search_outcomes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_outcomes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_outcomes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_outcomes_id_seq OWNED BY public.search_outcomes.id;


--
-- Name: search_transaction_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_transaction_results (
    id integer NOT NULL,
    transaction_id text NOT NULL,
    top_results json NOT NULL,
    top_picks_data json NOT NULL,
    other_matches_data json NOT NULL,
    visual_analysis_data json,
    search_summary json NOT NULL,
    chat_blocks json,
    created_at text NOT NULL
);


--
-- Name: search_transaction_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_transaction_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_transaction_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_transaction_results_id_seq OWNED BY public.search_transaction_results.id;


--
-- Name: search_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_transactions (
    id integer NOT NULL,
    transaction_id text NOT NULL,
    profile_id integer NOT NULL,
    agent_id integer,
    session_id text,
    profile_snapshot json NOT NULL,
    search_parameters json NOT NULL,
    search_method text NOT NULL,
    search_trigger text NOT NULL,
    raw_listings_count integer NOT NULL,
    scored_listings_count integer NOT NULL,
    top_picks_count integer NOT NULL,
    other_matches_count integer NOT NULL,
    no_image_count integer NOT NULL,
    visual_analysis_count integer NOT NULL,
    total_execution_time integer NOT NULL,
    api_calls_count integer NOT NULL,
    visual_analysis_time integer,
    average_score numeric(5,2),
    score_distribution json,
    dealbreaker_properties_count integer DEFAULT 0 NOT NULL,
    created_at text NOT NULL
);


--
-- Name: search_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_transactions_id_seq OWNED BY public.search_transactions.id;


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: agent_action_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_feedback ALTER COLUMN id SET DEFAULT nextval('public.agent_action_feedback_id_seq'::regclass);


--
-- Name: agent_insight_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_insight_feedback ALTER COLUMN id SET DEFAULT nextval('public.agent_insight_feedback_id_seq'::regclass);


--
-- Name: agent_insights id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_insights ALTER COLUMN id SET DEFAULT nextval('public.agent_insights_id_seq'::regclass);


--
-- Name: agent_interactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_interactions ALTER COLUMN id SET DEFAULT nextval('public.agent_interactions_id_seq'::regclass);


--
-- Name: agent_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_notes ALTER COLUMN id SET DEFAULT nextval('public.agent_notes_id_seq'::regclass);


--
-- Name: agent_scoring_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_scoring_rules ALTER COLUMN id SET DEFAULT nextval('public.agent_scoring_rules_id_seq'::regclass);


--
-- Name: agents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents ALTER COLUMN id SET DEFAULT nextval('public.agents_id_seq'::regclass);


--
-- Name: buyer_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_profiles ALTER COLUMN id SET DEFAULT nextval('public.buyer_profiles_id_seq'::regclass);


--
-- Name: cached_search_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cached_search_results ALTER COLUMN id SET DEFAULT nextval('public.cached_search_results_id_seq'::regclass);


--
-- Name: chat_search_context id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_search_context ALTER COLUMN id SET DEFAULT nextval('public.chat_search_context_id_seq'::regclass);


--
-- Name: config_access_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_access_log ALTER COLUMN id SET DEFAULT nextval('public.config_access_log_id_seq'::regclass);


--
-- Name: config_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_audit_log ALTER COLUMN id SET DEFAULT nextval('public.config_audit_log_id_seq'::regclass);


--
-- Name: config_values id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_values ALTER COLUMN id SET DEFAULT nextval('public.config_values_id_seq'::regclass);


--
-- Name: ingestion_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs ALTER COLUMN id SET DEFAULT nextval('public.ingestion_jobs_id_seq'::regclass);


--
-- Name: investment_strategies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_strategies ALTER COLUMN id SET DEFAULT nextval('public.investment_strategies_id_seq'::regclass);


--
-- Name: investment_strategy_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_strategy_scores ALTER COLUMN id SET DEFAULT nextval('public.investment_strategy_scores_id_seq'::regclass);


--
-- Name: listing_shareable_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_shareable_links ALTER COLUMN id SET DEFAULT nextval('public.listing_shareable_links_id_seq'::regclass);


--
-- Name: listing_visual_analysis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_visual_analysis ALTER COLUMN id SET DEFAULT nextval('public.listing_visual_analysis_id_seq'::regclass);


--
-- Name: llm_decisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_decisions ALTER COLUMN id SET DEFAULT nextval('public.llm_decisions_id_seq'::regclass);


--
-- Name: nlp_search_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nlp_search_logs ALTER COLUMN id SET DEFAULT nextval('public.nlp_search_logs_id_seq'::regclass);


--
-- Name: profile_chat_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_chat_links ALTER COLUMN id SET DEFAULT nextval('public.profile_chat_links_id_seq'::regclass);


--
-- Name: profile_insights_lock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_insights_lock ALTER COLUMN id SET DEFAULT nextval('public.profile_insights_lock_id_seq'::regclass);


--
-- Name: profile_persona id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_persona ALTER COLUMN id SET DEFAULT nextval('public.profile_persona_id_seq'::regclass);


--
-- Name: profile_shareable_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_shareable_links ALTER COLUMN id SET DEFAULT nextval('public.profile_shareable_links_id_seq'::regclass);


--
-- Name: profile_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_tags ALTER COLUMN id SET DEFAULT nextval('public.profile_tags_id_seq'::regclass);


--
-- Name: property_analysis_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_analysis_cache ALTER COLUMN id SET DEFAULT nextval('public.property_analysis_cache_id_seq'::regclass);


--
-- Name: property_images id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images ALTER COLUMN id SET DEFAULT nextval('public.property_images_id_seq'::regclass);


--
-- Name: property_insights id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_insights ALTER COLUMN id SET DEFAULT nextval('public.property_insights_id_seq'::regclass);


--
-- Name: search_outcomes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_outcomes ALTER COLUMN id SET DEFAULT nextval('public.search_outcomes_id_seq'::regclass);


--
-- Name: search_transaction_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transaction_results ALTER COLUMN id SET DEFAULT nextval('public.search_transaction_results_id_seq'::regclass);


--
-- Name: search_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transactions ALTER COLUMN id SET DEFAULT nextval('public.search_transactions_id_seq'::regclass);


--
-- Name: agno_sessions agno_sessions_uq_session_id; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agno_sessions
    ADD CONSTRAINT agno_sessions_uq_session_id UNIQUE (session_id);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: agent_action_feedback agent_action_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_feedback
    ADD CONSTRAINT agent_action_feedback_pkey PRIMARY KEY (id);


--
-- Name: agent_insight_feedback agent_insight_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_insight_feedback
    ADD CONSTRAINT agent_insight_feedback_pkey PRIMARY KEY (id);


--
-- Name: agent_insights agent_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_insights
    ADD CONSTRAINT agent_insights_pkey PRIMARY KEY (id);


--
-- Name: agent_interactions agent_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_interactions
    ADD CONSTRAINT agent_interactions_pkey PRIMARY KEY (id);


--
-- Name: agent_notes agent_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_notes
    ADD CONSTRAINT agent_notes_pkey PRIMARY KEY (id);


--
-- Name: agent_scoring_rules agent_scoring_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_scoring_rules
    ADD CONSTRAINT agent_scoring_rules_pkey PRIMARY KEY (id);


--
-- Name: agents agents_clerk_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_clerk_user_id_key UNIQUE (clerk_user_id);


--
-- Name: agents agents_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_email_unique UNIQUE (email);


--
-- Name: agents agents_invite_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_invite_token_unique UNIQUE (invite_token);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: buyer_profiles buyer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_profiles
    ADD CONSTRAINT buyer_profiles_pkey PRIMARY KEY (id);


--
-- Name: cached_search_results cached_search_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cached_search_results
    ADD CONSTRAINT cached_search_results_pkey PRIMARY KEY (id);


--
-- Name: chat_agent_insights chat_agent_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_agent_insights
    ADD CONSTRAINT chat_agent_insights_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_search_context chat_search_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_search_context
    ADD CONSTRAINT chat_search_context_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: config_access_log config_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_access_log
    ADD CONSTRAINT config_access_log_pkey PRIMARY KEY (id);


--
-- Name: config_audit_log config_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_audit_log
    ADD CONSTRAINT config_audit_log_pkey PRIMARY KEY (id);


--
-- Name: config_values config_values_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_values
    ADD CONSTRAINT config_values_key_key UNIQUE (key);


--
-- Name: config_values config_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_values
    ADD CONSTRAINT config_values_pkey PRIMARY KEY (id);


--
-- Name: ingestion_jobs ingestion_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_pkey PRIMARY KEY (id);


--
-- Name: investment_strategies investment_strategies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_strategies
    ADD CONSTRAINT investment_strategies_pkey PRIMARY KEY (id);


--
-- Name: investment_strategies investment_strategies_session_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_strategies
    ADD CONSTRAINT investment_strategies_session_id_unique UNIQUE (session_id);


--
-- Name: investment_strategy_scores investment_strategy_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_strategy_scores
    ADD CONSTRAINT investment_strategy_scores_pkey PRIMARY KEY (id);


--
-- Name: listing_shareable_links listing_shareable_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_shareable_links
    ADD CONSTRAINT listing_shareable_links_pkey PRIMARY KEY (id);


--
-- Name: listing_shareable_links listing_shareable_links_share_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_shareable_links
    ADD CONSTRAINT listing_shareable_links_share_id_unique UNIQUE (share_id);


--
-- Name: listing_visual_analysis listing_visual_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_visual_analysis
    ADD CONSTRAINT listing_visual_analysis_pkey PRIMARY KEY (id);


--
-- Name: llm_decisions llm_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_decisions
    ADD CONSTRAINT llm_decisions_pkey PRIMARY KEY (id);


--
-- Name: nlp_search_logs nlp_search_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nlp_search_logs
    ADD CONSTRAINT nlp_search_logs_pkey PRIMARY KEY (id);


--
-- Name: profile_chat_links profile_chat_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_chat_links
    ADD CONSTRAINT profile_chat_links_pkey PRIMARY KEY (id);


--
-- Name: profile_chat_links profile_chat_links_share_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_chat_links
    ADD CONSTRAINT profile_chat_links_share_id_key UNIQUE (share_id);


--
-- Name: profile_insights_lock profile_insights_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_insights_lock
    ADD CONSTRAINT profile_insights_lock_pkey PRIMARY KEY (id);


--
-- Name: profile_persona profile_persona_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_persona
    ADD CONSTRAINT profile_persona_pkey PRIMARY KEY (id);


--
-- Name: profile_shareable_links profile_shareable_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_shareable_links
    ADD CONSTRAINT profile_shareable_links_pkey PRIMARY KEY (id);


--
-- Name: profile_shareable_links profile_shareable_links_share_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_shareable_links
    ADD CONSTRAINT profile_shareable_links_share_id_unique UNIQUE (share_id);


--
-- Name: profile_tags profile_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_tags
    ADD CONSTRAINT profile_tags_pkey PRIMARY KEY (id);


--
-- Name: property_analysis_cache property_analysis_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_analysis_cache
    ADD CONSTRAINT property_analysis_cache_pkey PRIMARY KEY (id);


--
-- Name: property_images property_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_pkey PRIMARY KEY (id);


--
-- Name: property_insights property_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_insights
    ADD CONSTRAINT property_insights_pkey PRIMARY KEY (id);


--
-- Name: property_interactions property_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interactions
    ADD CONSTRAINT property_interactions_pkey PRIMARY KEY (id);


--
-- Name: property_notes property_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_notes
    ADD CONSTRAINT property_notes_pkey PRIMARY KEY (id);


--
-- Name: repliers_listings repliers_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repliers_listings
    ADD CONSTRAINT repliers_listings_pkey PRIMARY KEY (id);


--
-- Name: search_outcomes search_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_outcomes
    ADD CONSTRAINT search_outcomes_pkey PRIMARY KEY (id);


--
-- Name: search_transaction_results search_transaction_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transaction_results
    ADD CONSTRAINT search_transaction_results_pkey PRIMARY KEY (id);


--
-- Name: search_transactions search_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transactions
    ADD CONSTRAINT search_transactions_pkey PRIMARY KEY (id);


--
-- Name: search_transactions search_transactions_transaction_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transactions
    ADD CONSTRAINT search_transactions_transaction_id_unique UNIQUE (transaction_id);


--
-- Name: property_analysis_cache unique_listing_profile; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_analysis_cache
    ADD CONSTRAINT unique_listing_profile UNIQUE (listing_id, profile_id);


--
-- Name: property_insights unique_property_insights; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_insights
    ADD CONSTRAINT unique_property_insights UNIQUE (property_id);


--
-- Name: idx_agno_sessions_created_at; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_agno_sessions_created_at ON ai.agno_sessions USING btree (created_at);


--
-- Name: idx_agno_sessions_session_type; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_agno_sessions_session_type ON ai.agno_sessions USING btree (session_type);


--
-- Name: idx_agent_scoring_rules_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_scoring_rules_agent ON public.agent_scoring_rules USING btree (agent_id, is_active, created_at DESC);


--
-- Name: idx_agent_scoring_rules_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_scoring_rules_name ON public.agent_scoring_rules USING btree (rule_name);


--
-- Name: idx_buyer_profiles_bedrooms; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buyer_profiles_bedrooms ON public.buyer_profiles USING btree (bedrooms, max_bedrooms) WHERE ((bedrooms IS NOT NULL) OR (max_bedrooms IS NOT NULL));


--
-- Name: idx_config_audit_log_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_audit_log_key ON public.config_audit_log USING btree (config_key);


--
-- Name: idx_config_audit_log_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_audit_log_updated ON public.config_audit_log USING btree (updated_at);


--
-- Name: idx_config_values_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_values_key ON public.config_values USING btree (key);


--
-- Name: idx_ingestion_jobs_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingestion_jobs_agent ON public.ingestion_jobs USING btree (agent_id, created_at DESC);


--
-- Name: idx_ingestion_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingestion_jobs_status ON public.ingestion_jobs USING btree (status, created_at DESC);


--
-- Name: idx_ingestion_jobs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingestion_jobs_type ON public.ingestion_jobs USING btree (job_type, status);


--
-- Name: idx_llm_decisions_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_decisions_agent ON public.llm_decisions USING btree (agent_name, decision_type);


--
-- Name: idx_llm_decisions_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_decisions_session ON public.llm_decisions USING btree (session_id);


--
-- Name: idx_property_analysis_cache_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_analysis_cache_created ON public.property_analysis_cache USING btree (created_at);


--
-- Name: idx_property_analysis_cache_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_analysis_cache_lookup ON public.property_analysis_cache USING btree (listing_id, profile_id, created_at DESC);


--
-- Name: idx_property_images_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_images_agent ON public.property_images USING btree (agent_id, created_at DESC);


--
-- Name: idx_property_images_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_images_property ON public.property_images USING btree (property_id, image_order);


--
-- Name: idx_property_images_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_property_images_unique ON public.property_images USING btree (property_id, image_url);


--
-- Name: idx_property_insights_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_insights_agent ON public.property_insights USING btree (agent_id, created_at DESC);


--
-- Name: idx_property_insights_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_insights_property ON public.property_insights USING btree (property_id);


--
-- Name: idx_property_insights_rental; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_insights_rental ON public.property_insights USING btree (estimated_rental DESC) WHERE (estimated_rental IS NOT NULL);


--
-- Name: idx_repliers_listings_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repliers_listings_agent ON public.repliers_listings USING btree (agent_id, status, created_at DESC);


--
-- Name: idx_repliers_listings_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repliers_listings_profile ON public.repliers_listings USING btree (profile_id, created_at DESC);


--
-- Name: idx_strategy_scores_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strategy_scores_property ON public.investment_strategy_scores USING btree (property_id, strategy_id);


--
-- Name: idx_strategy_scores_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strategy_scores_session ON public.investment_strategy_scores USING btree (session_id);


--
-- Name: agent_action_feedback agent_action_feedback_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_feedback
    ADD CONSTRAINT agent_action_feedback_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: agent_insight_feedback agent_insight_feedback_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_insight_feedback
    ADD CONSTRAINT agent_insight_feedback_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: agent_interactions agent_interactions_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_interactions
    ADD CONSTRAINT agent_interactions_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id);


--
-- Name: agent_interactions agent_interactions_transaction_id_search_transactions_transacti; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_interactions
    ADD CONSTRAINT agent_interactions_transaction_id_search_transactions_transacti FOREIGN KEY (transaction_id) REFERENCES public.search_transactions(transaction_id) ON DELETE CASCADE;


--
-- Name: agent_notes agent_notes_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_notes
    ADD CONSTRAINT agent_notes_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: agent_scoring_rules agent_scoring_rules_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_scoring_rules
    ADD CONSTRAINT agent_scoring_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: buyer_profiles buyer_profiles_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_profiles
    ADD CONSTRAINT buyer_profiles_agent_id_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: cached_search_results cached_search_results_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cached_search_results
    ADD CONSTRAINT cached_search_results_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: chat_agent_insights chat_agent_insights_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_agent_insights
    ADD CONSTRAINT chat_agent_insights_agent_id_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: chat_agent_insights chat_agent_insights_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_agent_insights
    ADD CONSTRAINT chat_agent_insights_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: chat_agent_insights chat_agent_insights_session_id_chat_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_agent_insights
    ADD CONSTRAINT chat_agent_insights_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_session_id_chat_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_search_context chat_search_context_search_transaction_id_search_transactions_t; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_search_context
    ADD CONSTRAINT chat_search_context_search_transaction_id_search_transactions_t FOREIGN KEY (search_transaction_id) REFERENCES public.search_transactions(transaction_id) ON DELETE CASCADE;


--
-- Name: chat_search_context chat_search_context_session_id_chat_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_search_context
    ADD CONSTRAINT chat_search_context_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_sessions chat_sessions_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_agent_id_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: chat_sessions chat_sessions_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: property_images fk_property_images_listing; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT fk_property_images_listing FOREIGN KEY (property_id) REFERENCES public.repliers_listings(id) ON DELETE CASCADE;


--
-- Name: property_insights fk_property_insights_listing; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_insights
    ADD CONSTRAINT fk_property_insights_listing FOREIGN KEY (property_id) REFERENCES public.repliers_listings(id) ON DELETE CASCADE;


--
-- Name: ingestion_jobs ingestion_jobs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: ingestion_jobs ingestion_jobs_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id);


--
-- Name: investment_strategies investment_strategies_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_strategies
    ADD CONSTRAINT investment_strategies_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: listing_shareable_links listing_shareable_links_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_shareable_links
    ADD CONSTRAINT listing_shareable_links_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id);


--
-- Name: llm_decisions llm_decisions_parent_decision_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_decisions
    ADD CONSTRAINT llm_decisions_parent_decision_id_fk FOREIGN KEY (parent_decision_id) REFERENCES public.llm_decisions(id);


--
-- Name: nlp_search_logs nlp_search_logs_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nlp_search_logs
    ADD CONSTRAINT nlp_search_logs_agent_id_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: nlp_search_logs nlp_search_logs_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nlp_search_logs
    ADD CONSTRAINT nlp_search_logs_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: profile_chat_links profile_chat_links_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_chat_links
    ADD CONSTRAINT profile_chat_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: profile_insights_lock profile_insights_lock_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_insights_lock
    ADD CONSTRAINT profile_insights_lock_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: profile_persona profile_persona_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_persona
    ADD CONSTRAINT profile_persona_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: profile_shareable_links profile_shareable_links_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_shareable_links
    ADD CONSTRAINT profile_shareable_links_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id);


--
-- Name: profile_tags profile_tags_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_tags
    ADD CONSTRAINT profile_tags_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: property_analysis_cache property_analysis_cache_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_analysis_cache
    ADD CONSTRAINT property_analysis_cache_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id) ON DELETE CASCADE;


--
-- Name: property_images property_images_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: property_insights property_insights_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_insights
    ADD CONSTRAINT property_insights_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: property_interactions property_interactions_session_id_chat_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interactions
    ADD CONSTRAINT property_interactions_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: property_notes property_notes_session_id_chat_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_notes
    ADD CONSTRAINT property_notes_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: repliers_listings repliers_listings_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repliers_listings
    ADD CONSTRAINT repliers_listings_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: repliers_listings repliers_listings_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repliers_listings
    ADD CONSTRAINT repliers_listings_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id);


--
-- Name: search_outcomes search_outcomes_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_outcomes
    ADD CONSTRAINT search_outcomes_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id);


--
-- Name: search_outcomes search_outcomes_transaction_id_search_transactions_transaction_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_outcomes
    ADD CONSTRAINT search_outcomes_transaction_id_search_transactions_transaction_ FOREIGN KEY (transaction_id) REFERENCES public.search_transactions(transaction_id) ON DELETE CASCADE;


--
-- Name: search_transaction_results search_transaction_results_transaction_id_search_transactions_t; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transaction_results
    ADD CONSTRAINT search_transaction_results_transaction_id_search_transactions_t FOREIGN KEY (transaction_id) REFERENCES public.search_transactions(transaction_id) ON DELETE CASCADE;


--
-- Name: search_transactions search_transactions_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transactions
    ADD CONSTRAINT search_transactions_agent_id_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: search_transactions search_transactions_profile_id_buyer_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_transactions
    ADD CONSTRAINT search_transactions_profile_id_buyer_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.buyer_profiles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict J7XITiaEmEiMAVnaiHYGaSKvZeUYX3pFKVbcSypgGF4UhBjLJGJEySpxQAg9WHU

