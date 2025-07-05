import OpenAI from "openai";
import { db } from "./db";
import { listingVisualAnalysis, type InsertListingVisualAnalysis } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/*
The newest OpenAI model is "gpt-4o", not "gpt-4". gpt-4o was released after your knowledge cutoff. 
Always prefer using gpt-4o as it is the latest model.
*/

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface VisualAnalysisResult {
  imageUrl: string;
  imageType: string;
  visualTags: string[];
  summary: string;
  flags: string[];
  confidence: number;
}

export interface ListingImageAnalysis {
  listingId: string;
  analyses: VisualAnalysisResult[];
  overallTags: string[];
  overallFlags: string[];
}

/**
 * Vision Intelligence Service for Real Estate Listings
 * Analyzes property images to extract visual features, quality indicators, and style tags
 */
export class VisionIntelligenceService {
  
  /**
   * Analyze a single property image using OpenAI Vision
   */
  async analyzeImage(imageUrl: string, imageType: string): Promise<VisualAnalysisResult> {
    try {
      const prompt = `Analyze this real estate ${imageType} image and provide:

1. Visual Tags (3-8 specific tags):
   - Style: modern, traditional, contemporary, farmhouse, industrial, etc.
   - Features: granite_countertops, hardwood_floors, vaulted_ceilings, stainless_appliances, etc.
   - Condition: updated, renovated, original, dated, etc.
   - Colors: white_kitchen, dark_cabinets, neutral_tones, etc.

2. One-sentence summary describing what you see

3. Quality flags (if any):
   - Positive: excellent_lighting, spacious, well_maintained, professional_staging
   - Negative: cluttered, poor_lighting, dated_finishes, needs_updating, small_space

4. Confidence score (0-100) in your analysis

Respond in JSON format:
{
  "visualTags": ["tag1", "tag2", "tag3"],
  "summary": "Brief description of the image",
  "flags": ["flag1", "flag2"],
  "confidence": 85
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 500,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        imageUrl,
        imageType,
        visualTags: analysis.visualTags || [],
        summary: analysis.summary || "Image analysis unavailable",
        flags: analysis.flags || [],
        confidence: Math.min(Math.max(analysis.confidence || 70, 0), 100)
      };

    } catch (error) {
      console.error(`Vision analysis failed for ${imageUrl}:`, error);
      return {
        imageUrl,
        imageType,
        visualTags: [],
        summary: "Image analysis unavailable",
        flags: ["analysis_failed"],
        confidence: 0
      };
    }
  }

  /**
   * Analyze multiple images for a listing
   */
  async analyzeListingImages(listingId: string, images: { url: string; type: string }[]): Promise<ListingImageAnalysis> {
    // Check if we already have cached analysis
    const existingAnalyses = await db
      .select()
      .from(listingVisualAnalysis)
      .where(eq(listingVisualAnalysis.listingId, listingId));

    const analyses: VisualAnalysisResult[] = [];
    const allTags = new Set<string>();
    const allFlags = new Set<string>();

    for (const image of images.slice(0, 5)) { // Limit to 5 images for cost control
      // Check if we already analyzed this specific image
      const existing = existingAnalyses.find(a => a.imageUrl === image.url);
      
      if (existing) {
        const result: VisualAnalysisResult = {
          imageUrl: existing.imageUrl,
          imageType: existing.imageType,
          visualTags: JSON.parse(existing.visualTags),
          summary: existing.summary,
          flags: JSON.parse(existing.flags),
          confidence: existing.confidence
        };
        analyses.push(result);
        result.visualTags.forEach(tag => allTags.add(tag));
        result.flags.forEach(flag => allFlags.add(flag));
      } else {
        // Analyze new image
        const result = await this.analyzeImage(image.url, image.type);
        analyses.push(result);
        result.visualTags.forEach(tag => allTags.add(tag));
        result.flags.forEach(flag => allFlags.add(flag));

        // Cache the result
        await this.saveAnalysisToDatabase(listingId, result);
      }
    }

    return {
      listingId,
      analyses,
      overallTags: Array.from(allTags),
      overallFlags: Array.from(allFlags)
    };
  }

  /**
   * Save analysis result to database for caching
   */
  private async saveAnalysisToDatabase(listingId: string, analysis: VisualAnalysisResult): Promise<void> {
    try {
      const insertData: InsertListingVisualAnalysis = {
        listingId,
        imageUrl: analysis.imageUrl,
        imageType: analysis.imageType,
        visualTags: JSON.stringify(analysis.visualTags),
        summary: analysis.summary,
        flags: JSON.stringify(analysis.flags),
        confidence: analysis.confidence,
        analyzedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      await db.insert(listingVisualAnalysis).values([insertData]);
    } catch (error) {
      console.error("Failed to save analysis to database:", error);
    }
  }

  /**
   * Get cached analysis for a listing
   */
  async getCachedAnalysis(listingId: string): Promise<ListingImageAnalysis | null> {
    const analyses = await db
      .select()
      .from(listingVisualAnalysis)
      .where(eq(listingVisualAnalysis.listingId, listingId));

    if (analyses.length === 0) return null;

    const results: VisualAnalysisResult[] = analyses.map(a => ({
      imageUrl: a.imageUrl,
      imageType: a.imageType,
      visualTags: JSON.parse(a.visualTags),
      summary: a.summary,
      flags: JSON.parse(a.flags),
      confidence: a.confidence
    }));

    const allTags = new Set<string>();
    const allFlags = new Set<string>();
    
    results.forEach(r => {
      r.visualTags.forEach(tag => allTags.add(tag));
      r.flags.forEach(flag => allFlags.add(flag));
    });

    return {
      listingId,
      analyses: results,
      overallTags: Array.from(allTags),
      overallFlags: Array.from(allFlags)
    };
  }

  /**
   * Determine important image types to prioritize for analysis
   */
  categorizeImageType(imageUrl: string, imageIndex: number): string {
    const url = imageUrl.toLowerCase();
    
    // Kitchen images (highest priority)
    if (url.includes('kitchen') || url.includes('kit_')) return 'kitchen';
    
    // Living areas
    if (url.includes('living') || url.includes('family') || url.includes('great_room')) return 'living_room';
    
    // Bathrooms
    if (url.includes('bath') || url.includes('powder')) return 'bathroom';
    
    // Bedrooms
    if (url.includes('bedroom') || url.includes('master') || url.includes('bed_')) return 'bedroom';
    
    // Exterior
    if (url.includes('exterior') || url.includes('front') || url.includes('back')) return 'exterior';
    
    // Default categorization by position
    if (imageIndex === 0) return 'exterior'; // First image usually exterior
    if (imageIndex === 1) return 'living_room'; // Second usually main living area
    if (imageIndex === 2) return 'kitchen'; // Third often kitchen
    
    return 'interior';
  }
}

export const visionIntelligence = new VisionIntelligenceService();