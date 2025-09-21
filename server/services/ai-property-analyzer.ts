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
      const prompt = `You are an expert real estate agent who personally reviews every property before sharing with clients.

YOUR TASK: Analyze each property thoroughly and explain WHY you selected it for this specific buyer.

CLIENT PROFILE:
Name: ${profile.name}
Budget: $${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}
Needs: ${profile.bedrooms} beds, ${profile.bathrooms} baths
Location: ${profile.location}
Must-haves: ${JSON.stringify(profile.mustHaveFeatures)}
Dealbreakers: ${JSON.stringify(profile.dealbreakers)}
Moving reason: ${profile.buyerBrief || 'Not specified'}
Timeline: ${profile.preferredMovingDate || 'Flexible'}

ANALYSIS PROCESS:
1. Check basic requirements (price, beds, baths, location)
2. Read ALL descriptions and remarks to find relevant details
3. Match property features to buyer's specific needs
4. Identify any concerns or missing information

PROPERTIES TO ANALYZE:
${listings.map((item, idx) => `
Property ${idx + 1} [ID: ${item.id}, System Score: ${item.matchScore}%]:
${JSON.stringify(item.listing, null, 2)}
`).join('\n---\n')}

For EACH property, provide a JSON response with this structure:
{
  "properties": [
    {
      "id": "property id",
      "personalizedSummary": "2-3 sentences explaining WHY you selected this for ${profile.name}. Be specific about how it matches THEIR needs. Show you understand their situation.",
      "matchAnalysis": {
        "perfectMatches": ["Features that EXACTLY match what they asked for"],
        "partialMatches": ["Features that somewhat work"],
        "hiddenGems": ["Important details found ONLY in descriptions that match their needs - include exact quotes"],
        "concerns": ["Specific issues based on THEIR requirements"]
      },
      "missingInformation": {
        "critical": ["Must-know info missing based on THEIR needs"],
        "helpful": ["Would be nice to know"]
      },
      "extractedFromDescription": ["EXACT quotes from listing text that matter to THIS buyer + why"],
      "agentResearchNeeded": ["Specific things to investigate for THIS buyer"],
      "negotiationInsights": "Personalized negotiation advice based on market time and buyer's timeline",
      "recommendationStrength": "strong|moderate|weak",
      "showingPriority": "high|medium|low"
    }
  ]
}

IMPORTANT RULES:
1. personalizedSummary MUST:
   - Address the buyer by name
   - Reference their SPECIFIC needs (not generic "this is a nice home")
   - Explain YOUR reasoning as their agent
   - Show you spent time analyzing this property for THEM
   
   GOOD: "${profile.name}, I selected this because it has the dedicated home office you need for remote work, plus it's in the quiet neighborhood you wanted for your kids."
   BAD: "This is a beautiful home with many nice features."

2. Hidden gems are ONLY:
   - Found in text descriptions (not structured data)
   - DIRECTLY relevant to buyer's stated needs
   - Include the EXACT quote
   
3. Recommendation strength:
   - STRONG: Solves their main problem + meets most needs
   - MODERATE: Good option with some compromises
   - WEAK: Has issues but might work as backup`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a top-performing real estate agent known for understanding clients deeply and finding properties others miss. Be specific, personal, and show your expertise. Always respond with valid JSON format containing the analysis data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 8000
      });

      // Log for debugging
      console.log(`📝 [AI Analysis] Prompt length: ${prompt.length} chars`);
      console.log(`📊 [AI Analysis] Token usage:`, response.usage);
      
      // Safely parse JSON with better error handling
      const content = response.choices[0].message.content || '{}';
      let result;
      
      try {
        result = JSON.parse(content);
      } catch (parseError) {
        console.error('JSON parsing failed, attempting to fix truncated response...');
        console.error('Response content length:', content.length);
        console.error('Response preview:', content.substring(0, 500));
        
        // Try to fix common JSON truncation issues
        let fixedContent = content;
        
        // If the JSON is truncated mid-string, try to close it
        if (!content.trim().endsWith('}') && !content.trim().endsWith(']}')) {
          // Count open braces and brackets to try to close them
          const openBraces = (content.match(/\{/g) || []).length;
          const closeBraces = (content.match(/\}/g) || []).length;
          const openBrackets = (content.match(/\[/g) || []).length;
          const closeBrackets = (content.match(/\]/g) || []).length;
          
          // Add missing closing characters
          let closingChars = '';
          if (openBrackets > closeBrackets) {
            closingChars += ']'.repeat(openBrackets - closeBrackets);
          }
          if (openBraces > closeBraces) {
            closingChars += '}'.repeat(openBraces - closeBraces);
          }
          
          fixedContent = content + closingChars;
          console.log('Attempting to fix with:', closingChars);
          
          try {
            result = JSON.parse(fixedContent);
            console.log('✅ Successfully fixed truncated JSON');
          } catch (fixError) {
            console.error('Failed to fix JSON, using fallback empty result');
            result = { properties: [] };
          }
        } else {
          console.error('JSON parsing failed for unknown reason, using fallback');
          result = { properties: [] };
        }
      }
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
      
      // If it's a specific OpenAI error, log more details
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      
      // Return empty map so the rest of the flow continues
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