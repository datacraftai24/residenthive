/**
 * Report Generator - Clean Architecture Version
 * 
 * Core Responsibility: Format investment decisions into professional reports
 * 
 * Design Principles:
 * - Pure formatting, no decision making
 * - Takes InvestmentDecision and outputs markdown
 * - Includes insights generation for narrative flow
 * - Professional, investor-ready output
 */

import { tracedLLMCall } from '../observability/llm-tracer.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { InvestmentDecision } from './property-evaluator-clean';
import type { ResearchResult } from '../ai-agents/smart-research-agent';

export interface ReportInsights {
  executiveSummary: string;
  marketAnalysis: string;
  implementationPlan: string[];
  risks: string[];
  timeline: string;
}

export class ReportGeneratorClean {
  private readonly REPORTS_DIR = 'strategies';
  
  /**
   * Generate a complete investment report from the decision
   */
  async generateReport(
    sessionId: string,
    decision: InvestmentDecision,
    profile: any,
    researchResults?: ResearchResult[]
  ): Promise<string> {
    console.log(`\n📝 [Report Generator v2] Creating investment report...`);
    console.log(`   Strategy: ${decision.winningStrategy.name}`);
    console.log(`   Properties: ${decision.topProperties.length}`);
    
    try {
      // Ensure reports directory exists
      await fs.mkdir(this.REPORTS_DIR, { recursive: true });
      
      // Generate insights to make the report narrative
      const insights = await this.generateInsights(decision, profile, researchResults);
      
      // Create the markdown report
      const reportContent = this.createMarkdownReport(decision, profile, insights);
      
      // Save to file
      const fileName = `${sessionId}.md`;
      const filePath = path.join(this.REPORTS_DIR, fileName);
      await fs.writeFile(filePath, reportContent, 'utf-8');
      
      console.log(`   ✅ Report saved to ${filePath}`);
      return filePath;
      
    } catch (error) {
      console.error(`   ❌ Failed to generate report:`, error);
      throw error;
    }
  }
  
  /**
   * Generate narrative insights using LLM
   */
  private async generateInsights(
    decision: InvestmentDecision,
    profile: any,
    researchResults?: ResearchResult[]
  ): Promise<ReportInsights> {
    const systemPrompt = `You are a professional real estate investment advisor creating a report.
Generate clear, actionable insights based on the investment analysis.
Be specific and reference actual data from the decision.`;

    const userPrompt = `Generate professional insights for this investment decision:

WINNING STRATEGY: ${decision.winningStrategy.name}
Score: ${decision.winningStrategy.score}/100
Reasoning: ${decision.winningStrategy.reasoning}

INVESTOR PROFILE:
- Available Capital: $${profile.investmentCapital || profile.budgetMax || 0}
- Monthly Income Goal: $${profile.incomeGoal || 0}
- Location: ${profile.location || 'Not specified'}
- Timeline: ${profile.timeline || '3-6 months'}

STRATEGY COMPARISON:
${decision.strategyComparison && Array.isArray(decision.strategyComparison) ? 
  decision.strategyComparison.slice(0, 3).map(s => 
    `- ${s.strategyName}: ${s.viableProperties}/${s.propertiesEvaluated} viable, $${s.avgCashFlow}/mo avg, score: ${s.score}`
  ).join('\n') : 'Strategy comparison data not available'}

TOP 3 PROPERTIES:
${decision.topProperties && Array.isArray(decision.topProperties) ? 
  decision.topProperties.slice(0, 3).map(p => 
    `${p.rank}. ${p.evaluation?.property?.address || 'Unknown'} - $${p.evaluation?.property?.price || 0}
   Strategy: ${p.evaluation?.strategy || 'N/A'}
   Cash Flow: $${p.evaluation?.financials?.netCashFlow || 0}/mo
   ${p.evaluation?.improvementPotential ? 
     `Improvement: ${p.evaluation.improvementPotential.type} (+$${p.evaluation.improvementPotential.additionalCashFlow}/mo)` : 
     'No improvements needed'}`
  ).join('\n\n') : 'No properties evaluated yet'}

MARKET CONDITIONS:
${researchResults ? researchResults.slice(0, 5).map(r => 
  `- ${r.question}: ${typeof r.answer === 'string' ? r.answer.substring(0, 100) : 'Data available'}`
).join('\n') : 'Market research data available'}

Generate:
1. Executive Summary (2-3 sentences capturing the key recommendation and opportunity)
2. Market Analysis (2-3 sentences about why this market/strategy works now)
3. Implementation Plan (5 specific, actionable steps with rough timelines)
4. Key Risks (3 specific risks to monitor)
5. Timeline (realistic timeline to first cash flow)

Return as JSON with these exact fields: executiveSummary, marketAnalysis, implementationPlan (array), risks (array), timeline`;

    try {
      const result = await tracedLLMCall({
        agentName: 'report_insights_generator',
        systemPrompt,
        userPrompt,
        temperature: 0.3,
        model: 'gpt-4o-mini',
        responseFormat: 'json_object'
      });
      
      const insights = JSON.parse(result.content);
      
      return {
        executiveSummary: insights.executiveSummary || this.generateDefaultSummary(decision),
        marketAnalysis: insights.marketAnalysis || 'Market conditions favorable for investment.',
        implementationPlan: insights.implementationPlan || this.generateDefaultPlan(),
        risks: insights.risks || ['Market volatility', 'Interest rate changes', 'Maintenance costs'],
        timeline: insights.timeline || '60-90 days to first rental income'
      };
      
    } catch (error) {
      console.error('Failed to generate insights:', error);
      return this.generateDefaultInsights(decision);
    }
  }
  
