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
  properties_without_images: ScoredListing[];
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
      bedroom_score: this.calculateBedroomScore(listing, profile),
      dealbreaker_penalty: this.calculateDealbreakerPenalty(listing, profile),
      location_score: this.calculateLocationScore(listing, profile),
      tag_score: this.calculateTagScore(listing, profile, tags)
    };

    // Weighted final score with image bonus
    let finalScore = Math.max(0, Math.min(1, 
      (scores.budget_score * 0.20) +
      (scores.feature_score * 0.25) +
      (scores.bedroom_score * 0.20) +
      (scores.location_score * 0.15) +
      (scores.tag_score * 0.20) +
      scores.dealbreaker_penalty // This is negative
    ));

    // Remove artificial image scoring boost - handle this in categorization instead

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

    // Handle rental properties (low prices indicate monthly rent)
    if (price < 10000) {
      // This is likely a rental - buyers looking to purchase get lower score
      return 0.3; // Rental property, buyer wants to purchase
    }

    // Handle purchase properties
    if (price >= minBudget && price <= maxBudget) {
      return 1.0; // Perfect match
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
   * Score bedroom/bathroom matching (0-1) - handles missing data gracefully
   */
  private calculateBedroomScore(listing: RepliersListing, profile: BuyerProfile): number {
    // If listing has no bedroom data, give neutral score
    if (!listing.bedrooms || listing.bedrooms === 0) {
      return 0.5; // Neutral score for missing data
    }

    // If profile has no bedroom preference, neutral score
    if (!profile.bedrooms) {
      return 0.5;
    }

    // Perfect match
    if (listing.bedrooms === profile.bedrooms) {
      return 1.0;
    }

    // Good match if within 1 bedroom
    const difference = Math.abs(listing.bedrooms - profile.bedrooms);
    if (difference === 1) {
      return 0.7;
    }

    // Fair match if within 2 bedrooms
    if (difference === 2) {
      return 0.4;
    }

    // Poor match if more than 2 bedrooms off
    return 0.1;
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
   * Generate engaging, scannable assessment using varied messaging styles
   */
  private generateReason(listing: RepliersListing, profile: BuyerProfile, matchedFeatures: string[], score: number): string {
    const matches: string[] = [];
    const gaps: string[] = [];
    
    // Budget analysis
    const budgetOk = listing.price >= (profile.budgetMin || 0) && listing.price <= (profile.budgetMax || Infinity);
    if (budgetOk) {
      matches.push('budget fits');
    } else if (listing.price > (profile.budgetMax || Infinity)) {
      const overBudget = listing.price - (profile.budgetMax || 0);
      gaps.push(`$${Math.round(overBudget/1000)}K over budget`);
    }

    // Bedroom analysis
    const bedroomMatch = listing.bedrooms >= (profile.bedrooms || 0);
    if (bedroomMatch && listing.bedrooms === (profile.bedrooms || 0)) {
      matches.push(`${listing.bedrooms} bedrooms`);
    } else if (listing.bedrooms > (profile.bedrooms || 0)) {
      matches.push(`${listing.bedrooms} bedrooms (bonus!)`);
    } else {
      const shortage = (profile.bedrooms || 0) - listing.bedrooms;
      gaps.push(`only ${listing.bedrooms} bedrooms`);
    }

    // Feature matches
    if (matchedFeatures.length > 0) {
      matches.push(matchedFeatures.slice(0, 2).join(', '));
    }

    // Missing must-haves
    const missingFeatures = this.findMissingMustHaveFeatures(listing, profile);
    if (missingFeatures.length > 0) {
      gaps.push(`no ${missingFeatures.slice(0, 1).join('')}`);
    }

    // Choose opening hook based on score and matches
    const openings = {
      great: ["🏠 This one hits the mark.", "🏠 Perfect match alert.", "🏠 This looks promising."],
      good: ["🏠 This one has potential.", "🏠 Could be interesting.", "🏠 Worth a look."],
      mixed: ["🏠 Mixed bag on this one.", "🏠 Close, but not quite.", "🏠 Some good, some not."],
      poor: ["🏠 Looks great — but doesn't work.", "🏠 Nice, but won't work.", "🏠 Beautiful, but wrong fit."]
    };

    let opening: string;
    let verdict: string;

    if (score >= 0.7 && gaps.length === 0) {
      opening = openings.great[Math.floor(Math.random() * openings.great.length)];
      verdict = "✅ This is worth seeing!";
    } else if (score >= 0.5 && gaps.length <= 1) {
      opening = openings.good[Math.floor(Math.random() * openings.good.length)];
      verdict = "✅ Worth a second look.";
    } else if (score >= 0.3 || (matches.length > 0 && gaps.length > 0)) {
      opening = openings.mixed[Math.floor(Math.random() * openings.mixed.length)];
      verdict = gaps.length > matches.length ? "🤔 Could work if flexible." : "✅ Has potential.";
    } else {
      opening = openings.poor[Math.floor(Math.random() * openings.poor.length)];
      verdict = "🚫 Not a fit right now.";
    }

    // Build the message
    let message = opening + "\n";
    
    if (matches.length > 0) {
      message += `Has ${matches.slice(0, 2).join(' and ')}. `;
    }
    
    if (gaps.length > 0) {
      message += `But ${gaps.slice(0, 2).join(' and ')}. `;
    }
    
    message += `\n${verdict}`;

    return message;
  }

  /**
   * Find missing must-have features for transparency
   */
  private findMissingMustHaveFeatures(listing: RepliersListing, profile: BuyerProfile): string[] {
    const mustHaveFeatures = this.parseJsonArray(profile.mustHaveFeatures);
    const listingFeatures = this.parseJsonArray(listing.features || []);
    const listingText = `${listing.description || ''} ${listingFeatures.join(' ')}`.toLowerCase();
    
    return mustHaveFeatures.filter(feature => {
      const featureLower = feature.toLowerCase();
      return !listingText.includes(featureLower) && 
             !listingFeatures.some(lf => lf.toLowerCase().includes(featureLower));
    });
  }

  /**
   * Get label based on score
   */
  private getScoreLabel(score: number): string {
    if (score >= 0.85) return 'Perfect Match';
    if (score >= 0.75) return 'Excellent Fit';
    if (score >= 0.65) return 'Worth Considering';
    if (score >= 0.45) return 'Consider with Trade-offs';
    return 'Available Option';
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
   * Categorize listings based on scores and image availability
   */
  categorizeListings(scoredListings: ScoredListing[]): CategorizedListings {
    // First separate properties with images from those without
    const propertiesWithImages = scoredListings.filter(item => 
      item.listing.images && item.listing.images.length > 0
    );
    const propertiesWithoutImages = scoredListings.filter(item => 
      !item.listing.images || item.listing.images.length === 0
    );

    // Categorize properties WITH images using score thresholds
    const topPicks = propertiesWithImages.filter(item => item.match_score >= 0.35);
    const otherMatches = propertiesWithImages.filter(item => item.match_score >= 0.25 && item.match_score < 0.35);

    // Sort all categories by score descending
    topPicks.sort((a, b) => b.match_score - a.match_score);
    otherMatches.sort((a, b) => b.match_score - a.match_score);
    propertiesWithoutImages.sort((a, b) => b.match_score - a.match_score);

    const chatBlocks = this.generateChatBlocks([...topPicks.slice(0, 5), ...otherMatches.slice(0, 5)]);

    return {
      top_picks: topPicks.slice(0, 5),
      other_matches: otherMatches.slice(0, 10),
      properties_without_images: propertiesWithoutImages.slice(0, 10),
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