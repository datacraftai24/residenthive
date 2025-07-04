import { BuyerProfile, ProfileTag } from '@shared/schema';
import { RepliersListing } from './repliers-api';

export interface ScoredListing {
  listing: RepliersListing;
  match_score: number;
  label: string;
  matched_features: string[];
  dealbreaker_flags: string[];
  reason: string;
  score_breakdown: {
    budget_score: number;
    feature_score: number;
    dealbreaker_penalty: number;
    location_score: number;
    tag_score: number;
  };
}

export interface CategorizedListings {
  top_picks: ScoredListing[];
  other_matches: ScoredListing[];
  chat_blocks: string[];
}

export class ListingScorer {
  /**
   * Score a single listing against buyer profile
   */
  scoreListing(listing: RepliersListing, profile: BuyerProfile, tags: ProfileTag[] = []): ScoredListing {
    const scores = {
      budget_score: this.calculateBudgetScore(listing, profile),
      feature_score: this.calculateFeatureScore(listing, profile),
      dealbreaker_penalty: this.calculateDealbreakerPenalty(listing, profile),
      location_score: this.calculateLocationScore(listing, profile),
      tag_score: this.calculateTagScore(listing, profile, tags)
    };

    // Weighted final score
    const finalScore = Math.max(0, Math.min(1, 
      (scores.budget_score * 0.25) +
      (scores.feature_score * 0.30) +
      (scores.location_score * 0.20) +
      (scores.tag_score * 0.25) +
      scores.dealbreaker_penalty // This is negative
    ));

    const matchedFeatures = this.findMatchedFeatures(listing, profile);
    const dealbreakerFlags = this.findDealbreakerFlags(listing, profile);
    
    return {
      listing,
      match_score: finalScore,
      label: this.getScoreLabel(finalScore),
      matched_features: matchedFeatures,
      dealbreaker_flags: dealbreakerFlags,
      reason: this.generateReason(listing, profile, matchedFeatures, finalScore),
      score_breakdown: scores
    };
  }

  /**
   * Score budget alignment (0-1)
   */
  private calculateBudgetScore(listing: RepliersListing, profile: BuyerProfile): number {
    const price = listing.price;
    const minBudget = profile.budgetMin || 0;
    const maxBudget = profile.budgetMax || Infinity;

    // Perfect score if within budget
    if (price >= minBudget && price <= maxBudget) {
      return 1.0;
    }

    // Partial score if close to budget range
    const budgetRange = maxBudget - minBudget;
    const tolerance = budgetRange * 0.1; // 10% tolerance

    if (price < minBudget) {
      const underAmount = minBudget - price;
      return Math.max(0, 1 - (underAmount / tolerance));
    } else {
      const overAmount = price - maxBudget;
      return Math.max(0, 1 - (overAmount / tolerance));
    }
  }

  /**
   * Score feature matching (0-1)
   */
  private calculateFeatureScore(listing: RepliersListing, profile: BuyerProfile): number {
    const mustHaveFeatures = this.parseJsonArray(profile.mustHaveFeatures);
    if (!mustHaveFeatures.length) return 0.5; // Neutral if no requirements

    const listingFeatures = [
      ...(listing.features || []),
      listing.description || ''
    ].join(' ').toLowerCase();

    let matchCount = 0;
    const featureMap: Record<string, string[]> = {
      'modern kitchen': ['modern kitchen', 'updated kitchen', 'renovated kitchen', 'granite counters'],
      'good internet': ['fiber', 'high-speed internet', 'broadband'],
      'garage/parking': ['garage', 'parking', 'covered parking'],
      'yard/garden': ['yard', 'garden', 'outdoor space', 'patio', 'deck'],
      'storage space': ['storage', 'walk-in closet', 'basement', 'attic'],
      'family room': ['family room', 'living room', 'great room'],
      'low maintenance': ['low maintenance', 'hoa', 'condo', 'turnkey'],
      'pool': ['pool', 'swimming pool'],
      'balcony': ['balcony', 'terrace', 'patio']
    };

    for (const feature of mustHaveFeatures) {
      const searchTerms = featureMap[feature.toLowerCase()] || [feature.toLowerCase()];
      const hasFeature = searchTerms.some(term => listingFeatures.includes(term));
      if (hasFeature) matchCount++;
    }

    return Math.min(1.0, matchCount / mustHaveFeatures.length);
  }

