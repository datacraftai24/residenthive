-- ===============================================
-- REAL ESTATE AI PLATFORM - COMPLETE DATABASE SCHEMA
-- ===============================================
-- Generated: July 20, 2025
-- Architecture: PostgreSQL 16.9 with Drizzle ORM
-- Integration: Shared database for main platform and chat service
-- ===============================================

-- ===============================================
-- CORE PLATFORM TABLES
-- ===============================================

-- Real estate agents - authentication and profile management
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,                        -- bcrypt hashed password
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    brokerage_name TEXT NOT NULL,
    invite_token TEXT UNIQUE,                  -- for secure agent onboarding
    is_activated BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL
);

-- Buyer profiles - comprehensive client data with AI analysis
CREATE TABLE buyer_profiles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    location TEXT NOT NULL,
    
    -- Budget and Requirements
    budget TEXT NOT NULL,
    budget_min INTEGER,
    budget_max INTEGER,
    home_type TEXT NOT NULL,
    bedrooms INTEGER NOT NULL,
    bathrooms TEXT NOT NULL,
    
    -- Features and Preferences (JSON arrays)
    must_have_features JSON NOT NULL DEFAULT '[]',
    dealbreakers JSON NOT NULL DEFAULT '[]',
    preferred_areas JSON NOT NULL DEFAULT '[]',
    lifestyle_drivers JSON NOT NULL DEFAULT '[]',
    special_needs JSON NOT NULL DEFAULT '[]',
    
    -- Flexibility Scores (0-100)
    budget_flexibility INTEGER NOT NULL DEFAULT 50,
    location_flexibility INTEGER NOT NULL DEFAULT 50,
    timing_flexibility INTEGER NOT NULL DEFAULT 50,
    
    -- AI Analysis Context
    emotional_context TEXT,
    voice_transcript TEXT,
    inferred_tags JSON NOT NULL DEFAULT '[]',
    emotional_tone TEXT,
    priority_score INTEGER NOT NULL DEFAULT 50,
    
    -- Meta Information
    raw_input TEXT NOT NULL,
    input_method TEXT NOT NULL DEFAULT 'form',  -- 'form', 'voice', 'text'
    nlp_confidence INTEGER DEFAULT 100,         -- 0-100 AI confidence
    version INTEGER NOT NULL DEFAULT 1,         -- profile versioning
    parent_profile_id INTEGER,                  -- for profile evolution
    created_at TEXT NOT NULL
);

-- AI-generated behavioral tags for buyer profiles
CREATE TABLE profile_tags (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    category TEXT NOT NULL,                     -- 'behavioral', 'demographic', 'preference', 'urgency'
    confidence INTEGER NOT NULL,                -- 0-100 AI confidence
    source TEXT NOT NULL,                       -- 'ai_inference', 'form_data', 'manual'
    created_at TEXT NOT NULL
);

-- Deep persona analysis for buyer profiles
CREATE TABLE profile_persona (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    emotional_tone TEXT,                        -- 'excited', 'cautious', 'urgent', 'analytical'
    communication_style TEXT,                   -- 'direct', 'collaborative', 'detail-oriented'
    decision_making_style TEXT,                 -- 'quick', 'research-heavy', 'committee-based'
    urgency_level INTEGER NOT NULL DEFAULT 50, -- 0-100 urgency score
    price_orientation TEXT,                     -- 'value-conscious', 'premium-focused', 'budget-driven'
    personality_traits JSON NOT NULL DEFAULT '[]',
    confidence_score INTEGER NOT NULL,          -- overall persona confidence
    created_at TEXT NOT NULL
);

