/**
 * SEARCH WIDENING SERVICE
 * 
 * Intelligently widens search criteria when initial results are insufficient
 * Provides transparent, progressive relaxation of search parameters
 * 
 * MVP Widening Levels:
 * 1. Exact match (no adjustments)
 * 2. Flexible bedrooms (±1) and bathrooms
 * 3. Flexible budget (±20%) + bedrooms
 */

import type { BuyerProfile } from '@shared/schema';
import { repliersService } from './repliers-service';

export interface SearchAdjustment {
  field: string;
  originalValue: any;
  adjustedValue: any;
  description: string;
}

export interface WideningLevel {
  name: string;
  description: string;
  adjustments: {
    bedrooms?: { range: [number, number] };
    bathrooms?: { flexible: boolean };
    budget?: { percentage: number };
    removeFeatures?: boolean;
    locationOnly?: boolean;
  };
}

export interface ProgressiveSearchResult {
  listings: any[];
  searchLevel: string;
  levelDescription: string;
  adjustments: SearchAdjustment[];
  totalFound: number;
  searchCriteria: {
    original: any;
    applied: any;
  };
}

export interface AdjustedSearchCriteria {
  budgetMin?: number | null;
  budgetMax?: number | null;
  bedrooms?: number | null;
  bedroomsMin?: number;
  bedroomsMax?: number;
  bathrooms?: string | null;
  location?: string;
  homeType?: string | null;
  mustHaveFeatures?: string[];
  rawInput?: string;
  searchWidened?: boolean;
  wideningLevel?: string;
}

export class SearchWideningService {
  // Minimum number of results to consider search successful
  private readonly MIN_VIABLE_RESULTS = 5;
  
  // Progressive widening levels - MVP version
  private readonly wideningLevels: WideningLevel[] = [
    {
      name: 'exact',
      description: 'Exact match to buyer criteria',
      adjustments: {}
    },
    {
      name: 'no_features',
      description: 'Removing feature requirements (garage, modern kitchen)',
      adjustments: {
        removeFeatures: true
      }
    },
    {
      name: 'flexible_beds',
      description: 'Flexible on bedrooms (±1) and no features',
      adjustments: {
        bedrooms: { range: [-1, 1] },
        removeFeatures: true
      }
    },
    {
      name: 'flexible_budget',
      description: 'Expanding budget by 20% with flexible bedrooms',
      adjustments: {
        budget: { percentage: 20 },
        bedrooms: { range: [-1, 1] },
        removeFeatures: true
      }
    },
    {
      name: 'location_only',
      description: 'All listings in Quincy, MA - no other filters',
      adjustments: {
        locationOnly: true
      }
    }
  ];

  /**
   * Perform progressive search with automatic widening
   */
  async performProgressiveSearch(profile: BuyerProfile): Promise<ProgressiveSearchResult> {
    console.log(`🔍 [SearchWidening] Starting progressive search for profile ${profile.id}`);
    
    for (const level of this.wideningLevels) {
      console.log(`📊 [SearchWidening] Trying level: ${level.name}`);
      
      const adjustedCriteria = this.applyCriteriaAdjustments(profile, level);
      const adjustments = this.documentAdjustments(profile, adjustedCriteria, level);
      
      try {
        // Create an adjusted profile with the widened criteria
        const adjustedProfile = {
          ...profile,
          ...adjustedCriteria
        };
        
        // Use broad search for widening (allows flexibility)
        const listings = await repliersService.searchBroadListings(adjustedProfile);
        
        console.log(`📈 [SearchWidening] Level ${level.name} found ${listings.length} results`);
        
        // If we have enough results or we're at the last level, return them
        if (listings.length >= this.MIN_VIABLE_RESULTS || level === this.wideningLevels[this.wideningLevels.length - 1]) {
          return {
            listings,
            searchLevel: level.name,
            levelDescription: level.description,
            adjustments,
            totalFound: listings.length,
            searchCriteria: {
              original: this.extractOriginalCriteria(profile),
              applied: adjustedCriteria
            }
          };
        }
      } catch (error) {
        console.error(`❌ [SearchWidening] Error at level ${level.name}:`, error);
        // Continue to next level on error
      }
    }
    
    // Final fallback - return whatever we can find in the location
    console.log(`⚠️ [SearchWidening] All levels exhausted, returning location-only results`);
    return this.performLocationOnlyFallback(profile);
  }

