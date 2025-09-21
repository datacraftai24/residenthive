/**
 * Unit Mix Resolver - Core Decision Engine
 * 
 * Resolves final unit mix from strict/inferred results with smart defaults.
 * CRITICAL: Never overwrites known units (strict + high-confidence inferred)
 * 
 * Priority order:
 * 1. STRICT - All units explicitly stated
 * 2. INFERRED - High/medium confidence, unit count matches
 * 3. DEFAULT_PARTIAL - Some known units, fill remaining
 * 4. DEFAULT_CONSERVATIVE - All 1BR fallback
 */

import { UnitType, MixResolution } from '../../../shared/types/extraction';
import { combineResults } from './heuristic-inferrer';

/**
 * Helper to sum bedroom counts
 */
export function sumBeds(units: UnitType[]): number {
  return units.reduce((sum, u) => sum + u.beds, 0);
}

/**
 * Helper to safely create unit arrays (no aliasing bug)
 */
function makeUnits(n: number, template: Partial<UnitType>): UnitType[] {
  return Array.from({ length: n }, (_, i) => ({
    unit_id: template.unit_id || `U${i + 1}`,
    beds: template.beds || 1,
    label: template.label || '1BR',
    confidence: template.confidence || 'LOW',
    source: template.source || 'DEFAULT',
    assumption_code: template.assumption_code,
    citation: template.citation
  } as UnitType));
}

/**
 * Main resolution function - determines final unit mix
 */
