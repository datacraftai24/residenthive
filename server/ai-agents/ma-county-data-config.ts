/**
 * Massachusetts County Data & Loan Limits - Config-Driven Version
 * 
 * This module provides access to MA county data from the config registry
 * instead of hardcoded values. It maintains the same interface for
 * backwards compatibility.
 */

import { configRegistry } from '../config/config-registry.js';

// Cache for config values to avoid repeated lookups
let configCache: {
  countyMapping?: any;
  policy?: any;
  marketData?: any;
  lastRefresh: number;
} = { lastRefresh: 0 };

const CACHE_TTL_MS = 60000; // Refresh cache every minute

/**
 * Refresh config cache if needed
 */
async function refreshConfigCache(): Promise<void> {
  const now = Date.now();
  if (now - configCache.lastRefresh > CACHE_TTL_MS) {
    await configRegistry.initialize();
    
    configCache.countyMapping = await configRegistry.getValue('county-mapping', {});
    configCache.policy = await configRegistry.getValue('policy', {});
    configCache.marketData = await configRegistry.getValue('market-data', {});
    configCache.lastRefresh = now;
  }
}

/**
 * Get county for a Massachusetts city
 */
export async function getCountyForCity(city: string, state: string = 'MA'): Promise<string | null> {
  if (state !== 'MA' && state !== 'Massachusetts') {
    return null;
  }
  
  await refreshConfigCache();
  
  // Normalize city name (trim, proper case)
  const normalizedCity = city.trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  const cityToCounty = configCache.countyMapping?.cityToCounty || {};
  const county = cityToCounty[normalizedCity];
  
  if (!county) {
    console.warn(`⚠️ County unknown for ${city}, MA - will use baseline loan limits`);
    return null;
  }
  
  return county;
}

// For backwards compatibility, maintain the interface types
export interface CountyLoanLimits {
  conforming: number;
  conformingHighBalance?: number;
  fha1: number;
  fha2: number;
  fha3: number;
  fha4: number;
}

/**
 * Get loan limits for a county
 */
export async function getLoanLimitsForCounty(county: string | null): Promise<CountyLoanLimits> {
  await refreshConfigCache();
  
  const countyLimits = configCache.countyMapping?.countyLoanLimits || {};
  
  if (!county) {
    console.warn('Using baseline loan limits (county unknown)');
    return countyLimits['BASELINE'] || {
      conforming: 766550,
      fha1: 431250,
      fha2: 552300,
      fha3: 667650,
      fha4: 830300
    };
  }
  
  const limits = countyLimits[county];
  
  if (!limits) {
    console.warn(`No specific limits for ${county}, using baseline`);
    return countyLimits['BASELINE'] || {
      conforming: 766550,
      fha1: 431250,
      fha2: 552300,
      fha3: 667650,
      fha4: 830300
    };
  }
  
  return limits;
}

/**
 * Get loan limits for a city
 */
export async function getLoanLimitsForCity(city: string, state: string = 'MA'): Promise<{
  county: string | null;
  limits: CountyLoanLimits;
  isHighCost: boolean;
}> {
  const county = await getCountyForCity(city, state);
  const limits = await getLoanLimitsForCounty(county);
  
  // High-cost determination
  const isHighCost = limits.conforming > 766550;
  
  return { county, limits, isHighCost };
}

/**
 * Get property tax rate for a city
 */
export async function getPropertyTaxRate(city: string): Promise<{
  rate: number;
  source: 'CITY' | 'COUNTY' | 'STATE';
}> {
  await refreshConfigCache();
  
  const propertyTaxRates = configCache.marketData?.propertyTaxRates || {};
  const cityData = propertyTaxRates[city];
  
  if (cityData) {
    return { 
      rate: cityData.rate || cityData, // Support both object and number formats
      source: 'CITY' 
    };
  }
  
  // Could add county averages here if needed
  
  // Fallback to state average
  const stateAvg = propertyTaxRates['STATE_AVG'];
  console.warn(`No tax rate for ${city}, using MA average`);
  
  return { 
    rate: stateAvg?.rate || stateAvg || 0.0104, 
    source: 'STATE' 
  };
}

/**
 * Get FHA loan limits by unit count
 */
export async function getFHALimits(county: string | null, units: 1 | 2 | 3 | 4): Promise<number> {
  const limits = await getLoanLimitsForCounty(county);
  
  switch (units) {
    case 1: return limits.fha1;
    case 2: return limits.fha2;
    case 3: return limits.fha3;
    case 4: return limits.fha4;
    default: return limits.fha1;
  }
}

/**
 * Get lending policy configuration
 */
export async function getLendingPolicy(): Promise<any> {
  await refreshConfigCache();
  return configCache.policy?.lending || {};
}

/**
 * Check if FHA self-sufficiency test applies
 */
export async function checkFHASelfSufficiency(units: number): Promise<{
  applies: boolean;
  minNetRentalIncome: number;
}> {
  const policy = await getLendingPolicy();
  const fhaPolicy = policy.fha || {};
  const selfSufficiency = fhaPolicy.selfSufficiencyTest || {};
  
  const applies = (selfSufficiency.applies || []).includes(units);
  const minNetRentalIncome = selfSufficiency.minNetRentalIncome || 0.75;
  
  return { applies, minNetRentalIncome };
}

/**
 * Get current mortgage rates
 */
export async function getMortgageRates(): Promise<{
  conventional30: number;
  conventional15: number;
  fha30: number;
  va30: number;
  jumbo30: number;
  updatedAt: string;
  source: string;
  confidence: string;
}> {
  await refreshConfigCache();
  
  const rates = configCache.marketData?.mortgageRates || {
    conventional30: 7.125,
    conventional15: 6.625,
    fha30: 6.875,
    va30: 6.750,
    jumbo30: 7.375,
    updatedAt: new Date().toISOString(),
    source: 'default',
    confidence: 'LOW'
  };
  
  return rates;
}

// Export legacy constants for backwards compatibility
// These will be loaded from config
export const MA_CITY_COUNTY: Record<string, string> = {};
export const MA_COUNTY_LIMITS_2024: Record<string, CountyLoanLimits> = {};
export const MA_PROPERTY_TAX_RATES: Record<string, number> = {};

// Load initial values on module load
(async () => {
  try {
    await refreshConfigCache();
    
    // Populate legacy exports for backwards compatibility
    Object.assign(MA_CITY_COUNTY, configCache.countyMapping?.cityToCounty || {});
    Object.assign(MA_COUNTY_LIMITS_2024, configCache.countyMapping?.countyLoanLimits || {});
    
    const taxRates = configCache.marketData?.propertyTaxRates || {};
    Object.entries(taxRates).forEach(([city, data]: [string, any]) => {
      MA_PROPERTY_TAX_RATES[city] = data.rate || data;
    });
  } catch (error) {
    console.warn('Failed to load county data config:', error);
  }
})();