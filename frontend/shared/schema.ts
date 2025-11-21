import { pgTable, text, serial, integer, json, numeric, boolean, timestamp, bigint, uuid, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Agent schema for agent management
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  brokerageName: text("brokerage_name").notNull(),
  inviteToken: text("invite_token").unique(),
  isActivated: boolean("is_activated").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const buyerProfiles = pgTable("buyer_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  location: text("location").notNull(),
  agentId: integer("agent_id").references(() => agents.id),
  
  // Buyer Type - flexible for future buyer types
  buyerType: text("buyer_type").notNull().default("traditional"), // traditional, investor, first_time, luxury, etc.
  
  // Basic Requirements
  budget: text("budget").notNull(),
  budgetMin: integer("budget_min"),
  budgetMax: integer("budget_max"),
  homeType: text("home_type").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: text("bathrooms").notNull(),
  
  // Investment-specific fields (null for non-investor buyer types)
  investorType: text("investor_type"), // rental_income, flip, house_hack, multi_unit
  investmentCapital: integer("investment_capital"), // Available cash for down payment
  targetMonthlyReturn: integer("target_monthly_return"), // Target cash flow per month
  targetCapRate: numeric("target_cap_rate", { precision: 5, scale: 2 }), // Target cap rate percentage
  investmentStrategy: text("investment_strategy"), // Free text for detailed strategy
  
  // Features & Preferences
  mustHaveFeatures: json("must_have_features").$type<string[]>().notNull().default([]),
  dealbreakers: json("dealbreakers").$type<string[]>().notNull().default([]),
  preferredAreas: json("preferred_areas").$type<string[]>().notNull().default([]),
  lifestyleDrivers: json("lifestyle_drivers").$type<string[]>().notNull().default([]),
  specialNeeds: json("special_needs").$type<string[]>().notNull().default([]),
  
  // Flexibility Scores (0-100)
  budgetFlexibility: integer("budget_flexibility").notNull().default(50),
  locationFlexibility: integer("location_flexibility").notNull().default(50),
  timingFlexibility: integer("timing_flexibility").notNull().default(50),
  
  // Context & AI Analysis
  emotionalContext: text("emotional_context"),
  voiceTranscript: text("voice_transcript"),
  inferredTags: json("inferred_tags").$type<string[]>().notNull().default([]),
  emotionalTone: text("emotional_tone"),
  priorityScore: integer("priority_score").notNull().default(50),
  
  // Meta & Versioning
  rawInput: text("raw_input").notNull(),
  inputMethod: text("input_method").notNull().default("form"), // 'form', 'voice', 'text'
  nlpConfidence: integer("nlp_confidence").default(100), // 0-100 confidence score
  version: integer("version").notNull().default(1),
  parentProfileId: integer("parent_profile_id"),
  createdAt: text("created_at").notNull()
});

// New table for AI-generated tags (Tag Engine)
export const profileTags = pgTable("profile_tags", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  category: text("category").notNull(), // 'behavioral', 'demographic', 'preference', 'urgency'
  confidence: integer("confidence").notNull(), // 0-100
  source: text("source").notNull(), // 'ai_inference', 'form_data', 'manual'
  createdAt: text("created_at").notNull()
});

// New table for persona analysis
export const profilePersona = pgTable("profile_persona", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  emotionalTone: text("emotional_tone"), // 'excited', 'cautious', 'urgent', 'analytical'
  communicationStyle: text("communication_style"), // 'direct', 'collaborative', 'detail-oriented'
  decisionMakingStyle: text("decision_making_style"), // 'quick', 'research-heavy', 'committee-based'
  urgencyLevel: integer("urgency_level").notNull().default(50), // 0-100
  priceOrientation: text("price_orientation"), // 'value-conscious', 'premium-focused', 'budget-driven'
  personalityTraits: json("personality_traits").$type<string[]>().notNull().default([]),
  confidenceScore: integer("confidence_score").notNull(), // Overall confidence in persona analysis
  createdAt: text("created_at").notNull()
});

// Agent feedback tables
export const agentInsightFeedback = pgTable("agent_insight_feedback", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  tagName: text("tag_name"), // For tag disagreements
  personaField: text("persona_field"), // For persona disagreements (e.g., 'urgencyLevel', 'communicationStyle')
  feedbackType: text("feedback_type").notNull(), // 'disagree_tag', 'disagree_persona'
  createdAt: text("created_at").notNull()
});

export const agentActionFeedback = pgTable("agent_action_feedback", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  actionId: text("action_id").notNull(), // From the action suggestions
  actionTaken: text("action_taken").notNull(), // What the agent actually did
  createdAt: text("created_at").notNull()
});

export const agentNotes = pgTable("agent_notes", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull()
});

export const profileInsightsLock = pgTable("profile_insights_lock", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  isLocked: integer("is_locked").notNull().default(0), // 0 = unlocked, 1 = locked
  createdAt: text("created_at").notNull()
});