  /**
   * Apply adjustments based on widening level
   */
  private applyCriteriaAdjustments(profile: BuyerProfile, level: WideningLevel): any {
    // Location-only search - return minimal criteria
    if (level.adjustments.locationOnly) {
      return {
        ...profile,
        budgetMin: null,
        budgetMax: null,
        bedrooms: null,
        bathrooms: null,
        homeType: null,
        mustHaveFeatures: [],
        specialNeeds: [],
        lifestyleDrivers: [],
        // Override rawInput for NLP to understand we want all properties
        rawInput: `all homes for sale in ${profile.location}`,
        // Mark this as a widened search
        searchWidened: true,
        wideningLevel: level.name
      };
    }
    
    // Create adjusted profile
    const adjusted = { ...profile };
    
    // Remove features if specified
    if (level.adjustments.removeFeatures) {
      adjusted.mustHaveFeatures = [];
    }
    
    // Budget adjustments
    if (level.adjustments.budget) {
      const percentage = level.adjustments.budget.percentage / 100;
      if (profile.budgetMin) {
        adjusted.budgetMin = Math.floor(profile.budgetMin * (1 - percentage));
      }
      if (profile.budgetMax) {
        adjusted.budgetMax = Math.ceil(profile.budgetMax * (1 + percentage));
      }
    }
    
    // Bedroom adjustments
    if (level.adjustments.bedrooms && profile.bedrooms) {
      const [minAdjust, maxAdjust] = level.adjustments.bedrooms.range;
      // Add properties that will be used by NLP prompt generation
      (adjusted as any).bedroomsMin = Math.max(1, profile.bedrooms + minAdjust);
      (adjusted as any).bedroomsMax = profile.bedrooms + maxAdjust;
      // Update bedrooms to reflect range
      adjusted.bedrooms = (adjusted as any).bedroomsMin;
    }
    
    // Mark as widened search
    (adjusted as any).searchWidened = true;
    (adjusted as any).wideningLevel = level.name;
    
    return adjusted;
  }

  /**
   * Document what adjustments were made
   */
  private documentAdjustments(
    profile: BuyerProfile, 
    adjusted: AdjustedSearchCriteria, 
    level: WideningLevel
  ): SearchAdjustment[] {
    const adjustments: SearchAdjustment[] = [];
    
    // Location-only search
    if (level.adjustments.locationOnly) {
      adjustments.push({
        field: 'all_criteria',
        originalValue: 'Full buyer criteria',
        adjustedValue: 'Location only',
        description: `Showing all properties in ${profile.location}`
      });
      return adjustments;
    }
    
    // Feature removal
    if (level.adjustments.removeFeatures && profile.mustHaveFeatures?.length > 0) {
      adjustments.push({
        field: 'features',
        originalValue: profile.mustHaveFeatures.join(', '),
        adjustedValue: 'None',
        description: 'Removed feature requirements to expand results'
      });
    }
    
    // Budget adjustments
    if (adjusted.budgetMin !== profile.budgetMin || adjusted.budgetMax !== profile.budgetMax) {
      const originalBudget = `$${profile.budgetMin?.toLocaleString() || '0'} - $${profile.budgetMax?.toLocaleString() || 'Any'}`;
      const adjustedBudget = `$${adjusted.budgetMin?.toLocaleString() || '0'} - $${adjusted.budgetMax?.toLocaleString() || 'Any'}`;
      
      adjustments.push({
        field: 'budget',
        originalValue: originalBudget,
        adjustedValue: adjustedBudget,
        description: `Expanded budget by ${level.adjustments.budget?.percentage || 0}%`
      });
    }
    
    // Bedroom adjustments
    if (adjusted.bedroomsMin && adjusted.bedroomsMax && profile.bedrooms) {
      adjustments.push({
        field: 'bedrooms',
        originalValue: profile.bedrooms,
        adjustedValue: `${adjusted.bedroomsMin}-${adjusted.bedroomsMax}`,
        description: 'Including homes with ±1 bedroom'
      });
    } else if (adjusted.bedrooms === null && profile.bedrooms) {
      adjustments.push({
        field: 'bedrooms',
        originalValue: profile.bedrooms,
        adjustedValue: 'Any',
        description: 'Removed bedroom requirement'
      });
    }
    
    return adjustments;
  }

