/**
 * AGENT SEARCH SERVICE
 * 
 * High-level service for agent search functionality
 * Orchestrates the two-view search system: Broad + AI Recommendations
 * 
 * Architecture:
 * BuyerProfile → AgentSearchService → RepliersService → Views
 */

import { repliersService } from './repliers-service';
import type { BuyerProfile, ProfileTag } from '@shared/schema';

interface SearchView1Results {
  viewType: 'broad';
  searchCriteria: {
    budgetRange: string;
    bedrooms: string;
    location: string;
    propertyType?: string;
  };
  totalFound: number;
  listings: MarketOverviewListing[];
  executionTime: number;
}

interface SearchView2Results {
  viewType: 'ai_recommendations';
  searchCriteria: {
    budgetRange: string;
    bedrooms: string;
    location: string;
    propertyType?: string;
  };
  totalFound: number;
  listings: AIRecommendationListing[];
  executionTime: number;
  aiAnalysis: {
    topMatches: number;
    visualAnalysis: boolean;
    scoringFactors: string[];
  };
}

interface MarketOverviewListing {
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  listPrice: number;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  propertyType: string;
  daysOnMarket?: number;
  status: string;
  images: string[];
  photoCount: number;
}

interface AIRecommendationListing extends MarketOverviewListing {
  matchScore: number;
  matchLabel: string;
  matchReasons: string[];
  dealbreakers: string[];
  aiInsights?: {
    visualAnalysis?: string;
    styleMatch?: string;
    qualityScore?: number;
  };
  scoreBreakdown: {
    featureMatch: number;
    budgetMatch: number;
    bedroomMatch: number;
    locationMatch: number;
    overallScore: number;
  };
}

interface AgentSearchResponse {
  searchType: 'agent_dual_view';
  profileData: {
    id: number;
    name: string;
    location: string;
  };
  view1: SearchView1Results;
  view2: SearchView2Results;
  totalExecutionTime: number;
  timestamp: string;
}

export class AgentSearchService {
  
