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
    
    // First, get basic scores using existing algorithm
    const basicScoredListings = listings.map(listing => 
      listingScorer.scoreListing(listing, profile, tags)
    );

    // Sort and take top candidates for visual analysis (cost optimization)
    const topCandidates = basicScoredListings
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 20); // Analyze only top 20 for cost control

    const enhancedListings: EnhancedScoredListing[] = [];

    // Process listings with visual intelligence
    for (const scored of topCandidates) {
      const enhanced = await this.enhanceWithVisualIntelligence(scored, profile, tags);
      enhancedListings.push(enhanced);
    }

    // Add remaining listings without visual analysis
    const remainingListings = basicScoredListings
      .filter(scored => !topCandidates.find(tc => tc.listing.id === scored.listing.id))
      .map(scored => this.convertToEnhanced(scored));

    const allEnhanced = [...enhancedListings, ...remainingListings]
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

    // Apply visual boost to score
    const enhancedScore = Math.min(scored.match_score + visualBoost, 1.0);

    // Generate enhanced reason
    const enhancedReason = this.generateEnhancedReason(
      scored, 
      visualTagMatches, 
      visualFlags, 
      visualBoost
    );

    return {
      ...scored,
      match_score: enhancedScore,
      visualAnalysis,
      visualTagMatches,
      visualFlags,
      enhancedReason,
      score_breakdown: {
        ...scored.score_breakdown,
        visual_boost: visualBoost
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
   * Generate enhanced reasoning with visual insights
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
    
    const topPicks = listings.filter(l => l.match_score >= 0.35);
    const otherMatches = listings.filter(l => l.match_score >= 0.25 && l.match_score < 0.35);
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