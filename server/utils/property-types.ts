/**
 * Property Type Normalization and Unit Detection Utilities
 * 
 * Single source of truth for property type handling across the system
 */

// Canonical property types used throughout the system
export enum PropertyType {
  SingleFamily = 'SingleFamily',
  Condo = 'Condo',
  Townhouse = 'Townhouse',
  Duplex = 'Duplex',        // 2 units
  Triplex = 'Triplex',      // 3 units  
  Fourplex = 'Fourplex',    // 4 units
  MultiFamily = 'MultiFamily' // 5+ or unknown units
}

// Confidence levels for unit detection
export enum UnitConfidence {
  HIGH = 'HIGH',       // Explicit in style field (e.g., "3 Family")
  MEDIUM = 'MEDIUM',   // Parsed from description or inferred from bedrooms
  LOW = 'LOW',         // Generic "Multi Family" with estimation
  UNKNOWN = 'UNKNOWN'  // No reliable data, needs research
}

// Result of unit detection attempt
export interface UnitDetection {
  units: number;
  confidence: UnitConfidence;
  source: 'style_field' | 'description_parse' | 'bedroom_inference' | 'default';
  raw_indicators?: string[];  // What we found that led to this conclusion
  needs_research?: boolean;
}

/**
 * Normalize property type strings from various sources to canonical values
 */