// Visual Intelligence Tables
export const listingVisualAnalysis = pgTable("listing_visual_analysis", {
  id: serial("id").primaryKey(),
  listingId: text("listing_id").notNull(), // Repliers listing ID
  imageUrl: text("image_url").notNull(),
  imageType: text("image_type").notNull(), // kitchen, living_room, bathroom, exterior, etc.
  visualTags: text("visual_tags").notNull(), // JSON array as text: ["modern_kitchen", "quartz_countertops"]
  summary: text("summary").notNull(), // AI-generated 1-sentence description
  flags: text("flags").notNull(), // JSON array as text: ["cluttered", "dated_finishes"]
  confidence: integer("confidence").notNull().default(85), // 0-100 confidence in analysis
  analyzedAt: text("analyzed_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const listingShareableLinks = pgTable("listing_shareable_links", {
  id: serial("id").primaryKey(),
  listingId: text("listing_id").notNull(),
  shareId: text("share_id").notNull().unique(), // UUID for shareable URL
  profileId: integer("profile_id").references(() => buyerProfiles.id),
  agentName: text("agent_name"),
  agentEmail: text("agent_email"),
  customMessage: text("custom_message"),
  viewCount: integer("view_count").notNull().default(0),
  lastViewed: text("last_viewed"),
  expiresAt: text("expires_at"), // optional expiration
  createdAt: text("created_at").notNull(),
});

// Profile Shareable Links - One comprehensive link per client (like Zillow)
export const profileShareableLinks = pgTable("profile_shareable_links", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id),
  shareId: text("share_id").notNull().unique(), // UUID for shareable URL
  agentName: text("agent_name"),
  agentEmail: text("agent_email"),
  agentPhone: text("agent_phone"),
  customMessage: text("custom_message"),
  brandingColors: text("branding_colors"), // JSON for custom colors
  showVisualAnalysis: boolean("show_visual_analysis").notNull().default(true),
  viewCount: integer("view_count").notNull().default(0),
  lastViewed: text("last_viewed"),
  expiresAt: text("expires_at"), // optional expiration
  createdAt: text("created_at").notNull(),
  isActive: boolean("is_active").notNull().default(true)
});

// Core Transaction Logging Tables - Phase 1 Implementation
// Cached search results table
export const cachedSearchResults = pgTable("cached_search_results", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  
  // Cache Key (profile fingerprint for invalidation)
  profileFingerprint: text("profile_fingerprint").notNull(), // Hash of relevant profile fields
  searchMethod: text("search_method").notNull(), // 'enhanced', 'basic', 'hybrid'
  
  // Cached Results Data
  topPicks: json("top_picks").notNull(), // Complete top picks array
  otherMatches: json("other_matches").notNull(), // Complete other matches array
  propertiesWithoutImages: json("properties_without_images").notNull().default([]),
  chatBlocks: json("chat_blocks").notNull().default([]),
  searchSummary: json("search_summary").notNull(), // Summary stats
  
  // Cache Metadata
  totalListingsProcessed: integer("total_listings_processed").notNull(),
  visualAnalysisCount: integer("visual_analysis_count").notNull().default(0),
  executionTimeMs: integer("execution_time_ms").notNull(),
  
  // Cache Management
  cacheVersion: integer("cache_version").notNull().default(1),
  expiresAt: text("expires_at").notNull(), // When cache expires
  createdAt: text("created_at").notNull(),
  lastAccessedAt: text("last_accessed_at").notNull()
});

export const searchTransactions = pgTable("search_transactions", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().unique(), // UUID for this search transaction
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id),
  agentId: integer("agent_id").references(() => agents.id),
  sessionId: text("session_id"), // For grouping related searches
  
  // Search Input Context
  profileSnapshot: json("profile_snapshot").notNull(), // Complete profile state at search time
  searchParameters: json("search_parameters").notNull(), // All search params used
  searchMethod: text("search_method").notNull(), // 'enhanced', 'basic', 'hybrid'
  searchTrigger: text("search_trigger").notNull(), // 'agent_initiated', 'profile_update', 'refinement'
  
  // Search Results Data
  rawListingsCount: integer("raw_listings_count").notNull(), // Total from API
  scoredListingsCount: integer("scored_listings_count").notNull(), // After AI scoring
  topPicksCount: integer("top_picks_count").notNull(),
  otherMatchesCount: integer("other_matches_count").notNull(),
  noImageCount: integer("no_image_count").notNull(),
  visualAnalysisCount: integer("visual_analysis_count").notNull(),
  
  // Execution Metrics
  totalExecutionTime: integer("total_execution_time").notNull(), // milliseconds
  apiCallsCount: integer("api_calls_count").notNull(),
  visualAnalysisTime: integer("visual_analysis_time"), // milliseconds for visual processing
  
  // Search Quality Metrics
  averageScore: numeric("average_score", { precision: 5, scale: 2 }),
  scoreDistribution: json("score_distribution"), // {"70+": 16, "55-70": 34, etc.}
  dealbreakerPropertiesCount: integer("dealbreaker_properties_count").notNull().default(0),
  
  createdAt: text("created_at").notNull()
});

export const searchTransactionResults = pgTable("search_transaction_results", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => searchTransactions.transactionId, { onDelete: "cascade" }),
  
  // Top Results (Top 20 properties for learning)
  topResults: json("top_results").notNull(), // Array of top scored listings with full data
  
  // Categorized Results Summary
  topPicksData: json("top_picks_data").notNull(), // Complete top picks with scores/reasoning
  otherMatchesData: json("other_matches_data").notNull(), // Other matches data
  
  // Visual Analysis Results
  visualAnalysisData: json("visual_analysis_data"), // Visual intelligence results for enhanced searches
  
  // Search Summary
  searchSummary: json("search_summary").notNull(), // Complete search summary object
  chatBlocks: json("chat_blocks"), // Generated chat blocks
  
  createdAt: text("created_at").notNull()
});

