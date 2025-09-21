/**
 * Configurable thresholds for validation
 * These drive our agent behavior and should be tunable per strategy
 */

// Machine-readable error codes for debugging and tuning
export enum ErrorCode {
  // Strategy errors
  MISSING_CAPITAL = 'MISSING_CAPITAL',
  INVALID_RISK_TOLERANCE = 'INVALID_RISK_TOLERANCE',
  CAPITAL_OUTLIER = 'CAPITAL_OUTLIER',
  
  // Market errors
  NO_SOURCES = 'NO_SOURCES',
  STALE_SOURCES = 'STALE_SOURCES',
  MISSING_NUMERIC_KPIS = 'MISSING_NUMERIC_KPIS',
  UNGROUNDED_FACTS = 'UNGROUNDED_FACTS',
  
  // Property errors
  MISSING_UNIT_COUNT = 'MISSING_UNIT_COUNT',
  OVER_BUDGET = 'OVER_BUDGET',
  STALE_LISTINGS = 'STALE_LISTINGS',
  INVALID_GEO = 'INVALID_GEO',
  INVALID_DATE_INPUT = 'INVALID_DATE_INPUT',
  
  // Financial errors
  MONOTONICITY_FAIL = 'MONOTONICITY_FAIL',
  INVALID_RECOMMENDATION_REF = 'INVALID_RECOMMENDATION_REF',
  CALC_ERROR = 'CALC_ERROR',
  DTI_EXCEEDED = 'DTI_EXCEEDED',
  NEGATIVE_VALUES = 'NEGATIVE_VALUES',
  
  // Package errors
  INSUFFICIENT_PROPERTIES = 'INSUFFICIENT_PROPERTIES',
  SYNTHETIC_SUMMARY = 'SYNTHETIC_SUMMARY',
  ABORTED_EARLY = 'ABORTED_EARLY',
  MISSING_COMPONENTS = 'MISSING_COMPONENTS',
  
  // System errors
  TOOL_ERROR = 'TOOL_ERROR',
  UNKNOWN_AGENT = 'UNKNOWN_AGENT',
  MISSING_VALIDATOR = 'MISSING_VALIDATOR'
}

// Safe parsing with defaults
function safeParseInt(value: string | undefined, defaultVal: number): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultVal : parsed;
}

function safeParseFloat(value: string | undefined, defaultVal: number): number {
  if (!value) return defaultVal;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultVal : parsed;
}

export class ObservabilityConfig {
  // Property search thresholds
  readonly MIN_PROPERTIES: number;
  readonly MAX_LISTING_AGE_DAYS: number;
  readonly MAX_DISTANCE_MILES: number;
  
  // Market research thresholds  
  readonly MAX_SOURCE_AGE_DAYS: number;
  readonly MIN_GROUNDED_RATE: number;
  readonly GROUNDED_RATE_LOW: number;
  readonly GROUNDED_RATE_HIGH: number;
  
  // Financial thresholds
  readonly MIN_SCENARIO_VARIANCE: number;
  readonly MAX_DTI_RATIO: number;
  readonly DEFAULT_VACANCY_RATE: number;
  readonly PAYMENT_TOLERANCE: number; // For P&I validation
  
  // Confidence thresholds
  readonly LOW_CONFIDENCE_THRESHOLD: number;
  
