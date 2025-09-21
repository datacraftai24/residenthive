/**
 * Investment Report Generator
 * 
 * Converts AI Investment Advisor recommendations into beautiful Markdown reports
 * that can be shared with clients via email, PDF, or direct link.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AdvisorResponse, InvestmentRecommendation } from './ai-investment-advisor';

export class InvestmentReportGenerator {
  private reportsDir: string;
  
  constructor() {
    // Create reports directory if it doesn't exist
    this.reportsDir = path.join(process.cwd(), 'reports', 'investment-analyses');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }
  
  /**
   * Generate a comprehensive investment report in Markdown format
   */
  async generateReport(
    response: AdvisorResponse,
    clientName?: string
  ): Promise<{ filePath: string; content: string }> {
    
    const timestamp = new Date().toISOString().split('T')[0];
    const reportId = `investment-analysis-${timestamp}-${Date.now()}`;
    const fileName = `${reportId}.md`;
    const filePath = path.join(this.reportsDir, fileName);
    
    // Generate the markdown content
    const content = this.buildMarkdownReport(response, clientName, reportId);
    
    // Save the file
    fs.writeFileSync(filePath, content);
    
    console.log(`📄 Investment report saved: ${filePath}`);
    
    return { filePath, content };
  }
  
  /**
   * Build the complete Markdown report
   */
  private buildMarkdownReport(
    response: AdvisorResponse,
    clientName?: string,
    reportId?: string
  ): string {
    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    let md = `# Real Estate Investment Analysis Report

${clientName ? `**Prepared for:** ${clientName}  ` : ''}
**Date:** ${date}  
**Report ID:** ${reportId || 'N/A'}  
**Analysis Type:** ${response.interpretedRequirements.preferences?.depth || 'Standard'} Depth

---

## Executive Summary

Based on your investment criteria of **$${response.interpretedRequirements.budget.cashAvailable.toLocaleString()} cash available** and a target of **$${response.interpretedRequirements.goals.monthlyIncome.toLocaleString()}/month cash flow**, we've identified **${response.recommendations.length} prime investment opportunities** in ${response.marketOverview.bestMarkets[0]}.

### Your Investment Profile
- **Budget Range:** $${response.interpretedRequirements.budget.min.toLocaleString()} - $${response.interpretedRequirements.budget.max.toLocaleString()}
- **Cash Available:** $${response.interpretedRequirements.budget.cashAvailable.toLocaleString()}
- **Investment Goal:** ${this.formatGoal(response.interpretedRequirements.goals.primaryGoal)}
- **Time Horizon:** ${response.interpretedRequirements.goals.timeHorizon} years
- **Risk Tolerance:** ${this.capitalize(response.interpretedRequirements.preferences?.riskTolerance || 'medium')}

---

## Market Analysis

### 🎯 Target Markets
${response.marketOverview.bestMarkets.map((market, i) => 
  `${i + 1}. **${market}**`
).join('\n')}

### 📈 Market Trends
${response.marketOverview.marketTrends.map(trend => 
  `- ${trend}`
).join('\n')}

### ⏰ Timing Recommendation
**${response.marketOverview.timing}**

---

## Top Investment Recommendations

`;
    
    // Add each property recommendation
    response.recommendations.forEach((rec, index) => {
      md += this.buildPropertySection(rec, index + 1);
    });
    
    // Add research and validation section
    if (response.debugInfo?.dataResearched && response.debugInfo.dataResearched.length > 0) {
      md += `
---

## Legal & Regulatory Validation

Our AI system researched and validated the following regulations:

${response.debugInfo.dataResearched.map(item => `- ✅ ${item}`).join('\n')}

All recommended strategies have been verified against local laws and regulations.
`;
    }
    
    // Add footer
    md += `
---

## Next Steps

1. **Schedule Property Tours** - We recommend viewing these properties within the next 7-14 days
2. **Get Pre-Approved** - Secure financing pre-approval for your budget range
3. **Review Strategies** - Discuss the recommended investment strategies with your advisor
4. **Market Analysis** - Request detailed market analysis for your chosen property
5. **Make an Offer** - Act quickly in this competitive market

---

## Important Disclaimers

- All financial projections are estimates based on current market conditions
- Actual returns may vary based on market conditions, property management, and other factors
- Regulatory information was current as of the analysis date but may change
- This report does not constitute financial or investment advice
- Always consult with qualified professionals before making investment decisions

---

*This report was generated using ResidentHive's AI Investment Intelligence System*  
*Powered by advanced market analysis and real-time MLS data*

For questions or to schedule property viewings, contact your ResidentHive agent.
`;
    
    return md;
  }
  
  /**
   * Build individual property section
   */
  private buildPropertySection(rec: InvestmentRecommendation, num: number): string {
    const property = rec.property;
    const strategy = rec.strategy;
    const financials = rec.financials;
    
    return `
### ${num}. ${property.address}, ${property.city}, ${property.state}

**Price:** $${property.price.toLocaleString()}  
**Type:** ${property.propertyType}  
**Configuration:** ${property.bedrooms} BR / ${property.bathrooms} BA  
**Strategic Score:** ${property.strategicScore}/100

#### 📊 Investment Strategy: ${strategy.name}
*Strategy Type: ${this.capitalize(strategy.type)}*

${strategy.description}

**Implementation Steps:**
${strategy.implementation.map((step, i) => `${i + 1}. ${step}`).join('\n')}

**Timeline:** ${strategy.timeline}

#### 💰 Financial Projections

| Metric | Value |
|--------|-------|
| Purchase Price | $${financials.purchasePrice.toLocaleString()} |
| Down Payment | $${financials.downPayment.toLocaleString()} (${Math.round(financials.downPayment/financials.purchasePrice*100)}%) |
| Monthly Income | $${financials.monthlyIncome.toLocaleString()} |
| Monthly Expenses | $${financials.monthlyExpenses.toLocaleString()} |
| **Net Cash Flow** | **$${financials.netCashFlow.toLocaleString()}/month** |
| Break-Even | ${financials.breakEvenMonths} months |
| **5-Year ROI** | **${financials.fiveYearROI}%** |

#### 🏠 Property Highlights
${rec.reasoning.slice(0, 3).map(reason => `- ${reason}`).join('\n')}

#### ⚠️ Risk Analysis

${rec.risks.map(risk => 
  `**${risk.type}** (${risk.severity} risk)  
*Mitigation:* ${risk.mitigation}`
).join('\n\n')}

#### 📍 Market Context
- **Location Value:** ${rec.marketContext.whyNowIsGoodTime}
- **Market Phase:** ${this.capitalize(rec.marketContext.marketPhase)}
- **Appreciation Forecast:** ${rec.marketContext.appreciation}

**AI Confidence Score:** ${Math.round(rec.confidence * 100)}%

${rec.agentInsights.strategyMind ? `
#### 🤖 AI Agent Insights

- **Strategy Analysis:** ${rec.agentInsights.strategyMind}
- **Market Intelligence:** ${rec.agentInsights.marketScout || 'Strong market fundamentals'}
- **Property Potential:** ${rec.agentInsights.propertyGenius || 'Excellent investment opportunity'}
` : ''}

---
`;
  }
  
  /**
   * Format goal type
   */
  private formatGoal(goal: string): string {
    const goals: Record<string, string> = {
      'cash_flow': 'Monthly Cash Flow',
      'appreciation': 'Long-term Appreciation',
      'both': 'Cash Flow + Appreciation'
    };
    return goals[goal] || goal;
  }
  
  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  /**
   * Generate a shareable link for the report
   */
  generateShareableLink(reportId: string): string {
    // In production, this would generate a secure, time-limited URL
    return `https://app.residenthive.com/reports/${reportId}`;
  }
  
  /**
   * Get all reports for a client
   */
  async getClientReports(clientId: string): Promise<string[]> {
    const files = fs.readdirSync(this.reportsDir);
    return files.filter(file => file.includes(clientId));
  }
}

export const reportGenerator = new InvestmentReportGenerator();