export const agentInteractions = pgTable("agent_interactions", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => searchTransactions.transactionId, { onDelete: "cascade" }),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id),
  
  // Agent Actions During Search Session
  interactionType: text("interaction_type").notNull(), // 'property_clicked', 'score_adjusted', 'message_edited', 'property_shared', 'search_refined'
  
  // Property-specific interactions
  listingId: text("listing_id"), // If interaction is property-specific
  
  // Interaction Data
  interactionData: json("interaction_data").notNull(), // Specific data for this interaction type
  
  // Context
  sessionDuration: integer("session_duration"), // seconds from search start
  agentConfidence: integer("agent_confidence"), // 1-100 if agent provides confidence rating
  
  createdAt: text("created_at").notNull()
});

export const searchOutcomes = pgTable("search_outcomes", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => searchTransactions.transactionId, { onDelete: "cascade" }),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id),
  
  // Immediate Outcomes
  propertiesClicked: json("properties_clicked"), // Array of listing IDs clicked by agent
  propertiesSaved: json("properties_saved"), // Array of listing IDs saved
  propertiesShared: json("properties_shared"), // Array of listing IDs shared with client
  
  // Agent Feedback
  agentSatisfactionRating: integer("agent_satisfaction_rating"), // 1-10 scale
  searchQualityRating: integer("search_quality_rating"), // 1-10 scale
  agentNotes: text("agent_notes"), // Free-form agent comments
  
  // Follow-up Actions
  searchRefinementNeeded: boolean("search_refinement_needed").notNull().default(false),
  clientMeetingScheduled: boolean("client_meeting_scheduled").notNull().default(false),
  
  // Session Metrics
  totalSessionTime: integer("total_session_time"), // Total time agent spent with results
  mostViewedListings: json("most_viewed_listings"), // Array of {listing_id, time_spent}
  
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at") // For follow-up outcome updates
});

export const insertBuyerProfileSchema = createInsertSchema(buyerProfiles).omit({
  id: true,
  createdAt: true
});

export const insertProfileTagSchema = createInsertSchema(profileTags).omit({
  id: true,
  createdAt: true
});

export const insertProfilePersonaSchema = createInsertSchema(profilePersona).omit({
  id: true,
  createdAt: true
});

export const insertAgentInsightFeedbackSchema = createInsertSchema(agentInsightFeedback).omit({
  id: true,
  createdAt: true
});

export const insertAgentActionFeedbackSchema = createInsertSchema(agentActionFeedback).omit({
  id: true,
  createdAt: true
});

export const insertAgentNotesSchema = createInsertSchema(agentNotes).omit({
  id: true,
  createdAt: true
});

export const insertProfileInsightsLockSchema = createInsertSchema(profileInsightsLock).omit({
  id: true,
  createdAt: true
});

export const insertListingVisualAnalysisSchema = createInsertSchema(listingVisualAnalysis).omit({
  id: true
});

export const insertListingShareableLinksSchema = createInsertSchema(listingShareableLinks).omit({
  id: true,
  viewCount: true,
  lastViewed: true
});

export const insertProfileShareableLinksSchema = createInsertSchema(profileShareableLinks).omit({
  id: true,
  viewCount: true,
  lastViewed: true,
  createdAt: true
});

// Transaction Logging Insert Schemas
export const insertSearchTransactionSchema = createInsertSchema(searchTransactions).omit({
  id: true,
  createdAt: true
});

export const insertSearchTransactionResultsSchema = createInsertSchema(searchTransactionResults).omit({
  id: true,
  createdAt: true
});

export const insertAgentInteractionSchema = createInsertSchema(agentInteractions).omit({
  id: true,
  createdAt: true
});

export const insertSearchOutcomeSchema = createInsertSchema(searchOutcomes).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertCachedSearchResultsSchema = createInsertSchema(cachedSearchResults).omit({
  id: true,
  createdAt: true,
  lastAccessedAt: true
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true
});

// Repliers Listings table for local testing data
export const repliersListings = pgTable("repliers_listings", {
  id: text("id").primaryKey(),
  address: text("address").notNull(),
  price: integer("price").notNull(),
  bedrooms: integer("bedrooms").notNull().default(0),
  bathrooms: numeric("bathrooms", { precision: 3, scale: 1 }).notNull().default('0'),
  square_feet: integer("square_feet"),
  property_type: text("property_type").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip_code: text("zip_code"),
  description: text("description"),
  features: text("features"), // JSON string of array
  images: text("images"), // JSON string of array
  listing_date: text("listing_date"),
  status: text("status").notNull().default('active'),
  mls_number: text("mls_number"),
  lot_size: numeric("lot_size", { precision: 10, scale: 2 }),
  year_built: integer("year_built"),
  garage_spaces: integer("garage_spaces"),
  createdAt: text("created_at").notNull().default('now()'),

  // Price History Fields (canonical market intelligence data)
  priceCutsCount: integer("price_cuts_count").default(0),
  totalPriceReduction: integer("total_price_reduction").default(0),
  lastPriceChangeDate: timestamp("last_price_change_date", { withTimezone: true }),
  priceTrendDirection: text("price_trend_direction"), // 'up', 'down', 'flat'

  // Additional canonical fields
  lotAcres: decimal("lot_acres", { precision: 10, scale: 2 }),
  specialFlags: json("special_flags").$type<string[]>().default([]), // Cash Only, As-Is, Investor Special, etc.
});

