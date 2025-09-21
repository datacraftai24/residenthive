/**
 * Extraction Adapter - Bridges two-pass extraction with existing strict extraction interface
 * 
 * This adapter allows us to seamlessly integrate the new two-pass extraction system
 * while maintaining backward compatibility with the existing StrictExtractionService interface.
 */

import { extractUnits } from './extraction/two-pass-extractor';
import { 
  StrictExtractionResult, 
  ExtractedFact, 
  ExtractedUnits, 
  UnitBreakdown 
} from './strict-extraction';
import { UnitType, ExtractionResult } from '../../shared/types/extraction';

/**
 * Enhanced extraction service that uses two-pass system internally
 * but maintains the same interface as StrictExtractionService
 */
export class EnhancedExtractionService {
  
  /**
   * Extract facts from MLS data using two-pass system (now three-pass with LLM)
   * Returns results in StrictExtractionResult format for compatibility
   */
  async extractFromMLS(mlsData: any): Promise<StrictExtractionResult> {
    // Use two-pass extraction for unit mix (now async with LLM support)
    const extractionResult = await extractUnits(mlsData);
    
    // Convert to StrictExtractionResult format
    const result: StrictExtractionResult = {
      // Basic property info (pass through from MLS data)
      mlsNumber: mlsData.mlsNumber ? {
        value: mlsData.mlsNumber,
        citation: `MLS#: ${mlsData.mlsNumber}`
      } : undefined,
      
      price: mlsData.listPrice ? {
        value: mlsData.listPrice,
        citation: `Listed at $${mlsData.listPrice.toLocaleString()}`
      } : undefined,
      
      address: mlsData.address ? {
        value: mlsData.address,
        citation: mlsData.address
      } : undefined,
      
      // Unit information from two-pass extraction
      units: this.convertUnitsToExtractedFormat(extractionResult),
      
      // Other property details
      taxes: mlsData.taxes ? {
        value: mlsData.taxes,
        citation: `Annual taxes: $${mlsData.taxes.toLocaleString()}`
      } : undefined,
      
      yearBuilt: mlsData.yearBuilt ? {
        value: mlsData.yearBuilt,
        citation: `Built in ${mlsData.yearBuilt}`
      } : undefined,
      
      totalBeds: extractionResult.totalBeds ? {
        value: extractionResult.totalBeds,
        citation: `${extractionResult.totalBeds} total bedrooms`
      } : undefined,
      
      totalBaths: mlsData.bathrooms ? {
        value: mlsData.bathrooms,
        citation: `${mlsData.bathrooms} bathrooms`
      } : undefined,
      
      sqft: mlsData.sqft ? {
        value: mlsData.sqft,
        citation: `${mlsData.sqft.toLocaleString()} sq ft`
      } : undefined,
      
      propertyType: mlsData.propertyType ? {
        value: mlsData.propertyType,
        citation: mlsData.propertyType
      } : undefined,
      
      // Store raw data for reference
      raw: mlsData
    };
    
    // Add telemetry for monitoring extraction quality
    this.logExtractionMetrics(extractionResult, result);
    
    return result;
  }
  
  /**
   * Convert two-pass extraction units to ExtractedUnits format
   */
  private convertUnitsToExtractedFormat(extraction: ExtractionResult): ExtractedUnits {
    const { units, mix_resolution } = extraction;
    
    // Determine overall confidence based on resolution source
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    switch (mix_resolution.source) {
      case 'STRICT':
        confidence = 'HIGH';
        break;
      case 'INFERRED':
      case 'KNOWN_COMPLETE':
        confidence = 'MEDIUM';
        break;
      default:
        confidence = 'LOW';
    }
    
    // Build unit breakdown from final mix
    const breakdown: UnitBreakdown[] = mix_resolution.final_mix.map(unit => ({
      unit: unit.unit_id,
      beds: unit.beds,
      citation: unit.citation || `${unit.label} unit (${unit.source})`
    }));
    
    return {
      value: units,
      citation: `${units} unit${units > 1 ? 's' : ''}`,
      confidence,
      breakdown
    };
  }
  
  /**
   * Log extraction metrics for telemetry
   */
  private logExtractionMetrics(extraction: ExtractionResult, result: StrictExtractionResult): void {
    const metrics = {
      timestamp: new Date().toISOString(),
      mlsNumber: result.mlsNumber?.value,
      units: extraction.units,
      totalBeds: extraction.totalBeds,
      extractionSource: extraction.mix_resolution.source,
      reviewRequired: extraction.mix_resolution.review_required,
      flags: extraction.mix_resolution.flags,
      strictCount: extraction.unit_breakdown_strict.length,
      inferredCount: extraction.unit_breakdown_inferred.length,
      finalMix: extraction.mix_resolution.final_mix.map(u => ({
        id: u.unit_id,
        type: u.label,
        confidence: u.confidence,
        source: u.source
      }))
    };
    
    // Log to console for now (will integrate with telemetry service later)
    console.log('[EXTRACTION_METRICS]', JSON.stringify(metrics));
    
    // Track review-required cases for manual inspection
    if (extraction.mix_resolution.review_required) {
      console.warn('[EXTRACTION_REVIEW_REQUIRED]', {
        mlsNumber: result.mlsNumber?.value,
        address: result.address?.value,
        reason: extraction.mix_resolution.flags.join(', ')
      });
    }
  }
}

// Export singleton instance for backward compatibility
export const enhancedExtraction = new EnhancedExtractionService();