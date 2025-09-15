/**
 * Type definitions for Two-Pass Extraction System v1.0
 * 
 * These types ensure consistency across the entire extraction pipeline
 * from MLS parsing through rent calculation and telemetry.
 */

export interface UnitType {
  unit_id: string;  // Normalized ID: 'U1', 'U2', 'U3', etc.
  beds: 0 | 1 | 2 | 3 | 4;
  label: 'Studio' | '1BR' | '2BR' | '3BR' | '4BR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'STRICT' | 'INFERRED' | 'DEFAULT';
  assumption_code?: string;  // Required when source='INFERRED' && confidence!='HIGH'
  citation?: string;  // Capped at 200 chars for storage
}

export interface ExtractionResult {
  units: number;
  totalBeds?: number;  // Often missing from MLS
  unit_breakdown_strict: UnitType[];
  unit_breakdown_inferred: UnitType[];
  mix_resolution: MixResolution;
  telemetry?: ExtractionTelemetry;
}

export interface MixResolution {
  final_mix: UnitType[];
  source: 'STRICT' | 'INFERRED' | 'DEFAULT_PARTIAL' | 'DEFAULT_CONSERVATIVE' | 'KNOWN_COMPLETE';
  review_required: boolean;
  flags: string[];
}

export interface KitchenVerification {
  verified: boolean;
  flag?: 'KITCHEN_COUNT_UNVERIFIED';
  vacancy_adjustment: number;  // 0.02 if unverified, 0 otherwise
  mentions: number;
  required: number;
}

export interface DSCRResult {
  dscr: number;
  min_required: number;
  dscr_rule: 'STRICT_1p05' | 'DEFAULT_1p10';
  pass: boolean;
  flags: string[];
}

export interface RentCalculation {
  total_monthly_rent: number;
  breakdown: RentBreakdown[];
  rent_table_version: string;
  rent_table_sha: string;
  confidence_adjustment_total: number;
}

export interface RentBreakdown {
  unit_index: number;
  unit_id: string;
  unit_type: 'Studio' | '1BR' | '2BR' | '3BR' | '4BR';
  grade: 'A' | 'B' | 'C';
  base_rent: number;
  adjusted_rent: number;
  discount_pct: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'STRICT' | 'INFERRED' | 'DEFAULT';
}

export interface ExtractionTelemetry {
  // Identity
  property_id: string;
  timestamp: number;
  extraction_version: string;
  
  // Core results
  merge_path: MixResolution['source'];
  unit_ids: string[];
  final_mix: UnitType[];
  
  // Traceability
  assumption_codes: string[];
  rent_table_sha: string;
  rent_keys_used: string[];  // e.g., ['1BR:B', '1BR:B', 'Studio:B']
  
  // Adjustments
  confidence_adjustment_total: number;
  vacancy_adjustment: number;
  
  // Validation
  kitchen_verified: KitchenVerification;
  egi_expected_delta_pct?: number;
  
  // Decision support
  dscr_rule: DSCRResult['dscr_rule'];
  dscr_value: number;
  
  // Human readable
  why: string;  // One-line explanation
  
  // Flags and review
  flags: string[];
  review_required: boolean;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

// Assumption codes must be versioned
export const ASSUMPTION_CODES = {
  // Legacy (to be deprecated)
  BED_PLURAL_ASSUME_1BR_UNIT_SCOPED_v1: 'Unit-scoped "bedrooms" assumed as 1BR',
  
  // Bedroom inference codes
  BED_PLURAL_EACH_HAVE_2BR_v1: 'Units each have bedrooms - assumed 2BR (HIGH confidence)',
  BED_PLURAL_SPACIOUS_2BR_v1: 'Spacious bedrooms - assumed 2BR (MEDIUM confidence)',
  BED_PLURAL_ASSUME_2BR_v1: 'Plural bedrooms - assumed 2BR (LOW confidence)',
  BED_SINGULAR_ASSUME_1BR_v1: 'Singular bedroom - assumed 1BR',
  BED_UNSPECIFIED_ASSUME_1BR_v1: 'Bedroom count unspecified - assumed 1BR',
  
  // Studio codes
  STUDIO_EXPLICIT_v1: 'Studio explicitly mentioned',
  DEFAULT_STUDIO_PATTERN_v1: 'Studio added based on pattern detection',
  
  // Default codes
  DEFAULT_EQUAL_DIST_v1: 'Equal distribution of remaining bedrooms',
  DEFAULT_CONSERVATIVE_v1: 'Conservative 1BR assumption',
  DEFAULT_PARTIAL_v1: 'Partial known units, rest defaulted',
  
  // LLM extraction codes
  LLM_STUDIO_EXPLICIT_v1: 'LLM identified studio explicitly',
  LLM_EXPLICIT_HIGH_CONFIDENCE_v1: 'LLM extraction with high confidence',
  LLM_EXPLICIT_WITH_AMBIGUITY_v1: 'LLM extraction with high confidence despite ambiguity',
  LLM_INFERRED_MEDIUM_CONFIDENCE_v1: 'LLM inferred with medium confidence',
  LLM_INFERRED_MEDIUM_AMBIGUITY_v1: 'LLM inferred with medium confidence (ambiguous)',
  LLM_INFERRED_LOW_CONFIDENCE_v1: 'LLM inferred with low confidence',
  LLM_INFERRED_LOW_AMBIGUITY_v1: 'LLM inferred with low confidence (ambiguous)'
} as const;

export type AssumptionCode = keyof typeof ASSUMPTION_CODES;