// ===============================================
// CHAT SERVICE TABLES - Multi-Agent AI System
// ===============================================

// Chat sessions - tracks each client's conversation journey
export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(), // UUID string
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  sessionStart: text("session_start").notNull(),
  lastActivity: text("last_activity").notNull(),
  totalQuestions: integer("total_questions").notNull().default(0),
  engagementScore: numeric("engagement_score", { precision: 3, scale: 1 }).notNull().default('0.0'), // 0-10 scale
  returnVisits: integer("return_visits").notNull().default(0),
  decisionStage: text("decision_stage").notNull().default('browsing'), // browsing/comparing/deciding/ready
  status: text("status").notNull().default('active'), // active/paused/completed
  createdAt: text("created_at").notNull()
});

// Conversation analytics - every chat interaction tracked with AI analysis
export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(), // UUID string
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  message: text("message").notNull(), // Client's message
  aiResponse: text("ai_response"), // AI bot's response
  timestamp: text("timestamp").notNull(),
  questionCategory: text("question_category"), // location/pricing/features/logistics/general
  sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }), // -1.00 to 1.00 (negative to positive)
  propertyMentioned: text("property_mentioned"), // Listing ID that was discussed
  intentClassification: text("intent_classification"), // browsing/comparing/deciding/scheduling
  agentPath: text("agent_path"), // Which AI agents processed (e.g., "1->2->3")
  searchTransactionId: text("search_transaction_id"), // Links to searchTransactions table for context
  createdAt: text("created_at").notNull()
});

// Property notes - client's personal notes on properties during chat
export const propertyNotes = pgTable("property_notes", {
  id: text("id").primaryKey(), // UUID string
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  listingId: text("listing_id").notNull(), // Property ID from Repliers API
  noteText: text("note_text").notNull(), // Client's note content
  noteType: text("note_type").notNull().default('personal'), // personal/agent/showing/reminder
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

// Property interactions - likes, dislikes, favorites during chat
export const propertyInteractions = pgTable("property_interactions", {
  id: text("id").primaryKey(), // UUID string
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  listingId: text("listing_id").notNull(), // Property ID from Repliers API
  interactionType: text("interaction_type").notNull(), // like/dislike/favorite/viewed/shared/saved
  rating: integer("rating"), // 1-5 stars for likes
  reason: text("reason"), // Why they liked/disliked
  emotionalResponse: text("emotional_response"), // excited/concerned/interested/disappointed
  createdAt: text("created_at").notNull()
});

// AI-generated insights for real estate agents from chat analysis
export const chatAgentInsights = pgTable("chat_agent_insights", {
  id: text("id").primaryKey(), // UUID string
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  insightType: text("insight_type").notNull(), // hot_lead/follow_up_needed/ready_to_view/budget_adjustment/preferences_changed
  insightMessage: text("insight_message").notNull(), // Human-readable insight for agent
  confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }).notNull(), // 0.00-1.00 AI confidence
  priority: text("priority").notNull().default('medium'), // low/medium/high/urgent
  actionSuggested: text("action_suggested"), // Specific action recommended
  status: text("status").notNull().default('new'), // new/acknowledged/acted_upon/dismissed
  generatedAt: text("generated_at").notNull(),
  createdAt: text("created_at").notNull()
});

// Chat conversation context - links chat to search results for seamless experience
export const chatSearchContext = pgTable("chat_search_context", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  searchTransactionId: text("search_transaction_id").notNull().references(() => searchTransactions.transactionId, { onDelete: "cascade" }),
  contextType: text("context_type").notNull(), // initial_search/refined_search/follow_up_search
  isActive: boolean("is_active").notNull().default(true), // Current search context
  createdAt: text("created_at").notNull()
});

// LLM Decision Logging for ML Training and Analysis
export const llmDecisions = pgTable("llm_decisions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(), // Chat or analysis session
  agentName: text("agent_name").notNull(), // Which agent made decision
  decisionType: text("decision_type").notNull(), // financing_strategy, budget_calc, property_score, etc.
  
  // User Context
  userRequirements: json("user_requirements"), // Complete user context
  marketContext: json("market_context"), // Market conditions at decision time
  
  // Prompts
  systemPrompt: text("system_prompt"),
  userPrompt: text("user_prompt").notNull(),
  
  // Response
  rawResponse: text("raw_response").notNull(),
  parsedResponse: json("parsed_response"), // Structured decision
  reasoning: json("reasoning"), // Array of reasoning steps
  
  // Metrics
  confidence: numeric("confidence", { precision: 3, scale: 2 }), // 0.00-1.00
  model: text("model").notNull().default('gpt-4o'),
  temperature: numeric("temperature", { precision: 2, scale: 1 }).default('0.7'),
  tokensUsed: integer("tokens_used"),
  responseTimeMs: integer("response_time_ms"),
  
  // Decision Chain
  parentDecisionId: integer("parent_decision_id").references(() => llmDecisions.id),
  decisionPath: json("decision_path"), // Array of decision IDs in chain
  
  // Outcome Tracking
  outcomeSuccess: boolean("outcome_success"), // Was decision successful?
  outcomeNotes: text("outcome_notes"), // What happened as result
  humanOverride: boolean("human_override").default(false), // Did human override?
  
  timestamp: timestamp("timestamp").notNull().defaultNow()
});

