import { ListingScorer, type ScoredListing, type CategorizedListings } from './listing-scorer';
import { VisionIntelligenceService } from './vision-intelligence';
import type { BuyerProfile, ProfileTag } from '@shared/schema';
import type { RepliersListing } from './repliers-api';

/**
 * Hybrid Listing Scorer - Immediate display with selective AI enhancement
 * Shows all listings immediately, then enhances top 3 with visual analysis
 */
export class HybridListingScorer {
  private listingScorer = new ListingScorer();
  private visionService = new VisionIntelligenceService();

  /**
   * Score listings immediately, then enhance top 3 with visual analysis
   */
  async scoreListingsHybrid(
    listings: RepliersListing[], 
    profile: BuyerProfile, 
    tags: ProfileTag[] = []
  ): Promise<CategorizedListings & { enhancedCount: number }> {
    
    // Step 1: Get immediate results with Smart Listing Scoring System
    const scoredListings = listings.map(listing => 
      this.listingScorer.scoreListing(listing, profile, tags, []) // Empty visual tags for initial scoring
    );
    
    const categorized = this.listingScorer.categorizeListings(scoredListings);
    
    // Step 2: Enhance only the top 3 matches with visual analysis
    const topThree = categorized.top_picks.slice(0, 3);
    let enhancedCount = 0;
    
    for (const scored of topThree) {
      try {
        const enhanced = await this.enhanceWithVisualAnalysis(scored, profile);
        if (enhanced) {
          // Update the scored listing in place
          Object.assign(scored, enhanced);
          enhancedCount++;
        }
      } catch (error) {
        console.warn(`Visual analysis failed for listing ${scored.listing.id}:`, error);
        // Continue without visual analysis for this listing
      }
    }

    return {
      ...categorized,
      enhancedCount,
      chat_blocks: [
        ...categorized.chat_blocks,
        enhancedCount > 0 ? 
          `✨ Enhanced ${enhancedCount} top properties with AI visual analysis` :
          "💡 Showing immediate results - visual analysis coming soon"
      ]
    };
  }

  /**
   * Enhance a single listing with visual analysis
   */
  private async enhanceWithVisualAnalysis(
    scored: ScoredListing, 
    profile: BuyerProfile
  ): Promise<Partial<ScoredListing> | null> {
    
    const { listing } = scored;
    
    if (!listing.images || listing.images.length === 0) {
      return null;
    }

    try {
      // Analyze first 3 images max for efficiency
      // Use Repliers CDN URLs directly for vision analysis
      const imagesToAnalyze = listing.images.slice(0, 3).map(url => ({
        url,
        type: 'property_image'
      }));
      const analysis = await this.visionService.analyzeListingImages(
        listing.id,
        imagesToAnalyze
      );

      if (!analysis) return null;

      // Calculate visual boost to match score
      const visualBoost = this.calculateVisualBoost(analysis, profile);
      const enhancedScore = Math.min(1.0, scored.match_score + visualBoost);

      // Enhanced reason with visual insights
      const visualTags = analysis.overallTags || [];
      const visualInsights = visualTags.length > 0 
        ? ` Visual highlights: ${visualTags.slice(0, 3).join(', ')}.`
        : '';

      return {
        listing: scored.listing, // Preserve original listing data including images
        match_score: enhancedScore,
        reason: scored.reason + visualInsights,
        label: scored.label,
        matched_features: scored.matched_features,
        dealbreaker_flags: scored.dealbreaker_flags,
        score_breakdown: scored.score_breakdown,
        // Add visual metadata for enhanced display
        ...(analysis && { visualAnalysis: analysis })
      };

    } catch (error) {
      console.warn(`Visual analysis failed for ${listing.id}:`, error);
      return null;
    }
  }

  /**
   * Calculate visual boost based on style matching
   */
  private calculateVisualBoost(analysis: any, profile: BuyerProfile): number {
    if (!analysis?.overallTags) return 0;

    const profilePreferences = [
      ...(profile.mustHaveFeatures || []),
      profile.homeType || ''
    ].map(f => f.toLowerCase());

    const visualTags = analysis.overallTags.map((tag: string) => tag.toLowerCase());
    
    // Count style matches
    let matches = 0;
    for (const pref of profilePreferences) {
      for (const tag of visualTags) {
        if (this.isStyleMatch(pref, tag)) {
          matches++;
        }
      }
    }

    // Return boost between 0-0.15 (max 15% score improvement)
    return Math.min(0.15, matches * 0.05);
  }

  /**
   * Check if preference matches visual style
   */
  private isStyleMatch(preference: string, visualTag: string): boolean {
    const styleMatches = [
      ['modern', 'contemporary', 'updated'],
      ['traditional', 'classic', 'colonial'],
      ['luxury', 'upscale', 'high-end'],
      ['spacious', 'open', 'large'],
      ['cozy', 'intimate', 'charming']
    ];

    for (const group of styleMatches) {
      if (group.includes(preference) && group.includes(visualTag)) {
        return true;
      }
    }

    return preference.includes(visualTag) || visualTag.includes(preference);
  }
}

export const hybridListingScorer = new HybridListingScorer();