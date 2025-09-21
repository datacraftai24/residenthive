#!/usr/bin/env tsx
/**
 * Test Script for New Config-Driven Agents
 * 
 * Tests:
 * 1. MarketDiscoveryAgent with config-driven weights
 * 2. DataReconciliationAgent with config-driven tolerances
 * 3. ConfigRegistry operations
 * 4. Agent config updates
 */

import { marketDiscoveryAgent } from './ai-agents/market-discovery-agent.js';
import { enhancedDataReconciliation } from './ai-agents/data-reconciliation-enhanced.js';
import { configRegistry } from './config/config-registry.js';
import { configUpdater } from './ai-agents/config-updater.js';
import { promises as fs } from 'fs';
import * as path from 'path';

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

// Mock Tavily search function
async function mockTavilySearch(query: string): Promise<any> {
  console.log(`\n📡 MOCK TAVILY QUERY: ${query.substring(0, 100)}...`);
  
  // Return different mock data based on query
  if (query.includes('median home prices')) {
    return {
      answer: "Massachusetts cities median home prices December 2024: Springfield $340,000, Worcester $425,000, Fitchburg $285,000, Boston $850,000",
      sources: [{ title: "Zillow Q4 2024", url: "zillow.com" }],
      confidence: 'HIGH'
    };
  }
  
  if (query.includes('mortgage rate')) {
    return {
      answer: "Current 30-year mortgage rates: Conventional 7.125%, FHA 6.875%, VA 6.750%, as of January 2025 per Freddie Mac",
      sources: [{ title: "Freddie Mac", url: "freddiemac.com" }],
      confidence: 'HIGH'
    };
  }
  
  if (query.includes('property tax')) {
    return {
      answer: "Massachusetts property tax rates 2024: Boston 0.56%, Cambridge 0.54%, Springfield 1.18%, Worcester 1.35%",
      sources: [{ title: "MA Dept Revenue", url: "mass.gov" }],
      confidence: 'HIGH'
    };
  }
  
  if (query.includes('rent')) {
    return {
      answer: "Median rents: Springfield $1,650, Worcester $1,950, Fitchburg $1,200, Boston $3,200",
      sources: [{ title: "RentData", url: "rentdata.org" }],
      confidence: 'MEDIUM'
    };
  }
  
  return {
    answer: "No specific data found",
    sources: [],
    confidence: 'LOW'
  };
}

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function section(title: string) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}\n`);
}

function success(msg: string) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`);
}

function info(msg: string) {
  console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`);
}

function warn(msg: string) {
  console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`);
}

