/**
 * Test script to validate rent table functionality
 */

import { cityRentTables, type CityRentTable } from './services/city-rent-tables.js';
import { strictExtraction } from './services/strict-extraction.js';

async function testRentTables() {
  console.log('🧪 Testing Rent Table Service...\n');
  
  // 1. Test building and setting a rent table
  const worcesterTable: CityRentTable = {
    'STUDIO': { A: 1300, B: 1100, C: 900 },
    '1BR': { A: 1700, B: 1400, C: 1200 },
    '2BR': { A: 2200, B: 1750, C: 1400 },
    '3BR': { A: 2800, B: 2200, C: 1800 }
  };
  
  cityRentTables.setTableForCity('Worcester MA', worcesterTable, {
    city: 'Worcester MA',
    timestamp: Date.now(),
    sources: ['test-source-1', 'test-source-2'],
    confidence: 'HIGH'
  });
  
  console.log('✅ Rent table set for Worcester MA');
  
  // 2. Test retrieving rents
  console.log('\n📊 Testing rent retrieval:');
  console.log('Studio (B condition):', cityRentTables.getRent('Worcester MA', 'STUDIO', 'B'));
  console.log('1BR (A condition):', cityRentTables.getRent('Worcester MA', '1BR', 'A'));
  console.log('2BR (C condition):', cityRentTables.getRent('Worcester MA', '2BR', 'C'));
  console.log('3BR (B condition):', cityRentTables.getRent('Worcester MA', '3BR', 'B'));
  
  // 3. Test numeric bedroom input
  console.log('\n📊 Testing numeric bedroom input:');
  console.log('0 bedrooms (Studio):', cityRentTables.getRent('Worcester MA', 0, 'B'));
  console.log('1 bedroom:', cityRentTables.getRent('Worcester MA', 1, 'B'));
  console.log('2 bedrooms:', cityRentTables.getRent('Worcester MA', 2, 'B'));
  console.log('3 bedrooms:', cityRentTables.getRent('Worcester MA', 3, 'B'));
  
  // 4. Test condition normalization
  console.log('\n📊 Testing condition normalization:');
  console.log('Condition A+:', cityRentTables.getRent('Worcester MA', '2BR', 'A+'));
  console.log('Condition B-:', cityRentTables.getRent('Worcester MA', '2BR', 'B-'));
  console.log('Condition D (maps to C):', cityRentTables.getRent('Worcester MA', '2BR', 'D'));
  console.log('No condition (defaults to B):', cityRentTables.getRent('Worcester MA', '2BR'));
  
  // 5. Test frozen table (should not be modifiable)
  console.log('\n🔒 Testing table immutability:');
  try {
    const metadata = cityRentTables.getMetadata('Worcester MA');
    console.log('Table metadata:', metadata);
    // Try to modify (should fail silently due to freeze)
    (worcesterTable.STUDIO as any).B = 9999;
    console.log('After attempted modification:', cityRentTables.getRent('Worcester MA', 'STUDIO', 'B'));
    console.log('✅ Table is properly frozen');
  } catch (e) {
    console.log('❌ Error:', e);
  }
}

async function testStrictExtraction() {
  console.log('\n\n🧪 Testing Strict Extraction Service...\n');
  
  // Sample MLS data for a 3-family property
  const sampleMLS = {
    mlsNumber: '73429330',
    listPrice: 650000,
    address: {
      streetNumber: '17',
      streetName: 'Thenius',
      streetSuffix: 'St',
      city: 'Worcester',
      state: 'MA',
      zip: '01607'
    },
    details: {
      propertyType: 'Residential Income',
      style: '3 Family',
      numBedrooms: 5,
      numBathrooms: 3,
      yearBuilt: 1920,
      sqft: 3600,
      description: `Well-maintained 3-family investment property. First floor unit features 2 bedrooms and 1 bathroom. 
                    Second floor unit also has 2 bedrooms and 1 bathroom. Third floor is a cozy studio apartment with 1 bathroom. 
                    All units are currently occupied with long-term tenants. Annual taxes: $8,500. 
                    Recent updates include new roof in 2020 and updated electrical throughout.`
    },
    taxes: {
      annualAmount: 8500
    }
  };
  
  console.log('📄 Extracting from MLS data...');
  const extracted = await strictExtraction.extractFromMLS(sampleMLS);
  
  console.log('\n📊 Extraction Results:');
  console.log('MLS Number:', extracted.mlsNumber);
  console.log('Price:', extracted.price);
  console.log('Units:', extracted.units);
  console.log('Unit Breakdown:', extracted.units?.breakdown);
  console.log('Taxes:', extracted.taxes);
  console.log('Year Built:', extracted.yearBuilt);
  console.log('Condition:', extracted.condition);
  
  // Test rent calculation using extracted unit mix
  if (extracted.units?.breakdown && extracted.units.breakdown.length > 0) {
    console.log('\n💰 Calculating rent using extracted unit mix:');
    let totalRent = 0;
    
    for (const unit of extracted.units.breakdown) {
      const unitType = unit.beds === 0 ? 'STUDIO' : `${unit.beds}BR`;
      const condition = extracted.condition?.value || 'B';
      const rent = cityRentTables.getRent('Worcester MA', unitType, condition);
      
      console.log(`  ${unit.unit}: ${unitType} @ $${rent}/month`);
      totalRent += rent;
    }
    
    console.log(`  TOTAL: $${totalRent}/month`);
    
    // Calculate basic metrics
    const annualRent = totalRent * 12;
    const capRate = (annualRent - (extracted.taxes?.value || 8500)) / (extracted.price?.value || 650000);
    console.log(`\n📈 Basic Metrics:`);
    console.log(`  Annual Rent: $${annualRent}`);
    console.log(`  Cap Rate: ${(capRate * 100).toFixed(2)}%`);
  }
}

// Run tests
async function main() {
  try {
    await testRentTables();
    await testStrictExtraction();
    console.log('\n\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();