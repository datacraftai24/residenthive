/**
 * Massachusetts County Data & Loan Limits
 * 
 * Critical for determining FHA and conforming loan limits by county
 * Data source: HUD FHA Mortgage Limits 2024, FHFA Conforming Loan Limits 2024
 */

// City to County mapping for Massachusetts
export const MA_CITY_COUNTY: Record<string, string> = {
  // Suffolk County (Boston Metro Core)
  'Boston': 'Suffolk',
  'Chelsea': 'Suffolk', 
  'Revere': 'Suffolk',
  'Winthrop': 'Suffolk',
  
  // Middlesex County (Boston Metro)
  'Cambridge': 'Middlesex',
  'Somerville': 'Middlesex',
  'Newton': 'Middlesex',
  'Waltham': 'Middlesex',
  'Medford': 'Middlesex',
  'Malden': 'Middlesex',
  'Arlington': 'Middlesex',
  'Belmont': 'Middlesex',
  'Watertown': 'Middlesex',
  'Everett': 'Middlesex',
  'Woburn': 'Middlesex',
  'Framingham': 'Middlesex',
  'Lexington': 'Middlesex',
  'Burlington': 'Middlesex',
  'Lowell': 'Middlesex',
  'Billerica': 'Middlesex',
  'Marlborough': 'Middlesex',
  
  // Norfolk County (Boston Metro South)
  'Quincy': 'Norfolk',
  'Brookline': 'Norfolk',
  'Dedham': 'Norfolk',
  'Milton': 'Norfolk',
  'Needham': 'Norfolk',
  'Wellesley': 'Norfolk',
  'Braintree': 'Norfolk',
  'Weymouth': 'Norfolk',
  'Randolph': 'Norfolk',
  'Canton': 'Norfolk',
  
  // Essex County (North Shore)
  'Lynn': 'Essex',
  'Salem': 'Essex',
  'Peabody': 'Essex',
  'Beverly': 'Essex',
  'Gloucester': 'Essex',
  'Haverhill': 'Essex',
  'Lawrence': 'Essex',
  'Methuen': 'Essex',
  'Andover': 'Essex',
  'Danvers': 'Essex',
  'Marblehead': 'Essex',
  'Newburyport': 'Essex',
  
  // Worcester County (Central MA)
  'Worcester': 'Worcester',
  'Fitchburg': 'Worcester',
  'Leominster': 'Worcester',
  'Shrewsbury': 'Worcester',
  'Westborough': 'Worcester',
  'Milford': 'Worcester',
  'Clinton': 'Worcester',
  'Gardner': 'Worcester',
  
  // Plymouth County
  'Brockton': 'Plymouth',
  'Plymouth': 'Plymouth',
  'Bridgewater': 'Plymouth',
  'Marshfield': 'Plymouth',
  'Scituate': 'Plymouth',
  'Abington': 'Plymouth',
  'Rockland': 'Plymouth',
  'Whitman': 'Plymouth',
  
  // Bristol County (South Coast)
  'New Bedford': 'Bristol',
  'Fall River': 'Bristol',
  'Taunton': 'Bristol',
  'Attleboro': 'Bristol',
  'Dartmouth': 'Bristol',
  'Fairhaven': 'Bristol',
  'Somerset': 'Bristol',
  
  // Hampden County (Springfield Area)
  'Springfield': 'Hampden',
  'Holyoke': 'Hampden',
  'Chicopee': 'Hampden',
  'Westfield': 'Hampden',
  'Agawam': 'Hampden',
  'West Springfield': 'Hampden',
  'Longmeadow': 'Hampden',
  
  // Barnstable County (Cape Cod)
  'Barnstable': 'Barnstable',
  'Falmouth': 'Barnstable',
  'Yarmouth': 'Barnstable',
  'Dennis': 'Barnstable',
  'Brewster': 'Barnstable',
  'Chatham': 'Barnstable',
  'Harwich': 'Barnstable',
  'Orleans': 'Barnstable',
  'Provincetown': 'Barnstable',
  
  // Hampshire County
  'Northampton': 'Hampshire',
  'Amherst': 'Hampshire',
  'Easthampton': 'Hampshire',
  'South Hadley': 'Hampshire',
  
  // Berkshire County (Western MA)
  'Pittsfield': 'Berkshire',
  'North Adams': 'Berkshire',
  'Great Barrington': 'Berkshire',
  'Lenox': 'Berkshire',
  'Williamstown': 'Berkshire'
};

// 2024 Loan Limits by County
export interface CountyLoanLimits {
  conforming: number;      // Conforming loan limit (1-unit)
  conformingHighBalance?: number; // For high-cost areas
  fha1: number;            // FHA 1-unit limit
  fha2: number;            // FHA 2-unit limit  
  fha3: number;            // FHA 3-unit limit
  fha4: number;            // FHA 4-unit limit
}