// Investment Strategy Scores - All properties scored against all strategies
export const investmentStrategyScores = pgTable("investment_strategy_scores", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  propertyId: text("property_id").notNull(), // MLS listing ID
  strategyId: text("strategy_id").notNull(), // Template ID
  
  // Property Details Snapshot
  propertyAddress: text("property_address").notNull(),
  propertyPrice: integer("property_price").notNull(),
  propertyData: json("property_data").notNull(), // Full property details
  
  // Strategy Applied
  strategyName: text("strategy_name").notNull(),
  strategyType: text("strategy_type"), // conservative/innovative/aggressive
  
  // Financial Analysis
  downPaymentPercent: numeric("down_payment_percent", { precision: 5, scale: 2 }),
  downPaymentAmount: integer("down_payment_amount"),
  monthlyIncome: integer("monthly_income"),
  monthlyExpenses: integer("monthly_expenses"),
  monthlyCashFlow: integer("monthly_cash_flow"),
  capRate: numeric("cap_rate", { precision: 5, scale: 2 }),
  cashOnCashReturn: numeric("cash_on_cash_return", { precision: 5, scale: 2 }),
  
  // Scoring
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }).notNull(),
  scoringFactors: json("scoring_factors"), // Breakdown of score components
  aiReasoning: text("ai_reasoning"), // Why this score
  
  // Feasibility
  isFeasible: boolean("is_feasible").notNull().default(true),
  feasibilityIssues: json("feasibility_issues"), // Array of issues if not feasible
  
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertRepliersListingSchema = createInsertSchema(repliersListings).omit({
  createdAt: true
});

// Chat Service Insert Schemas
export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  createdAt: true
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  createdAt: true
});

export const insertPropertyNoteSchema = createInsertSchema(propertyNotes).omit({
  createdAt: true,
  updatedAt: true
});

export const insertPropertyInteractionSchema = createInsertSchema(propertyInteractions).omit({
  createdAt: true
});

export const insertChatAgentInsightSchema = createInsertSchema(chatAgentInsights).omit({
  createdAt: true,
  generatedAt: true
});

export const insertChatSearchContextSchema = createInsertSchema(chatSearchContext).omit({
  id: true,
  createdAt: true
});

export type InsertBuyerProfile = z.infer<typeof insertBuyerProfileSchema>;
export type BuyerProfile = typeof buyerProfiles.$inferSelect;
export type InsertProfileTag = z.infer<typeof insertProfileTagSchema>;
export type ProfileTag = typeof profileTags.$inferSelect;
export type InsertProfilePersona = z.infer<typeof insertProfilePersonaSchema>;

// Chat Service Types
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertPropertyNote = z.infer<typeof insertPropertyNoteSchema>;
export type PropertyNote = typeof propertyNotes.$inferSelect;
export type InsertPropertyInteraction = z.infer<typeof insertPropertyInteractionSchema>;
export type PropertyInteraction = typeof propertyInteractions.$inferSelect;
export type InsertChatAgentInsight = z.infer<typeof insertChatAgentInsightSchema>;
export type ChatAgentInsight = typeof chatAgentInsights.$inferSelect;
export type InsertChatSearchContext = z.infer<typeof insertChatSearchContextSchema>;
export type ChatSearchContext = typeof chatSearchContext.$inferSelect;
export type ProfilePersona = typeof profilePersona.$inferSelect;
export type InsertAgentInsightFeedback = z.infer<typeof insertAgentInsightFeedbackSchema>;
export type AgentInsightFeedback = typeof agentInsightFeedback.$inferSelect;
export type InsertAgentActionFeedback = z.infer<typeof insertAgentActionFeedbackSchema>;
export type AgentActionFeedback = typeof agentActionFeedback.$inferSelect;
export type InsertAgentNotes = z.infer<typeof insertAgentNotesSchema>;
export type AgentNotes = typeof agentNotes.$inferSelect;
export type InsertProfileInsightsLock = z.infer<typeof insertProfileInsightsLockSchema>;
export type ProfileInsightsLock = typeof profileInsightsLock.$inferSelect;
export type InsertListingVisualAnalysis = z.infer<typeof insertListingVisualAnalysisSchema>;
export type ListingVisualAnalysis = typeof listingVisualAnalysis.$inferSelect;
export type InsertListingShareableLinks = z.infer<typeof insertListingShareableLinksSchema>;
export type ListingShareableLinks = typeof listingShareableLinks.$inferSelect;
export type InsertProfileShareableLinks = z.infer<typeof insertProfileShareableLinksSchema>;
export type ProfileShareableLinks = typeof profileShareableLinks.$inferSelect;

