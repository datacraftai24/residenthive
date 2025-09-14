/**
 * Extraction Debugger - Enhanced Tracking for Production Debugging
 * 
 * Provides comprehensive tracking of extraction decisions and evidence
 * for debugging production issues without requiring code changes.
 */

import { UnitType, ExtractionResult, MixResolution } from '../../../shared/types/extraction';
import * as fs from 'fs';
import * as path from 'path';

export interface ExtractionTrace {
  // Request context
  requestId: string;
  timestamp: number;
  mlsNumber?: string;
  address?: string;
  propertyType?: string;
  
  // Input data
  inputText: string;
  mlsData: any;
  
  // Extraction passes
  passes: {
    strict: {
      patterns: Array<{
        pattern: string;
        matches: string[];
        units: UnitType[];
      }>;
      totalFound: number;
    };
    heuristic: {
      patterns: Array<{
        pattern: string;
        matches: string[];
        units: UnitType[];
        inferenceReason: string;
      }>;
      totalFound: number;
    };
    llm?: {
      attempted: boolean;
      success: boolean;
      rawResponse?: any;
      units: UnitType[];
      error?: string;
    };
  };
  
  // Resolution
  resolution: {
    input: {
      strictCount: number;
      inferredCount: number;
      targetUnits: number;
      totalBeds?: number;
    };
    decision: MixResolution;
    reasoning: string[];
  };
  
  // Rent calculation
  rentCalculation?: {
    method: string;
    unitBreakdown: Array<{
      unitId: string;
      unitType: string;
      condition: string;
      rentValue: number;
      source: string;
    }>;
    totalRent: number;
    confidence: string;
  };
  
  // Validation
  validation: {
    errors: string[];
    warnings: string[];
    flags: string[];
  };
}

class ExtractionDebugger {
  private traces: Map<string, ExtractionTrace> = new Map();
  private logDir: string;
  
