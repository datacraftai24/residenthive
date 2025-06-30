import OpenAI from "openai";
import { ProfileTag, ProfilePersona, InsertProfileTag, InsertProfilePersona } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TagEngineInput {
  structuredData: any;
  rawInput: string;
  context?: "profile" | "chat" | "listing";
}

export interface TagEngineOutput {
  tags: InsertProfileTag[];
  persona: InsertProfilePersona;
  confidence: number;
}

/**
 * Standalone Tag Engine Microservice
 * Generates behavioral tags and persona analysis from structured and raw input
 * Reusable across profiles, chats, listings, and other contexts
 */
export class TagEngine {
  
  /**
   * Generate comprehensive tags and persona analysis
   */
  async generateTagsAndPersona(input: TagEngineInput): Promise<TagEngineOutput> {
    try {
      const prompt = this.buildAnalysisPrompt(input);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert behavioral analyst and real estate psychology specialist. 
            Analyze the provided data to generate precise behavioral tags and persona insights.
            Focus on actionable insights for real estate professionals.
            
            Return valid JSON with this exact structure:
            {
              "tags": [
                {
                  "tag": "first-time-buyer",
                  "category": "demographic",
                  "confidence": 85,
                  "source": "ai_inference"
                }
              ],
              "persona": {
                "emotionalTone": "excited",
                "communicationStyle": "collaborative",
                "decisionMakingStyle": "research-heavy",
                "urgencyLevel": 65,
                "priceOrientation": "value-conscious",
                "personalityTraits": ["detail-oriented", "family-focused"],
                "confidenceScore": 78
              },
              "overallConfidence": 80
            }`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        tags: analysis.tags || [],
        persona: analysis.persona || {},
        confidence: analysis.overallConfidence || 50
      };

    } catch (error) {
      console.error("Tag Engine error:", error);
      throw new Error(`Tag analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate tags only (lightweight version)
   */
  async generateTags(input: TagEngineInput): Promise<InsertProfileTag[]> {
    const result = await this.generateTagsAndPersona(input);
    return result.tags;
  }

  /**
   * Generate persona only
   */
  async generatePersona(input: TagEngineInput): Promise<InsertProfilePersona> {
    const result = await this.generateTagsAndPersona(input);
    return result.persona;
  }

  /**
   * Update existing tags with new analysis
   */
  async updateTags(existingTags: ProfileTag[], input: TagEngineInput): Promise<InsertProfileTag[]> {
    const newAnalysis = await this.generateTags(input);
    
    // Merge existing and new tags, updating confidence scores
    const tagMap = new Map<string, InsertProfileTag>();
    
    // Add existing tags
    existingTags.forEach(tag => {
      tagMap.set(tag.tag, {
        profileId: tag.profileId,
        tag: tag.tag,
        category: tag.category,
        confidence: tag.confidence,
        source: tag.source
      });
    });
    
    // Update with new analysis
    newAnalysis.forEach(newTag => {
      const existing = tagMap.get(newTag.tag);
      if (existing) {
        // Average confidence scores for existing tags
        existing.confidence = Math.round((existing.confidence + newTag.confidence) / 2);
      } else {
        tagMap.set(newTag.tag, newTag);
      }
    });
    
    return Array.from(tagMap.values());
  }

  private buildAnalysisPrompt(input: TagEngineInput): string {
    return `
CONTEXT: ${input.context || 'profile'} analysis

STRUCTURED DATA:
${JSON.stringify(input.structuredData, null, 2)}

RAW INPUT:
"${input.rawInput}"

ANALYSIS REQUIREMENTS:

1. BEHAVIORAL TAGS (generate 3-8 tags):
Categories:
- demographic: age, family status, buyer type
- behavioral: decision patterns, communication preferences  
- preference: style, feature priorities, lifestyle
- urgency: timeline, motivation level
- financial: budget approach, financing readiness

2. PERSONA ANALYSIS:
- emotionalTone: excited, cautious, urgent, analytical, overwhelmed, confident
- communicationStyle: direct, collaborative, detail-oriented, visual, technical
- decisionMakingStyle: quick, research-heavy, committee-based, intuitive, analytical
- urgencyLevel: 0-100 (timeline pressure)
- priceOrientation: budget-driven, value-conscious, premium-focused, investment-minded
- personalityTraits: array of 2-5 key traits
- confidenceScore: 0-100 (how confident you are in this analysis)

3. CONFIDENCE SCORING:
- Base confidence on data richness and clarity
- Higher scores for detailed, specific information
- Lower scores for vague or limited data

Focus on actionable insights that help real estate professionals:
- Tailor communication approach
- Predict decision-making patterns
- Identify potential challenges
- Customize service delivery
`;
  }
}

// Export singleton instance
export const tagEngine = new TagEngine();