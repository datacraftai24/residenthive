/**
 * Property Hunter Agent
 * Role: Property Discovery Specialist
 * Responsibility: Multi-criteria property search and data enrichment
 */

// Import existing search functions
import { repliersAPI } from '../repliers-api.js';
import { InvestmentPropertyMapper } from '../investment-property-mapper';
import { repliersSearchModule, type SearchCriteria, type SearchResult } from '../services/repliers-search-module.js';
import { detectUnits, normalizePropertyType } from '../utils/property-types.js';
import { withSpan } from '../observability/withSpan.js';

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
  city?: string;
  state?: string;
  postalCode?: string;
  fullAddress?: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  units?: number;  // Number of units for multi-family properties
  unitConfidence?: string;  // Confidence level of unit detection
  unitSource?: string;  // Source of unit information
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
  private debugLogged = false;
  private rentalDebugLogged = false;
  
  constructor() {
    // Property Hunter uses existing Repliers API functions
  }

  private deduplicateProperties(properties: EnrichedProperty[]): EnrichedProperty[] {
    const seen = new Map<string, EnrichedProperty>();
    
    properties.forEach(prop => {
      // Primary key: MLS ID
      let key = prop.mls_id;
      
      // Fallback: normalized address
      if (!key) {
        const address = (prop.address || prop.street_address || '').toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[.,]/g, '')
          .replace(/\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane)\b/g, '');
        const zip = prop.zip || prop.postal_code || '';
        const unit = prop.unit || '';
        key = `${address}-${zip}${unit ? `-${unit}` : ''}`;
      }
      
      // Keep most complete record (highest data quality)
      if (!seen.has(key) || this.getDataQuality(prop) > this.getDataQuality(seen.get(key)!)) {
        seen.set(key, prop);
      }
    });
    
    return Array.from(seen.values());
  }

  private getDataQuality(prop: EnrichedProperty): number {
    let score = 0;
    if (prop.mls_id) score += 10;
    if (prop.price) score += 5;
    if (prop.bedrooms) score += 2;
    if (prop.bathrooms) score += 1;
    if (prop.sqft) score += 2;
    if (prop.images?.length) score += prop.images.length;
    if (prop.description) score += 1;
    return score;
  }

  searchProperties = withSpan(
    'property_hunter',
    async (criteria: PropertySearchCriteria): Promise<EnrichedProperty[]> => {
    console.log(`🏠 [Property Hunter] Searching properties across ${criteria.locations.length} locations...`);
    console.log(`🔍 [Property Hunter] Using new RepliersSearchModule for comprehensive search`);

    // Build search criteria for the new module
    const searchCriteria: SearchCriteria = {
      locations: criteria.locations,
      maxPrice: criteria.maxPrice,
      minBedrooms: criteria.minBedrooms,
      propertyTypes: criteria.propertyTypes,
      comprehensiveSearch: true, // ALWAYS comprehensive for COMPREHENSIVE directive
      maxResults: 10000 // No artificial limit for comprehensive search!
    };

    // Use the new search module for comprehensive pagination
    const searchResult: SearchResult = await repliersSearchModule.search(searchCriteria);
    
    console.log(`📊 [Property Hunter] Search complete:`, {
      totalAvailable: searchResult.metadata.totalAvailable,
      retrieved: searchResult.metadata.retrieved,
      pagesScanned: searchResult.metadata.pagesScanned,
      searchTime: `${searchResult.metadata.searchTime}ms`
    });
    
    // DEBUG: Log the actual properties structure
    console.log(`🔍 [DEBUG] searchResult.properties array length: ${searchResult.properties?.length || 0}`);
    if (searchResult.properties && searchResult.properties.length > 0) {
      console.log(`🔍 [DEBUG] First property from search:`, JSON.stringify(searchResult.properties[0]).substring(0, 500));
    }

    // Show market intelligence if available
    if (searchResult.marketIntelligence) {
      console.log(`🏘️ [Property Hunter] Market Intelligence:`, {
        totalProperties: searchResult.marketIntelligence.totalProperties,
        propertyTypes: Object.keys(searchResult.marketIntelligence.propertyTypes).slice(0, 3),
        priceRange: searchResult.marketIntelligence.priceRange
      });
    }

    // Add search metadata to each property
    // IMPORTANT: Raw Repliers API uses 'listPrice', not 'price'
    const median = (criteria as any).market_context?.median_price || 435000;
    searchResult.properties.forEach((property: any, index: number) => {
      const propertyPrice = property.listPrice || property.price || 0;
      property.search_metadata = {
        above_median_pct: Math.round(((propertyPrice - median) / median) * 100),
        page: Math.floor(index / 100) + 1
      };
    });

    // Convert raw properties to EnrichedProperty format
    console.log(`🔍 [Property Hunter] Converting ${searchResult.properties.length} raw properties to enriched format...`);
    
    // Log first 3 properties in detail to understand structure
    if (searchResult.properties.length > 0) {
      console.log(`\n📦 [Property Hunter] RAW REPLIERS API RESPONSE - First 3 properties:`);
      searchResult.properties.slice(0, 3).forEach((prop: any, idx: number) => {
        console.log(`\n  Property ${idx + 1}:`);
        console.log(`    MLS: ${prop.mlsNumber}`);
        console.log(`    listPrice: ${prop.listPrice}`);
        console.log(`    price: ${prop.price}`);
        console.log(`    address:`, JSON.stringify(prop.address));
        console.log(`    details.propertyType: ${prop.details?.propertyType}`);
        console.log(`    details.style: ${prop.details?.style}`);
        console.log(`    details.numBedrooms: ${prop.details?.numBedrooms}`);
        console.log(`    details.description (first 200 chars): ${prop.details?.description?.substring(0, 200)}`);
        console.log(`    lastStatus: ${prop.lastStatus}`);
        console.log(`    type: ${prop.type}`);
        console.log(`    All keys:`, Object.keys(prop));
      });
      console.log(`\n`);
    }
    
    const enrichedProperties: EnrichedProperty[] = searchResult.properties
      .map((property: any, idx: number) => {
        const result = this.convertToEnrichedProperty(property, property.city || criteria.locations[0]);
        if (idx < 3 && !result) {
          console.log(`  ❌ Property ${idx + 1} (MLS: ${property.mlsNumber}) was filtered out`);
        }
        return result;
      })
      .filter(property => property !== null);

    // Deduplicate properties
    const dedupedProperties = this.deduplicateProperties(enrichedProperties);
    
    // Log telemetry
    const prices = dedupedProperties.map(p => p.price).filter(p => p > 0);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    console.log(`[search] range=$${criteria.minPrice || 0}-$${criteria.maxPrice} | pages=${searchResult.metadata.pagesScanned} | total=${searchResult.metadata.retrieved} | post-dedupe=${dedupedProperties.length}`);
    console.log(`[coverage] min=$${minPrice} max=$${maxPrice} | median=$${median}`);

    // Apply additional filtering based on criteria
    console.log(`🔍 [Property Hunter] Filtering ${dedupedProperties.length} properties based on criteria...`);
    const filteredProperties = this.filterProperties(dedupedProperties, criteria);
    console.log(`   ✅ After filtering: ${filteredProperties.length} properties remain`);
    
    // Enrich with strategic scoring
    const strategicallyEnriched = await this.enrichProperties(filteredProperties, criteria);

    // Sort by strategic score
    return strategicallyEnriched.sort((a, b) => b.strategicScore - a.strategicScore);
  }
  );

  // Legacy method - kept for backwards compatibility but now uses searchProperties internally
  private async searchLocation(location: string, criteria: PropertySearchCriteria): Promise<EnrichedProperty[]> {
    console.log(`⚠️ [Property Hunter] Using legacy searchLocation - consider using searchProperties instead`);
    
    // Use the new search module through searchProperties
    const singleLocationCriteria = { ...criteria, locations: [location] };
    return this.searchProperties(singleLocationCriteria);
  }

  // Original searchLocation implementation (now renamed)
  private async searchLocationLegacy(location: string, criteria: PropertySearchCriteria): Promise<EnrichedProperty[]> {
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
    // Debug logging for first few properties
    if (!this.debugLogged) {
      console.log(`\n🔍 [Property Hunter] Converting property - detailed check:`);
      console.log(`  MLS: ${property.mlsNumber}`);
      console.log(`  listPrice: ${property.listPrice} (type: ${typeof property.listPrice})`);
      console.log(`  price: ${property.price} (type: ${typeof property.price})`);
      this.debugLogged = true;
    }
    
    // IMPORTANT: Raw Repliers API uses 'listPrice' field
    // The repliers-search-module returns raw API data, not transformed
    const price = property.listPrice || property.price || 0;
    
    // Skip if price is 0 or missing
    if (price === 0) {
      console.log(`⚠️ [Property Hunter] Skipping property with no price data`);
      return null;
    }
    
    // Skip if price is unrealistically low or high
    if (price < 10000 || price > 10000000) {
      console.log(`⚠️ [Property Hunter] Filtering out property with price $${price} (unrealistic)`);
      return null;
    }
    
    // IMPORTANT: We're already filtering for type=Sale at the API level
    // Description-based filtering removed - let LLM evaluate rental potential during evaluation phase
    // All SALE properties should pass through for proper investment analysis

    // Extract address from raw Repliers API structure
    let addressString = 'Address not available';
    if (typeof property.address === 'object' && property.address !== null) {
      const addr = property.address;
      // Build complete address from Repliers fields
      const streetParts = [
        addr.streetNumber || '',
        addr.streetName || '',
        addr.streetSuffix || ''
      ].filter(Boolean).join(' ');
      const unitPart = addr.unitNumber ? ` #${addr.unitNumber}` : '';
      addressString = `${streetParts}${unitPart}`.trim() || 'Address not available';
    } else if (typeof property.address === 'string') {
      addressString = property.address;
    }
    
    // Extract bedrooms/bathrooms from details if available
    const bedrooms = property.details?.numBedrooms || property.bedrooms || 2;
    const bathrooms = property.details?.numBathrooms || property.bathrooms || 1;
    
    // Detect number of units with confidence scoring
    const unitDetection = detectUnits(property);
    
    // Log if unit detection has low confidence or needs research
    if (unitDetection.confidence === 'LOW' || unitDetection.confidence === 'UNKNOWN') {
      console.log(`   📝 Unit detection for ${addressString}: ${unitDetection.units} units (${unitDetection.confidence} confidence)`);
      if (unitDetection.raw_indicators) {
        console.log(`      Indicators: ${unitDetection.raw_indicators.join(', ')}`);
      }
    }
    
    return {
      id: property.mlsNumber || property.id || `${addressString}_${Date.now()}`,
      address: addressString,
      price: price,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      // IMPORTANT: Use 'style' for actual property type (Single Family, Condo, 2 Family, etc.)
      // 'propertyType' is always generic "Residential" for all residential properties
      propertyType: property.details?.style || property.property_type || property.details?.propertyType || 'residential',
      units: unitDetection.units,  // Add detected units
      unitConfidence: unitDetection.confidence,  // Add confidence level
      unitSource: unitDetection.source,  // Add source of detection
      location, // Keep for backward compatibility
      // Extract proper address fields from raw Repliers API
      city: property.address?.city || property.city || location,
      state: property.address?.state || property.state || 'MA',
      postalCode: property.address?.zip || property.address?.postalCode || property.zip_code || '',
      fullAddress: addressString + (property.address?.city ? `, ${property.address.city}` : '') + (property.address?.state ? `, ${property.address.state}` : ''),
      // Add MLS number for deduplication
      mls_id: property.mlsNumber || property.mls_number || undefined,
      strategicScore: 0, // Will be calculated later
      proximityFactors: {},
      rawData: property
    };
  }

  private filterProperties(properties: EnrichedProperty[], criteria: PropertySearchCriteria): EnrichedProperty[] {
    let priceFiltered = 0;
    let bedroomFiltered = 0;
    let typeFiltered = 0;
    
    const result = properties.filter((property, idx) => {
      // Price filter
      if (property.price > criteria.maxPrice) {
        priceFiltered++;
        return false;
      }
      
      // Bedroom filter
      if (property.bedrooms < criteria.minBedrooms) {
        bedroomFiltered++;
        return false;
      }
      
      // Property type filter (if specified)
      if (criteria.propertyTypes.length > 0) {
        const propType = property.propertyType.toLowerCase();
        const hasMatchingType = criteria.propertyTypes.some(type => {
          const searchType = type.toLowerCase();
          
          // Direct match or contains match
          if (propType.includes(searchType)) return true;
          
          // Special cases for common variations
          if (searchType === 'single family' && propType.includes('single family')) return true;
          if (searchType === '2 family' && (propType.includes('2 family') || propType.includes('two family') || propType.includes('2-family'))) return true;
          if (searchType === '3 family' && (propType.includes('3 family') || propType.includes('three family') || propType.includes('3-family'))) return true;
          if (searchType === '4 family' && (propType.includes('4 family') || propType.includes('four family') || propType.includes('4-family'))) return true;
          if (searchType === 'condo' && (propType.includes('condo') || propType.includes('condominium'))) return true;
          if (searchType === 'multi-family' && (propType.includes('family') && !propType.includes('single'))) return true;
          if (searchType === 'mixed-use' && (propType.includes('mixed') || propType.includes('commercial'))) return true;
          
          return false;
        });
        
        if (!hasMatchingType) {
          if (idx < 3) {
            console.log(`   ❌ Type mismatch: property has '${property.propertyType}', looking for: ${criteria.propertyTypes.join(', ')}`);
          }
          typeFiltered++;
          return false;
        }
      }

      return true;
    });
    
    if (properties.length > 0 && result.length === 0) {
      console.log(`   📊 Filter stats: ${priceFiltered} over price, ${bedroomFiltered} too few bedrooms, ${typeFiltered} wrong type`);
    }
    
    return result;
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

  expandGeographicSearch = withSpan(
    'property_hunter_expand',
    async (originalCriteria: PropertySearchCriteria): Promise<string[]> => {
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
  );
}