  /**
   * Create the markdown report
   */
  private createMarkdownReport(
    decision: InvestmentDecision,
    profile: any,
    insights: ReportInsights
  ): string {
    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    return `# Real Estate Investment Strategy Report

*Generated: ${date}*

---

## Executive Summary

${insights.executiveSummary}

**Recommended Strategy:** ${decision.winningStrategy.name}  
**Confidence Level:** ${decision.metrics.confidenceLevel}  
**Properties Evaluated:** ${decision.metrics.totalPropertiesEvaluated}  
**Viable Options:** ${decision.metrics.viablePropertiesFound}

---

## Investment Strategy Analysis

### Winning Strategy: ${decision.winningStrategy.name}

${decision.winningStrategy.reasoning}

**Strategy Score:** ${decision.winningStrategy.score}/100

### Strategy Comparison

| Strategy | Properties Found | Viable | Avg Cash Flow | Meets Goals | Score |
|----------|-----------------|---------|--------------|-------------|--------|
${decision.strategyComparison.map(s => 
  `| ${s.strategyName} | ${s.propertiesFound} | ${s.viableProperties} | $${s.avgCashFlow}/mo | ${s.meetsInvestorGoals ? '✅' : '❌'} | ${s.score}/100 |`
).join('\n')}

### Market Analysis

${insights.marketAnalysis}

---

## Top Property Recommendations

${decision.topProperties.slice(0, 5).map(p => `
### ${p.rank}. ${p.evaluation.property.address}

**Price:** $${p.evaluation.property.price.toLocaleString()}  
**Strategy:** ${p.evaluation.strategy}  
**Recommendation:** ${p.evaluation.recommendation}

#### Financial Analysis
- **Monthly Rent:** $${p.evaluation.financials.monthlyRent.toLocaleString()}
- **Monthly Expenses:** $${p.evaluation.financials.monthlyExpenses.toLocaleString()}
- **Net Cash Flow:** $${p.evaluation.financials.netCashFlow.toLocaleString()}/month
- **Cap Rate:** ${(p.evaluation.financials.capRate * 100).toFixed(2)}%
- **Cash-on-Cash Return:** ${(p.evaluation.financials.cashOnCashReturn * 100).toFixed(2)}%

${p.evaluation.improvementPotential ? `
#### Improvement Opportunity
- **Type:** ${p.evaluation.improvementPotential.type}
- **Investment Required:** $${p.evaluation.improvementPotential.cost.toLocaleString()}
- **Additional Cash Flow:** $${p.evaluation.improvementPotential.additionalCashFlow.toLocaleString()}/month
- **Feasibility:** ${p.evaluation.improvementPotential.feasibility}
` : ''}

**Why Recommended:** ${p.whyRecommended}
`).join('\n---\n')}

---

## Implementation Plan

${insights.implementationPlan.map((step, i) => `${i + 1}. ${step}`).join('\n')}

### Timeline

${insights.timeline}

---

## Risk Analysis

${insights.risks.map(risk => `- ${risk}`).join('\n')}

---

## Investor Profile

- **Available Capital:** $${(profile.investmentCapital || profile.budgetMax || 0).toLocaleString()}
- **Monthly Income Goal:** $${(profile.incomeGoal || 0).toLocaleString()}
- **Target Location:** ${profile.location || 'Not specified'}
- **Investment Timeline:** ${profile.timeline || '3-6 months'}
- **Credit Score:** ${profile.creditScore || 'Not specified'}
- **Property Management:** ${profile.usePropertyManagement ? 'Yes' : 'Self-manage'}

---

## Next Steps

1. **Review this report** with your financial advisor
2. **Schedule property viewings** for top recommendations
3. **Get pre-approved** for financing if needed
4. **Engage a real estate agent** familiar with investment properties
5. **Prepare offers** with appropriate contingencies

---

## Disclaimer

This report is based on current market data and automated analysis. All investment decisions should be made after thorough due diligence, professional property inspection, and consultation with qualified real estate and financial advisors. Past performance does not guarantee future results.

---

*End of Report*`;
  }
  
  /**
   * Generate default insights when LLM fails
   */
  private generateDefaultInsights(decision: InvestmentDecision): ReportInsights {
    return {
      executiveSummary: this.generateDefaultSummary(decision),
      marketAnalysis: 'Current market conditions present opportunities for strategic real estate investment with proper due diligence.',
      implementationPlan: this.generateDefaultPlan(),
      risks: [
        'Market conditions may change affecting property values',
        'Actual rental income may vary from estimates',
        'Unexpected maintenance or renovation costs'
      ],
      timeline: '60-90 days from offer acceptance to first rental income'
    };
  }
  
  private generateDefaultSummary(decision: InvestmentDecision): string {
    const topStrategy = decision.strategyComparison[0];
    return `Based on comprehensive analysis of ${decision.metrics.totalPropertiesEvaluated} properties, ` +
           `the ${decision.winningStrategy.name} strategy offers the best investment opportunity ` +
           `with ${topStrategy?.viableProperties || 0} viable properties averaging ` +
           `$${topStrategy?.avgCashFlow || 0}/month in cash flow.`;
  }
  
  private generateDefaultPlan(): string[] {
    return [
      'Week 1-2: Review property recommendations and schedule viewings',
      'Week 2-3: Conduct property inspections and due diligence',
      'Week 3-4: Secure financing pre-approval and prepare offers',
      'Week 4-6: Negotiate purchase terms and enter escrow',
      'Week 6-10: Complete purchase and begin rental preparations'
    ];
  }
}

// Export singleton instance
export const reportGeneratorClean = new ReportGeneratorClean();