export const MA_COUNTY_LIMITS_2024: Record<string, CountyLoanLimits> = {
  // HIGH-COST AREAS (Boston-Cambridge-Newton MSA)
  'Suffolk': {
    conforming: 1149825,
    conformingHighBalance: 1149825, 
    fha1: 498257,
    fha2: 638100,
    fha3: 771525,
    fha4: 959325
  },
  'Middlesex': {
    conforming: 1149825,
    conformingHighBalance: 1149825,
    fha1: 498257,
    fha2: 638100,
    fha3: 771525,
    fha4: 959325
  },
  'Norfolk': {
    conforming: 1149825,
    conformingHighBalance: 1149825,
    fha1: 498257,
    fha2: 638100,
    fha3: 771525,
    fha4: 959325
  },
  'Essex': {
    conforming: 1149825,
    conformingHighBalance: 1149825,
    fha1: 498257,
    fha2: 638100,
    fha3: 771525,
    fha4: 959325
  },
  'Plymouth': {
    conforming: 1149825,
    conformingHighBalance: 1149825,
    fha1: 498257,
    fha2: 638100,
    fha3: 771525,
    fha4: 959325
  },
  
  // STANDARD AREAS (Baseline limits)
  'Worcester': {
    conforming: 766550,
    fha1: 431250,
    fha2: 552300,
    fha3: 667650,
    fha4: 830300
  },
  'Hampden': {  // Springfield area
    conforming: 766550,
    fha1: 431250,
    fha2: 552300,
    fha3: 667650,
    fha4: 830300
  },
  'Bristol': {  // New Bedford/Fall River
    conforming: 766550,
    fha1: 431250,
    fha2: 552300,
    fha3: 667650,
    fha4: 830300
  },
  'Hampshire': {
    conforming: 766550,
    fha1: 431250,
    fha2: 552300,
    fha3: 667650,
    fha4: 830300
  },
  'Berkshire': {
    conforming: 766550,
    fha1: 431250,
    fha2: 552300,
    fha3: 667650,
    fha4: 830300
  },
  
  // SPECIAL: Barnstable County (Cape Cod - above standard but below Boston)
  'Barnstable': {
    conforming: 977500,
    fha1: 472030,
    fha2: 604400,
    fha3: 730950,
    fha4: 908775
  },
  
  // FALLBACK - National baseline for unknown counties
  'BASELINE': {
    conforming: 766550,
    fha1: 431250,
    fha2: 552300,
    fha3: 667650,
    fha4: 830300
  }
};

/**
 * Get county for a Massachusetts city
 */
export function getCountyForCity(city: string, state: string = 'MA'): string | null {
  if (state !== 'MA' && state !== 'Massachusetts') {
    return null;
  }
  
  // Normalize city name (trim, proper case)
  const normalizedCity = city.trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  const county = MA_CITY_COUNTY[normalizedCity];
  
  if (!county) {
    console.warn(`⚠️ County unknown for ${city}, MA - will use baseline loan limits`);
    return null;
  }
  
  return county;
}

/**
 * Get loan limits for a county
 */
export function getLoanLimitsForCounty(county: string | null): CountyLoanLimits {
  if (!county) {
    console.warn('Using baseline loan limits (county unknown)');
    return MA_COUNTY_LIMITS_2024['BASELINE'];
  }
  
  const limits = MA_COUNTY_LIMITS_2024[county];
  
  if (!limits) {
    console.warn(`No specific limits for ${county}, using baseline`);
    return MA_COUNTY_LIMITS_2024['BASELINE'];
  }
  
  return limits;
}

/**
 * Get loan limits for a city
 */
export function getLoanLimitsForCity(city: string, state: string = 'MA'): {
  county: string | null;
  limits: CountyLoanLimits;
  isHighCost: boolean;
} {
  const county = getCountyForCity(city, state);
  const limits = getLoanLimitsForCounty(county);
  
  // High-cost determination
  const isHighCost = limits.conforming > 766550;
  
  return { county, limits, isHighCost };
}

/**
 * Massachusetts-specific property tax rates by town (simplified for MVP)
 * Source: MA Department of Revenue
 */
export const MA_PROPERTY_TAX_RATES: Record<string, number> = {
  // Low tax towns
  'Cambridge': 0.0054,  // 0.54%
  'Boston': 0.0056,     // 0.56%
  'Brookline': 0.0105,  // 1.05%
  
  // Medium tax towns  
  'Newton': 0.0107,     // 1.07%
  'Worcester': 0.0135,  // 1.35%
  'Springfield': 0.0118, // 1.18%
  'Lowell': 0.0128,     // 1.28%
  'New Bedford': 0.0097, // 0.97%
  
  // Higher tax towns
  'Fitchburg': 0.0142,  // 1.42%
  'Lawrence': 0.0154,   // 1.54%
  'Haverhill': 0.0148,  // 1.48%
  
  // State average (fallback)
  'STATE_AVG': 0.0104   // 1.04%
};

/**
 * Get property tax rate for a city
 */
export function getPropertyTaxRate(city: string): {
  rate: number;
  source: 'CITY' | 'COUNTY' | 'STATE';
} {
  const cityRate = MA_PROPERTY_TAX_RATES[city];
  
  if (cityRate !== undefined) {
    return { rate: cityRate, source: 'CITY' };
  }
  
  // Could add county averages here if needed
  
  // Fallback to state average
  console.warn(`No tax rate for ${city}, using MA average`);
  return { rate: MA_PROPERTY_TAX_RATES['STATE_AVG'], source: 'STATE' };
}