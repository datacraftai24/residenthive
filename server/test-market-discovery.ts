/**
 * Test Script for Market Discovery Agent
 * 
 * Purpose: Test and validate the market discovery pipeline with detailed logging
 * Outputs: Detailed prompts and responses to text files for validation
 */

import { marketDiscoveryAgent } from './ai-agents/market-discovery-agent.js';
import { enhancedDataReconciliation } from './ai-agents/data-reconciliation-enhanced.js';
import { promises as fs } from 'fs';
import * as path from 'path';

// Test investor profile (Sarah from MA)
const TEST_PROFILE = {
  availableCash: 250000,
  monthlyIncomeTarget: 2500,
  location: 'Massachusetts',
  timeline: '3 months',
  willingToOwnerOccupy: false,
  investmentExperience: 'beginner',
  investmentGoals: 'cash flow focused'
};

// Mock Tavily search function with logging
async function mockTavilySearch(query: string): Promise<any> {
  console.log(`   📡 Searching: "${query.substring(0, 80)}..."`);
  
  // Log query to file
  await appendToLog('queries', `\n${'='.repeat(80)}\nQUERY: ${query}\nTIMESTAMP: ${new Date().toISOString()}\n`);
  
  // Simulate different responses based on query content
  let mockResponse: any = {};
  
  if (query.includes('median home prices')) {
    mockResponse = {
      answer: "According to Zillow data from Q4 2024, Massachusetts cities with median home prices under $500,000 include: Springfield ($340,000), Worcester ($425,000), Fitchburg ($285,000), New Bedford ($365,000), Holyoke ($275,000), Lawrence ($380,000), and Lowell ($445,000). Boston and Cambridge exceed $800,000.",
      sources: [
        { title: "Zillow Market Report Q4 2024", url: "zillow.com/ma/home-values" },
        { title: "Massachusetts Housing Data", url: "mass.gov/housing-statistics" }
      ],
      confidence: 'HIGH'
    };
  } 
  else if (query.includes('rent') || query.includes('rental')) {
    mockResponse = {
      answer: "Massachusetts cities with strong rent-to-price ratios (above 0.7%) include: Springfield (0.85% with median rent $1,650), Worcester (0.72% with median rent $1,950), New Bedford (0.78% with median rent $1,500), and Fitchburg (0.88% with median rent $1,200). Data from RentData.org and Apartments.com December 2024.",
      sources: [
        { title: "RentData.org MA Report", url: "rentdata.org/massachusetts" },
        { title: "Apartments.com Market Trends", url: "apartments.com/ma/trends" }
      ],
      confidence: 'HIGH'
    };
  }
  else if (query.includes('vacancy')) {
    mockResponse = {
      answer: "HUD reports Massachusetts vacancy rates for Q4 2024: Springfield 3.2%, Worcester 2.8%, Fitchburg 4.1%, New Bedford 3.5%, Boston 1.9%, Cambridge 1.5%, Lowell 2.9%. The state average is 2.7%, indicating strong rental demand.",
      sources: [
        { title: "HUD Vacancy Report Q4 2024", url: "hud.gov/massachusetts/vacancy" },
        { title: "MA Housing Statistics", url: "census.gov/housing/hvs" }
      ],
      confidence: 'HIGH'
    };
  }
  else if (query.includes('property tax')) {
    mockResponse = {
      answer: "Massachusetts property tax rates by city (2024): Springfield 1.18%, Worcester 1.35%, Fitchburg 1.42%, New Bedford 0.97%, Boston 0.56%, Cambridge 0.54%, Lowell 1.28%. Average effective rate is 1.04% statewide.",
      sources: [
        { title: "MA Department of Revenue", url: "mass.gov/dor/tax-rates" },
        { title: "Tax Foundation Data", url: "taxfoundation.org/ma" }
      ],
      confidence: 'MEDIUM'
    };
  }
  else if (query.includes('ADU') || query.includes('accessory dwelling')) {
    mockResponse = {
      answer: "Cities allowing ADUs by right in MA (as of 2024): Cambridge, Somerville, Newton, Arlington, and Brookline. Springfield and Worcester require special permits. Boston has a pilot program in specific neighborhoods.",
      sources: [
        { title: "MA Smart Growth Toolkit", url: "mass.gov/smart-growth" },
        { title: "Municipal ADU Regulations", url: "mapc.org/adu-regulations" }
      ],
      confidence: 'MEDIUM'
    };
  }
  else if (query.includes('population growth')) {
    mockResponse = {
      answer: "Massachusetts city population growth 2020-2024: Worcester +3.2%, Springfield +1.8%, Lowell +2.5%, Cambridge +4.1%, Boston +2.9%, Fitchburg -0.3%, New Bedford +0.8%. State average +2.1%.",
      sources: [
        { title: "Census Bureau Estimates", url: "census.gov/quickfacts/MA" }
      ],
      confidence: 'HIGH'
    };
  }
  else if (query.includes('inventory') || query.includes('listings')) {
    mockResponse = {
      answer: "Active MLS listings under $500k (December 2024): Springfield 87 properties, Worcester 62, Fitchburg 43, New Bedford 71, Lowell 38, Lawrence 55. Days on market average: 21-35 days.",
      sources: [
        { title: "MLS Statistics December 2024", url: "mlspin.com/statistics" },
        { title: "Redfin Market Data", url: "redfin.com/ma/housing-market" }
      ],
      confidence: 'HIGH'
    };
  }
  else {
    mockResponse = {
      answer: "Limited data available for this specific query.",
      sources: [],
      confidence: 'LOW'
    };
  }
  
  // Log response to file
  await appendToLog('responses', `\nRESPONSE TO: ${query.substring(0, 60)}...\n${JSON.stringify(mockResponse, null, 2)}\n`);
  
  return mockResponse;
}

// Logging helper
async function appendToLog(type: string, content: string) {
  const logDir = 'logs/market-discovery';
  await fs.mkdir(logDir, { recursive: true });
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${type}-${timestamp}.txt`;
  const filepath = path.join(logDir, filename);
  
  await fs.appendFile(filepath, content, 'utf-8');
}

// Main test function
async function testMarketDiscovery() {
  console.log('\n🚀 STARTING MARKET DISCOVERY TEST\n');
  console.log('📋 Test Profile:', JSON.stringify(TEST_PROFILE, null, 2));
  
  // Initialize log files
  const testStartTime = new Date().toISOString();
  await appendToLog('session', `
${'='.repeat(80)}
MARKET DISCOVERY TEST SESSION
Started: ${testStartTime}
${'='.repeat(80)}

INVESTOR PROFILE:
${JSON.stringify(TEST_PROFILE, null, 2)}

${'='.repeat(80)}
`);

  try {
    // STEP 1: Run Market Discovery Agent
    console.log('\n📍 PHASE 1: MARKET DISCOVERY\n');
    
    // We'll intercept at the agent level instead of replacing the module
    let llmCallCount = 0;
    
    // Run market discovery
    const discoveryResult = await marketDiscoveryAgent.discoverMarkets(
      TEST_PROFILE,
      mockTavilySearch
    );
    
    // Log discovery results
    await appendToLog('discovery-results', `
${'='.repeat(80)}
MARKET DISCOVERY RESULTS
${'='.repeat(80)}

TOP CANDIDATE MARKETS:
${JSON.stringify(discoveryResult.candidateMarkets, null, 2)}

ELIMINATED MARKETS:
${JSON.stringify(discoveryResult.eliminatedMarkets, null, 2)}

DATA QUALITY:
${JSON.stringify(discoveryResult.dataValidation, null, 2)}

METHODOLOGY:
${discoveryResult.methodology}

CONFIDENCE: ${discoveryResult.confidence}

DATA GAPS:
${JSON.stringify(discoveryResult.dataGaps, null, 2)}

TIMESTAMP: ${new Date().toISOString()}
`);
    
    console.log('\n✅ Market Discovery Complete');
    console.log(`   Found ${discoveryResult.candidateMarkets.length} candidate markets`);
    console.log(`   Confidence: ${discoveryResult.confidence}`);
    
    // STEP 2: Run Data Reconciliation
    console.log('\n📍 PHASE 2: DATA RECONCILIATION\n');
    
    // Convert discovery findings to format for reconciliation
    const rawFindings = discoveryResult.researchData.flatMap((rd: any) => {
      // Extract city mentions from the answer
      const cities = extractCitiesFromText(rd.rawData?.answer || '');
      return cities.map(city => ({
        city: city.name,
        state: 'MA',
        metric: rd.query.metric || 'unknown',
        value: city.value,
        source: rd.rawData?.sources?.[0]?.url || 'unknown',
        confidence: rd.rawData?.confidence || 'LOW',
        timestamp: new Date().toISOString(),
        rawText: rd.rawData?.answer
      }));
    });
    
    // Run reconciliation
    const reconciliationResult = await enhancedDataReconciliation.reconcileWithContext(
      rawFindings,
      TEST_PROFILE
    );
    
    // Log reconciliation results
    await appendToLog('reconciliation-results', `
${'='.repeat(80)}
DATA RECONCILIATION RESULTS
${'='.repeat(80)}

INVESTOR CONTEXT:
${JSON.stringify(reconciliationResult.investorContext, null, 2)}

CITY SUMMARIES:
${JSON.stringify(reconciliationResult.citySummaries, null, 2)}

CRITICAL ISSUES:
${JSON.stringify(reconciliationResult.criticalIssues, null, 2)}

SAMPLE RECONCILED METRICS:
${JSON.stringify(reconciliationResult.reconciledMetrics.slice(0, 5), null, 2)}

TIMESTAMP: ${new Date().toISOString()}
`);
    
    console.log('\n✅ Data Reconciliation Complete');
    console.log(`   Processed ${reconciliationResult.reconciledMetrics.length} metrics`);
    console.log(`   Critical issues: ${reconciliationResult.criticalIssues.length}`);
    
    // STEP 3: Generate Summary
    const summary = generateTestSummary(discoveryResult, reconciliationResult);
    await appendToLog('summary', summary);
    
    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE - Check logs/market-discovery/ for detailed output');
    console.log('='.repeat(80));
    
    console.log('\nLog files created:');
    console.log('  - queries-*.txt: All search queries sent to Tavily');
    console.log('  - responses-*.txt: All responses from Tavily');
    console.log('  - llm-prompts-*.txt: All prompts sent to LLM');
    console.log('  - llm-responses-*.txt: All LLM responses');
    console.log('  - discovery-results-*.txt: Final discovery output');
    console.log('  - reconciliation-results-*.txt: Reconciliation output');
    console.log('  - summary-*.txt: Executive summary');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await appendToLog('errors', `
ERROR: ${error.message}
STACK: ${error.stack}
TIMESTAMP: ${new Date().toISOString()}
`);
  }
}

// Helper: Extract cities and values from text
function extractCitiesFromText(text: string): Array<{name: string, value: any}> {
  const cities: Array<{name: string, value: any}> = [];
  
  // Common MA cities to look for
  const cityNames = [
    'Springfield', 'Worcester', 'Boston', 'Cambridge', 
    'Fitchburg', 'New Bedford', 'Holyoke', 'Lawrence', 
    'Lowell', 'Somerville', 'Newton', 'Arlington'
  ];
  
  cityNames.forEach(city => {
    if (text.includes(city)) {
      // Try to extract associated value (price, rent, rate)
      const patterns = [
        new RegExp(`${city}[^$]*(\\$[\\d,]+)`, 'i'),
        new RegExp(`${city}[^\\d]*(\\d+\\.\\d+%)`, 'i'),
        new RegExp(`${city}[^\\d]*(\\d+\\.\\d+)`, 'i'),
        new RegExp(`${city}[^\\d]*(\\d+)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          cities.push({
            name: city,
            value: match[1]
          });
          break;
        }
      }
    }
  });
  
  return cities;
}

// Generate executive summary
function generateTestSummary(discovery: any, reconciliation: any): string {
  return `
${'='.repeat(80)}
EXECUTIVE SUMMARY - MARKET DISCOVERY TEST
${'='.repeat(80)}

TEST PROFILE:
- Available Cash: $${TEST_PROFILE.availableCash.toLocaleString()}
- Income Goal: $${TEST_PROFILE.monthlyIncomeTarget.toLocaleString()}/month
- Location: ${TEST_PROFILE.location}
- Timeline: ${TEST_PROFILE.timeline}

DISCOVERY RESULTS:
- Markets Discovered: ${discovery.candidateMarkets.length}
- Top Market: ${discovery.candidateMarkets[0]?.city || 'None'}, ${discovery.candidateMarkets[0]?.state || ''}
- Score: ${discovery.candidateMarkets[0]?.analysis?.confidenceLevel || 0}
- Confidence: ${discovery.confidence}
- Data Gaps: ${discovery.dataGaps?.length || 0}

RECONCILIATION RESULTS:
- Metrics Processed: ${reconciliation.reconciledMetrics.length}
- Critical Metrics: ${reconciliation.investorContext.criticalMetrics.join(', ')}
- Top City Score: ${reconciliation.citySummaries[0]?.investorScore || 0}
- Critical Issues: ${reconciliation.criticalIssues.length}

KEY FINDINGS:
${discovery.candidateMarkets.slice(0, 3).map((m: any, i: number) => `
${i + 1}. ${m.city}, ${m.state}
   - Median Price: ${m.metrics?.median_price ? '$' + m.metrics.median_price.toLocaleString() : 'Unknown'}
   - Median Rent: ${m.metrics?.median_rent ? '$' + m.metrics.median_rent : 'Unknown'}
   - Confidence: ${m.analysis?.confidenceLevel || 0}%
   - Recommendation: ${m.recommendation}
`).join('')}

CRITICAL ISSUES:
${reconciliation.criticalIssues.slice(0, 5).map((issue: string) => `- ${issue}`).join('\n')}

VALIDATION STATUS:
- Query Generation: ${discovery.discoveryQueries?.length > 0 ? '✅ PASS' : '❌ FAIL'}
- Multi-Source Research: ${discovery.researchData?.length > 0 ? '✅ PASS' : '❌ FAIL'}
- Data Reconciliation: ${reconciliation.reconciledMetrics?.length > 0 ? '✅ PASS' : '❌ FAIL'}
- Investor Awareness: ${reconciliation.investorContext?.criticalMetrics?.length > 0 ? '✅ PASS' : '❌ FAIL'}

TIMESTAMP: ${new Date().toISOString()}
${'='.repeat(80)}
`;
}

// Run the test
testMarketDiscovery().catch(console.error);

export { testMarketDiscovery };