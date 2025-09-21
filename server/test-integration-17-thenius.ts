/**
 * Integration Test for 17 Thenius St Bug Fix
 * 
 * This test verifies that:
 * 1. Two-pass extraction correctly identifies 2×1BR + 1×Studio
 * 2. Property evaluator calculates TOTAL rent for all units
 * 3. The property now passes evaluation (was failing before)
 */

import { PropertyEvaluatorComprehensive } from './agents/property-evaluator-comprehensive';
import { extractUnits } from './services/extraction/two-pass-extractor';
import { enhancedExtraction } from './services/extraction-adapter';

// Enable enhanced extraction for this test
process.env.USE_ENHANCED_EXTRACTION = 'true';

// 17 Thenius St MLS data (simplified for testing)
const property17Thenius = {
  mlsNumber: '73435912',
  listPrice: 650000,
  address: '17 Thenius St, Worcester, MA 01607',
  propertyType: '3 Family',
  style: '3 Family',
  bedrooms: 3,  // Total across all units
  bathrooms: 3,
  units: 3,
  taxes: 5424,
  yearBuilt: 1900,
  description: `Rare investment opportunity! This versatile 3-family property in a strong Worcester rental market offers excellent income potential and long-term growth. 1st and 2nd unit features spacious bedrooms, living area and eat-in kitchens, the 3rd unit is a spacious studio with hardwood, and skylights, basement laundry hookups for tenant convenience. Recent updates include new windows, newer roof, and a rebuilt chimney with stainless steel liner, reducing maintenance costs.`
};

// Investment strategy for testing
const strategy = {
  budget: 800000,
  targetCashFlow: 500,
  market: 'Worcester',
  minDSCR: 1.10,
  assumedDownPayment: 25,
  assumedInterestRate: 7.5
};

