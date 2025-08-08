/**
 * Property Hunter Agent
 * Role: Property Discovery Specialist
 * Responsibility: Multi-criteria property search and data enrichment
 */

import { RepliersService } from '../services/repliers-service.js';

export interface PropertySearchCriteria {
  locations: string[];
  maxPrice: number;
  minBedrooms: number;
  propertyTypes: string[];
  strategicFactors: {
    universities?: boolean;
    publicTransport?: boolean;
    emergingMarkets?: boolean;
  };
}

export interface EnrichedProperty {
  id: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  location: string;
  strategicScore: number;
  proximityFactors: {
    nearUniversity?: boolean;
    transitAccess?: boolean;
    developmentArea?: boolean;
  };
  rawData: any;
}

export class PropertyHunterAgent {
  private repliersService: RepliersService;

  constructor() {
    this.repliersService = new RepliersService();
  }

  async searchProperties(criteria: PropertySearchCriteria): Promise<EnrichedProperty[]> {
    console.log(`🏠 [Property Hunter] Searching properties across ${criteria.locations.length} locations...`);

    const allProperties: EnrichedProperty[] = [];

    // Search each location
    for (const location of criteria.locations) {
      const locationProperties = await this.searchLocation(location, criteria);
      allProperties.push(...locationProperties);
    }

    // Filter and enrich properties
    const filteredProperties = this.filterProperties(allProperties, criteria);
    const enrichedProperties = await this.enrichProperties(filteredProperties, criteria);

    // Sort by strategic score
    return enrichedProperties.sort((a, b) => b.strategicScore - a.strategicScore);
  }

  private async searchLocation(location: string, criteria: PropertySearchCriteria): Promise<EnrichedProperty[]> {
    try {
      // Build search query for this location
      const query = this.buildSearchQuery(location, criteria);
      console.log(`🔍 [Property Hunter] Searching ${location}: ${query}`);

      // Use Repliers NLP search
      const searchResult = await this.repliersService.broadSearch({
        location,
        investmentCapital: criteria.maxPrice,
        bedrooms: criteria.minBedrooms,
        propertyType: criteria.propertyTypes[0] || 'residential'
      } as any);

      // Convert to enriched properties
      return searchResult.listings.slice(0, 20).map((property: any) => this.convertToEnrichedProperty(property, location));

    } catch (error) {
      console.error(`❌ [Property Hunter] Error searching ${location}:`, error);
      return [];
    }
  }

  private buildSearchQuery(location: string, criteria: PropertySearchCriteria): string {
    const parts = [
      'homes for sale',
      `in ${location}`,
      `under $${criteria.maxPrice.toLocaleString()}`,
      `${criteria.minBedrooms}+ bedrooms`
    ];

    if (criteria.propertyTypes.includes('multi-family')) {
      parts.push('multi-family OR duplex OR triplex');
    }

    return parts.join(' ');
  }

  private convertToEnrichedProperty(property: any, location: string): EnrichedProperty {
    return {
      id: property.id || `${property.address}_${Date.now()}`,
      address: property.address || 'Address not available',
      price: property.price || 0,
      bedrooms: property.bedrooms || 2,
      bathrooms: property.bathrooms || 1,
      propertyType: property.property_type || 'residential',
      location,
      strategicScore: 0, // Will be calculated later
      proximityFactors: {},
      rawData: property
    };
  }

  private filterProperties(properties: EnrichedProperty[], criteria: PropertySearchCriteria): EnrichedProperty[] {
    return properties.filter(property => {
      // Price filter
      if (property.price > criteria.maxPrice) return false;
      
      // Bedroom filter
      if (property.bedrooms < criteria.minBedrooms) return false;
      
      // Property type filter (if specified)
      if (criteria.propertyTypes.length > 0) {
        const hasMatchingType = criteria.propertyTypes.some(type => 
          property.propertyType.toLowerCase().includes(type.toLowerCase()) ||
          type.toLowerCase().includes('multi') && property.bedrooms >= 3
        );
        if (!hasMatchingType) return false;
      }

      return true;
    });
  }

