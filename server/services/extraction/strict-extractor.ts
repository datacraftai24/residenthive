/**
 * Strict Extractor - Pass A of Two-Pass Extraction System
 * 
 * Extracts ONLY explicit facts with direct citations.
 * No inference, no assumptions - just facts stated in the text.
 * 
 * HIGH confidence only - these are the anchors of truth.
 */

import { UnitType } from '../../../shared/types/extraction';
import { EXTRACTION_PATTERNS, normalizeUnitRef } from './regex-patterns';

/**
 * Perform strict extraction on MLS text
 * @param text - The MLS description text (capped at 10000 chars for determinism)
 * @returns Array of units with HIGH confidence explicit facts only
 */
export function strictExtraction(text: string): UnitType[] {
  const results: UnitType[] = [];
  
  // Cap input length for determinism
  const MAX_INPUT_LENGTH = 10000;
  const cappedText = text.substring(0, MAX_INPUT_LENGTH);
  
  // Reset regex state (critical for determinism)
  EXTRACTION_PATTERNS.unit_explicit.lastIndex = 0;
  
  // Find all unit-scoped explicit bedroom counts or studios
  const matches = [...cappedText.matchAll(EXTRACTION_PATTERNS.unit_explicit)];
  
  for (const match of matches) {
    // Use named groups from the regex pattern
    const unitRef = match.groups?.unit_ref || match[1];  // "1st", "unit 1", etc.
    const typeText = match.groups?.type || match[2];  // "studio", "2 bedrooms", etc.
    const bedroomCount = match.groups?.bedrooms || match[3];  // Captured digit if present
    
    // Normalize unit reference to canonical ID
    const unit_id = normalizeUnitRef(unitRef);
    
    // Parse bedroom count and label
    let beds: 0 | 1 | 2 | 3 | 4;
    let label: UnitType['label'];
    
    if (/studio|efficiency/i.test(typeText)) {
      // Studio/efficiency explicitly mentioned
      beds = 0;
      label = 'Studio';
    } else if (bedroomCount) {
      // Explicit bedroom count
      const count = parseInt(bedroomCount);
      if (count >= 0 && count <= 4) {
        beds = count as 0 | 1 | 2 | 3 | 4;
        label = beds === 0 ? 'Studio' : `${beds}BR` as UnitType['label'];
      } else {
        // Skip if bedroom count is out of range
        console.warn(`Skipping out-of-range bedroom count: ${count}`);
        continue;
      }
    } else {
      // Should not happen with our regex, but be defensive
      console.warn(`Unexpected match without bedroom count: ${match[0]}`);
      continue;
    }
    
    // Create unit with HIGH confidence (it's explicit)
    const unit: UnitType = {
      unit_id,
      beds,
      label,
      confidence: 'HIGH',
      source: 'STRICT',
      citation: match[0].substring(0, 200)  // Cap citation length
    };
    
    results.push(unit);
  }
  
  // Deduplicate by unit_id (keep first occurrence)
  return dedupeUnits(results);
}

/**
 * Deduplicate units by unit_id
 * Keeps the first occurrence of each unit_id (highest confidence)
 */
export function dedupeUnits(units: UnitType[]): UnitType[] {
  const seen = new Set<string>();
  const deduped: UnitType[] = [];
  
  for (const unit of units) {
    if (!seen.has(unit.unit_id)) {
      seen.add(unit.unit_id);
      deduped.push(unit);
    } else {
      console.log(`Deduped unit ${unit.unit_id}: keeping first occurrence`);
    }
  }
  
  return deduped;
}

/**
 * Extract total bedroom count from text (if explicitly stated)
 */
export function extractTotalBedrooms(text: string): number | undefined {
  // Reset regex state
  EXTRACTION_PATTERNS.total_bedrooms.lastIndex = 0;
  
  const match = text.match(EXTRACTION_PATTERNS.total_bedrooms);
  if (match && match[1]) {
    const count = parseInt(match[1]);
    if (count >= 0 && count <= 20) {  // Sanity check
      return count;
    }
  }
  
  return undefined;
}

/**
 * Extract total unit count from property type
 */
export function extractTotalUnits(propertyType: string, style?: string): number | undefined {
  // Try property type first
  const typeNormalized = (propertyType || '').toLowerCase();
  
  // Check for explicit count (e.g., "3 Family", "4-unit")
  const countMatch = typeNormalized.match(/(\d+)[\\s-]*(?:family|unit)/);
  if (countMatch) {
    return parseInt(countMatch[1]);
  }
  
  // Check named types
  if (typeNormalized.includes('duplex')) return 2;
  if (typeNormalized.includes('triplex')) return 3;
  if (typeNormalized.includes('fourplex') || typeNormalized.includes('quadplex')) return 4;
  
  // Try style field if property type didn't work
  if (style) {
    const styleNormalized = style.toLowerCase();
    const styleMatch = styleNormalized.match(/(\d+)[\\s-]*(?:family|unit)/);
    if (styleMatch) {
      return parseInt(styleMatch[1]);
    }
    
    if (styleNormalized.includes('duplex')) return 2;
    if (styleNormalized.includes('triplex')) return 3;
    if (styleNormalized.includes('fourplex')) return 4;
  }
  
  // Single family indicators
  if (typeNormalized.includes('single') || typeNormalized.includes('sfr')) {
    return 1;
  }
  
  return undefined;
}

/**
 * Validate strict extraction results
 */
export function validateStrictResults(units: UnitType[]): string[] {
  const errors: string[] = [];
  
  // Check for duplicate unit IDs (should be prevented by deduping)
  const unitIds = units.map(u => u.unit_id);
  const uniqueIds = new Set(unitIds);
  if (unitIds.length !== uniqueIds.size) {
    errors.push('Duplicate unit IDs found after deduplication');
  }
  
  // Check for missing citations
  for (const unit of units) {
    if (!unit.citation) {
      errors.push(`Unit ${unit.unit_id} missing citation`);
    }
  }
  
  // All strict units must have HIGH confidence
  for (const unit of units) {
    if (unit.confidence !== 'HIGH') {
      errors.push(`Strict unit ${unit.unit_id} has non-HIGH confidence: ${unit.confidence}`);
    }
  }
  
  return errors;
}