  constructor() {
    // Create log directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'extraction-logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  /**
   * Start a new extraction trace
   */
  startTrace(requestId: string, mlsData: any, inputText: string): void {
    const trace: ExtractionTrace = {
      requestId,
      timestamp: Date.now(),
      mlsNumber: mlsData.mlsNumber,
      address: mlsData.address || mlsData.fullAddress,
      propertyType: mlsData.propertyType,
      inputText: inputText.substring(0, 5000), // Cap for storage
      mlsData: {
        units: mlsData.units,
        bedrooms: mlsData.bedrooms,
        bathrooms: mlsData.bathrooms,
        propertyType: mlsData.propertyType,
        style: mlsData.style
      },
      passes: {
        strict: { patterns: [], totalFound: 0 },
        heuristic: { patterns: [], totalFound: 0 }
      },
      resolution: {
        input: {
          strictCount: 0,
          inferredCount: 0,
          targetUnits: mlsData.units || 1,
          totalBeds: mlsData.bedrooms
        },
        decision: {
          final_mix: [],
          source: 'UNKNOWN',
          review_required: true,
          flags: []
        },
        reasoning: []
      },
      validation: {
        errors: [],
        warnings: [],
        flags: []
      }
    };
    
    this.traces.set(requestId, trace);
    console.log(`🔍 [EXTRACTION_DEBUG] Started trace ${requestId} for ${trace.address || 'unknown'}`);
  }
  
  /**
   * Record a pattern match from strict extraction
   */
  recordStrictMatch(requestId: string, pattern: string, match: string, unit: UnitType): void {
    const trace = this.traces.get(requestId);
    if (!trace) return;
    
    let patternEntry = trace.passes.strict.patterns.find(p => p.pattern === pattern);
    if (!patternEntry) {
      patternEntry = { pattern, matches: [], units: [] };
      trace.passes.strict.patterns.push(patternEntry);
    }
    
    patternEntry.matches.push(match.substring(0, 200));
    patternEntry.units.push(unit);
    trace.passes.strict.totalFound++;
    
    console.log(`   📝 [STRICT] Found ${unit.label} from "${match.substring(0, 100)}..."`);
  }
  
  /**
   * Record a heuristic inference
   */
  recordHeuristicInference(
    requestId: string, 
    pattern: string, 
    match: string, 
    unit: UnitType,
    reason: string
  ): void {
    const trace = this.traces.get(requestId);
    if (!trace) return;
    
    let patternEntry = trace.passes.heuristic.patterns.find(p => p.pattern === pattern);
    if (!patternEntry) {
      patternEntry = { pattern, matches: [], units: [], inferenceReason: reason };
      trace.passes.heuristic.patterns.push(patternEntry);
    }
    
    patternEntry.matches.push(match.substring(0, 200));
    patternEntry.units.push(unit);
    trace.passes.heuristic.totalFound++;
    
    console.log(`   🔮 [HEURISTIC] Inferred ${unit.label} (${unit.confidence}) - ${reason}`);
  }
  
  /**
   * Record LLM extraction attempt
   */
  recordLLMAttempt(requestId: string, success: boolean, units?: UnitType[], error?: string): void {
    const trace = this.traces.get(requestId);
    if (!trace) return;
    
    trace.passes.llm = {
      attempted: true,
      success,
      units: units || [],
      error
    };
    
    if (success) {
      console.log(`   🤖 [LLM] Extracted ${units?.length || 0} units`);
    } else {
      console.log(`   ❌ [LLM] Failed: ${error}`);
    }
  }
  
  /**
   * Record the final resolution decision
   */
  recordResolution(requestId: string, resolution: MixResolution, reasoning: string[]): void {
    const trace = this.traces.get(requestId);
    if (!trace) return;
    
    trace.resolution.decision = resolution;
    trace.resolution.reasoning = reasoning;
    
    console.log(`   ✅ [RESOLUTION] ${resolution.source} → ${resolution.final_mix.map(u => u.label).join(', ')}`);
    if (resolution.review_required) {
      console.log(`   ⚠️  Review required: ${resolution.flags.join(', ')}`);
    }
  }
  
  /**
   * Record rent calculation details
   */
  recordRentCalculation(
    requestId: string,
    method: string,
    unitBreakdown: any[],
    totalRent: number,
    confidence: string
  ): void {
    const trace = this.traces.get(requestId);
    if (!trace) return;
    
    trace.rentCalculation = {
      method,
      unitBreakdown,
      totalRent,
      confidence
    };
    
    console.log(`   💰 [RENT] Total: $${totalRent}/mo via ${method} (${confidence})`);
  }
  
  /**
   * Add validation issues
   */
  addValidation(requestId: string, type: 'error' | 'warning' | 'flag', message: string): void {
    const trace = this.traces.get(requestId);
    if (!trace) return;
    
    if (type === 'error') {
      trace.validation.errors.push(message);
    } else if (type === 'warning') {
      trace.validation.warnings.push(message);
    } else {
      trace.validation.flags.push(message);
    }
  }
  
  /**
   * Complete the trace and save to disk
   */
  completeTrace(requestId: string): void {
    const trace = this.traces.get(requestId);
    if (!trace) return;
    
    // Save to disk for analysis
    const filename = `extraction_${requestId}_${Date.now()}.json`;
    const filepath = path.join(this.logDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(trace, null, 2));
    console.log(`   📁 [EXTRACTION_DEBUG] Saved trace to ${filename}`);
    
    // Clean up memory
    this.traces.delete(requestId);
  }
  
  /**
   * Get a trace for inspection
   */
  getTrace(requestId: string): ExtractionTrace | undefined {
    return this.traces.get(requestId);
  }
  
  /**
   * Generate a summary report for a trace
   */
  generateSummary(requestId: string): string {
    const trace = this.traces.get(requestId);
    if (!trace) return 'No trace found';
    
    const lines: string[] = [
      `\n${'='.repeat(80)}`,
      `EXTRACTION TRACE SUMMARY`,
      `${'='.repeat(80)}`,
      `Request ID: ${trace.requestId}`,
      `Property: ${trace.address || 'Unknown'} (${trace.mlsNumber || 'No MLS'})`,
      `Type: ${trace.propertyType || 'Unknown'}`,
      `Target: ${trace.resolution.input.targetUnits} units, ${trace.resolution.input.totalBeds || '?'} beds`,
      '',
      `EXTRACTION PASSES:`,
      `  Strict: ${trace.passes.strict.totalFound} units found`,
      `  Heuristic: ${trace.passes.heuristic.totalFound} units inferred`,
      `  LLM: ${trace.passes.llm?.attempted ? (trace.passes.llm.success ? `${trace.passes.llm.units.length} units` : 'Failed') : 'Not attempted'}`,
      '',
      `RESOLUTION:`,
      `  Method: ${trace.resolution.decision.source}`,
      `  Final Mix: ${trace.resolution.decision.final_mix.map(u => `${u.unit_id}:${u.label}(${u.confidence})`).join(', ')}`,
      `  Review Required: ${trace.resolution.decision.review_required}`,
      `  Flags: ${trace.resolution.decision.flags.join(', ') || 'None'}`,
      '',
      `RENT CALCULATION:`,
      `  Method: ${trace.rentCalculation?.method || 'Not calculated'}`,
      `  Total Rent: $${trace.rentCalculation?.totalRent || 0}/month`,
      `  Confidence: ${trace.rentCalculation?.confidence || 'Unknown'}`,
      '',
      `VALIDATION:`,
      `  Errors: ${trace.validation.errors.length}`,
      `  Warnings: ${trace.validation.warnings.length}`,
      `  Flags: ${trace.validation.flags.length}`,
      `${'='.repeat(80)}\n`
    ];
    
    return lines.join('\n');
  }
}

// Export singleton instance
export const extractionDebugger = new ExtractionDebugger();

// Helper to generate request IDs
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}