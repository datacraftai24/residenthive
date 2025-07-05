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

  // Agent Feedback Endpoints
  
  // Log insight disagreement (tag or persona field)
  app.post("/api/insights/disagree", async (req, res) => {
    try {
      const { profileId, tagName, personaField } = req.body;
      
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }

      const feedbackData = {
        profileId,
        tagName: tagName || null,
        personaField: personaField || null,
        feedbackType: tagName ? 'disagree_tag' : 'disagree_persona',
        createdAt: new Date().toISOString()
      };

      await storage.logInsightFeedback(feedbackData);
      res.json({ success: true });
    } catch (error) {
      console.error("Error logging insight disagreement:", error);
      res.status(500).json({ 
        error: "Failed to log feedback",
        message: (error as Error).message 
      });
    }
  });

  // Log action taken
  app.post("/api/actions/log", async (req, res) => {
    try {
      const { profileId, actionId, actionTaken } = req.body;
      
      if (!profileId || !actionId || !actionTaken) {
        return res.status(400).json({ error: "profileId, actionId, and actionTaken are required" });
      }

      const actionData = {
        profileId,
        actionId,
        actionTaken,
        createdAt: new Date().toISOString()
      };

      await storage.logActionFeedback(actionData);
      res.json({ success: true });
    } catch (error) {
      console.error("Error logging action feedback:", error);
      res.status(500).json({ 
        error: "Failed to log action",
        message: (error as Error).message 
      });
    }
  });

  // Save agent note
  app.post("/api/agent-notes", async (req, res) => {
    try {
      const { profileId, note } = req.body;
      
      if (!profileId || !note?.trim()) {
        return res.status(400).json({ error: "profileId and note are required" });
      }

      const noteData = {
        profileId,
        note: note.trim(),
        createdAt: new Date().toISOString()
      };

      await storage.saveAgentNote(noteData);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving agent note:", error);
      res.status(500).json({ 
        error: "Failed to save note",
        message: (error as Error).message 
      });
    }
  });

  // Toggle insights lock
  app.post("/api/insights/lock", async (req, res) => {
    try {
      const { profileId, isLocked } = req.body;
      
      if (!profileId || typeof isLocked !== 'boolean') {
        return res.status(400).json({ error: "profileId and isLocked (boolean) are required" });
      }

      const lockData = {
        profileId,
        isLocked: isLocked ? 1 : 0,
        createdAt: new Date().toISOString()
      };

      await storage.toggleInsightsLock(lockData);
      res.json({ success: true, isLocked });
    } catch (error) {
      console.error("Error toggling insights lock:", error);
      res.status(500).json({ 
        error: "Failed to toggle lock",
        message: (error as Error).message 
      });
    }
  });

  // Get agent notes for a profile
  app.get("/api/agent-notes/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const notes = await storage.getAgentNotes(profileId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching agent notes:", error);
      res.status(500).json({ 
        error: "Failed to fetch notes",
        message: (error as Error).message 
      });
    }
  });

  // Get insights lock status
  app.get("/api/insights/lock/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const lockStatus = await storage.getInsightsLockStatus(profileId);
      res.json({ isLocked: lockStatus });
    } catch (error) {
      console.error("Error fetching lock status:", error);
      res.status(500).json({ 
        error: "Failed to fetch lock status",
        message: (error as Error).message 
      });
    }
  });

  // Intelligent Listing Search API
  app.post("/api/listings/search", async (req, res) => {
    try {
      const { profileId } = req.body;
      
      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }

      // Get buyer profile
      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Buyer profile not found" });
      }

      // Get profile with tags for enhanced scoring
      const profileWithTags = await storage.getProfileWithTags(profileId);
      const tags = profileWithTags?.tags || [];

      // Import the services
      const { listingScorer } = await import('./listing-scorer');

      // Check if Repliers API is available, otherwise use demo data
      let listings;
      const hasApiKey = !!process.env.REPLIERS_API_KEY;
      
      if (hasApiKey) {
        try {
          const { repliersAPI } = await import('./repliers-api');
          listings = await repliersAPI.searchListings(profile);
        } catch (apiError) {
          console.log('Repliers API error, falling back to demo data:', apiError.message);
          const { getDemoListingsForProfile } = await import('./demo-listings');
          listings = getDemoListingsForProfile(profile);
        }
      } else {
        console.log('Using demo data for intelligent search demonstration');
        const { getDemoListingsForProfile } = await import('./demo-listings');
        listings = getDemoListingsForProfile(profile);
      }
      
      if (!listings || listings.length === 0) {
        return res.json({
          top_picks: [],
          other_matches: [],
          chat_blocks: ["No listings found matching your criteria. Try adjusting your search parameters."],
          search_summary: {
            total_found: 0,
            search_criteria: {
              budget: `$${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}`,
              bedrooms: profile.bedrooms,
              property_type: profile.homeType,
              location: profile.preferredAreas
            }
          }
        });
      }

      // Score each listing
      const scoredListings = listings.map(listing => 
        listingScorer.scoreListing(listing, profile, tags)
      );

      // Categorize listings
      const categorizedResults = listingScorer.categorizeListings(scoredListings);

      // Add search summary with debug info
      const response = {
        ...categorizedResults,
        search_summary: {
          total_found: listings.length,
          top_picks_count: categorizedResults.top_picks.length,
          other_matches_count: categorizedResults.other_matches.length,
          search_criteria: {
            budget: `$${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}`,
            bedrooms: profile.bedrooms,
            property_type: profile.homeType,
            location: profile.preferredAreas
          }
        },
        debug_info: {
          sample_listings: listings.slice(0, 3).map(l => ({
            price: l.price,
            bedrooms: l.bedrooms,
            city: l.city,
            property_type: l.property_type
          })),
          profile_budget: { min: profile.budgetMin, max: profile.budgetMax },
          sample_scores: scoredListings.slice(0, 3).map(s => ({
            price: s.listing.price,
            city: s.listing.city,
            score: s.match_score,
            breakdown: s.score_breakdown
          }))
        }
      };

      res.json(response);
    } catch (error) {
      console.error("Error searching listings:", error);
      res.status(500).json({ 
        error: "Failed to search listings",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
