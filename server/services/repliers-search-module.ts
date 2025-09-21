/**
 * Repliers Search Module
 * 
 * A comprehensive search service that handles:
 * - Market intelligence via aggregates
 * - Intelligent parameter mapping
 * - Full pagination support
 * - Result caching
 * - Error handling and retries
 */

import { repliersAPI } from '../repliers-api.js';

// Types
export interface SearchCriteria {
  locations: string[];
  maxPrice: number;
  minPrice?: number;
  minBedrooms?: number;
  propertyTypes?: string[];
  comprehensiveSearch?: boolean;
  maxResults?: number;
}

export interface MarketIntelligence {
  city: string;
  state: string;
  totalProperties: number;
  propertyTypes: Record<string, number>;
  styles: Record<string, number>;
  priceRange: {
    min: number;
    max: number;
    median: number;
  };
  bedroomDistribution: Record<string, number>;
  lastUpdated: Date;
}

export interface SearchResult {
  properties: any[];
  metadata: {
    totalAvailable: number;
    retrieved: number;
    pagesScanned: number;
    searchTime: number;
    locations: string[];
    usingCache: boolean;
  };
  marketIntelligence?: MarketIntelligence;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

/**
 * Main search module for Repliers API
 */
export class RepliersSearchModule {
  private aggregateCache = new Map<string, { data: any; timestamp: number }>();
  private searchCache = new Map<string, { data: SearchResult; timestamp: number }>();
  private readonly AGGREGATE_CACHE_TTL = 3600000; // 1 hour
  private readonly SEARCH_CACHE_TTL = 900000; // 15 minutes
  private readonly MAX_PAGES_DEFAULT = 5;
  private readonly MAX_PAGES_COMPREHENSIVE = 10;
  private readonly PAGE_SIZE = 100;

  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error('Repliers API key is required');
    }
  }

  /**
   * Main search method - handles everything
   */
  async search(criteria: SearchCriteria): Promise<SearchResult> {
    const startTime = Date.now();
    console.log('🔍 [RepliersSearch] Starting search with criteria:', criteria);

    // Check cache first
    const cacheKey = this.buildCacheKey(criteria);
    const cached = this.getFromCache(this.searchCache, cacheKey, this.SEARCH_CACHE_TTL);
    if (cached) {
      console.log('📦 [RepliersSearch] Returning cached results');
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          usingCache: true,
          searchTime: Date.now() - startTime
        }
      };
    }

    // Process each location
    const allProperties: any[] = [];
    const locationResults: Record<string, any> = {};

    for (const location of criteria.locations) {
      const locationResult = await this.searchLocation(location, criteria);
      allProperties.push(...locationResult.properties);
      locationResults[location] = locationResult;
    }

    // Build final result
    const result: SearchResult = {
      properties: this.deduplicateAndSort(allProperties),
      metadata: {
        totalAvailable: Object.values(locationResults).reduce((sum, r) => sum + r.totalCount, 0),
        retrieved: allProperties.length,
        pagesScanned: Object.values(locationResults).reduce((sum, r) => sum + r.pagesRetrieved, 0),
        searchTime: Date.now() - startTime,
        locations: criteria.locations,
        usingCache: false
      },
      marketIntelligence: await this.getMarketIntelligence(criteria.locations[0])
    };

    // Cache the result
    this.searchCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    console.log(`✅ [RepliersSearch] Search complete: ${result.properties.length} properties in ${result.metadata.searchTime}ms`);
    return result;
  }

  /**
   * Search a specific location with full pagination
   */
  private async searchLocation(location: string, criteria: SearchCriteria): Promise<{
    properties: any[];
    totalCount: number;
    pagesRetrieved: number;
  }> {
    console.log(`📍 [RepliersSearch] Searching ${location}...`);

    // Parse location
    const { city, state } = this.parseLocation(location);

    // Get market intelligence for parameter mapping
    const intelligence = await this.getMarketIntelligence(location);

    // Build API parameters
    const apiParams = await this.buildAPIParameters(criteria, city, state, intelligence);

    // Determine pagination strategy
    const maxPages = this.determineMaxPages(criteria);

    // Execute paginated search
    return await this.executePaginatedSearch(apiParams, maxPages);
  }

  /**
   * Execute search with full pagination support
   */
  private async executePaginatedSearch(params: any, maxPages: number): Promise<{
    properties: any[];
    totalCount: number;
    pagesRetrieved: number;
  }> {
    const allProperties: any[] = [];
    
    // Fetch first page to get pagination info
    const firstPageData = await this.fetchPage(params, 1);
    if (!firstPageData) {
      return { properties: [], totalCount: 0, pagesRetrieved: 0 };
    }

    allProperties.push(...(firstPageData.listings || []));
    
    const totalPages = firstPageData.numPages || 1;
    const totalCount = firstPageData.count || firstPageData.listings?.length || 0;
    
    console.log(`📊 [RepliersSearch] Found ${totalCount} properties across ${totalPages} pages`);

    // Determine how many pages to fetch
    const pagesToFetch = Math.min(totalPages, maxPages);

    // Fetch remaining pages in parallel if needed
    if (pagesToFetch > 1) {
      const pagePromises = [];
      for (let page = 2; page <= pagesToFetch; page++) {
        pagePromises.push(this.fetchPage(params, page));
      }

      console.log(`⚡ [RepliersSearch] Fetching pages 2-${pagesToFetch} in parallel...`);
      const additionalPages = await Promise.allSettled(pagePromises);
      
      for (const result of additionalPages) {
        if (result.status === 'fulfilled' && result.value?.listings) {
          allProperties.push(...result.value.listings);
        } else if (result.status === 'rejected') {
          console.error('❌ [RepliersSearch] Page fetch failed:', result.reason);
        }
      }
    }

    console.log(`✅ [RepliersSearch] Retrieved ${allProperties.length}/${totalCount} properties from ${pagesToFetch} pages`);

    return {
      properties: allProperties,
      totalCount,
      pagesRetrieved: pagesToFetch
    };
  }

  /**
   * Fetch a single page of results
   */
  private async fetchPage(params: any, pageNum: number): Promise<any> {
    const queryParams = new URLSearchParams({
      ...params,
      pageNum: pageNum.toString(),
      resultsPerPage: this.PAGE_SIZE.toString()
    });

    const url = `https://api.repliers.io/listings?${queryParams}`;
    console.log(`🌐 [RepliersSearch] Fetching page ${pageNum}: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'REPLIERS-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`❌ [RepliersSearch] Error fetching page ${pageNum}:`, error);
      // Retry once
      await this.delay(1000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'REPLIERS-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          }
        });
        return await response.json();
      } catch (retryError) {
        console.error(`❌ [RepliersSearch] Retry failed for page ${pageNum}`);
        return null;
      }
    }
  }

  /**
   * Get market intelligence using aggregates
   */
  async getMarketIntelligence(location: string): Promise<MarketIntelligence> {
    const { city, state } = this.parseLocation(location);
    const cacheKey = `${city}_${state}_aggregates`;
    
    // Check cache
    const cached = this.getFromCache(this.aggregateCache, cacheKey, this.AGGREGATE_CACHE_TTL);
    if (cached) {
      console.log('📦 [RepliersSearch] Using cached aggregates');
      return cached;
    }

    console.log(`📊 [RepliersSearch] Fetching market intelligence for ${city}, ${state}`);

    // Fetch aggregates
    const params = new URLSearchParams({
      city,
      state,
      status: 'A',
      type: 'Sale',
      aggregates: [
        'details.propertyType',
        'details.style',
        'details.numBedrooms',
        'listPrice'
      ].join(','),
      listings: 'false' // Don't return listings, just aggregates
    });

    try {
      const response = await fetch(`https://api.repliers.io/listings?${params}`, {
        headers: {
          'REPLIERS-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      // Process aggregates into intelligence
      const intelligence: MarketIntelligence = {
        city,
        state,
        totalProperties: data.count || 0,
        propertyTypes: data.aggregates?.details?.propertyType || {},
        styles: data.aggregates?.details?.style || {},
        priceRange: this.analyzePriceRange(data.aggregates?.listPrice),
        bedroomDistribution: data.aggregates?.details?.numBedrooms || {},
        lastUpdated: new Date()
      };

      // Cache it
      this.aggregateCache.set(cacheKey, {
        data: intelligence,
        timestamp: Date.now()
      });

      console.log(`✅ [RepliersSearch] Market intelligence loaded: ${intelligence.totalProperties} properties`);
      return intelligence;
    } catch (error) {
      console.error('❌ [RepliersSearch] Failed to fetch aggregates:', error);
      // Return empty intelligence
      return {
        city,
        state,
        totalProperties: 0,
        propertyTypes: {},
        styles: {},
        priceRange: { min: 0, max: 0, median: 0 },
        bedroomDistribution: {},
        lastUpdated: new Date()
      };
    }
  }

  /**
   * Build API parameters with intelligent mapping
   */
  private async buildAPIParameters(
    criteria: SearchCriteria,
    city: string,
    state: string,
    intelligence: MarketIntelligence
  ): Promise<any> {
    const params: any = {
      status: 'A', // Active listings
      type: 'Sale',
      city,
      state
    };

    // Price range
    if (criteria.maxPrice) params.maxPrice = criteria.maxPrice;
    if (criteria.minPrice) params.minPrice = criteria.minPrice;

    // Bedrooms
    if (criteria.minBedrooms) params.minBedrooms = criteria.minBedrooms;

    // Property type - map to exact API values
    if (criteria.propertyTypes && criteria.propertyTypes.length > 0) {
      const mappedType = this.mapPropertyType(criteria.propertyTypes[0], intelligence);
      if (mappedType) params.propertyType = mappedType;
    }

    return params;
  }

  /**
   * Map user-friendly property type to API value
   */
  private mapPropertyType(userType: string, intelligence: MarketIntelligence): string | null {
    const availableTypes = Object.keys(intelligence.propertyTypes);
    
    // Exact match first
    const exactMatch = availableTypes.find(t => 
      t.toLowerCase() === userType.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    // Fuzzy match
    const fuzzyMatch = availableTypes.find(t => 
      t.toLowerCase().includes(userType.toLowerCase()) ||
      userType.toLowerCase().includes(t.toLowerCase())
    );
    if (fuzzyMatch) return fuzzyMatch;

    // Common mappings
    const mappings: Record<string, string[]> = {
      'single-family': ['Single Family', 'Single Family Residence', 'House'],
      'multi-family': ['Multi Family', 'Multi-Family', '2 Family', '3 Family'],
      'condo': ['Condo', 'Condominium'],
      'townhouse': ['Townhouse', 'Attached'],
      'duplex': ['Duplex', '2 Family', 'Two Family']
    };

    for (const [key, values] of Object.entries(mappings)) {
      if (userType.toLowerCase().includes(key)) {
        const match = availableTypes.find(t => 
          values.some(v => t.includes(v))
        );
        if (match) return match;
      }
    }

    console.log(`⚠️ [RepliersSearch] Could not map property type: ${userType}`);
    return null;
  }

  /**
   * Determine how many pages to fetch based on criteria
   */
  private determineMaxPages(criteria: SearchCriteria): number {
    // Comprehensive search requested
    if (criteria.comprehensiveSearch) {
      return this.MAX_PAGES_COMPREHENSIVE;
    }

    // Based on budget
    if (criteria.maxPrice > 1000000) return 10;
    if (criteria.maxPrice > 500000) return 5;
    if (criteria.maxPrice > 250000) return 3;
    
    // Based on max results requested
    if (criteria.maxResults) {
      return Math.ceil(criteria.maxResults / this.PAGE_SIZE);
    }

    return this.MAX_PAGES_DEFAULT;
  }

  /**
   * Parse location string into city and state
   */
  private parseLocation(location: string): { city: string; state: string } {
    // Handle comma-separated format: "Worcester, MA"
    if (location.includes(',')) {
      const [city, state] = location.split(',').map(s => s.trim());
      return { city, state };
    }
    
    // Handle space-separated format: "Worcester MA"
    const parts = location.trim().split(' ');
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      // Check if last part is a state code (2 letters)
      if (lastPart.length === 2 && /^[A-Z]{2}$/i.test(lastPart)) {
        const city = parts.slice(0, -1).join(' ');
        return { city, state: lastPart.toUpperCase() };
      }
    }
    
    // Default to MA if no state specified
    return { city: location, state: 'MA' };
  }

  /**
   * Analyze price range from aggregates
   */
  private analyzePriceRange(priceAggregates: any): { min: number; max: number; median: number } {
    if (!priceAggregates) {
      return { min: 0, max: 0, median: 0 };
    }

    const prices = Object.keys(priceAggregates)
      .map(p => parseInt(p))
      .filter(p => !isNaN(p))
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return { min: 0, max: 0, median: 0 };
    }

    return {
      min: prices[0],
      max: prices[prices.length - 1],
      median: prices[Math.floor(prices.length / 2)]
    };
  }

  /**
   * Deduplicate and sort properties
   */
  private deduplicateAndSort(properties: any[]): any[] {
    // Remove duplicates based on MLS number or address
    const seen = new Set<string>();
    const unique = properties.filter(p => {
      const key = p.mlsNumber || p.id || `${p.address}_${p.city}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by price
    return unique.sort((a, b) => (a.price || 0) - (b.price || 0));
  }

  /**
   * Build cache key from criteria
   */
  private buildCacheKey(criteria: SearchCriteria): string {
    return `${criteria.locations.join('_')}_${criteria.maxPrice}_${criteria.minBedrooms}_${criteria.propertyTypes?.join('_')}`;
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache<T>(cache: Map<string, { data: T; timestamp: number }>, key: string, ttl: number): T | null {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.aggregateCache.clear();
    this.searchCache.clear();
    console.log('🧹 [RepliersSearch] Caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { aggregates: number; searches: number } {
    return {
      aggregates: this.aggregateCache.size,
      searches: this.searchCache.size
    };
  }
}

// Export singleton instance
export const repliersSearchModule = new RepliersSearchModule(
  process.env.REPLIERS_API_KEY || 'lwSqnPJBTbOq2hBMj26lwFqBR4yfit'
);