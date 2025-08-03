/**
 * REPLIERS API SERVICE
 * 
 * Centralized service for all Repliers API interactions
 * Separation of concerns: API calls, data transformation, error handling
 * 
 * Used by: Basic Search, Enhanced Search, NLP Search, Hybrid Search
 */

interface RepliersSearchParams {
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  bathrooms?: string;
  property_type?: string;
  location?: string;
  limit?: number;
  type?: string; // 'Sale' or 'Rent'
}

interface RepliersAddress {
  streetNumber?: string;
  streetName?: string;
  streetSuffix?: string;
  unitNumber?: string;
  city?: string;
  state?: string;
  zip?: string;
  area?: string;
  country?: string;
  district?: string;
  majorIntersection?: string;
  neighborhood?: string;
  streetDirection?: string;
  communityCode?: string;
  streetDirectionPrefix?: string;
  addressKey?: string;
}

interface RepliersListingRaw {
  id: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  property_type: string;
  address: string | RepliersAddress;
  city?: string;
  state?: string;
  zip_code?: string;
  square_feet?: number;
  lot_size?: string;
  year_built?: number;
  description?: string;
  features?: string[];
  images?: string[];
  listing_agent?: {
    name: string;
    phone: string;
    email: string;
  };
  mls_number?: string;
  listing_date?: string;
  status: string;
}

interface RepliersListing {
  id: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  property_type: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  square_feet?: number;
  lot_size?: string;
  year_built?: number;
  description?: string;
  features?: string[];
  images?: string[];
  listing_agent?: {
    name: string;
    phone: string;
    email: string;
  };
  mls_number?: string;
  listing_date?: string;
  status: string;
}

interface RepliersResponse {
  listings: RepliersListingRaw[];
  total_count: number;
  page: number;
  per_page: number;
  count?: number; // Alternative naming in some responses
}

interface BuyerProfileSearchParams {
  profileId: number;
  searchType: 'broad' | 'targeted';
  limit?: number;
}