-- Real estate listings cached from Repliers API
CREATE TABLE repliers_listings (
    id TEXT PRIMARY KEY,                        -- Repliers listing ID
    address TEXT NOT NULL,
    price INTEGER NOT NULL,
    bedrooms INTEGER NOT NULL DEFAULT 0,
    bathrooms NUMERIC(3,1) NOT NULL DEFAULT '0',
    square_feet INTEGER,
    property_type TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT,
    description TEXT,
    features TEXT,                              -- JSON string of features array
    images TEXT,                                -- JSON string of images array
    listing_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    mls_number TEXT,
    lot_size NUMERIC(10,2),
    year_built INTEGER,
    garage_spaces INTEGER,
    created_at TEXT NOT NULL DEFAULT 'now()'
);

-- ===============================================
-- SEARCH AND ANALYTICS TABLES
-- ===============================================

-- Search transaction logging for ML and analytics
CREATE TABLE search_transactions (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,       -- UUID for this search
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id),
    session_id TEXT,                           -- grouping related searches
    
    -- Search Context
    profile_snapshot JSON NOT NULL,            -- complete profile at search time
    search_parameters JSON NOT NULL,           -- all search params used
    search_method TEXT NOT NULL,               -- 'enhanced', 'basic', 'hybrid'
    search_trigger TEXT NOT NULL,              -- 'agent_initiated', 'profile_update'
    
    -- Results Metrics
    raw_listings_count INTEGER NOT NULL,       -- total from API
    scored_listings_count INTEGER NOT NULL,    -- after AI scoring
    top_picks_count INTEGER NOT NULL,
    other_matches_count INTEGER NOT NULL,
    no_image_count INTEGER NOT NULL,
    visual_analysis_count INTEGER NOT NULL,
    
    -- Performance Metrics
    total_execution_time INTEGER NOT NULL,     -- milliseconds
    api_calls_count INTEGER NOT NULL,
    visual_analysis_time INTEGER,              -- milliseconds for visual processing
    
    -- Quality Metrics
    average_score NUMERIC(5,2),
    score_distribution JSON,                   -- {"70+": 16, "55-70": 34}
    dealbreaker_properties_count INTEGER NOT NULL DEFAULT 0,
    
    created_at TEXT NOT NULL
);

-- Detailed search results for each transaction
CREATE TABLE search_transaction_results (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES search_transactions(transaction_id) ON DELETE CASCADE,
    
    -- Results Data
    top_results JSON NOT NULL,                 -- top 20 properties for learning
    top_picks_data JSON NOT NULL,              -- complete top picks with scores
    other_matches_data JSON NOT NULL,          -- other matches data
    visual_analysis_data JSON,                 -- visual intelligence results
    search_summary JSON NOT NULL,              -- complete search summary
    chat_blocks JSON,                          -- generated chat blocks
    
    created_at TEXT NOT NULL
);

-- Agent interactions during search sessions
CREATE TABLE agent_interactions (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES search_transactions(transaction_id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id),
    
    -- Interaction Details
    interaction_type TEXT NOT NULL,            -- 'property_clicked', 'score_adjusted', 'message_edited'
    listing_id TEXT,                           -- if property-specific
    interaction_data JSON NOT NULL,            -- specific data for interaction type
    session_duration INTEGER,                  -- seconds from search start
    agent_confidence INTEGER,                  -- 1-100 if agent provides rating
    
    created_at TEXT NOT NULL
);

-- Search outcome tracking
CREATE TABLE search_outcomes (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES search_transactions(transaction_id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id),
    
    -- Immediate Outcomes
    properties_clicked JSON,                   -- listing IDs clicked by agent
    properties_saved JSON,                     -- listing IDs saved
    properties_shared JSON,                    -- listing IDs shared with client
    
    -- Agent Feedback
    agent_satisfaction_rating INTEGER,         -- 1-10 scale
    search_quality_rating INTEGER,             -- 1-10 scale
    agent_notes TEXT,                          -- free-form agent comments
    
    -- Follow-up Actions
    search_refinement_needed BOOLEAN NOT NULL DEFAULT false,
    client_meeting_scheduled BOOLEAN NOT NULL DEFAULT false,
    
    -- Session Metrics
    total_session_time INTEGER,                -- total time agent spent
    most_viewed_listings JSON,                 -- [{listing_id, time_spent}]
    
    created_at TEXT NOT NULL,
    updated_at TEXT                            -- for follow-up updates
);

