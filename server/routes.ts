import type { Express } from "express";
import { storage } from "./storage";
import { extractBuyerProfile, enhanceFormProfile, extractBuyerProfileWithTags } from "./openai";
import { tagEngine } from "./tag-engine";
import { parseProfileChanges, applyChangesToProfile, generateQuickEditSuggestions } from "./conversational-edit";
import { transactionLogger } from "./transaction-logger";
import { agentSearchService } from "./agent-search-service";
import { 
  insertBuyerProfileSchema, 
  buyerFormSchema, 
  agents, 
  buyerProfiles, 
  searchTransactions, 
  searchTransactionResults, 
  type InsertAgent 
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { eq } from "drizzle-orm";
import { processAgentInvites, inviteAgent } from "./agent-invite-service.js";

// Helper function to create NLP prompt from buyer profile
function createNLPPromptFromProfile(profile: any): string {
  const components = [];
  
  // Budget
  if (profile.budgetMin && profile.budgetMax) {
    components.push(`budget between $${profile.budgetMin.toLocaleString()} and $${profile.budgetMax.toLocaleString()}`);
  }
  
  // Property type and bedrooms
  if (profile.homeType && profile.bedrooms) {
    components.push(`${profile.bedrooms}-bedroom ${profile.homeType} home`);
  }
  
  // Bathrooms
  if (profile.bathrooms) {
    components.push(`at least ${profile.bathrooms} bathroom`);
  }
  
  // Location
  if (profile.preferredAreas && profile.preferredAreas.length > 0) {
    components.push(`in ${profile.preferredAreas.join(' or ')}`);
  }
  
  // Must-have features
  if (profile.mustHaveFeatures && profile.mustHaveFeatures.length > 0) {
    components.push(`with ${profile.mustHaveFeatures.join(', ')}`);
  }
  
  // Special needs
  if (profile.specialNeeds && profile.specialNeeds.length > 0) {
    components.push(`suitable for ${profile.specialNeeds.join(', ')}`);
  }
  
  return `Find a ${components.join(' ')}`;
}

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

// Agent-related schemas
const agentSetupSchema = z.object({
  token: z.string().min(1, "Setup token is required"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

const agentLoginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required")
});

const inviteAgentSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  brokerageName: z.string().min(1, "Brokerage name is required")
});

// Chat validation schemas
const validateContextSchema = z.object({
  buyer_id: z.number().int().positive("buyer_id must be a positive integer"),
  agent_id: z.number().int().positive("agent_id must be a positive integer")
});

// Chat API key validation middleware
function validateChatApiKey(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      preview: "Authentication required - missing Authorization header",
      error: "unauthorized",
      ready: false
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const expectedApiKey = 'rh_integration_2025_secure_key_847392';
  
  if (token !== expectedApiKey) {
    return res.status(401).json({
      success: false,
      preview: "Invalid API key provided",
      error: "unauthorized", 
      ready: false
    });
  }

  next();
}

