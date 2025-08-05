/**
 * Search Query Normalizer
 * 
 * Centralizes all query normalization logic for Repliers API
 * to avoid the issues that cause 0 search results
 */

import { convertStateToAbbreviation } from './state-converter';

/**
 * Normalize property type terms that cause issues with Repliers API
 * @param query - Query text containing property types
 * @returns Query with normalized property types
 */
export function normalizePropertyType(query: string): string {
  if (!query) return query;
  
  let result = query;
  
  // "single-family home" or "single family home" -> "home"
  result = result.replace(/\bsingle[\s-]?family\s+home(s)?\b/gi, 'home$1');
  
  // If it's just "single-family" or "single family" without "home", remove it entirely
  // This handles cases like "single-family residence" -> "residence"
  result = result.replace(/\bsingle[\s-]?family\s+/gi, '');
  
  // "Single Family Residence" -> remove entirely (known to return 0 results)
  result = result.replace(/\bsingle\s+family\s+residence\b/gi, '');
  
  return result;
}

/**
 * Complete query normalization pipeline
 * Applies all necessary transformations to avoid 0 search results
 * @param query - Raw search query
 * @returns Normalized query ready for Repliers API
 */
export function normalizeSearchQuery(query: string): string {
  if (!query) return query;
  
  // Apply transformations in order
  let result = query;
  
  // 1. Convert state names to abbreviations
  result = convertStateToAbbreviation(result);
  
  // 2. Normalize property types
  result = normalizePropertyType(result);
  
  // 3. Clean up any double spaces
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

/**
 * Check if a query needs normalization
 * @param query - Query to check
 * @returns true if query contains problematic terms
 */
export function needsNormalization(query: string): boolean {
  if (!query) return false;
  
  // Check for full state names
  const stateNames = ['Massachusetts', 'New York', 'California', 'Texas', 'Florida'];
  for (const state of stateNames) {
    if (query.includes(state)) return true;
  }
  
  // Check for problematic property types
  if (/single[\s-]?family/i.test(query)) return true;
  
  return false;
}