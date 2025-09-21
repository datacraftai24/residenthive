/**
 * Shared utilities for validation
 */

/**
 * Calculate days between date and now
 * Returns 999 for invalid dates to signal staleness
 */
export function daysSince(dateStr: string | undefined | null): number {
  if (!dateStr) return 999;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 999;
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return 999;
  }
}

/**
 * Safe date parsing to ISO string
 */
export function parseToISO(dateStr: string | undefined | null): string | undefined {
  if (!dateStr) return undefined;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;
    return date.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Check if value was coerced from string
 */
export function wasCoerced(original: any, coerced: number): boolean {
  return typeof original === 'string' && !isNaN(coerced);
}

/**
 * Validate monotonicity of financial scenarios
 * Returns array of violation descriptions
 */
export function validateMonotonicity(scenarios: Array<{
  downPayment: number;
  loanAmount: number;
  monthlyPayment: number;
}>): string[] {
  const violations: string[] = [];
  
  // Sort by down payment
  const sorted = [...scenarios].sort((a, b) => a.downPayment - b.downPayment);
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    if (curr.loanAmount >= prev.loanAmount) {
      violations.push(`DP ${curr.downPayment} has higher loan than DP ${prev.downPayment}`);
    }
    
    if (curr.monthlyPayment >= prev.monthlyPayment) {
      violations.push(`DP ${curr.downPayment} has higher payment than DP ${prev.downPayment}`);
    }
  }
  
  return violations;
}

/**
 * Validate P&I calculation
 * Returns true if payment is within tolerance
 */
export function validatePayment(
  monthlyPayment: number,
  loanAmount: number,
  interestRate: number,
  termMonths: number,
  tolerance: number = 50
): boolean {
  if (!loanAmount || !interestRate || !termMonths) return true; // Skip if missing inputs
  
  const monthlyRate = interestRate / 12;
  const expectedPayment = loanAmount * 
    (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);
  
  return Math.abs(monthlyPayment - expectedPayment) <= tolerance;
}

/**
 * Calculate distance between two lat/lng points in miles
 */
export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format error codes for logging
 */
export function formatErrorCodes(codes: string[]): string {
  return codes.filter(Boolean).join(',');
}

/**
 * Extract unique error codes from multiple analyses
 */
export function aggregateErrorCodes(items: Array<{ error_code?: string; error_codes?: string }>): string[] {
  const codes = new Set<string>();
  
  for (const item of items) {
    if (item.error_code) codes.add(item.error_code);
    if (item.error_codes) {
      item.error_codes.split(',').forEach(c => codes.add(c.trim()));
    }
  }
  
  return Array.from(codes);
}