#!/usr/bin/env tsx
/**
 * Simple Test for Data Reconciliation with Config
 * 
 * Tests how the reconciliation handles conflicting data with config-driven weights
 */

import { enhancedDataReconciliation } from './ai-agents/data-reconciliation-enhanced.js';
import { configRegistry } from './config/config-registry.js';

// Test profile
const TEST_PROFILE = {
  availableCash: 250000,
  monthlyIncomeTarget: 2500,
  location: 'Massachusetts',
  timeline: '3 months',
  willingToOwnerOccupy: false,
  investmentExperience: 'beginner',
  investmentGoals: 'cash flow focused'
};

async function runTest() {
  console.log('\n========================================');
  console.log('   DATA RECONCILIATION TEST');
  console.log('========================================\n');
  
  try {
    // Initialize config
    console.log('1️⃣  Initializing config system...');
    await configRegistry.initialize();
    console.log('✅ Config loaded\n');
    
    // Show source weights from config
    console.log('2️⃣  Source weights from config:');
    const sourceWeights = await configRegistry.getValue('source-weights', {});
    const weights = sourceWeights.weights || {};
    console.log(`   zillow.com: ${weights['zillow.com'] || 'not set'}`);
    console.log(`   rentdata.org: ${weights['rentdata.org'] || 'not set'}`);
    console.log(`   craigslist.org: ${weights['craigslist.org'] || 'not set'}`);
    console.log(`   unknown: ${weights['unknown'] || 'not set'}`);
    console.log('');
    
    // Create conflicting findings for Springfield
    const conflictingFindings = [
      // High-trust source (Zillow)
      {
        city: 'Springfield',
        state: 'MA',
        metric: 'median_rent',
        value: 1650,
        source: 'zillow.com',
        confidence: 'HIGH' as const,
        timestamp: new Date().toISOString(),
        dataDate: new Date().toISOString() // Fresh data
      },
      // Medium-trust source (RentData)
      {
        city: 'Springfield',
        state: 'MA',
        metric: 'median_rent',
        value: 1550,
        source: 'rentdata.org',
        confidence: 'HIGH' as const,
        timestamp: new Date().toISOString(),
        dataDate: new Date(Date.now() - 15 * 86400000).toISOString() // 15 days old
      },
      // Low-trust source (Craigslist)
      {
        city: 'Springfield',
        state: 'MA',
        metric: 'median_rent',
        value: 1200,
        source: 'craigslist.org',
        confidence: 'LOW' as const,
        timestamp: new Date().toISOString(),
        dataDate: new Date(Date.now() - 60 * 86400000).toISOString() // 60 days old
      },
      // Unknown source
      {
        city: 'Springfield',
        state: 'MA',
        metric: 'median_rent',
        value: 1800,
        source: 'randomsite.com',
        confidence: 'LOW' as const,
        timestamp: new Date().toISOString(),
        dataDate: new Date().toISOString()
      }
    ];
    
    console.log('3️⃣  Input findings:');
    conflictingFindings.forEach(f => {
      const age = Math.floor((Date.now() - new Date(f.dataDate).getTime()) / (86400000));
      console.log(`   ${f.source}: $${f.value}/mo (${age} days old, ${f.confidence} confidence)`);
    });
    console.log('');
    
    // Run reconciliation
    console.log('4️⃣  Running reconciliation...');
    const result = await enhancedDataReconciliation.reconcileWithContext(
      conflictingFindings,
      TEST_PROFILE
    );
    
    console.log('✅ Reconciliation complete\n');
    
    // Display results
    console.log('========================================');
    console.log('   RECONCILIATION RESULTS');
    console.log('========================================\n');
    
    // The result format depends on the implementation
    // Let's display what we get
    console.log('📊 Output:', JSON.stringify(result, null, 2));
    
    // Test with different metric types
    console.log('\n5️⃣  Testing with property prices...');
    
    const priceFindings = [
      {
        city: 'Worcester',
        state: 'MA',
        metric: 'median_home_price',
        value: 425000,
        source: 'zillow.com',
        confidence: 'HIGH' as const,
        timestamp: new Date().toISOString(),
        dataDate: new Date().toISOString()
      },
      {
        city: 'Worcester',
        state: 'MA',
        metric: 'median_home_price',
        value: 450000,
        source: 'redfin.com',
        confidence: 'HIGH' as const,
        timestamp: new Date().toISOString(),
        dataDate: new Date(Date.now() - 7 * 86400000).toISOString()
      },
      {
        city: 'Worcester',
        state: 'MA',
        metric: 'median_home_price',
        value: 380000,
        source: 'facebook.com',
        confidence: 'LOW' as const,
        timestamp: new Date().toISOString(),
        dataDate: new Date(Date.now() - 30 * 86400000).toISOString()
      }
    ];
    
    console.log('   Input price findings:');
    priceFindings.forEach(f => {
      console.log(`   ${f.source}: $${f.value.toLocaleString()}`);
    });
    
    const priceResult = await enhancedDataReconciliation.reconcileWithContext(
      priceFindings,
      TEST_PROFILE
    );
    
    console.log('\n   Price reconciliation result:', JSON.stringify(priceResult, null, 2));
    
    // Test tolerance checking
    console.log('\n6️⃣  Testing metric tolerances...');
    const toleranceConfig = await configRegistry.getValue('reconciliation', {});
    const rentTolerance = toleranceConfig.metricTolerances?.median_rent;
    const priceTolerance = toleranceConfig.metricTolerances?.median_home_price;
    
    console.log(`   Rent tolerance: ${rentTolerance?.tolerance || 'not set'} (${rentTolerance?.critical ? 'critical' : 'non-critical'})`);
    console.log(`   Price tolerance: ${priceTolerance?.tolerance || 'not set'} (${priceTolerance?.critical ? 'critical' : 'non-critical'})`);
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest().catch(console.error);