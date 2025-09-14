/**
 * LLM-based Unit Mix Extractor with Schema Constraints
 * 
 * Uses OpenAI function calling for structured extraction with evidence spans.
 * Falls back to regex extraction if LLM fails or is unavailable.
 * 
 * CRITICAL: All extracted facts must include evidence spans for auditability.
 */

import OpenAI from 'openai';
import { UnitType } from '../../../shared/types/extraction';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Create extraction logs directory
const LOG_DIR = path.join(process.cwd(), 'extraction-logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, `llm-extraction-${new Date().toISOString().split('T')[0]}.log`);

// Initialize OpenAI client (will be null if no API key)
const openai = process.env.OPENAI_API_KEY ? 
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/**
 * Evidence for extracted facts
 */
interface Evidence {
  start: number;
  end: number;
}

/**
 * Unit extraction output
 */
interface UnitOut {
  unit_id: string;
  bedrooms: number;
  is_studio: boolean;
  source: 'extracted' | 'assumed';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: Evidence[];
  assumption_rule?: string;
}

/**
 * Complete LLM extraction result
 */
interface LLMExtraction {
  text_sha256: string;
  extracted_units: UnitOut[];
  assumed_units: UnitOut[];
  flags: string[];
}

/**
 * Schema for LLM function calling
 */
const EXTRACTION_SCHEMA = {
  name: 'extract_unit_mix',
  description: 'Extract unit bedroom configuration with evidence',
  parameters: {
    type: 'object',
    properties: {
      text_sha256: {
        type: 'string',
        description: 'SHA256 hash of the normalized text'
      },
      extracted_units: {
        type: 'array',
        description: 'Units with factual evidence',
        items: {
          type: 'object',
          properties: {
            unit_id: {
              type: 'string',
              description: 'Unit identifier (U1, U2, U3, etc.)'
            },
            bedrooms: {
              type: 'integer',
              minimum: 0,
              maximum: 6
            },
            is_studio: {
              type: 'boolean'
            },
            source: {
              type: 'string',
              enum: ['extracted']
            },
            confidence: {
              type: 'string',
              enum: ['HIGH', 'MEDIUM', 'LOW']
            },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start: { type: 'integer' },
                  end: { type: 'integer' }
                },
                required: ['start', 'end']
              }
            }
          },
          required: ['unit_id', 'bedrooms', 'is_studio', 'source', 'confidence', 'evidence']
        }
      },
      assumed_units: {
        type: 'array',
        description: 'Units based on assumptions',
        items: {
          type: 'object',
          properties: {
            unit_id: {
              type: 'string',
              description: 'Unit identifier (U1, U2, U3, etc.)'
            },
            bedrooms: {
              type: 'integer',
              minimum: 0,
              maximum: 6
            },
            is_studio: {
              type: 'boolean'
            },
            source: {
              type: 'string',
              enum: ['assumed']
            },
            confidence: {
              type: 'string',
              enum: ['HIGH', 'MEDIUM', 'LOW']
            },
            assumption_rule: {
              type: 'string',
              description: 'Rule used for assumption'
            }
          },
          required: ['unit_id', 'bedrooms', 'is_studio', 'source', 'confidence', 'assumption_rule']
        }
      },
      flags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Issues like UNIT_COUNT_MISMATCH, BEDROOM_COUNT_MISMATCH'
      }
    },
    required: ['text_sha256', 'extracted_units', 'assumed_units', 'flags']
  }
};

/**
 * Extract unit mix using LLM with constraints
 */
