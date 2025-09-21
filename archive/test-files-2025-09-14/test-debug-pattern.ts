// Debug the actual regex pattern being generated
import { EXTRACTION_PATTERNS } from './server/services/extraction/regex-patterns';

console.log("unit_explicit pattern:");
console.log(EXTRACTION_PATTERNS.unit_explicit.source);
console.log("Flags:", EXTRACTION_PATTERNS.unit_explicit.flags);

// Test with a simple case
const text = "3rd unit is a spacious studio";
const matches = [...text.matchAll(EXTRACTION_PATTERNS.unit_explicit)];

console.log("\nTest text:", text);
console.log("Matches:", matches.length);
if (matches.length > 0) {
  console.log("Full match:", matches[0][0]);
  console.log("Capture groups:");
  matches[0].forEach((group, i) => {
    console.log(`  [${i}]: "${group}"`);
  });
}