/**
 * Direct Test - Just Run The Agents
 */

import { marketDiscoveryAgent } from './ai-agents/market-discovery-agent.js';
import { enhancedDataReconciliation } from './ai-agents/data-reconciliation-enhanced.js';
import { promises as fs } from 'fs';

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
async function mockTavilySearch(query: string): Promise<any> {
  await fs.appendFile('test-output.txt', `\nTAVILY QUERY:\n${query}\n`);
  
  if (query.includes('median home prices')) {
    return {
      answer: "Massachusetts cities median home prices December 2024: Springfield $340,000, Worcester $425,000, Fitchburg $285,000, New Bedford $365,000",
      sources: [{ title: "Zillow", url: "zillow.com" }],
      confidence: 'HIGH'
    };
  }
  if (query.includes('rent')) {
    return {
      answer: "Median rents: Springfield $1,650, Worcester $1,950, Fitchburg $1,200, New Bedford $1,500",
      sources: [{ title: "RentData", url: "rentdata.org" }],
      confidence: 'HIGH'
    };
  }
  if (query.includes('vacancy')) {
    return {
      answer: "Vacancy rates: Springfield 3.2%, Worcester 2.8%, Fitchburg 4.1%, New Bedford 3.5%",
      sources: [{ title: "HUD", url: "hud.gov" }],
      confidence: 'HIGH'
    };
  }
  return { answer: "No data", sources: [], confidence: 'LOW' };
}

// Run
async function run() {
  await fs.writeFile('test-output.txt', `TEST RUN: ${new Date().toISOString()}\n\nPROFILE:\n${JSON.stringify(TEST_PROFILE, null, 2)}\n`);
  
  console.log('Running Market Discovery...');
  const discovery = await marketDiscoveryAgent.discoverMarkets(TEST_PROFILE, mockTavilySearch);
  
  await fs.appendFile('test-output.txt', `\n\nDISCOVERY RESULT:\n${JSON.stringify(discovery, null, 2)}\n`);
  
  console.log('Running Data Reconciliation...');
  const rawFindings = [];
  ['Springfield', 'Worcester', 'Fitchburg', 'New Bedford'].forEach(city => {
    rawFindings.push(
      { city, state: 'MA', metric: 'median_home_price', value: 340000, source: 'zillow.com', confidence: 'HIGH', timestamp: new Date().toISOString() },
      { city, state: 'MA', metric: 'median_rent', value: 1650, source: 'rentdata.org', confidence: 'HIGH', timestamp: new Date().toISOString() },
      { city, state: 'MA', metric: 'vacancy_rate', value: 3.2, source: 'hud.gov', confidence: 'HIGH', timestamp: new Date().toISOString() }
    );
  });
  
  const reconciled = await enhancedDataReconciliation.reconcileWithContext(rawFindings, TEST_PROFILE);
  
  await fs.appendFile('test-output.txt', `\n\nRECONCILED:\n${JSON.stringify(reconciled, null, 2)}\n`);
  
  console.log('Done! Check test-output.txt');
}

run().catch(console.error);