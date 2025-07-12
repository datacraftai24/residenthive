interface RepliersSearchParams {
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  bathrooms?: string;
  property_type?: string;
  location?: string;
  limit?: number;
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
  listings: RepliersListing[];
  total_count: number;
  page: number;
  per_page: number;
}

export class RepliersAPIService {
  private baseURL = 'https://api.repliers.io';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.REPLIERS_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('REPLIERS_API_KEY environment variable is required');
    }
  }

  /**
   * Transform buyer profile data into Repliers API search parameters
   */
  private mapProfileToSearchParams(profile: any): RepliersSearchParams {
    const params: RepliersSearchParams = {
      limit: 50 // Get more listings for better scoring
    };

    // Budget mapping
    if (profile.budgetMin) {
      params.price_min = profile.budgetMin;
    }
    if (profile.budgetMax) {
      params.price_max = profile.budgetMax;
    }

    // Bedrooms
    if (profile.bedrooms) {
      params.bedrooms = profile.bedrooms;
    }

    // Bathrooms - handle string formats like "2+", "2-3"
    if (profile.bathrooms) {
      if (profile.bathrooms.includes('+')) {
        params.bathrooms = profile.bathrooms;
      } else if (profile.bathrooms.includes('-')) {
        // Take the minimum for initial search
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

    // Location - use first preferred area
    if (profile.preferredAreas && Array.isArray(profile.preferredAreas) && profile.preferredAreas.length > 0) {
      params.location = profile.preferredAreas[0];
    }

    return params;
  }

  /**
   * Search for listings using the Repliers API with intelligent fallback
   */
  async searchListings(profile: any): Promise<RepliersListing[]> {
    try {
      const searchParams = this.mapProfileToSearchParams(profile);
      
      // First try exact match search
      let listings = await this.performSearch(searchParams, false);
      
      // If no exact matches, try location-only fallback with expanded search
      if (!listings || listings.length === 0) {
        console.log('No exact matches found, searching all listings in location for intelligent scoring...');
        listings = await this.performLocationFallbackSearch(searchParams);
      }
      
      return listings;
    } catch (error) {
      console.error('Error searching Repliers API:', error);
      throw error;
    }
  }

  /**
   * Perform exact search with all criteria
   */
  private async performSearch(searchParams: RepliersSearchParams, isLocationOnly: boolean = false): Promise<RepliersListing[]> {
    const baseParams = new URLSearchParams({
      listings: 'true',
      operator: 'AND',
      sortBy: 'updatedOnDesc',
      status: 'A',
      limit: (searchParams.limit?.toString() || '100')
    });

    // Add search filters (skip non-location filters for fallback)
    if (!isLocationOnly) {
      if (searchParams.price_min) baseParams.append('minPrice', searchParams.price_min.toString());
      if (searchParams.price_max) baseParams.append('maxPrice', searchParams.price_max.toString());
      if (searchParams.bedrooms) baseParams.append('bedrooms', searchParams.bedrooms.toString());
      if (searchParams.bathrooms) baseParams.append('bathrooms', searchParams.bathrooms.toString());
      if (searchParams.property_type) baseParams.append('propertyType', searchParams.property_type);
    }
    
    // Always include location
    if (searchParams.location) baseParams.append('city', searchParams.location);

    const response = await fetch(`${this.baseURL}/listings?${baseParams}`, {
      method: 'POST',
      headers: {
        'REPLIERS-API-KEY': this.apiKey,
        'accept': 'application/json',
        'content-type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Repliers API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const rawListings = data.listings || [];
    
    return rawListings.map((listing: any) => this.transformRepliersListing(listing));
  }

  /**
   * Fallback search: find all listings in the location for intelligent scoring
   */
  private async performLocationFallbackSearch(searchParams: RepliersSearchParams): Promise<RepliersListing[]> {
    // Try each preferred location if available
    if (searchParams.location) {
      const locationListings = await this.performSearch(searchParams, true);
      if (locationListings && locationListings.length > 0) {
        return locationListings;
      }
    }
    
    // If no location-specific results, expand to broader search
    const broadParams = { ...searchParams };
    delete broadParams.location; // Remove location restriction
    broadParams.limit = 50; // Limit results for processing
    
    return await this.performSearch(broadParams, true);
  }

  /**
   * Transform Repliers API listing format to our expected format
   */
  private transformRepliersListing(rawListing: any): RepliersListing {
    const address = rawListing.address || {};
    const details = rawListing.details || {};
    
    // Data extraction optimized for Repliers API structure
    
    // Extract bedrooms and bathrooms using correct field names
    const bedrooms = this.parseNumber(details.numBedrooms) || 
                    this.parseNumber(details.numBedroomsPlus) || 0;
    
    const bathrooms = this.parseNumber(details.numBathrooms) || 
                     this.parseNumber(details.numBathroomsPlus) || 0;
    
    return {
      id: rawListing.mlsNumber || `listing_${Date.now()}`,
      price: rawListing.listPrice || 0,
      bedrooms,
      bathrooms,
      property_type: this.normalizePropertyType(details.propertyType || 'house'),
      address: this.buildAddress(address),
      city: address.city || '',
      state: address.state || '',
      zip_code: address.zip || '',
      square_feet: this.parseNumber(details.sqft) || this.parseNumber(details.livingAreaSqFt) || this.parseNumber(details.totalSqFt),
      year_built: this.parseNumber(details.yearBuilt),
      description: details.description || '',
      features: this.extractFeatures(details),
      images: this.extractImages(rawListing),
      listing_agent: this.extractAgent(rawListing.agents),
      mls_number: rawListing.mlsNumber,
      listing_date: rawListing.listDate,
      status: rawListing.lastStatus || 'active'
    };
  }

  private parseNumber(value: any): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value.replace(/[^\d]/g, ''));
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private normalizePropertyType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'Residential Lease': 'house',
      'Single Family': 'house',
      'Condo': 'condo',
      'Townhouse': 'townhouse',
      'Multi-Family': 'house'
    };
    return typeMap[type] || 'house';
  }

  private buildAddress(address: any): string {
    const parts = [
      address.streetNumber,
      address.streetName,
      address.streetSuffix
    ].filter(Boolean);
    return parts.join(' ');
  }

  private extractFeatures(details: any): string[] {
    const features: string[] = [];
    
    if (details.airConditioning) features.push('Air Conditioning');
    if (details.garage) features.push('Garage');
    if (details.pool) features.push('Pool');
    if (details.fireplace) features.push('Fireplace');
    if (details.deck || details.patio) features.push('Outdoor Space');
    
    return features;
  }

  private extractImages(rawListing: any): string[] {
    // Use Repliers CDN for accessing property images
    if (rawListing.images && Array.isArray(rawListing.images) && rawListing.images.length > 0) {
      return rawListing.images.map((imagePath: string) => {
        // Handle different image path formats from Repliers
        if (imagePath.startsWith('http')) {
          return imagePath;
        }
        // Construct Repliers CDN URL with medium size for optimal performance
        return `https://cdn.repliers.io/${imagePath}?class=medium`;
      }).filter(Boolean);
    }

    return [];
  }

  private extractAgent(agents: any[]): any {
    if (!agents || !agents.length) return undefined;
    
    const agent = agents[0];
    return {
      name: agent.name || '',
      phone: agent.phone || '',
      email: agent.email || ''
    };
  }

  /**
   * Get detailed listing information
   */
  async getListingDetails(listingId: string): Promise<RepliersListing | null> {
    try {
      const response = await fetch(`${this.baseURL}/listings/${listingId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Repliers API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching listing details:', error);
      throw error;
    }
  }
}

export const repliersAPI = new RepliersAPIService();
export type { RepliersListing, RepliersSearchParams };