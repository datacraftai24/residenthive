import { pgTable, text, serial, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const buyerProfiles = pgTable("buyer_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  budget: text("budget").notNull(),
  location: text("location").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: text("bathrooms").notNull(),
  mustHaveFeatures: json("must_have_features").$type<string[]>().notNull().default([]),
  dealbreakers: json("dealbreakers").$type<string[]>().notNull().default([]),
  rawInput: text("raw_input").notNull(),
  createdAt: text("created_at").notNull()
});

export const insertBuyerProfileSchema = createInsertSchema(buyerProfiles).omit({
  id: true,
  createdAt: true
});

export type InsertBuyerProfile = z.infer<typeof insertBuyerProfileSchema>;
export type BuyerProfile = typeof buyerProfiles.$inferSelect;

// Schema for OpenAI extraction
export const extractedProfileSchema = z.object({
  name: z.string().describe("Buyer name(s) extracted from the input"),
  budget: z.string().describe("Budget range in format like '$450K - $520K'"),
  location: z.string().describe("Preferred location areas"),
  bedrooms: z.number().describe("Number of bedrooms required"),
  bathrooms: z.string().describe("Number of bathrooms (can be '2+', '3', etc.)"),
  mustHaveFeatures: z.array(z.string()).describe("List of must-have features"),
  dealbreakers: z.array(z.string()).describe("List of dealbreakers")
});

export type ExtractedProfile = z.infer<typeof extractedProfileSchema>;