  /**
   * Main search method - returns both views
   */
  async performDualViewSearch(profile: BuyerProfile, tags: ProfileTag[] = []): Promise<AgentSearchResponse> {
    const startTime = Date.now();
    
    console.log(`🚀 [AgentSearch] Starting dual-view search for profile ${profile.id}: ${profile.name}`);
    
    try {
      // Execute View 1 first to get listings
      const view1Results = await this.executeView1BroadSearch(profile);
      
      // Pass View 1 listings to View 2 to avoid duplicate API calls
      const view2Results = await this.executeView2AIRecommendations(
        profile, 
        tags,
        view1Results.listings // Reuse listings from View 1
      );

      const totalExecutionTime = Date.now() - startTime;

      const response: AgentSearchResponse = {
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

      console.log(`✅ [AgentSearch] Dual-view search completed in ${totalExecutionTime}ms`);
      console.log(`📊 View 1: ${view1Results.totalFound} broad results`);
      console.log(`🎯 View 2: ${view2Results.totalFound} AI recommendations`);

      return response;

    } catch (error) {
      console.error(`❌ [AgentSearch] Dual-view search failed:`, error);
      throw new Error(`Agent search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * VIEW 1: Broad Market Overview
   * Shows comprehensive market data for agent analysis
   */
  private async executeView1BroadSearch(profile: BuyerProfile): Promise<SearchView1Results> {
    const startTime = Date.now();
    
    console.log(`📊 [AgentSearch] Executing View 1: Broad Market Search`);
    
    try {
      // Get broad listings from Repliers
      const rawListings = await repliersService.searchBroadListings(profile);
      
      // Transform to market overview format
      const listings: MarketOverviewListing[] = rawListings.map(listing => ({
        mlsNumber: listing.mls_number || listing.id,
        address: listing.address, // Now guaranteed to be string from RepliersService
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

      const result: SearchView1Results = {
        viewType: 'broad',
        searchCriteria: {
          budgetRange: this.formatBudgetRange(profile.budgetMin, profile.budgetMax),
          bedrooms: profile.bedrooms?.toString() || 'Any',
          location: profile.location,
          propertyType: profile.homeType
        },
        totalFound: listings.length,
        listings: listings.slice(0, 50), // Limit for performance
        executionTime
      };

      console.log(`✅ [AgentSearch] View 1 completed: ${result.totalFound} listings in ${executionTime}ms`);
      return result;

    } catch (error) {
      console.error(`❌ [AgentSearch] View 1 failed:`, error);
      throw error;
    }
  }

  /**
   * VIEW 2: AI Recommendations
   * Shows scored and analyzed properties with AI insights
   */
  private async executeView2AIRecommendations(
    profile: BuyerProfile, 
    tags: ProfileTag[],
    view1Listings?: MarketOverviewListing[]
  ): Promise<SearchView2Results> {
    const startTime = Date.now();
    
    console.log(`🎯 [AgentSearch] Executing View 2: AI Recommendations`);
    
    try {
      // If we have View 1 listings, reuse them to avoid duplicate API calls
      let rawListings: any[];
      
      if (view1Listings && view1Listings.length > 0) {
        console.log(`🔄 [AgentSearch] Reusing ${view1Listings.length} listings from View 1`);
        // Convert back to listing format for scoring
        rawListings = view1Listings.map(listing => ({
          id: listing.mlsNumber,
          mls_number: listing.mlsNumber,
          price: listing.listPrice,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          property_type: listing.propertyType,
          address: listing.address,
          city: listing.city,
          state: listing.state,
          zip_code: listing.zip,
          square_feet: listing.sqft,
          status: listing.status,
          listing_date: this.calculateListingDate(listing.daysOnMarket),
          images: listing.images
        }));
      } else {
        // Fallback: Get targeted listings from Repliers (shouldn't happen now)
        console.log(`⚠️ [AgentSearch] No View 1 listings, calling API`);
        rawListings = await repliersService.searchTargetedListings(profile);
      }
      
      // Import scoring services
      const { listingScorer } = await import('../listing-scorer');
      const { enhancedListingScorer } = await import('../enhanced-listing-scorer');

      // Score all listings using our smart scoring system
      const scoredListings = rawListings.map(listing => 
        listingScorer.scoreListing(listing, profile, tags, [])
      );

      // Sort by score and take top matches
      const topMatches = scoredListings
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, 20); // Top 20 for detailed analysis

      // TEMPORARILY DISABLED: Visual analysis causing 89s delays
      // TODO: Re-enable after optimization
      /*
      const enhancedResults = await enhancedListingScorer.scoreListingsWithVisualIntelligence(
        topMatches.map(scored => scored.listing),
        profile,
        tags
      );
      */
      
      // For now, create mock enhanced results without visual analysis
      const enhancedResults = {
        top_picks: topMatches.slice(0, 5).map(scored => ({
          ...scored,
          visualAnalysis: undefined,
          visualTagMatches: [],
          visualFlags: [],
          enhancedReason: scored.reason
        })),
        other_matches: topMatches.slice(5).map(scored => ({
          ...scored,
          visualAnalysis: undefined,
          visualTagMatches: [],
          visualFlags: [],
          enhancedReason: scored.reason
        })),
        chat_blocks: [],
        search_summary: {
          total_found: topMatches.length,
          top_picks_count: Math.min(5, topMatches.length),
          other_matches_count: Math.max(0, topMatches.length - 5),
          visual_analysis_count: 0,
          search_criteria: profile
        }
      };

      // Combine enhanced and basic results
      const listings: AIRecommendationListing[] = topMatches.map(scored => {
        const enhanced = enhancedResults.top_picks.find((e: any) => e.listing.id === scored.listing.id) ||
                        enhancedResults.other_matches.find((e: any) => e.listing.id === scored.listing.id);

        return {
          mlsNumber: scored.listing.mls_number || scored.listing.id,
          address: scored.listing.address, // Now guaranteed to be string from RepliersService
          city: scored.listing.city,
          state: scored.listing.state,
          zip: scored.listing.zip_code,
          listPrice: scored.listing.price,
          bedrooms: scored.listing.bedrooms,
          bathrooms: scored.listing.bathrooms,
          sqft: scored.listing.square_feet,
          propertyType: scored.listing.property_type,
          daysOnMarket: this.calculateDaysOnMarket(scored.listing.listing_date),
          status: scored.listing.status,
          images: scored.listing.images || [],
          photoCount: (scored.listing.images || []).length,
          matchScore: Math.round(scored.match_score * 100),
          matchLabel: scored.label,
          matchReasons: scored.matched_features,
          dealbreakers: scored.dealbreaker_flags,
          aiInsights: enhanced ? {
            visualAnalysis: enhanced.visual_analysis,
            styleMatch: enhanced.style_match,
            qualityScore: enhanced.quality_score
          } : undefined,
          scoreBreakdown: {
            featureMatch: Math.round((scored.score_breakdown?.feature_match || 0)),
            budgetMatch: Math.round((scored.score_breakdown?.budget_match || 0)),
            bedroomMatch: Math.round((scored.score_breakdown?.bedroom_match || 0)),
            locationMatch: Math.round((scored.score_breakdown?.location_match || 0)),
            overallScore: Math.round(scored.match_score * 100)
          }
        };
      });

      const executionTime = Date.now() - startTime;

      const result: SearchView2Results = {
        viewType: 'ai_recommendations',
        searchCriteria: {
          budgetRange: this.formatBudgetRange(profile.budgetMin, profile.budgetMax),
          bedrooms: profile.bedrooms?.toString() || 'Any',
          location: profile.location,
          propertyType: profile.homeType
        },
        totalFound: listings.length,
        listings,
        executionTime,
        aiAnalysis: {
          topMatches: enhancedResults.top_picks.length + enhancedResults.other_matches.length,
          visualAnalysis: enhancedResults.top_picks.length > 0,
          scoringFactors: [
            'Budget Match', 'Bedroom/Bathroom Fit', 'Location Preference',
            'Property Features', 'Visual Style Analysis', 'Market Quality'
          ]
        }
      };

      console.log(`✅ [AgentSearch] View 2 completed: ${result.totalFound} recommendations in ${executionTime}ms`);
      return result;

    } catch (error) {
      console.error(`❌ [AgentSearch] View 2 failed:`, error);
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

  private calculateListingDate(daysOnMarket?: number): string | undefined {
    if (!daysOnMarket) return undefined;
    
    const now = new Date();
    const listingDate = new Date(now.getTime() - (daysOnMarket * 24 * 60 * 60 * 1000));
    return listingDate.toISOString();
  }
}

// Export singleton instance
export const agentSearchService = new AgentSearchService();