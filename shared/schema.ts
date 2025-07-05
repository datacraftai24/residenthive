import { pgTable, text, serial, integer, json, numeric } from "drizzle-orm/pg-core";
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
