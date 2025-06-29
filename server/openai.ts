import OpenAI from "openai";
import { extractedProfileSchema, type ExtractedProfile } from "@shared/schema";

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
          content: `You are a real estate assistant that extracts structured buyer profile information from natural language descriptions. 

Analyze the input text and extract the following information:
- name: Buyer name(s) - if not explicitly mentioned, use "Unknown Buyer"
- budget: Budget range in format like "$450K - $520K" or "$450,000 - $520,000"
- location: Preferred location areas (e.g., "Downtown", "Suburbs", "Waterfront")
- bedrooms: Number of bedrooms as an integer
- bathrooms: Number of bathrooms as a string (can be "2+", "3", "2.5", etc.)
- mustHaveFeatures: Array of must-have features (e.g., ["Modern Kitchen", "Garage", "Hardwood Floors"])
- dealbreakers: Array of dealbreakers (e.g., ["Fixer-Upper", "Busy Street", "No Parking"])

If information is not provided, make reasonable inferences based on context or use these defaults:
- name: "Unknown Buyer"
- budget: "Not specified"
- location: "Flexible"
- bedrooms: 2
- bathrooms: "1+"
- mustHaveFeatures: []
- dealbreakers: []

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
    
    // Validate the extracted data against our schema
    const validated = extractedProfileSchema.parse(extractedData);
    
    return validated;
  } catch (error) {
    console.error("Error extracting buyer profile:", error);
    throw new Error("Failed to extract buyer profile: " + (error as Error).message);
  }
}
