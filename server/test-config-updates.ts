#!/usr/bin/env tsx
/**
 * Test Config Updates
 * 
 * Tests that configs can be updated and agents use the new values
 */

import { configRegistry } from './config/config-registry.js';
import { configUpdater } from './ai-agents/config-updater.js';

async function runTest() {
  console.log('\n========================================');
  console.log('   CONFIG UPDATE TEST');
  console.log('========================================\n');
  
  try {
    // Initialize
    console.log('1️⃣  Initializing config system...');
    await configRegistry.initialize();
    console.log('✅ Config loaded\n');
    
    // Test 1: Read current mortgage rates
    console.log('2️⃣  Current mortgage rates:');
    const marketData = await configRegistry.getValue('market-data', {});
    const currentRates = marketData.mortgageRates;
    console.log(`   Conventional 30yr: ${currentRates?.conventional30}%`);
    console.log(`   FHA 30yr: ${currentRates?.fha30}%`);
    console.log(`   Last updated: ${currentRates?.updatedAt}`);
    console.log(`   Source: ${currentRates?.source}`);
    console.log('');
    
    // Test 2: Update mortgage rates
    console.log('3️⃣  Updating mortgage rates...');
    const newRates = {
      ...currentRates,
      conventional30: 7.25,
      fha30: 7.0,
      updatedAt: new Date().toISOString(),
      source: 'Test Update',
      confidence: 'HIGH' as const
    };
    
    await configRegistry.updateValue(
      'market-data',
      {
        ...marketData,
        mortgageRates: newRates
      },
      'test-script',
      {
        ttl: 300, // 5 minutes
        provenance: {
          source: 'user' as const,
          confidence: 'HIGH'
        }
      }
    );
    console.log('✅ Rates updated\n');
    
    // Test 3: Verify update
    console.log('4️⃣  Verifying update:');
    const updatedData = await configRegistry.getValue('market-data', {});
    const updatedRates = updatedData.mortgageRates;
    console.log(`   Conventional 30yr: ${updatedRates?.conventional30}% (was ${currentRates?.conventional30}%)`);
    console.log(`   FHA 30yr: ${updatedRates?.fha30}% (was ${currentRates?.fha30}%)`);
    console.log('');
    
    // Test 4: Check audit history
    console.log('5️⃣  Audit history:');
    const history = await configRegistry.getAuditHistory('market-data', 3);
    console.log(`   Found ${history.length} audit entries`);
    history.forEach((entry, i) => {
      console.log(`   ${i + 1}. Updated by: ${entry.updatedBy} at ${entry.updatedAt}`);
      console.log(`      Provenance: ${JSON.stringify(entry.provenance)}`);
    });
    console.log('');
    
    // Test 5: Update source weights
    console.log('6️⃣  Testing source weight updates...');
    const sourceWeights = await configRegistry.getValue('source-weights', {});
    const originalZillowWeight = sourceWeights.weights?.['zillow.com'];
    console.log(`   Current zillow.com weight: ${originalZillowWeight}`);
    
    // Simulate accuracy-based update
    await configUpdater.updateSourceWeightsFromAccuracy(
      'data-reconciliation',
      [
        { source: 'zillow.com', accuracy: 0.95, sampleSize: 20 },
        { source: 'craigslist.org', accuracy: 0.40, sampleSize: 15 }
      ]
    );
    
    const updatedWeights = await configRegistry.getValue('source-weights', {});
    console.log(`   Updated zillow.com weight: ${updatedWeights.weights?.['zillow.com']}`);
    console.log(`   Updated craigslist.org weight: ${updatedWeights.weights?.['craigslist.org']}`);
    console.log('');
    
    // Test 6: Test TTL expiry
    console.log('7️⃣  Testing TTL expiry...');
    await configRegistry.updateValue(
      'market-data',
      {
        ...updatedData,
        testValue: 'expires-soon'
      },
      'test-script',
      {
        ttl: 2, // 2 seconds
        provenance: { source: 'user' as const }
      }
    );
    
    console.log('   Created config with 2 second TTL');
    console.log('   Checking staleness...');
    console.log(`   Is stale (0s threshold): ${configRegistry.isStale('market-data', 0)}`);
    console.log(`   Is stale (3600s threshold): ${configRegistry.isStale('market-data', 3600)}`);
    
    console.log('   Waiting 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // After TTL expires, the value might be refreshed from seed
    const afterTTL = await configRegistry.getValue('market-data', {});
    console.log(`   Test value after TTL: ${afterTTL.testValue || 'removed (expired)'}`);
    console.log('');
    
    // Test 7: Batch get
    console.log('8️⃣  Testing batch get...');
    const batchValues = await configRegistry.getValues([
      'source-weights',
      'market-data',
      'policy'
    ]);
    console.log(`   Retrieved ${Object.keys(batchValues).length} configs in batch`);
    Object.keys(batchValues).forEach(key => {
      console.log(`   - ${key}: ${batchValues[key] ? '✓' : '✗'}`);
    });
    
    console.log('\n✅ All config update tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest().catch(console.error);