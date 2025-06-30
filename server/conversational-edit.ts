import OpenAI from "openai";
import { type BuyerProfile, type InsertBuyerProfile } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ParsedChange {
  field: string;
  oldValue: any;
  newValue: any;
  confidence: number;
  action: 'update' | 'add' | 'remove';
}

export interface ChangeParseResult {
  changes: ParsedChange[];
  confidence: number;
  originalText: string;
}

/**
 * Parse natural language changes into structured updates
 */
export async function parseProfileChanges(
  text: string, 
  currentProfile: BuyerProfile
): Promise<ChangeParseResult> {
  const prompt = `
You are an AI assistant helping real estate agents update buyer profiles. Parse the following natural language change request and convert it to structured updates.

Current Profile:
- Name: ${currentProfile.name}
- Budget: ${currentProfile.budget}
- Home Type: ${currentProfile.homeType}
- Bedrooms: ${currentProfile.bedrooms}
- Bathrooms: ${currentProfile.bathrooms}
- Must-Have Features: ${currentProfile.mustHaveFeatures?.join(', ') || 'None'}
- Dealbreakers: ${currentProfile.dealbreakers?.join(', ') || 'None'}
- Preferred Areas: ${currentProfile.preferredAreas?.join(', ') || 'None'}
- Lifestyle Drivers: ${currentProfile.lifestyleDrivers?.join(', ') || 'None'}
- Special Needs: ${currentProfile.specialNeeds?.join(', ') || 'None'}

Change Request: "${text}"

Analyze this request and return a JSON object with:
{
  "changes": [
    {
      "field": "fieldName",
      "oldValue": currentValue,
      "newValue": proposedValue,
      "confidence": 0-100,
      "action": "update|add|remove"
    }
  ],
  "confidence": overallConfidence0to100,
  "originalText": "${text}"
}

Field names should match the profile schema exactly:
- budget, budgetMin, budgetMax
- homeType, bedrooms, bathrooms
- mustHaveFeatures (array), dealbreakers (array)
- preferredAreas (array), lifestyleDrivers (array), specialNeeds (array)
- budgetFlexibility, locationFlexibility, timingFlexibility
- emotionalContext, emotionalTone, priorityScore

For array fields (mustHaveFeatures, dealbreakers, etc.):
- action "add": add new items to existing array
- action "remove": remove specific items from array
- action "update": replace entire array

For numeric fields:
- Interpret relative changes like "+50K" or "1 more bedroom"
- Convert budget strings to proper format

Be conservative with confidence scores. Only give high confidence (80+) when the intent is crystal clear.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: "You are a helpful assistant that parses natural language profile changes into structured data. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate and clean the result
    const changes: ParsedChange[] = (result.changes || []).map((change: any) => ({
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      confidence: Math.max(0, Math.min(100, change.confidence || 0)),
      action: ['update', 'add', 'remove'].includes(change.action) ? change.action : 'update'
    }));

    return {
      changes,
      confidence: Math.max(0, Math.min(100, result.confidence || 0)),
      originalText: text
    };

  } catch (error) {
    console.error("Error parsing profile changes:", error);
    throw new Error("Failed to parse changes: " + (error as Error).message);
  }
}

/**
 * Apply parsed changes to a profile
 */
export function applyChangesToProfile(
  currentProfile: BuyerProfile, 
  changes: ParsedChange[]
): Partial<InsertBuyerProfile> {
  const updates: Partial<InsertBuyerProfile> = {};

  for (const change of changes) {
    const { field, newValue, oldValue, action } = change;

    switch (action) {
      case 'update':
        updates[field as keyof InsertBuyerProfile] = newValue;
        break;

      case 'add':
        if (Array.isArray(currentProfile[field as keyof BuyerProfile])) {
          const currentArray = (currentProfile[field as keyof BuyerProfile] as string[]) || [];
          const newItems = Array.isArray(newValue) ? newValue : [newValue];
          updates[field as keyof InsertBuyerProfile] = [...currentArray, ...newItems];
        } else {
          updates[field as keyof InsertBuyerProfile] = newValue;
        }
        break;

      case 'remove':
        if (Array.isArray(currentProfile[field as keyof BuyerProfile])) {
          const currentArray = (currentProfile[field as keyof BuyerProfile] as string[]) || [];
          const removeItems = Array.isArray(oldValue) ? oldValue : [oldValue];
          updates[field as keyof InsertBuyerProfile] = currentArray.filter(
            item => !removeItems.includes(item)
          );
        } else {
          updates[field as keyof InsertBuyerProfile] = null;
        }
        break;
    }
  }

  // Add metadata for tracking
  updates.inputMethod = 'text';
  updates.nlpConfidence = Math.round(
    changes.reduce((sum, change) => sum + change.confidence, 0) / changes.length
  );

  return updates;
}

/**
 * Generate quick edit suggestions based on profile analysis
 */
export async function generateQuickEditSuggestions(
  profile: BuyerProfile
): Promise<string[]> {
  const suggestions = [];

  // Budget adjustments
  if (profile.budget) {
    suggestions.push(`Increase budget by $50K`);
    suggestions.push(`Decrease budget by $25K`);
  }

  // Feature suggestions
  if (!profile.mustHaveFeatures?.includes('Swimming Pool')) {
    suggestions.push(`Add swimming pool to must-haves`);
  }
  if (!profile.mustHaveFeatures?.includes('Garage/Parking')) {
    suggestions.push(`Add garage requirement`);
  }

  // Room adjustments
  if (profile.bedrooms < 5) {
    suggestions.push(`Add 1 more bedroom`);
  }
  if (profile.bedrooms > 1) {
    suggestions.push(`Reduce bedrooms by 1`);
  }

  // Location flexibility
  if (profile.locationFlexibility && profile.locationFlexibility < 70) {
    suggestions.push(`Increase location flexibility`);
  }

  return suggestions.slice(0, 6); // Return top 6 suggestions
}