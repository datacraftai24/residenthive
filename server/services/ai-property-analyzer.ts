import OpenAI from 'openai';
import type { BuyerProfile } from '@shared/schema';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

interface PropertyAnalysis {
  personalizedSummary: string;
  matchAnalysis: {
    perfectMatches: string[];
    partialMatches: string[];
    hiddenGems: string[];
    concerns: string[];
  };
  missingInformation: {
    critical: string[];  // Must have for buyer
    helpful: string[];   // Would be nice to know
  };
  extractedFromDescription: string[];  // Things AI found in description text
  agentResearchNeeded: string[];      // What agent should investigate
  negotiationInsights: string;
  recommendationStrength: 'strong' | 'moderate' | 'weak';
  showingPriority: 'high' | 'medium' | 'low';
}

export class AIPropertyAnalyzer {
  /**
   * Analyze multiple properties in batch - more efficient and allows comparison
   */
  async analyzeBatchForBuyer(
    listings: Array<{ listing: any; matchScore: number; id: string }>,
    profile: BuyerProfile
  ): Promise<Map<string, PropertyAnalysis>> {
    try {
      const prompt = `You are an expert real estate agent analyzing multiple properties for your client.
Compare ALL properties and find the best matches, including hidden gems the scoring might have missed.

CLIENT PROFILE:
Name: ${profile.name}
Budget: $${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}
Needs: ${profile.bedrooms} beds, ${profile.bathrooms} baths
Location: ${profile.location}
Must-haves: ${JSON.stringify(profile.mustHaveFeatures)}
Dealbreakers: ${JSON.stringify(profile.dealbreakers)}
Moving reason: ${profile.buyerBrief || 'Not specified'}

PROPERTIES TO ANALYZE:
${listings.map((item, idx) => `
Property ${idx + 1} [ID: ${item.id}, Score: ${item.matchScore}%]:
${JSON.stringify(item.listing, null, 2)}
`).join('\n---\n')}

Analyze EACH property and return a JSON object with this structure:
{
  "properties": [
    {
      "id": "property id",
      "personalizedSummary": "2-3 sentences explaining why this works for them",
      "matchAnalysis": {
        "perfectMatches": ["exact matches to their needs"],
        "partialMatches": ["partial matches"],
        "hiddenGems": ["valuable features found in descriptions"],
        "concerns": ["issues or potential dealbreakers"]
      },
      "missingInformation": {
        "critical": ["must-know missing info"],
        "helpful": ["nice-to-have missing info"]
      },
      "extractedFromDescription": ["key points from description text"],
      "agentResearchNeeded": ["what agent should investigate"],
      "negotiationInsights": "based on days on market, price history",
      "recommendationStrength": "strong|moderate|weak",
      "showingPriority": "high|medium|low"
    }
  ]
}

Focus on finding hidden gems - properties that might score lower but are actually perfect for this buyer.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a detail-oriented real estate agent who reads between the lines and finds opportunities others miss. Be specific and actionable.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const analysisMap = new Map<string, PropertyAnalysis>();
      
      // Convert response to map
      if (result.properties && Array.isArray(result.properties)) {
        result.properties.forEach((prop: any) => {
          if (prop.id) {
            analysisMap.set(prop.id, {
              personalizedSummary: prop.personalizedSummary,
              matchAnalysis: prop.matchAnalysis,
              missingInformation: prop.missingInformation,
              extractedFromDescription: prop.extractedFromDescription || [],
              agentResearchNeeded: prop.agentResearchNeeded || [],
              negotiationInsights: prop.negotiationInsights,
              recommendationStrength: prop.recommendationStrength,
              showingPriority: prop.showingPriority
            });
          }
        });
      }

      console.log(`✅ AI batch analysis complete for ${analysisMap.size} properties`);
      return analysisMap;

    } catch (error) {
      console.error('AI batch analysis failed:', error);
      return new Map();
    }
  }

  /**
   * Analyze property with ALL available data - let AI figure out what's important
   */
  async analyzePropertyForBuyer(
    rawListing: any,  // Full raw listing from Repliers
    profile: BuyerProfile,
    matchScore: number
  ): Promise<PropertyAnalysis> {
    try {
      const prompt = `You are an expert real estate agent analyzing a property for your client. 
Your job is to find EVERYTHING relevant - hidden gems in the description, missing critical info, and explain why this property works (or doesn't) for this specific buyer.

CLIENT PROFILE:
Name: ${profile.name}
Budget: $${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}
Needs: ${profile.bedrooms} beds, ${profile.bathrooms} baths
Location: ${profile.location}
Must-haves: ${JSON.stringify(profile.mustHaveFeatures)}
Dealbreakers: ${JSON.stringify(profile.dealbreakers)}
Moving reason: ${profile.buyerBrief || 'Not specified'}
Timeline: ${profile.preferredMovingDate || 'Flexible'}
Preferred areas: ${JSON.stringify(profile.preferredAreas)}

FULL PROPERTY DATA:
${JSON.stringify(rawListing, null, 2)}

CURRENT MATCH SCORE: ${matchScore}%

ANALYZE EVERYTHING:
1. Read the ENTIRE description - find things that match buyer needs that aren't in structured fields
2. Identify what critical information is MISSING that the buyer would need
3. Look for hidden benefits in the data (commuter-friendly, recent upgrades mentioned in description, etc.)
4. Be honest about concerns or dealbreakers
5. Tell the agent what they need to research further

Provide a detailed JSON response with:
- personalizedSummary: 2-3 sentences explaining why you picked this for them specifically
- matchAnalysis: {
    perfectMatches: things that exactly match their needs,
    partialMatches: things that somewhat work,
    hiddenGems: benefits found in description or data they might miss,
    concerns: honest issues or potential dealbreakers
  }
- missingInformation: {
    critical: must-know missing info for this buyer,
    helpful: nice-to-have missing info
  }
- extractedFromDescription: specific things you found in the description text that relate to buyer needs
- agentResearchNeeded: specific things the agent should investigate or verify
- negotiationInsights: based on days on market, price history, description clues
- recommendationStrength: 'strong', 'moderate', or 'weak'
- showingPriority: 'high', 'medium', or 'low'`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a detail-oriented real estate agent who reads between the lines and finds opportunities others miss. Be specific and actionable.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000  // Allow longer responses for detailed analysis
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      
      // Validate response
      if (!analysis.personalizedSummary) {
        throw new Error('Invalid AI response structure');
      }

      return analysis as PropertyAnalysis;

    } catch (error) {
      console.error('AI Property Analysis failed:', error);
      
      // Intelligent fallback
      return this.generateSmartFallback(rawListing, profile, matchScore);
    }
  }

  /**
   * Smart fallback that still extracts value from the data
   */
  private generateSmartFallback(
    rawListing: any,
    profile: BuyerProfile,
    matchScore: number
  ): PropertyAnalysis {
    const listing = rawListing.details || rawListing;
    const description = listing.description || '';
    
    // Extract from description
    const extractedFromDescription: string[] = [];
    const descLower = description.toLowerCase();
    
    // Look for keywords in description
    if (descLower.includes('commuter-friendly') || descLower.includes('near t') || descLower.includes('public transport')) {
      extractedFromDescription.push('Commuter-friendly location mentioned');
    }
    if (descLower.includes('recent') || descLower.includes('new') || descLower.includes('updated')) {
      extractedFromDescription.push('Recent updates mentioned in description');
    }
    if (descLower.includes('quiet') || descLower.includes('peaceful')) {
      extractedFromDescription.push('Quiet neighborhood mentioned');
    }

    // Identify missing info
    const missingCritical: string[] = [];
    const missingHelpful: string[] = [];

    // Check for missing critical info based on buyer needs
    if (!listing.heating) missingCritical.push('Heating type and costs');
    if (!listing.HOAFee && profile.dealbreakers?.includes('high HOA')) {
      missingCritical.push('HOA fees not specified');
    }
    if (!listing.parkingSpaces && profile.mustHaveFeatures?.includes('parking')) {
      missingCritical.push('Parking details unclear');
    }

    // Build personalized summary
    const personalizedSummary = `${profile.name}, this property scores ${matchScore}% based on your criteria. ` +
      `It's a ${listing.numBedrooms || '?'} bedroom property in ${rawListing.address?.city || 'your preferred area'} ` +
      `priced at $${rawListing.listPrice?.toLocaleString() || '?'}. ` +
      (matchScore >= 70 ? 'This deserves a closer look.' : 'Consider this as a backup option.');

    return {
      personalizedSummary,
      matchAnalysis: {
        perfectMatches: this.findMatches(rawListing, profile),
        partialMatches: [`Has ${listing.numBedrooms} bedrooms (close to your needs)`],
        hiddenGems: extractedFromDescription,
        concerns: this.findConcerns(rawListing, profile)
      },
      missingInformation: {
        critical: missingCritical,
        helpful: missingHelpful
      },
      extractedFromDescription,
      agentResearchNeeded: [
        'Verify actual room sizes',
        'Check neighborhood noise levels',
        'Confirm parking situation'
      ],
      negotiationInsights: (listingData.daysOnMarket || listing.daysOnMarket) > 30 ? 
        'Property has been on market for a while - good negotiation opportunity' :
        'New listing - act fast if interested',
      recommendationStrength: matchScore >= 80 ? 'strong' : matchScore >= 60 ? 'moderate' : 'weak',
      showingPriority: matchScore >= 80 ? 'high' : matchScore >= 60 ? 'medium' : 'low'
    };
  }

  private findMatches(listing: any, profile: BuyerProfile): string[] {
    const matches: string[] = [];
    
    if (listing.listPrice >= (profile.budgetMin || 0) && listing.listPrice <= (profile.budgetMax || Infinity)) {
      matches.push(`Within budget at $${listing.listPrice?.toLocaleString()}`);
    }
    
    if (listing.details?.numBedrooms === profile.bedrooms) {
      matches.push(`Has exactly ${profile.bedrooms} bedrooms as requested`);
    }
    
    return matches;
  }

  private findConcerns(listing: any, profile: BuyerProfile): string[] {
    const concerns: string[] = [];
    
    if (listing.details?.numBathrooms < (profile.bathrooms || 0)) {
      concerns.push(`Only ${listing.details.numBathrooms} bathrooms (you wanted ${profile.bathrooms})`);
    }
    
    return concerns;
  }
}