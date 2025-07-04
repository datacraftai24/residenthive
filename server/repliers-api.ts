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
   * Search for listings using the Repliers API
   */
  async searchListings(profile: any): Promise<RepliersListing[]> {
    try {
      const searchParams = this.mapProfileToSearchParams(profile);
      
      const queryString = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined) {
          queryString.append(key, value.toString());
        }
      });

      const response = await fetch(`${this.baseURL}/listings/search?${queryString}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Repliers API error: ${response.status} - ${errorText}`);
      }

      const data: RepliersResponse = await response.json();
      return data.listings || [];
    } catch (error) {
      console.error('Error searching Repliers API:', error);
      throw error;
    }
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