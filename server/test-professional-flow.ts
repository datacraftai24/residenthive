/**
 * Test the complete professional investment strategy flow
 * Strategy Builder v3 -> Property Hunter v3 -> Property Evaluator v3
 */

import { strategyBuilderV3 } from './ai-agents/strategy-builder-v3.js';
import { propertyHunterV3 } from './agents/property-hunter-v3.js';
import { propertyEvaluatorV3 } from './agents/property-evaluator-v3.js';
import { reportGeneratorClean } from './agents/report-generator-clean.js';
import * as fs from 'fs';
import * as path from 'path';

// Load env variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testProfessionalFlow() {
  console.log(`
==========================================
 PROFESSIONAL INVESTMENT STRATEGY TEST
==========================================
`);
  
  // Test profile
  const clientProfile = {
    availableCash: 250000,
    monthlyIncomeTarget: 2000,
    location: 'Worcester, MA',
    creditScore: 740,
    willingToRenovate: true,
    usePropertyManagement: false
  };
  
  console.log('📋 Client Profile:');
  console.log(`   Capital: $${clientProfile.availableCash.toLocaleString()}`);
  console.log(`   Income Goal: $${clientProfile.monthlyIncomeTarget}/mo`);
  console.log(`   Location: ${clientProfile.location}`);
  console.log(`   Credit: ${clientProfile.creditScore}`);
  
  try {
    // Step 1: Generate strategies
    console.log(`
==========================================
 STEP 1: STRATEGY GENERATION
==========================================
`);
    
    const strategies = await strategyBuilderV3.generateStrategies(clientProfile);
    
    console.log(`\n✅ Generated ${strategies.length} strategies:`);
    strategies.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} [${s.status}]`);
      if (s.status === 'READY') {
        console.log(`      Buy Box: ${s.buy_box.property_types.join(', ')}`);
        console.log(`      Price: $${s.buy_box.min_price?.toLocaleString() || 0} - $${s.buy_box.max_price.toLocaleString()}`);
        console.log(`      Markets: ${s.buy_box.submarkets.slice(0, 3).join(', ')}`);
      }
    });
    
    // Step 2: Search properties
    console.log(`
==========================================
 STEP 2: PROPERTY SEARCH
==========================================
`);
    
    const propertyMap = await propertyHunterV3.searchMultipleStrategies(strategies);
    
    console.log(`\n✅ Search Results:`);
    for (const [strategyId, properties] of propertyMap) {
      const strategy = strategies.find(s => s.id === strategyId);
      console.log(`   ${strategy?.name}: ${properties.length} properties found`);
      
      if (properties.length > 0) {
        const sample = properties[0];
        console.log(`      Sample: $${sample.price.toLocaleString()} - ${sample.units} units`);
        
        // Show MLS data structure
        console.log(`      MLS fields available:`, Object.keys(sample.mls_data).slice(0, 10).join(', '));
      }
    }
    
    // Step 3: Evaluate and decide
    console.log(`
==========================================
 STEP 3: EVALUATION & DECISION
==========================================
`);
    
    const decision = await propertyEvaluatorV3.evaluateAndDecide(
      propertyMap,
      strategies,
      clientProfile
    );
    
    console.log(`\n🏆 WINNING STRATEGY: ${decision.winning_strategy.strategy_name}`);
    console.log(`   Properties Passing: ${decision.winning_strategy.properties_passing}/${decision.winning_strategy.properties_evaluated}`);
    console.log(`   Avg Cashflow: $${decision.winning_strategy.avg_cashflow}/mo`);
    console.log(`   Avg Cap Rate: ${(decision.winning_strategy.avg_cap_rate * 100).toFixed(1)}%`);
    console.log(`   Confidence: ${decision.confidence}%`);
    
    console.log(`\n📊 Strategy Comparison:`);
    decision.all_strategies.forEach((s, i) => {
      const status = s.properties_passing > 0 ? '✅' : '❌';
      console.log(`   ${i + 1}. ${s.strategy_name} ${status}`);
      console.log(`      Properties: ${s.properties_passing}/${s.properties_evaluated}`);
      console.log(`      Avg Cashflow: $${s.avg_cashflow}/mo`);
    });
    
    console.log(`\n🏠 Top Properties:`);
    decision.top_properties.forEach((p, i) => {
      console.log(`   ${i + 1}. Property ${p.property_id}`);
      console.log(`      Strategy: ${strategies.find(s => s.id === p.strategy_id)?.name}`);
      console.log(`      Cashflow: $${p.monthly_cashflow}/mo`);
      console.log(`      Cap Rate: ${(p.cap_rate * 100).toFixed(1)}%`);
      console.log(`      Score: ${p.overall_score}/100`);
      console.log(`      Recommendation: ${p.recommendation}`);
    });
    
    // Step 4: Generate report
    console.log(`
==========================================
 STEP 4: REPORT GENERATION
==========================================
`);
    
    const report = reportGeneratorClean.generateReport(decision, clientProfile, strategies);
    
    // Save report
    const timestamp = Date.now();
    const reportPath = `./strategy-logs/test-report-${timestamp}.md`;
    fs.writeFileSync(reportPath, report);
    
    console.log(`\n✅ Report saved to: ${reportPath}`);
    console.log(`   Length: ${report.length} characters`);
    console.log(`   Lines: ${report.split('\n').length}`);
    
    // Show report preview
    const preview = report.split('\n').slice(0, 20).join('\n');
    console.log(`\n📄 Report Preview:`);
    console.log(preview);
    
    // Summary
    console.log(`
==========================================
 TEST SUMMARY
==========================================

✅ Strategy Generation: ${strategies.length} strategies created
✅ Property Search: ${Array.from(propertyMap.values()).reduce((sum, props) => sum + props.length, 0)} total properties found
✅ Evaluation: ${decision.all_strategies.reduce((sum, s) => sum + s.properties_passing, 0)} properties passed criteria
✅ Decision: ${decision.winning_strategy.strategy_name} selected
✅ Report: Generated successfully

Recommendation: ${decision.recommendation}
Confidence: ${decision.confidence}%

Next Steps:
${decision.next_steps.map(s => `• ${s}`).join('\n')}
`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run test
testProfessionalFlow()
  .then(() => {
    console.log('\n✅ Professional flow test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Professional flow test failed:', error);
    process.exit(1);
  });