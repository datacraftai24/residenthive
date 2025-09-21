// Test the improved tempered dot patterns
import { EXTRACTION_PATTERNS } from './server/services/extraction/regex-patterns';

interface TestCase {
  text: string;
  shouldMatch: boolean;
  description: string;
  expectedUnit?: string;
  expectedType?: string;
}

const testCases: TestCase[] = [
  // Should match
  {
    text: "1st floor: 2BR",
    shouldMatch: true,
    description: "Simple unit with bedroom count",
    expectedUnit: "1st",
    expectedType: "2BR"
  },
  {
    text: "unit 1 has 3 bedrooms",
    shouldMatch: true,
    description: "Unit with 'has' connector",
    expectedUnit: "unit 1",
    expectedType: "3 bedrooms"
  },
  {
    text: "third unit is a studio",
    shouldMatch: true,
    description: "Third unit studio",
    expectedUnit: "third",
    expectedType: "studio"
  },
  {
    text: "4th unit — 1 br + den",
    shouldMatch: true,
    description: "Unit with dash separator",
    expectedUnit: "4th",
    expectedType: "1 br"
  },
  {
    text: "unit 2 with 2 bedrooms and balcony",
    shouldMatch: true,
    description: "Unit with 'with' connector",
    expectedUnit: "unit 2",
    expectedType: "2 bedrooms"
  },
  
  // Must NOT match
  {
    text: "1st and 2nd unit features spacious bedrooms, living area and eat-in kitchens, the 3rd unit is a spacious studio",
    shouldMatch: false,
    description: "Should NOT cross unit boundaries (1st should not match with 3rd's studio)"
  },
  {
    text: "1st unit with kitchen and the 3rd unit is a studio",
    shouldMatch: false,
    description: "Should NOT match across units even without punctuation"
  },
  {
    text: "Unit 1 near Unit 2, studio downstairs",
    shouldMatch: false,
    description: "Studio not tied to specific unit"
  },
  {
    text: "Two units upstairs; studio in basement",
    shouldMatch: false,
    description: "No explicit unit number for studio"
  }
];

function testPattern() {
  console.log("Testing unit_explicit pattern with tempered dot");
  console.log("=" .repeat(60));
  
  let passCount = 0;
  let failCount = 0;
  
  for (const testCase of testCases) {
    // Reset regex state
    EXTRACTION_PATTERNS.unit_explicit.lastIndex = 0;
    
    const matches = [...testCase.text.matchAll(EXTRACTION_PATTERNS.unit_explicit)];
    const hasMatch = matches.length > 0;
    
    const passed = hasMatch === testCase.shouldMatch;
    
    console.log(`\n${passed ? '✅' : '❌'} ${testCase.description}`);
    console.log(`   Text: "${testCase.text}"`);
    console.log(`   Expected: ${testCase.shouldMatch ? 'MATCH' : 'NO MATCH'}`);
    console.log(`   Actual: ${hasMatch ? 'MATCH' : 'NO MATCH'}`);
    
    if (hasMatch && matches[0]) {
      console.log(`   Matched: "${matches[0][0]}"`);
      console.log(`   Unit: "${matches[0][1]}"`);
      console.log(`   Type: "${matches[0][2]}"`);
      
      // For "1st and 2nd unit" case, check we're not matching the wrong unit
      if (testCase.text.includes("1st and 2nd unit") && matches[0][0].includes("3rd")) {
        console.log(`   ⚠️  WRONG: Matched across units!`);
        failCount++;
        continue;
      }
    }
    
    if (passed) {
      passCount++;
    } else {
      failCount++;
    }
  }
  
  console.log("\n" + "=" .repeat(60));
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  
  if (failCount === 0) {
    console.log("✅ ALL TESTS PASSED!");
  } else {
    console.log("❌ SOME TESTS FAILED");
  }
  
  // Test the 17 Thenius case specifically
  console.log("\n" + "=" .repeat(60));
  console.log("Testing 17 Thenius St case:");
  const theniusText = "1st and 2nd unit features spacious bedrooms, living area and eat-in kitchens, the 3rd unit is a spacious studio with hardwood";
  
  EXTRACTION_PATTERNS.unit_explicit.lastIndex = 0;
  const theniusMatches = [...theniusText.matchAll(EXTRACTION_PATTERNS.unit_explicit)];
  
  console.log(`Found ${theniusMatches.length} matches:`);
  for (const match of theniusMatches) {
    console.log(`  - Unit: "${match[1]}", Type: "${match[2]}"`);
  }
  
  if (theniusMatches.length === 1 && theniusMatches[0][1].includes("3rd")) {
    console.log("✅ Correctly matched only 3rd unit studio!");
  } else {
    console.log("❌ Failed to correctly extract units");
  }
}

testPattern();