-- ===============================================
-- VISUAL INTELLIGENCE TABLES
-- ===============================================

-- AI-powered visual analysis of property images
CREATE TABLE listing_visual_analysis (
    id SERIAL PRIMARY KEY,
    listing_id TEXT NOT NULL,                  -- Repliers listing ID
    image_url TEXT NOT NULL,
    image_type TEXT NOT NULL,                  -- kitchen, living_room, bathroom, exterior
    visual_tags TEXT NOT NULL,                 -- JSON: ["modern_kitchen", "quartz_countertops"]
    summary TEXT NOT NULL,                     -- AI-generated description
    flags TEXT NOT NULL,                       -- JSON: ["cluttered", "dated_finishes"]
    confidence INTEGER NOT NULL DEFAULT 85,    -- 0-100 confidence in analysis
    analyzed_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- ===============================================
-- SHARING AND COLLABORATION TABLES
-- ===============================================

-- Individual listing shareable links (legacy)
CREATE TABLE listing_shareable_links (
    id SERIAL PRIMARY KEY,
    listing_id TEXT NOT NULL,
    share_id TEXT NOT NULL UNIQUE,             -- UUID for shareable URL
    profile_id INTEGER REFERENCES buyer_profiles(id),
    agent_name TEXT,
    agent_email TEXT,
    custom_message TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    last_viewed TEXT,
    expires_at TEXT,                           -- optional expiration
    created_at TEXT NOT NULL
);

-- Comprehensive client dashboard links (Zillow-like)
CREATE TABLE profile_shareable_links (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id),
    share_id TEXT NOT NULL UNIQUE,             -- UUID for shareable URL
    agent_name TEXT,
    agent_email TEXT,
    agent_phone TEXT,
    custom_message TEXT,
    branding_colors TEXT,                      -- JSON for custom colors
    show_visual_analysis BOOLEAN NOT NULL DEFAULT true,
    view_count INTEGER NOT NULL DEFAULT 0,
    last_viewed TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- ===============================================
-- AGENT FEEDBACK AND NOTES TABLES
-- ===============================================

-- Agent feedback on AI insights
CREATE TABLE agent_insight_feedback (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    tag_name TEXT,                             -- for tag disagreements
    persona_field TEXT,                        -- for persona disagreements
    feedback_type TEXT NOT NULL,               -- 'disagree_tag', 'disagree_persona'
    created_at TEXT NOT NULL
);

-- Agent action feedback
CREATE TABLE agent_action_feedback (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,                   -- from action suggestions
    action_taken TEXT NOT NULL,                -- what agent actually did
    created_at TEXT NOT NULL
);

-- Agent notes on profiles
CREATE TABLE agent_notes (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Profile insights lock mechanism
CREATE TABLE profile_insights_lock (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    is_locked INTEGER NOT NULL DEFAULT 0,      -- 0 = unlocked, 1 = locked
    created_at TEXT NOT NULL
);

-- ===============================================
-- CHAT SERVICE TABLES - Multi-Agent AI System
-- ===============================================

-- Chat sessions - tracks each client's conversation journey
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,                        -- UUID string
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    session_start TEXT NOT NULL,
    last_activity TEXT NOT NULL,
    total_questions INTEGER NOT NULL DEFAULT 0,
    engagement_score NUMERIC(3,1) NOT NULL DEFAULT 0.0, -- 0-10 scale
    return_visits INTEGER NOT NULL DEFAULT 0,
    decision_stage TEXT NOT NULL DEFAULT 'browsing', -- browsing/comparing/deciding/ready
    status TEXT NOT NULL DEFAULT 'active',      -- active/paused/completed
    created_at TEXT NOT NULL
);

-- Conversation analytics - every chat interaction tracked with AI analysis
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,                        -- UUID string
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,                      -- client's message
    ai_response TEXT,                           -- AI bot's response
    timestamp TEXT NOT NULL,
    question_category TEXT,                     -- location/pricing/features/logistics/general
    sentiment_score NUMERIC(3,2),               -- -1.00 to 1.00 (negative to positive)
    property_mentioned TEXT,                    -- listing ID that was discussed
    intent_classification TEXT,                 -- browsing/comparing/deciding/scheduling
    agent_path TEXT,                           -- which AI agents processed (e.g., "1->2->3")
    search_transaction_id TEXT,                 -- links to searchTransactions for context
    created_at TEXT NOT NULL
);

