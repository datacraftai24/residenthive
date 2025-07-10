import { visionIntelligence, type ListingImageAnalysis } from "./vision-intelligence";
import { listingScorer, type ScoredListing } from "./listing-scorer";
import type { RepliersListing } from "./repliers-api";
import type { BuyerProfile, ProfileTag } from "@shared/schema";

export interface EnhancedScoredListing extends ScoredListing {
  visualAnalysis?: ListingImageAnalysis;
  visualTagMatches: string[];
  visualFlags: string[];
  enhancedReason: string;
}

export interface EnhancedCategorizedListings {
  top_picks: EnhancedScoredListing[];
  other_matches: EnhancedScoredListing[];
  chat_blocks: string[];
  search_summary: {
    total_found: number;
    top_picks_count: number;
    other_matches_count: number;
    visual_analysis_count: number;
    search_criteria: any;
  };
}

/**
 * Enhanced Listing Scorer with Visual Intelligence Integration
 * Combines traditional scoring with AI-powered image analysis for better matches
 */
export class EnhancedListingScorer {

  /**
   * Score listings with integrated visual intelligence
   */
  async scoreListingsWithVisualIntelligence(
    listings: RepliersListing[], 
    profile: BuyerProfile, 
    tags: ProfileTag[] = []
  ): Promise<EnhancedCategorizedListings> {
    console.log(`Starting enhanced scoring for ${listings.length} listings for profile ${profile.id}`);
    
    // First, get basic scores using new Smart Listing Scoring System
    const basicScoredListings = listings.map(listing => 
      listingScorer.scoreListing(listing, profile, tags, []) // Empty visual tags for initial scoring
    );

    // Prioritize properties with images for visual analysis
    const propertiesWithImages = basicScoredListings.filter(listing => 
      listing.listing.images && listing.listing.images.length > 0
    );
    const propertiesWithoutImages = basicScoredListings.filter(listing => 
      !listing.listing.images || listing.listing.images.length === 0
    );
    
    // Sort both groups by score and take top candidates with images first
    const sortedWithImages = propertiesWithImages.sort((a, b) => b.match_score - a.match_score);
    const sortedWithoutImages = propertiesWithoutImages.sort((a, b) => b.match_score - a.match_score);
    
    // Take top 3 properties with images for visual analysis
    const topCandidates = sortedWithImages.slice(0, 3);
    
    console.log(`Found ${propertiesWithImages.length} properties with images, ${propertiesWithoutImages.length} without`);
    console.log(`Selected ${topCandidates.length} properties with images for visual analysis`);

    const enhancedListings: EnhancedScoredListing[] = [];

    // Process listings with visual intelligence (with rate limiting)
    for (let i = 0; i < topCandidates.length; i++) {
      const scored = topCandidates[i];
      try {
        const enhanced = await this.enhanceWithVisualIntelligence(scored, profile, tags);
        enhancedListings.push(enhanced);
        
        // Add delay between requests to avoid rate limiting (except for last item)
        if (i < topCandidates.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      } catch (error) {
        console.error(`Enhanced analysis failed for listing ${scored.listing.id}:`, error);
        // Add as basic listing if enhancement fails
        enhancedListings.push(this.convertToEnhanced(scored));
      }
    }

    // Add remaining properties with images that weren't analyzed (due to rate limiting)
    const remainingWithImages = sortedWithImages
      .slice(topCandidates.length) // Skip the analyzed ones
      .map(scored => this.convertToEnhanced(scored));
    
    // Add all properties without images
    const propertiesWithoutImagesEnhanced = sortedWithoutImages
      .map(scored => this.convertToEnhanced(scored));
    
    // Combine all enhanced listings and sort by score
    const allEnhanced = [...enhancedListings, ...remainingWithImages, ...propertiesWithoutImagesEnhanced]
      .sort((a, b) => b.match_score - a.match_score);

    return this.categorizeEnhancedListings(allEnhanced, profile);
  }

  /**
   * Enhance a single listing with visual intelligence
   */
  private async enhanceWithVisualIntelligence(
    scored: ScoredListing, 
    profile: BuyerProfile, 
    tags: ProfileTag[]
  ): Promise<EnhancedScoredListing> {
    
    let visualAnalysis: ListingImageAnalysis | undefined;
    let visualTagMatches: string[] = [];
    let visualFlags: string[] = [];
    let visualBoost = 0;

    try {
      // Check if listing has images
      if (scored.listing.images && scored.listing.images.length > 0) {
        // Prepare images for analysis
        const imagesToAnalyze = scored.listing.images
          .slice(0, 5) // Limit to 5 images
          .map((url, index) => ({
            url,
            type: visionIntelligence.categorizeImageType(url, index)
          }));

        // Get or perform visual analysis
        visualAnalysis = await visionIntelligence.analyzeListingImages(
          scored.listing.id, 
          imagesToAnalyze
        );

        // Calculate visual matching
        const visualMatch = this.calculateVisualMatching(visualAnalysis, profile, tags);
        visualTagMatches = visualMatch.matches;
        visualFlags = visualMatch.flags;
        visualBoost = visualMatch.boost;
      }
    } catch (error) {
      console.error(`Visual analysis failed for listing ${scored.listing.id}:`, error);
    }

    // Re-score with visual tags if visual analysis available
    let enhancedScore = scored.match_score;
    if (visualAnalysis && visualAnalysis.overallTags.length > 0) {
      // Re-score using visual tags
      const rescoredListing = listingScorer.scoreListing(
        scored.listing, 
        profile, 
        tags, 
        visualAnalysis.overallTags
      );
      enhancedScore = rescoredListing.match_score;
    }

    // Generate enhanced reason with personalized analysis
    let enhancedReason = this.generateEnhancedReason(
      scored, 
      visualTagMatches, 
      visualFlags, 
      visualBoost
    );

    // Generate score-based conversational message
    console.log(`Visual analysis exists for listing ${scored.listing.id}:`, !!visualAnalysis);
    if (visualAnalysis) {
      console.log(`Visual tags found:`, visualAnalysis.overallTags);
      console.log(`Generating conversational message for ${profile.name} (Score: ${enhancedScore})...`);
      
      enhancedReason = this.generateConversationalMessage(
        enhancedScore, 
        scored, 
        profile, 
        visualAnalysis, 
        visualTagMatches, 
        visualFlags
      );
      
      console.log(`Conversational message generated:`, enhancedReason);
    }

    return {
      ...scored,
      match_score: enhancedScore,
      visualAnalysis,
      visualTagMatches,
      visualFlags,
      enhancedReason,
      score_breakdown: {
        ...scored.score_breakdown
      }
    };
  }

  /**
   * Calculate visual matching score and identify matches/flags
   */
  private calculateVisualMatching(
    analysis: ListingImageAnalysis, 
    profile: BuyerProfile, 
    tags: ProfileTag[]
  ): { matches: string[]; flags: string[]; boost: number } {
    
    const matches: string[] = [];
    const flags: string[] = [];
    let boost = 0;

    // Extract buyer preferences
    const mustHaveFeatures = typeof profile.mustHaveFeatures === 'string' 
      ? JSON.parse(profile.mustHaveFeatures) 
      : profile.mustHaveFeatures || [];
    
    const dealbreakers = typeof profile.dealbreakers === 'string'
      ? JSON.parse(profile.dealbreakers)
      : profile.dealbreakers || [];

    // Match visual tags with must-have features
    for (const feature of mustHaveFeatures) {
      const matchingTags = analysis.overallTags.filter(tag => 
        this.isVisualMatch(feature, tag)
      );
      
      if (matchingTags.length > 0) {
        matches.push(`Visual: ${feature} (${matchingTags.join(', ')})`);
        boost += 0.1; // 10% boost per visual feature match
      }
    }

    // Check for dealbreaker flags
    for (const dealbreaker of dealbreakers) {
      const matchingFlags = analysis.overallFlags.filter(flag =>
        this.isVisualMatch(dealbreaker, flag)
      );
      
      if (matchingFlags.length > 0) {
        flags.push(`Visual: ${dealbreaker} detected`);
        boost -= 0.15; // 15% penalty for visual dealbreakers
      }
    }

    // Behavioral tag matching
    for (const tag of tags) {
      if (tag.category === 'preference') {
        const matchingTags = analysis.overallTags.filter(vTag =>
          this.isVisualMatch(tag.tag, vTag)
        );
        
        if (matchingTags.length > 0) {
          matches.push(`Style: ${tag.tag}`);
          boost += 0.05; // 5% boost for style preference match
        }
      }
    }

    // Quality bonus/penalty
    const positiveFlags = analysis.overallFlags.filter(flag =>
      ['excellent_lighting', 'spacious', 'well_maintained', 'professional_staging'].includes(flag)
    );
    
    const negativeFlags = analysis.overallFlags.filter(flag =>
      ['cluttered', 'poor_lighting', 'dated_finishes', 'needs_updating'].includes(flag)
    );

    boost += positiveFlags.length * 0.03; // 3% per positive quality indicator
    boost -= negativeFlags.length * 0.05; // 5% per negative quality indicator

    return {
      matches,
      flags: [...flags, ...negativeFlags],
      boost: Math.max(Math.min(boost, 0.3), -0.3) // Cap boost/penalty at ±30%
    };
  }

  /**
   * Check if a feature matches a visual tag
   */
  private isVisualMatch(feature: string, visualTag: string): boolean {
    const featureLower = feature.toLowerCase();
    const tagLower = visualTag.toLowerCase();
    
    // Direct match
    if (tagLower.includes(featureLower) || featureLower.includes(tagLower)) {
      return true;
    }

    // Semantic matching
    const semanticMatches: Record<string, string[]> = {
      'modern kitchen': ['modern_kitchen', 'contemporary', 'updated_kitchen', 'white_kitchen'],
      'updated kitchen': ['modern_kitchen', 'renovated', 'new_appliances', 'granite_countertops'],
      'hardwood floors': ['hardwood_floors', 'wood_flooring', 'original_hardwood'],
      'good lighting': ['excellent_lighting', 'natural_light', 'bright'],
      'spacious': ['spacious', 'open_concept', 'large_rooms'],
      'pool': ['pool', 'swimming_pool', 'backyard_pool'],
      'garage': ['garage', 'parking', 'covered_parking']
    };

    for (const [key, values] of Object.entries(semanticMatches)) {
      if (featureLower.includes(key) && values.some(v => tagLower.includes(v))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate score-based conversational message using tiered approach
   */
  private generateConversationalMessage(
    score: number,
    scored: ScoredListing,
    profile: BuyerProfile,
    visualAnalysis: any,
    visualMatches: string[],
    visualFlags: string[]
  ): string {
    // Convert score to 0-100 scale if needed
    const normalizedScore = score > 1 ? score : score * 100;
    
    // Extract key features for messaging
    const matchedFeatures = scored.matched_features || [];
    const dealbreakers = scored.dealbreaker_flags || [];
    const visualTags = visualAnalysis?.overallTags || [];
    
    // Get key matches and concerns
    const keyMatches = this.getKeyMatches(matchedFeatures, visualTags, profile);
    const keyConcerns = this.getKeyConcerns(dealbreakers, scored.listing, profile);
    
    // Generate message based on score tier
    if (normalizedScore >= 85) {
      // 85-100: Confident, warm
      return this.generateTier1Message(keyMatches, keyConcerns);
    } else if (normalizedScore >= 70) {
      // 70-84: Encouraging, realistic  
      return this.generateTier2Message(keyMatches, keyConcerns);
    } else if (normalizedScore >= 55) {
      // 55-69: Cautiously optimistic
      return this.generateTier3Message(keyMatches, keyConcerns);
    } else if (normalizedScore >= 40) {
      // 40-54: Polite but skeptical
      return this.generateTier4Message(keyMatches, keyConcerns);
    } else {
      // <40: Firm and clear
      return this.generateTier5Message(keyMatches, keyConcerns);
    }
  }

  private getKeyMatches(matchedFeatures: string[], visualTags: string[], profile: BuyerProfile): string[] {
    const matches: string[] = [];
    
    // Add matched features
    matches.push(...matchedFeatures.slice(0, 2));
    
    // Add key visual features
    const keyVisualFeatures = visualTags.filter(tag => 
      ['modern', 'updated', 'hardwood_floors', 'granite_countertops', 'stainless_appliances', 'parking'].some(key => tag.includes(key))
    );
    matches.push(...keyVisualFeatures.slice(0, 2).map(tag => tag.replace('_', ' ')));
    
    return matches.slice(0, 3); // Max 3 key matches
  }

  private getKeyConcerns(dealbreakers: string[], listing: any, profile: BuyerProfile): string[] {
    const concerns: string[] = [];
    
    // Add dealbreakers
    concerns.push(...dealbreakers);
    
    // Check for major mismatches
    if (profile.bedrooms && listing.bedrooms < profile.bedrooms) {
      concerns.push(`missing ${profile.bedrooms - listing.bedrooms} bedroom${profile.bedrooms - listing.bedrooms > 1 ? 's' : ''}`);
    }
    
    if (profile.bathrooms && listing.bathrooms < profile.bathrooms) {
      concerns.push(`missing bathrooms`);
    }
    
    // Budget concerns
    const budget = profile.budgetMax || 0;
    if (budget > 0 && listing.price > budget * 1.1) {
      concerns.push('over budget');
    }
    
    return concerns.slice(0, 2); // Max 2 key concerns
  }

  // Tier 1: 85-100 (Confident, warm)
  private generateTier1Message(matches: string[], concerns: string[]): string {
    const openings = [
      "🤖 This one's a winner!",
      "🤖 Perfect match alert!", 
      "🤖 Found your dream property!"
    ];
    
    const opening = openings[Math.floor(Math.random() * openings.length)];
    let message = opening;
    
    if (matches.length > 0) {
      message += ` Has ${matches.slice(0, 2).join(', ')}.`;
    }
    
    if (concerns.length > 0) {
      message += ` Only minor concern: ${concerns[0]}.`;
    }
    
    message += " Should we flag this as a top option?";
    return message;
  }

  // Tier 2: 70-84 (Encouraging, realistic)
  private generateTier2Message(matches: string[], concerns: string[]): string {
    const openings = [
      "🤖 Strong contender —",
      "🤖 This one checks most boxes —",
      "🤖 Really solid option —"
    ];
    
    const opening = openings[Math.floor(Math.random() * openings.length)];
    let message = opening;
    
    if (matches.length > 0) {
      message += ` has ${matches.slice(0, 2).join(' and ')}`;
    }
    
    if (concerns.length > 0) {
      message += ` but ${concerns[0]}`;
    }
    
    message += ". Feels like a strong fit — want to dig deeper?";
    return message;
  }

  // Tier 3: 55-69 (Cautiously optimistic)
  private generateTier3Message(matches: string[], concerns: string[]): string {
    const openings = [
      "🤖 Mixed bag here.",
      "🤖 This one's interesting.",
      "🤖 Could be worth a look."
    ];
    
    const opening = openings[Math.floor(Math.random() * openings.length)];
    let message = opening;
    
    if (matches.length > 0) {
      message += ` Has ${matches[0]}`;
      if (matches.length > 1) {
        message += ` and ${matches[1]}`;
      }
    }
    
    if (concerns.length > 0) {
      message += ` though ${concerns[0]}`;
    }
    
    message += ". Worth exploring anyway?";
    return message;
  }

  // Tier 4: 40-54 (Polite but skeptical)
  private generateTier4Message(matches: string[], concerns: string[]): string {
    const openings = [
      "🤖 This one misses on",
      "🤖 Not quite right —",
      "🤖 Close but not quite —"
    ];
    
    const opening = openings[Math.floor(Math.random() * openings.length)];
    let message = opening;
    
    if (concerns.length > 0) {
      message += ` ${concerns.slice(0, 2).join(' and ')}`;
    }
    
    if (matches.length > 0) {
      message += ` despite ${matches[0]}`;
    }
    
    message += ". Not quite right — want to skip this one?";
    return message;
  }

  // Tier 5: <40 (Firm and clear)
  private generateTier5Message(matches: string[], concerns: string[]): string {
    let message = "🤖 ";
    
    if (concerns.length > 0) {
      message += `Major issue: ${concerns[0]}.`;
    } else {
      message += "Significant mismatch with your criteria.";
    }
    
    message += " This one likely isn't a fit. Want better-aligned options?";
    return message;
  }

  /**
   * Generate enhanced reasoning with visual insights (legacy fallback)
   */
  private generateEnhancedReason(
    scored: ScoredListing,
    visualMatches: string[],
    visualFlags: string[],
    visualBoost: number
  ): string {
    let reason = scored.reason;

    if (visualMatches.length > 0) {
      reason += ` Visual analysis confirms: ${visualMatches.slice(0, 2).join(', ')}.`;
    }

    if (visualFlags.length > 0) {
      reason += ` Note: ${visualFlags[0]}.`;
    }

    if (visualBoost > 0.1) {
      reason += ` Strong visual appeal boost (+${Math.round(visualBoost * 100)}%).`;
    } else if (visualBoost < -0.1) {
      reason += ` Visual concerns noted (${Math.round(visualBoost * 100)}%).`;
    }

    return reason;
  }

  /**
   * Convert basic scored listing to enhanced format
   */
  private convertToEnhanced(scored: ScoredListing): EnhancedScoredListing {
    return {
      ...scored,
      visualTagMatches: [],
      visualFlags: [],
      enhancedReason: scored.reason
    };
  }

  /**
   * Categorize enhanced listings
   */
  private categorizeEnhancedListings(
    listings: EnhancedScoredListing[], 
    profile: BuyerProfile
  ): EnhancedCategorizedListings {
    
    const topPicks = listings.filter(l => l.match_score >= 0.70); // 70/100 converted to 0.7
    const otherMatches = listings.filter(l => l.match_score >= 0.55 && l.match_score < 0.70); // 55-70/100
    const visualAnalysisCount = listings.filter(l => l.visualAnalysis).length;

    return {
      top_picks: topPicks.slice(0, 15),
      other_matches: otherMatches.slice(0, 15),
      chat_blocks: this.generateEnhancedChatBlocks([...topPicks, ...otherMatches]),
      search_summary: {
        total_found: listings.length,
        top_picks_count: topPicks.length,
        other_matches_count: otherMatches.length,
        visual_analysis_count: visualAnalysisCount,
        search_criteria: {
          budget: `$${profile.budgetMin?.toLocaleString()} - $${profile.budgetMax?.toLocaleString()}`,
          bedrooms: profile.bedrooms,
          property_type: profile.homeType,
          location: typeof profile.preferredAreas === 'string' 
            ? JSON.parse(profile.preferredAreas) 
            : profile.preferredAreas
        }
      }
    };
  }

  /**
   * Generate chat blocks with visual insights
   */
  private generateEnhancedChatBlocks(listings: EnhancedScoredListing[]): string[] {
    return listings.slice(0, 10).map(listing => {
      const price = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(listing.listing.price);

      const features = [...listing.matched_features];
      if (listing.visualTagMatches.length > 0) {
        features.push(...listing.visualTagMatches.slice(0, 2));
      }

      const featureText = features.length > 0 ? features.slice(0, 3).join(', ') : 'See details';
      
      return `🏡 ${listing.listing.address} – ${price}
✅ ${featureText}
🤖 ${listing.enhancedReason}
📊 Match: ${Math.round(listing.match_score * 100)}%`;
    });
  }
}

export const enhancedListingScorer = new EnhancedListingScorer();