/**
 * Metrics Registry - Single Source of Truth for Validation & Normalization
 * 
 * NO GUESSING. NO DEFAULTS. NO FALLBACKS.
 * If it's not here, it doesn't exist.
 */

import type { CanonicalKey } from '../../types/research';

// Re-export the type
export type { CanonicalKey } from '../../types/research';

/**
 * Validators - Each key has strict validation rules
 */
export const Validators: Record<CanonicalKey, (v: any) => boolean> = {
  sf_price_median:        v => typeof v === 'number' && v >= 50_000 && v <= 5_000_000,
  mf_price_median:        v => typeof v === 'number' && v >= 100_000 && v <= 10_000_000,
  studio_median_rent:     v => typeof v === 'number' && v >= 500 && v <= 4_000,
  studio_rent_range:      v => v?.min >= 500 && v?.max <= 4_000 && v.min < v.max,
  '1br_median_rent':      v => typeof v === 'number' && v >= 600 && v <= 5_000,
  '1br_rent_range':       v => v?.min >= 600 && v?.max <= 5_000 && v.min < v.max,
  avg_rent_2br:           v => typeof v === 'number' && v >= 800 && v <= 6_000,
  rent_range_2br:         v => v?.min >= 800 && v?.max <= 6_000 && v.min < v.max,
  '2br_median_rent':      v => typeof v === 'number' && v >= 800 && v <= 6_000,
  '2br_rent_range':       v => v?.min >= 800 && v?.max <= 6_000 && v.min < v.max,
  '3br_median_rent':      v => typeof v === 'number' && v >= 1000 && v <= 8_000,
  '3br_rent_range':       v => v?.min >= 1000 && v?.max <= 8_000 && v.min < v.max,
  dom_p10_p90:            v => v?.min >= 1 && v?.max <= 365 && v.min < v.max,
  sale_psf_p10_p90:       v => v?.min >= 50 && v?.max <= 1_000 && v.min < v.max,
  rate_30yr_conventional: v => {
    const r = typeof v === 'number' ? (v > 1 ? v / 100 : v) : NaN;
    return r >= 0.03 && r <= 0.10;
  },
  rate_fha: v => {
    const r = typeof v === 'number' ? (v > 1 ? v / 100 : v) : NaN;
    return r >= 0.03 && r <= 0.10;
  },
  fha_loan_limit:         v => typeof v === 'number' && v >= 100_000 && v <= 1_500_000,
  vacancy_rate:           v => {
    const r = typeof v === 'number' ? (v > 1 ? v / 100 : v) : NaN;
    return r >= 0.001 && r <= 0.30;
  },
  tax_rate:               v => {
    const r = typeof v === 'number' ? (v > 1 ? v / 100 : v) : NaN;
    return r >= 0.001 && r <= 0.05;
  },
  insurance_avg:          v => typeof v === 'number' && v >= 500 && v <= 10_000
};

/**
 * Normalizers - Convert values to standard format
 */
export const Normalizers = {
  toPctDecimal: (v: number): number => {
    // Convert percentage to decimal (6.75 -> 0.0675)
    return v > 1 ? v / 100 : v;
  },
  
  toWholeNumber: (v: number): number => {
    // Convert decimal to percentage (0.0675 -> 6.75)
    return v < 1 ? v * 100 : v;
  }
};

/**
 * Label to Key Mapping - Curated list, NO REGEX
 * LLM must generate queries with these exact labels
 */
export const LABEL_TO_KEY: Record<string, CanonicalKey> = {
  // Property prices
  'single-family median price': 'sf_price_median',
  '2-4 unit median price': 'mf_price_median',
  'multi-family median price': 'mf_price_median',
  
  // Rents - Unit specific
  'studio median rent': 'studio_median_rent',
  'studio rent range': 'studio_rent_range',
  '1-bedroom median rent': '1br_median_rent',
  '1-bedroom rent range': '1br_rent_range',
  'average 2-bedroom rent': 'avg_rent_2br',  // Legacy
  '2-bedroom rent range': 'rent_range_2br',  // Legacy
  '2-bedroom median rent': '2br_median_rent',
  '2-bedroom rent range': '2br_rent_range',
  '3-bedroom median rent': '3br_median_rent',
  '3-bedroom rent range': '3br_rent_range',
  
  // Market metrics
  'days on market range': 'dom_p10_p90',
  'price per square foot range': 'sale_psf_p10_p90',
  
  // Financing
  '30-year conventional rate': 'rate_30yr_conventional',
  'conventional mortgage rate': 'rate_30yr_conventional',
  'FHA interest rate': 'rate_fha',
  'FHA loan limit': 'fha_loan_limit',
  
  // Operating metrics
  'vacancy rate': 'vacancy_rate',
  'property tax rate': 'tax_rate',
  'average insurance cost': 'insurance_avg'
};

/**
 * Get validator for a key
 */
export function getValidator(key: CanonicalKey): (v: any) => boolean {
  return Validators[key] || (() => false);
}

/**
 * Validate a value for a key
 */
export function validateMetric(key: CanonicalKey, value: any): boolean {
  const validator = Validators[key];
  if (!validator) {
    console.warn(`No validator for key: ${key}`);
    return false;
  }
  return validator(value);
}

/**
 * Normalize a rate value
 */
export function normalizeRate(key: CanonicalKey, value: number): number {
  const rateKeys: CanonicalKey[] = ['rate_30yr_conventional', 'rate_fha', 'vacancy_rate', 'tax_rate'];
  if (rateKeys.includes(key)) {
    return Normalizers.toPctDecimal(value);
  }
  return value;
}