  private async enrichProperties(properties: EnrichedProperty[], criteria: PropertySearchCriteria): Promise<EnrichedProperty[]> {
    console.log(`🔍 [Property Hunter] Enriching ${properties.length} properties with strategic factors...`);

    return properties.map(property => {
      // Calculate strategic score based on criteria
      let strategicScore = 50; // Base score

      // University proximity scoring
      if (criteria.strategicFactors.universities) {
        property.proximityFactors.nearUniversity = this.checkUniversityProximity(property);
        if (property.proximityFactors.nearUniversity) {
          strategicScore += 20;
        }
      }

      // Transit access scoring
      if (criteria.strategicFactors.publicTransport) {
        property.proximityFactors.transitAccess = this.checkTransitAccess(property);
        if (property.proximityFactors.transitAccess) {
          strategicScore += 15;
        }
      }

      // Emerging market scoring
      if (criteria.strategicFactors.emergingMarkets) {
        property.proximityFactors.developmentArea = this.checkDevelopmentArea(property);
        if (property.proximityFactors.developmentArea) {
          strategicScore += 25;
        }
      }

      // Price-to-value scoring
      if (property.price < criteria.maxPrice * 0.7) {
        strategicScore += 10; // Bonus for below-average pricing
      }

      // Multi-family bonus
      if (property.bedrooms >= 3 && property.propertyType.toLowerCase().includes('multi')) {
        strategicScore += 15;
      }

      property.strategicScore = Math.min(strategicScore, 100);
      return property;
    });
  }

  private checkUniversityProximity(property: EnrichedProperty): boolean {
    // University town mapping for Massachusetts
    const universityTowns = [
      'cambridge', 'boston', 'amherst', 'worcester', 
      'springfield', 'lowell', 'northampton', 'dartmouth'
    ];

    const location = property.location.toLowerCase();
    const address = property.address.toLowerCase();

    return universityTowns.some(town => 
      location.includes(town) || address.includes(town)
    );
  }

  private checkTransitAccess(property: EnrichedProperty): boolean {
    // Transit-accessible areas in Massachusetts
    const transitAreas = [
      'cambridge', 'somerville', 'brookline', 'newton',
      'quincy', 'malden', 'medford', 'arlington'
    ];

    const location = property.location.toLowerCase();
    const address = property.address.toLowerCase();

    return transitAreas.some(area => 
      location.includes(area) || address.includes(area)
    ) || address.includes('station') || address.includes('mbta');
  }

  private checkDevelopmentArea(property: EnrichedProperty): boolean {
    // Emerging development areas
    const emergingAreas = [
      'everett', 'revere', 'chelsea', 'lynn',
      'brockton', 'fall river', 'new bedford', 'lowell'
    ];

    const location = property.location.toLowerCase();
    const address = property.address.toLowerCase();

    return emergingAreas.some(area => 
      location.includes(area) || address.includes(area)
    );
  }

  async expandGeographicSearch(originalCriteria: PropertySearchCriteria): Promise<string[]> {
    console.log(`🗺️ [Property Hunter] Expanding geographic search from ${originalCriteria.locations.join(', ')}...`);

    const expandedLocations = [...originalCriteria.locations];

    // Add university towns if university factor is important
    if (originalCriteria.strategicFactors.universities) {
      const universityTowns = [
        'Amherst', 'Worcester', 'Lowell', 'Springfield', 
        'Northampton', 'Dartmouth'
      ];
      expandedLocations.push(...universityTowns);
    }

    // Add emerging markets if specified
    if (originalCriteria.strategicFactors.emergingMarkets) {
      const emergingMarkets = [
        'Everett', 'Revere', 'Chelsea', 'Lynn',
        'Brockton', 'Fall River', 'New Bedford'
      ];
      expandedLocations.push(...emergingMarkets);
    }

    // Add transit-accessible suburbs
    if (originalCriteria.strategicFactors.publicTransport) {
      const transitSuburbs = [
        'Quincy', 'Malden', 'Medford', 'Arlington',
        'Brookline', 'Newton', 'Somerville'
      ];
      expandedLocations.push(...transitSuburbs);
    }

    // Remove duplicates and return
    return [...new Set(expandedLocations)];
  }
}