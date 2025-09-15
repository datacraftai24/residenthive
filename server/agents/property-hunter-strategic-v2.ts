/**
 * Strategic Property Hunter V2
 * Purpose: Bridge between Strategy Builder V3 output and property search
 * Takes strategy with buy_box and performs comprehensive search
 */

import { PropertyHunterAgent } from './property-hunter';
import type { EnrichedProperty, PropertySearchCriteria } from './property-hunter';

const propertyHunter = new PropertyHunterAgent();

interface StrategySearchInput {
  name: string;
  searchCriteria: {
    propertyTypes?: string[];
    maxPrice?: number;
    minPrice?: number;
    locations?: string[];
    minBedrooms?: number;
    minBathrooms?: number;
    mustGenerate?: number;
  };
}

class StrategicPropertyHunterV2 {
  /**
   * Search properties based on strategy parameters
   * Always does comprehensive search within affordability range
   */
  async searchProperties(input: StrategySearchInput): Promise<EnrichedProperty[]> {
    console.log(`\n🎯 [Strategic Property Hunter V2] Starting search for: ${input.name}`);
    
    // Log search parameters
    const { searchCriteria } = input;
    console.log(`   💰 Price range: $${searchCriteria.minPrice?.toLocaleString() || 0} - $${searchCriteria.maxPrice?.toLocaleString() || 'unlimited'}`);
    console.log(`   📍 Locations: ${searchCriteria.locations?.join(', ') || 'Not specified'}`);
    console.log(`   🏠 Property types: ${searchCriteria.propertyTypes?.join(', ') || 'All types'}`);
    console.log(`   🛏️  Min beds/baths: ${searchCriteria.minBedrooms || 'Any'}/${searchCriteria.minBathrooms || 'Any'}`);
    console.log(`   💵 Must generate: $${searchCriteria.mustGenerate || 0}/month`);
    
    // Convert to PropertyHunter criteria format
    const criteria: PropertySearchCriteria = {
      locations: searchCriteria.locations || ['Massachusetts'],
      maxPrice: searchCriteria.maxPrice || 10000000, // Default to very high if not specified
      minBedrooms: searchCriteria.minBedrooms || 0,
      propertyTypes: searchCriteria.propertyTypes || ['Single Family', 'Multi-Family', 'Condo'],
      strategicFactors: {
        // These can be enhanced based on strategy type
        universities: input.name?.toLowerCase().includes('student') || false,
        publicTransport: input.name?.toLowerCase().includes('urban') || false,
        emergingMarkets: input.name?.toLowerCase().includes('growth') || false
      }
    };
    
    // IMPORTANT: Always comprehensive search for strategy-based searches
    console.log(`   🔍 Search mode: COMPREHENSIVE (no artificial limits)`);
    
    try {
      // Call base property hunter
      const properties = await propertyHunter.searchProperties(criteria);
      
      console.log(`   📊 [Strategic V2] PropertyHunter returned ${properties.length} properties for ${input.name}`);
      
      // Apply min price filter if specified
      let filtered = properties;
      if (searchCriteria.minPrice && searchCriteria.minPrice > 0) {
        filtered = properties.filter(p => p.price >= searchCriteria.minPrice!);
        console.log(`   ✅ After min price filter ($${searchCriteria.minPrice.toLocaleString()}): ${filtered.length} properties`);
      }
      
      // Apply property type filter if more specific
      if (searchCriteria.propertyTypes && searchCriteria.propertyTypes.length > 0) {
        const typeSet = new Set(searchCriteria.propertyTypes.map(t => t.toLowerCase()));
        const beforeFilter = filtered.length;
        filtered = filtered.filter(p => {
          const pType = (p.propertyType || '').toLowerCase();
          return typeSet.has(pType) || 
                 (typeSet.has('multi-family') && (pType.includes('family') || pType.includes('plex'))) ||
                 (typeSet.has('single family') && pType.includes('single'));
        });
        if (filtered.length !== beforeFilter) {
          console.log(`   ✅ After property type filter: ${filtered.length} properties`);
        }
      }
      
      // Sort by price ascending for better evaluation order
      filtered.sort((a, b) => a.price - b.price);
      
      console.log(`   ✅ Final count: ${filtered.length} properties ready for evaluation`);
      
      return filtered;
      
    } catch (error) {
      console.error(`   ❌ Error searching properties:`, error);
      throw error;
    }
  }
}

export const strategicPropertyHunterV2 = new StrategicPropertyHunterV2();