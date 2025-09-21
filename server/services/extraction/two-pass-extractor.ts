/**
 * Two-Pass Extraction Orchestrator
 * 
 * Main entry point for the extraction system.
 * Coordinates strict extraction, heuristic inference, and mix resolution.
 */

import { ExtractionResult, UnitType } from '../../../shared/types/extraction';
import { 
  strictExtraction, 
  extractTotalBedrooms, 
  extractTotalUnits,
  validateStrictResults 
} from './strict-extractor';
import { 
  heuristicInference, 
  combineResults,
  validateHeuristicResults 
} from './heuristic-inferrer';
import { 
  resolveUnitMix, 
  validateMixResolution 
} from './unit-mix-resolver';
import {
  llmExtractUnits,
  validateLLMExtraction
} from './llm-extractor';
import { validateForUnderwriting } from './underwriting-validator';

/**
 * Main extraction function - orchestrates the two-pass system (now three-pass with LLM)
 */
export async function extractUnits(
  mlsData: {
    description?: string;
    remarks?: string;
    propertyType?: string;
    style?: string;
    bedrooms?: number;
    bathrooms?: number;
    units?: number;
  },
  useLLM: boolean = true  // Feature flag for LLM extraction
): Promise<ExtractionResult> {
  
  // Prepare text for extraction
  const text = prepareText(mlsData);
  
  // Determine unit count
  const units = mlsData.units || 
                extractTotalUnits(mlsData.propertyType || '', mlsData.style) ||
                1;  // Default to single family
  
  // Extract total bedrooms if stated
  const totalBeds = mlsData.bedrooms || extractTotalBedrooms(text);
  
  // Pass A: Strict extraction
  console.log(`\n=== PASS A: Strict Extraction ===`);
  const strictResults = strictExtraction(text);
  console.log(`Found ${strictResults.length} explicit units`);
  
  // Validate strict results
  const strictErrors = validateStrictResults(strictResults);
  if (strictErrors.length > 0) {
    console.error('Strict extraction validation errors:', strictErrors);
  }
  
  // Pass B: Heuristic inference
  console.log(`\n=== PASS B: Heuristic Inference ===`);
  const heuristicResults = heuristicInference(text, strictResults);
  console.log(`Inferred ${heuristicResults.length} additional units`);
  
  // Validate heuristic results
  const heuristicErrors = validateHeuristicResults(heuristicResults);
  if (heuristicErrors.length > 0) {
    console.error('Heuristic inference validation errors:', heuristicErrors);
  }
  
  // Combine results (strict takes precedence)
  let combined = combineResults(strictResults, heuristicResults);
  console.log(`Combined: ${combined.length} units from both passes`);
  
  // Pass C: LLM extraction (optional, when regex passes are insufficient)
  if (useLLM && combined.length < units) {
    console.log(`\n=== PASS C: LLM Extraction ===`);
    console.log(`Regex passes found ${combined.length}/${units} units, trying LLM...`);
    
    const llmResults = await llmExtractUnits(text, mlsData);
    if (llmResults) {
      const llmValidation = validateLLMExtraction(llmResults, mlsData);
      if (llmValidation.valid) {
        console.log(`LLM extracted ${llmResults.length} units successfully`);
        // Merge LLM results with existing (prefer existing HIGH confidence)
        const highConfidence = combined.filter(u => u.confidence === 'HIGH');
        const llmFiltered = llmResults.filter(llm => 
          !highConfidence.some(hc => hc.unit_id === llm.unit_id)
        );
        combined = combineResults(highConfidence, llmFiltered);
        console.log(`After LLM merge: ${combined.length} units`);
      } else {
        console.warn('LLM extraction validation failed:', llmValidation.issues);
      }
    } else {
      console.log('LLM extraction not available or failed');
    }
  }
  
  // Resolve final mix
  console.log(`\n=== MIX RESOLUTION ===`);
  console.log(`Target: ${units} units, ${totalBeds || 'unknown'} total bedrooms`);
  const mixResolution = resolveUnitMix(
    strictResults,
    combined,  // Use combined (may include LLM) for inference check
    units,
    totalBeds,
    text
  );
  
  // Validate resolution
  const resolutionErrors = validateMixResolution(mixResolution, units, totalBeds);
  if (resolutionErrors.length > 0) {
    console.warn('Mix resolution issues:', resolutionErrors);
  }
  
  // Apply underwriting validation for conservative assumptions
  const underwritingValidation = validateForUnderwriting(mixResolution);
  if (!underwritingValidation.passed) {
    console.warn(`⚠️ [Underwriting] Failed with score ${underwritingValidation.conservativeScore}`);
    console.warn(`[Underwriting] Flags: ${underwritingValidation.flags.join(', ')}`);
    
    // Use conservative adjustments if validation failed
    if (underwritingValidation.adjustments.length > 0) {
      console.log('[Underwriting] Applying conservative adjustments');
      mixResolution.final_mix = underwritingValidation.adjustments;
      mixResolution.flags.push('UNDERWRITING_ADJUSTED');
      mixResolution.review_required = true;
    }
  } else {
    console.log(`✅ [Underwriting] Passed with score ${underwritingValidation.conservativeScore}`);
  }
  
  // Log final result
  console.log(`\n=== FINAL RESULT ===`);
  console.log(`Source: ${mixResolution.source}`);
  console.log(`Mix: ${mixResolution.final_mix.map(u => `${u.unit_id}:${u.label}`).join(', ')}`);
  console.log(`Review Required: ${mixResolution.review_required}`);
  if (mixResolution.flags.length > 0) {
    console.log(`Flags: ${mixResolution.flags.join(', ')}`);
  }
  
  // Build result
  const result: ExtractionResult = {
    units,
    totalBeds,
    unit_breakdown_strict: strictResults,
    unit_breakdown_inferred: heuristicResults,
    mix_resolution: mixResolution
  };
  
  return result;
}

