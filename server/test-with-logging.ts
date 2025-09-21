/**
 * Test with Console Logging
 */

import { promises as fs } from 'fs';

// Temporarily patch console.log to also write to file
const originalLog = console.log;
const logFile = 'market-discovery-full-log.txt';

// Clear log file
await fs.writeFile(logFile, `TEST LOG STARTED: ${new Date().toISOString()}\n\n`);

// Override console.log to capture everything
console.log = (...args: any[]) => {
  const message = args.map((arg: any) => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  // Write to file
  fs.appendFile(logFile, message + '\n').catch(() => {});
  
  // Also write to original console
  originalLog(...args);
};

// Now import and run the agent - it will log everything via console.log
const { marketDiscoveryAgent } = await import('./ai-agents/market-discovery-agent.js');
const { tracedLLMCall } = await import('./observability/llm-tracer.js');

// Patch tracedLLMCall to log prompts
const originalTracedLLMCall = tracedLLMCall;
(await import('./observability/llm-tracer.js') as any).tracedLLMCall = async (params: any) => {
  console.log('\n================================================================================');
  console.log('LLM CALL:', params.agentName);
  console.log('================================================================================');
  console.log('\nSYSTEM PROMPT:');
  console.log(params.systemPrompt);
  console.log('\nUSER PROMPT:');
  console.log(params.userPrompt);
  console.log('\nPARAMETERS:');
  console.log(`Model: ${params.model}, Temperature: ${params.temperature}, Format: ${params.responseFormat}`);
  console.log('--------------------------------------------------------------------------------');
  
  const result = await originalTracedLLMCall(params);
  
  console.log('\nLLM RESPONSE:');
  console.log(result.content);
  console.log(`\nTokens: ${result.tokensUsed.total}, Cost: $${result.cost.total.toFixed(4)}`);
  console.log('================================================================================\n');
  
  return result;
};

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

// Mock Tavily
async function mockTavily(query: string): Promise<any> {
  console.log(`\nTAVILY QUERY: ${query}`);
  
  if (query.includes('median home prices')) {
    return {
      answer: "Massachusetts cities median home prices December 2024: Springfield $340,000, Worcester $425,000, Fitchburg $285,000",
      sources: [{ title: "Zillow", url: "zillow.com" }],
      confidence: 'HIGH'
    };
  }
  if (query.includes('rent')) {
    return {
      answer: "Median rents: Springfield $1,650, Worcester $1,950, Fitchburg $1,200",
      sources: [{ title: "RentData", url: "rentdata.org" }],
      confidence: 'HIGH'
    };
  }
  return { answer: "No data", sources: [], confidence: 'LOW' };
}

// Run
console.log('STARTING TEST WITH PROFILE:', TEST_PROFILE);
const result = await marketDiscoveryAgent.discoverMarkets(TEST_PROFILE, mockTavily);
console.log('\n\nFINAL RESULT:', result);

console.log('\n\nTest complete! Check market-discovery-full-log.txt for all details');

// Restore console.log
console.log = originalLog;