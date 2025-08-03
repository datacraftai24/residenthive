import { BuyerProfile, ProfileTag } from "@shared/schema";
import { ListingScorer, CategorizedListings, ScoredListing } from "./listing-scorer";
import { VisionIntelligenceService, ListingImageAnalysis } from "./vision-intelligence";
import { EnhancedScoredListing, EnhancedCategorizedListings } from "./enhanced-listing-scorer";

export interface HybridSearchResults {
  immediate: CategorizedListings;
  enhanced?: EnhancedCategorizedListings;
  analysisProgress?: {
    total: number;
    completed: number;
    currentProperty?: string;
  };
}

/**
 * Hybrid Async Scorer - Immediate basic results with progressive visual enhancement
 * Shows results instantly, then enhances top 10 properties with visual analysis
 */
export class HybridAsyncScorer {
  private listingScorer = new ListingScorer();
  private visionService = new VisionIntelligenceService();

  /**
   * Get immediate basic results, then enhance top properties asynchronously
   */
  async scoreWithProgressiveEnhancement(
    listings: any[],
    profile: BuyerProfile,
    tags: ProfileTag[] = [],
    onProgress?: (progress: { completed: number; total: number; currentProperty?: string }) => void
  ): Promise<HybridSearchResults> {
    const startTime = Date.now();
    console.log(`🚀 Starting hybrid search for ${listings.length} listings`);
    
    // Step 1: Get immediate basic scoring results
    const scoredListings = listings.map(listing => 
      this.listingScorer.scoreListing(listing, profile, tags, []) // Empty visual tags for initial scoring
    );
    const basicResults = this.listingScorer.categorizeListings(scoredListings);
    console.log(`⚡ Basic scoring completed in ${Date.now() - startTime}ms`);

    // Step 2: Identify top 10 properties for enhancement
    const allScoredListings = [...basicResults.top_picks, ...basicResults.other_matches];
    const topPropertiesForAnalysis = allScoredListings
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 10)
      .filter(listing => listing.listing.images && listing.listing.images.length > 0);

    console.log(`🎯 Selected ${topPropertiesForAnalysis.length} top properties for visual analysis`);

    // Return immediate results
    const hybridResults: HybridSearchResults = {
      immediate: basicResults,
      analysisProgress: {
        total: topPropertiesForAnalysis.length,
        completed: 0
      }
    };

    // Step 3: Enhance top properties asynchronously
    if (topPropertiesForAnalysis.length > 0) {
      this.enhancePropertiesAsync(topPropertiesForAnalysis, profile, tags, onProgress)
        .then(enhancedResults => {
          hybridResults.enhanced = enhancedResults;
          console.log(`✨ Visual enhancement completed for ${topPropertiesForAnalysis.length} properties`);
        })
        .catch(error => {
          console.error('❌ Error during async visual enhancement:', error);
        });
    }

