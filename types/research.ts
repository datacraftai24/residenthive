/**
 * Research Types - Single Source of Truth
 * MANDATORY: Every research item MUST have a canonical key
 */

export type CanonicalKey =
  | 'sf_price_median'
  | 'mf_price_median'       // aka '2_4_unit_median'
  | 'studio_median_rent'    // point
  | 'studio_rent_range'     // band
  | '1br_median_rent'       // point
  | '1br_rent_range'        // band
  | 'avg_rent_2br'          // point (legacy)
  | 'rent_range_2br'        // band (legacy)
  | '2br_median_rent'       // point
  | '2br_rent_range'        // band
  | '3br_median_rent'       // point
  | '3br_rent_range'        // band
  | 'dom_p10_p90'           // band
  | 'sale_psf_p10_p90'      // band
  | 'rate_30yr_conventional'
  | 'rate_fha'              // FHA interest rate (3-10%)
  | 'fha_loan_limit'        // FHA max loan amount (NOT a rate!)
  | 'vacancy_rate'          // for tracking, not comps
  | 'tax_rate'              // for expenses
  | 'insurance_avg';        // for expenses

export type ResearchItem = {
  id: string;
  key: CanonicalKey;  // MANDATORY - no optionals
  answer: any;
};

export type Band = { 
  min: number | null; 
  max: number | null; 
  sourceIds: string[] 
};

export type MarketMetrics = {
  priceBands: { 
    singleFamily?: Band; 
    multiFamily?: Band; 
    condo?: Band 
  };
  rentBands: { 
    twoBr?: Band; 
    point2Br?: { value: number; sourceId: string } 
  };
  market: { 
    domDays?: Band; 
    salePsf?: Band; 
    city: string  // NEVER "Unknown"
  };
  rates: { 
    conventional?: number | null; 
    fha?: number | null; 
    sourceIds: string[] 
  };
};

export type MetricsValidation = {
  ok: boolean;
  missing: string[];
  critical: boolean;  // true if missing core metrics
};