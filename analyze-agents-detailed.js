import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function analyzeAgentPerformance() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 DETAILED AGENT-BY-AGENT ANALYSIS');
  console.log('='.repeat(80) + '\n');

  try {
    // Get the most recent session
    const recentSession = await db.execute(sql`
      SELECT DISTINCT session_id, MAX(timestamp) as latest
      FROM llm_decisions
      GROUP BY session_id
      ORDER BY MAX(timestamp) DESC
      LIMIT 1
    `);
    
    const sessionId = recentSession.rows[0]?.session_id;
    if (!sessionId) {
      console.log('No sessions found');
      return;
    }
    
    console.log(`📊 Analyzing Session: ${sessionId}`);
    console.log(`⏰ Time: ${new Date(recentSession.rows[0].latest).toLocaleString()}\n`);

    // Get all decisions from this session with full details
    const decisions = await db.execute(sql`
      SELECT 
        agent_name,
        decision_type,
        user_prompt,
        system_prompt,
        raw_response,
        parsed_response,
        confidence,
        reasoning,
        timestamp
      FROM llm_decisions
      WHERE session_id = ${sessionId}
      ORDER BY timestamp ASC
    `);

    console.log(`Found ${decisions.rows.length} decisions in this session\n`);
    
    // Group by agent
    const agentMap = new Map();
    decisions.rows.forEach(row => {
      if (!agentMap.has(row.agent_name)) {
        agentMap.set(row.agent_name, []);
      }
      agentMap.get(row.agent_name).push(row);
    });

    // Analyze each agent
    let report = `# Agent-by-Agent Performance Analysis
## Session: ${sessionId}
## Date: ${new Date().toLocaleString()}

---

`;

    for (const [agentName, agentDecisions] of agentMap) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🤖 AGENT: ${agentName.toUpperCase()}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Total Decisions: ${agentDecisions.length}`);
      
      report += `\n## 🤖 ${agentName.toUpperCase()}\n`;
      report += `**Total Decisions:** ${agentDecisions.length}\n\n`;

      // Analyze specific decisions for quality
      for (let i = 0; i < Math.min(3, agentDecisions.length); i++) {
        const decision = agentDecisions[i];
        console.log(`\n📋 Decision ${i+1}:`);
        console.log(`Type: ${decision.decision_type}`);
        console.log(`Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
        
        report += `### Decision ${i+1}: ${decision.decision_type}\n`;
        report += `**Confidence:** ${(decision.confidence * 100).toFixed(1)}%\n\n`;
        
        // Extract key info from prompts
        if (decision.user_prompt) {
          const promptInfo = extractKeyInfo(decision.user_prompt);
          console.log('\n📝 Input Context:');
          console.log(`  Property Price: ${promptInfo.price || 'Not found'}`);
          console.log(`  Property Type: ${promptInfo.propertyType || 'Not found'}`);
          console.log(`  User Cash: ${promptInfo.cashAvailable || 'Not found'}`);
          console.log(`  Location: ${promptInfo.location || 'Not found'}`);
          
          report += `#### Input Context:\n`;
          report += `- Property Price: ${promptInfo.price || 'Not found'}\n`;
          report += `- Property Type: ${promptInfo.propertyType || 'Not found'}\n`;
          report += `- User Cash: ${promptInfo.cashAvailable || 'Not found'}\n`;
          report += `- Location: ${promptInfo.location || 'Not found'}\n\n`;
        }
        
        // Analyze the response
        if (decision.parsed_response) {
          const response = decision.parsed_response;
          console.log('\n🎯 Agent Output:');
          
          report += `#### Agent Output:\n`;
          
          // Check for specific agent types
          if (agentName === 'template_evaluator') {
            analyzeTemplateEvaluator(response, report);
          } else if (agentName === 'custom_strategy_generator') {
            analyzeCustomStrategy(response, report);
          } else if (agentName === 'financing_strategist') {
            analyzeFinancingStrategy(response, report);
          } else if (agentName === 'template_adapter') {
            analyzeTemplateAdapter(response, report);
          }
          
          // Check for red flags
          const issues = findIssues(response);
          if (issues.length > 0) {
            console.log('\n⚠️ ISSUES FOUND:');
            report += `\n#### ⚠️ ISSUES:\n`;
            issues.forEach(issue => {
              console.log(`  - ${issue}`);
              report += `- ${issue}\n`;
            });
          }
        }
        
        report += '\n---\n';
      }
      
      // Summary stats for this agent
      const avgConfidence = agentDecisions.reduce((sum, d) => sum + (d.confidence || 0), 0) / agentDecisions.length;
      console.log(`\n📊 Agent Summary:`);
      console.log(`  Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      
      report += `\n### Agent Summary:\n`;
      report += `- Average Confidence: ${(avgConfidence * 100).toFixed(1)}%\n`;
      report += `- Decision Types: ${[...new Set(agentDecisions.map(d => d.decision_type))].join(', ')}\n\n`;
    }

    // Add overall analysis
    report += `\n## 🎯 Overall Analysis\n\n`;
    report += analyzeOverallPatterns(decisions.rows);
    
    // Save report
    const filename = `agent-analysis-${Date.now()}.md`;
    fs.writeFileSync(filename, report);
    console.log(`\n✅ Detailed report saved: ${filename}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

function extractKeyInfo(prompt) {
  const info = {};
  
  // Extract price
  const priceMatch = prompt.match(/Price:\s*\$?([\d,]+)/i);
  if (priceMatch) info.price = '$' + priceMatch[1];
  
  // Extract property type
  const typeMatch = prompt.match(/Type:\s*(\w+)/i);
  if (typeMatch) info.propertyType = typeMatch[1];
  
  // Extract cash available
  const cashMatch = prompt.match(/Cash Available:\s*\$?([\d,]+)/i);
  if (cashMatch) info.cashAvailable = '$' + cashMatch[1];
  
  // Extract location
  const locationMatch = prompt.match(/(?:Address|Location):\s*([^\\n]+)/i);
  if (locationMatch) info.location = locationMatch[1].trim();
  
  // Extract bedrooms/bathrooms
  const bedroomMatch = prompt.match(/(\d+)\s*(?:BR|bedroom)/i);
  if (bedroomMatch) info.bedrooms = bedroomMatch[1];
  
  const bathroomMatch = prompt.match(/(\d+)\s*(?:BA|bathroom)/i);
  if (bathroomMatch) info.bathrooms = bathroomMatch[1];
  
  return info;
}

function analyzeTemplateEvaluator(response, report) {
  if (typeof response === 'string') {
    try {
      response = JSON.parse(response);
    } catch (e) {
      return;
    }
  }
  
  console.log(`  Score: ${response.score || 'N/A'}/100`);
  console.log(`  Selected: ${response.selected ? 'Yes' : 'No'}`);
  
  report += `- **Score:** ${response.score || 'N/A'}/100\n`;
  report += `- **Selected:** ${response.selected ? 'Yes ✅' : 'No ❌'}\n`;
  
  if (response.financials) {
    console.log(`  Down Payment: $${response.financials.downPayment || 0}`);
    console.log(`  Monthly Cash Flow: $${response.financials.monthlyCashFlow || 0}`);
    console.log(`  5-Year ROI: ${response.financials.fiveYearROI || 0}%`);
    
    report += `- **Financial Projections:**\n`;
    report += `  - Down Payment: $${response.financials.downPayment || 0}\n`;
    report += `  - Monthly Income: $${response.financials.monthlyIncome || 0}\n`;
    report += `  - Monthly Expenses: $${response.financials.monthlyExpenses || 0}\n`;
    report += `  - Cash Flow: $${response.financials.monthlyCashFlow || 0}/month\n`;
  }
  
  if (response.rejectionReasons && response.rejectionReasons.length > 0) {
    console.log(`  Rejection Reasons: ${response.rejectionReasons.length}`);
    report += `- **Rejection Reasons:** ${response.rejectionReasons.join('; ')}\n`;
  }
}

function analyzeCustomStrategy(response, report) {
  if (typeof response === 'string') {
    try {
      response = JSON.parse(response);
    } catch (e) {
      return;
    }
  }
  
  console.log(`  Strategy: ${response.strategyName || 'Unknown'}`);
  console.log(`  Score: ${response.score || 0}/100`);
  
  report += `- **Strategy Name:** ${response.strategyName || 'Unknown'}\n`;
  report += `- **Score:** ${response.score || 0}/100\n`;
  
  if (response.financials) {
    console.log(`  Total Investment: $${response.financials.totalInvestment || 0}`);
    console.log(`  Monthly Cash Flow: $${response.financials.monthlyCashFlow || 0}`);
    console.log(`  5-Year ROI: ${response.financials.fiveYearROI || 0}%`);
    
    report += `- **Financials:**\n`;
    report += `  - Total Investment: $${response.financials.totalInvestment || 0}\n`;
    report += `  - Monthly Income: $${response.financials.monthlyIncome || 0}\n`;
    report += `  - Monthly Cash Flow: $${response.financials.monthlyCashFlow || 0}\n`;
    report += `  - Break-even: ${response.financials.breakEvenMonths || 0} months\n`;
  }
}

function analyzeFinancingStrategy(response, report) {
  if (typeof response === 'string') {
    try {
      response = JSON.parse(response);
    } catch (e) {
      return;
    }
  }
  
  console.log(`  Strategy: ${response.strategy || 'Unknown'}`);
  console.log(`  Down Payment: ${response.downPaymentPercent || 0}%`);
  console.log(`  Budget: $${response.budgetMin || 0} - $${response.budgetMax || 0}`);
  
  report += `- **Financing Strategy:** ${response.strategy || 'Unknown'}\n`;
  report += `- **Down Payment:** ${response.downPaymentPercent || 0}%\n`;
  report += `- **Budget Range:** $${response.budgetMin || 0} - $${response.budgetMax || 0}\n`;
  
  if (response.reasoning && response.reasoning.length > 0) {
    report += `- **Reasoning:** ${response.reasoning.join('; ')}\n`;
  }
}

function analyzeTemplateAdapter(response, report) {
  if (typeof response === 'string') {
    try {
      response = JSON.parse(response);
    } catch (e) {
      return;
    }
  }
  
  console.log(`  Adaptation: ${response.adaptationName || 'Unknown'}`);
  console.log(`  Score: ${response.score || 0}/100`);
  
  report += `- **Adaptation Name:** ${response.adaptationName || 'Unknown'}\n`;
  report += `- **Score:** ${response.score || 0}/100\n`;
  report += `- **Additional Opportunity:** ${response.additionalOpportunity || 'None'}\n`;
  
  if (response.financials) {
    console.log(`  Additional Investment: $${response.financials.additionalInvestment || 0}`);
    console.log(`  Improved ROI: ${response.financials.improvedROI || 0}%`);
    
    report += `- **Financial Improvements:**\n`;
    report += `  - Additional Investment: $${response.financials.additionalInvestment || 0}\n`;
    report += `  - Additional Income: $${response.financials.additionalMonthlyIncome || 0}/month\n`;
    report += `  - Improved Cash Flow: $${response.financials.improvedCashFlow || 0}/month\n`;
  }
}

function findIssues(response) {
  const issues = [];
  
  if (typeof response === 'string') {
    try {
      response = JSON.parse(response);
    } catch (e) {
      return ['Failed to parse response'];
    }
  }
  
  // Check for unrealistic financials
  if (response.financials) {
    const f = response.financials;
    
    // Check for zero or missing expenses
    if (f.monthlyExpenses === 0 || !f.monthlyExpenses) {
      issues.push('Monthly expenses are $0 or missing - unrealistic!');
    }
    
    // Check for unrealistic income
    if (f.monthlyIncome > 15000) {
      issues.push(`Monthly income of $${f.monthlyIncome} seems too high for residential property`);
    }
    
    // Check for impossible cash flow
    if (f.monthlyCashFlow > f.monthlyIncome) {
      issues.push('Cash flow exceeds income - mathematical error');
    }
    
    // Check for unrealistic ROI
    if (f.fiveYearROI > 200) {
      issues.push(`ROI of ${f.fiveYearROI}% is unrealistic`);
    }
    
    // Check for missing mortgage calculations
    if (f.downPayment && !f.monthlyPayment && f.downPayment < 100) {
      issues.push('No mortgage payment calculated despite financing');
    }
  }
  
  // Check for low confidence but high score
  if (response.confidence < 0.5 && response.score > 80) {
    issues.push('High score (${response.score}) but low confidence (${response.confidence}) - inconsistent');
  }
  
  // Check for missing critical data
  if (response.selected && !response.acceptanceReasons) {
    issues.push('Property selected but no acceptance reasons provided');
  }
  
  return issues;
}

function analyzeOverallPatterns(decisions) {
  let analysis = '';
  
  // Count issues across all decisions
  let zeroExpenseCount = 0;
  let highIncomeCount = 0;
  let missingMortgageCount = 0;
  let unrealisticROICount = 0;
  
  decisions.forEach(decision => {
    if (decision.parsed_response) {
      let response = decision.parsed_response;
      if (typeof response === 'string') {
        try {
          response = JSON.parse(response);
        } catch (e) {
          return;
        }
      }
      
      if (response.financials) {
        if (response.financials.monthlyExpenses === 0) zeroExpenseCount++;
        if (response.financials.monthlyIncome > 15000) highIncomeCount++;
        if (!response.financials.monthlyPayment && response.financials.downPayment) missingMortgageCount++;
        if (response.financials.fiveYearROI > 200) unrealisticROICount++;
      }
    }
  });
  
  analysis += `### 🚨 Critical Issues Found:\n\n`;
  analysis += `1. **Zero Expenses:** ${zeroExpenseCount} decisions (${(zeroExpenseCount/decisions.length*100).toFixed(1)}%)\n`;
  analysis += `2. **Unrealistic Income (>$15k/mo):** ${highIncomeCount} decisions\n`;
  analysis += `3. **Missing Mortgage Calculations:** ${missingMortgageCount} decisions\n`;
  analysis += `4. **Unrealistic ROI (>200%):** ${unrealisticROICount} decisions\n\n`;
  
  analysis += `### 💡 Recommendations:\n\n`;
  analysis += `1. **Fix Financial Calculator:** Currently not calculating expenses (mortgage, tax, insurance)\n`;
  analysis += `2. **Add Market Validation:** Income projections need real rental comps\n`;
  analysis += `3. **Implement Sanity Checks:** Flag impossible numbers before presenting\n`;
  analysis += `4. **Use Real Interest Rates:** Current mortgage rates ~7-8% not being applied\n`;
  analysis += `5. **Add Property Tax Data:** MA property tax ~1.2% annually not included\n`;
  
  return analysis;
}

analyzeAgentPerformance();