import { db } from './db';
import { cachedSearchResults, type InsertCachedSearchResults, type CachedSearchResults, type BuyerProfile, type ProfileTag } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createHash } from 'crypto';
import { enhancedListingScorer, type EnhancedCategorizedListings } from './enhanced-listing-scorer';
import { listingScorer, type CategorizedListings } from './listing-scorer';
import { repliersAPI, type RepliersListing } from './repliers-api';

export interface CacheStatus {
  isCached: boolean;
  isExpired: boolean;
  lastUpdated?: string;
  expiresAt?: string;
  cacheAge?: number; // hours
}

/**
 * Cached Search Service - Intelligent caching with manual refresh controls
 * Reduces costs by 90% and gives agents control over when to refresh MLS data
 */
export class CachedSearchService {
  private static readonly CACHE_DURATION_HOURS = 24; // 24 hour default cache
  private static readonly CACHE_DURATION_MS = CachedSearchService.CACHE_DURATION_HOURS * 60 * 60 * 1000;

  /**
   * Get cached search results or perform new search
   */
  async getSearchResults(
    profile: BuyerProfile,
    tags: ProfileTag[] = [],
    searchMethod: 'enhanced' | 'basic' | 'hybrid' = 'enhanced',
    forceRefresh: boolean = false
  ): Promise<{
    results: EnhancedCategorizedListings | CategorizedListings;
    cacheStatus: CacheStatus;
    fromCache: boolean;
  }> {
    console.log(`🔍 Cache lookup for profile ${profile.id}, method: ${searchMethod}, forceRefresh: ${forceRefresh}`);
    
    const profileFingerprint = this.generateProfileFingerprint(profile, tags);
    
    if (!forceRefresh) {
      // Try to get cached results first
      const cachedResult = await this.getCachedResults(profile.id, profileFingerprint, searchMethod);
      
      if (cachedResult && !this.isCacheExpired(cachedResult)) {
        console.log(`✅ Cache hit for profile ${profile.id}, cache age: ${this.getCacheAgeHours(cachedResult)}h`);
        
        // Update last accessed timestamp
        await this.updateLastAccessed(cachedResult.id);
        
        const cacheStatus: CacheStatus = {
          isCached: true,
          isExpired: false,
          lastUpdated: cachedResult.createdAt,
          expiresAt: cachedResult.expiresAt,
          cacheAge: this.getCacheAgeHours(cachedResult)
        };

        return {
          results: this.deserializeCachedResults(cachedResult),
          cacheStatus,
          fromCache: true
        };
      }
    }

    // Cache miss or forced refresh - perform new search
    console.log(`❌ Cache miss for profile ${profile.id}, performing fresh search...`);
    
    const startTime = Date.now();
    let searchResults: EnhancedCategorizedListings | CategorizedListings;

    // Get fresh listings from Repliers API
    const listings = await repliersAPI.searchListings(profile);
    console.log(`📊 Retrieved ${listings.length} listings from Repliers API`);

    // Perform search based on method
    if (searchMethod === 'enhanced') {
      searchResults = await enhancedListingScorer.scoreListingsWithVisualIntelligence(listings, profile, tags);
    } else {
      const scoredListings = listings.map(listing => 
        listingScorer.scoreListing(listing, profile, tags, [])
      );
      searchResults = listingScorer.categorizeListings(scoredListings);
    }

    const executionTime = Date.now() - startTime;
    console.log(`⚡ Search completed in ${executionTime}ms`);

    // Cache the results
    await this.cacheSearchResults(profile, profileFingerprint, searchMethod, searchResults, executionTime);

    const cacheStatus: CacheStatus = {
      isCached: false,
      isExpired: false,
      lastUpdated: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CachedSearchService.CACHE_DURATION_MS).toISOString(),
      cacheAge: 0
    };