export function resolveUnitMix(
  strict: UnitType[],
  inferred: UnitType[],
  units: number,
  totalBeds: number | undefined,
  text: string
): MixResolution {
  const flags: string[] = [];
  
  // Validate inputs
  if (units <= 0) {
    throw new Error(`Invalid unit count: ${units}`);
  }
  
  // Priority 1: STRICT wins if unit count matches
  if (strict.length === units) {
    const strictBeds = sumBeds(strict);
    
    // Check bedroom count if provided
    if (totalBeds !== undefined && strictBeds !== totalBeds) {
      flags.push('BEDROOM_COUNT_MISMATCH');
      console.warn(`Bedroom mismatch: strict=${strictBeds} vs stated=${totalBeds}`);
    }
    
    // Use strict if no totalBeds OR if it matches
    if (totalBeds === undefined || strictBeds === totalBeds) {
      console.log(`Using STRICT mix: ${strict.map(u => u.label).join(', ')}`);
      return {
        final_mix: strict,
        source: 'STRICT',
        review_required: false,
        flags
      };
    }
  }
  
  // Priority 2: INFERRED if confident and validated
  if (inferred.length === units) {
    const allConfident = inferred.every(u => u.confidence !== 'LOW');
    
    if (allConfident) {
      const inferredBeds = sumBeds(inferred);
      const avgBedsPerUnit = inferredBeds / units;
      
      // Validate average beds per unit
      if (avgBedsPerUnit > 2) {
        flags.push('AVG_BEDS_EXCEEDS_CAP');
        console.warn(`Average beds/unit ${avgBedsPerUnit} exceeds cap of 2`);
      }
      
      // Check bedroom count if provided
      if (totalBeds !== undefined && inferredBeds !== totalBeds) {
        flags.push('BEDROOM_COUNT_MISMATCH');
        console.warn(`Bedroom mismatch: inferred=${inferredBeds} vs stated=${totalBeds}`);
        
        // CRITICAL: If extracted beds exceed MLS total, we must reconcile
        if (inferredBeds > totalBeds) {
          console.log(`MLS RECONCILIATION: Extracted ${inferredBeds} beds but MLS shows ${totalBeds}`);
          
          // Preserve HIGH confidence units (especially studios)
          const highConfidence = inferred.filter(u => u.confidence === 'HIGH');
          const mediumConfidence = inferred.filter(u => u.confidence === 'MEDIUM');
          
          // Sort medium confidence units by beds (descending) for reduction
          mediumConfidence.sort((a, b) => b.beds - a.beds);
          
          // Start with high confidence units
          let adjustedMix = [...highConfidence];
          let currentBeds = sumBeds(highConfidence);
          
          // Add medium confidence units, reducing beds if needed
          for (const unit of mediumConfidence) {
            const remainingBeds = totalBeds - currentBeds;
            const remainingSlots = units - adjustedMix.length;
            
            if (remainingSlots > 0) {
              // Adjust unit if it would exceed total
              if (currentBeds + unit.beds > totalBeds) {
                const maxBedsForUnit = Math.max(0, Math.min(remainingBeds, 2));
                const adjustedUnit = {
                  ...unit,
                  beds: maxBedsForUnit as 0 | 1 | 2,
                  label: maxBedsForUnit === 0 ? 'Studio' : `${maxBedsForUnit}BR` as UnitType['label'],
                  confidence: 'MEDIUM' as const,
                  assumption_code: 'MLS_RECONCILED_v1',
                  citation: `Adjusted from ${unit.label} to match MLS total of ${totalBeds} beds`
                };
                adjustedMix.push(adjustedUnit);
                currentBeds += maxBedsForUnit;
              } else {
                adjustedMix.push(unit);
                currentBeds += unit.beds;
              }
            }
          }
          
          flags.push('MLS_RECONCILED', 'REVIEW_REQUIRED');
          console.log(`MLS Reconciled mix: ${adjustedMix.map(u => u.label).join(', ')} = ${sumBeds(adjustedMix)} beds`);
          
          return {
            final_mix: adjustedMix,
            source: 'INFERRED_MLS_RECONCILED',
            review_required: true,
            flags
          };
        }
      }
      
      // Use inferred if validation passes
      if (avgBedsPerUnit <= 2 && (totalBeds === undefined || inferredBeds === totalBeds)) {
        flags.push('INFERRED_MIX_USED');
        console.log(`Using INFERRED mix: ${inferred.map(u => u.label).join(', ')}`);
        return {
          final_mix: inferred,
          source: 'INFERRED',
          review_required: false,
          flags
        };
      }
    }
  }
  
  // Priority 2.5: Partial HIGH confidence - preserve what we found
  // This is CRITICAL for cases where we have HIGH confidence units but not all units
  const highConfidenceInferred = inferred.filter(u => u.confidence === 'HIGH');
  if (highConfidenceInferred.length > 0 && highConfidenceInferred.length < units) {
    console.log(`Found ${highConfidenceInferred.length} HIGH confidence units out of ${units} total`);
    console.log(`HIGH confidence units: ${highConfidenceInferred.map(u => u.label).join(', ')}`);
    flags.push('PARTIAL_HIGH_CONFIDENCE');
    // Continue to smart defaults, which will preserve these units
  }
  
  // Priority 3: Smart defaults with known units honored
  // Combine all HIGH confidence units (strict + high-confidence inferred)
  // ALSO include MEDIUM confidence if they have strong evidence
  const known = [
    ...strict,
    ...inferred.filter(i => i.confidence === 'HIGH' || 
                           (i.confidence === 'MEDIUM' && i.citation && i.citation.length > 20))
  ];
  
  // Dedupe known units by unit_id
  const knownMap = new Map<string, UnitType>();
  for (const unit of known) {
    if (!knownMap.has(unit.unit_id) || unit.source === 'STRICT') {
      // Prefer STRICT over INFERRED for same unit_id
      knownMap.set(unit.unit_id, unit);
    }
  }
  const knownUnique = Array.from(knownMap.values());
  
  // Log preserved units for transparency
  if (knownUnique.length > 0) {
    console.log(`Preserving ${knownUnique.length} known units: ${knownUnique.map(u => `${u.unit_id}:${u.label}`).join(', ')}`);
  }
  
  // Check for studio cue
  const hasStudioCue = knownUnique.some(u => u.label === 'Studio') || 
                       /\bstudio\b/i.test(text);
  
  return applySmartDefaults(units, totalBeds, knownUnique, hasStudioCue, text, flags);
}

/**
 * Apply smart defaults for remaining units
 * CRITICAL: Never overwrites known units
 */
