/**
 * Agent Search Service - Real estate search for agents
 * Integrates with Repliers API for live MLS data
 */

interface SearchFilters {
  location: string;
  minPrice?: string;
  maxPrice?: string;
  minBedrooms?: string;
  maxBedrooms?: string;
  propertyType?: string;
}

interface ReplierProperty {
  mlsNumber: string;
  listPrice: number;
  address: {
    streetNumber: string;
    streetName: string;
    city: string;
    state: string;
    zip: string;
  };
  details: {
    numBedrooms: number;
    numBathrooms: number;
    sqft: string;
    style: string;
    description: string;
    yearBuilt: string;
  };
  images: string[];
  photoCount: number;
  daysOnMarket?: number;
  map: {
    latitude: number;
    longitude: number;
  };
}

interface SearchResponse {
  listings: ReplierProperty[];
  count: number;
  page: number;
  pageSize: number;
}

export class AgentSearchService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.REPLIERS_API_KEY || '';
    this.baseUrl = 'https://api.repliers.io';
    
    if (!this.apiKey) {
      throw new Error('REPLIERS_API_KEY environment variable is required');
    }
  }

  async searchProperties(filters: SearchFilters, limit: number = 50): Promise<SearchResponse> {
    try {
      console.log('🔍 Agent Search - Building query with filters:', filters);
      
      // Build search URL with filters
      const searchParams = new URLSearchParams();
      
      // Add location filter
      if (filters.location) {
        const [city, state] = filters.location.split(',').map(s => s.trim());
        if (city) searchParams.append('city', city);
        if (state) searchParams.append('state', state);
      }
      
      // Add price range
      if (filters.minPrice) searchParams.append('minPrice', filters.minPrice);
      if (filters.maxPrice) searchParams.append('maxPrice', filters.maxPrice);
      
      // Add bedroom range
      if (filters.minBedrooms) searchParams.append('minBedrooms', filters.minBedrooms);
      if (filters.maxBedrooms) searchParams.append('maxBedrooms', filters.maxBedrooms);
      
      // Property type filter
      if (filters.propertyType) searchParams.append('propertyType', filters.propertyType);
      
      // Force sale listings only (no rentals)
      searchParams.append('type', 'Sale');
      
      // Set result limit
      searchParams.append('limit', limit.toString());
      
      const url = `${this.baseUrl}/listings?${searchParams.toString()}`;
      console.log('📡 API Request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'REPLIERS-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', response.status, errorText);
        throw new Error(`Repliers API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ API Response received:', data.count || data.listings?.length || 0, 'properties');
      
      // Normalize response structure
      const listings = data.listings || [];
      const normalizedListings = listings.map(this.normalizeProperty);
      
      return {
        listings: normalizedListings,
        count: data.count || normalizedListings.length,
        page: data.page || 1,
        pageSize: data.pageSize || limit
      };
      
    } catch (error) {
      console.error('💥 Agent search error:', error);
      throw new Error(`Failed to search properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private normalizeProperty(property: any): ReplierProperty {
    return {
      mlsNumber: property.mlsNumber || '',
      listPrice: property.listPrice || 0,
      address: {
        streetNumber: property.address?.streetNumber || '',
        streetName: property.address?.streetName || '',
        city: property.address?.city || '',
        state: property.address?.state || '',
        zip: property.address?.zip || ''
      },
      details: {
        numBedrooms: property.details?.numBedrooms || 0,
        numBathrooms: property.details?.numBathrooms || 0,
        sqft: property.details?.sqft || '',
        style: property.details?.style || property.class || '',
        description: property.details?.description || '',
        yearBuilt: property.details?.yearBuilt || ''
      },
      images: property.images || [],
      photoCount: property.photoCount || 0,
      daysOnMarket: property.daysOnMarket,
      map: {
        latitude: property.map?.latitude || 0,
        longitude: property.map?.longitude || 0
      }
    };
  }

  async getMarketInsights(filters: SearchFilters): Promise<any> {
    // Get larger dataset for market analysis
    const searchResponse = await this.searchProperties(filters, 100);
    const properties = searchResponse.listings;
    
    if (properties.length === 0) {
      return {
        averagePrice: 0,
        priceRange: { min: 0, max: 0 },
        averageDaysOnMarket: 0,
        totalProperties: 0
      };
    }
    
    const prices = properties.map(p => p.listPrice).filter(p => p > 0);
    const daysOnMarket = properties
      .map(p => p.daysOnMarket)
      .filter(d => d !== undefined && d > 0) as number[];
    
    return {
      averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      priceRange: {
        min: Math.min(...prices),
        max: Math.max(...prices)
      },
      averageDaysOnMarket: daysOnMarket.length > 0 
        ? daysOnMarket.reduce((a, b) => a + b, 0) / daysOnMarket.length 
        : 0,
      totalProperties: properties.length
    };
  }
}

export const agentSearchService = new AgentSearchService();