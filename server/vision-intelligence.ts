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
      // Validate imageUrl before making API call
      if (!imageUrl || !imageUrl.trim() || !imageUrl.startsWith('http')) {
        console.warn(`Invalid imageUrl provided: ${imageUrl}`);
        return {
          imageUrl: imageUrl || '',
          imageType,
          visualTags: [],
          summary: "Invalid image URL",
          flags: ["invalid_url"],
          confidence: 0
        };
      }

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

    // Process images one by one with rate limiting delays
    const selectedImages = images.slice(0, 5); // Limit to 5 images for comprehensive analysis with rate control
    console.log(`Processing ${selectedImages.length} images for listing ${listingId} (mini-batch with rate control)`);
    
    for (let i = 0; i < selectedImages.length; i++) {
      const image = selectedImages[i];
      
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
        try {
          // Analyze new image with retry logic
          const result = await this.analyzeImage(image.url, image.type);
          analyses.push(result);
          result.visualTags.forEach(tag => allTags.add(tag));
          result.flags.forEach(flag => allFlags.add(flag));

          // Cache the result
          await this.saveAnalysisToDatabase(listingId, result);
          
          // Add delay between API calls to avoid rate limiting (except for last image)
          if (i < selectedImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          }
        } catch (error: any) {
          console.error(`Failed to analyze image ${image.url}:`, error);
          
          // If rate limited, stop processing more images for this listing
          if (error.status === 429) {
            console.warn(`Rate limited on image ${i + 1}/${selectedImages.length}, stopping analysis for this listing`);
            break;
          }
          
          // For other errors, add a placeholder result but don't save to DB
          const failedResult = {
            imageUrl: image.url || '',
            imageType: image.type || 'unknown',
            visualTags: [],
            summary: "Image analysis unavailable",
            flags: ["analysis_failed"],
            confidence: 0
          };
          analyses.push(failedResult);
          
          // Only try to save to database if we have a valid imageUrl
          if (failedResult.imageUrl) {
            try {
              await this.saveAnalysisToDatabase(listingId, failedResult);
            } catch (dbError) {
              console.error("Failed to save failed analysis to database:", dbError);
            }
          }
        }
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
      // Validate required fields before saving
      if (!analysis.imageUrl || !listingId) {
        console.warn("Skipping database save - missing required fields (imageUrl or listingId)");
        return;
      }

      const insertData: InsertListingVisualAnalysis = {
        listingId,
        imageUrl: analysis.imageUrl,
        imageType: analysis.imageType || 'unknown',
        visualTags: JSON.stringify(analysis.visualTags || []),
        summary: analysis.summary || 'No summary available',
        flags: JSON.stringify(analysis.flags || []),
        confidence: analysis.confidence || 0,
        analyzedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      await db.insert(listingVisualAnalysis).values([insertData]);
    } catch (error) {
      console.error("Failed to save analysis to database:", error);
    }
  }

  /**
   * Generate personal client message for property
   */
  async generatePersonalMessage(
    listingAnalysis: ListingImageAnalysis, 
    buyerProfile: any,
    scoredListing: any
  ): Promise<string> {
    try {
      const clientName = buyerProfile.name?.split(' ')[0] || 'there';
      
      const prompt = `Create a warm, personal message from a real estate agent to their client about a specific property. Make it conversational and engaging.

CLIENT: ${clientName}
BUDGET: $${buyerProfile.budgetMin?.toLocaleString()} - $${buyerProfile.budgetMax?.toLocaleString()}
LOOKING FOR: ${buyerProfile.bedrooms || 'flexible'} bedrooms, ${buyerProfile.bathrooms || 'flexible'} bathrooms
MUST-HAVES: ${buyerProfile.mustHaveFeatures?.join(', ') || 'none specified'}

PROPERTY:
- Price: $${scoredListing.listing.price?.toLocaleString()}
- Bedrooms: ${scoredListing.listing.bedrooms}
- Bathrooms: ${scoredListing.listing.bathrooms}
- Address: ${scoredListing.listing.address}
- Visual features: ${listingAnalysis.overallTags.join(', ')}
- What matches: ${scoredListing.matched_features?.join(', ') || 'none'}

Create a personal message using one of these styles:

EXCITED STYLE:
"Hi ${clientName}! 😊 I found something I think you'll love at [address]. It has that [specific feature] you mentioned wanting, plus [bonus features]. The photos show [visual details]. Want to see it this weekend?"

THOUGHTFUL STYLE:
"Hey ${clientName}, came across this property at [address] that caught my eye for you. It's got [key matches] and the [visual feature] really stands out in the photos. [One consideration]. Thoughts?"

URGENT STYLE:
"${clientName} - just found this gem at [address]! Has your [must-have features] and it's priced at [price]. The [visual highlight] in the photos is exactly what you described. Should we schedule a showing ASAP?"

Keep it under 60 words, warm but professional, and include specific details about why it matches their needs.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.9
      });

      return response.choices[0].message.content || `Hi ${clientName}! Found a property that matches several of your criteria. Would love to show you the details!`;
    } catch (error) {
      console.error("Error generating personal message:", error);
      const clientName = buyerProfile.name?.split(' ')[0] || 'there';
      return `Hi ${clientName}! Found an interesting property that might work for you. Let me know if you'd like to take a look!`;
    }
  }

  /**
   * Generate professional agent-voice summary for property assessment
   */
  async generateAgentSummary(
    listingAnalysis: ListingImageAnalysis, 
    buyerProfile: any,
    scoredListing: any
  ): Promise<string> {
    try {
      const prompt = `You are a professional real estate agent creating an engaging, scannable property assessment. Use emojis and varied messaging styles that buyers will actually read.

CLIENT PROFILE:
- Budget: $${buyerProfile.budgetMin?.toLocaleString()} - $${buyerProfile.budgetMax?.toLocaleString()}
- Looking for: ${buyerProfile.bedrooms || 'flexible'} bedrooms, ${buyerProfile.bathrooms || 'flexible'} bathrooms
- Must-have features: ${buyerProfile.mustHaveFeatures?.join(', ') || 'none specified'}
- Wants to avoid: ${buyerProfile.dealbreakers?.join(', ') || 'none specified'}
- Preferred location: ${buyerProfile.location || buyerProfile.preferredAreas?.[0] || 'flexible'}

PROPERTY ANALYSIS:
- Price: $${scoredListing.listing.price?.toLocaleString()}
- Bedrooms: ${scoredListing.listing.bedrooms}
- Bathrooms: ${scoredListing.listing.bathrooms}
- Visual features from photos: ${listingAnalysis.overallTags.join(', ')}
- Quality observations: ${listingAnalysis.overallFlags.join(', ')}
- Matched features: ${scoredListing.matched_features?.join(', ') || 'none'}
- Dealbreaker flags: ${scoredListing.dealbreaker_flags?.join(', ') || 'none'}

Create an engaging, scannable assessment using this format:

🏠 OPENING HOOK (choose one style):
- "This one has serious potential."
- "This one hits the mark."
- "Looks great — but doesn't work."
- "This could be interesting."
- "Mixed bag on this one."
- "Perfect match alert."
- "Close, but not quite."

BRIEF ANALYSIS (2-3 short sentences):
Include what matches and what doesn't, using specific details.

VERDICT (choose appropriate emoji and tone):
✅ "Worth a second look?" / "This is the kind of listing we don't want to miss."
🚫 "Not a fit right now." / "We'll skip it."
🤔 "Could work if you're flexible on [specific thing]."

EXAMPLES:
🏠 This one hits the mark.
It has the garage and modern kitchen you wanted, plus the two bedrooms and baths you need. The lake view and open layout make it a strong lifestyle fit.
✅ This is the kind of listing we don't want to miss.

🏠 This one has serious potential.  
It includes two of your must-haves — modern kitchen with granite countertops and a garage — plus an open floor plan that gives it a spacious feel.
🚫 But it only has one bedroom, which doesn't meet your minimum of two. That's a dealbreaker unless you're open to renovating.

Keep it conversational, decisive, and under 50 words total.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.8
      });

      return response.choices[0].message.content || "🏠 Assessment pending - reviewing property details.";
    } catch (error) {
      console.error("Error generating agent summary:", error);
      return "🤔 Still analyzing this one - will have insights shortly.";
    }
  }

  /**
   * Generate personalized client message for sharing (on-demand)
   */
  async generatePersonalizedClientMessage(
    listingAnalysis: ListingImageAnalysis, 
    buyerProfile: any,
    scoredListing: any
  ): Promise<string> {
    try {
      const buyerName = buyerProfile.name || 'there';
      const prompt = `Create a warm, personal message from a real estate agent to their client about this property.

CLIENT: ${buyerName}
CLIENT PREFERENCES:
- Budget: $${buyerProfile.budgetMin?.toLocaleString()} - $${buyerProfile.budgetMax?.toLocaleString()}
- Looking for: ${buyerProfile.bedrooms || 'flexible'} bedrooms, ${buyerProfile.bathrooms || 'flexible'} bathrooms
- Must-have features: ${buyerProfile.mustHaveFeatures?.join(', ') || 'none specified'}
- Wants to avoid: ${buyerProfile.dealbreakers?.join(', ') || 'none specified'}

PROPERTY DETAILS:
- Address: ${scoredListing.listing.address}
- Price: $${scoredListing.listing.price?.toLocaleString()}
- Visual features from photos: ${listingAnalysis.overallTags.join(', ')}
- What matches: ${scoredListing.matched_features?.join(', ') || 'several features'}

Create a warm, personal message that:
1. Starts with "Hi ${buyerName},"
2. Shows excitement about finding this property for them
3. Mentions 2-3 specific visual features they'll love
4. Suggests next steps (viewing, discussing, etc.)
5. Keeps it conversational and personal

Example: "Hi Sarah, I found a property that I think you're going to love! The photos show exactly the kind of modern kitchen with granite counters you've been wanting, plus those beautiful hardwood floors throughout. The location in Lincoln Park is perfect, and it's right in your budget. Let's schedule a showing this weekend!"`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.7
      });

      return response.choices[0].message.content || `Hi ${buyerName}, I found a property that matches several of your criteria. Let's discuss the details!`;
    } catch (error) {
      console.error("Error generating personal message:", error);
      return `Hi ${buyerName}, I found a property that might interest you. Let's review it together.`;
    }
  }

  /**
   * Generate buyer-specific image insights highlighting matches and concerns
   */
  async generateBuyerSpecificInsights(
    listingAnalysis: ListingImageAnalysis, 
    buyerProfile: any
  ): Promise<{ matches: string[]; concerns: string[]; highlights: string[] }> {
    const matches: string[] = [];
    const concerns: string[] = [];
    const highlights: string[] = [];

    // Analyze visual tags against buyer preferences
    const mustHaveFeatures = buyerProfile.mustHaveFeatures || [];
    const dealbreakers = buyerProfile.dealbreakers || [];

    // Check for visual matches with must-have features
    for (const feature of mustHaveFeatures) {
      const visualMatch = listingAnalysis.overallTags.find(tag => 
        this.isVisualFeatureMatch(feature.toLowerCase(), tag.toLowerCase())
      );
      if (visualMatch) {
        matches.push(`Visual confirmation: ${visualMatch.replace('_', ' ')}`);
      }
    }

    // Check for visual concerns based on dealbreakers
    for (const dealbreaker of dealbreakers) {
      const visualConcern = listingAnalysis.overallTags.find(tag => 
        this.isVisualFeatureMatch(dealbreaker.toLowerCase(), tag.toLowerCase())
      );
      if (visualConcern) {
        concerns.push(`Potential concern: ${visualConcern.replace('_', ' ')}`);
      }
    }

    // Highlight quality and style features
    const qualityTags = listingAnalysis.overallTags.filter(tag => 
      tag.includes('updated') || tag.includes('renovated') || tag.includes('modern') || tag.includes('luxury')
    );
    highlights.push(...qualityTags.map(tag => tag.replace('_', ' ')));

    // Add quality flags as concerns if needed
    if (listingAnalysis.overallFlags.length > 0) {
      concerns.push(...listingAnalysis.overallFlags.map(flag => flag.replace('_', ' ')));
    }

    return { matches, concerns, highlights };
  }

  /**
   * Check if a visual tag matches a buyer preference
   */
  private isVisualFeatureMatch(preference: string, visualTag: string): boolean {
    const preferenceWords = preference.split(' ');
    const tagWords = visualTag.split('_');
    
    return preferenceWords.some(word => 
      tagWords.some(tagWord => tagWord.includes(word) || word.includes(tagWord))
    );
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