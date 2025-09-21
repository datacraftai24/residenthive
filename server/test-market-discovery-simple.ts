#!/usr/bin/env tsx
/**
 * Simple Test for MarketDiscoveryAgent
 * 
 * Quick test to verify the agent works with the new config system
 */

import { marketDiscoveryAgent } from './ai-agents/market-discovery-agent.js';
import { configRegistry } from './config/config-registry.js';

// Enable LLM prompt logging
process.env.LOG_LLM_PROMPTS = 'true';

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

// Simple mock Tavily
async function mockTavily(query: string): Promise<any> {
  console.log(`\n🔍 SEARCH: "${query.substring(0, 80)}..."\n`);
  
  // Return canned responses
  if (query.includes('median home prices') || query.includes('property prices')) {
    return {
      answer: "Massachusetts median home prices Q4 2024: Springfield $340,000, Worcester $425,000, Fitchburg $285,000, New Bedford $365,000, Lowell $445,000, Lawrence $380,000, Holyoke $275,000, Brockton $415,000",
      sources: [{ title: "Zillow", url: "zillow.com" }],
      confidence: 'HIGH'
    };
  }
  
  if (query.includes('rent')) {
    return {
      answer: "Massachusetts median rents 2024: Springfield $1,650/mo, Worcester $1,950/mo, Fitchburg $1,200/mo, New Bedford $1,500/mo, Lowell $2,100/mo, Lawrence $1,450/mo",
      sources: [{ title: "RentData", url: "rentdata.org" }],
      confidence: 'HIGH'
    };
  }
  
  if (query.includes('tax')) {
    return {
      answer: "Property tax rates: Springfield 1.18%, Worcester 1.35%, Fitchburg 1.42%, New Bedford 0.97%, Lowell 1.28%",
      sources: [{ title: "MA Gov", url: "mass.gov" }],
      confidence: 'HIGH'
    };
  }
  
  if (query.includes('vacancy') || query.includes('demand')) {
    return {
      answer: "Vacancy rates: Springfield 5.2%, Worcester 4.8%, Fitchburg 6.1%, New Bedford 5.5%. Strong rental demand in Worcester and Lowell.",
      sources: [{ title: "HUD", url: "hud.gov" }],
      confidence: 'MEDIUM'
    };
  }
  
  if (query.includes('economic') || query.includes('growth')) {
    return {
      answer: "Worcester showing 2.3% job growth, Springfield stable, Fitchburg declining slightly. Boston metro strong at 3.1% growth.",
      sources: [{ title: "BLS", url: "bls.gov" }],
      confidence: 'MEDIUM'
    };
  }
  
  return {
    answer: "No specific data found for this query",
    sources: [],
    confidence: 'LOW'
  };
}

async function runTest() {
  console.log('\n========================================');
  console.log('   MARKET DISCOVERY AGENT TEST');
  console.log('========================================\n');
  
  try {
    // Initialize config
    console.log('1️⃣  Initializing config system...');
    await configRegistry.initialize();
    console.log('✅ Config loaded\n');
    
    // Show current config values
    console.log('2️⃣  Current config values:');
    const sourceWeights = await configRegistry.getValue('source-weights', {});
    console.log('   Source weights:', {
      'zillow.com': sourceWeights.weights?.['zillow.com'],
      'hud.gov': sourceWeights.weights?.['hud.gov'],
      'rentdata.org': sourceWeights.weights?.['rentdata.org']
    });
    
    const reconciliation = await configRegistry.getValue('reconciliation', {});
    console.log('   Cross-checks:', reconciliation.crossChecks?.rentPriceRatio);
    console.log('');
    
    // Run market discovery
    console.log('3️⃣  Running market discovery...');
    console.log('   Profile:', JSON.stringify(TEST_PROFILE, null, 2));
    console.log('');
    
    const result = await marketDiscoveryAgent.discoverMarkets(
      TEST_PROFILE,
      mockTavily
    );
    
    // Display results
    console.log('\n========================================');
    console.log('   RESULTS');
    console.log('========================================\n');
    
    console.log(`📊 Markets Found: ${result.candidateMarkets.length}`);
    console.log(`🎯 Confidence: ${result.confidence}`);
    console.log(`📝 Data Gaps: ${result.dataGaps?.length || 0}`);
    
    if (result.candidateMarkets.length > 0) {
      console.log('\n🏆 TOP MARKETS:\n');
      
      result.candidateMarkets.slice(0, 5).forEach((market, i) => {
        console.log(`${i + 1}. ${market.city}, ${market.state}`);
        console.log(`   💰 Price: $${market.metrics?.median_price?.toLocaleString() || 'N/A'}`);
        console.log(`   🏠 Rent: $${market.metrics?.median_rent?.toLocaleString() || 'N/A'}/mo`);
        
        if (market.metrics?.median_price && market.metrics?.median_rent) {
          const ratio = (market.metrics.median_rent / market.metrics.median_price * 100).toFixed(2);
          console.log(`   📈 Rent/Price: ${ratio}%`);
        }
        
        console.log(`   ⭐ Score: ${market.analysis?.confidenceLevel || 'N/A'}%`);
        console.log(`   📝 ${market.recommendation || 'No recommendation'}`);
        console.log('');
      });
    }
    
    // Show any warnings
    if (result.dataGaps && result.dataGaps.length > 0) {
      console.log('⚠️  DATA GAPS:');
      result.dataGaps.forEach(gap => console.log(`   - ${gap}`));
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest().catch(console.error);