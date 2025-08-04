/**
 * REACTIVE AGENT SEARCH SERVICE
 * 
 * Automatically triggers enhanced search when normal search returns insufficient results
 * Provides manual override for agents to force enhanced search
 */

import { agentSearchService } from './agent-search-service';
import { searchWideningService } from './search-widening-service';
import type { BuyerProfile, ProfileTag } from '@shared/schema';

interface ReactiveSearchResponse {
  searchType: 'agent_dual_view_reactive';
  profileData: {
    id: number;
    name: string;
    location: string;
  };
  // Initial search results
  initialSearch: {
    view1: any;
    view2: any;
    totalFound: number;
    sufficientResults: boolean;
  };
  // Enhanced search results (if triggered)
  enhancedSearch?: {
    triggered: boolean;
    reason: string;
    view1: any;
    adjustments: any[];
    adjustmentSummary: string;
    clientSummary: string;
  };
  // Recommendations for agent
  agentRecommendations: {
    shouldEnhance: boolean;
    message: string;
    suggestedActions: string[];
  };
  totalExecutionTime: number;
  timestamp: string;
}

export class AgentSearchServiceReactive {
  // Threshold for triggering enhanced search
  private readonly MINIMUM_VIABLE_RESULTS = 5;
  
  /**
   * Reactive search that automatically enhances when needed
   */
  async performReactiveSearch(
    profile: BuyerProfile, 
    tags: ProfileTag[] = [],
    forceEnhanced: boolean = false
  ): Promise<ReactiveSearchResponse> {
    const startTime = Date.now();
    
    console.log(`🔍 [ReactiveSearch] Starting search for profile ${profile.id} (force enhanced: ${forceEnhanced})`);
    
    try {
      // Step 1: Always perform initial search first
      const initialResults = await agentSearchService.performDualViewSearch(profile, tags);
      const totalInitialResults = initialResults.view1.totalFound;
      
      // Check if we have sufficient results
      const sufficientResults = totalInitialResults >= this.MINIMUM_VIABLE_RESULTS;
      
      console.log(`📊 [ReactiveSearch] Initial search found ${totalInitialResults} results (sufficient: ${sufficientResults})`);
      
      // Step 2: Determine if enhanced search is needed
      const shouldEnhance = forceEnhanced || !sufficientResults;
      
      let enhancedSearchData = undefined;
      let agentRecommendations;
      
      if (shouldEnhance) {
        // Perform enhanced search with widening
        console.log(`🚀 [ReactiveSearch] Triggering enhanced search...`);
        
        const progressiveResult = await searchWideningService.performProgressiveSearch(profile);
        
        // Transform enhanced results to match view structure
        const enhancedView1 = this.transformProgressiveResults(progressiveResult, profile);
        
        enhancedSearchData = {
          triggered: true,
          reason: forceEnhanced ? 'Agent requested expanded search' : 'Initial search returned limited results',
          view1: enhancedView1,
          adjustments: progressiveResult.adjustments,
          adjustmentSummary: searchWideningService.generateAdjustmentSummary(progressiveResult.adjustments),
          clientSummary: searchWideningService.generateClientSummary(progressiveResult, profile)
        };
        
        agentRecommendations = this.generateEnhancedRecommendations(
          totalInitialResults, 
          progressiveResult.totalFound,
          progressiveResult.adjustments
        );
      } else {
        agentRecommendations = this.generateStandardRecommendations(totalInitialResults);
      }
      
      const totalExecutionTime = Date.now() - startTime;
      
      const response: ReactiveSearchResponse = {
        searchType: 'agent_dual_view_reactive',
        profileData: {
          id: profile.id,
          name: profile.name,
          location: profile.location
        },
        initialSearch: {
          view1: initialResults.view1,
          view2: initialResults.view2,
          totalFound: totalInitialResults,
          sufficientResults
        },
        enhancedSearch: enhancedSearchData,
        agentRecommendations,
        totalExecutionTime,
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ [ReactiveSearch] Search completed in ${totalExecutionTime}ms`);
      return response;
      
    } catch (error) {
      console.error(`❌ [ReactiveSearch] Search failed:`, error);
      throw new Error(`Reactive search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Transform progressive search results to match view structure
   */
  private transformProgressiveResults(progressiveResult: any, profile: BuyerProfile): any {
    const listings = progressiveResult.listings.map((listing: any) => ({
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
      status: listing.status,
      images: listing.images || [],
      photoCount: (listing.images || []).length
    }));
    
    return {
      viewType: 'broad_enhanced',
      searchCriteria: progressiveResult.searchCriteria,
      totalFound: listings.length,
      listings: listings.slice(0, 50),
      searchLevel: progressiveResult.searchLevel,
      levelDescription: progressiveResult.levelDescription
    };
  }
  
  /**
   * Generate recommendations when enhanced search was triggered
   */
  private generateEnhancedRecommendations(
    initialCount: number, 
    enhancedCount: number,
    adjustments: any[]
  ): any {
    const improvement = enhancedCount - initialCount;
    
    return {
      shouldEnhance: false, // Already enhanced
      message: `Enhanced search found ${improvement} additional properties by adjusting criteria. Total options increased from ${initialCount} to ${enhancedCount}.`,
      suggestedActions: [
        'Review the expanded criteria with your client',
        'Highlight properties that closely match original criteria',
        'Discuss which adjustments (budget, bedrooms) are most acceptable',
        improvement > 20 ? 'Consider narrowing results by focusing on best matches' : 'All results are manageable to review'
      ]
    };
  }
  
  /**
   * Generate recommendations for standard search with sufficient results
   */
  private generateStandardRecommendations(resultCount: number): any {
    return {
      shouldEnhance: false,
      message: `Found ${resultCount} properties matching the criteria. Good inventory available!`,
      suggestedActions: [
        'Review properties with client',
        'Sort by best match scores',
        'Schedule viewings for top picks',
        'Use "Find More Options" if client wants to see expanded criteria'
      ]
    };
  }
  
  /**
   * Manual trigger for enhanced search only
   */
  async performEnhancedSearchOnly(profile: BuyerProfile): Promise<any> {
    console.log(`🎯 [ReactiveSearch] Manual enhanced search for profile ${profile.id}`);
    
    const progressiveResult = await searchWideningService.performProgressiveSearch(profile);
    
    return {
      searchType: 'enhanced_only',
      results: this.transformProgressiveResults(progressiveResult, profile),
      adjustments: progressiveResult.adjustments,
      adjustmentSummary: searchWideningService.generateAdjustmentSummary(progressiveResult.adjustments),
      clientSummary: searchWideningService.generateClientSummary(progressiveResult, profile)
    };
  }
}

// Export singleton instance
export const agentSearchServiceReactive = new AgentSearchServiceReactive();