  /**
   * Calculate dealbreaker penalties (negative score)
   */
  private calculateDealbreakerPenalty(listing: RepliersListing, profile: BuyerProfile): number {
    const dealbreakers = this.parseJsonArray(profile.dealbreakers);
    if (!dealbreakers.length) return 0;

    const listingText = [
      ...(listing.features || []),
      listing.description || '',
      listing.address || ''
    ].join(' ').toLowerCase();

    let penaltyCount = 0;
    const dealbreakerMap: Record<string, string[]> = {
      'no hoa': ['hoa', 'homeowners association', 'monthly fee'],
      'ground floor only': ['2nd floor', 'second floor', 'upstairs', 'elevator'],
      'busy road': ['busy street', 'main road', 'highway', 'traffic'],
      'no garage': ['no parking', 'street parking only'],
      'major repairs needed': ['needs work', 'fixer upper', 'repair', 'renovation needed'],
      'hoa restrictions': ['strict hoa', 'hoa restrictions', 'no pets', 'rental restrictions']
    };

    for (const dealbreaker of dealbreakers) {
      const searchTerms = dealbreakerMap[dealbreaker.toLowerCase()] || [dealbreaker.toLowerCase()];
      const hasDealbreakerFlag = searchTerms.some(term => listingText.includes(term));
      if (hasDealbreakerFlag) penaltyCount++;
    }

    return penaltyCount * -0.5; // -0.5 per dealbreaker
  }

  /**
   * Score location preferences (0-1)
   */
  private calculateLocationScore(listing: RepliersListing, profile: BuyerProfile): number {
    const preferredAreas = this.parseJsonArray(profile.preferredAreas);
    if (!preferredAreas.length) return 0.7; // Neutral if no preference

    const listingLocation = `${listing.city}, ${listing.state}`.toLowerCase();
    
    for (const area of preferredAreas) {
      if (listingLocation.includes(area.toLowerCase())) {
        return 1.0; // Perfect match
      }
    }

    // Check for nearby areas (basic proximity)
    const isNearbyArea = preferredAreas.some(area => {
      const distance = this.calculateLocationSimilarity(area.toLowerCase(), listingLocation);
      return distance > 0.5;
    });

    return isNearbyArea ? 0.6 : 0.3;
  }

  /**
   * Score based on behavioral tags (0-1)
   */
  private calculateTagScore(listing: RepliersListing, profile: BuyerProfile, tags: ProfileTag[]): number {
    if (!tags.length) return 0.5;

    const listingText = [
      ...(listing.features || []),
      listing.description || ''
    ].join(' ').toLowerCase();

    let tagScore = 0;
    const tagCount = tags.length;

    for (const tag of tags) {
      const tagValue = this.evaluateTagMatch(tag, listing, listingText);
      tagScore += tagValue;
    }

    return Math.min(1.0, tagScore / tagCount);
  }

  /**
   * Evaluate how well a tag matches a listing
   */
  private evaluateTagMatch(tag: ProfileTag, listing: RepliersListing, listingText: string): number {
    const tagLower = tag.tag.toLowerCase();
    
    // Lifestyle and preference tags
    if (tag.category === 'lifestyle') {
      if (tagLower.includes('walkable') && listingText.includes('walkable')) return 0.8;
      if (tagLower.includes('quiet') && listingText.includes('quiet')) return 0.7;
      if (tagLower.includes('urban') && listing.city?.toLowerCase().includes('austin')) return 0.6;
    }

    // Investment-focused tags
    if (tag.category === 'behavioral' && tagLower.includes('investment')) {
      if (listing.property_type === 'condo' || listing.property_type === 'townhouse') return 0.7;
    }

    // Family-oriented tags
    if (tagLower.includes('family') && listing.bedrooms >= 3) return 0.6;

    return 0.3; // Base score for any tag presence
  }

  /**
   * Find matched features for display
   */
  private findMatchedFeatures(listing: RepliersListing, profile: BuyerProfile): string[] {
    const mustHaveFeatures = this.parseJsonArray(profile.mustHaveFeatures);
    const listingFeatures = [
      ...(listing.features || []),
      listing.description || ''
    ].join(' ').toLowerCase();

    const matched: string[] = [];
    
    for (const feature of mustHaveFeatures) {
      if (listingFeatures.includes(feature.toLowerCase())) {
        matched.push(feature);
      }
    }

    return matched;
  }