  constructor(overrides?: Partial<ObservabilityConfig>) {
    // Load from env with safe defaults
    this.MIN_PROPERTIES = overrides?.MIN_PROPERTIES ?? 
      safeParseInt(process.env.MIN_PROPERTIES, 3);
    
    this.MAX_LISTING_AGE_DAYS = overrides?.MAX_LISTING_AGE_DAYS ?? 
      safeParseInt(process.env.MAX_LISTING_AGE_DAYS, 90);
    
    this.MAX_DISTANCE_MILES = overrides?.MAX_DISTANCE_MILES ?? 
      safeParseInt(process.env.MAX_DISTANCE_MILES, 50);
    
    this.MAX_SOURCE_AGE_DAYS = overrides?.MAX_SOURCE_AGE_DAYS ?? 
      safeParseInt(process.env.MAX_SOURCE_AGE_DAYS, 365);
    
    this.MIN_GROUNDED_RATE = overrides?.MIN_GROUNDED_RATE ?? 
      safeParseFloat(process.env.MIN_GROUNDED_RATE, 0.3);
    
    this.GROUNDED_RATE_LOW = overrides?.GROUNDED_RATE_LOW ?? 
      safeParseFloat(process.env.GROUNDED_RATE_LOW, 0.3);
    
    this.GROUNDED_RATE_HIGH = overrides?.GROUNDED_RATE_HIGH ?? 
      safeParseFloat(process.env.GROUNDED_RATE_HIGH, 0.7);
    
    this.MIN_SCENARIO_VARIANCE = overrides?.MIN_SCENARIO_VARIANCE ?? 
      safeParseFloat(process.env.MIN_SCENARIO_VARIANCE, 100);
    
    this.MAX_DTI_RATIO = overrides?.MAX_DTI_RATIO ?? 
      safeParseFloat(process.env.MAX_DTI_RATIO, 0.43);
    
    this.DEFAULT_VACANCY_RATE = overrides?.DEFAULT_VACANCY_RATE ?? 
      safeParseFloat(process.env.DEFAULT_VACANCY_RATE, 0.05);
    
    this.PAYMENT_TOLERANCE = overrides?.PAYMENT_TOLERANCE ?? 
      safeParseFloat(process.env.PAYMENT_TOLERANCE, 50); // $50 tolerance
    
    this.LOW_CONFIDENCE_THRESHOLD = overrides?.LOW_CONFIDENCE_THRESHOLD ?? 
      safeParseFloat(process.env.LOW_CONFIDENCE_THRESHOLD, 0.7);
    
    // Runtime sanity check
    this.validateConfig();
  }
  
  private validateConfig(): void {
    const warnings: string[] = [];
    
    if (this.MIN_PROPERTIES < 1 || this.MIN_PROPERTIES > 20) {
      warnings.push(`MIN_PROPERTIES=${this.MIN_PROPERTIES} seems unusual`);
    }
    
    if (this.MAX_LISTING_AGE_DAYS < 7 || this.MAX_LISTING_AGE_DAYS > 365) {
      warnings.push(`MAX_LISTING_AGE_DAYS=${this.MAX_LISTING_AGE_DAYS} may be too restrictive or loose`);
    }
    
    if (this.MIN_GROUNDED_RATE < 0 || this.MIN_GROUNDED_RATE > 1) {
      warnings.push(`MIN_GROUNDED_RATE=${this.MIN_GROUNDED_RATE} should be between 0-1`);
    }
    
    if (this.MAX_DTI_RATIO < 0.2 || this.MAX_DTI_RATIO > 0.6) {
      warnings.push(`MAX_DTI_RATIO=${this.MAX_DTI_RATIO} outside typical range`);
    }
    
    if (warnings.length > 0) {
      console.warn('[ObservabilityConfig] Configuration warnings:', warnings);
    }
  }
  
  /**
   * Get grounding bucket for dashboards
   */
  getGroundingBucket(rate: number): 'low' | 'medium' | 'high' {
    if (rate < this.GROUNDED_RATE_LOW) return 'low';
    if (rate < this.GROUNDED_RATE_HIGH) return 'medium';
    return 'high';
  }
  
  /**
   * Export current config for span tagging
   */
  toSpanTags(): Record<string, any> {
    return {
      min_properties: this.MIN_PROPERTIES,
      max_listing_age_days: this.MAX_LISTING_AGE_DAYS,
      max_source_age_days: this.MAX_SOURCE_AGE_DAYS,
      min_grounded_rate: this.MIN_GROUNDED_RATE,
      min_scenario_variance: this.MIN_SCENARIO_VARIANCE,
      max_dti_ratio: this.MAX_DTI_RATIO,
      confidence_threshold: this.LOW_CONFIDENCE_THRESHOLD
    };
  }
}

/**
 * Resolve thresholds with strategy/profile overrides
 */
export function resolveThresholds(profileOverrides?: any): ObservabilityConfig {
  const overrides: Partial<ObservabilityConfig> = {};
  
  if (profileOverrides?.preferences?.minProperties) {
    overrides.MIN_PROPERTIES = profileOverrides.preferences.minProperties;
  }
  
  if (profileOverrides?.constraints?.maxListingAge) {
    overrides.MAX_LISTING_AGE_DAYS = profileOverrides.constraints.maxListingAge;
  }
  
  if (profileOverrides?.constraints?.maxDistance) {
    overrides.MAX_DISTANCE_MILES = profileOverrides.constraints.maxDistance;
  }
  
  if (profileOverrides?.financial?.maxDTI) {
    overrides.MAX_DTI_RATIO = profileOverrides.financial.maxDTI;
  }
  
  return new ObservabilityConfig(overrides);
}

// Default instance
export const defaultConfig = new ObservabilityConfig();