// Transaction Logging Types
export type InsertSearchTransaction = z.infer<typeof insertSearchTransactionSchema>;
export type SearchTransaction = typeof searchTransactions.$inferSelect;
export type InsertSearchTransactionResults = z.infer<typeof insertSearchTransactionResultsSchema>;
export type SearchTransactionResults = typeof searchTransactionResults.$inferSelect;
export type InsertAgentInteraction = z.infer<typeof insertAgentInteractionSchema>;
export type AgentInteraction = typeof agentInteractions.$inferSelect;
export type InsertSearchOutcome = z.infer<typeof insertSearchOutcomeSchema>;
export type SearchOutcome = typeof searchOutcomes.$inferSelect;
export type InsertCachedSearchResults = z.infer<typeof insertCachedSearchResultsSchema>;
export type CachedSearchResults = typeof cachedSearchResults.$inferSelect;
export type InsertRepliersListing = z.infer<typeof insertRepliersListingSchema>;
export type RepliersListing = typeof repliersListings.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

// ===============================================
// AGENT LOGGING TABLES - For Phoenix Integration
// ===============================================

// Multi-agent analysis sessions - tracks each complete analysis workflow
export const agentAnalysisSessions = pgTable("agent_analysis_sessions", {
  id: text("id").primaryKey(), // UUID string
  strategyId: text("strategy_id").notNull(), // Links to generated investment strategy
  agentId: integer("agent_id").references(() => agents.id), // Which agent initiated
  profileId: integer("profile_id").references(() => buyerProfiles.id), // Buyer profile used
  searchCriteria: json("search_criteria").notNull(), // Original search parameters
  investmentProfile: json("investment_profile").notNull(), // Investment criteria
  sessionType: text("session_type").notNull().default('multi_agent'), // multi_agent/single_agent/test
  totalAgentsUsed: integer("total_agents_used").notNull().default(0),
  totalPropertiesAnalyzed: integer("total_properties_analyzed").notNull().default(0),
  totalExecutionTime: integer("total_execution_time"), // Milliseconds
  finalReportPath: text("final_report_path"), // Path to generated strategy report
  sessionStatus: text("session_status").notNull().default('running'), // running/completed/failed/cancelled
  errorLogs: json("error_logs"), // Any errors encountered
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at")
});