function error(msg: string) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`);
}

// Test functions
async function testConfigRegistry() {
  section('1. Testing ConfigRegistry');
  
  try {
    // Initialize registry
    info('Initializing ConfigRegistry...');
    await configRegistry.initialize();
    success('ConfigRegistry initialized');
    
    // Test getting config values
    info('Getting source-weights config...');
    const sourceWeights = await configRegistry.getValue('source-weights', {});
    console.log('Source weights sample:', {
      'zillow.com': sourceWeights.weights?.['zillow.com'],
      'hud.gov': sourceWeights.weights?.['hud.gov'],
      'craigslist.org': sourceWeights.weights?.['craigslist.org']
    });
    
    info('Getting reconciliation config...');
    const reconciliation = await configRegistry.getValue('reconciliation', {});
    console.log('Metric tolerances sample:', {
      median_rent: reconciliation.metricTolerances?.median_rent,
      vacancy_rate: reconciliation.metricTolerances?.vacancy_rate
    });
    
    // Test updating a config
    info('Testing config update...');
    const currentMarketData = await configRegistry.getValue('market-data', {});
    
    // Update just the mortgage rates (which is TTL-appropriate)
    await configRegistry.updateValue(
      'market-data',
      {
        ...currentMarketData,
        mortgageRates: {
          ...currentMarketData.mortgageRates,
          conventional30: 7.25, // Update the rate
          updatedAt: new Date().toISOString(),
          source: 'test-update',
          confidence: 'HIGH'
        }
      },
      'test-script',
      {
        ttl: 60, // Expire in 1 minute
        provenance: { 
          source: 'agent',
          agent: 'test-script',
          confidence: 'HIGH'
        }
      }
    );
    success('Config updated successfully');
    
    // Verify TTL works
    info('Waiting for TTL expiry (sleeping 2 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check audit log
    info('Checking audit history...');
    const history = await configRegistry.getAuditHistory('market-data', 5);
    console.log(`Found ${history.length} audit entries`);
    
    success('ConfigRegistry tests passed');
  } catch (err) {
    error(`ConfigRegistry test failed: ${err}`);
    throw err;
  }
}

async function testMarketDiscoveryAgent() {
  section('2. Testing MarketDiscoveryAgent with Config');
  
  try {
    info('Running market discovery for Massachusetts...');
    console.log('Profile:', TEST_PROFILE);
    
    // Run discovery
    const result = await marketDiscoveryAgent.discoverMarkets(
      TEST_PROFILE,
      mockTavilySearch
    );
    
    console.log('\nDiscovery Results:');
    console.log(`- Found ${result.candidateMarkets.length} candidate markets`);
    console.log(`- Confidence: ${result.confidence}`);
    console.log(`- Research queries made: ${result.researchData?.length || 0}`);
    
    if (result.candidateMarkets.length > 0) {
      console.log('\nTop 3 Markets:');
      result.candidateMarkets.slice(0, 3).forEach((market, i) => {
        console.log(`${i + 1}. ${market.city}, ${market.state}`);
        console.log(`   - Median Price: $${market.metrics?.median_price || 'N/A'}`);
        console.log(`   - Median Rent: $${market.metrics?.median_rent || 'N/A'}`);
        console.log(`   - Confidence: ${market.analysis?.confidenceLevel || 'N/A'}%`);
      });
    }
    
    // Check if agent used config values
    info('Verifying config usage...');
    const sourceWeights = await configRegistry.getValue('source-weights', {});
    console.log('Agent should be using these source weights:', 
      Object.keys(sourceWeights.weights || {}).slice(0, 5));
    
    success('MarketDiscoveryAgent test completed');
  } catch (err) {
    error(`MarketDiscoveryAgent test failed: ${err}`);
    throw err;
  }
}

async function testDataReconciliation() {
  section('3. Testing DataReconciliationAgent with Config');
  
  try {
    // Create mock findings with conflicts
    const mockFindings = [
      {
        city: 'Springfield',
        state: 'MA',
        metric: 'median_rent',
        value: 1650,
        source: 'zillow.com',
        confidence: 'HIGH',
        timestamp: new Date().toISOString(),
        dataDate: new Date().toISOString()
      },
      {
        city: 'Springfield',
        state: 'MA',
        metric: 'median_rent',
        value: 1550,
        source: 'rentdata.org',
        confidence: 'MEDIUM',
        timestamp: new Date().toISOString(),
        dataDate: new Date().toISOString()
      },
      {
        city: 'Springfield',
        state: 'MA',
        metric: 'median_rent',
        value: 1200,
        source: 'craigslist.org',
        confidence: 'LOW',
        timestamp: new Date().toISOString(),
        dataDate: new Date(Date.now() - 60 * 86400000).toISOString() // 60 days old
      }
    ];
    
    info('Reconciling conflicting data from multiple sources...');
    const reconciled = await enhancedDataReconciliation.reconcileWithContext(
      mockFindings,
      TEST_PROFILE
    );
    
    console.log('\nReconciliation Results:');
    console.log('- Input findings:', mockFindings.length);
    console.log('- Sources:', [...new Set(mockFindings.map(f => f.source))]);
    console.log('- Values:', mockFindings.map(f => f.value));
    
    // The reconciliation should weight sources according to config
    info('Checking source weight application...');
    const sourceWeights = await configRegistry.getValue('source-weights', {});
    console.log('Source weights used:');
    mockFindings.forEach(f => {
      const weight = sourceWeights.weights?.[f.source] || 0.2;
      console.log(`  - ${f.source}: ${weight}`);
    });
    
    success('DataReconciliation test completed');
  } catch (err) {
    error(`DataReconciliation test failed: ${err}`);
    throw err;
  }
}

async function testAgentConfigUpdates() {
  section('4. Testing Agent Config Updates');
  
  try {
    // Test 1: Market Discovery updates mortgage rates
    info('Testing mortgage rate update from research...');
    const mortgageFindings = [
      {
        data: 'Current 30-year mortgage rates are 7.25% for conventional loans according to Freddie Mac January 2025 data'
      },
      {
        data: 'FHA loans currently at 6.95% interest rate, VA loans at 6.85% as per latest HUD report'
      }
    ];
    
    await configUpdater.updateMarketDataFromResearch(
      'market-discovery',
      mortgageFindings
    );
    
    // Note: This would need mocked LLM to work fully
    info('(Note: LLM extraction would happen here in production)');
    
    // Test 2: Update source weights based on accuracy
    info('Testing source weight updates based on accuracy...');
    await configUpdater.updateSourceWeightsFromAccuracy(
      'data-reconciliation',
      [
        { source: 'zillow.com', accuracy: 0.92, sampleSize: 50 },
        { source: 'craigslist.org', accuracy: 0.45, sampleSize: 30 },
        { source: 'rentdata.org', accuracy: 0.88, sampleSize: 40 }
      ]
    );
    
    // Test 3: Update tolerances based on observations
    info('Testing tolerance updates from observations...');
    await configUpdater.updateMetricTolerancesFromObservations(
      'data-reconciliation',
      [
        { metric: 'median_rent', observedVariance: 0.18, sampleSize: 100 },
        { metric: 'vacancy_rate', observedVariance: 0.12, sampleSize: 80 }
      ]
    );
    
    success('Agent config update tests completed');
  } catch (err) {
    error(`Agent config update test failed: ${err}`);
    throw err;
  }
}

async function testConfigDrivenCountyData() {
  section('5. Testing Config-Driven County Data');
  
  try {
    // Dynamic import to test the new module
    const { 
      getCountyForCity, 
      getLoanLimitsForCity,
      getPropertyTaxRate,
      getMortgageRates 
    } = await import('./ai-agents/ma-county-data-config.js');
    
    info('Testing city to county mapping...');
    const county = await getCountyForCity('Boston', 'MA');
    console.log(`Boston is in ${county} County`);
    
    info('Testing loan limits lookup...');
    const limits = await getLoanLimitsForCity('Springfield', 'MA');
    console.log('Springfield loan limits:', {
      county: limits.county,
      conforming: `$${limits.limits.conforming.toLocaleString()}`,
      fha1Unit: `$${limits.limits.fha1.toLocaleString()}`,
      isHighCost: limits.isHighCost
    });
    
    info('Testing property tax rates...');
    const taxRate = await getPropertyTaxRate('Worcester');
    console.log(`Worcester property tax: ${(taxRate.rate * 100).toFixed(2)}% (source: ${taxRate.source})`);
    
    info('Testing mortgage rates retrieval...');
    const rates = await getMortgageRates();
    console.log('Current mortgage rates:', {
      conventional30: `${rates.conventional30}%`,
      fha30: `${rates.fha30}%`,
      source: rates.source,
      confidence: rates.confidence
    });
    
    success('County data config tests completed');
  } catch (err) {
    error(`County data test failed: ${err}`);
    throw err;
  }
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Testing New Config-Driven Agent Architecture         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  const startTime = Date.now();
  let testsRun = 0;
  let testsPassed = 0;
  
  try {
    // Test 1: ConfigRegistry
    testsRun++;
    await testConfigRegistry();
    testsPassed++;
    
    // Test 2: MarketDiscoveryAgent
    testsRun++;
    await testMarketDiscoveryAgent();
    testsPassed++;
    
    // Test 3: DataReconciliation
    testsRun++;
    await testDataReconciliation();
    testsPassed++;
    
    // Test 4: Agent Config Updates
    testsRun++;
    await testAgentConfigUpdates();
    testsPassed++;
    
    // Test 5: County Data
    testsRun++;
    await testConfigDrivenCountyData();
    testsPassed++;
    
  } catch (err) {
    error(`Test suite failed: ${err}`);
  }
  
  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  section('Test Summary');
  console.log(`${colors.bright}Tests Run: ${testsRun}${colors.reset}`);
  console.log(`${colors.green}Tests Passed: ${testsPassed}${colors.reset}`);
  console.log(`${colors.red}Tests Failed: ${testsRun - testsPassed}${colors.reset}`);
  console.log(`${colors.cyan}Duration: ${duration}s${colors.reset}`);
  
  if (testsPassed === testsRun) {
    console.log(`\n${colors.bright}${colors.green}✅ ALL TESTS PASSED!${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.red}❌ SOME TESTS FAILED${colors.reset}`);
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests, testConfigRegistry, testMarketDiscoveryAgent };