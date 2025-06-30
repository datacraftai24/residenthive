import OpenAI from "openai";
import { extractedProfileSchema, type ExtractedProfile, type BuyerFormData } from "@shared/schema";
import { tagEngine, type TagEngineInput } from "./tag-engine";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export async function extractBuyerProfile(rawInput: string): Promise<ExtractedProfile> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a real estate assistant that extracts comprehensive buyer profile information from natural language descriptions. 

Analyze the input text and extract the following information:
- name: Buyer name(s) - if not explicitly mentioned, use "Unknown Buyer"
- email: Buyer email address if mentioned, otherwise null
- budget: Budget range in format like "$450K - $520K" or "$450,000 - $520,000"
- budgetMin: Minimum budget as number (optional)
- budgetMax: Maximum budget as number (optional)
- homeType: Type of home (condo, townhouse, single-family, duplex, apartment, other)
- bedrooms: Number of bedrooms as an integer
- bathrooms: Number of bathrooms as a string (can be "2+", "3", "2.5", etc.)
- mustHaveFeatures: Array of must-have features
- dealbreakers: Array of dealbreakers
- preferredAreas: Array of preferred location areas
- lifestyleDrivers: Array of lifestyle motivations (schools, commute, walkability, etc.)
- specialNeeds: Array of special requirements (pets, WFH, accessibility, etc.)
- budgetFlexibility: Score 0-100 indicating budget flexibility (50 = moderate)
- locationFlexibility: Score 0-100 indicating location flexibility
- timingFlexibility: Score 0-100 indicating timing flexibility
- emotionalContext: Additional emotional context or notes
- inferredTags: AI-inferred tags about the buyer (e.g., "first-time-buyer", "investor", "family-focused")
- emotionalTone: Overall emotional tone (excited, cautious, urgent, relaxed, etc.)
- priorityScore: Priority/urgency score 0-100 based on language and context

Use reasonable defaults and inferences. If any field cannot be determined, use these defaults:
- email: null (will be handled by form input)
- bathrooms: "1+"
- mustHaveFeatures: []
- dealbreakers: []
- preferredAreas: []
- lifestyleDrivers: []
- specialNeeds: []
- budgetFlexibility: 50
- locationFlexibility: 50
- timingFlexibility: 50
- inferredTags: []
- priorityScore: 50
- homeType: "single-family"

