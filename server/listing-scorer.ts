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
    feature_match: number;
    budget_match: number;
    bedroom_match: number;
    location_match: number;
    visual_tag_match: number;
    behavioral_tag_match: number;
    listing_quality_score: number;
    dealbreaker_penalty: number;
    missing_data_penalty: number;
    visual_boost: number;
    raw_total: number;
    final_score: number;
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
   * Score a single listing against buyer profile using Smart Listing Scoring System (0-100)
   */
  scoreListing(listing: RepliersListing, profile: BuyerProfile, tags: ProfileTag[] = [], visualTags: string[] = []): ScoredListing {
    // Calculate component scores (0-1 scale)
    const featureMatch = this.calculateFeatureScore(listing, profile);
    const budgetMatch = this.calculateBudgetScore(listing, profile);
    const bedroomMatch = this.calculateBedroomScore(listing, profile);
    const locationMatch = this.calculateLocationScore(listing, profile);
    const visualTagMatch = this.calculateVisualTagScore(listing, profile, visualTags);
    const behavioralTagMatch = this.calculateTagScore(listing, profile, tags);
    const listingQuality = this.calculateListingQualityScore(listing);

    // Apply weights to get base score (0-100)
    const weightedScore = 
      (featureMatch * 25) +      // Feature_Match: 25%
      (budgetMatch * 20) +       // Budget_Match: 20%
      (bedroomMatch * 15) +      // Bedroom_Match: 15%
      (locationMatch * 10) +     // Location_Match: 10%
      (visualTagMatch * 10) +    // Visual_Tag_Match: 10%
      (behavioralTagMatch * 10) + // Behavioral_Tag_Match: 10%
      (listingQuality * 10);     // Listing_Quality_Score: 10%

    // Calculate penalties
    const dealbreakerPenalty = this.calculateDealbreakerPenalty(listing, profile);
    const missingDataPenalty = this.calculateMissingDataPenalty(listing);
    
    // Calculate visual boost
    const visualBoost = this.calculateVisualBoost(visualTags, profile);

    // Apply penalties and boosts
    const rawTotal = weightedScore + dealbreakerPenalty + missingDataPenalty + visualBoost;
    
    // Apply floor constraint: never drop below 10
    const finalScore = Math.max(10, Math.min(100, rawTotal));

    const matchedFeatures = this.findMatchedFeatures(listing, profile);
    const dealbreakerFlags = this.findDealbreakerFlags(listing, profile);

    return {
      listing,
      match_score: finalScore / 100, // Convert back to 0-1 for compatibility
      label: this.getScoreLabel(finalScore),
      matched_features: matchedFeatures,
      dealbreaker_flags: dealbreakerFlags,
      reason: this.generateReason(listing, profile, matchedFeatures, finalScore),
      score_breakdown: {
        feature_match: featureMatch * 25,
        budget_match: budgetMatch * 20,
        bedroom_match: bedroomMatch * 15,
        location_match: locationMatch * 10,
        visual_tag_match: visualTagMatch * 10,
        behavioral_tag_match: behavioralTagMatch * 10,
        listing_quality_score: listingQuality * 10,
        dealbreaker_penalty: dealbreakerPenalty,
        missing_data_penalty: missingDataPenalty,
        visual_boost: visualBoost,
        raw_total: rawTotal,
        final_score: finalScore
      }
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
   * Calculate dealbreaker penalties (subtract 30 points per dealbreaker)
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
      'fixer-uppers': ['needs work', 'fixer upper', 'repair', 'renovation needed', 'tlc needed'],
      'hoa restrictions': ['strict hoa', 'hoa restrictions', 'no pets', 'rental restrictions']
    };

    for (const dealbreaker of dealbreakers) {
      const searchTerms = dealbreakerMap[dealbreaker.toLowerCase()] || [dealbreaker.toLowerCase()];
      const hasDealbreakerFlag = searchTerms.some(term => listingText.includes(term));
      if (hasDealbreakerFlag) penaltyCount++;
    }

    return penaltyCount * -30; // -30 points per dealbreaker
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
   * Generate score-based conversational message using tiered approach (consistent with enhanced scorer)
   */
  private generateReason(listing: RepliersListing, profile: BuyerProfile, matchedFeatures: string[], score: number): string {
    // Extract key features for messaging
    const dealbreakers = this.findDealbreakerFlags(listing, profile);
    
    // Get key matches and concerns
    const keyMatches = this.getKeyMatches(matchedFeatures, listing, profile);
    const keyConcerns = this.getKeyConcerns(dealbreakers, listing, profile);
    
    // Generate message based on score tier
    if (score >= 85) {
      // 85-100: Confident, warm
      return this.generateTier1Message(keyMatches, keyConcerns);
    } else if (score >= 70) {
      // 70-84: Encouraging, realistic  
      return this.generateTier2Message(keyMatches, keyConcerns);
    } else if (score >= 55) {
      // 55-69: Cautiously optimistic
      return this.generateTier3Message(keyMatches, keyConcerns);
    } else if (score >= 40) {
      // 40-54: Polite but skeptical
      return this.generateTier4Message(keyMatches, keyConcerns);
    } else {
      // <40: Firm and clear
      return this.generateTier5Message(keyMatches, keyConcerns);
    }
  }

  private getKeyMatches(matchedFeatures: string[], listing: RepliersListing, profile: BuyerProfile): string[] {
    const matches: string[] = [];
    
    // Add matched features
    matches.push(...matchedFeatures.slice(0, 2));
    
    // Budget fit
    const budgetOk = listing.price >= (profile.budgetMin || 0) && listing.price <= (profile.budgetMax || Infinity);
    if (budgetOk) {
      matches.push('right budget');
    }
    
    // Bedroom match
    if (listing.bedrooms >= (profile.bedrooms || 0)) {
      matches.push(`${listing.bedrooms} bedrooms`);
    }
    
    // Key features
    const features = listing.features || [];
    const keyFeatures = features.filter(f => 
      ['parking', 'garage', 'pool', 'updated', 'modern'].some(key => f.toLowerCase().includes(key))
    );
    matches.push(...keyFeatures.slice(0, 1));
    
    return matches.slice(0, 3); // Max 3 key matches
  }

  private getKeyConcerns(dealbreakers: string[], listing: RepliersListing, profile: BuyerProfile): string[] {
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
   * Get label based on score (0-100 scale)
   */
  private getScoreLabel(score: number): string {
    if (score >= 85) return "Excellent Match";
    if (score >= 70) return "Good Match";
    if (score >= 55) return "Fair Match";
    if (score >= 40) return "Poor Match";
    return "Not Recommended";
  }

  /**
   * Calculate basic location similarity
   */
  private calculateLocationSimilarity(area1: string, area2: string): number {
    const commonWords = area1.split(' ').filter(word => area2.includes(word));
    return commonWords.length / Math.max(area1.split(' ').length, 1);
  }

  /**
   * Calculate visual tag matching score (0-1)
   */
  private calculateVisualTagScore(listing: RepliersListing, profile: BuyerProfile, visualTags: string[]): number {
    if (!visualTags.length) return 0.5; // Neutral if no visual tags
    
    const preferredStyles = this.parseJsonArray(profile.mustHaveFeatures).filter(feature => 
      feature.toLowerCase().includes('modern') || 
      feature.toLowerCase().includes('traditional') ||
      feature.toLowerCase().includes('contemporary')
    );
    
    if (!preferredStyles.length) return 0.5;
    
    let matchCount = 0;
    for (const style of preferredStyles) {
      const matchingTags = visualTags.filter(tag => 
        tag.toLowerCase().includes(style.toLowerCase()) ||
        (style.toLowerCase().includes('modern') && (tag.includes('contemporary') || tag.includes('updated')))
      );
      if (matchingTags.length > 0) matchCount++;
    }
    
    return Math.min(1.0, matchCount / preferredStyles.length);
  }

  /**
   * Calculate listing quality score (0-1)
   */
  private calculateListingQualityScore(listing: RepliersListing): number {
    let qualityScore = 0;
    
    // Photo count (max 3 points)
    const imageCount = listing.images?.length || 0;
    if (imageCount >= 5) qualityScore += 0.3;
    else if (imageCount >= 3) qualityScore += 0.2;
    else if (imageCount >= 1) qualityScore += 0.1;
    
    // Description completeness (max 3 points)
    const description = listing.description || '';
    if (description.length >= 200) qualityScore += 0.3;
    else if (description.length >= 100) qualityScore += 0.2;
    else if (description.length >= 50) qualityScore += 0.1;
    
    // Feature completeness (max 2 points)
    const features = listing.features?.length || 0;
    if (features >= 5) qualityScore += 0.2;
    else if (features >= 3) qualityScore += 0.1;
    
    // Recent listing bonus (max 2 points)
    if (listing.listing_date) {
      const listingDate = new Date(listing.listing_date);
      const daysSinceListing = (Date.now() - listingDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceListing <= 30) qualityScore += 0.2;
      else if (daysSinceListing <= 60) qualityScore += 0.1;
    }
    
    return Math.min(1.0, qualityScore);
  }

  /**
   * Calculate missing data penalty (subtract 10 points for missing critical data)
   */
  private calculateMissingDataPenalty(listing: RepliersListing): number {
    let penalty = 0;
    
    // Missing bedroom data
    if (!listing.bedrooms || listing.bedrooms === 0) penalty -= 10;
    
    // Missing bathroom data
    if (!listing.bathrooms) penalty -= 10;
    
    // Missing images
    if (!listing.images || listing.images.length === 0) penalty -= 10;
    
    return penalty;
  }

  /**
   * Calculate visual boost (+10 if visual tags strongly match preferences)
   */
  private calculateVisualBoost(visualTags: string[], profile: BuyerProfile): number {
    if (!visualTags.length) return 0;
    
    const preferredFeatures = this.parseJsonArray(profile.mustHaveFeatures);
    const stylePreferences = preferredFeatures.filter(feature => 
      feature.toLowerCase().includes('modern') ||
      feature.toLowerCase().includes('kitchen') ||
      feature.toLowerCase().includes('updated') ||
      feature.toLowerCase().includes('granite') ||
      feature.toLowerCase().includes('hardwood')
    );
    
    if (!stylePreferences.length) return 0;
    
    let strongMatches = 0;
    for (const preference of stylePreferences) {
      const matchingTags = visualTags.filter(tag => {
        const tagLower = tag.toLowerCase();
        const prefLower = preference.toLowerCase();
        
        if (prefLower.includes('modern') && (tagLower.includes('modern') || tagLower.includes('contemporary'))) return true;
        if (prefLower.includes('kitchen') && tagLower.includes('kitchen')) return true;
        if (prefLower.includes('granite') && tagLower.includes('granite')) return true;
        if (prefLower.includes('hardwood') && tagLower.includes('hardwood')) return true;
        if (prefLower.includes('updated') && (tagLower.includes('updated') || tagLower.includes('renovated'))) return true;
        
        return false;
      });
      
      if (matchingTags.length >= 1) strongMatches++;
    }
    
    // Strong match if 3+ visual preferences match
    return strongMatches >= 3 ? 10 : 0;
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

    // Categorize properties WITH images using score thresholds (0-100 scale converted to 0-1)
    const topPicks = propertiesWithImages.filter(item => item.match_score >= 0.70); // 70/100
    const otherMatches = propertiesWithImages.filter(item => item.match_score >= 0.55 && item.match_score < 0.70); // 55-70/100

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