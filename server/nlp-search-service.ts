import type { BuyerProfile, ProfileTag, InsertNLPSearchLog } from "@shared/schema";
import { nlpSearchLogs } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface NLPSearchRequest {
  prompt: string;
  nlpId?: string;
}

export interface NLPSearchResponse {
  request: {
    url: string;
    body?: {
      imageSearchItems?: Array<{
        type: string;
        value: string;
        boost: number;
      }>;
    };
    summary: string;
  };
  nlpId: string;
}

export interface SearchExecutionResult {
  listings: any[];
  apiVersion: number;
  count: number;
  statistics: any;
}

export interface NLPSearchLog {
  profileId: number;
  agentId: number;
  nlpQuery: string;
  nlpResponse: NLPSearchResponse;
  searchUrl: string;
  searchResults: SearchExecutionResult;
  executionTime: number;
  timestamp: string;
  nlpId: string;
}

class NLPSearchService {
  private apiKey: string;
  private baseUrl = 'https://api.repliers.io';

  constructor() {
    this.apiKey = 'lwSqnPJBTbOq2hBMj26lwFqBR4yfit';
  }

  /**
   * Convert buyer profile to natural language search prompt
   */
  private createNLPPrompt(profile: BuyerProfile, tags: ProfileTag[] = []): string {
    const components = [];
    
    // Budget
    if (profile.budgetMin && profile.budgetMax) {
      components.push(`budget between $${profile.budgetMin.toLocaleString()} and $${profile.budgetMax.toLocaleString()}`);
    }
    
    // Property type and bedrooms
    if (profile.homeType && profile.bedrooms) {
      components.push(`${profile.bedrooms}-bedroom ${profile.homeType} home`);
    }
    
    // Bathrooms
    if (profile.bathrooms) {
      components.push(`at least ${profile.bathrooms} bathroom${profile.bathrooms !== '1' ? 's' : ''}`);
    }
    
    // Location
    if (profile.preferredAreas && profile.preferredAreas.length > 0) {
      components.push(`in ${profile.preferredAreas.join(' or ')}`);
    }
    
    // Must-have features
    if (profile.mustHaveFeatures && profile.mustHaveFeatures.length > 0) {
      components.push(`with ${profile.mustHaveFeatures.join(', ')}`);
    }
    
    // Special needs and lifestyle drivers - commented out as they may be too restrictive
    // const preferences = [];
    // if (profile.specialNeeds && profile.specialNeeds.length > 0) {
    //   preferences.push(...profile.specialNeeds);
    // }
    // if (profile.lifestyleDrivers && profile.lifestyleDrivers.length > 0) {
    //   preferences.push(...profile.lifestyleDrivers);
    // }
    // 
    // if (preferences.length > 0) {
    //   components.push(`suitable for ${preferences.join(', ')}`);
    // }
    
    // Add behavioral tags for context
    if (tags.length > 0) {
      const behavioralTags = tags
        .filter(tag => tag.confidence > 0.7)
        .map(tag => tag.tag)
        .slice(0, 3); // Top 3 most confident tags
      
      if (behavioralTags.length > 0) {
        components.push(`with preferences for ${behavioralTags.join(', ')}`);
      }
    }
    
    return `Find a ${components.join(' ')}`;
  }

  /**
   * Call Repliers NLP API to convert natural language to search URL
   * Now uses centralized RepliersService
   */
  async callNLPAPI(request: NLPSearchRequest): Promise<NLPSearchResponse> {
    console.log(`🧠 Calling Repliers NLP API via RepliersService`);
    console.log(`📝 Query: ${request.prompt}`);
    if (request.nlpId) {
      console.log(`🔗 Context ID: ${request.nlpId}`);
    }

    // Import and use centralized Repliers service
    const { repliersService } = await import('./services/repliers-service');
    
    try {
      const nlpResult = await repliersService.callNLPAPI(request.prompt, request.nlpId);
      
      console.log(`✅ NLP API Success via RepliersService`);
      console.log(`🔗 Generated URL: ${nlpResult.request.url}`);
      console.log(`📋 Summary: ${nlpResult.request.summary}`);
      console.log(`🆔 NLP ID: ${nlpResult.nlpId}`);

      return nlpResult;
    } catch (error) {
      console.error(`❌ NLP API Error via RepliersService:`, error);
      throw error;
    }
  }

  /**
   * Execute the generated search URL to get listings
   */
  async executeSearch(searchUrl: string, requestBody?: any): Promise<SearchExecutionResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Executing search: ${searchUrl}`);

    // For GET requests without body
    if (!requestBody) {
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'REPLIERS-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const executionTime = Date.now() - startTime;
      
      console.log(`✅ Search completed (${executionTime}ms): ${result.count} listings found`);
      
      return result;
    }

    // For POST requests with image search (if supported)
    try {
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'REPLIERS-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        // If image search fails, fall back to GET request
        console.log(`⚠️ POST request failed, falling back to GET`);
        return await this.executeSearch(searchUrl);
      }

      const result = await response.json();
      const executionTime = Date.now() - startTime;
      
      console.log(`✅ Enhanced search completed (${executionTime}ms): ${result.count} listings found`);
      
      return result;
    } catch (error) {
      console.log(`⚠️ Enhanced search failed, falling back to basic search`);
      return await this.executeSearch(searchUrl);
    }
  }

  /**
   * Complete NLP search workflow: profile -> NLP -> search -> results
   */
  async performNLPSearch(
    profile: BuyerProfile, 
    tags: ProfileTag[] = [], 
    contextNlpId?: string
  ): Promise<{
    nlpResponse: NLPSearchResponse;
    searchResults: SearchExecutionResult;
    searchLog: NLPSearchLog | null;
  }> {
    const overallStartTime = Date.now();

    try {
      // Step 1: Create natural language prompt
      const nlpPrompt = this.createNLPPrompt(profile, tags);

      // Step 2: Call NLP API
      const nlpResponse = await this.callNLPAPI({
        prompt: nlpPrompt,
        nlpId: contextNlpId
      });

      // Step 3: Execute search
      const searchResults = await this.executeSearch(
        nlpResponse.request.url,
        nlpResponse.request.body
      );

      console.log(`🎯 Complete NLP search workflow finished in ${Date.now() - overallStartTime}ms`);
      console.log(`📊 Results: ${searchResults.count} listings for ${profile.name}`);

      // Declare searchLog in outer scope
      let searchLog: NLPSearchLog | null = null;

      // Only create and persist search log if agent is associated
      if (profile.agentId) {
        // Step 4: Create search log
        searchLog = {
          profileId: profile.id,
          agentId: profile.agentId,
          nlpQuery: nlpPrompt,
          nlpResponse,
          searchUrl: nlpResponse.request.url,
          searchResults,
          executionTime: Date.now() - overallStartTime,
          timestamp: new Date().toISOString(),
          nlpId: nlpResponse.nlpId
        };

        // Step 5: Persist search log
        await this.persistSearchLog(searchLog);
      } else {
        console.log(`⚠️ Search log not persisted - no agent associated with profile ${profile.id}`);
      }

      return {
        nlpResponse,
        searchResults,
        searchLog
      };

    } catch (error) {
      console.error(`❌ NLP search failed for profile ${profile.id}:`, error);
      throw error;
    }
  }

  /**
   * Refine search with conversational input using previous NLP ID
   */
  async refineSearch(
    nlpId: string,
    refinementText: string,
    originalProfile: BuyerProfile
  ): Promise<{
    nlpResponse: NLPSearchResponse;
    searchResults: SearchExecutionResult;
    searchLog: NLPSearchLog | null;
  }> {
    console.log(`🔄 Refining search with context ID: ${nlpId}`);
    console.log(`📝 Refinement: ${refinementText}`);

    const overallStartTime = Date.now();

    try {
      // Call NLP API with context
      const nlpResponse = await this.callNLPAPI({
        prompt: refinementText,
        nlpId: nlpId
      });

      // Execute refined search
      const searchResults = await this.executeSearch(
        nlpResponse.request.url,
        nlpResponse.request.body
      );

      console.log(`🎯 Search refinement completed in ${Date.now() - overallStartTime}ms`);
      console.log(`📊 Refined results: ${searchResults.count} listings`);

      // Declare searchLog in outer scope
      let searchLog: NLPSearchLog | null = null;

      // Only create and persist search log if agent is associated
      if (originalProfile.agentId) {
        // Create search log for refinement
        searchLog = {
          profileId: originalProfile.id,
          agentId: originalProfile.agentId,
          nlpQuery: refinementText,
          nlpResponse,
          searchUrl: nlpResponse.request.url,
          searchResults,
          executionTime: Date.now() - overallStartTime,
          timestamp: new Date().toISOString(),
          nlpId: nlpResponse.nlpId
        };

        await this.persistSearchLog(searchLog);
      } else {
        console.log(`⚠️ Refinement log not persisted - no agent associated with profile ${originalProfile.id}`);
      }

      return {
        nlpResponse,
        searchResults,
        searchLog
      };

    } catch (error) {
      console.error(`❌ Search refinement failed:`, error);
      throw error;
    }
  }

  /**
   * Persist search log to database
   */
  private async persistSearchLog(searchLog: NLPSearchLog): Promise<void> {
    try {
      const insertData: InsertNLPSearchLog = {
        profileId: searchLog.profileId,
        agentId: searchLog.agentId,
        nlpQuery: searchLog.nlpQuery,
        nlpResponse: searchLog.nlpResponse,
        searchUrl: searchLog.searchUrl,
        searchResults: searchLog.searchResults,
        executionTime: searchLog.executionTime,
        nlpId: searchLog.nlpId,
        createdAt: searchLog.timestamp
      };

      await db.insert(nlpSearchLogs).values(insertData);
      
      console.log(`💾 Search log persisted - Profile: ${searchLog.profileId}, NLP ID: ${searchLog.nlpId}`);
      console.log(`📈 Search Metrics:`, {
        profileId: searchLog.profileId,
        resultsCount: searchLog.searchResults.count,
        executionTime: searchLog.executionTime,
        nlpId: searchLog.nlpId
      });
    } catch (error) {
      console.error(`❌ Failed to persist search log:`, error);
      // Don't throw error - search should continue even if logging fails
    }
  }

  /**
   * Get search history for a profile
   */
  async getSearchHistory(profileId: number, limit: number = 10): Promise<any[]> {
    try {
      const searchHistory = await db
        .select()
        .from(nlpSearchLogs)
        .where(eq(nlpSearchLogs.profileId, profileId))
        .orderBy(desc(nlpSearchLogs.createdAt))
        .limit(limit);

      console.log(`📋 Retrieved ${searchHistory.length} search logs for profile ${profileId}`);
      return searchHistory;
    } catch (error) {
      console.error(`❌ Failed to get search history for profile ${profileId}:`, error);
      return [];
    }
  }

  /**
   * Get recent NLP searches across all profiles for analytics
   */
  async getRecentSearches(limit: number = 50): Promise<any[]> {
    try {
      const recentSearches = await db
        .select()
        .from(nlpSearchLogs)
        .orderBy(desc(nlpSearchLogs.createdAt))
        .limit(limit);

      return recentSearches;
    } catch (error) {
      console.error(`❌ Failed to get recent searches:`, error);
      return [];
    }
  }
}

export const nlpSearchService = new NLPSearchService();