    return hybridResults;
  }

  /**
   * Enhance top properties with visual analysis asynchronously
   */
  private async enhancePropertiesAsync(
    topProperties: ScoredListing[],
    profile: BuyerProfile,
    tags: ProfileTag[],
    onProgress?: (progress: { completed: number; total: number; currentProperty?: string }) => void
  ): Promise<EnhancedCategorizedListings> {
    const enhancedListings: EnhancedScoredListing[] = [];
    let completed = 0;

    for (const listing of topProperties) {
      try {
        if (onProgress) {
          onProgress({
            completed,
            total: topProperties.length,
            currentProperty: listing.listing.address
          });
        }

        console.log(`🔍 Analyzing images for property: ${listing.listing.id}`);
        
        // Perform visual analysis
        const visualAnalysis = await this.visionService.analyzeListingImages(
          listing.listing.id,
          listing.listing.images || []
        );

        // Calculate visual matching and enhanced score
        const visualMatching = this.calculateVisualMatching(visualAnalysis, profile, tags);
        
        // Create enhanced listing with visual intelligence
        const enhancedListing: EnhancedScoredListing = {
          ...listing,
          visualAnalysis,
          visualTagMatches: visualMatching.matches,
          visualFlags: visualMatching.flags,
          enhancedReason: this.generateEnhancedReason(listing, visualMatching, profile),
          match_score: Math.min(100, listing.match_score + visualMatching.boost)
        };

        enhancedListings.push(enhancedListing);
        completed++;

        if (onProgress) {
          onProgress({
            completed,
            total: topProperties.length
          });
        }

      } catch (error) {
        console.error(`❌ Error analyzing property ${listing.listing.id}:`, error);
        // Add property without visual enhancement
        enhancedListings.push({
          ...listing,
          visualTagMatches: [],
          visualFlags: [],
          enhancedReason: listing.reason
        } as EnhancedScoredListing);
        completed++;
      }
    }

    // Categorize enhanced results
    return this.categorizeEnhancedListings(enhancedListings, profile);
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

    if (!analysis.overallTags) {
      return { matches, flags, boost };
    }

    // Check must-have features against visual tags
    const mustHaveFeatures = profile.mustHaveFeatures || [];
    mustHaveFeatures.forEach(feature => {
      analysis.overallTags.forEach(tag => {
        if (this.isVisualMatch(feature, tag)) {
          matches.push(tag);
          boost += 5; // 5 point boost per visual match
        }
      });
    });

    // Check behavioral tags for style preferences
    tags.forEach(tag => {
      if (tag.category === 'preference') {
        analysis.overallTags.forEach(visualTag => {
          if (this.isStyleMatch(tag.tag, visualTag)) {
            matches.push(visualTag);
            boost += 3; // 3 point boost for style matches
          }
        });
      }
    });

    // Add quality flags
    if (analysis.overallFlags) {
      analysis.overallFlags.forEach(flag => {
        if (flag.includes('excellent') || flag.includes('updated')) {
          boost += 2;
        } else if (flag.includes('dated') || flag.includes('needs_work')) {
          boost -= 2;
        }
        flags.push(flag);
      });
    }

    return { matches, flags, boost: Math.max(-10, Math.min(15, boost)) };
  }

  /**
   * Check if a feature matches a visual tag
   */
  private isVisualMatch(feature: string, visualTag: string): boolean {
    const featureLower = feature.toLowerCase();
    const tagLower = visualTag.toLowerCase();
    
    const matchings = {
      'parking': ['garage', 'driveway', 'parking'],
      'kitchen': ['kitchen', 'granite', 'stainless', 'appliances'],
      'hardwood': ['hardwood', 'wood_floors'],
      'updated': ['updated', 'modern', 'renovated'],
      'fireplace': ['fireplace'],
      'pool': ['pool', 'swimming'],
      'garden': ['garden', 'landscaping', 'yard']
    };

    for (const [key, tags] of Object.entries(matchings)) {
      if (featureLower.includes(key) && tags.some(tag => tagLower.includes(tag))) {
        return true;
      }
    }

    return tagLower.includes(featureLower) || featureLower.includes(tagLower);
  }

  /**
   * Check if preference matches visual style
   */
  private isStyleMatch(preference: string, visualTag: string): boolean {
    const prefLower = preference.toLowerCase();
    const tagLower = visualTag.toLowerCase();

    const styleMatches = {
      'modern': ['modern', 'contemporary', 'sleek'],
      'traditional': ['traditional', 'classic', 'brick'],
      'luxury': ['luxury', 'high_end', 'premium'],
      'cozy': ['cozy', 'warm', 'intimate'],
      'spacious': ['spacious', 'open', 'large']
    };

    for (const [style, tags] of Object.entries(styleMatches)) {
      if (prefLower.includes(style) && tags.some(tag => tagLower.includes(tag))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate enhanced reasoning with visual insights
   */
  private generateEnhancedReason(
    listing: ScoredListing,
    visualMatching: { matches: string[]; flags: string[]; boost: number },
    profile: BuyerProfile
  ): string {
    let reason = listing.reason;

    if (visualMatching.matches.length > 0) {
      reason += ` The property photos show ${visualMatching.matches.slice(0, 3).join(', ')} which aligns with your preferences.`;
    }

    if (visualMatching.flags.length > 0) {
      const qualityFlags = visualMatching.flags.filter(flag => 
        flag.includes('excellent') || flag.includes('updated') || flag.includes('dated')
      );
      if (qualityFlags.length > 0) {
        reason += ` Visual analysis notes: ${qualityFlags[0]}.`;
      }
    }

    return reason;
  }

  /**
   * Categorize enhanced listings
   */
  private categorizeEnhancedListings(
    enhancedListings: EnhancedScoredListing[],
    profile: BuyerProfile
  ): EnhancedCategorizedListings {
    // Sort by enhanced scores
    enhancedListings.sort((a, b) => b.match_score - a.match_score);

    const topPicks = enhancedListings.filter(listing => listing.match_score >= 70);
    const otherMatches = enhancedListings.filter(listing => listing.match_score < 70 && listing.match_score >= 55);

    return {
      top_picks: topPicks,
      other_matches: otherMatches,
      chat_blocks: this.generateChatBlocks(enhancedListings),
      search_summary: {
        total_found: enhancedListings.length,
        top_picks_count: topPicks.length,
        other_matches_count: otherMatches.length,
        visual_analysis_count: enhancedListings.length,
        search_criteria: profile
      }
    };
  }

  /**
   * Generate chat blocks for enhanced results
   */
  private generateChatBlocks(listings: EnhancedScoredListing[]): string[] {
    const blocks: string[] = [];

    if (listings.length === 0) {
      blocks.push("No properties found matching your criteria. Consider adjusting your requirements.");
      return blocks;
    }

    const topProperty = listings[0];
    blocks.push(`Found ${listings.length} properties with visual analysis. Top match: ${topProperty.listing.address} with ${Math.round(topProperty.match_score * 100)}% compatibility.`);

    const visualMatches = listings.filter(l => l.visualTagMatches && l.visualTagMatches.length > 0);
    if (visualMatches.length > 0) {
      blocks.push(`${visualMatches.length} properties have visual elements matching your preferences.`);
    }

    return blocks;
  }
}

export const hybridAsyncScorer = new HybridAsyncScorer();