Respond with valid JSON in the exact format specified.`
        },
        {
          role: "user",
          content: rawInput
        }
      ],
      response_format: { type: "json_object" }
    });

    const extractedData = JSON.parse(response.choices[0].message.content || "{}");
    console.log("OpenAI raw response:", extractedData);
    
    // Transform null values to undefined for optional fields, provide defaults for required fields
    const cleanedData = {
      name: extractedData.name || "Unknown Buyer",
      email: extractedData.email === null ? undefined : extractedData.email,
      budget: extractedData.budget || "Not specified",
      budgetMin: extractedData.budgetMin === null ? undefined : extractedData.budgetMin,
      budgetMax: extractedData.budgetMax === null ? undefined : extractedData.budgetMax,
      homeType: extractedData.homeType || "single-family",
      bedrooms: typeof extractedData.bedrooms === 'number' ? extractedData.bedrooms : 2,
      bathrooms: extractedData.bathrooms === null ? "1+" : (extractedData.bathrooms || "1+"),
      mustHaveFeatures: Array.isArray(extractedData.mustHaveFeatures) ? extractedData.mustHaveFeatures : [],
      dealbreakers: Array.isArray(extractedData.dealbreakers) ? extractedData.dealbreakers : [],
      preferredAreas: Array.isArray(extractedData.preferredAreas) ? extractedData.preferredAreas : [],
      lifestyleDrivers: Array.isArray(extractedData.lifestyleDrivers) ? extractedData.lifestyleDrivers : [],
      specialNeeds: Array.isArray(extractedData.specialNeeds) ? extractedData.specialNeeds : [],
      budgetFlexibility: typeof extractedData.budgetFlexibility === 'number' ? extractedData.budgetFlexibility : 50,
      locationFlexibility: typeof extractedData.locationFlexibility === 'number' ? extractedData.locationFlexibility : 50,
      timingFlexibility: typeof extractedData.timingFlexibility === 'number' ? extractedData.timingFlexibility : 50,
      emotionalContext: extractedData.emotionalContext === null ? undefined : extractedData.emotionalContext,
      inferredTags: Array.isArray(extractedData.inferredTags) ? extractedData.inferredTags : [],
      emotionalTone: extractedData.emotionalTone === null ? undefined : extractedData.emotionalTone,
      priorityScore: typeof extractedData.priorityScore === 'number' ? extractedData.priorityScore : 50
    };
    
    // Validate the cleaned data against our schema
    const validated = extractedProfileSchema.parse(cleanedData);
    
    // Calculate confidence based on data richness
    const confidence = calculateExtractionConfidence(validated, rawInput);
    
    return {
      ...validated,
      nlpConfidence: confidence
    } as ExtractedProfile;
  } catch (error) {
    console.error("Error extracting buyer profile:", error);
    throw new Error("Failed to extract buyer profile: " + (error as Error).message);
  }
}

/**
 * Enhanced extraction with Tag Engine analysis
 */
export async function extractBuyerProfileWithTags(rawInput: string, inputMethod: 'voice' | 'text' = 'text'): Promise<{
  profile: ExtractedProfile & { inputMethod: string; nlpConfidence: number };
  tags: any[];
  persona: any;
  confidence: number;
}> {
  try {
    // Extract basic profile
    const profile = await extractBuyerProfile(rawInput);
    
    // Prepare Tag Engine input
    const tagInput: TagEngineInput = {
      structuredData: profile,
      rawInput,
      context: 'profile'
    };
    
    // Generate tags and persona analysis
    const tagAnalysis = await tagEngine.generateTagsAndPersona(tagInput);
    
    return {
      profile: {
        ...profile,
        inputMethod,
        nlpConfidence: profile.nlpConfidence || 85
      },
      tags: tagAnalysis.tags,
      persona: tagAnalysis.persona,
      confidence: tagAnalysis.confidence
    };
  } catch (error) {
    console.error("Error in enhanced extraction:", error);
    throw new Error(`Enhanced extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate confidence score based on data richness and clarity
 */
function calculateExtractionConfidence(profile: ExtractedProfile, rawInput: string): number {
  let confidence = 50; // Base confidence
  
  // Add points for complete data
  if (profile.name && profile.name !== "Unknown Buyer") confidence += 10;
  if (profile.email) confidence += 5;
  if (profile.budgetMin && profile.budgetMax) confidence += 10;
  if (profile.preferredAreas?.length > 0) confidence += 10;
  if (profile.mustHaveFeatures?.length > 0) confidence += 8;
  if (profile.dealbreakers?.length > 0) confidence += 5;
  
  // Input quality scoring
  const wordCount = rawInput.split(/\s+/).length;
  if (wordCount > 50) confidence += 10;
  else if (wordCount > 20) confidence += 5;
  
  // Specificity bonus
  if (rawInput.includes('$') || rawInput.includes('budget')) confidence += 5;
  if (/\b\d+\s*(bed|bedroom)/i.test(rawInput)) confidence += 5;
  if (/\b\d+\s*(bath|bathroom)/i.test(rawInput)) confidence += 5;
  
  return Math.min(100, Math.max(10, confidence));
}

