import { pgTable, text, serial, integer, json, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const buyerProfiles = pgTable("buyer_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  
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
  
  // Meta
  rawInput: text("raw_input").notNull(),
  createdAt: text("created_at").notNull()
});

export const insertBuyerProfileSchema = createInsertSchema(buyerProfiles).omit({
  id: true,
  createdAt: true
});

export type InsertBuyerProfile = z.infer<typeof insertBuyerProfileSchema>;
export type BuyerProfile = typeof buyerProfiles.$inferSelect;

// Enhanced form data schema
export const buyerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
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