// Individual agent interactions - each agent call/response logged
export const agentExecutionLogs = pgTable("agent_execution_logs", {
  id: text("id").primaryKey(), // UUID string
  sessionId: text("session_id").notNull().references(() => agentAnalysisSessions.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull(), // property_hunter/financial_calculator/deal_packager/etc
  agentRole: text("agent_role").notNull(), // The agent's specialized role
  executionOrder: integer("execution_order").notNull(), // Order in the workflow (1, 2, 3, etc)
  inputData: json("input_data").notNull(), // Data passed TO the agent
  outputData: json("output_data"), // Data returned BY the agent
  prompt: text("prompt"), // AI prompt used (if applicable)
  aiResponse: text("ai_response"), // Raw AI response (if applicable)
  executionTime: integer("execution_time"), // Milliseconds for this agent
  tokensUsed: integer("tokens_used"), // AI tokens consumed
  errorMessage: text("error_message"), // Error if failed
  success: boolean("success").notNull().default(true),
  dataTransformations: json("data_transformations"), // How data was modified
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at")
});

// Property data flow tracking - tracks how property data changes between agents
export const propertyDataFlow = pgTable("property_data_flow", {
  id: text("id").primaryKey(), // UUID string
  sessionId: text("session_id").notNull().references(() => agentAnalysisSessions.id, { onDelete: "cascade" }),
  executionLogId: text("execution_log_id").notNull().references(() => agentExecutionLogs.id, { onDelete: "cascade" }),
  propertyId: text("property_id").notNull(), // Property identifier from Repliers API
  agentName: text("agent_name").notNull(), // Which agent processed this property
  inputPropertyData: json("input_property_data").notNull(), // Property data before processing
  outputPropertyData: json("output_property_data"), // Property data after processing
  addressFields: json("address_fields"), // Specific tracking of address components
  dataQuality: json("data_quality"), // Quality metrics (completeness, accuracy, etc)
  fieldsAdded: json("fields_added"), // New fields added by this agent
  fieldsModified: json("fields_modified"), // Fields changed by this agent
  fieldsRemoved: json("fields_removed"), // Fields removed by this agent
  createdAt: text("created_at").notNull()
});

// Agent performance metrics - aggregated performance tracking
export const agentPerformanceMetrics = pgTable("agent_performance_metrics", {
  id: serial("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  timeFrame: text("time_frame").notNull(), // daily/weekly/monthly
  totalExecutions: integer("total_executions").notNull().default(0),
  successfulExecutions: integer("successful_executions").notNull().default(0),
  averageExecutionTime: decimal("average_execution_time", { precision: 10, scale: 2 }),
  averageTokenUsage: decimal("average_token_usage", { precision: 10, scale: 2 }),
  errorRate: decimal("error_rate", { precision: 5, scale: 4 }), // Percentage
  qualityScore: decimal("quality_score", { precision: 3, scale: 2 }), // 0-100 score
  dataIntegrityScore: decimal("data_integrity_score", { precision: 3, scale: 2 }), // Address accuracy, etc
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

// Prompt engineering tracking - for A/B testing and optimization
export const promptPerformanceTracking = pgTable("prompt_performance_tracking", {
  id: text("id").primaryKey(), // UUID string
  agentName: text("agent_name").notNull(),
  promptVersion: text("prompt_version").notNull(), // v1.0, v1.1, experimental, etc
  promptTemplate: text("prompt_template").notNull(), // The actual prompt used
  inputContext: json("input_context"), // Context provided with prompt
  outputQuality: decimal("output_quality", { precision: 3, scale: 2 }), // Quality score 0-100
  executionTime: integer("execution_time"), // Response time
  tokensUsed: integer("tokens_used"),
  successRate: decimal("success_rate", { precision: 5, scale: 4 }), // Success percentage
  userRating: integer("user_rating"), // Manual quality rating if available
  automatedScore: decimal("automated_score", { precision: 3, scale: 2 }), // Algorithmic quality score
  testGroup: text("test_group"), // A/B test group identifier
  createdAt: text("created_at").notNull()
});

// Insert schemas for agent logging tables
export const insertAgentAnalysisSessionSchema = createInsertSchema(agentAnalysisSessions).omit({
  createdAt: true
});

export const insertAgentExecutionLogSchema = createInsertSchema(agentExecutionLogs).omit({
  createdAt: true
});

export const insertPropertyDataFlowSchema = createInsertSchema(propertyDataFlow).omit({
  createdAt: true
});

export const insertAgentPerformanceMetricsSchema = createInsertSchema(agentPerformanceMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPromptPerformanceTrackingSchema = createInsertSchema(promptPerformanceTracking).omit({
  createdAt: true
});

// Types for agent logging
export type InsertAgentAnalysisSession = z.infer<typeof insertAgentAnalysisSessionSchema>;
export type AgentAnalysisSession = typeof agentAnalysisSessions.$inferSelect;
export type InsertAgentExecutionLog = z.infer<typeof insertAgentExecutionLogSchema>;
export type AgentExecutionLog = typeof agentExecutionLogs.$inferSelect;
export type InsertPropertyDataFlow = z.infer<typeof insertPropertyDataFlowSchema>;
export type PropertyDataFlow = typeof propertyDataFlow.$inferSelect;
export type InsertAgentPerformanceMetrics = z.infer<typeof insertAgentPerformanceMetricsSchema>;
export type AgentPerformanceMetrics = typeof agentPerformanceMetrics.$inferSelect;
export type InsertPromptPerformanceTracking = z.infer<typeof insertPromptPerformanceTrackingSchema>;
export type PromptPerformanceTracking = typeof promptPerformanceTracking.$inferSelect;

// Enhanced form data schema
export const buyerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  location: z.string().min(1, "Location is required"),
  budget: z.string().min(1, "Budget is required"),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  homeType: z.enum(["condo", "townhouse", "single-family", "duplex", "apartment", "other"]),
  bedrooms: z.number().min(0).max(10),
  bathrooms: z.string().min(1),
  mustHaveFeatures: z.array(z.string()).default([]),
  dealbreakers: z.array(z.string()).default([]),
  preferredAreas: z.array(z.string()).default([]),
  lifestyleDrivers: z.array(z.string()).default([]),
  specialNeeds: z.array(z.string()).default([]),
  budgetFlexibility: z.number().min(0).max(100).default(50),
  locationFlexibility: z.number().min(0).max(100).default(50),
  timingFlexibility: z.number().min(0).max(100).default(50),
  emotionalContext: z.string().optional(),
  voiceTranscript: z.string().optional()
});

export type BuyerFormData = z.infer<typeof buyerFormSchema>;

// Schema for OpenAI extraction and enhancement
export const extractedProfileSchema = z.object({
  name: z.string().describe("Buyer name(s) extracted from the input"),
  email: z.string().optional().describe("Buyer email address if mentioned"),
  location: z.string().describe("Primary location or city where they want to buy"),
  budget: z.string().describe("Budget range in format like '$450K - $520K'"),
  budgetMin: z.number().optional().describe("Minimum budget as number"),
  budgetMax: z.number().optional().describe("Maximum budget as number"),
  homeType: z.enum(["condo", "townhouse", "single-family", "duplex", "apartment", "other"]).describe("Type of home preferred"),
  bedrooms: z.number().describe("Number of bedrooms required"),
  bathrooms: z.string().describe("Number of bathrooms (can be '2+', '3', etc.)"),
  mustHaveFeatures: z.array(z.string()).describe("List of must-have features"),
  dealbreakers: z.array(z.string()).describe("List of dealbreakers"),
  preferredAreas: z.array(z.string()).describe("Preferred location areas"),
  lifestyleDrivers: z.array(z.string()).describe("Primary lifestyle motivations"),
  specialNeeds: z.array(z.string()).describe("Special requirements or needs"),
  budgetFlexibility: z.number().min(0).max(100).describe("Budget flexibility score 0-100"),
  locationFlexibility: z.number().min(0).max(100).describe("Location flexibility score 0-100"),
  timingFlexibility: z.number().min(0).max(100).describe("Timing flexibility score 0-100"),
  emotionalContext: z.string().optional().describe("Emotional context or additional notes"),
  inferredTags: z.array(z.string()).describe("AI-inferred tags about buyer profile"),
  emotionalTone: z.string().optional().describe("Overall emotional tone (excited, cautious, urgent, etc.)"),
  priorityScore: z.number().min(0).max(100).describe("Priority/urgency score based on analysis")
});

export type ExtractedProfile = z.infer<typeof extractedProfileSchema>;

// Common options for form dropdowns
export const HOME_TYPES = [
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "single-family", label: "Single Family Home" },
  { value: "duplex", label: "Duplex" },
  { value: "apartment", label: "Apartment" },
  { value: "other", label: "Other" }
] as const;

export const MUST_HAVE_FEATURES = [
  "Garage/Parking", "Yard/Garden", "Modern Kitchen", "Hardwood Floors", 
  "Natural Light", "Storage Space", "Laundry Room", "Home Office", 
  "Fireplace", "Balcony/Patio", "Swimming Pool", "Air Conditioning",
  "Walk-in Closet", "Basement", "Updated Bathrooms", "Open Floor Plan"
] as const;

export const LIFESTYLE_DRIVERS = [
  "Good Schools", "Short Commute", "Walkability", "Nightlife", 
  "Family Friendly", "Quiet Neighborhood", "Shopping Nearby", 
  "Public Transit", "Parks/Recreation", "Safety", "Dining Options",
  "Arts/Culture", "Investment Potential", "Community Feel"
] as const;

export const SPECIAL_NEEDS = [
  "Pet Friendly", "Work From Home Space", "Aging Parents", 
  "Wheelchair Accessible", "Near Medical Facilities", "Good Internet",
  "Multiple Cars", "Rental Income Potential", "Guest Accommodation",
  "Child Safety Features", "Low Maintenance", "Energy Efficient"
] as const;

// NLP Search Logs Table
export const nlpSearchLogs = pgTable("nlp_search_logs", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  nlpQuery: text("nlp_query").notNull(),
  nlpResponse: json("nlp_response").notNull(),
  searchUrl: text("search_url").notNull(),
  searchResults: json("search_results").notNull(),
  executionTime: integer("execution_time").notNull(), // milliseconds
  nlpId: text("nlp_id").notNull(), // Repliers NLP context ID
  createdAt: text("created_at").notNull()
});

// Investment Strategies Table - AI-generated comprehensive strategies
export const investmentStrategies = pgTable("investment_strategies", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().unique(), // For tracking strategy generation
  
  // Strategy Data
  strategyJson: json("strategy_json").notNull(), // Complete strategy data
  marketAnalysis: json("market_analysis").notNull(), // Market intelligence from Tavily
  propertyRecommendations: json("property_recommendations").notNull(), // Top properties with analysis
  financialProjections: json("financial_projections").notNull(), // ROI, cash flow calculations
  
  // Generation Metadata
  generationTime: bigint("generation_time", { mode: 'number' }).notNull(), // milliseconds
  dataSourcesUsed: json("data_sources_used").notNull(), // ['repliers', 'tavily', 'market_stats']
  
  // Strategy Status
  status: text("status").notNull().default("generating"), // generating, complete, failed
  documentUrl: text("document_url"), // Path to saved strategy document
  
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at")
});

