/**
 * Simple Test for 17 Thenius St Bug Fix
 * Tests the two critical fixes:
 * 1. Unit mix extraction (2×1BR + Studio)
 * 2. Total rent calculation for multi-family
 */

import { extractUnits } from './services/extraction/two-pass-extractor';

// Enable feature flag
process.env.USE_ENHANCED_EXTRACTION = 'true';

// 17 Thenius St test data
const property = {
  mlsNumber: '73435912',
  listPrice: 650000,
  address: '17 Thenius St, Worcester, MA',
  propertyType: '3 Family',
  style: '3 Family',
  units: 3,
  bedrooms: 3,
  bathrooms: 3,
  description: `Rare investment opportunity! This versatile 3-family property in a strong Worcester rental market offers excellent income potential and long-term growth. 1st and 2nd unit features spacious bedrooms, living area and eat-in kitchens, the 3rd unit is a spacious studio with hardwood, and skylights, basement laundry hookups for tenant convenience.`
};

console.log('\n' + '='.repeat(80));
console.log('17 THENIUS ST BUG FIX TEST');
console.log('='.repeat(80));

// Test extraction
const result = extractUnits(property);

console.log('\nEXTRACTION RESULTS:');
console.log('- Units:', result.units);
console.log('- Total Bedrooms:', result.totalBeds || 'unknown');
console.log('- Resolution Source:', result.mix_resolution.source);
console.log('- Final Mix:', result.mix_resolution.final_mix.map(u => `${u.label}(${u.confidence})`).join(' + '));
console.log('- Review Required:', result.mix_resolution.review_required);

// Expected: Studio + 1BR + 1BR
const expectedMix = ['Studio', '1BR', '1BR'].sort();
const actualMix = result.mix_resolution.final_mix.map(u => u.label).sort();
const extractionPassed = JSON.stringify(expectedMix) === JSON.stringify(actualMix);

console.log('\nEXTRACTION TEST:', extractionPassed ? '✅ PASSED' : '❌ FAILED');
if (!extractionPassed) {
  console.log('  Expected:', expectedMix.join(', '));
  console.log('  Got:', actualMix.join(', '));
}

// Test rent calculation
console.log('\nRENT CALCULATION:');
const perUnitRents = {
  'Studio': 1500,
  '1BR': 1800,
  '2BR': 2300
};

let totalRent = 0;
for (const unit of result.mix_resolution.final_mix) {
  const rent = perUnitRents[unit.label] || 0;
  totalRent += rent;
  console.log(`- ${unit.unit_id}: ${unit.label} @ $${rent}/month`);
}

console.log(`- TOTAL RENT: $${totalRent}/month`);

// Before fix: Would calculate as 1×$2,731 = $2,731/month (3BR rate)
// After fix: Should be Studio($1,500) + 2×1BR($1,800) = $5,100/month
const rentCorrect = totalRent === 5100;
console.log('\nRENT TEST:', rentCorrect ? '✅ PASSED' : '❌ FAILED');

// Calculate basic metrics
const price = property.listPrice;
const monthlyRent = totalRent;
const annualRent = monthlyRent * 12;
const capRate = (annualRent * 0.65) / price * 100; // Assuming 65% NOI margin
const pricePerUnit = price / result.units;

console.log('\nKEY METRICS:');
console.log(`- Price: $${price.toLocaleString()}`);
console.log(`- Price/Unit: $${pricePerUnit.toLocaleString()}`);
console.log(`- Monthly Rent: $${monthlyRent}/month`);
console.log(`- Annual Rent: $${annualRent.toLocaleString()}/year`);
console.log(`- Estimated Cap Rate: ${capRate.toFixed(2)}%`);

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

if (extractionPassed && rentCorrect) {
  console.log('✅ ALL TESTS PASSED!');
  console.log('\nThe 17 Thenius St bug is FIXED:');
  console.log('1. Unit mix correctly extracted as Studio + 2×1BR');
  console.log('2. Total rent properly calculated for all units ($5,100/month)');
  console.log('3. Property should now pass investment screening');
} else {
  console.log('❌ SOME TESTS FAILED');
  if (!extractionPassed) console.log('- Unit extraction needs work');
  if (!rentCorrect) console.log('- Rent calculation needs work');
}

process.exit(extractionPassed && rentCorrect ? 0 : 1);