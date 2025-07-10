import { pgTable, text, serial, integer, json, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const buyerProfiles = pgTable("buyer_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  
  // Basic Requirements
  budget: text("budget").notNull(),
  budgetMin: integer("budget_min"),
  budgetMax: integer("budget_max"),
  homeType: text("home_type").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: text("bathrooms").notNull(),
  
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
export const searchTransactions = pgTable("search_transactions", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().unique(), // UUID for this search transaction
  profileId: integer("profile_id").notNull().references(() => buyerProfiles.id),
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

export type InsertBuyerProfile = z.infer<typeof insertBuyerProfileSchema>;
export type BuyerProfile = typeof buyerProfiles.$inferSelect;
export type InsertProfileTag = z.infer<typeof insertProfileTagSchema>;
export type ProfileTag = typeof profileTags.$inferSelect;
export type InsertProfilePersona = z.infer<typeof insertProfilePersonaSchema>;
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

// Enhanced form data schema
export const buyerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
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