function applySmartDefaults(
  units: number,
  totalBeds: number | undefined,
  known: UnitType[],
  hasStudioCue: boolean,
  text: string,
  flags: string[]
): MixResolution {
  
  // Start with known units (immutable)
  const final_mix = [...known];
  const remaining_slots = units - known.length;
  
  if (remaining_slots <= 0) {
    // All units known
    console.log(`All ${units} units known from extraction`);
    return {
      final_mix: known,
      source: 'KNOWN_COMPLETE',
      review_required: false,
      flags
    };
  }
  
  // Try to equalize unknowns if totalBeds provided
  if (totalBeds !== undefined) {
    const knownBeds = sumBeds(known);
    const remainingBeds = totalBeds - knownBeds;
    
    if (remainingBeds >= 0 && remainingBeds % remaining_slots === 0) {
      const bedsPerUnit = remainingBeds / remaining_slots;
      
      if (bedsPerUnit <= 2) {
        // Valid equalization
        const label = bedsPerUnit === 0 ? 'Studio' : `${bedsPerUnit}BR` as UnitType['label'];
        
        for (let i = 0; i < remaining_slots; i++) {
          final_mix.push({
            unit_id: `U${known.length + i + 1}`,
            beds: bedsPerUnit as 0 | 1 | 2,
            label,
            confidence: 'LOW',
            source: 'DEFAULT',
            assumption_code: 'DEFAULT_EQUAL_DIST_v1',
            citation: `Equalized ${remainingBeds} beds across ${remaining_slots} units`
          });
        }
        
        flags.push('DEFAULT_PARTIAL', 'REVIEW_REQUIRED', 'PARTIAL_EQUALIZATION');
        console.log(`Applied equalization: ${remaining_slots} units @ ${bedsPerUnit}BR each`);
        
        return {
          final_mix,
          source: 'DEFAULT_PARTIAL',
          review_required: true,
          flags
        };
      }
    }
  }
  
  // Studio pattern for 3-units with studio cue
  if (units === 3 && hasStudioCue && remaining_slots > 0) {
    // Check if we already have a studio
    const hasStudio = known.some(u => u.label === 'Studio');
    
    if (!hasStudio) {
      // Add studio first
      final_mix.push({
        unit_id: `U${known.length + 1}`,
        beds: 0,
        label: 'Studio',
        confidence: 'LOW',
        source: 'DEFAULT',
        assumption_code: 'DEFAULT_STUDIO_PATTERN_v1',
        citation: 'Studio cue detected in text'
      });
    }
    
    // Fill remaining with 1BR
    const toAdd = units - final_mix.length;
    for (let i = 0; i < toAdd; i++) {
      final_mix.push({
        unit_id: `U${final_mix.length + 1}`,
        beds: 1,
        label: '1BR',
        confidence: 'LOW',
        source: 'DEFAULT',
        assumption_code: 'DEFAULT_CONSERVATIVE_v1'
      });
    }
    
    flags.push('DEFAULT_STUDIO_PATTERN', 'REVIEW_REQUIRED', 'STUDIO_CUE_HONORED');
    console.log(`Applied studio pattern for 3-unit property`);
    
    return {
      final_mix,
      source: 'DEFAULT_PARTIAL',
      review_required: true,
      flags
    };
  }
  
  // Conservative fallback: fill remaining with 1BR
  // But log what we're doing clearly
  const preservedInfo = known.length > 0 
    ? ` (preserving ${known.length} extracted: ${known.map(u => u.label).join(', ')})` 
    : '';
    
  for (let i = 0; i < remaining_slots; i++) {
    final_mix.push({
      unit_id: `U${known.length + i + 1}`,
      beds: 1,
      label: '1BR',
      confidence: 'LOW',
      source: 'DEFAULT',
      assumption_code: 'DEFAULT_CONSERVATIVE_v1',
      citation: 'Conservative 1BR assumption for unknown unit'
    });
  }
  
  const defaultType = known.length > 0 ? 'DEFAULT_PARTIAL' : 'DEFAULT_CONSERVATIVE';
  flags.push(defaultType, 'REVIEW_REQUIRED', 'CONSERVATIVE_FALLBACK');
  console.log(`Applied conservative default: ${remaining_slots} units as 1BR${preservedInfo}`);
  
  return {
    final_mix,
    source: 'DEFAULT_CONSERVATIVE',
    review_required: true,
    flags
  };
}

/**
 * Validate mix resolution
 */
export function validateMixResolution(
  resolution: MixResolution,
  units: number,
  totalBeds?: number
): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // CRITICAL: Unit count must match
  if (resolution.final_mix.length !== units) {
    errors.push(`Unit count mismatch: expected ${units}, got ${resolution.final_mix.length}`);
  }
  
  // Check for duplicate unit IDs
  const unitIds = resolution.final_mix.map(u => u.unit_id);
  const uniqueIds = new Set(unitIds);
  if (unitIds.length !== uniqueIds.size) {
    errors.push('Duplicate unit IDs in final mix');
  }
  
  // Validate bedroom count if provided
  if (totalBeds !== undefined) {
    const mixBeds = sumBeds(resolution.final_mix);
    if (mixBeds !== totalBeds) {
      warnings.push(`Bedroom count mismatch: mix has ${mixBeds}, stated ${totalBeds}`);
    }
  }
  
  // Check assumption codes for non-HIGH confidence
  for (const unit of resolution.final_mix) {
    if (unit.confidence !== 'HIGH' && unit.source === 'INFERRED' && !unit.assumption_code) {
      warnings.push(`Unit ${unit.unit_id} missing assumption_code`);
    }
  }
  
  // Return both errors and warnings
  return [...errors, ...warnings];
}