  /**
   * Find dealbreaker flags
   */
  private findDealbreakerFlags(listing: RepliersListing, profile: BuyerProfile): string[] {
    const dealbreakers = this.parseJsonArray(profile.dealbreakers);
    const listingText = [
      ...(listing.features || []),
      listing.description || ''
    ].join(' ').toLowerCase();

    const flags: string[] = [];
    
    for (const dealbreaker of dealbreakers) {
      if (listingText.includes(dealbreaker.toLowerCase())) {
        flags.push(dealbreaker);
      }
    }

    return flags;
  }

  /**
   * Generate human-readable reason for selection
   */
  private generateReason(listing: RepliersListing, profile: BuyerProfile, matchedFeatures: string[], score: number): string {
    const reasons: string[] = [];

    // Budget alignment
    if (listing.price <= (profile.budgetMax || Infinity)) {
      reasons.push('within budget');
    }

    // Feature matches
    if (matchedFeatures.length > 0) {
      reasons.push(`has ${matchedFeatures.slice(0, 2).join(' and ')}`);
    }

    // Location
    const preferredAreas = this.parseJsonArray(profile.preferredAreas);
    if (preferredAreas.some(area => listing.city?.toLowerCase().includes(area.toLowerCase()))) {
      reasons.push('in preferred area');
    }

    // Property characteristics
    if (listing.bedrooms >= (profile.bedrooms || 0)) {
      reasons.push('meets bedroom requirements');
    }

    const reasonText = reasons.length > 0 ? reasons.join(', ') : 'matches basic criteria';
    return `${reasonText.charAt(0).toUpperCase()}${reasonText.slice(1)}.`;
  }

  /**
   * Get label based on score
   */
  private getScoreLabel(score: number): string {
    if (score >= 0.85) return 'Perfect Match';
    if (score >= 0.75) return 'Excellent Fit';
    if (score >= 0.65) return 'Worth Considering';
    return 'Good Potential';
  }

  /**
   * Calculate basic location similarity
   */
  private calculateLocationSimilarity(area1: string, area2: string): number {
    const commonWords = area1.split(' ').filter(word => area2.includes(word));
    return commonWords.length / Math.max(area1.split(' ').length, 1);
  }

  /**
   * Parse JSON array safely
   */
  private parseJsonArray(jsonField: any): string[] {
    if (Array.isArray(jsonField)) return jsonField;
    if (typeof jsonField === 'string') {
      try {
        const parsed = JSON.parse(jsonField);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Categorize listings based on scores
   */
  categorizeListings(scoredListings: ScoredListing[]): CategorizedListings {
    const topPicks = scoredListings.filter(item => item.match_score >= 0.85);
    const otherMatches = scoredListings.filter(item => item.match_score >= 0.65 && item.match_score < 0.85);

    // Sort by score descending
    topPicks.sort((a, b) => b.match_score - a.match_score);
    otherMatches.sort((a, b) => b.match_score - a.match_score);

    const chatBlocks = this.generateChatBlocks([...topPicks, ...otherMatches]);

    return {
      top_picks: topPicks,
      other_matches: otherMatches,
      chat_blocks: chatBlocks
    };
  }

  /**
   * Generate chat-ready text blocks
   */
  private generateChatBlocks(listings: ScoredListing[]): string[] {
    return listings.map(item => {
      const { listing, matched_features, match_score, reason } = item;
      const price = new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        maximumFractionDigits: 0 
      }).format(listing.price);

      const bedBath = `${listing.bedrooms}BR/${listing.bathrooms}BA`;
      const location = `${listing.city}, ${listing.state}`;
      
      let chatBlock = `🏡 ${bedBath} ${listing.property_type} in ${location} – ${price}\n`;
      
      if (matched_features.length > 0) {
        chatBlock += `✅ Features: ${matched_features.slice(0, 3).join(', ')}\n`;
      }
      
      chatBlock += `🤖 Why we picked this: ${reason}\n`;
      chatBlock += `📊 Match Score: ${(match_score * 100).toFixed(0)}%\n`;
      chatBlock += `[🔗 View Listing] [❤️ Save]`;

      return chatBlock;
    });
  }
}

export const listingScorer = new ListingScorer();