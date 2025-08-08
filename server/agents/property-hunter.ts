/**
 * Property Hunter Agent
 * Role: Property Discovery Specialist
 * Responsibility: Multi-criteria property search and data enrichment
 */

// Import existing search functions
import { repliersAPI } from '../repliers-api.js';
import { InvestmentPropertyMapper } from '../investment-property-mapper';

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
  constructor() {
    // Property Hunter uses existing Repliers API functions
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

      // Use Repliers NLP search with proper parameters
      const searchParams = {
        location: location,
        maxPrice: criteria.maxPrice,
        minBedrooms: criteria.minBedrooms,
        propertyTypes: criteria.propertyTypes,
        query: query
      };

      console.log(`📋 [Property Hunter] Search params:`, searchParams);

      // Use existing Repliers API search function
      let searchResult;
      try {
        console.log(`🔍 [Property Hunter] Executing property search for ${location}...`);
        
        // Use the Repliers API with proper parameters for SALE properties only
        // Target investment property types based on aggregates data
        const targetUnits = criteria.minBedrooms >= 4 ? 4 : criteria.minBedrooms >= 3 ? 3 : 2;
        const optimalStyles = InvestmentPropertyMapper.getOptimalPropertyStyles(criteria.maxPrice, targetUnits);
        
        let homeType = 'single-family'; // Default fallback
        if (criteria.propertyTypes.includes('multi-family') && optimalStyles.length > 0) {
          // Use the best available investment property style
          homeType = optimalStyles[0].toLowerCase().includes('family') ? 'multi-family' : 
                    optimalStyles[0].toLowerCase().includes('duplex') ? 'duplex' : 
                    'multi-family';
        }

        console.log(`🎯 [Property Hunter] Targeting ${homeType} properties in ${location}, budget: $${criteria.maxPrice.toLocaleString()}`);
        console.log(`📊 [Property Hunter] Optimal investment styles: ${optimalStyles.slice(0, 3).join(', ')}`);

        const searchProfile = {
          preferredAreas: [location],
          budgetMax: criteria.maxPrice,
          budgetMin: Math.max(50000, Math.floor(criteria.maxPrice * 0.3)), // Minimum realistic sale price
          bedrooms: criteria.minBedrooms,
          homeType: homeType,
          limit: 50
        };
        
        console.log(`📋 [Property Hunter] Search profile for SALE properties:`, searchProfile);
        searchResult = await repliersAPI.searchListings(searchProfile);
        
        console.log(`📊 [Property Hunter] Search response:`, {
          hasProperties: !!searchResult?.properties,
          propertiesCount: searchResult?.properties?.length || 0,
          hasListings: !!searchResult?.listings,
          listingsCount: searchResult?.listings?.length || 0
        });

      } catch (searchError) {
        console.error(`❌ [Property Hunter] Search failed for ${location}:`, searchError);
        return [];
      }

      // Handle response from Repliers API (should be array of sale listings)
      let properties = [];
      if (Array.isArray(searchResult)) {
        properties = searchResult;
      } else if (searchResult?.listings) {
        properties = searchResult.listings;
      } else if (searchResult?.properties) {
        properties = searchResult.properties;
      }

      if (!properties || properties.length === 0) {
        console.log(`⚠️ [Property Hunter] No properties found for ${location}`);
        return [];
      }

      console.log(`✅ [Property Hunter] Found ${properties.length} properties in ${location}`);

      // Convert to enriched properties, filtering out rentals
      const enrichedProperties = properties.slice(0, 20)
        .map((property: any) => this.convertToEnrichedProperty(property, location))
        .filter(property => property !== null); // Remove filtered rentals
      
      console.log(`🏠 [Property Hunter] After filtering rentals: ${enrichedProperties.length} sale properties remain`);
      return enrichedProperties;

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

  private convertToEnrichedProperty(property: any, location: string): EnrichedProperty | null {
    // Filter out rental listings - only include properties with realistic sale prices
    const price = property.price || 0;
    
    // Skip if price is too low (likely rental) or unrealistic for sale
    if (price < 50000 || price > 2000000) {
      console.log(`⚠️ [Property Hunter] Filtering out property with price $${price} (likely rental or unrealistic)`);
      return null;
    }
    
    // Skip if property description indicates rental terms
    const description = (property.description || '').toLowerCase();
    const address = (property.address || '').toLowerCase();
    if (description.includes('/month') || description.includes('rent') || 
        description.includes('monthly') || address.includes('rent') ||
        description.includes('lease') || description.includes('tenant')) {
      console.log(`⚠️ [Property Hunter] Filtering out rental property: ${property.address}`);
      return null;
    }

    return {
      id: property.id || `${property.address}_${Date.now()}`,
      address: property.address || 'Address not available',
      price: price,
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

      // Investment potential bonus based on aggregates data
      const investmentScore = InvestmentPropertyMapper.getInvestmentScore(property.propertyType);
      const expectedUnits = InvestmentPropertyMapper.getExpectedUnits(property.propertyType);
      
      // Multi-family investment bonus
      if (expectedUnits >= 2) {
        strategicScore += Math.min(25, expectedUnits * 5); // Up to 25 points for multi-unit
      }
      
      // Apply investment potential score
      strategicScore = Math.floor((strategicScore + investmentScore) / 2);

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