export async function enhanceFormProfile(formData: BuyerFormData): Promise<ExtractedProfile> {
  try {
    const combinedInput = `
Form Data:
- Name: ${formData.name}
- Email: ${formData.email}
- Budget: ${formData.budget}
- Home Type: ${formData.homeType}
- Bedrooms: ${formData.bedrooms}
- Bathrooms: ${formData.bathrooms}
- Must-Have Features: ${formData.mustHaveFeatures.join(', ')}
- Dealbreakers: ${formData.dealbreakers.join(', ')}
- Preferred Areas: ${formData.preferredAreas.join(', ')}
- Lifestyle Drivers: ${formData.lifestyleDrivers.join(', ')}
- Special Needs: ${formData.specialNeeds.join(', ')}
- Flexibility Scores: Budget ${formData.budgetFlexibility}%, Location ${formData.locationFlexibility}%, Timing ${formData.timingFlexibility}%
${formData.emotionalContext ? `- Emotional Context: ${formData.emotionalContext}` : ''}
${formData.voiceTranscript ? `- Voice Transcript: ${formData.voiceTranscript}` : ''}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a real estate AI assistant. Analyze the structured form data and enhance it with insights.

Your task is to:
1. Process the structured form data
2. Extract budget ranges if possible (budgetMin, budgetMax)
3. Infer meaningful tags about the buyer profile
4. Determine emotional tone from context and voice transcript
5. Assign a priority score based on urgency indicators
6. Provide enhanced insights while preserving all original form data

Return a comprehensive profile as JSON with all fields populated. Use the form data as the primary source, but enhance with AI insights. Respond with valid JSON in the exact format specified.`
        },
        {
          role: "user",
          content: `${combinedInput}

Please analyze this form data and return a comprehensive buyer profile as JSON format with all the required fields.`
        }
      ]
    });

    const aiResponse = response.choices[0].message.content || "";
    
    // Extract JSON from markdown if present
    let extractedData: any = {};
    try {
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        // Try to parse as direct JSON
        extractedData = JSON.parse(aiResponse);
      }
    } catch (e) {
      // If JSON parsing fails, extract simple insights with regex
      const budgetMinMatch = aiResponse.match(/budgetMin[":]\s*(\d+)/i);
      const budgetMaxMatch = aiResponse.match(/budgetMax[":]\s*(\d+)/i);
      const emotionalToneMatch = aiResponse.match(/emotionalTone[":]\s*"?([^",\n}]+)"?/i);
      const priorityMatch = aiResponse.match(/priority[":]\s*(\d+)/i);
      
      extractedData = {
        budgetMin: budgetMinMatch ? parseInt(budgetMinMatch[1]) : undefined,
        budgetMax: budgetMaxMatch ? parseInt(budgetMaxMatch[1]) : undefined,
        emotionalTone: emotionalToneMatch ? emotionalToneMatch[1].trim() : undefined,
        priorityScore: priorityMatch ? parseInt(priorityMatch[1]) : 50
      };
    }
    
    // Merge form data with AI enhancements
    const enhanced: ExtractedProfile = {
      name: formData.name,
      email: formData.email,
      budget: formData.budget,
      budgetMin: formData.budgetMin || extractedData.budgetMin,
      budgetMax: formData.budgetMax || extractedData.budgetMax,
      homeType: formData.homeType,
      bedrooms: formData.bedrooms,
      bathrooms: formData.bathrooms,
      mustHaveFeatures: formData.mustHaveFeatures,
      dealbreakers: formData.dealbreakers,
      preferredAreas: formData.preferredAreas,
      lifestyleDrivers: formData.lifestyleDrivers,
      specialNeeds: formData.specialNeeds,
      budgetFlexibility: formData.budgetFlexibility,
      locationFlexibility: formData.locationFlexibility,
      timingFlexibility: formData.timingFlexibility,
      emotionalContext: formData.emotionalContext,
      inferredTags: extractedData.inferredTags || [], // Will be populated by Tag Engine separately
      emotionalTone: extractedData.emotionalTone,
      priorityScore: extractedData.priorityScore || 50
    };
    
    // Validate the enhanced data
    const validated = extractedProfileSchema.parse(enhanced);
    
    return validated;
  } catch (error) {
    console.error("Error enhancing form profile:", error);
    throw new Error("Failed to enhance profile: " + (error as Error).message);
  }
}