async function runIntegrationTest() {
  console.log('\n' + '='.repeat(80));
  console.log('INTEGRATION TEST: 17 THENIUS ST BUG FIX');
  console.log('='.repeat(80));
  
  console.log('\n1. TESTING TWO-PASS EXTRACTION');
  console.log('-'.repeat(40));
  
  // Test extraction directly
  const extractionResult = extractUnits(property17Thenius);
  console.log(`Units: ${extractionResult.units}`);
  console.log(`Total Beds: ${extractionResult.totalBeds || 'unknown'}`);
  console.log(`Resolution Source: ${extractionResult.mix_resolution.source}`);
  console.log(`Final Mix: ${extractionResult.mix_resolution.final_mix.map(u => u.label).join(' + ')}`);
  console.log(`Review Required: ${extractionResult.mix_resolution.review_required}`);
  
  // Verify extraction results
  const expectedMix = ['1BR', '1BR', 'Studio'];
  const actualMix = extractionResult.mix_resolution.final_mix.map(u => u.label).sort();
  const extractionPassed = JSON.stringify(expectedMix.sort()) === JSON.stringify(actualMix);
  
  console.log(`\n✓ Extraction Test: ${extractionPassed ? 'PASSED' : 'FAILED'}`);
  if (!extractionPassed) {
    console.error(`  Expected: ${expectedMix.join(' + ')}`);
    console.error(`  Got: ${actualMix.join(' + ')}`);
  }
  
  console.log('\n2. TESTING EXTRACTION ADAPTER');
  console.log('-'.repeat(40));
  
  // Test adapter integration
  const adaptedResult = await enhancedExtraction.extractFromMLS(property17Thenius);
  console.log(`Units Value: ${adaptedResult.units?.value}`);
  console.log(`Units Confidence: ${adaptedResult.units?.confidence}`);
  console.log(`Units Breakdown: ${adaptedResult.units?.breakdown?.map(u => `${u.unit}:${u.beds}BR`).join(', ')}`);
  
  console.log('\n3. TESTING PROPERTY EVALUATOR');
  console.log('-'.repeat(40));
  
  // Create evaluator instance
  const evaluator = new PropertyEvaluatorComprehensive();
  
  // Mock market stats for consistent testing
  const mockMarketStats = {
    hasTableForCity: () => true,
    getTable: () => ({
      getAvgForBeds: (beds: number) => {
        // Worcester average rents
        switch(beds) {
          case 0: return 1500;  // Studio
          case 1: return 1800;  // 1BR
          case 2: return 2300;  // 2BR
          case 3: return 2731;  // 3BR
          default: return 2000;
        }
      }
    })
  };
  
  // Run Phase 1 evaluation
  console.log('\nRunning Phase 1 (Deterministic Screening)...');
  const phase1Results = await evaluator.phase1DeterministicScreening(
    [property17Thenius], 
    strategy,
    mockMarketStats as any
  );
  
  console.log(`\nPhase 1 Results:`);
  console.log(`- Properties evaluated: ${phase1Results.evaluated}`);
  console.log(`- Properties qualified: ${phase1Results.qualified.length}`);
  console.log(`- Pass rate: ${((phase1Results.qualified.length / phase1Results.evaluated) * 100).toFixed(1)}%`);
  
  if (phase1Results.qualified.length > 0) {
    const qual = phase1Results.qualified[0];
    console.log(`\n✓ PROPERTY QUALIFIED!`);
    console.log(`  - Total Rent: $${qual.rentEstimate?.point || 0}/month`);
    console.log(`  - DSCR: ${qual.metrics?.dscr?.toFixed(2)}`);
    console.log(`  - Cap Rate: ${qual.metrics?.capRate?.toFixed(2)}%`);
    console.log(`  - Cash Flow: $${qual.metrics?.cashFlow?.toFixed(0)}/month`);
    
    // Verify rent is calculated correctly
    // Expected: 2×1BR @ $1800 + 1×Studio @ $1500 = $5,100/month
    const expectedRent = 1800 * 2 + 1500;
    const actualRent = qual.rentEstimate?.point || 0;
    const rentCorrect = Math.abs(actualRent - expectedRent) < 100; // Allow small variance
    
    console.log(`\n✓ Rent Calculation: ${rentCorrect ? 'PASSED' : 'FAILED'}`);
    if (!rentCorrect) {
      console.error(`  Expected: ~$${expectedRent}/month`);
      console.error(`  Got: $${actualRent}/month`);
    }
  } else {
    console.log(`\n✗ PROPERTY FAILED SCREENING`);
    if (phase1Results.failed.length > 0) {
      const failure = phase1Results.failed[0];
      console.log(`  Reasons: ${failure.reasons?.join(', ')}`);
      console.log(`  Rent Estimate: $${failure.rentEstimate?.point || 0}/month`);
      console.log(`  DSCR: ${failure.metrics?.dscr?.toFixed(2) || 'N/A'}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('INTEGRATION TEST COMPLETE');
  console.log('='.repeat(80));
  
  // Return test results
  return {
    extraction: extractionPassed,
    qualified: phase1Results.qualified.length > 0,
    rentCorrect: phase1Results.qualified.length > 0 && 
                 Math.abs((phase1Results.qualified[0].rentEstimate?.point || 0) - 5100) < 100
  };
}

// Run test
async function main() {
  try {
    const results = await runIntegrationTest();
    
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Extraction: ${results.extraction ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Qualification: ${results.qualified ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Rent Calculation: ${results.rentCorrect ? '✅ PASSED' : '❌ FAILED'}`);
    
    const allPassed = results.extraction && results.qualified && results.rentCorrect;
    console.log(`\nOVERALL: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    if (allPassed) {
      console.log('\n🎉 17 Thenius St bug is FIXED! Property now:');
      console.log('   - Correctly identifies 2×1BR + 1×Studio mix');
      console.log('   - Calculates total rent for all units (~$5,100/month)');
      console.log('   - Passes investment screening with positive cash flow');
    }
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}

// Always run when executed
main();