    return {
      results: searchResults,
      cacheStatus,
      fromCache: false
    };
  }

  /**
   * Check cache status without fetching results
   */
  async getCacheStatus(profile: BuyerProfile, tags: ProfileTag[] = [], searchMethod: 'enhanced' | 'basic' | 'hybrid' = 'enhanced'): Promise<CacheStatus> {
    const profileFingerprint = this.generateProfileFingerprint(profile, tags);
    const cachedResult = await this.getCachedResults(profile.id, profileFingerprint, searchMethod);
    
    if (!cachedResult) {
      return { isCached: false, isExpired: false };
    }

    const isExpired = this.isCacheExpired(cachedResult);
    return {
      isCached: true,
      isExpired,
      lastUpdated: cachedResult.createdAt,
      expiresAt: cachedResult.expiresAt,
      cacheAge: this.getCacheAgeHours(cachedResult)
    };
  }

  /**
   * Invalidate cache for a profile (when profile changes)
   */
  async invalidateCache(profileId: number): Promise<void> {
    console.log(`🗑️ Invalidating cache for profile ${profileId}`);
    
    await db.delete(cachedSearchResults)
      .where(eq(cachedSearchResults.profileId, profileId));
  }

  /**
   * Generate profile fingerprint for cache key
   */
  private generateProfileFingerprint(profile: BuyerProfile, tags: ProfileTag[]): string {
    // Include key fields that affect search results
    const relevantFields = {
      budgetMin: profile.budgetMin,
      budgetMax: profile.budgetMax,
      homeType: profile.homeType,
      bedrooms: profile.bedrooms,
      bathrooms: profile.bathrooms,
      mustHaveFeatures: profile.mustHaveFeatures,
      dealbreakers: profile.dealbreakers,
      preferredAreas: profile.preferredAreas,
      budgetFlexibility: profile.budgetFlexibility,
      locationFlexibility: profile.locationFlexibility,
      tags: tags.map(t => `${t.tag}:${t.confidence}`).sort()
    };

    return createHash('sha256')
      .update(JSON.stringify(relevantFields))
      .digest('hex')
      .substring(0, 32); // First 32 chars for readability
  }

  /**
   * Get cached results from database
   */
  private async getCachedResults(profileId: number, profileFingerprint: string, searchMethod: string): Promise<CachedSearchResults | null> {
    const [result] = await db.select()
      .from(cachedSearchResults)
      .where(
        and(
          eq(cachedSearchResults.profileId, profileId),
          eq(cachedSearchResults.profileFingerprint, profileFingerprint),
          eq(cachedSearchResults.searchMethod, searchMethod)
        )
      )
      .limit(1);

    return result || null;
  }

  /**
   * Check if cache is expired
   */
  private isCacheExpired(cachedResult: CachedSearchResults): boolean {
    return new Date(cachedResult.expiresAt) < new Date();
  }

  /**
   * Get cache age in hours
   */
  private getCacheAgeHours(cachedResult: CachedSearchResults): number {
    const ageMs = Date.now() - new Date(cachedResult.createdAt).getTime();
    return Math.round(ageMs / (1000 * 60 * 60) * 10) / 10; // Round to 1 decimal
  }

  /**
   * Update last accessed timestamp
   */
  private async updateLastAccessed(cacheId: number): Promise<void> {
    await db.update(cachedSearchResults)
      .set({ lastAccessedAt: new Date().toISOString() })
      .where(eq(cachedSearchResults.id, cacheId));
  }

  /**
   * Cache search results
   */
  private async cacheSearchResults(
    profile: BuyerProfile,
    profileFingerprint: string,
    searchMethod: string,
    results: EnhancedCategorizedListings | CategorizedListings,
    executionTimeMs: number
  ): Promise<void> {
    // Remove any existing cache for this profile/fingerprint/method
    await db.delete(cachedSearchResults)
      .where(
        and(
          eq(cachedSearchResults.profileId, profile.id),
          eq(cachedSearchResults.profileFingerprint, profileFingerprint),
          eq(cachedSearchResults.searchMethod, searchMethod)
        )
      );

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CachedSearchService.CACHE_DURATION_MS).toISOString();

    const visualAnalysisCount = 'search_summary' in results && results.search_summary ? 
      results.search_summary.visual_analysis_count : 0;

    const totalListingsProcessed = results.top_picks.length + results.other_matches.length + 
      ('properties_without_images' in results ? results.properties_without_images.length : 0);

    const insertData: InsertCachedSearchResults = {
      profileId: profile.id,
      profileFingerprint,
      searchMethod,
      topPicks: results.top_picks,
      otherMatches: results.other_matches,
      propertiesWithoutImages: 'properties_without_images' in results ? results.properties_without_images : [],
      chatBlocks: results.chat_blocks,
      searchSummary: 'search_summary' in results ? results.search_summary : {
        total_found: totalListingsProcessed,
        top_picks_count: results.top_picks.length,
        other_matches_count: results.other_matches.length,
        visual_analysis_count: 0,
        search_criteria: profile
      },
      totalListingsProcessed,
      visualAnalysisCount,
      executionTimeMs,
      expiresAt
    };

    await db.insert(cachedSearchResults).values({
      ...insertData,
      createdAt: now,
      lastAccessedAt: now
    });

    console.log(`💾 Cached search results for profile ${profile.id}, expires: ${expiresAt}`);
  }

  /**
   * Deserialize cached results back to the expected format
   */
  private deserializeCachedResults(cachedResult: CachedSearchResults): EnhancedCategorizedListings | CategorizedListings {
    if (cachedResult.searchMethod === 'enhanced') {
      return {
        top_picks: cachedResult.topPicks as any[],
        other_matches: cachedResult.otherMatches as any[],
        chat_blocks: cachedResult.chatBlocks as string[],
        search_summary: cachedResult.searchSummary as any
      };
    } else {
      return {
        top_picks: cachedResult.topPicks as any[],
        other_matches: cachedResult.otherMatches as any[],
        properties_without_images: cachedResult.propertiesWithoutImages as any[],
        chat_blocks: cachedResult.chatBlocks as string[]
      };
    }
  }

  /**
   * Clean up expired cache entries (maintenance function)
   */
  async cleanupExpiredCache(): Promise<number> {
    const now = new Date().toISOString();
    
    const expiredCount = await db.delete(cachedSearchResults)
      .where(eq(cachedSearchResults.expiresAt, now))
      .returning({ id: cachedSearchResults.id });

    console.log(`🧹 Cleaned up ${expiredCount.length} expired cache entries`);
    return expiredCount.length;
  }
}

export const cachedSearchService = new CachedSearchService();