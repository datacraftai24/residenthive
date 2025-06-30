import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractBuyerProfile, enhanceFormProfile, extractBuyerProfileWithTags } from "./openai";
import { tagEngine } from "./tag-engine";
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

  const httpServer = createServer(app);
  return httpServer;
}