// Types for NLP Search Logs
export type NLPSearchLog = typeof nlpSearchLogs.$inferSelect;
export type InsertNLPSearchLog = typeof nlpSearchLogs.$inferInsert;

export const insertNLPSearchLogSchema = createInsertSchema(nlpSearchLogs).omit({
  id: true,
  createdAt: true
});

// Types for Investment Strategies
export type InvestmentStrategy = typeof investmentStrategies.$inferSelect;
export type InsertInvestmentStrategy = typeof investmentStrategies.$inferInsert;

export const insertInvestmentStrategySchema = createInsertSchema(investmentStrategies).omit({
  id: true,
  createdAt: true,
  completedAt: true
});

// ============================================================================
// Configuration Management Tables
// ============================================================================

// Config Values - Store all configuration values with TTL support
export const configValues = pgTable("config_values", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., 'market-data.mortgageRates'
  value: text("value").notNull(), // JSON stringified value
  version: integer("version").notNull().default(1),
  
  // Metadata
  updatedBy: text("updated_by").notNull(), // agent name or user ID
  updatedAt: text("updated_at").notNull(),
  ttlExpiresAt: text("ttl_expires_at"), // When this config expires (ISO string)
  
  // Provenance - where did this value come from?
  provenance: text("provenance").notNull() // JSON: { source, agent?, researchQuery?, confidence? }
});

// Config Audit Log - Track all changes for compliance and debugging
export const configAuditLog = pgTable("config_audit_log", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").notNull(),
  previousValue: text("previous_value"), // null for first insert
  newValue: text("new_value").notNull(),
  
  // Who and when
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  
  // Why
  provenance: text("provenance").notNull(), // Same as configValues.provenance
  changeReason: text("change_reason") // Optional human-readable reason
});

// Config Access Log - Track who reads configs (optional, for analytics)
export const configAccessLog = pgTable("config_access_log", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").notNull(),
  accessedBy: text("accessed_by").notNull(),
  accessedAt: text("accessed_at").notNull(),
  purpose: text("purpose") // e.g., 'market-discovery', 'reconciliation'
});

// Export types for config tables
export type ConfigValue = typeof configValues.$inferSelect;
export type InsertConfigValue = typeof configValues.$inferInsert;
export type ConfigAuditLogEntry = typeof configAuditLog.$inferSelect;
export type InsertConfigAuditLog = typeof configAuditLog.$inferInsert;

export const insertConfigValueSchema = createInsertSchema(configValues).omit({
  id: true,
  version: true
});

export const insertConfigAuditLogSchema = createInsertSchema(configAuditLog).omit({
  id: true
});
