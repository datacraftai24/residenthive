/**
 * Pre-compiled Regex Patterns for Two-Pass Extraction
 * 
 * CRITICAL: These patterns are frozen for determinism.
 * Same input MUST produce same output across all environments.
 * 
 * Pattern Design Principles:
 * 1. Unit-scoped: Patterns must reference a specific unit (1st, 2nd, unit 1, etc.)
 * 2. Tempered dot: Use negative lookahead to prevent crossing unit boundaries
 * 3. Word boundaries: Use \b to avoid partial matches
 * 4. Case insensitive: All patterns use 'i' flag
 */

// Pre-compile all patterns once at startup for performance
function compilePattern(pattern: string, flags: string = 'gi'): RegExp {
  return new RegExp(pattern, flags);
}

// Define unit token pattern to prevent cross-unit matches
// Handles: unit 3, unit #3, 1st, 2nd, etc.
const UNIT_TOKEN = String.raw`\b(?:1st|first|2nd|second|3rd|third|4th|fourth|unit\s*#?\s*\d+)\b`;

// Optional connector patterns for higher precision
const CONNECTOR = String.raw`(?:\bis\b|\bhas\b|\bwith\b|\bfeatures\b|[:\-])?`;

// Tempered run that won't cross unit boundaries or sentence endings
const CLAUSE_RUN = String.raw`(?:(?!${UNIT_TOKEN})[^.:;\n]){0,80}?`;

/**
 * Main extraction patterns - frozen for determinism
 */
export const EXTRACTION_PATTERNS = Object.freeze({
  // Explicit unit with bedroom count or studio
  // Uses named capture groups and tempered dot to prevent crossing unit boundaries
  // Matches: "1st floor: 2BR", "unit 1 has 3 bedrooms", "3rd unit studio"
  // Will NOT match across units: "1st and 2nd unit... 3rd unit is a studio"
  unit_explicit: compilePattern(
    String.raw`(?<unit_ref>${UNIT_TOKEN})` +                      // named group: unit reference
    String.raw`\s*${CONNECTOR}\s*` +                              // optional connector for precision
    String.raw`${CLAUSE_RUN}` +                                   // tempered run: won't cross units or sentences
    String.raw`\b(?<type>studio|efficiency|(?<bedrooms>\d)\s*(?:br|bed(?:room)?s?))\b`  // named groups: type and optional bedrooms
  ),
  
  // Unit-scoped studio detection (HIGH confidence)
  // Uses named groups and tempered dot to prevent crossing unit boundaries
  // Matches: "3rd unit is a spacious studio", "1st floor efficiency"
  unit_studio: compilePattern(
    String.raw`(?<unit_ref>${UNIT_TOKEN})` +                      // named group: unit reference
    String.raw`\s*${CONNECTOR}\s*` +                              // optional connector
    String.raw`${CLAUSE_RUN}` +                                   // tempered run: prevent crossing units
    String.raw`\b(?<type>studio|efficiency)\b`                    // named group: studio/efficiency
  ),
  
  // Unit-scoped bedroom without count (for inference)
  // Handles compound references: "1st and 2nd unit features bedrooms"
  // Negative lookahead ensures no number follows
  unit_bedroom: compilePattern(
    String.raw`(?<unit_ref>(?:1st|first|2nd|second|3rd|third|4th|fourth)(?:\s+(?:and|&)\s+(?:1st|first|2nd|second|3rd|third|4th|fourth))?\s+unit|unit\s*#?\s*\d+)` +
    String.raw`\s*${CONNECTOR}\s*` +                              // optional connector
    String.raw`${CLAUSE_RUN}` +                                   // tempered run: prevent crossing units
    String.raw`\b(?<type>bedrooms?)\b(?!\s*\d)`                  // named group: bedroom(s) without a number
  ),
  
  // Kitchen co-occurrence for verification
  // Kitchen/sink must be within 30 chars of cooking appliance
  kitchen_cooccur: compilePattern(
    '\\b(kitchen|sink)[^.]{0,30}\\b(stove|gas\\s+range|electric\\s+range|oven|cooktop)\\b'
  ),
  
  // Condition grading keywords
  premium_keywords: compilePattern(
    '\\b(updated|renovated|remodeled|modern|stainless|granite|quartz|luxury|new|upgraded)\\b'
  ),
  
  poor_keywords: compilePattern(
    '\\b(older|original|dated|needs\\s+work|fixer|as\\s*is|tlc\\s+needed)\\b'
  ),
  
  // Multi-family property type detection
  multi_family: compilePattern(
    '\\b(\\d+)[\\s-]*(family|unit|plex)\\b|\\b(duplex|triplex|fourplex|multi[\\s-]*family)\\b'
  ),
  
  // Total bedroom/bathroom counts
  total_bedrooms: compilePattern(
    '\\b(\\d+)\\s*(?:total\\s*)?(?:bed(?:room)?s?)\\b'
  ),
  
  total_bathrooms: compilePattern(
    '\\b(\\d+(?:\\.\\d)?)\\s*(?:total\\s*)?(?:bath(?:room)?s?)\\b'
  )
});