  /**
   * Extract original criteria for comparison
   */
  private extractOriginalCriteria(profile: BuyerProfile): any {
    return {
      budget: `$${profile.budgetMin?.toLocaleString() || '0'} - $${profile.budgetMax?.toLocaleString() || 'Any'}`,
      bedrooms: profile.bedrooms,
      bathrooms: profile.bathrooms,
      location: profile.location,
      homeType: profile.homeType
    };
  }

  /**
   * Location-only fallback when all levels fail
   */
  private async performLocationOnlyFallback(profile: BuyerProfile): Promise<ProgressiveSearchResult> {
    try {
      // Create a minimal profile with just location for maximum results
      const locationOnlyProfile = {
        ...profile,
        budgetMin: null,
        budgetMax: null,
        bedrooms: null,
        bathrooms: null,
        homeType: null,
        mustHaveFeatures: [],
        rawInput: `all properties in ${profile.location}`
      };
      
      const listings = await repliersService.searchBroadListings(locationOnlyProfile);
      
      return {
        listings,
        searchLevel: 'location_only',
        levelDescription: 'All properties in the area',
        adjustments: [{
          field: 'all_criteria',
          originalValue: 'Full criteria',
          adjustedValue: 'Location only',
          description: 'Showing all available properties in the area for maximum options'
        }],
        totalFound: listings.length,
        searchCriteria: {
          original: this.extractOriginalCriteria(profile),
          applied: { location: profile.location }
        }
      };
    } catch (error) {
      console.error('❌ [SearchWidening] Location-only fallback failed:', error);
      return {
        listings: [],
        searchLevel: 'failed',
        levelDescription: 'Search failed',
        adjustments: [],
        totalFound: 0,
        searchCriteria: {
          original: this.extractOriginalCriteria(profile),
          applied: {}
        }
      };
    }
  }

  /**
   * Get a human-readable summary of adjustments
   */
  generateAdjustmentSummary(adjustments: SearchAdjustment[]): string {
    if (adjustments.length === 0) {
      return 'Showing exact matches to your criteria';
    }
    
    const summaryParts = adjustments.map(adj => {
      switch (adj.field) {
        case 'budget':
          return `expanded budget range to ${adj.adjustedValue}`;
        case 'bedrooms':
          return `included ${adj.adjustedValue} bedroom homes`;
        case 'bathrooms':
          return `relaxed bathroom requirements`;
        case 'all_criteria':
          return adj.description.toLowerCase();
        default:
          return adj.description;
      }
    });
    
    return `To find more options, we ${summaryParts.join(', ')}`;
  }

  /**
   * Get copy-paste ready summary for agents to share with clients
   */
  generateClientSummary(result: ProgressiveSearchResult, profile: BuyerProfile): string {
    const { totalFound, adjustments, searchLevel, levelDescription } = result;
    
    if (searchLevel === 'exact') {
      return `Great news! I found ${totalFound} properties that exactly match your criteria in ${profile.location}.`;
    }
    
    // Create specific messages for each widening level
    switch (searchLevel) {
      case 'no_features':
        return `I found ${totalFound} properties by focusing on your core needs (location, budget, bedrooms) and temporarily setting aside specific feature preferences like garage or modern kitchen. We can filter these results together based on what matters most to you.`;
        
      case 'flexible_beds':
        return `To expand your options, I've included properties with ${profile.bedrooms ? profile.bedrooms - 1 : 'flexible'} to ${profile.bedrooms ? profile.bedrooms + 1 : 'any'} bedrooms. This gives us ${totalFound} properties to consider in ${profile.location}.`;
        
      case 'flexible_budget':
        return `I've expanded the search to include properties up to 20% above your target budget. This broader search found ${totalFound} properties. Some may be negotiable or worth the extra investment.`;
        
      case 'location_only':
        return `Here are all ${totalFound} available properties in ${profile.location}. This complete view of the market helps us understand all options and refine based on your priorities.`;
        
      default:
        const adjustmentText = this.generateAdjustmentSummary(adjustments);
        return `I searched for properties in ${profile.location}. ${adjustmentText}. This gives us ${totalFound} total options to consider!`;
    }
  }
}

// Export singleton instance
export const searchWideningService = new SearchWideningService();