-- Property notes - client's personal notes on properties during chat
CREATE TABLE property_notes (
    id TEXT PRIMARY KEY,                        -- UUID string
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL,                   -- property ID from Repliers API
    note_text TEXT NOT NULL,                    -- client's note content
    note_type TEXT NOT NULL DEFAULT 'personal', -- personal/agent/showing/reminder
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Property interactions - likes, dislikes, favorites during chat
CREATE TABLE property_interactions (
    id TEXT PRIMARY KEY,                        -- UUID string
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL,                   -- property ID from Repliers API
    interaction_type TEXT NOT NULL,             -- like/dislike/favorite/viewed/shared/saved
    rating INTEGER,                             -- 1-5 stars for likes
    reason TEXT,                               -- why they liked/disliked
    emotional_response TEXT,                    -- excited/concerned/interested/disappointed
    created_at TEXT NOT NULL
);

-- AI-generated insights for real estate agents from chat analysis
CREATE TABLE chat_agent_insights (
    id TEXT PRIMARY KEY,                        -- UUID string
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL,                 -- hot_lead/follow_up_needed/ready_to_view/budget_adjustment
    insight_message TEXT NOT NULL,              -- human-readable insight for agent
    confidence_score NUMERIC(3,2) NOT NULL,     -- 0.00-1.00 AI confidence
    priority TEXT NOT NULL DEFAULT 'medium',    -- low/medium/high/urgent
    action_suggested TEXT,                      -- specific action recommended
    status TEXT NOT NULL DEFAULT 'new',         -- new/acknowledged/acted_upon/dismissed
    generated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Chat conversation context - links chat to search results for seamless experience
CREATE TABLE chat_search_context (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    search_transaction_id TEXT NOT NULL REFERENCES search_transactions(transaction_id) ON DELETE CASCADE,
    context_type TEXT NOT NULL,                 -- initial_search/refined_search/follow_up_search
    is_active BOOLEAN NOT NULL DEFAULT true,    -- current search context
    created_at TEXT NOT NULL
);

-- ===============================================
-- PERFORMANCE OPTIMIZATION TABLES
-- ===============================================

-- Cached search results for performance optimization
CREATE TABLE cached_search_results (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
    
    -- Cache Key
    profile_fingerprint TEXT NOT NULL,         -- hash of relevant profile fields
    search_method TEXT NOT NULL,               -- 'enhanced', 'basic', 'hybrid'
    
    -- Cached Results Data
    top_picks JSON NOT NULL,                   -- complete top picks array
    other_matches JSON NOT NULL,               -- complete other matches array
    properties_without_images JSON NOT NULL DEFAULT '[]',
    chat_blocks JSON NOT NULL DEFAULT '[]',
    search_summary JSON NOT NULL,              -- summary stats
    
    -- Cache Metadata
    total_listings_processed INTEGER NOT NULL,
    visual_analysis_count INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER NOT NULL,
    
    -- Cache Management
    cache_version INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT NOT NULL,                  -- when cache expires
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL
);

-- ===============================================
-- DATABASE INDEXES FOR PERFORMANCE
-- ===============================================

-- Core performance indexes
CREATE INDEX idx_buyer_profiles_email ON buyer_profiles(email);
CREATE INDEX idx_buyer_profiles_created ON buyer_profiles(created_at DESC);

-- Search transaction indexes
CREATE INDEX idx_search_transactions_profile ON search_transactions(profile_id);
CREATE INDEX idx_search_transactions_created ON search_transactions(created_at DESC);
CREATE INDEX idx_search_transaction_results_txn ON search_transaction_results(transaction_id);

-- Chat service indexes
CREATE INDEX idx_chat_sessions_profile ON chat_sessions(profile_id);
CREATE INDEX idx_chat_sessions_agent ON chat_sessions(agent_id);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX idx_property_interactions_session ON property_interactions(session_id);
CREATE INDEX idx_property_notes_session_property ON property_notes(session_id, listing_id);
CREATE INDEX idx_chat_agent_insights_status ON chat_agent_insights(status, generated_at DESC);

-- Agent and authentication indexes
CREATE INDEX idx_agents_email ON agents(email);
CREATE INDEX idx_agents_invite_token ON agents(invite_token);

-- Property and listing indexes
CREATE INDEX idx_repliers_listings_city ON repliers_listings(city);
CREATE INDEX idx_repliers_listings_price ON repliers_listings(price);
CREATE INDEX idx_repliers_listings_bedrooms ON repliers_listings(bedrooms);

-- ===============================================
-- KEY FEATURES & ARCHITECTURE NOTES
-- ===============================================
--
-- SHARED DATABASE ARCHITECTURE:
-- - Single PostgreSQL database shared between main platform and chat service
-- - Foreign key relationships ensure data integrity across services
-- - UUID-based primary keys for distributed system compatibility
-- - JSON columns for flexible schema evolution
--
-- MULTI-AGENT AI SYSTEM SUPPORT:
-- - Agent routing tracking in chat_messages.agent_path
-- - Sentiment analysis and intent classification
-- - Property interaction tracking with emotional responses
-- - AI-generated insights with confidence scoring
--
-- REAL ESTATE DATA INTEGRATION:
-- - Authentic MLS data from Repliers API
-- - Visual intelligence analysis with OpenAI GPT-4o Vision
-- - Property scoring and matching algorithms
-- - Comprehensive search transaction logging
--
-- AGENT COLLABORATION FEATURES:
-- - Shared agent authentication across services
-- - Profile shareable links for client communication
-- - Agent feedback and insight systems
-- - Performance analytics and lead qualification
--
-- SCALABILITY & PERFORMANCE:
-- - Connection pooling via Neon serverless PostgreSQL
-- - Intelligent caching with expiration management
-- - Proper indexing for read-heavy analytics workloads
-- - JSON columns for complex data structures
--
-- PRIVACY & COMPLIANCE:
-- - Secure bcrypt password hashing
-- - Token-based agent authentication
-- - Cascade deletes for data cleanup
-- - Session-based tracking for analytics
--
-- ===============================================

-- Sample data queries for chat service integration:

-- Get buyer profile with recent search history
-- SELECT bp.*, st.transaction_id, st.search_method, st.created_at as search_date
-- FROM buyer_profiles bp
-- LEFT JOIN search_transactions st ON bp.id = st.profile_id
-- WHERE bp.id = $1
-- ORDER BY st.created_at DESC LIMIT 5;

-- Get property details with visual analysis
-- SELECT rl.*, lva.visual_tags, lva.summary, lva.flags
-- FROM repliers_listings rl
-- LEFT JOIN listing_visual_analysis lva ON rl.id = lva.listing_id
-- WHERE rl.id = $1;

-- Get active chat session with context
-- SELECT cs.*, csc.search_transaction_id, bp.name, bp.budget, bp.location
-- FROM chat_sessions cs
-- JOIN buyer_profiles bp ON cs.profile_id = bp.id
-- LEFT JOIN chat_search_context csc ON cs.id = csc.session_id AND csc.is_active = true
-- WHERE cs.id = $1;