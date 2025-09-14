/**
 * Heuristic Inferrer - Pass B of Two-Pass Extraction System
 * 
 * Applies carefully scoped heuristics to infer unit mix when not explicit.
 * CRITICAL: Only infers when unit reference is explicit (1st, 2nd, unit 1, etc.)
 * 
 * Confidence levels:
 * - HIGH: Studio explicitly mentioned (even in heuristic pass)
 * - MEDIUM: Bedroom(s) without count, inferred as 1BR
 * - LOW: Not used in this pass (reserved for defaults)
 */

import { UnitType, ASSUMPTION_CODES } from '../../../shared/types/extraction';
import { EXTRACTION_PATTERNS, normalizeUnitRef } from './regex-patterns';

/**
 * Perform heuristic inference on MLS text
 * @param text - The MLS description text (capped at 10000 chars)
 * @param strictResults - Results from strict extraction to avoid duplicates
 * @returns Array of inferred units with MEDIUM/HIGH confidence
 */
export function heuristicInference(text: string, strictResults: UnitType[]): UnitType[] {
  const results: UnitType[] = [];
  
  // Cap input length for determinism
  const MAX_INPUT_LENGTH = 10000;
  const cappedText = text.substring(0, MAX_INPUT_LENGTH);
  
  console.log('[HEURISTIC] Starting heuristic inference');
  console.log('[HEURISTIC] Input text length:', text.length);
  console.log('[HEURISTIC] Strict results count:', strictResults.length);
  
  // Track which units we've already found (from strict pass)
  const usedUnitIds = new Set(strictResults.map(u => u.unit_id));
  console.log('[HEURISTIC] Already found units:', Array.from(usedUnitIds));
  
  // Pass 1: Studio detection (HIGH confidence even in heuristic)
  const studioResults = detectStudios(cappedText, usedUnitIds);
  results.push(...studioResults);
  console.log('[HEURISTIC] Studio detection found', studioResults.length, 'units');
  
  // Update used units
  studioResults.forEach(u => usedUnitIds.add(u.unit_id));
  
  // Pass 2: Bedroom inference (MEDIUM confidence)
  const bedroomResults = inferBedrooms(cappedText, usedUnitIds);
  results.push(...bedroomResults);
  console.log('[HEURISTIC] Bedroom inference found', bedroomResults.length, 'units');
  
  console.log('[HEURISTIC] Total heuristic results:', results.length);
  
  // CRITICAL FIX: Combine strict and heuristic results before returning
  // This was the bug - we were dropping strict results!
  const combined = combineResults(strictResults, results);
  console.log('[HEURISTIC] Combined strict + heuristic:', combined.length, 'units');
  return combined;
}

/**
 * Detect studios with unit-scoped references
 * Studios are HIGH confidence even when inferred
 */
function detectStudios(text: string, usedUnitIds: Set<string>): UnitType[] {
  const results: UnitType[] = [];
  
  // Reset regex state
  EXTRACTION_PATTERNS.unit_studio.lastIndex = 0;
  
  // Find unit-scoped studio mentions
  const matches = [...text.matchAll(EXTRACTION_PATTERNS.unit_studio)];
  
  console.log('[HEURISTIC] detectStudios found', matches.length, 'studio pattern matches');
  
  for (const match of matches) {
    const unitRef = match[1];  // "1st", "3rd", etc.
    const unit_id = normalizeUnitRef(unitRef);
    console.log('[HEURISTIC] Studio unit ref:', unitRef, '->', unit_id);
    
    // Skip if we already have this unit from strict pass
    if (usedUnitIds.has(unit_id)) {
      console.log(`[HEURISTIC] Unit ${unit_id} already found in strict pass, skipping heuristic`);
      continue;
    }
    
    // Create studio unit with HIGH confidence
    const unit: UnitType = {
      unit_id,
      beds: 0,
      label: 'Studio',
      confidence: 'HIGH',  // Studios are always HIGH confidence
      source: 'INFERRED',
      citation: match[0].substring(0, 200)
    };
    
    results.push(unit);
  }
  
  return results;
}

/**
 * Infer bedroom count from unit-scoped "bedroom(s)" without explicit count
 * Uses tiered confidence based on context clues
 */