/**
 * Prepare text from MLS data for extraction
 */
function prepareText(mlsData: any): string {
  const parts: string[] = [];
  
  // Log what fields are available
  console.log('[PREPARE_TEXT] MLS Data fields:');
  console.log('  - address:', mlsData.address || 'MISSING');
  console.log('  - mlsNumber:', mlsData.mlsNumber || 'MISSING');
  console.log('  - description:', mlsData.description ? `${mlsData.description.length} chars` : 'MISSING');
  console.log('  - remarks:', mlsData.remarks ? `${mlsData.remarks.length} chars` : 'MISSING');
  console.log('  - propertyType:', mlsData.propertyType || 'MISSING');
  console.log('  - style:', mlsData.style || 'MISSING');
  console.log('  - units:', mlsData.units);
  console.log('  - bedrooms:', mlsData.bedrooms);
  
  // Add description
  if (mlsData.description) {
    parts.push(mlsData.description);
  }
  
  // Add remarks
  if (mlsData.remarks) {
    parts.push(mlsData.remarks);
  }
  
  // Add property type info
  if (mlsData.propertyType) {
    parts.push(`Property Type: ${mlsData.propertyType}`);
  }
  
  if (mlsData.style) {
    parts.push(`Style: ${mlsData.style}`);
  }
  
  // Join with space
  const text = parts.join(' ');
  
  console.log('  - Final text length:', text.length);
  if (text.length === 0) {
    console.error('[PREPARE_TEXT] WARNING: No text extracted from MLS data!');
  }
  
  // Cap at 10000 chars for determinism
  const MAX_LENGTH = 10000;
  return text.substring(0, MAX_LENGTH);
}

/**
 * Extract units for 17 Thenius St scenario
 */
export async function extract17Thenius(): Promise<ExtractionResult> {
  const mlsData = {
    propertyType: '3 Family',
    style: '3 Family',
    bedrooms: 3,
    bathrooms: 3,
    units: 3,
    description: `Rare investment opportunity! This versatile 3-family property in a strong Worcester rental market offers excellent income potential and long-term growth. 1st and 2nd unit features spacious bedrooms, living area and eat-in kitchens, the 3rd unit is a spacious studio with hardwood, and skylights, basement laundry hookups for tenant convenience. Recent updates include new windows, newer roof, and a rebuilt chimney with stainless steel liner, reducing maintenance costs.`
  };
  
  return extractUnits(mlsData);
}

/**
 * Quick test function
 */
export async function testExtraction(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('TESTING 17 THENIUS ST EXTRACTION');
  console.log('='.repeat(80));
  
  const result = await extract17Thenius();
  
  console.log('\n' + '='.repeat(80));
  console.log('EXTRACTION COMPLETE');
  console.log('='.repeat(80));
  
  // Expected result for 17 Thenius:
  // - Unit 1: 2BR (MEDIUM confidence, inferred from "1st...features spacious bedrooms")
  // - Unit 2: 2BR (MEDIUM confidence, inferred from "2nd...features spacious bedrooms")  
  // - Unit 3: Studio (HIGH confidence, explicit "3rd unit is a spacious studio")
  
  const expected = ['2BR', '2BR', 'Studio'];
  const actual = result.mix_resolution.final_mix.map(u => u.label);
  
  if (JSON.stringify(expected) === JSON.stringify(actual)) {
    console.log('✅ TEST PASSED: Correctly identified 2×2BR + Studio');
  } else {
    console.error('❌ TEST FAILED: Expected', expected, 'but got', actual);
  }
}