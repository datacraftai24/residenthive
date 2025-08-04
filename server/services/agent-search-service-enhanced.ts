/**
 * ENHANCED AGENT SEARCH SERVICE
 * 
 * Integrates progressive search widening for better results
 * Maintains backward compatibility with existing AgentSearchService
 */

import { agentSearchService } from './agent-search-service';
import { searchWideningService, type ProgressiveSearchResult } from './search-widening-service';
import type { BuyerProfile, ProfileTag } from '@shared/schema';

interface EnhancedSearchView1Results {
  viewType: 'broad';
  searchCriteria: {
    budgetRange: string;
    bedrooms: string;
    location: string;
    propertyType?: string;
  };
  totalFound: number;
  listings: any[];
  executionTime: number;
  // New fields for widening
  searchLevel?: string;
  levelDescription?: string;
  adjustments?: any[];
  adjustmentSummary?: string;
  clientSummary?: string;
}

interface EnhancedAgentSearchResponse {
  searchType: 'agent_dual_view';
  profileData: {
    id: number;
    name: string;
    location: string;
  };
  view1: EnhancedSearchView1Results;
  view2: any; // Keep existing View2 structure
  totalExecutionTime: number;
  timestamp: string;
}

export class AgentSearchServiceEnhanced {
  
  /**
   * Enhanced dual-view search with progressive widening
   */
  async performDualViewSearchWithWidening(profile: BuyerProfile, tags: ProfileTag[] = []): Promise<EnhancedAgentSearchResponse> {
    const startTime = Date.now();
    
    console.log(`🚀 [AgentSearchEnhanced] Starting enhanced dual-view search for profile ${profile.id}`);
    
    try {
      // Execute both searches in parallel
      const [view1Results, view2Results] = await Promise.all([
        this.executeView1WithProgression(profile),
        agentSearchService['executeView2AIRecommendations'](profile, tags)
      ]);

      const totalExecutionTime = Date.now() - startTime;

      const response: EnhancedAgentSearchResponse = {
        searchType: 'agent_dual_view',
        profileData: {
          id: profile.id,
          name: profile.name,
          location: profile.location
        },
        view1: view1Results,
        view2: view2Results,
        totalExecutionTime,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ [AgentSearchEnhanced] Enhanced search completed in ${totalExecutionTime}ms`);
      console.log(`📊 View 1: ${view1Results.totalFound} results (${view1Results.searchLevel} level)`);
      console.log(`🎯 View 2: ${view2Results.totalFound} AI recommendations`);

      return response;

    } catch (error) {
      console.error(`❌ [AgentSearchEnhanced] Enhanced search failed:`, error);
      throw new Error(`Enhanced agent search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * VIEW 1: Market Overview with Progressive Search
   */
  private async executeView1WithProgression(profile: BuyerProfile): Promise<EnhancedSearchView1Results> {
    const startTime = Date.now();
    
    console.log(`📊 [AgentSearchEnhanced] Executing View 1 with progressive widening`);
    
    try {
      // Use the new progressive search
      const progressiveResult = await searchWideningService.performProgressiveSearch(profile);
      
      // Transform to enhanced market overview format
      const listings = progressiveResult.listings.map(listing => ({
        mlsNumber: listing.mls_number || listing.id,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        zip: listing.zip_code,
        listPrice: listing.price,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.square_feet,
        propertyType: listing.property_type,
        daysOnMarket: this.calculateDaysOnMarket(listing.listing_date),
        status: listing.status,
        images: listing.images || [],
        photoCount: (listing.images || []).length
      }));

      const executionTime = Date.now() - startTime;
      
      // Generate summaries
      const adjustmentSummary = searchWideningService.generateAdjustmentSummary(progressiveResult.adjustments);
      const clientSummary = searchWideningService.generateClientSummary(progressiveResult, profile);

      const result: EnhancedSearchView1Results = {
        viewType: 'broad',
        searchCriteria: {
          budgetRange: this.formatBudgetRange(profile.budgetMin, profile.budgetMax),
          bedrooms: profile.bedrooms?.toString() || 'Any',
          location: profile.location,
          propertyType: profile.homeType
        },
        totalFound: listings.length,
        listings: listings.slice(0, 50), // Limit for performance
        executionTime,
        // New widening information
        searchLevel: progressiveResult.searchLevel,
        levelDescription: progressiveResult.levelDescription,
        adjustments: progressiveResult.adjustments,
        adjustmentSummary,
        clientSummary
      };

      console.log(`✅ [AgentSearchEnhanced] View 1 completed: ${result.totalFound} listings (${result.searchLevel}) in ${executionTime}ms`);
      return result;

    } catch (error) {
      console.error(`❌ [AgentSearchEnhanced] View 1 failed:`, error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private formatBudgetRange(min?: number | null, max?: number | null): string {
    if (!min && !max) return 'Any';
    if (!min) return `Under $${max?.toLocaleString()}`;
    if (!max) return `Over $${min?.toLocaleString()}`;
    return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  }

  private calculateDaysOnMarket(listingDate?: string): number | undefined {
    if (!listingDate) return undefined;
    
    const listed = new Date(listingDate);
    const now = new Date();
    const diffTime = now.getTime() - listed.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : undefined;
  }

  /**
   * Fallback to original service for backward compatibility
   */
  async performDualViewSearch(profile: BuyerProfile, tags: ProfileTag[] = []): Promise<any> {
    // Delegate to original service for backward compatibility
    return agentSearchService.performDualViewSearch(profile, tags);
  }
}

// Export singleton instance
export const agentSearchServiceEnhanced = new AgentSearchServiceEnhanced();