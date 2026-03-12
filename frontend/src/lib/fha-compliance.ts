/**
 * FHA (Fair Housing Act) Compliance Utility
 *
 * Checks property hints/strengths for language that references
 * FHA-protected class proxies (school quality, neighborhood safety, etc.).
 * These aren't violations per se, but agents should use objective,
 * verifiable facts when discussing them.
 */

export interface FHACheckResult {
  hint: string;
  isFlagged: boolean;
  flags: string[];
}

interface FHAPattern {
  pattern: RegExp;
  category: string;
}

const FHA_PATTERNS: FHAPattern[] = [
  { pattern: /\b(school|education|school\s*district|school\s*zone|school\s*rating)/i, category: "Familial Status" },
  { pattern: /\b(safe|safety|crime|secure|low[\s-]crime|quiet\s+neighborhood)/i, category: "Race/National Origin" },
  { pattern: /\b(family[\s.-]friendly|kid|child|playground|daycare)/i, category: "Familial Status" },
  { pattern: /\b(church|mosque|temple|synagogue|worship)/i, category: "Religion" },
  { pattern: /\b(ethnic|cultural\s+community|diverse\s+neighborhood|homogeneous)/i, category: "Race/National Origin" },
  { pattern: /\b(elderly|senior\s+community|retirement|55\+|age[\s-]restricted)/i, category: "Age/Familial Status" },
  { pattern: /\b(accessible|wheelchair|disability|handicap)/i, category: "Disability" },
];

export function checkHintCompliance(hint: string): FHACheckResult {
  const flags: string[] = [];

  for (const { pattern, category } of FHA_PATTERNS) {
    if (pattern.test(hint) && !flags.includes(category)) {
      flags.push(category);
    }
  }

  return { hint, isFlagged: flags.length > 0, flags };
}

export function checkHintsCompliance(hints: string[]): FHACheckResult[] {
  return hints.map(checkHintCompliance);
}

export function hasAnyFHAFlags(hints: string[]): boolean {
  return hints.some((hint) => checkHintCompliance(hint).isFlagged);
}

export function generateEmailComplianceNote(results: FHACheckResult[]): string | null {
  const flagged = results.filter((r) => r.isFlagged);
  if (flagged.length === 0) return null;

  return "Note: This email references topics that may be FHA-sensitive. Ensure all claims use objective, verifiable facts.";
}

/**
 * Transform subjective, FHA-sensitive hint language into objective phrasing.
 * Used in email drafts to replace buyer's casual language with agent-appropriate,
 * fact-based descriptions.
 */
export function transformHintToObjective(hint: string): string {
  const transforms: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /good schools?\s*(nearby|close|in the area)?/i, replacement: "Located near well-rated school districts" },
    { pattern: /safe\s*(neighborhood|area|community)/i, replacement: "Established residential neighborhood" },
    { pattern: /family[\s-]friendly/i, replacement: "Near parks and community amenities" },
    { pattern: /quiet\s*(neighborhood|area|street)/i, replacement: "Low-traffic residential area" },
    { pattern: /low[\s-]crime/i, replacement: "Well-maintained residential area" },
    { pattern: /\b(church|mosque|temple|synagogue|worship)\s*(nearby|close)?/i, replacement: "Convenient access to local amenities" },
    { pattern: /diverse\s*(neighborhood|community|area)/i, replacement: "Vibrant mixed-use neighborhood" },
    { pattern: /senior\s*(community|friendly|living)/i, replacement: "Accessible single-level living options" },
  ];
  for (const { pattern, replacement } of transforms) {
    if (pattern.test(hint)) return replacement;
  }
  return hint;
}
