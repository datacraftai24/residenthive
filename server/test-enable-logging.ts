/**
 * Test with Logging Enabled
 */

// Set environment variable to enable logging
process.env.LOG_LLM_PROMPTS = 'true';

// Import after setting env var
const { marketDiscoveryAgent } = await import('./ai-agents/market-discovery-agent.js');

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

// Mock Tavily that logs queries
async function mockTavily(query: string): Promise<any> {
  console.log(`\n📡 TAVILY SEARCH QUERY:\n${query}\n`);
  
  if (query.includes('median home prices')) {
    const response = {
      answer: "Massachusetts cities median home prices December 2024: Springfield $340,000, Worcester $425,000, Fitchburg $285,000",
      sources: [{ title: "Zillow", url: "zillow.com" }],
      confidence: 'HIGH'
    };
    console.log(`TAVILY RESPONSE: ${JSON.stringify(response, null, 2)}\n`);
    return response;
  }
  
  if (query.includes('rent')) {
    const response = {
      answer: "Median rents: Springfield $1,650, Worcester $1,950, Fitchburg $1,200",
      sources: [{ title: "RentData", url: "rentdata.org" }],
      confidence: 'HIGH'
    };
    console.log(`TAVILY RESPONSE: ${JSON.stringify(response, null, 2)}\n`);
    return response;
  }
  
  const response = { answer: "No data", sources: [], confidence: 'LOW' };
  console.log(`TAVILY RESPONSE: ${JSON.stringify(response, null, 2)}\n`);
  return response;
}

console.log('🚀 STARTING MARKET DISCOVERY TEST\n');
console.log('INVESTOR PROFILE:', JSON.stringify(TEST_PROFILE, null, 2), '\n');

try {
  const result = await marketDiscoveryAgent.discoverMarkets(TEST_PROFILE, mockTavily);
  
  console.log('\n✅ DISCOVERY COMPLETE\n');
  console.log('Markets found:', result.candidateMarkets.length);
  console.log('Confidence:', result.confidence);
  console.log('\nTop markets:');
  result.candidateMarkets.slice(0, 3).forEach((m: any, i: number) => {
    console.log(`${i+1}. ${m.city}, ${m.state} - Score: ${m.analysis?.confidenceLevel}%`);
  });
  
} catch (error) {
  console.error('❌ Test failed:', error);
}