export class RepliersService {
  private baseURL = 'https://api.repliers.io';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.REPLIERS_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('REPLIERS_API_KEY environment variable is required');
    }
  }

  /**
   * CORE API METHODS
   */

  /**
   * Search listings by profile - BROAD SEARCH
   * Returns more general results for market overview
   */
  async searchBroadListings(profile: any): Promise<RepliersListing[]> {
    console.log(`🔍 [RepliersService] Broad search for profile ${profile.id}`);
    
    const params = this.mapProfileToBroadParams(profile);
    
    try {
      // First try exact match
      let listings = await this.performAPISearch(params);
      
      // If no results, try broader location-only search
      if (!listings || listings.length === 0) {
        console.log(`⚡ [RepliersService] No exact matches, trying location fallback`);
        listings = await this.performLocationFallbackSearch(params);
      }
      
      console.log(`✅ [RepliersService] Broad search completed: ${listings.length} listings`);
      return listings;
      
    } catch (error) {
      console.error(`❌ [RepliersService] Broad search failed:`, error);
      throw new Error(`Broad search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search listings by profile - TARGETED SEARCH
   * Returns fewer but more precise results for AI analysis
   */
  async searchTargetedListings(profile: any): Promise<RepliersListing[]> {
    console.log(`🎯 [RepliersService] Targeted search for profile ${profile.id}`);
    
    const params = this.mapProfileToTargetedParams(profile);
    
    try {
      const listings = await this.performAPISearch(params);
      console.log(`✅ [RepliersService] Targeted search completed: ${listings.length} listings`);
      return listings;
      
    } catch (error) {
      console.error(`❌ [RepliersService] Targeted search failed:`, error);
      throw new Error(`Targeted search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute NLP search URL
   * Used by NLP Search Service
   */
  async executeNLPSearch(searchUrl: string, requestBody?: any): Promise<RepliersResponse> {
    console.log(`🧠 [RepliersService] Executing NLP search: ${searchUrl}`);
    
    try {
      const response = await fetch(searchUrl, {
        method: requestBody ? 'POST' : 'GET',
        headers: {
          'REPLIERS-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        },
        ...(requestBody && { body: JSON.stringify(requestBody) })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ [RepliersService] NLP search executed: ${result.count || result.total_count} listings`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [RepliersService] NLP search failed:`, error);
      throw error;
    }
  }

  /**
   * Call NLP API to convert natural language to search URL
   */
  async callNLPAPI(prompt: string, nlpId?: string): Promise<any> {
    console.log(`🧠 [RepliersService] Calling NLP API`);
    
    try {
      const response = await fetch(`${this.baseURL}/nlp`, {
        method: 'POST',
        headers: {
          'REPLIERS-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          ...(nlpId && { nlpId })
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NLP API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ [RepliersService] NLP API success: ${result.nlpId}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [RepliersService] NLP API failed:`, error);
      throw error;
    }
  }

  /**
   * PRIVATE HELPER METHODS
   */

  /**
   * Extract and process images using Repliers CDN
   * Same logic as existing repliers-api.ts for consistency
   */
  private extractImages(images: string[]): string[] {
    if (!images || !Array.isArray(images) || images.length === 0) {
      return [];
    }

    return images.map((imagePath: string) => {
      // Handle different image path formats from Repliers
      if (imagePath.startsWith('http')) {
        return imagePath;
      }
      // Construct Repliers CDN URL with medium size for optimal performance
      return `https://cdn.repliers.io/${imagePath}?class=medium`;
    }).filter(Boolean);
  }

  /**
   * Transform raw listing with object address to normalized format
   */
  private normalizeListing(rawListing: RepliersListingRaw): RepliersListing {
    let address: string;
    let city: string;
    let state: string;
    let zip: string;

    if (typeof rawListing.address === 'string') {
      address = rawListing.address;
      city = rawListing.city || 'N/A';
      state = rawListing.state || 'N/A';
      zip = rawListing.zip_code || 'N/A';
    } else {
      // Handle object address
      const addrObj = rawListing.address as RepliersAddress;
      
      // Build address string
      const parts = [];
      if (addrObj.streetNumber) parts.push(addrObj.streetNumber);
      if (addrObj.streetDirection || addrObj.streetDirectionPrefix) {
        parts.push(addrObj.streetDirectionPrefix || addrObj.streetDirection);
      }
      if (addrObj.streetName) parts.push(addrObj.streetName);
      if (addrObj.streetSuffix) parts.push(addrObj.streetSuffix);
      if (addrObj.unitNumber) parts.push(`Unit ${addrObj.unitNumber}`);
      
      address = parts.length > 0 ? parts.join(' ') : 'Address not available';
      city = addrObj.city || rawListing.city || 'N/A';
      state = addrObj.state || rawListing.state || 'N/A';
      zip = addrObj.zip || rawListing.zip_code || 'N/A';
    }

    // Process images using CDN URLs (same logic as existing repliers-api.ts)
    const processedImages = this.extractImages(rawListing.images || []);

    return {
      ...rawListing,
      address,
      city,
      state,
      zip_code: zip,
      images: processedImages
    };
  }

  /**
   * Map profile to BROAD search parameters (more inclusive)
   */
  private mapProfileToBroadParams(profile: any): RepliersSearchParams {
    const params: RepliersSearchParams = {
      limit: 50,
      type: 'Sale' // Only sale properties
    };

    // Broader budget range (±10%)
    if (profile.budgetMin) {
      params.price_min = Math.floor(profile.budgetMin * 0.9);
    }
    if (profile.budgetMax) {
      params.price_max = Math.ceil(profile.budgetMax * 1.1);
    }

    // Flexible bedroom requirements
    if (profile.bedrooms && profile.bedrooms > 1) {
      // Allow 1 bedroom less for broader results
      params.bedrooms = profile.bedrooms - 1;
    }

    // Use main location
    if (profile.location) {
      params.location = profile.location;
    } else if (profile.preferredAreas && profile.preferredAreas.length > 0) {
      params.location = profile.preferredAreas[0];
    }

    return params;
  }

  /**
   * Map profile to TARGETED search parameters (more precise)
   */
  private mapProfileToTargetedParams(profile: any): RepliersSearchParams {
    const params: RepliersSearchParams = {
      limit: 25,
      type: 'Sale'
    };

    // Exact budget requirements
    if (profile.budgetMin) {
      params.price_min = profile.budgetMin;
    }
    if (profile.budgetMax) {
      params.price_max = profile.budgetMax;
    }

    // Exact bedroom/bathroom requirements
    if (profile.bedrooms) {
      params.bedrooms = profile.bedrooms;
    }

    if (profile.bathrooms) {
      if (profile.bathrooms.includes('+')) {
        params.bathrooms = profile.bathrooms;
      } else if (profile.bathrooms.includes('-')) {
        const [min] = profile.bathrooms.split('-');
        params.bathrooms = `${min}+`;
      } else {
        params.bathrooms = profile.bathrooms;
      }
    }

    // Property type mapping
    if (profile.homeType) {
      const typeMapping: Record<string, string> = {
        'single-family': 'house',
        'condo': 'condo',
        'townhouse': 'townhouse',
        'apartment': 'condo',
        'multi-family': 'multi_family'
      };
      params.property_type = typeMapping[profile.homeType] || profile.homeType;
    }

    // Preferred location (more specific)
    if (profile.location) {
      params.location = profile.location;
    }

    return params;
  }

  /**
   * Execute API search with parameters
   */
  private async performAPISearch(params: RepliersSearchParams): Promise<RepliersListing[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseURL}/listings?${queryParams.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'REPLIERS-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const rawListings = data.listings || [];
    
    // Normalize all listings to ensure address is always a string
    return rawListings.map((listing: RepliersListingRaw) => this.normalizeListing(listing));
  }

  /**
   * Location-only fallback search for when exact criteria return no results
   */
  private async performLocationFallbackSearch(originalParams: RepliersSearchParams): Promise<RepliersListing[]> {
    const fallbackParams: RepliersSearchParams = {
      location: originalParams.location,
      type: originalParams.type,
      limit: 100 // Get more for intelligent filtering
    };

    console.log(`🔄 [RepliersService] Performing location fallback search`);
    return await this.performAPISearch(fallbackParams);
  }
}

// Export singleton instance
export const repliersService = new RepliersService();