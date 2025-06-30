import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractBuyerProfile, enhanceFormProfile, extractBuyerProfileWithTags } from "./openai";
import { tagEngine } from "./tag-engine";
import { parseProfileChanges, applyChangesToProfile, generateQuickEditSuggestions } from "./conversational-edit";
import { insertBuyerProfileSchema, buyerFormSchema } from "@shared/schema";
import { z } from "zod";

const extractRequestSchema = z.object({
  input: z.string().min(1, "Input text is required")
});

const enhanceRequestSchema = z.object({
  formData: buyerFormSchema
});

const enhancedExtractionSchema = z.object({
  input: z.string().min(1, "Input text is required"),
  inputMethod: z.enum(['voice', 'text']).default('text')
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Extract buyer profile from raw text input
  app.post("/api/extract-profile", async (req, res) => {
    try {
      const { input } = extractRequestSchema.parse(req.body);
      
      const extractedProfile = await extractBuyerProfile(input);
      
      res.json(extractedProfile);
    } catch (error) {
      console.error("Error in /api/extract-profile:", error);
      res.status(400).json({ 
        error: "Failed to extract profile",
        message: (error as Error).message 
      });
    }
  });

  // Enhance form profile with AI insights
  app.post("/api/enhance-profile", async (req, res) => {
    try {
      const { formData } = enhanceRequestSchema.parse(req.body);
      
      const enhancedProfile = await enhanceFormProfile(formData);
      
      res.json(enhancedProfile);
    } catch (error) {
      console.error("Error in /api/enhance-profile:", error);
      res.status(400).json({ 
        error: "Failed to enhance profile",
        message: (error as Error).message 
      });
    }
  });

  // Save buyer profile
  app.post("/api/buyer-profiles", async (req, res) => {
    try {
      const profileData = insertBuyerProfileSchema.parse(req.body);
      
      const savedProfile = await storage.createBuyerProfile(profileData);
      
      res.json(savedProfile);
    } catch (error) {
      console.error("Error in /api/buyer-profiles POST:", error);
      res.status(400).json({ 
        error: "Failed to save profile",
        message: (error as Error).message 
      });
    }
  });

  // Get all buyer profiles
  app.get("/api/buyer-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllBuyerProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error in /api/buyer-profiles GET:", error);
      res.status(500).json({ 
        error: "Failed to fetch profiles",
        message: (error as Error).message 
      });
    }
  });

  // Get single buyer profile
  app.get("/api/buyer-profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const profile = await storage.getBuyerProfile(id);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error in /api/buyer-profiles/:id GET:", error);
      res.status(500).json({ 
        error: "Failed to fetch profile",
        message: (error as Error).message 
      });
    }
  });

  // Delete buyer profile
  app.delete("/api/buyer-profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      await storage.deleteBuyerProfile(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in /api/buyer-profiles/:id DELETE:", error);
      res.status(500).json({ 
        error: "Failed to delete profile",
        message: (error as Error).message 
      });
    }
  });

  // Update buyer profile
  app.patch("/api/buyer-profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const result = insertBuyerProfileSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.errors });
      }

      const profile = await storage.updateBuyerProfile(id, result.data);
      res.json(profile);
    } catch (error) {
      console.error("Error updating buyer profile:", error);
      res.status(500).json({ 
        error: "Failed to update buyer profile",
        message: (error as Error).message 
      });
    }
  });

  // Enhanced extraction with tags and persona analysis
  app.post("/api/extract-profile-enhanced", async (req, res) => {
    try {
      const { input, inputMethod } = enhancedExtractionSchema.parse(req.body);
      const analysis = await extractBuyerProfileWithTags(input, inputMethod);
      res.json(analysis);
    } catch (error) {
      console.error("Error in /api/extract-profile-enhanced:", error);
      res.status(400).json({ 
        error: "Enhanced extraction failed",
        message: (error as Error).message 
      });
    }
  });

  // Get profile with tags and persona
  app.get("/api/buyer-profiles/:id/enhanced", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const profileWithTags = await storage.getProfileWithTags(id);
      if (!profileWithTags) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json(profileWithTags);
    } catch (error) {
      console.error("Error in /api/buyer-profiles/:id/enhanced GET:", error);
      res.status(500).json({ 
        error: "Failed to fetch enhanced profile",
        message: (error as Error).message 
      });
    }
  });

  // Get profile versions (for version tracking)
  app.get("/api/buyer-profiles/:id/versions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const versions = await storage.getProfileVersions(id);
      res.json(versions);
    } catch (error) {
      console.error("Error in /api/buyer-profiles/:id/versions GET:", error);
      res.status(500).json({ 
        error: "Failed to fetch profile versions",
        message: (error as Error).message 
      });
    }
  });

  // Standalone Tag Engine endpoint (reusable microservice)
  app.post("/api/tag-engine/analyze", async (req, res) => {
    try {
      const { structuredData, rawInput, context } = req.body;
      
      if (!structuredData || !rawInput) {
        return res.status(400).json({ error: "structuredData and rawInput are required" });
      }

      const analysis = await tagEngine.generateTagsAndPersona({
        structuredData,
        rawInput,
        context: context || 'profile'
      });

      res.json(analysis);
    } catch (error) {
      console.error("Error in /api/tag-engine/analyze:", error);
      res.status(500).json({ 
        error: "Tag analysis failed",
        message: (error as Error).message 
      });
    }
  });

  // AI Insights explanation endpoint
  app.get("/api/insights/explanation", async (req, res) => {
    try {
      const explanation = {
        confidenceScoring: {
          description: "How confident the AI is in its data extraction (0-100%)",
          baseScore: 50,
          factors: {
            completeName: { points: 10, description: "Complete buyer name provided" },
            email: { points: 5, description: "Email address included" },
            budgetRange: { points: 10, description: "Clear budget with min/max values" },
            locationPreferences: { points: 10, description: "Specific location areas mentioned" },
            mustHaveFeatures: { points: 8, description: "Multiple must-have features listed" },
            dealbreakers: { points: 5, description: "Clear dealbreakers mentioned" },
            inputQuality: {
              detailedInput: { points: 10, description: "50+ words in description" },
              moderateInput: { points: 5, description: "20-50 words in description" },
              budgetMentioned: { points: 5, description: "Budget mentioned with $ symbol" },
              specificBedrooms: { points: 5, description: "Specific bedroom count" },
              specificBathrooms: { points: 5, description: "Specific bathroom count" }
            }
          }
        },
        
        behavioralTags: {
          description: "AI-generated tags categorizing buyer behavior and preferences",
          categories: {
            demographic: {
              confidence: "80-95%",
              examples: ["first-time-buyer", "family-oriented", "empty-nester", "investor"],
              description: "Age, family status, buyer experience level"
            },
            behavioral: {
              confidence: "70-90%", 
              examples: ["research-heavy", "quick-decision", "collaborative", "cautious"],
              description: "Decision-making patterns and communication style"
            },
            preference: {
              confidence: "75-90%",
              examples: ["modern-style", "urban-living", "suburban-preference"],
              description: "Style and location preferences"
            },
            financial: {
              confidence: "70-85%",
              examples: ["budget-conscious", "premium-focused", "investment-minded"],
              description: "Price orientation and financial approach"
            },
            urgency: {
              confidence: "80-95%",
              examples: ["immediate-need", "flexible-timing", "seasonal-buyer"],
              description: "Timeline pressure and urgency level"
            }
          }
        },

        personaAnalysis: {
          description: "Deep psychological profiling with behavioral insights",
          components: {
            communicationStyle: {
              options: ["direct", "collaborative", "detail-oriented", "visual"],
              description: "How the buyer prefers to communicate and receive information"
            },
            decisionMakingStyle: {
              options: ["quick", "research-heavy", "committee-based", "intuitive"],
              description: "How the buyer approaches major decisions"
            },
            urgencyLevel: {
              range: "0-100",
              description: "Timeline pressure and immediacy of need",
              calculation: "Base 50 + timeline factors + life events + current situation"
            },
            priceOrientation: {
              options: ["budget-driven", "value-conscious", "premium-focused", "investment-minded"],
              description: "Primary financial motivation and price sensitivity"
            }
          }
        },

        flexibilityScoring: {
          description: "How flexible the buyer is in different aspects (0-100)",
          types: {
            budget: {
              low: "0-30: Fixed maximum, can't go higher",
              medium: "40-70: Some wiggle room, approximate range", 
              high: "70-100: Flexible depending on features"
            },
            location: {
              low: "0-30: Specific neighborhood required",
              medium: "40-70: Preferred areas with alternatives",
              high: "70-100: Open to suggestions"
            },
            timing: {
              low: "0-30: Hard deadlines, immediate need",
              medium: "40-70: Preferred timeline with flexibility",
              high: "70-100: When the right place is found"
            }
          }
        },

        inputMethodAccuracy: {
          description: "How input method affects analysis accuracy",
          methods: {
            form: { accuracy: "95-100%", description: "Structured data with validation" },
            text: { accuracy: "80-95%", description: "Well-written descriptions" },
            voice: { accuracy: "70-90%", description: "Speech-to-text with interpretation" }
          }
        },

        priorityScore: {
          description: "Overall urgency and importance of the search (0-100)",
          factors: {
            emotionalTone: { weight: "20%", description: "Intensity of emotional language" },
            timelinePressure: { weight: "25%", description: "Deadline urgency" },
            lifeEvents: { weight: "20%", description: "Major life change triggers" },
            currentSituation: { weight: "20%", description: "Current housing problems" },
            decisionReadiness: { weight: "15%", description: "Preparedness to act" }
          }
        },

        continuousLearning: {
          description: "How the system improves over time",
          methods: [
            "Version tracking of buyer preference evolution",
            "Confidence validation against actual outcomes", 
            "Agent feedback and manual corrections",
            "Pattern analysis from successful matches"
          ]
        }
      };

      res.json(explanation);
    } catch (error) {
      console.error("Error in /api/insights/explanation:", error);
      res.status(500).json({ 
        error: "Failed to get insights explanation",
        message: (error as Error).message 
      });
    }
  });

  // Conversational editing endpoints
  
  // Parse natural language changes
  app.post("/api/buyer-profiles/:id/parse-changes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const { text, currentProfile } = req.body;
      if (!text || !currentProfile) {
        return res.status(400).json({ error: "text and currentProfile are required" });
      }

      const result = await parseProfileChanges(text, currentProfile);
      res.json(result);
    } catch (error) {
      console.error("Error parsing profile changes:", error);
      res.status(500).json({ 
        error: "Failed to parse changes",
        message: (error as Error).message 
      });
    }
  });

  // Apply parsed changes to profile
  app.patch("/api/buyer-profiles/:id/apply-changes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const { changes } = req.body;
      if (!changes || !Array.isArray(changes)) {
        return res.status(400).json({ error: "changes array is required" });
      }

      // Get current profile
      const currentProfile = await storage.getBuyerProfile(id);
      if (!currentProfile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Apply changes
      const updates = applyChangesToProfile(currentProfile, changes);
      const updatedProfile = await storage.updateBuyerProfile(id, updates);

      res.json(updatedProfile);
    } catch (error) {
      console.error("Error applying profile changes:", error);
      res.status(500).json({ 
        error: "Failed to apply changes",
        message: (error as Error).message 
      });
    }
  });

  // Get quick edit suggestions
  app.get("/api/buyer-profiles/:id/quick-suggestions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const profile = await storage.getBuyerProfile(id);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const suggestions = await generateQuickEditSuggestions(profile);
      res.json({ suggestions });
    } catch (error) {
      console.error("Error generating quick suggestions:", error);
      res.status(500).json({ 
        error: "Failed to generate suggestions",
        message: (error as Error).message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