export async function registerRoutes(app: Express): Promise<void> {
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
      console.log("Received profile data:", req.body);
      
      // Parse and validate the incoming data
      const profileData = insertBuyerProfileSchema.parse(req.body);
      
      // Ensure required server-side fields are set
      const profileToSave = {
        ...profileData,
        // Set agentId to default if not provided (for testing)
        agentId: profileData.agentId || 28,
        // Set createdAt server-side (will be overridden in storage.createBuyerProfile)
        createdAt: new Date().toISOString()
      };
      
      console.log(`Attempting to save profile for agent ID: ${profileToSave.agentId}`);
      
      const savedProfile = await storage.createBuyerProfile(profileToSave);
      
      console.log("Profile saved successfully with ID:", savedProfile.id);
      res.json(savedProfile);
    } catch (error) {
      console.error("Error in /api/buyer-profiles POST:", error);
      console.error("Error details:", error);
      res.status(400).json({ 
        error: "Failed to save profile",
        message: (error as Error).message 
      });
    }
  });

  // Get all buyer profiles (agent-specific)
  app.get("/api/buyer-profiles", async (req, res) => {
    try {
      // In development, use default agent for testing
      // In production, this should be extracted from session/JWT
      const agentId = req.headers['x-agent-id'] ? parseInt(req.headers['x-agent-id'] as string) : 28; // Default to same agent as save endpoint
      
      console.log(`Fetching profiles for agent ID: ${agentId}`);
      
      const profiles = await storage.getBuyerProfilesByAgent(agentId);
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

  // DEPRECATED: Use /api/agent-search instead
  // Keeping temporarily for backward compatibility
  /*
  app.post("/api/listings/search", async (req, res) => {
    const startTime = Date.now();
    let transactionId: string;
    
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

      // Start transaction logging
      transactionId = await transactionLogger.startSearchTransaction({
        profileId,
        profile,
        searchParameters: {
          budget_min: profile.budgetMin,
          budget_max: profile.budgetMax,
          bedrooms: profile.bedrooms,
          property_type: profile.homeType,
          location: profile.preferredAreas
        },
        searchMethod: 'basic',
        searchTrigger: 'agent_initiated'
      });

      // Get profile with tags for enhanced scoring
      const profileWithTags = await storage.getProfileWithTags(profileId);
      const tags = profileWithTags?.tags || [];

      // Import the services
      const { listingScorer } = await import('./listing-scorer');

      // Search using authentic Repliers API data only
      let listings;
      const hasApiKey = !!process.env.REPLIERS_API_KEY;
      
      if (!hasApiKey) {
        throw new Error('Repliers API key is required for listing search');
      }
      
      const { repliersAPI } = await import('./repliers-api');
      listings = await repliersAPI.searchListings(profile);
      
      if (!listings || listings.length === 0) {
        // Save empty results transaction
        await transactionLogger.saveSearchResults(transactionId, {
          rawListings: [],
          scoredListings: [],
          categorizedResults: { top_picks: [], other_matches: [] },
          searchSummary: {
            total_found: 0,
            search_criteria: {
              budget: `$${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}`,
              bedrooms: profile.bedrooms,
              property_type: profile.homeType,
              location: profile.preferredAreas
            }
          },
          executionMetrics: {
            totalTime: Date.now() - startTime,
            apiCalls: 1
          }
        });

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

      // Save complete search results transaction
      await transactionLogger.saveSearchResults(transactionId, {
        rawListings: listings,
        scoredListings: scoredListings,
        categorizedResults: categorizedResults,
        searchSummary: response.search_summary,
        chatBlocks: categorizedResults.chat_blocks,
        executionMetrics: {
          totalTime: Date.now() - startTime,
          apiCalls: 1
        }
      });

      // Save initial outcomes (will be updated when agent interacts)
      await transactionLogger.saveSearchOutcomes(transactionId, profileId, {
        searchQualityRating: 7, // Default rating, will be updated if agent provides feedback
        totalSessionTime: Date.now() - startTime
      });

      res.json(response);
    } catch (error) {
      console.error("Error searching listings:", error);
      res.status(500).json({ 
        error: "Failed to search listings",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  */

  // DEPRECATED: Use /api/agent-search instead  
  /*
  // Enhanced Visual Intelligence Listing Search with Caching and Manual Refresh
  app.post("/api/listings/search-enhanced", async (req, res) => {
    const startTime = Date.now();
    let transactionId: string;
    
    try {
      const { profileId, forceRefresh = false } = req.body;
      
      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }

      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const profileWithTags = await storage.getProfileWithTags(profileId);
      const tags = profileWithTags?.tags || [];

      // Use cached search service for intelligent caching
      const { cachedSearchService } = await import('./cached-search-service');
      const { results, cacheStatus, fromCache } = await cachedSearchService.getSearchResults(
        profile,
        tags,
        'enhanced',
        forceRefresh
      );

      // Start transaction logging
      transactionId = await transactionLogger.startSearchTransaction({
        profileId,
        profile,
        searchParameters: {
          budget_min: profile.budgetMin,
          budget_max: profile.budgetMax,
          bedrooms: profile.bedrooms,
          property_type: profile.homeType,
          location: profile.preferredAreas
        },
        searchMethod: 'enhanced',
        searchTrigger: forceRefresh ? 'manual_refresh' : (fromCache ? 'cache_hit' : 'agent_initiated')
      });

      // Log search transaction results (cached or fresh)
      if (fromCache) {
        console.log(`📋 Using cached results for profile ${profileId}, cache age: ${cacheStatus.cacheAge}h`);
        
        // Log cache hit transaction
        await transactionLogger.saveSearchResults(transactionId, {
          rawListings: [],
          scoredListings: results.top_picks.concat(results.other_matches),
          categorizedResults: {
            top_picks: results.top_picks,
            other_matches: results.other_matches
          },
          searchSummary: 'search_summary' in results ? results.search_summary : {
            total_found: results.top_picks.length + results.other_matches.length,
            top_picks_count: results.top_picks.length,
            other_matches_count: results.other_matches.length,
            visual_analysis_count: 0,
            search_criteria: profile
          },
          chatBlocks: results.chat_blocks,
          executionMetrics: {
            totalTime: Date.now() - startTime,
            apiCalls: 0, // No API calls for cached results
            cached: true,
            cacheAge: cacheStatus.cacheAge
          }
        });
      }

      // Save search outcomes
      await transactionLogger.saveSearchOutcomes(transactionId, profileId, {
        searchQualityRating: fromCache ? 7 : 8, // Slightly lower for cached to encourage feedback
        totalSessionTime: Date.now() - startTime,
        cacheHit: fromCache,
        cacheAge: cacheStatus.cacheAge
      });

      // Add cache metadata to response
      const responseWithCache = {
        ...results,
        cache_status: {
          from_cache: fromCache,
          last_updated: cacheStatus.lastUpdated,
          cache_age_hours: cacheStatus.cacheAge,
          expires_at: cacheStatus.expiresAt
        }
      };

      res.json(responseWithCache);
    } catch (error) {
      console.error("Error in enhanced listing search:", error);
      res.status(500).json({ 
        error: "Failed to perform enhanced search",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  */

  // DEPRECATED: Use /api/agent-search instead
  /*
  // Hybrid search endpoint - immediate results with async enhancement
  app.post("/api/listings/search-hybrid", async (req, res) => {
    const startTime = Date.now();
    let transactionId: string;
    
    try {
      const { profileId, forceRefresh = false } = req.body;
      
      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }

      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const profileWithTags = await storage.getProfileWithTags(profileId);
      const tags = profileWithTags?.tags || [];

      // Use cached search service for intelligent caching
      const { cachedSearchService } = await import('./cached-search-service');
      const { results, cacheStatus, fromCache } = await cachedSearchService.getSearchResults(
        profile,
        tags,
        'hybrid',
        forceRefresh
      );

      // Start transaction logging
      transactionId = await transactionLogger.startSearchTransaction({
        profileId,
        profile,
        searchParameters: {
          budget_min: profile.budgetMin,
          budget_max: profile.budgetMax,
          bedrooms: profile.bedrooms,
          property_type: profile.homeType,
          location: profile.preferredAreas
        },
        searchMethod: 'hybrid',
        searchTrigger: forceRefresh ? 'manual_refresh' : (fromCache ? 'cache_hit' : 'agent_initiated')
      });

      // Log search transaction results (cached or fresh)
      if (fromCache) {
        console.log(`📋 Using cached hybrid results for profile ${profileId}, cache age: ${cacheStatus.cacheAge}h`);
        
        // Log cache hit transaction
        await transactionLogger.saveSearchResults(transactionId, {
          rawListings: [],
          scoredListings: results.top_picks.concat(results.other_matches),
          categorizedResults: {
            top_picks: results.top_picks,
            other_matches: results.other_matches
          },
          searchSummary: 'search_summary' in results ? results.search_summary : {
            total_found: results.top_picks.length + results.other_matches.length,
            top_picks_count: results.top_picks.length,
            other_matches_count: results.other_matches.length,
            visual_analysis_count: 0,
            search_criteria: profile
          },
          chatBlocks: results.chat_blocks,
          executionMetrics: {
            totalTime: Date.now() - startTime,
            apiCalls: 0, // No API calls for cached results
            cached: true,
            cacheAge: cacheStatus.cacheAge
          }
        });

        // Save search outcomes
        await transactionLogger.saveSearchOutcomes(transactionId, profileId, {
          searchQualityRating: 7,
          totalSessionTime: Date.now() - startTime,
          cacheHit: fromCache,
          cacheAge: cacheStatus.cacheAge
        });

        // Add cache metadata to response
        const responseWithCache = {
          ...results,
          search_type: 'hybrid',
          cache_status: {
            from_cache: fromCache,
            last_updated: cacheStatus.lastUpdated,
            cache_age_hours: cacheStatus.cacheAge,
            expires_at: cacheStatus.expiresAt
          }
        };

        return res.json(responseWithCache);
      }

      // For fresh results, use hybrid async scorer
      const { hybridAsyncScorer } = await import('./hybrid-async-scorer');
      
      // Get listings from Repliers API
      const { repliersAPI } = await import('./repliers-api');
      const listingsResponse = await repliersAPI.searchListings(profile);
      
      if (!listingsResponse || listingsResponse.length === 0) {
        // Handle empty results
        await transactionLogger.saveSearchResults(transactionId, {
          rawListings: [],
          scoredListings: [],
          categorizedResults: { top_picks: [], other_matches: [] },
          searchSummary: {
            total_found: 0,
            top_picks_count: 0,
            other_matches_count: 0,
            visual_analysis_count: 0,
            search_criteria: profile
          },
          chatBlocks: ["No listings found matching your criteria."],
          executionMetrics: {
            totalTime: Date.now() - startTime,
            apiCalls: 1,
            cached: false,
            analysisInProgress: false
          }
        });

        await transactionLogger.completeSearchTransaction(transactionId);

        return res.json({
          top_picks: [],
          other_matches: [],
          chat_blocks: ["No listings found matching your criteria. Try adjusting your search parameters."],
          search_summary: {
            total_found: 0,
            top_picks_count: 0,
            other_matches_count: 0,
            visual_analysis_count: 0,
            search_criteria: profile
          },
          search_type: 'hybrid',
          analysis_in_progress: false,
          cache_status: {
            from_cache: false,
            last_updated: new Date().toISOString(),
            cache_age_hours: 0
          }
        });
      }

      console.log(`🚀 Starting hybrid search for ${listingsResponse.length} listings`);

      // Get immediate basic results with async enhancement
      const hybridResults = await hybridAsyncScorer.scoreWithProgressiveEnhancement(
        listingsResponse,
        profile,
        tags
      );

      // Log search results for immediate response
      await transactionLogger.saveSearchResults(transactionId, {
        rawListings: listingsResponse,
        scoredListings: hybridResults.immediate.top_picks.concat(hybridResults.immediate.other_matches),
        categorizedResults: hybridResults.immediate,
        searchSummary: {
          total_found: listingsResponse.length,
          top_picks_count: hybridResults.immediate.top_picks.length,
          other_matches_count: hybridResults.immediate.other_matches.length,
          visual_analysis_count: hybridResults.analysisProgress?.total || 0,
          search_criteria: profile
        },
        chatBlocks: hybridResults.immediate.chat_blocks,
        executionMetrics: {
          totalTime: Date.now() - startTime,
          apiCalls: 1,
          cached: false,
          analysisInProgress: true
        }
      });

      // Save search outcomes
      await transactionLogger.saveSearchOutcomes(transactionId, profileId, {
        searchQualityRating: 8,
        totalSessionTime: Date.now() - startTime,
        cacheHit: false,
        analysisInProgress: true
      });

      console.log(`⚡ Hybrid search immediate results completed in ${Date.now() - startTime}ms`);

      // Return immediate response with analysis progress
      const immediateResponse = {
        ...hybridResults.immediate,
        search_type: 'hybrid',
        analysis_in_progress: true,
        analysis_progress: hybridResults.analysisProgress,
        cache_status: {
          from_cache: false,
          last_updated: new Date().toISOString(),
          cache_age_hours: 0
        }
      };

      res.json(immediateResponse);

    } catch (error) {
      console.error("Error in hybrid listing search:", error);
      res.status(500).json({ 
        error: "Failed to perform hybrid search",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Agent Interaction Logging APIs - Phase 1 Transaction Logging

  // Log agent interaction during search session
  app.post("/api/agent-interactions", async (req, res) => {
    try {
      const { transactionId, profileId, interactionType, listingId, interactionData, agentConfidence } = req.body;

      if (!transactionId || !profileId || !interactionType || !interactionData) {
        return res.status(400).json({ error: "Missing required fields for agent interaction" });
      }

      await transactionLogger.logAgentInteraction(transactionId, profileId, {
        interactionType,
        listingId,
        interactionData,
        agentConfidence
      });

      res.json({ success: true, message: "Agent interaction logged successfully" });
    } catch (error) {
      console.error("Error logging agent interaction:", error);
      res.status(500).json({ 
        error: "Failed to log agent interaction",
        message: (error as Error).message 
      });
    }
  });
  */

  // Update search outcomes with agent feedback
  app.post("/api/search-outcomes", async (req, res) => {
    try {
      const { transactionId, profileId, outcomes } = req.body;

      if (!transactionId || !profileId) {
        return res.status(400).json({ error: "Missing transactionId or profileId" });
      }

      await transactionLogger.saveSearchOutcomes(transactionId, profileId, outcomes);

      res.json({ success: true, message: "Search outcomes saved successfully" });
    } catch (error) {
      console.error("Error saving search outcomes:", error);
      res.status(500).json({ 
        error: "Failed to save search outcomes",
        message: (error as Error).message 
      });
    }
  });

  // Update existing search outcomes (for follow-up data)
  app.patch("/api/search-outcomes/:transactionId", async (req, res) => {
    try {
      const { transactionId } = req.params;
      const outcomes = req.body;

      await transactionLogger.updateSearchOutcomes(transactionId, outcomes);

      res.json({ success: true, message: "Search outcomes updated successfully" });
    } catch (error) {
      console.error("Error updating search outcomes:", error);
      res.status(500).json({ 
        error: "Failed to update search outcomes",
        message: (error as Error).message 
      });
    }
  });

  // Get complete transaction data for analysis
  app.get("/api/transactions/:transactionId", async (req, res) => {
    try {
      const { transactionId } = req.params;

      const transactionData = await transactionLogger.getTransactionData(transactionId);

      if (!transactionData.transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      res.json(transactionData);
    } catch (error) {
      console.error("Error getting transaction data:", error);
      res.status(500).json({ 
        error: "Failed to get transaction data",
        message: (error as Error).message 
      });
    }
  });

  // Get recent transactions for a profile (for pattern analysis)
  app.get("/api/profiles/:profileId/transactions", async (req, res) => {
    try {
      const { profileId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const transactions = await transactionLogger.getProfileTransactions(parseInt(profileId), limit);

      res.json(transactions);
    } catch (error) {
      console.error("Error getting profile transactions:", error);
      res.status(500).json({ 
        error: "Failed to get profile transactions",
        message: (error as Error).message 
      });
    }
  });

  // Cache Management APIs

  // Get cache status for a profile
  app.get("/api/cache/status/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const searchMethod = (req.query.searchMethod as string) || 'enhanced';
      const validSearchMethods = ['enhanced', 'basic', 'hybrid'] as const;
      const typedSearchMethod = validSearchMethods.includes(searchMethod as any) ? 
        searchMethod as 'enhanced' | 'basic' | 'hybrid' : 'enhanced';
      
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const profileWithTags = await storage.getProfileWithTags(profileId);
      const tags = profileWithTags?.tags || [];

      const { cachedSearchService } = await import('./cached-search-service');
      const cacheStatus = await cachedSearchService.getCacheStatus(profile, tags, typedSearchMethod);

      res.json(cacheStatus);
    } catch (error) {
      console.error("Error getting cache status:", error);
      res.status(500).json({ 
        error: "Failed to get cache status",
        message: (error as Error).message 
      });
    }
  });

  // Invalidate cache for a profile (when profile changes)
  app.delete("/api/cache/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const { cachedSearchService } = await import('./cached-search-service');
      await cachedSearchService.invalidateCache(profileId);

      res.json({ success: true, message: "Cache invalidated successfully" });
    } catch (error) {
      console.error("Error invalidating cache:", error);
      res.status(500).json({ 
        error: "Failed to invalidate cache",
        message: (error as Error).message 
      });
    }
  });

  // Clean up expired cache entries (maintenance endpoint)
  app.post("/api/cache/cleanup", async (req, res) => {
    try {
      const { cachedSearchService } = await import('./cached-search-service');
      const deletedCount = await cachedSearchService.cleanupExpiredCache();

      res.json({ 
        success: true, 
        message: `Cleaned up ${deletedCount} expired cache entries` 
      });
    } catch (error) {
      console.error("Error cleaning up cache:", error);
      res.status(500).json({ 
        error: "Failed to clean up cache",
        message: (error as Error).message 
      });
    }
  });

  // Agent feedback on search results (for immediate learning)
  app.post("/api/search-feedback", async (req, res) => {
    try {
      const { 
        transactionId, 
        profileId, 
        resultRelevance, 
        topPicksAccuracy, 
        listingFeedback, 
        improvementSuggestions,
        agentNotes 
      } = req.body;

      if (!transactionId || !profileId) {
        return res.status(400).json({ error: "Missing transactionId or profileId" });
      }

      // Log feedback as agent interaction
      await transactionLogger.logAgentInteraction(transactionId, profileId, {
        interactionType: 'search_refined',
        interactionData: {
          feedback_type: 'search_quality',
          result_relevance: resultRelevance,
          top_picks_accuracy: topPicksAccuracy,
          listing_feedback: listingFeedback,
          improvement_suggestions: improvementSuggestions,
          agent_notes: agentNotes
        },
        agentConfidence: topPicksAccuracy
      });

      // Update outcomes with feedback ratings
      await transactionLogger.updateSearchOutcomes(transactionId, {
        searchQualityRating: resultRelevance,
        agentSatisfactionRating: topPicksAccuracy,
        agentNotes: agentNotes
      });

      res.json({ success: true, message: "Search feedback logged successfully" });
    } catch (error) {
      console.error("Error logging search feedback:", error);
      res.status(500).json({ 
        error: "Failed to log search feedback",
        message: (error as Error).message 
      });
    }
  });

  // Get shareable profile data (for client dashboard API)
  app.get("/api/profiles/share/:shareId", async (req, res) => {
    try {
      const { shareId } = req.params;
      
      const { profileShareableService } = await import('./profile-share');
      const shareableProfile = await profileShareableService.getShareableProfile(shareId);
      
      if (!shareableProfile) {
        return res.status(404).json({ error: "Shareable profile not found" });
      }

      res.json(shareableProfile);
    } catch (error) {
      console.error("Error getting shareable profile:", error);
      res.status(500).json({ 
        error: "Failed to get shareable profile",
        message: (error as Error).message 
      });
    }
  });

  // Get listings for shareable profile (with authentic MLS data and images)
  app.get("/api/listings/search", async (req, res) => {
    try {
      const { profileId } = req.query;
      
      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }

      const profile = await storage.getBuyerProfile(parseInt(profileId as string));
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Get profile with tags for enhanced scoring
      const profileWithTags = await storage.getProfileWithTags(parseInt(profileId as string));
      const tags = profileWithTags?.tags || [];

      // Use basic scoring for immediate display (hybrid approach)

      // Search using authentic Repliers API data with images
      const hasApiKey = !!process.env.REPLIERS_API_KEY;
      
      if (!hasApiKey) {
        throw new Error('Repliers API key is required for listing search');
      }
      
      const { repliersAPI } = await import('./repliers-api');
      const rawListings = await repliersAPI.searchListings(profile);
      
      if (!rawListings || rawListings.length === 0) {
        return res.json({
          top_picks: [],
          other_matches: [],
          chat_blocks: ["No listings found matching your criteria. Try adjusting your search parameters."],
          search_summary: {
            total_found: 0,
            top_picks_count: 0,
            other_matches_count: 0,
            visual_analysis_count: 0,
            search_criteria: {
              budget: `$${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}`,
              bedrooms: profile.bedrooms,
              bathrooms: profile.bathrooms,
              property_type: profile.homeType,
              location: profile.preferredAreas
            }
          }
        });
      }

      // Parse listings to capture ALL data including descriptions
      const { listingParser } = await import('./services/listing-parser');
      const parsedListings = rawListings.map((rawListing: any) => {
        const parsed = listingParser.parse(rawListing, 'repliers');
        // Return listing in format expected by scorer, but with all parsed data
        return {
          ...rawListing,
          // Add parsed descriptions
          description: parsed.data.descriptions.main || parsed.data.descriptions.public_remarks,
          public_remarks: parsed.data.descriptions.public_remarks,
          // Add parsed features
          features: parsed.data.features.all || rawListing.features || [],
          interior_features: parsed.data.features.interior,
          exterior_features: parsed.data.features.exterior,
          // Add financial details
          taxes_annual: parsed.data.financial.taxes?.annual_amount,
          hoa_fee: parsed.data.financial.hoa?.fee,
          // Add quality score
          data_quality_score: parsed.parse_quality_score,
          // Keep square_feet if it was parsed
          square_feet: parsed.square_feet || rawListing.square_feet
        };
      });

      // Use parsed listings with all data
      const { hybridListingScorer } = await import('./hybrid-listing-scorer');
      const response = await hybridListingScorer.scoreListingsHybrid(parsedListings, profile, tags);

      res.json(response);
    } catch (error) {
      console.error("Error searching listings:", error);
      res.status(500).json({ 
        error: "Failed to search listings",
        message: (error as Error).message 
      });
    }
  });

  // Create Shareable Profile Link (One per client like Zillow)
  app.post("/api/profiles/share", async (req, res) => {
    try {
      const { 
        profileId, 
        agentName, 
        agentEmail, 
        agentPhone,
        customMessage, 
        brandingColors,
        showVisualAnalysis,
        expiresInDays 
      } = req.body;

      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }

      const { profileShareableService } = await import('./profile-share');
      const shareableProfile = await profileShareableService.createShareableProfile({
        profileId,
        agentName,
        agentEmail,
        agentPhone,
        customMessage,
        brandingColors,
        showVisualAnalysis,
        expiresInDays
      });

      res.json(shareableProfile);
    } catch (error) {
      console.error("Error creating shareable profile:", error);
      res.status(500).json({ 
        error: "Failed to create shareable profile link",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get Shareable Profile Info
  app.get("/api/profiles/share/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const { profileShareableService } = await import('./profile-share');
      const shareableProfile = await profileShareableService.getActiveShareableProfile(profileId);

      if (!shareableProfile) {
        return res.status(404).json({ error: "No active shareable link found for this profile" });
      }

      res.json(shareableProfile);
    } catch (error) {
      console.error("Error fetching shareable profile:", error);
      res.status(500).json({ 
        error: "Failed to fetch shareable profile",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate Personal Client Message (On-Demand)
  app.post("/api/listings/generate-personal-message", async (req, res) => {
    try {
      const { listingId, profileId } = req.body;

      if (!listingId || !profileId) {
        return res.status(400).json({ error: "Listing ID and Profile ID are required" });
      }

      // Get buyer profile
      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Get listing data from visual analysis cache
      const { VisionIntelligenceService } = await import('./vision-intelligence');
      const visionService = new VisionIntelligenceService();
      
      // Get visual analysis from database
      const visualAnalysis = await visionService.getVisualAnalysisFromDatabase(listingId);
      if (!visualAnalysis) {
        return res.status(404).json({ error: "Visual analysis not found for this listing" });
      }

      // Create a mock scored listing for the message generation
      const scoredListing = {
        listing: {
          id: listingId,
          address: "Property Address", // This would come from your listings cache
          price: 0 // This would come from your listings cache
        },
        matched_features: [] // This would come from your scoring system
      };

      // Generate personal message
      const personalMessage = await visionService.generatePersonalMessage(
        visualAnalysis,
        profile,
        scoredListing
      );

      res.json({ personalMessage });
    } catch (error) {
      console.error("Error generating personal message:", error);
      res.status(500).json({ 
        error: "Failed to generate personal message",
        message: (error as Error).message 
      });
    }
  });

  // Create Shareable Listing Link (Individual)
  app.post("/api/listings/share", async (req, res) => {
    try {
      const { 
        listingId, 
        profileId, 
        agentName, 
        agentEmail, 
        customMessage, 
        expiresInDays 
      } = req.body;

      if (!listingId) {
        return res.status(400).json({ error: "Listing ID is required" });
      }

      const { shareableListingService } = await import('./shareable-listing');
      const shareableListing = await shareableListingService.createShareableLink({
        listingId,
        profileId,
        agentName,
        agentEmail,
        customMessage,
        expiresInDays
      });

      res.json(shareableListing);
    } catch (error) {
      console.error("Error creating shareable link:", error);
      res.status(500).json({ 
        error: "Failed to create shareable link",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate Agent Copy Text for Sharing
  app.post("/api/listings/copy-text", async (req, res) => {
    try {
      const { listingId, shareId, format = 'text' } = req.body;

      if (!listingId || !shareId) {
        return res.status(400).json({ error: "Listing ID and Share ID are required" });
      }

      const { shareableListingService } = await import('./shareable-listing');
      const shareableListing = await shareableListingService.getShareableListing(shareId);
      
      if (!shareableListing) {
        return res.status(404).json({ error: "Shareable listing not found" });
      }

      // Get listing details (mock for now, would normally fetch from Repliers API)
      const mockListing = {
        id: listingId,
        address: "123 Main St, Austin, TX",
        price: 450000,
        bedrooms: 3,
        bathrooms: 2,
        square_feet: 1800,
        features: ["Modern Kitchen", "Hardwood Floors"]
      };

      let response;
      switch (format) {
        case 'whatsapp':
          response = { 
            whatsappUrl: shareableListingService.generateWhatsAppText(mockListing, shareableListing)
          };
          break;
        case 'email':
          response = shareableListingService.generateEmailText(mockListing, shareableListing);
          break;
        default:
          response = { 
            copyText: shareableListingService.generateAgentCopyText(mockListing, shareableListing)
          };
      }

      res.json(response);
    } catch (error) {
      console.error("Error generating copy text:", error);
      res.status(500).json({ 
        error: "Failed to generate copy text",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Serve Shareable Profile Page (like Zillow client dashboard)
  app.get("/client/:shareId", async (req, res) => {
    try {
      const { shareId } = req.params;
      
      const { profileShareableService } = await import('./profile-share');
      const shareableProfile = await profileShareableService.getShareableProfile(shareId);
      
      if (!shareableProfile) {
        return res.status(404).send(`
          <html>
            <head><title>Client Dashboard Not Found</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Client Dashboard Not Found</h1>
              <p>This client dashboard link may have expired or been removed.</p>
            </body>
          </html>
        `);
      }

      // Get the buyer profile details
      const profile = await storage.getBuyerProfile(shareableProfile.profileId);
      if (!profile) {
        return res.status(404).send(`
          <html>
            <head><title>Profile Not Found</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Profile Not Found</h1>
              <p>The buyer profile associated with this link could not be found.</p>
            </body>
          </html>
        `);
      }

      // Get enhanced search results for this profile
      const profileWithTags = await storage.getProfileWithTags(shareableProfile.profileId);
      const tags = profileWithTags?.tags || [];

      let listings = [];
      let searchResults = null;

      try {
        const { repliersAPI } = await import('./repliers-api');
        listings = await repliersAPI.searchListings(profile);
        
        // Use basic scoring with Repliers CDN URLs (no proxy needed)
        const { listingScorer } = await import('./listing-scorer');
        const scoredListings = listings.map(listing => listingScorer.scoreListing(listing, profile, tags));
        searchResults = listingScorer.categorizeListings(scoredListings);
      } catch (error) {
        console.error("Error fetching listings for shareable profile:", error);
        searchResults = {
          top_picks: [],
          other_matches: [],
          chat_blocks: ["Unable to load property listings at this time."]
        };
      }

      // Generate beautiful client dashboard page
      res.send(`
        <html>
          <head>
            <title>${profile.name}'s Property Matches</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta property="og:title" content="Your Personalized Property Matches">
            <meta property="og:description" content="Curated properties selected specifically for ${profile.name}">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
              }
              .container { max-width: 1200px; margin: 0 auto; }
              .header { 
                background: white; 
                border-radius: 16px; 
                padding: 40px; 
                margin-bottom: 30px; 
                box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
              }
              .client-name { font-size: 2.5em; font-weight: bold; color: #333; margin-bottom: 10px; }
              .subtitle { font-size: 1.2em; color: #666; margin-bottom: 20px; }
              .agent-message { 
                background: #f8f9fa; 
                padding: 20px; 
                border-radius: 12px; 
                border-left: 4px solid #667eea; 
                margin: 20px 0;
              }
              .stats { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                gap: 20px; 
                margin: 30px 0; 
              }
              .stat-card { 
                background: white; 
                padding: 25px; 
                border-radius: 12px; 
                text-align: center; 
                box-shadow: 0 4px 16px rgba(0,0,0,0.1); 
              }
              .stat-number { font-size: 2.5em; font-weight: bold; color: #667eea; }
              .stat-label { color: #666; margin-top: 5px; }
              .listings-section { 
                background: white; 
                border-radius: 16px; 
                padding: 40px; 
                box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
              }
              .listing-card { 
                border: 2px solid #f0f0f0; 
                border-radius: 12px; 
                padding: 25px; 
                margin-bottom: 25px; 
                transition: all 0.3s ease;
              }
              .listing-card:hover { 
                border-color: #667eea; 
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.15); 
              }
              .listing-header { 
                display: flex; 
                justify-content: between; 
                align-items: flex-start; 
                margin-bottom: 20px; 
              }
              .listing-price { font-size: 1.8em; font-weight: bold; color: #333; }
              .listing-address { color: #666; margin: 5px 0; }
              .listing-details { color: #888; }
              .match-score { 
                background: linear-gradient(135deg, #667eea, #764ba2); 
                color: white; 
                padding: 8px 16px; 
                border-radius: 20px; 
                font-weight: bold; 
                margin-left: auto;
              }
              .listing-reason { 
                background: #f8f9fa; 
                padding: 15px; 
                border-radius: 8px; 
                margin: 15px 0; 
                font-style: italic; 
              }
              .features { 
                display: flex; 
                flex-wrap: wrap; 
                gap: 8px; 
                margin: 15px 0; 
              }
              .feature { 
                background: #e3f2fd; 
                color: #1976d2; 
                padding: 4px 12px; 
                border-radius: 16px; 
                font-size: 0.9em; 
              }
              .agent-footer { 
                background: #2c3e50; 
                color: white; 
                padding: 40px; 
                border-radius: 16px; 
                margin-top: 30px; 
                text-align: center; 
              }
              .agent-footer h3 { margin-bottom: 15px; }
              .contact-info { margin: 10px 0; }
              @media (max-width: 768px) {
                .header { padding: 30px 20px; }
                .client-name { font-size: 2em; }
                .stats { grid-template-columns: repeat(2, 1fr); }
                .listing-header { flex-direction: column; gap: 15px; }
                .match-score { margin-left: 0; align-self: flex-start; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <!-- Header -->
              <div class="header">
                <div class="client-name">Hello ${profile.name}! 👋</div>
                <div class="subtitle">Your Personalized Property Matches</div>
                
                ${shareableProfile.customMessage ? `
                  <div class="agent-message">
                    <strong>Message from ${shareableProfile.agentName || 'Your Agent'}:</strong><br>
                    ${shareableProfile.customMessage}
                  </div>
                ` : ''}

                <!-- Search Criteria -->
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-top: 20px;">
                  <h4 style="margin-bottom: 15px; color: #333;">Your Search Criteria</h4>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div><strong>Budget:</strong> $${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}</div>
                    <div><strong>Bedrooms:</strong> ${profile.bedrooms}</div>
                    <div><strong>Bathrooms:</strong> ${profile.bathrooms}</div>
                    <div><strong>Property Type:</strong> ${profile.homeType}</div>
                    <div><strong>Location:</strong> ${profile.preferredAreas?.join(', ')}</div>
                  </div>
                </div>
              </div>

              <!-- Stats -->
              <div class="stats">
                <div class="stat-card">
                  <div class="stat-number">${searchResults?.top_picks?.length || 0}</div>
                  <div class="stat-label">Top Matches</div>
                </div>
                <div class="stat-card">
                  <div class="stat-number">${searchResults?.other_matches?.length || 0}</div>
                  <div class="stat-label">Other Options</div>
                </div>
                <div class="stat-card">
                  <div class="stat-number">${(searchResults?.top_picks?.length || 0) + (searchResults?.other_matches?.length || 0)}</div>
                  <div class="stat-label">Total Properties</div>
                </div>
                ${shareableProfile.showVisualAnalysis ? `
                  <div class="stat-card">
                    <div class="stat-number">AI</div>
                    <div class="stat-label">Visual Analysis</div>
                  </div>
                ` : ''}
              </div>

              <!-- Listings -->
              <div class="listings-section">
                <h2 style="margin-bottom: 30px; color: #333;">🏆 Your Top Property Matches</h2>
                
                ${searchResults?.top_picks?.length > 0 ? searchResults.top_picks.map(listing => `
                  <div class="listing-card">
                    <div class="listing-header">
                      <div>
                        <div class="listing-price">$${listing.listing.price.toLocaleString()}</div>
                        <div class="listing-address">${listing.listing.address}</div>
                        <div class="listing-details">
                          ${listing.listing.bedrooms}BR • ${listing.listing.bathrooms}BA • ${listing.listing.property_type}
                          ${listing.listing.square_feet ? ` • ${listing.listing.square_feet.toLocaleString()} sqft` : ''}
                        </div>
                      </div>
                      <div class="match-score">${Math.round(listing.match_score * 100)}% Match</div>
                    </div>
                    
                    <div class="listing-reason">
                      💡 ${(listing as any).enhancedReason || (listing as any).reason || 'Great property match'}
                    </div>

                    ${listing.matched_features?.length > 0 ? `
                      <div class="features">
                        ${listing.matched_features.map(feature => `<span class="feature">✅ ${feature}</span>`).join('')}
                      </div>
                    ` : ''}

                    ${(listing as any).visualTagMatches?.length > 0 ? `
                      <div class="features">
                        ${(listing as any).visualTagMatches.map((tag: string) => `<span class="feature" style="background: #e8f5e8;">👁️ ${tag}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('') : '<p style="text-align: center; color: #666; padding: 40px;">No properties currently match your exact criteria. Your agent will contact you with alternatives.</p>'}

                ${searchResults?.other_matches?.length > 0 ? `
                  <h3 style="margin: 40px 0 20px 0; color: #333;">🔍 Other Properties to Consider</h3>
                  ${searchResults.other_matches.slice(0, 3).map(listing => `
                    <div class="listing-card" style="border-color: #ffc107; background: #fffbf0;">
                      <div class="listing-header">
                        <div>
                          <div class="listing-price">$${listing.listing.price.toLocaleString()}</div>
                          <div class="listing-address">${listing.listing.address}</div>
                          <div class="listing-details">
                            ${listing.listing.bedrooms}BR • ${listing.listing.bathrooms}BA • ${listing.listing.property_type}
                          </div>
                        </div>
                        <div class="match-score" style="background: #ffc107; color: #333;">${Math.round(listing.match_score * 100)}% Match</div>
                      </div>
                      <div class="listing-reason">
                        💡 ${(listing as any).enhancedReason || (listing as any).reason || 'Alternative property option'}
                      </div>
                    </div>
                  `).join('')}
                ` : ''}
              </div>

              <!-- Agent Footer -->
              ${shareableProfile.agentName ? `
                <div class="agent-footer">
                  <h3>Ready to Schedule Viewings?</h3>
                  <p>Contact your agent to discuss these properties and schedule tours.</p>
                  
                  <div style="margin-top: 20px;">
                    <div style="font-size: 1.2em; font-weight: bold;">${shareableProfile.agentName}</div>
                    ${shareableProfile.agentEmail ? `<div class="contact-info">📧 ${shareableProfile.agentEmail}</div>` : ''}
                    ${shareableProfile.agentPhone ? `<div class="contact-info">📞 ${shareableProfile.agentPhone}</div>` : ''}
                  </div>
                </div>
              ` : ''}
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error serving shareable profile:", error);
      res.status(500).send("Error loading client dashboard");
    }
  });

  // Serve Shareable Listing Page (Individual listings)
  app.get("/share/:shareId", async (req, res) => {
    try {
      const { shareId } = req.params;
      
      const { shareableListingService } = await import('./shareable-listing');
      const shareableListing = await shareableListingService.getShareableListing(shareId);
      
      if (!shareableListing) {
        return res.status(404).send(`
          <html>
            <head><title>Listing Not Found</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Listing Not Found</h1>
              <p>This listing link may have expired or been removed.</p>
            </body>
          </html>
        `);
      }

      // Get full listing details from Repliers API
      const { repliersAPI } = await import('./repliers-api');
      const listing = await repliersAPI.getListingDetails(shareableListing.listingId);
      
      if (!listing) {
        return res.status(404).send(`
          <html>
            <head><title>Listing Unavailable</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Listing Unavailable</h1>
              <p>This property listing is no longer available or has been removed.</p>
              ${shareableListing.agentName ? `
                <div style="margin-top: 30px; padding: 20px; background: #f9f9f9; border-radius: 8px;">
                  <h3>Contact Your Agent</h3>
                  <p><strong>${shareableListing.agentName}</strong></p>
                  ${shareableListing.agentEmail ? `<p>Email: ${shareableListing.agentEmail}</p>` : ''}
                </div>
              ` : ''}
            </body>
          </html>
        `);
      }

      const priceFormatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(listing.price);

      // Enhanced listing view with full property details
      res.send(`
        <html>
          <head>
            <title>${listing.address} - ${priceFormatted}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta property="og:title" content="${listing.address} - ${priceFormatted}">
            <meta property="og:description" content="${listing.bedrooms}BR/${listing.bathrooms}BA ${listing.property_type} in ${listing.city}, ${listing.state}">
            ${listing.images && listing.images[0] ? `<meta property="og:image" content="${listing.images[0]}">` : ''}
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; background: #f8f9fa; }
              .container { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; }
              .price { font-size: 2.5em; font-weight: bold; margin: 0; }
              .address { font-size: 1.2em; margin: 10px 0 0 0; opacity: 0.9; }
              .details { display: flex; gap: 20px; margin: 20px 0; }
              .detail-item { text-align: center; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; flex: 1; }
              .detail-number { font-size: 1.8em; font-weight: bold; }
              .detail-label { font-size: 0.9em; opacity: 0.8; margin-top: 5px; }
              .content { padding: 30px; }
              .section { margin-bottom: 30px; }
              .section h3 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-bottom: 15px; }
              .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 30px; }
              .image { border-radius: 8px; overflow: hidden; }
              .image img { width: 100%; height: 200px; object-fit: cover; }
              .features { display: flex; flex-wrap: wrap; gap: 8px; }
              .feature { background: #e3f2fd; color: #1976d2; padding: 6px 12px; border-radius: 20px; font-size: 0.9em; }
              .agent-card { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 25px; border-radius: 8px; margin-top: 30px; }
              .agent-card h3 { margin: 0 0 15px 0; }
              .agent-contact { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px; margin-top: 15px; }
              .message-box { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .message-box h4 { margin: 0 0 10px 0; color: #856404; }
              @media (max-width: 768px) {
                body { padding: 10px; }
                .details { flex-direction: column; }
                .images { grid-template-columns: 1fr; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="price">${priceFormatted}</div>
                <div class="address">${listing.address}</div>
                <div class="address">${listing.city}, ${listing.state} ${listing.zip_code}</div>
                
                <div class="details">
                  <div class="detail-item">
                    <div class="detail-number">${listing.bedrooms}</div>
                    <div class="detail-label">Bedrooms</div>
                  </div>
                  <div class="detail-item">
                    <div class="detail-number">${listing.bathrooms}</div>
                    <div class="detail-label">Bathrooms</div>
                  </div>
                  ${listing.square_feet ? `
                    <div class="detail-item">
                      <div class="detail-number">${listing.square_feet.toLocaleString()}</div>
                      <div class="detail-label">Sq Ft</div>
                    </div>
                  ` : ''}
                  <div class="detail-item">
                    <div class="detail-number">${listing.property_type}</div>
                    <div class="detail-label">Type</div>
                  </div>
                </div>
              </div>

              <div class="content">
                ${shareableListing.customMessage ? `
                  <div class="message-box">
                    <h4>Message from Your Agent</h4>
                    <p>${shareableListing.customMessage}</p>
                  </div>
                ` : ''}

                ${listing.images && listing.images.length > 0 ? `
                  <div class="section">
                    <h3>Photos (${listing.images.length})</h3>
                    <div class="images">
                      ${listing.images.slice(0, 6).map(img => `
                        <div class="image">
                          <img src="${img}" alt="Property photo" onerror="this.parentElement.style.display='none'">
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}

                ${listing.description ? `
                  <div class="section">
                    <h3>Description</h3>
                    <p>${listing.description}</p>
                  </div>
                ` : ''}

                ${listing.features && listing.features.length > 0 ? `
                  <div class="section">
                    <h3>Features & Amenities</h3>
                    <div class="features">
                      ${listing.features.map(feature => `<span class="feature">${feature}</span>`).join('')}
                    </div>
                  </div>
                ` : ''}

                <div class="section">
                  <h3>Property Details</h3>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    ${listing.year_built ? `<p><strong>Year Built:</strong> ${listing.year_built}</p>` : ''}
                    ${listing.lot_size ? `<p><strong>Lot Size:</strong> ${listing.lot_size}</p>` : ''}
                    ${listing.mls_number ? `<p><strong>MLS #:</strong> ${listing.mls_number}</p>` : ''}
                    <p><strong>Status:</strong> ${listing.status}</p>
                  </div>
                </div>

                ${shareableListing.agentName ? `
                  <div class="agent-card">
                    <h3>👤 Your Real Estate Agent</h3>
                    <div class="agent-contact">
                      <p style="margin: 0; font-size: 1.1em;"><strong>${shareableListing.agentName}</strong></p>
                      ${shareableListing.agentEmail ? `
                        <p style="margin: 10px 0 0 0;">
                          📧 <a href="mailto:${shareableListing.agentEmail}" style="color: white;">${shareableListing.agentEmail}</a>
                        </p>
                      ` : ''}
                      <p style="margin: 15px 0 0 0; font-size: 0.9em; opacity: 0.9;">
                        Ready to schedule a viewing or discuss this property? Get in touch!
                      </p>
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error serving shareable listing:", error);
      res.status(500).send("Error loading listing");
    }
  });

  // Visual Analysis API
  app.post("/api/listings/analyze-images", async (req, res) => {
    try {
      const { listingId, images } = req.body;

      if (!listingId || !images || !Array.isArray(images)) {
        return res.status(400).json({ error: "Listing ID and images array are required" });
      }

      const { visionIntelligence } = await import('./vision-intelligence');
      const analysis = await visionIntelligence.analyzeListingImages(listingId, images);
      
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing images:", error);
      res.status(500).json({ 
        error: "Failed to analyze images",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Image proxy endpoint for MLS images
  app.get('/api/image-proxy', async (req, res) => {
    try {
      const { url } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL parameter required' });
      }

      // Only allow MLS image URLs for security
      if (!url.includes('media.mlsgrid.com')) {
        return res.status(403).json({ error: 'Only MLS images allowed' });
      }

      // Try to fetch with multiple strategies
      let imageBuffer: ArrayBuffer | null = null;
      let contentType = 'image/jpeg';

      // Strategy 1: Try with real estate-focused headers
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'RealtorBot/1.0 (+https://realtor.com)',
            'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.realtor.com/',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site'
          }
        });

        if (response.ok) {
          imageBuffer = await response.arrayBuffer();
          contentType = response.headers.get('content-type') || 'image/jpeg';
        }
      } catch (error) {
        console.warn('First fetch strategy failed:', error);
      }

      // Strategy 2: If first fails, generate property placeholder
      if (!imageBuffer) {
        // Create a property placeholder SVG
        const listingId = url.split('/').pop()?.split('.')[0] || 'unknown';
        const placeholderSvg = `
          <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="300" fill="#f0f4f8"/>
            <rect x="50" y="50" width="300" height="200" fill="#e2e8f0" stroke="#cbd5e0" stroke-width="2"/>
            <circle cx="120" cy="120" r="15" fill="#fbbf24"/>
            <rect x="80" y="180" width="60" height="40" fill="#1f2937"/>
            <rect x="85" y="185" width="10" height="15" fill="#fbbf24"/>
            <rect x="100" y="185" width="10" height="15" fill="#fbbf24"/>
            <rect x="115" y="185" width="10" height="15" fill="#fbbf24"/>
            <rect x="130" y="185" width="10" height="15" fill="#fbbf24"/>
            <text x="200" y="260" font-family="Arial" font-size="14" fill="#374151" text-anchor="middle">
              Property Image Loading...
            </text>
            <text x="200" y="280" font-family="Arial" font-size="12" fill="#6b7280" text-anchor="middle">
              MLS ID: ${listingId}
            </text>
          </svg>
        `;
        
        imageBuffer = Buffer.from(placeholderSvg);
        contentType = 'image/svg+xml';
      }

      // Set appropriate headers
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300', // Shorter cache for placeholders
        'Access-Control-Allow-Origin': '*'
      });

      // Send the image or placeholder
      res.send(Buffer.from(imageBuffer));

    } catch (error) {
      console.error('Image proxy error:', error);
      res.status(500).json({ 
        error: 'Failed to proxy image',
        details: (error as Error).message 
      });
    }
  });

  // Agent Management Endpoints
  
  // Process agent invites from YAML file
  app.post("/api/agents/process-invites", async (req, res) => {
    try {
      const result = await processAgentInvites();
      res.json({
        success: true,
        message: "Agent invites processed successfully",
        ...result
      });
    } catch (error) {
      console.error("Error processing agent invites:", error);
      res.status(500).json({
        error: "Failed to process agent invites",
        message: (error as Error).message
      });
    }
  });

  // Manual agent invite (can be used by admin interface later)
  app.post("/api/agents/invite", async (req, res) => {
    try {
      const agentData = inviteAgentSchema.parse(req.body);
      const result = await inviteAgent(agentData);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error inviting agent:", error);
      res.status(400).json({
        error: "Failed to invite agent",
        message: (error as Error).message
      });
    }
  });

  // Agent setup password (token validation)
  app.post("/api/agents/setup-password", async (req, res) => {
    try {
      const { token, password } = agentSetupSchema.parse(req.body);
      
      // Find agent by invite token
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.inviteToken, token))
        .limit(1);

      if (agent.length === 0) {
        return res.status(400).json({
          error: "Invalid or expired setup token"
        });
      }

      if (agent[0].isActivated) {
        return res.status(400).json({
          error: "Agent account is already activated"
        });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Update agent with password and activate
      await db
        .update(agents)
        .set({
          passwordHash,
          isActivated: true,
          inviteToken: null // Clear the token after use
        })
        .where(eq(agents.inviteToken, token));

      // Send welcome email after successful activation
      try {
        const { emailService } = await import('./email-service.js');
        await emailService.sendWelcomeEmail({
          email: agent[0].email,
          firstName: agent[0].firstName,
          lastName: agent[0].lastName,
          brokerageName: agent[0].brokerageName
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the request if email fails
      }

      res.json({
        success: true,
        message: "Password set successfully. You can now log in."
      });
    } catch (error) {
      console.error("Error setting up agent password:", error);
      res.status(400).json({
        error: "Failed to set up password",
        message: (error as Error).message
      });
    }
  });

  // Agent login (activated agents only)
  app.post("/api/agents/login", async (req, res) => {
    console.log("=== AGENT LOGIN REQUEST START ===");
    console.log("Request body:", req.body);
    try {
      const { email, password } = agentLoginSchema.parse(req.body);
      
      console.log(`Login attempt for email: ${email}`);
      
      // Find agent by email
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.email, email))
        .limit(1);

      if (agent.length === 0) {
        console.log(`No agent found for email: ${email}`);
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      const agentRecord = agent[0];
      console.log(`Found agent ID: ${agentRecord.id}, activated: ${agentRecord.isActivated}, hasPassword: ${!!agentRecord.passwordHash}`);

      if (!agentRecord.isActivated) {
        console.log(`Agent ${agentRecord.id} not activated`);
        return res.status(401).json({
          error: "Account not activated. Please use your setup link first."
        });
      }

      if (!agentRecord.passwordHash) {
        console.log(`Agent ${agentRecord.id} has no password hash`);
        return res.status(401).json({
          error: "Password not set. Please use your setup link."
        });
      }

      // Verify password
      console.log(`Comparing password for agent ${agentRecord.id}`);
      const isValidPassword = await bcrypt.compare(password, agentRecord.passwordHash);
      console.log(`Password valid: ${isValidPassword}`);
      
      if (!isValidPassword) {
        console.log(`Invalid password for agent ${agentRecord.id}`);
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      // Return agent info (without password hash)
      const { passwordHash, inviteToken, ...agentInfo } = agentRecord;
      
      res.json({
        success: true,
        message: "Login successful",
        agent: agentInfo
      });
    } catch (error) {
      console.error("Error during agent login:", error);
      res.status(400).json({
        error: "Login failed",
        message: (error as Error).message
      });
    }
  });

  // Get agent by token (for setup form)
  app.get("/api/agents/setup/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({
          error: "Setup token is required"
        });
      }

      // Find agent by invite token
      const agent = await db
        .select({
          id: agents.id,
          email: agents.email,
          firstName: agents.firstName,
          lastName: agents.lastName,
          brokerageName: agents.brokerageName,
          isActivated: agents.isActivated
        })
        .from(agents)
        .where(eq(agents.inviteToken, token))
        .limit(1);

      if (agent.length === 0) {
        return res.status(404).json({
          error: "Invalid or expired setup token"
        });
      }

      if (agent[0].isActivated) {
        return res.status(400).json({
          error: "Agent account is already activated"
        });
      }

      res.json({
        success: true,
        agent: agent[0]
      });
    } catch (error) {
      console.error("Error getting agent setup info:", error);
      res.status(500).json({
        error: "Failed to get setup information",
        message: (error as Error).message
      });
    }
  });

  // Chat Service Integration - Validate Context API
  app.post("/api/validate-context", validateChatApiKey, async (req, res) => {
    try {
      const { buyer_id, agent_id } = validateContextSchema.parse(req.body);
      
      // Validate agent exists and is activated
      const agent = await db
        .select({
          id: agents.id,
          firstName: agents.firstName,
          lastName: agents.lastName,
          isActivated: agents.isActivated
        })
        .from(agents)
        .where(eq(agents.id, agent_id))
        .limit(1);

      if (agent.length === 0) {
        return res.status(404).json({
          success: false,
          preview: "Agent not found in system",
          error: "agent_not_found",
          ready: false
        });
      }

      if (!agent[0].isActivated) {
        return res.status(400).json({
          success: false,
          preview: "Agent account not activated",
          error: "agent_not_activated",
          ready: false
        });
      }

      // Validate buyer exists and belongs to agent
      const buyer = await db
        .select({
          id: buyerProfiles.id,
          name: buyerProfiles.name,
          agentId: buyerProfiles.agentId
        })
        .from(buyerProfiles)
        .where(eq(buyerProfiles.id, buyer_id))
        .limit(1);

      if (buyer.length === 0) {
        return res.status(404).json({
          success: false,
          preview: "Buyer not found in system",
          error: "buyer_not_found",
          ready: false
        });
      }

      // Check buyer-agent association (if agentId exists)
      if (buyer[0].agentId && buyer[0].agentId !== agent_id) {
        return res.status(403).json({
          success: false,
          preview: "Buyer does not belong to this agent",
          error: "buyer_agent_mismatch",
          ready: false
        });
      }

      // Check if buyer has search transaction data
      const buyerSearchTransactions = await db
        .select({
          id: searchTransactions.id,
          transactionId: searchTransactions.transactionId
        })
        .from(searchTransactions)
        .where(eq(searchTransactions.profileId, buyer_id))
        .limit(1);

      if (buyerSearchTransactions.length === 0) {
        return res.status(400).json({
          success: false,
          preview: `${buyer[0].name} has no property search data - complete a search first`,
          error: "no_search_data",
          ready: false
        });
      }

      // Count available properties from search results
      const searchResults = await db
        .select({
          topPicksData: searchTransactionResults.topPicksData,
          otherMatchesData: searchTransactionResults.otherMatchesData
        })
        .from(searchTransactionResults)
        .where(eq(searchTransactionResults.transactionId, buyerSearchTransactions[0].transactionId))
        .limit(1);

      let propertyCount = 0;
      if (searchResults.length > 0) {
        const topPicks = searchResults[0].topPicksData as any;
        const otherMatches = searchResults[0].otherMatchesData as any;
        
        propertyCount = (Array.isArray(topPicks) ? topPicks.length : 0) + 
                       (Array.isArray(otherMatches) ? otherMatches.length : 0);
      }

      // Generate chat URL - point to deployed chat service
      const chatUrl = `https://real-estate-chatbot-info4334.replit.app/chat/p?buyer_id=${buyer_id}&agent_id=${agent_id}`;
      
      res.json({
        success: true,
        preview: `Chat link created for ${buyer[0].name} - ${propertyCount} properties found`,
        chat_url: chatUrl,
        ready: true
      });

    } catch (error) {
      console.error("Error validating chat context:", error);
      res.status(500).json({
        success: false,
        preview: "Internal server error during validation",
        error: "server_error",
        ready: false
      });
    }
  });

  // NEW: NLP-powered search endpoint (replaces complex parameter mapping)
  app.post("/api/listings/search-nlp/:profileId", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const profileId = parseInt(req.params.profileId);
      const { contextNlpId, refinementText } = req.body;
      
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Get profile tags for enhanced context
      const profileWithTags = await storage.getProfileWithTags(profileId);
      const tags = profileWithTags?.tags || [];

      // Import NLP search service
      const { nlpSearchService } = await import('./nlp-search-service');

      let searchResult;

      if (refinementText && contextNlpId) {
        // Conversational refinement
        console.log(`🔄 NLP search refinement for profile ${profileId}`);
        searchResult = await nlpSearchService.refineSearch(contextNlpId, refinementText, profile);
      } else {
        // Initial NLP search
        console.log(`🧠 NLP search for profile ${profileId}: ${profile.name}`);
        searchResult = await nlpSearchService.performNLPSearch(profile, tags, contextNlpId);
      }

      const totalTime = Date.now() - startTime;

      // Format response similar to existing search endpoints
      const response = {
        search_type: 'nlp',
        total_found: searchResult.searchResults.count,
        execution_time: totalTime,
        listings: searchResult.searchResults.listings,
        nlp_summary: searchResult.nlpResponse.request.summary,
        nlp_id: searchResult.nlpResponse.nlpId,
        search_url: (searchResult.searchResults as any).searchUrl || searchResult.nlpResponse.request.url,
        search_log_id: searchResult.searchLog.profileId, // Reference for tracking
        image_search_available: !!searchResult.nlpResponse.request.body?.imageSearchItems,
        profile_data: {
          id: profile.id,
          name: profile.name,
          location: profile.location
        }
      };

      console.log(`✅ NLP search completed for ${profile.name} in ${totalTime}ms: ${searchResult.searchResults.count} listings`);

      res.json(response);

    } catch (error) {
      console.error("Error in NLP search:", error);
      res.status(500).json({ 
        error: "Failed to perform NLP search",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get NLP search history for a profile
  app.get("/api/listings/nlp-history/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const limit = parseInt(req.query.limit as string) || 10;
      
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const { nlpSearchService } = await import('./nlp-search-service');
      const searchHistory = await nlpSearchService.getSearchHistory(profileId, limit);

      res.json({
        profile_id: profileId,
        search_count: searchHistory.length,
        searches: searchHistory.map(log => ({
          id: log.id,
          query: log.nlpQuery,
          summary: log.nlpResponse?.request?.summary,
          results_count: log.searchResults?.count || 0,
          execution_time: log.executionTime,
          nlp_id: log.nlpId,
          created_at: log.createdAt
        }))
      });

    } catch (error) {
      console.error("Error getting NLP search history:", error);
      res.status(500).json({ 
        error: "Failed to get search history",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // LEGACY: Repliers NLP API Test Endpoint (for debugging)
  app.post("/api/test-nlp/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      
      if (isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Create natural language prompt from profile
      const nlpPrompt = createNLPPromptFromProfile(profile);
      
      console.log(`🧠 Testing Repliers NLP API for ${profile.name}`);
      console.log(`📝 NLP Prompt: ${nlpPrompt}`);

      // Make request to Repliers NLP API
      const response = await fetch('https://api.repliers.io/nlp', {
        method: 'POST',
        headers: {
          'REPLIERS-API-KEY': process.env.REPLIERS_API_KEY!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: nlpPrompt
        })
      });

      if (!response.ok) {
        throw new Error(`Repliers NLP API error: ${response.status} ${response.statusText}`);
      }

      const nlpResult = await response.json();
      
      console.log(`✅ NLP API Response:`, JSON.stringify(nlpResult, null, 2));

      res.json({
        profile: profile,
        nlp_prompt: nlpPrompt,
        nlp_response: nlpResult,
        test_status: "success"
      });

    } catch (error) {
      console.error("Error testing Repliers NLP API:", error);
      res.status(500).json({ 
        error: "Failed to test NLP API",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Agent Dual-View Search API (Profile-based) - Now with reactive enhancement and full data persistence
  app.post("/api/agent-search", async (req, res) => {
    const startTime = Date.now();
    let transactionId: string;
    
    try {
      const { profileId, forceEnhanced = false, useReactive = true } = req.body;
      
      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }

      console.log(`🔍 [API] Agent search for profile ${profileId} (reactive: ${useReactive}, force enhanced: ${forceEnhanced})`);

      // Get profile and tags
      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const profileWithTags = await storage.getProfileWithTags(profileId);
      const tags = profileWithTags?.tags || [];

      // Start transaction logging
      transactionId = await transactionLogger.startSearchTransaction({
        profileId,
        profile,
        searchParameters: {
          searchType: 'agent_dual_view',
          useReactive,
          forceEnhanced,
          tags: tags.map(t => t.tag)
        },
        searchMethod: useReactive ? 'hybrid' : 'basic',
        searchTrigger: 'agent_initiated'
      });

      // Use reactive search by default for better UX
      if (useReactive) {
        const { agentSearchServiceReactive } = await import('./services/agent-search-service-reactive');
        const searchResults = await agentSearchServiceReactive.performReactiveSearch(profile, tags, forceEnhanced);
        
        console.log(`✅ [API] Reactive search completed for ${profile.name}`);
        console.log(`📊 Initial: ${searchResults.initialSearch.totalFound} results`);
        if (searchResults.enhancedSearch) {
          console.log(`🚀 Enhanced: ${searchResults.enhancedSearch.view1.totalFound} results`);
        }
        
        // Save all search results for future use
        await transactionLogger.saveSearchResults(transactionId, {
          rawListings: [
            ...(searchResults.initialSearch.view1.listings || []),
            ...(searchResults.enhancedSearch?.view1.listings || [])
          ],
          scoredListings: searchResults.initialSearch.view2.listings || [],
          categorizedResults: {
            top_picks: searchResults.initialSearch.view2.listings.filter((l: any) => l.matchScore >= 80) || [],
            other_matches: searchResults.initialSearch.view2.listings.filter((l: any) => l.matchScore < 80) || [],
            properties_without_images: []
          },
          visualAnalysisData: searchResults.initialSearch.view2.listings
            .filter((l: any) => l.aiInsights?.visualAnalysis)
            .map((l: any) => ({
              listingId: l.mlsNumber,
              analysis: l.aiInsights
            })) || null,
          searchSummary: {
            searchType: 'agent_dual_view_reactive',
            initialResults: searchResults.initialSearch.totalFound,
            enhancedTriggered: !!searchResults.enhancedSearch,
            enhancedResults: searchResults.enhancedSearch?.view1.totalFound || 0,
            adjustments: (searchResults.enhancedSearch as any)?.adjustments || [],
            agentRecommendations: searchResults.agentRecommendations
          },
          chatBlocks: [
            searchResults.enhancedSearch?.clientSummary,
            searchResults.agentRecommendations?.message
          ].filter((block): block is string => Boolean(block)),
          executionMetrics: {
            totalTime: searchResults.totalExecutionTime,
            apiCalls: 1,
            visualAnalysisTime: 0
          }
        });
        
        console.log(`💾 [API] Search results persisted for transaction ${transactionId}`);
        
        res.json(searchResults);
      } else {
        // Fallback to original service for backward compatibility
        const { agentSearchService } = await import('./services/agent-search-service');
        const searchResults = await agentSearchService.performDualViewSearch(profile, tags);
        
        console.log(`✅ [API] Standard search completed for ${profile.name}`);
        console.log(`📊 Results: View1=${searchResults.view1.totalFound}, View2=${searchResults.view2.totalFound}`);
        
        // Save all search results for future use
        await transactionLogger.saveSearchResults(transactionId, {
          rawListings: searchResults.view1.listings || [],
          scoredListings: searchResults.view2.listings || [],
          categorizedResults: {
            top_picks: searchResults.view2.listings.filter(l => l.matchScore >= 80) || [],
            other_matches: searchResults.view2.listings.filter(l => l.matchScore < 80) || [],
            properties_without_images: []
          },
          visualAnalysisData: searchResults.view2.listings
            .filter(l => l.aiInsights?.visualAnalysis)
            .map(l => ({
              listingId: l.mlsNumber,
              analysis: l.aiInsights
            })) || null,
          searchSummary: {
            searchType: 'agent_dual_view',
            view1Results: searchResults.view1.totalFound,
            view2Results: searchResults.view2.totalFound,
            aiAnalysis: searchResults.view2.aiAnalysis
          },
          chatBlocks: [],
          executionMetrics: {
            totalTime: searchResults.totalExecutionTime,
            apiCalls: 1,
            visualAnalysisTime: 0
          }
        });
        
        console.log(`💾 [API] Search results persisted for transaction ${transactionId}`);
        
        res.json(searchResults);
      }
    } catch (error) {
      console.error('❌ [API] Agent search error:', error);
      res.status(500).json({ 
        error: "Agent search failed",
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // New endpoint for manual enhanced search only
  app.post("/api/agent-search/enhanced-only", async (req, res) => {
    try {
      const { profileId } = req.body;
      
      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }

      console.log(`🎯 [API] Manual enhanced search for profile ${profileId}`);

      // Get profile
      const profile = await storage.getBuyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const { agentSearchServiceReactive } = await import('./services/agent-search-service-reactive');
      const enhancedResults = await agentSearchServiceReactive.performEnhancedSearchOnly(profile);
      
      console.log(`✅ [API] Enhanced search completed: ${enhancedResults.results.totalFound} results`);
      
      res.json(enhancedResults);
    } catch (error) {
      console.error('❌ [API] Enhanced search error:', error);
      res.status(500).json({ 
        error: "Enhanced search failed",
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Investment Strategy Routes
  const investmentRoutes = await import('./routes/investment-routes');
  app.use(investmentRoutes.default);

  // Routes registered successfully - no need to return custom server
  return;
}