export function normalizePropertyType(type: string | undefined): PropertyType {
  if (!type) return PropertyType.SingleFamily;
  
  const normalized = type.toLowerCase().trim();
  
  // Map common variations to canonical types
  const typeMap: Record<string, PropertyType> = {
    // Single Family variations
    'single family': PropertyType.SingleFamily,
    'single-family': PropertyType.SingleFamily,
    'single family residence': PropertyType.SingleFamily,
    'sfr': PropertyType.SingleFamily,
    'sfh': PropertyType.SingleFamily,
    'detached': PropertyType.SingleFamily,
    
    // Condo variations
    'condo': PropertyType.Condo,
    'condominium': PropertyType.Condo,
    'condex': PropertyType.Condo,
    
    // Townhouse variations
    'townhouse': PropertyType.Townhouse,
    'townhome': PropertyType.Townhouse,
    'attached': PropertyType.Townhouse,
    
    // Duplex variations (2 units)
    'duplex': PropertyType.Duplex,
    '2 family': PropertyType.Duplex,
    '2-family': PropertyType.Duplex,
    'two family': PropertyType.Duplex,
    'two-family': PropertyType.Duplex,
    '2 family - 2 units up/down': PropertyType.Duplex,
    '2 family - 2 units side by side': PropertyType.Duplex,
    
    // Triplex variations (3 units)
    'triplex': PropertyType.Triplex,
    '3 family': PropertyType.Triplex,
    '3-family': PropertyType.Triplex,
    'three family': PropertyType.Triplex,
    'three-family': PropertyType.Triplex,
    '3 family - 3 units up/down': PropertyType.Triplex,
    '3 family - 3 units side by side': PropertyType.Triplex,
    
    // Fourplex variations (4 units)
    'fourplex': PropertyType.Fourplex,
    'quadplex': PropertyType.Fourplex,
    '4 family': PropertyType.Fourplex,
    '4-family': PropertyType.Fourplex,
    'four family': PropertyType.Fourplex,
    'four-family': PropertyType.Fourplex,
    '4 family - 4 units up/down': PropertyType.Fourplex,
    '4 family - 4 units side by side': PropertyType.Fourplex,
    
    // Multi-family (5+ or unknown)
    'multi family': PropertyType.MultiFamily,
    'multi-family': PropertyType.MultiFamily,
    'multifamily': PropertyType.MultiFamily,
    'apartment': PropertyType.MultiFamily,
    '5+ family': PropertyType.MultiFamily,
    '5-9 family': PropertyType.MultiFamily,
    'residential income': PropertyType.MultiFamily,
  };
  
  // Check for exact match
  if (typeMap[normalized]) {
    return typeMap[normalized];
  }
  
  // Check for partial matches
  for (const [key, value] of Object.entries(typeMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  // Default to single family if unknown
  return PropertyType.SingleFamily;
}

/**
 * Get the expected number of units for a property type
 */
export function getUnitsForType(type: PropertyType): number | null {
  switch (type) {
    case PropertyType.SingleFamily:
    case PropertyType.Condo:
    case PropertyType.Townhouse:
      return 1;
    case PropertyType.Duplex:
      return 2;
    case PropertyType.Triplex:
      return 3;
    case PropertyType.Fourplex:
      return 4;
    case PropertyType.MultiFamily:
      return null; // Unknown, needs detection
    default:
      return 1;
  }
}

/**
 * Detect number of units from property data with confidence scoring
 */
export function detectUnits(property: any): UnitDetection {
  // HIGH confidence - explicit in style field
  if (property.details?.style) {
    const style = property.details.style.toLowerCase();
    
    // Check for explicit unit counts
    const explicitPatterns = [
      { pattern: /^2 family/, units: 2 },
      { pattern: /duplex/, units: 2 },
      { pattern: /^3 family/, units: 3 },
      { pattern: /triplex/, units: 3 },
      { pattern: /^4 family/, units: 4 },
      { pattern: /fourplex|quadplex/, units: 4 },
      { pattern: /^5\+ family|5-9 family/, units: 5 },
    ];
    
    for (const { pattern, units } of explicitPatterns) {
      if (pattern.test(style)) {
        return {
          units,
          confidence: UnitConfidence.HIGH,
          source: 'style_field',
          raw_indicators: [property.details.style]
        };
      }
    }
  }
  
  // MEDIUM confidence - parse from description
  if (property.details?.description) {
    const desc = property.details.description.toLowerCase();
    
    const descPatterns = [
      { regex: /(\d+)\s*-?\s*famil/i, extract: (m: RegExpMatchArray) => parseInt(m[1]) },
      { regex: /(\d+)\s+unit(?:s)?/i, extract: (m: RegExpMatchArray) => parseInt(m[1]) },
      { regex: /duplex|two\s+family/i, extract: () => 2 },
      { regex: /triplex|three\s+family/i, extract: () => 3 },
      { regex: /fourplex|four\s+family/i, extract: () => 4 },
    ];
    
    for (const { regex, extract } of descPatterns) {
      const match = desc.match(regex);
      if (match) {
        const units = extract(match);
        return {
          units,
          confidence: UnitConfidence.MEDIUM,
          source: 'description_parse',
          raw_indicators: [match[0]]
        };
      }
    }
  }
  
  // LOW confidence - bedroom/bathroom inference for Multi Family
  if (property.details?.style?.toLowerCase().includes('multi family') ||
      property.details?.propertyType?.toLowerCase().includes('income')) {
    
    const bedrooms = property.details?.numBedrooms || property.bedrooms || 0;
    const bathrooms = property.details?.numBathrooms || property.bathrooms || 0;
    
    // Heuristic: assume 2-3 bedrooms per unit on average
    if (bedrooms >= 4) {
      // Conservative estimate based on bedrooms
      let estimatedUnits = Math.floor(bedrooms / 2.5);
      
      // Sanity check with bathrooms (usually at least 1 per unit)
      if (bathrooms > 0) {
        const bathroomEstimate = Math.ceil(bathrooms / 1.5);
        estimatedUnits = Math.min(estimatedUnits, bathroomEstimate);
      }
      
      // Cap at 4 for safety
      estimatedUnits = Math.max(2, Math.min(4, estimatedUnits));
      
      return {
        units: estimatedUnits,
        confidence: UnitConfidence.LOW,
        source: 'bedroom_inference',
        raw_indicators: [
          `${bedrooms} bedrooms, ${bathrooms} bathrooms`,
          `Estimated ${estimatedUnits} units`
        ],
        needs_research: true
      };
    }
    
    // Generic multi-family with no clear signals - conservative default
    return {
      units: 2, // Conservative default for multi-family
      confidence: UnitConfidence.LOW,
      source: 'default',
      raw_indicators: ['Generic Multi Family, defaulting to 2 units'],
      needs_research: true
    };
  }
  
  // UNKNOWN - single family or truly unknown
  const normalizedType = normalizePropertyType(property.details?.style || property.propertyType);
  const typeUnits = getUnitsForType(normalizedType);
  
  if (typeUnits !== null) {
    return {
      units: typeUnits,
      confidence: UnitConfidence.HIGH,
      source: 'style_field',
      raw_indicators: [property.details?.style || property.propertyType]
    };
  }
  
  // Complete unknown - needs research
  return {
    units: 1,  // Ultra-conservative for underwriting
    confidence: UnitConfidence.UNKNOWN,
    source: 'default',
    raw_indicators: ['No unit data found'],
    needs_research: true
  };
}

/**
 * Check if a property type is multi-family (2+ units)
 */
export function isMultiFamily(type: PropertyType): boolean {
  return [
    PropertyType.Duplex,
    PropertyType.Triplex,
    PropertyType.Fourplex,
    PropertyType.MultiFamily
  ].includes(type);
}

/**
 * Get display name for property type
 */
export function getPropertyTypeDisplayName(type: PropertyType): string {
  const displayNames: Record<PropertyType, string> = {
    [PropertyType.SingleFamily]: 'Single Family',
    [PropertyType.Condo]: 'Condominium',
    [PropertyType.Townhouse]: 'Townhouse',
    [PropertyType.Duplex]: '2-Family',
    [PropertyType.Triplex]: '3-Family',
    [PropertyType.Fourplex]: '4-Family',
    [PropertyType.MultiFamily]: 'Multi-Family',
  };
  
  return displayNames[type] || type;
}