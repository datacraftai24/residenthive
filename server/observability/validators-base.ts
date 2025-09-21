/**
 * Base validator utilities shared across all validators
 */

import { z } from 'zod';
import { ValidateResult } from './withSpan.js';
import { ObservabilityConfig, ErrorCode } from './config.js';

// Property type enum - standardized across system
export const PROPERTY_TYPES = [
  'SINGLE-FAMILY',
  'MULTI-FAMILY', 
  'CONDO',
  'TOWNHOUSE',
  'DUPLEX',
  '3-FAMILY',
  '4-FAMILY',
  'LAND',
  'COMMERCIAL'
] as const;

// Multi-family types that require unit count
export const MULTI_FAMILY_TYPES = ['MULTI-FAMILY', 'DUPLEX', '3-FAMILY', '4-FAMILY'];

// Status taxonomy - the ONLY statuses we emit
export type AgentStatus = 'ok' | 'missing_fields' | 'no_match' | 'calc_error' | 'tool_error' | 'invalid_type';

/**
 * Extract missing field paths from Zod errors
 */
export function extractMissingFields(error: z.ZodError): string[] {
  return error.issues
    .filter(i => 
      i.code === 'invalid_type' || 
      i.code === 'too_small' || 
      i.code === 'too_big' || 
      i.code === 'invalid_enum_value' || 
      i.code === 'invalid_string' ||
      i.code === 'invalid_url'
    )
    .map(i => i.path.join('.'));
}

/**
 * Determine status from Zod error
 */
export function getStatusFromError(error: z.ZodError): AgentStatus {
  if (error.issues.some(i => i.code === 'invalid_type')) {
    return 'invalid_type';
  }
  return 'missing_fields';
}

/**
 * Grounding calculations for different agent types
 */
export function calculateMarketGroundedRate(facts: any[]): number {
  if (!facts || facts.length === 0) return 0;
  
  const grounded = facts.filter(f => 
    f.source_id && 
    f.as_of && 
    new Date(f.as_of).getTime() > 0
  ).length;
  
  return grounded / facts.length;
}

export function calculateFinancialGroundedRate(analyses: any[]): number {
  if (!analyses || analyses.length === 0) return 0;
  
  const valid = analyses.filter(a => 
    a.scenarios?.length > 0 &&
    !a.calc_error &&
    a.scenarios.every((s: any) => 
      typeof s.monthlyCashFlow === 'number' &&
      !isNaN(s.monthlyCashFlow) &&
      isFinite(s.monthlyCashFlow)
    )
  ).length;
  
  return valid / analyses.length;
}
