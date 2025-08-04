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
  budgetMin?: number;
  budgetMax?: number;
  bedrooms?: number;
  bedroomsMin?: number;
  bedroomsMax?: number;
  bathrooms?: string;
  location?: string;
  homeType?: string;
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
      name: 'flexible_beds',
      description: 'Flexible on bedrooms and bathrooms',
      adjustments: {
        bedrooms: { range: [-1, 1] },
        bathrooms: { flexible: true }
      }
    },
    {
      name: 'flexible_budget',
      description: 'Expanded budget range and flexible bedrooms',
      adjustments: {
        budget: { percentage: 20 },
        bedrooms: { range: [-1, 1] },
        bathrooms: { flexible: true }
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
        // Use the existing searchListings method to maintain compatibility
        const listings = await repliersService.searchListings({
          ...profile,
          ...adjustedCriteria
        });
        
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
  private applyCriteriaAdjustments(profile: BuyerProfile, level: WideningLevel): AdjustedSearchCriteria {
    const adjusted: AdjustedSearchCriteria = {};
    
    // Budget adjustments
    if (level.adjustments.budget) {
      const percentage = level.adjustments.budget.percentage / 100;
      if (profile.budgetMin) {
        adjusted.budgetMin = Math.floor(profile.budgetMin * (1 - percentage));
      }
      if (profile.budgetMax) {
        adjusted.budgetMax = Math.ceil(profile.budgetMax * (1 + percentage));
      }
    } else {
      adjusted.budgetMin = profile.budgetMin;
      adjusted.budgetMax = profile.budgetMax;
    }
    
    // Bedroom adjustments
    if (level.adjustments.bedrooms && profile.bedrooms) {
      const [minAdjust, maxAdjust] = level.adjustments.bedrooms.range;
      adjusted.bedroomsMin = Math.max(1, profile.bedrooms + minAdjust);
      adjusted.bedroomsMax = profile.bedrooms + maxAdjust;
      // For compatibility with existing search
      adjusted.bedrooms = adjusted.bedroomsMin;
    } else {
      adjusted.bedrooms = profile.bedrooms;
    }
    
    // Bathroom adjustments
    if (level.adjustments.bathrooms?.flexible && profile.bathrooms) {
      // Convert strict bathroom requirement to flexible
      if (profile.bathrooms.includes('+')) {
        adjusted.bathrooms = profile.bathrooms;
      } else {
        const bathNum = parseInt(profile.bathrooms);
        if (!isNaN(bathNum) && bathNum > 1) {
          adjusted.bathrooms = `${bathNum - 1}+`;
        } else {
          adjusted.bathrooms = profile.bathrooms;
        }
      }
    } else {
      adjusted.bathrooms = profile.bathrooms;
    }
    
    // Keep location and homeType unchanged
    adjusted.location = profile.location;
    adjusted.homeType = profile.homeType;
    
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
    }
    
    // Bathroom adjustments
    if (adjusted.bathrooms !== profile.bathrooms) {
      adjustments.push({
        field: 'bathrooms',
        originalValue: profile.bathrooms,
        adjustedValue: adjusted.bathrooms,
        description: 'More flexible bathroom count'
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
      // Just search by location
      const listings = await repliersService.searchListings({
        location: profile.location,
        limit: 50
      });
      
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
    const { totalFound, adjustments, searchLevel } = result;
    
    if (searchLevel === 'exact') {
      return `Great news! I found ${totalFound} properties that exactly match your criteria in ${profile.location}.`;
    }
    
    const adjustmentText = this.generateAdjustmentSummary(adjustments);
    
    return `I searched for properties matching your criteria in ${profile.location}. ${adjustmentText}. This gives us ${totalFound} total options to consider!`;
  }
}

// Export singleton instance
export const searchWideningService = new SearchWideningService();