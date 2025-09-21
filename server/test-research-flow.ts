/**
 * Test Script for Research Coordinator Flow
 * 
 * Purpose: Test and validate the research coordination with detailed logging
 * Demonstrates the actual prompts and responses for validation
 */

import { researchCoordinator } from './ai-agents/research-coordinator.js';
import { smartResearchAgent } from './ai-agents/smart-research-agent.js';
import { promises as fs } from 'fs';
import * as path from 'path';

// Test investor profile (Sarah from MA)
const TEST_PROFILE = {
  id: 'test-sarah',
  availableCash: 250000,
  monthlyIncomeTarget: 2500,
  location: 'Massachusetts',
  creditScore: undefined,
  timeline: '3 months',
  willingToOwnerOccupy: false,
  usePropertyManagement: true
};

// Logging helper
async function appendToLog(filename: string, content: string) {
  const logDir = 'logs/research-test';
  await fs.mkdir(logDir, { recursive: true });
  
  const filepath = path.join(logDir, filename);
  await fs.appendFile(filepath, content, 'utf-8');
}

// Main test function
async function testResearchFlow() {
  console.log('\n🚀 STARTING RESEARCH FLOW TEST\n');
  console.log('📋 Test Profile:', JSON.stringify(TEST_PROFILE, null, 2));
  
  const timestamp = new Date().toISOString();
  
  // Initialize session log
  await appendToLog('session.txt', `
${'='.repeat(80)}
RESEARCH FLOW TEST SESSION
Started: ${timestamp}
${'='.repeat(80)}

INVESTOR PROFILE:
${JSON.stringify(TEST_PROFILE, null, 2)}

${'='.repeat(80)}
`);

  try {
    // Intercept LLM calls for logging
    const originalTracedLLMCall = (await import('./observability/llm-tracer.js')).tracedLLMCall;
    let llmCallCount = 0;
    
    // Create logging wrapper
    const tracedLLMCallWithLogging = async (params: any) => {
      llmCallCount++;
      const callId = `LLM_CALL_${llmCallCount}`;
      const callTimestamp = new Date().toISOString();
      
      // Log the prompt
      await appendToLog('prompts.txt', `
${'='.repeat(80)}
${callId} - ${params.agentName}
Timestamp: ${callTimestamp}
${'='.repeat(80)}

SYSTEM PROMPT:
${params.systemPrompt}

${'='.repeat(50)}

USER PROMPT:
${params.userPrompt}

${'='.repeat(50)}

PARAMETERS:
- Model: ${params.model || 'gpt-4o'}
- Temperature: ${params.temperature || 0.7}
- Response Format: ${params.responseFormat || 'text'}

${'='.repeat(80)}
`);
      
      // Call original function
      const result = await originalTracedLLMCall(params);
      
      // Log the response
      await appendToLog('responses.txt', `
${'='.repeat(80)}
${callId} RESPONSE - ${params.agentName}
Timestamp: ${callTimestamp}
${'='.repeat(80)}

CONTENT:
${result.content}

${'='.repeat(50)}

METADATA:
- Tokens: ${JSON.stringify(result.tokensUsed)}
- Cost: $${result.cost?.total?.toFixed(4) || 'N/A'}
- Response ID: ${result.responseId || 'N/A'}

${'='.repeat(80)}
`);
      
      return result;
    };
    
    // Replace the LLM call function
    require('./observability/llm-tracer.js').tracedLLMCall = tracedLLMCallWithLogging;
    
    // PHASE 1: Research Coordination
    console.log('\n📍 PHASE 1: RESEARCH COORDINATION\n');
    
    const researchNeeds = await researchCoordinator.identifyResearchNeeds(
      TEST_PROFILE,
      ['traditional', 'fha', 'multi-unit', 'house-hack']
    );
    
    console.log(`✅ Research Coordinator identified ${researchNeeds.totalQueries} queries`);
    console.log(`   Estimated research time: ${researchNeeds.estimatedResearchTime}`);
    
    // Log research needs
    await appendToLog('research-needs.txt', `
${'='.repeat(80)}
RESEARCH NEEDS IDENTIFIED
${'='.repeat(80)}

Total Queries: ${researchNeeds.totalQueries}
Estimated Time: ${researchNeeds.estimatedResearchTime}

QUERIES BY PRIORITY:
${'='.repeat(50)}

HIGH PRIORITY:
${researchNeeds.researchQueries
  .filter(q => q.priority === 'HIGH')
  .map((q, i) => `${i+1}. ${q.query}
   Category: ${q.category}
   Required for: ${q.requiredFor.join(', ')}`)
  .join('\n\n')}

MEDIUM PRIORITY:
${researchNeeds.researchQueries
  .filter(q => q.priority === 'MEDIUM')
  .map((q, i) => `${i+1}. ${q.query}
   Category: ${q.category}
   Required for: ${q.requiredFor.join(', ')}`)
  .join('\n\n')}

LOW PRIORITY:
${researchNeeds.researchQueries
  .filter(q => q.priority === 'LOW')
  .map((q, i) => `${i+1}. ${q.query}
   Category: ${q.category}
   Required for: ${q.requiredFor.join(', ')}`)
  .join('\n\n')}

${'='.repeat(80)}
`);
    
    // PHASE 2: Execute Research (sample)
    console.log('\n📍 PHASE 2: SMART RESEARCH EXECUTION\n');
    
    // Take first 3 high-priority queries as sample
    const sampleQueries = researchNeeds.researchQueries
      .filter(q => q.priority === 'HIGH')
      .slice(0, 3)
      .map(q => ({ query: q.query, category: q.category }));
    
    console.log(`   Testing with ${sampleQueries.length} sample queries...`);
    
    const researchResults = await smartResearchAgent.doResearchBatch(sampleQueries);
    
    console.log(`✅ Smart Research Agent completed ${researchResults.length} queries`);
    
    // Log research results
    await appendToLog('research-results.txt', `
${'='.repeat(80)}
SMART RESEARCH RESULTS
${'='.repeat(80)}

${researchResults.map((r, i) => `
QUERY ${i+1}: ${r.question}
${'='.repeat(50)}
Category: ${r.category}
Confidence: ${r.confidence}

ANSWER:
${JSON.stringify(r.answer, null, 2)}

SOURCES:
${r.sources.map(s => `- ${s.title}: ${s.url}`).join('\n')}

${'='.repeat(50)}
`).join('\n')}

${'='.repeat(80)}
`);
    
    // Generate summary
    const summary = `
${'='.repeat(80)}
TEST SUMMARY - RESEARCH FLOW
${'='.repeat(80)}

TEST PROFILE:
- Available Cash: $${TEST_PROFILE.availableCash.toLocaleString()}
- Income Goal: $${TEST_PROFILE.monthlyIncomeTarget.toLocaleString()}/month
- Location: ${TEST_PROFILE.location}
- Timeline: ${TEST_PROFILE.timeline}

RESEARCH COORDINATION:
- Total Queries Generated: ${researchNeeds.totalQueries}
- High Priority: ${researchNeeds.researchQueries.filter(q => q.priority === 'HIGH').length}
- Medium Priority: ${researchNeeds.researchQueries.filter(q => q.priority === 'MEDIUM').length}
- Low Priority: ${researchNeeds.researchQueries.filter(q => q.priority === 'LOW').length}

SAMPLE RESEARCH EXECUTION:
- Queries Tested: ${sampleQueries.length}
- Successful: ${researchResults.filter(r => r.confidence !== 'LOW').length}
- High Confidence: ${researchResults.filter(r => r.confidence === 'HIGH').length}

KEY QUERIES IDENTIFIED:
${researchNeeds.researchQueries.slice(0, 5).map(q => `- ${q.query}`).join('\n')}

VALIDATION STATUS:
- Research Coordination: ${researchNeeds.totalQueries > 0 ? '✅ PASS' : '❌ FAIL'}
- Query Generation: ${researchNeeds.researchQueries.length > 0 ? '✅ PASS' : '❌ FAIL'}
- Smart Research: ${researchResults.length > 0 ? '✅ PASS' : '❌ FAIL'}
- LLM Integration: ${llmCallCount > 0 ? '✅ PASS' : '❌ FAIL'}

Total LLM Calls: ${llmCallCount}
Test Completed: ${new Date().toISOString()}

${'='.repeat(80)}
`;
    
    await appendToLog('summary.txt', summary);
    console.log(summary);
    
    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE - Check logs/research-test/ for detailed output');
    console.log('='.repeat(80));
    
    console.log('\nLog files created:');
    console.log('  📁 logs/research-test/');
    console.log('     ├── session.txt - Test session info');
    console.log('     ├── prompts.txt - All LLM prompts sent');
    console.log('     ├── responses.txt - All LLM responses');
    console.log('     ├── research-needs.txt - Queries identified');
    console.log('     ├── research-results.txt - Research findings');
    console.log('     └── summary.txt - Executive summary');
    
    // Restore original function
    require('./observability/llm-tracer.js').tracedLLMCall = originalTracedLLMCall;
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await appendToLog('errors.txt', `
ERROR: ${error.message}
STACK: ${error.stack}
TIMESTAMP: ${new Date().toISOString()}
`);
  }
}

// Run the test
if (require.main === module) {
  testResearchFlow().catch(console.error);
}

export { testResearchFlow };