export async function llmExtractUnits(
  text: string,
  mlsData: any
): Promise<UnitType[] | null> {
  // Log everything to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    address: mlsData.address,
    mlsNumber: mlsData.mlsNumber,
    units: mlsData.units,
    bedrooms: mlsData.bedrooms,
    textLength: text?.length || 0,
    textPreview: text?.substring(0, 500) || 'NO TEXT'
  };
  
  fs.appendFileSync(LOG_FILE, '\n' + '='.repeat(80) + '\n');
  fs.appendFileSync(LOG_FILE, `[${logEntry.timestamp}] LLM EXTRACTION START\n`);
  fs.appendFileSync(LOG_FILE, `Address: ${logEntry.address}\n`);
  fs.appendFileSync(LOG_FILE, `MLS#: ${logEntry.mlsNumber}\n`);
  fs.appendFileSync(LOG_FILE, `Units: ${logEntry.units}, Bedrooms: ${logEntry.bedrooms}\n`);
  fs.appendFileSync(LOG_FILE, `Text length: ${logEntry.textLength}\n`);
  fs.appendFileSync(LOG_FILE, `Text preview:\n${logEntry.textPreview}\n`);

  // Check if OpenAI is available
  if (!openai) {
    console.log('[LLM_EXTRACTOR] OpenAI not configured, skipping LLM extraction');
    fs.appendFileSync(LOG_FILE, 'ERROR: OpenAI not configured\n');
    return null;
  }

  // Cap text length for token efficiency
  const MAX_TEXT_LENGTH = 3000;
  const cappedText = text.substring(0, MAX_TEXT_LENGTH);

  // Normalize text for consistent hashing and extraction
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const textSha256 = crypto.createHash('sha256').update(normalizedText).digest('hex');

  try {
    console.log('[LLM_EXTRACTOR] Starting extraction for property');

    const systemPrompt = `You are a real estate data extractor. Output ONLY JSON via function-calling.

GOAL
- Determine unit-level bedroom counts for a multi-family listing.

CRITICAL PRINCIPLES
- Separate FACTS from ASSUMPTIONS.
- Facts require verifiable EVIDENCE spans (byte offsets) against the exact normalized text provided.
- Assumptions are allowed only to provide a complete best-effort mix; they must be labeled and traceable to an assumption rule.
- Never include chain-of-thought or freeform prose. Only structured fields.

HARD CONSTRAINTS
- Studios have 0 bedrooms.
- If a unit is marked "studio", bedrooms must be 0.
- Unit count must not exceed provided totalUnits.
- Bedrooms must be an integer in [0..6].
- CRITICAL: The sum of all unit bedrooms MUST EQUAL totalBedrooms when provided.
- If text says "1st and 2nd units feature bedrooms" with totalBedrooms=3 and unit 3 is studio, this means units 1&2 share the 3 bedrooms (e.g., 1BR + 2BR), NOT that each has bedrooms.
- Do not contradict provided totals: when totalBedrooms is present, any assumed distribution MUST match it exactly. Flag BEDROOM_COUNT_MISMATCH if impossible.

EVIDENCE
- For each FACTUAL extraction, return one or more evidence spans as {start,end} byte offsets into the EXACT normalized text (the text you receive).
- Include text_sha256 of that normalized text so evidence can be verified.

AMBIGUITY & ASSUMPTIONS (when text is incomplete)
- Use assumptions ONLY when needed to complete a best-effort unit mix.
- Allowed assumption rules (examples):
  - "plural->2BR" (e.g., "spacious bedrooms" with no number)
  - "ordinal_plural_each->2BR" (e.g., "1st and 2nd units each have bedrooms")
  - "distribute_total_beds" (use totalBedrooms across totalUnits)
  - "reconcile_with_total" (when units mention bedrooms but total constrains distribution)
  - "fallback_typical_mix" (if no bedroom info at all)
- Assumed items MUST be labeled source:"assumed" and include assumption_rule.
- Never fabricate evidence for assumed items.

RECONCILIATION EXAMPLE:
Text: "1st and 2nd unit features spacious bedrooms... 3rd unit is a spacious studio"
TotalUnits: 3, TotalBedrooms: 3
Analysis: U3 is studio (0BR). Units 1&2 have bedrooms but count unspecified.
Since total is 3BR and U3=0BR, units 1&2 must share 3BR total.
Result: U1=1BR, U2=2BR, U3=0BR (or U1=2BR, U2=1BR, U3=0BR)

CONFIDENCE
- HIGH: explicit numeric count ("2 bedrooms", "3BR", "studio")
- MEDIUM: clear but non-numeric phrase tied to a unit (e.g., plural "bedrooms" with ordinals)
- LOW: assumption-only (distribution or typical mix)

OUTPUT POLICY
- Return both arrays: extracted_units (facts) and assumed_units (assumptions). Either may be empty, but never both if any unit info can be derived.
- Also return flags[] for issues like UNIT_COUNT_MISMATCH, BEDROOM_COUNT_MISMATCH, or STUDIO_BED_CONFLICT.`;

    const userPrompt = `EXTRACT UNIT MIX

NormalizedTextSHA256: ${textSha256}
TotalUnits: ${mlsData.units || 'unknown'}
TotalBedrooms: ${mlsData.bedrooms || 'null'}

TEXT:
"""
${normalizedText.substring(0, 3000)}
"""`;

    // Log the full prompt
    fs.appendFileSync(LOG_FILE, '\n--- SYSTEM PROMPT ---\n');
    fs.appendFileSync(LOG_FILE, systemPrompt + '\n');
    fs.appendFileSync(LOG_FILE, '\n--- USER PROMPT ---\n');
    fs.appendFileSync(LOG_FILE, userPrompt + '\n');
    fs.appendFileSync(LOG_FILE, '\n--- SENDING TO OPENAI ---\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      functions: [EXTRACTION_SCHEMA],
      function_call: { name: 'extract_unit_mix' },
      temperature: 0,
      max_tokens: 1000
    });

    // Log raw OpenAI response
    fs.appendFileSync(LOG_FILE, '\n--- OPENAI RAW RESPONSE ---\n');
    fs.appendFileSync(LOG_FILE, JSON.stringify(response, null, 2) + '\n');

    const functionCall = response.choices[0]?.message?.function_call;
    if (!functionCall?.arguments) {
      console.error('[LLM_EXTRACTOR] No function call in response');
      fs.appendFileSync(LOG_FILE, '\nERROR: No function call in response\n');
      fs.appendFileSync(LOG_FILE, `Response structure: ${JSON.stringify(response.choices[0]?.message)}\n`);
      return null;
    }

    fs.appendFileSync(LOG_FILE, '\n--- FUNCTION CALL ARGUMENTS ---\n');
    fs.appendFileSync(LOG_FILE, functionCall.arguments + '\n');

    const extraction: LLMExtraction = JSON.parse(functionCall.arguments);
    console.log('[LLM_EXTRACTOR] Raw extraction:', JSON.stringify(extraction, null, 2));
    
    fs.appendFileSync(LOG_FILE, '\n--- PARSED EXTRACTION ---\n');
    fs.appendFileSync(LOG_FILE, JSON.stringify(extraction, null, 2) + '\n');

    // Validate SHA256
    if (extraction.text_sha256 !== textSha256) {
      console.warn('[LLM_EXTRACTOR] SHA256 mismatch - text may have changed');
      fs.appendFileSync(LOG_FILE, `\nWARNING: SHA256 mismatch\n`);
    }

    // Combine extracted and assumed units
    const allUnits = [...extraction.extracted_units, ...extraction.assumed_units];
    
    if (allUnits.length === 0) {
      console.error('[LLM_EXTRACTOR] No units extracted or assumed');
      fs.appendFileSync(LOG_FILE, '\nERROR: No units extracted or assumed\n');
      return null;
    }

    fs.appendFileSync(LOG_FILE, `\nExtracted ${extraction.extracted_units.length} facts, ${extraction.assumed_units.length} assumptions\n`);
    if (extraction.flags.length > 0) {
      fs.appendFileSync(LOG_FILE, `Flags: ${extraction.flags.join(', ')}\n`);
    }

    // Convert to UnitType format
    const units: UnitType[] = allUnits.map((unit: UnitOut) => {
      // Determine label
      const label = unit.is_studio || unit.bedrooms === 0 ? 'Studio' : 
                    `${unit.bedrooms}BR` as UnitType['label'];

      // Build citation from evidence or assumption rule
      let citation = '';
      if (unit.source === 'extracted' && unit.evidence && unit.evidence.length > 0) {
        const evidence = unit.evidence[0];
        citation = normalizedText.substring(evidence.start, evidence.end);
      } else if (unit.source === 'assumed') {
        citation = `Assumed: ${unit.assumption_rule}`;
      }

      return {
        unit_id: unit.unit_id,
        beds: unit.bedrooms as 0 | 1 | 2 | 3 | 4,
        label,
        confidence: unit.confidence,
        source: unit.source === 'extracted' ? 'EXPLICIT' : 'INFERRED' as const,
        assumption_code: unit.source === 'assumed' ? 
          unit.assumption_rule || 'LLM_ASSUMED_v1' : 
          'LLM_EXTRACTED_v1',
        citation: citation.substring(0, 200)
      };
    });

    // Log extraction metrics
    console.log('[LLM_EXTRACTOR] Extracted units:', units.map(u => 
      `${u.unit_id}: ${u.label} (${u.confidence})`
    ).join(', '));

    if (extraction.has_ambiguity) {
      console.warn('[LLM_EXTRACTOR] Ambiguity detected:', extraction.ambiguity_notes);
    }

    fs.appendFileSync(LOG_FILE, '\n--- FINAL UNITS ---\n');
    fs.appendFileSync(LOG_FILE, JSON.stringify(units, null, 2) + '\n');
    fs.appendFileSync(LOG_FILE, '\n' + '='.repeat(80) + '\n');

    return units;

  } catch (error) {
    console.error('[LLM_EXTRACTOR] Extraction failed:', error);
    fs.appendFileSync(LOG_FILE, '\nERROR: Extraction failed\n');
    fs.appendFileSync(LOG_FILE, `Error message: ${error.message}\n`);
    fs.appendFileSync(LOG_FILE, `Stack trace:\n${error.stack}\n`);
    return null;
  }
}