function inferBedrooms(text: string, usedUnitIds: Set<string>): UnitType[] {
  const results: UnitType[] = [];
  
  // Reset regex state
  EXTRACTION_PATTERNS.unit_bedroom.lastIndex = 0;
  
  // Find unit-scoped bedroom mentions without explicit count
  const matches = [...text.matchAll(EXTRACTION_PATTERNS.unit_bedroom)];
  
  console.log('[HEURISTIC] inferBedrooms found', matches.length, 'bedroom pattern matches');
  
  // Special case: "1st and 2nd unit features bedrooms"
  // Need to extract both units from combined references
  for (const match of matches) {
    const fullMatch = match[0];
    console.log('[HEURISTIC] Processing bedroom match:', fullMatch);
    const unitRefs = extractMultipleUnitRefs(fullMatch);
    console.log('[HEURISTIC] Extracted unit refs:', unitRefs);
    
    for (const unitRef of unitRefs) {
      const unit_id = normalizeUnitRef(unitRef);
      console.log('[HEURISTIC] Processing unit ref:', unitRef, '->', unit_id);
      
      // Skip if already found
      if (usedUnitIds.has(unit_id)) {
        console.log(`[HEURISTIC] Unit ${unit_id} already found, skipping bedroom inference`);
        continue;
      }
      
      // Determine bedroom count and confidence based on context
      let beds: 0 | 1 | 2 = 1;
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      let assumption_code = 'BED_UNSPECIFIED_ASSUME_1BR_v1';
      
      // Check for plural indicators
      const contextWindow = fullMatch.toLowerCase();
      const hasPlural = /bedrooms/i.test(contextWindow);
      const hasSpacious = /spacious/i.test(contextWindow);
      const hasEachHave = /each\s+(have|has|feature)/i.test(contextWindow);
      const hasMultiple = /multiple|several/i.test(contextWindow);
      
      if (hasPlural) {
        // Plural "bedrooms" - likely 2BR
        if (hasEachHave || hasMultiple) {
          // Strong evidence for 2BR
          beds = 2;
          confidence = 'HIGH';
          assumption_code = 'BED_PLURAL_EACH_HAVE_2BR_v1';
        } else if (hasSpacious) {
          // Moderate evidence for 2BR
          beds = 2;
          confidence = 'MEDIUM';
          assumption_code = 'BED_PLURAL_SPACIOUS_2BR_v1';
        } else {
          // Weak evidence - could be 1BR or 2BR
          beds = 2;
          confidence = 'LOW';
          assumption_code = 'BED_PLURAL_ASSUME_2BR_v1';
        }
      } else {
        // Singular "bedroom" or ambiguous
        beds = 1;
        confidence = 'MEDIUM';
        assumption_code = 'BED_SINGULAR_ASSUME_1BR_v1';
      }
      
      // Create unit with appropriate confidence
      const unit: UnitType = {
        unit_id,
        beds,
        label: beds === 0 ? 'Studio' : `${beds}BR` as UnitType['label'],
        confidence,
        source: 'INFERRED',
        assumption_code,
        citation: match[0].substring(0, 200)
      };
      
      results.push(unit);
      usedUnitIds.add(unit_id);  // Mark as used to avoid duplicates within this pass
    }
  }
  
  return results;
}

/**
 * Extract multiple unit references from combined text
 * Handles cases like "1st and 2nd unit" or "first, second, and third floor"
 */
function extractMultipleUnitRefs(text: string): string[] {
  const refs: string[] = [];
  
  // Pattern for individual unit references
  const unitPattern = /\b(1st|first|2nd|second|3rd|third|4th|fourth|unit\s*\d+)\b/gi;
  
  let match;
  while ((match = unitPattern.exec(text)) !== null) {
    refs.push(match[1]);
  }
  
  return refs;
}

/**
 * Validate heuristic results
 */
export function validateHeuristicResults(units: UnitType[]): string[] {
  const errors: string[] = [];
  
  for (const unit of units) {
    // Check source is INFERRED
    if (unit.source !== 'INFERRED') {
      errors.push(`Heuristic unit ${unit.unit_id} has wrong source: ${unit.source}`);
    }
    
    // Check confidence levels
    if (unit.label === 'Studio' && unit.confidence !== 'HIGH') {
      errors.push(`Studio ${unit.unit_id} should have HIGH confidence, has ${unit.confidence}`);
    }
    
    // Check assumption codes for MEDIUM confidence
    if (unit.confidence === 'MEDIUM' && !unit.assumption_code) {
      errors.push(`Unit ${unit.unit_id} with MEDIUM confidence missing assumption_code`);
    }
    
    // Validate assumption codes
    if (unit.assumption_code && !ASSUMPTION_CODES[unit.assumption_code as keyof typeof ASSUMPTION_CODES]) {
      errors.push(`Unit ${unit.unit_id} has invalid assumption_code: ${unit.assumption_code}`);
    }
    
    // Check citation exists
    if (!unit.citation) {
      errors.push(`Heuristic unit ${unit.unit_id} missing citation`);
    }
  }
  
  return errors;
}

/**
 * Combine strict and heuristic results
 * Strict results take precedence over heuristic
 */
export function combineResults(strict: UnitType[], heuristic: UnitType[]): UnitType[] {
  // Start with all strict results
  const combined = [...strict];
  const usedUnitIds = new Set(strict.map(u => u.unit_id));
  
  // Add heuristic results that don't conflict
  for (const unit of heuristic) {
    if (!usedUnitIds.has(unit.unit_id)) {
      combined.push(unit);
      usedUnitIds.add(unit.unit_id);
    }
  }
  
  // Sort by unit_id for consistent ordering
  combined.sort((a, b) => a.unit_id.localeCompare(b.unit_id));
  
  return combined;
}