/**
 * Unit reference normalization map
 * Maps various unit references to canonical IDs (U1, U2, U3, etc.)
 */
export const UNIT_ID_MAP = Object.freeze({
  // First unit variations
  '1st': 'U1',
  'first': 'U1',
  'unit 1': 'U1',
  'unit1': 'U1',
  'apt 1': 'U1',
  'apartment 1': 'U1',
  '1st floor': 'U1',
  'first floor': 'U1',
  
  // Second unit variations
  '2nd': 'U2',
  'second': 'U2',
  'unit 2': 'U2',
  'unit2': 'U2',
  'apt 2': 'U2',
  'apartment 2': 'U2',
  '2nd floor': 'U2',
  'second floor': 'U2',
  
  // Third unit variations
  '3rd': 'U3',
  'third': 'U3',
  'unit 3': 'U3',
  'unit3': 'U3',
  'apt 3': 'U3',
  'apartment 3': 'U3',
  '3rd floor': 'U3',
  'third floor': 'U3',
  
  // Fourth unit variations
  '4th': 'U4',
  'fourth': 'U4',
  'unit 4': 'U4',
  'unit4': 'U4',
  'apt 4': 'U4',
  'apartment 4': 'U4',
  '4th floor': 'U4',
  'fourth floor': 'U4',
  
  // Special cases
  'basement': 'U0',
  'garden': 'U0',
  'garden level': 'U0',
  'lower': 'U0',
  'upper': 'U2'  // Assumes upper in duplex is unit 2
});

/**
 * Normalize a unit reference to canonical ID
 */
export function normalizeUnitRef(ref: string): string {
  const normalized = ref.toLowerCase().trim();
  
  // Check direct mapping
  if (UNIT_ID_MAP[normalized]) {
    return UNIT_ID_MAP[normalized];
  }
  
  // Try to extract unit number
  const unitMatch = normalized.match(/unit\\s*(\\d+)/);
  if (unitMatch) {
    return `U${unitMatch[1]}`;
  }
  
  // Default: return original if can't normalize
  return ref;
}

/**
 * Extract unit count from property type
 */
export function extractUnitCount(propertyType: string): number | null {
  const normalized = propertyType.toLowerCase();
  
  // Check for explicit count
  const countMatch = normalized.match(/(\\d+)[\\s-]*(?:family|unit)/);
  if (countMatch) {
    return parseInt(countMatch[1]);
  }
  
  // Check for named types
  if (normalized.includes('duplex')) return 2;
  if (normalized.includes('triplex')) return 3;
  if (normalized.includes('fourplex') || normalized.includes('quadplex')) return 4;
  
  // Single family indicators
  if (normalized.includes('single') || normalized.includes('sfr')) return 1;
  
  return null;
}

/**
 * Pattern validation helpers
 */
export const PatternValidation = {
  /**
   * Test if a pattern matches expected inputs
   */
  testPattern(pattern: RegExp, testCases: { input: string; shouldMatch: boolean }[]): boolean {
    for (const { input, shouldMatch } of testCases) {
      const matches = pattern.test(input);
      pattern.lastIndex = 0;  // Reset regex state
      if (matches !== shouldMatch) {
        console.error(`Pattern test failed: "${input}" - expected ${shouldMatch}, got ${matches}`);
        return false;
      }
    }
    return true;
  },
  
  /**
   * Validate all patterns on startup
   */
  validatePatterns(): void {
    // Test unit_explicit pattern
    this.testPattern(EXTRACTION_PATTERNS.unit_explicit, [
      { input: "1st floor has 2 bedrooms", shouldMatch: true },
      { input: "unit 1: studio", shouldMatch: true },
      { input: "3rd floor 1BR", shouldMatch: true },
      { input: "spacious bedrooms", shouldMatch: false }  // No unit reference
    ]);
    
    // Test kitchen co-occurrence
    this.testPattern(EXTRACTION_PATTERNS.kitchen_cooccur, [
      { input: "kitchen with gas stove", shouldMatch: true },
      { input: "sink and electric range", shouldMatch: true },
      { input: "kitchen in range of schools", shouldMatch: false }  // "in range" is different context
    ]);
  }
};