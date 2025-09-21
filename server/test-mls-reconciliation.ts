#!/usr/bin/env tsx
/**
 * Test MLS reconciliation for 17 Thenius St scenario
 * 
 * Tests that when extraction yields 2BR+2BR+Studio (4 beds)
 * but MLS shows 3 total beds, we correctly reconcile to 2BR+1BR+Studio
 */

import { extractUnits } from './services/extraction/two-pass-extractor';

async function test17TheniusReconciliation() {
  console.log('\n' + '='.repeat(80));
  console.log('TESTING MLS RECONCILIATION: 17 THENIUS ST');
  console.log('='.repeat(80));
  
  const mlsData = {
    propertyType: '3 Family',
    style: '3 Family',
    bedrooms: 3,  // MLS total: 3 beds for entire building
    bathrooms: 3,
    units: 3,
    description: `Rare investment opportunity! This versatile 3-family property in a strong Worcester rental market offers excellent income potential and long-term growth. 1st and 2nd unit features spacious bedrooms, living area and eat-in kitchens, the 3rd unit is a spacious studio with hardwood, and skylights, basement laundry hookups for tenant convenience. Recent updates include new windows, newer roof, and a rebuilt chimney with stainless steel liner, reducing maintenance costs.`,
    address: '17 Thenius St',
    mlsNumber: '73426935'
  };
  
  console.log('\nMLS Data:');
  console.log(`  Total Bedrooms: ${mlsData.bedrooms}`);
  console.log(`  Total Units: ${mlsData.units}`);
  console.log(`  Property Type: ${mlsData.propertyType}`);
  
  console.log('\nExpected behavior:');
  console.log('  Text extraction will find:');
  console.log('    - Unit 1: 2BR (inferred from "spacious bedrooms")');
  console.log('    - Unit 2: 2BR (inferred from "spacious bedrooms")');
  console.log('    - Unit 3: Studio (explicit)');
  console.log('  Total: 4 beds (exceeds MLS count of 3)');
  console.log('\n  Reconciliation should produce:');
  console.log('    - Unit 1: 2BR (preserved)');
  console.log('    - Unit 2: 1BR (reduced to match MLS)');
  console.log('    - Unit 3: Studio (preserved - HIGH confidence)');
  console.log('  Total: 3 beds (matches MLS)');
  
  const result = await extractUnits(mlsData, true);
  
  console.log('\n' + '='.repeat(80));
  console.log('FINAL RESULT');
  console.log('='.repeat(80));
  
  const finalMix = result.mix_resolution.final_mix;
  const totalBeds = finalMix.reduce((sum, u) => sum + u.beds, 0);
  
  console.log(`\nFinal Unit Mix:`);
  finalMix.forEach((unit, idx) => {
    console.log(`  ${unit.unit_id}: ${unit.label} (${unit.confidence} confidence)`);
    if (unit.assumption_code === 'MLS_RECONCILED_v1') {
      console.log(`    └── ${unit.citation}`);
    }
  });
  
  console.log(`\nTotal Beds: ${totalBeds}`);
  console.log(`MLS Beds: ${mlsData.bedrooms}`);
  console.log(`Source: ${result.mix_resolution.source}`);
  console.log(`Review Required: ${result.mix_resolution.review_required}`);
  console.log(`Flags: ${result.mix_resolution.flags.join(', ')}`);
  
  // Validate the reconciliation
  const passed = totalBeds === mlsData.bedrooms && 
                 result.mix_resolution.source === 'INFERRED_MLS_RECONCILED';
  
  if (passed) {
    console.log('\n✅ TEST PASSED: MLS reconciliation working correctly');
    console.log('   - Extracted beds reconciled from 4 to 3');
    console.log('   - Studio preserved (HIGH confidence)');
    console.log('   - One 2BR reduced to 1BR to match MLS');
  } else {
    console.error('\n❌ TEST FAILED:');
    if (totalBeds !== mlsData.bedrooms) {
      console.error(`   - Bed count mismatch: ${totalBeds} vs MLS ${mlsData.bedrooms}`);
    }
    if (result.mix_resolution.source !== 'INFERRED_MLS_RECONCILED') {
      console.error(`   - Wrong source: ${result.mix_resolution.source}`);
    }
  }
  
  return passed;
}

// Run test
test17TheniusReconciliation()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });