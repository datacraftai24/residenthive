/**
 * Market Discovery Test - Pure Logging
 * 
 * Purpose: Run agents and log all prompts/responses to text files
 */

import { marketDiscoveryAgent } from './ai-agents/market-discovery-agent.js';
import { enhancedDataReconciliation } from './ai-agents/data-reconciliation-enhanced.js';
import { promises as fs } from 'fs';
import * as path from 'path';

// Test investor profile
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
  const timestamp = new Date().toISOString();
  
  // Log the query
  await fs.appendFile('market-discovery-log.txt', `
================================================================================
TAVILY QUERY [${timestamp}]
================================================================================
${query}

`);
  
  let response: any = {};
  
  // Return mock data based on query
  if (query.includes('median home prices')) {
    response = {
      answer: "According to Zillow data from December 2024, Massachusetts cities with median home prices under $500,000 include: Springfield ($340,000), Worcester ($425,000), Fitchburg ($285,000), New Bedford ($365,000), Holyoke ($275,000), Lawrence ($380,000), and Lowell ($445,000). Boston and Cambridge exceed $800,000.",
      sources: [
        { title: "Zillow Market Report Q4 2024", url: "zillow.com/ma/home-values" },
        { title: "Massachusetts Housing Data", url: "mass.gov/housing-statistics" }
      ],
      confidence: 'HIGH'
    };
  } else if (query.includes('rent') || query.includes('rental')) {
    response = {
      answer: "Massachusetts cities with strong rent-to-price ratios (above 0.7%) include: Springfield (0.85% with median rent $1,650), Worcester (0.72% with median rent $1,950), New Bedford (0.78% with median rent $1,500), and Fitchburg (0.88% with median rent $1,200). Data from RentData.org and Apartments.com December 2024.",
      sources: [
        { title: "RentData.org MA Report", url: "rentdata.org/massachusetts" },
        { title: "Apartments.com Market Trends", url: "apartments.com/ma/trends" }
      ],
      confidence: 'HIGH'
    };
  } else if (query.includes('vacancy')) {
    response = {
      answer: "HUD reports Massachusetts vacancy rates for Q4 2024: Springfield 3.2%, Worcester 2.8%, Fitchburg 4.1%, New Bedford 3.5%, Boston 1.9%, Cambridge 1.5%, Lowell 2.9%. The state average is 2.7%, indicating strong rental demand.",
      sources: [
        { title: "HUD Vacancy Report Q4 2024", url: "hud.gov/massachusetts/vacancy" },
        { title: "MA Housing Statistics", url: "census.gov/housing/hvs" }
      ],
      confidence: 'HIGH'
    };
  } else if (query.includes('property tax')) {
    response = {
      answer: "Massachusetts property tax rates by city (2024): Springfield 1.18%, Worcester 1.35%, Fitchburg 1.42%, New Bedford 0.97%, Boston 0.56%, Cambridge 0.54%, Lowell 1.28%. Average effective rate is 1.04% statewide.",
      sources: [
        { title: "MA Department of Revenue", url: "mass.gov/dor/tax-rates" },
        { title: "Tax Foundation Data", url: "taxfoundation.org/ma" }
      ],
      confidence: 'MEDIUM'
    };
  } else if (query.includes('population growth')) {
    response = {
      answer: "Massachusetts city population growth 2020-2024: Worcester +3.2%, Springfield +1.8%, Lowell +2.5%, Cambridge +4.1%, Boston +2.9%, Fitchburg -0.3%, New Bedford +0.8%. State average +2.1%.",
      sources: [
        { title: "Census Bureau Estimates", url: "census.gov/quickfacts/MA" }
      ],
      confidence: 'HIGH'
    };
  } else if (query.includes('inventory') || query.includes('listings')) {
    response = {
      answer: "Active MLS listings under $500k (December 2024): Springfield 87 properties, Worcester 62, Fitchburg 43, New Bedford 71, Lowell 38, Lawrence 55. Days on market average: 21-35 days.",
      sources: [
        { title: "MLS Statistics December 2024", url: "mlspin.com/statistics" },
        { title: "Redfin Market Data", url: "redfin.com/ma/housing-market" }
      ],
      confidence: 'HIGH'
    };
  } else {
    response = {
      answer: "Limited data available for this specific query.",
      sources: [],
      confidence: 'LOW'
    };
  }
  
  // Log the response
  await fs.appendFile('market-discovery-log.txt', `TAVILY RESPONSE:
${JSON.stringify(response, null, 2)}

`);
  
  return response;
}

// Intercept and log LLM calls
async function loggedLLMCall(originalCall: Function) {
  return async (params: any) => {
    const timestamp = new Date().toISOString();
    
    // Log the prompt
    await fs.appendFile('market-discovery-log.txt', `
================================================================================
LLM PROMPT [${timestamp}]
Agent: ${params.agentName}
Model: ${params.model}
Temperature: ${params.temperature}
================================================================================

SYSTEM PROMPT:
${params.systemPrompt}

USER PROMPT:
${params.userPrompt}

`);
    
    // Call original
    const result = await originalCall(params);
    
    // Log the response
    await fs.appendFile('market-discovery-log.txt', `LLM RESPONSE:
${result.content}

Tokens: ${JSON.stringify(result.tokensUsed)}
Cost: ${JSON.stringify(result.cost)}

`);
    
    return result;
  };
}

// Main test
async function runTest() {
  const startTime = new Date().toISOString();
  
  // Initialize log file
  await fs.writeFile('market-discovery-log.txt', `
================================================================================
MARKET DISCOVERY TEST LOG
Started: ${startTime}
================================================================================

INVESTOR PROFILE:
${JSON.stringify(TEST_PROFILE, null, 2)}

`);
  
  console.log('🚀 Starting Market Discovery Test...');
  console.log('📝 Logging to: market-discovery-log.txt');
  
  try {
    // Intercept LLM calls for logging
    const llmTracer = await import('./observability/llm-tracer.js');
    const originalCall = llmTracer.tracedLLMCall;
    
    // Create wrapper that logs
    const wrappedCall = await loggedLLMCall(originalCall);
    
    // HACK: Override the export (works in Node.js)
    (llmTracer as any).tracedLLMCall = wrappedCall;
    
    // Run Market Discovery
    console.log('\n📍 Running Market Discovery Agent...');
    
    const discoveryResult = await marketDiscoveryAgent.discoverMarkets(
      TEST_PROFILE,
      mockTavilySearch
    );
    
    // Log discovery results
    await fs.appendFile('market-discovery-log.txt', `
================================================================================
MARKET DISCOVERY RESULTS
================================================================================
${JSON.stringify(discoveryResult, null, 2)}

`);
    
    console.log(`✅ Discovery complete - found ${discoveryResult.candidateMarkets.length} markets`);
    
    // Run Data Reconciliation
    console.log('\n📍 Running Data Reconciliation...');
    
    // Extract raw findings from discovery
    const rawFindings: any[] = [];
    const cities = ['Springfield', 'Worcester', 'Fitchburg', 'New Bedford', 'Lowell', 'Lawrence'];
    
    discoveryResult.researchData.forEach((rd: any) => {
      cities.forEach(city => {
        if (rd.rawData?.answer?.includes(city)) {
          // Try to extract value
          const priceMatch = rd.rawData.answer.match(new RegExp(`${city}[^$]*(\\$[\\d,]+)`));
          const percentMatch = rd.rawData.answer.match(new RegExp(`${city}[^\\d]*(\\d+\\.\\d+%)`));
          const numberMatch = rd.rawData.answer.match(new RegExp(`${city}[^\\d]*(\\d+)`));
          
          rawFindings.push({
            city,
            state: 'MA',
            metric: rd.query.metric || 'unknown',
            value: priceMatch?.[1] || percentMatch?.[1] || numberMatch?.[1] || null,
            source: rd.rawData?.sources?.[0]?.url || 'unknown',
            confidence: rd.rawData?.confidence || 'LOW',
            timestamp: new Date().toISOString(),
            rawText: rd.rawData?.answer
          });
        }
      });
    });
    
    const reconciliationResult = await enhancedDataReconciliation.reconcileWithContext(
      rawFindings,
      TEST_PROFILE
    );
    
    // Log reconciliation results
    await fs.appendFile('market-discovery-log.txt', `
================================================================================
DATA RECONCILIATION RESULTS
================================================================================
${JSON.stringify(reconciliationResult, null, 2)}

`);
    
    console.log(`✅ Reconciliation complete - processed ${reconciliationResult.reconciledMetrics.length} metrics`);
    
    // Final summary
    await fs.appendFile('market-discovery-log.txt', `
================================================================================
TEST SUMMARY
================================================================================
Completed: ${new Date().toISOString()}
Markets Discovered: ${discoveryResult.candidateMarkets.length}
Metrics Reconciled: ${reconciliationResult.reconciledMetrics.length}
Critical Issues: ${reconciliationResult.criticalIssues.length}

TOP 3 MARKETS:
${discoveryResult.candidateMarkets.slice(0, 3).map((m: any, i: number) => `
${i + 1}. ${m.city}, ${m.state}
   - Median Price: $${m.metrics?.median_price || 'Unknown'}
   - Median Rent: $${m.metrics?.median_rent || 'Unknown'}
   - Score: ${m.analysis?.confidenceLevel || 0}%`).join('\n')}

CRITICAL ISSUES:
${reconciliationResult.criticalIssues.slice(0, 5).map((issue: string) => `- ${issue}`).join('\n')}

================================================================================
`);
    
    // Restore original
    (llmTracer as any).tracedLLMCall = originalCall;
    
    console.log('\n✅ Test complete! Check market-discovery-log.txt for full details');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    await fs.appendFile('market-discovery-log.txt', `
================================================================================
ERROR
================================================================================
${error.message}
${error.stack}
`);
  }
}

// Run test
runTest().catch(console.error);

export { runTest };