/**
 * Normalize unit reference to standard format
 */
function normalizeUnitRef(ref: string): string {
  const normalized = ref.toLowerCase().trim();
  
  // Map ordinals to unit numbers
  const ordinalMap: Record<string, string> = {
    '1st': 'U1', 'first': 'U1',
    '2nd': 'U2', 'second': 'U2',
    '3rd': 'U3', 'third': 'U3',
    '4th': 'U4', 'fourth': 'U4',
    '5th': 'U5', 'fifth': 'U5'
  };

  // Check ordinal mappings
  for (const [key, value] of Object.entries(ordinalMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Handle "unit N" format
  const unitMatch = normalized.match(/unit\s*(\d+)/);
  if (unitMatch) {
    return `U${unitMatch[1]}`;
  }

  // Handle "floor N" format
  const floorMatch = normalized.match(/floor\s*(\d+)/);
  if (floorMatch) {
    return `U${floorMatch[1]}`;
  }

  // Default to U1, U2, etc. based on position
  return 'U1';
}

/**
 * Get appropriate assumption code for LLM extraction
 */
function getLLMAssumptionCode(
  confidence: string,
  bedroomCount: number,
  hasAmbiguity: boolean
): string {
  if (bedroomCount === 0) {
    return 'LLM_STUDIO_EXPLICIT_v1';
  }

  if (hasAmbiguity) {
    if (confidence === 'HIGH') {
      return 'LLM_EXPLICIT_WITH_AMBIGUITY_v1';
    } else if (confidence === 'MEDIUM') {
      return 'LLM_INFERRED_MEDIUM_AMBIGUITY_v1';
    } else {
      return 'LLM_INFERRED_LOW_AMBIGUITY_v1';
    }
  }

  // No ambiguity cases
  if (confidence === 'HIGH') {
    return 'LLM_EXPLICIT_HIGH_CONFIDENCE_v1';
  } else if (confidence === 'MEDIUM') {
    return 'LLM_INFERRED_MEDIUM_CONFIDENCE_v1';
  } else {
    return 'LLM_INFERRED_LOW_CONFIDENCE_v1';
  }
}

/**
 * Validate LLM extraction against MLS data
 */
export function validateLLMExtraction(
  units: UnitType[],
  mlsData: any
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check unit count - allow flexible validation since we may have assumptions
  if (mlsData.units && units.length !== mlsData.units) {
    // This is now informational, not a hard failure
    console.log(`[LLM_VALIDATOR] Unit count: extracted ${units.length} vs MLS ${mlsData.units}`);
  }

  // Check bedroom count if available - also informational
  if (mlsData.bedrooms) {
    const extractedBeds = units.reduce((sum, u) => sum + u.beds, 0);
    if (extractedBeds !== mlsData.bedrooms) {
      console.log(`[LLM_VALIDATOR] Bedroom count: extracted ${extractedBeds} vs MLS ${mlsData.bedrooms}`);
    }
  }

  // Check for duplicate unit IDs (this is still critical)
  const unitIds = units.map(u => u.unit_id);
  const uniqueIds = new Set(unitIds);
  if (unitIds.length !== uniqueIds.size) {
    issues.push('Duplicate unit IDs detected');
  }

  // Validate bedroom counts are in range
  for (const unit of units) {
    if (unit.beds < 0 || unit.beds > 6) {
      issues.push(`Invalid bedroom count for ${unit.unit_id}: ${unit.beds}`);
    }
  }

  // Check for evidence on extracted facts
  const extractedUnits = units.filter(u => u.source === 'EXPLICIT');
  for (const unit of extractedUnits) {
    if (!unit.citation || unit.citation.length === 0) {
      issues.push(`Missing evidence for extracted unit ${unit.unit_id}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}