/**
 * Deal Packager Agent
 * Role: Report Generation Specialist
 * Responsibility: Comprehensive investment report compilation and formatting
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
import fs from 'fs/promises';
import path from 'path';

export interface InvestmentReport {
  executiveSummary: string;
  investmentProfile: any;
  marketAnalysis: any[];
  propertyRecommendations: any[];
  financialProjections: any;
  riskAssessment: string[];
  nextSteps: string[];
  appendices: {
    detailedCalculations: any[];
    marketResearch: any[];
  };
}

export class DealPackagerAgent {
  private model = 'gpt-3.5-turbo';

  async generateComprehensiveReport(
    investmentProfile: any,
    marketAnalyses: any[],
    propertyFinancials: any[]
  ): Promise<InvestmentReport> {
    console.log(`📋 [Deal Packager] Generating comprehensive investment report...`);

    // Generate executive summary
    const executiveSummary = await this.generateExecutiveSummary(
      investmentProfile, marketAnalyses, propertyFinancials
    );

    // Compile property recommendations with detailed walkthroughs
    const propertyRecommendations = this.compilePropertyRecommendations(propertyFinancials);

    // Generate financial projections
    const financialProjections = this.generateFinancialProjections(propertyFinancials, investmentProfile);

    // Assess risks
    const riskAssessment = this.compileRiskAssessment(propertyFinancials, marketAnalyses);

    // Generate next steps
    const nextSteps = this.generateNextSteps(investmentProfile, propertyRecommendations);

    const report: InvestmentReport = {
      executiveSummary,
      investmentProfile,
      marketAnalysis: marketAnalyses,
      propertyRecommendations,
      financialProjections,
      riskAssessment,
      nextSteps,
      appendices: {
        detailedCalculations: propertyFinancials.map(pf => pf.scenarios),
        marketResearch: marketAnalyses
      }
    };

    return report;
  }

  private async generateExecutiveSummary(
    profile: any, 
    marketAnalyses: any[], 
    propertyFinancials: any[]
  ): Promise<string> {
    const topProperties = propertyFinancials.slice(0, 3);
    const avgROE = topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.returnOnEquity, 0) / topProperties.length;
    const avgCashFlow = topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.monthlyCashFlow, 0) / topProperties.length;

    const prompt = `
Generate an executive summary for this real estate investment analysis:

Investment Profile:
- Capital: $${profile.capital?.toLocaleString()}
- Target: $${profile.targetReturn}/month
- Risk Tolerance: ${profile.riskTolerance}
- Locations: ${profile.locations?.join(', ')}

Market Findings:
- ${marketAnalyses.length} markets analyzed
- Key insights: ${marketAnalyses.map(m => m.strategicInsights).flat().slice(0, 3).join(', ')}

Property Analysis Results:
- ${propertyFinancials.length} properties analyzed
- Top 3 average ROE: ${avgROE.toFixed(1)}%
- Average cash flow: $${Math.round(avgCashFlow)}
- Strategic factors considered: universities, transportation, development

Create a 2-3 paragraph executive summary that:
1. Summarizes the investment opportunity
2. Highlights key findings and recommendations
3. Sets expectations for returns and strategy
4. Mentions the comprehensive analysis approach

Keep it professional and investment-focused.
`;

    try {
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      });

      return response.choices[0]?.message?.content || this.generateFallbackSummary(profile, propertyFinancials);
    } catch (error) {
      console.error('Executive summary generation failed:', error);
      return this.generateFallbackSummary(profile, propertyFinancials);
    }
  }

  private generateFallbackSummary(profile: any, propertyFinancials: any[]): string {
    const topProperty = propertyFinancials[0];
    return `
Based on comprehensive analysis of ${propertyFinancials.length} properties across ${profile.locations?.join(', ')}, we have identified strong investment opportunities for your $${profile.capital?.toLocaleString()} investment capital. 

Our multi-agent analysis incorporated real-time market research, university proximity factors, transportation access, and emerging development opportunities. The top-ranked property offers ${topProperty?.recommendedScenario?.returnOnEquity?.toFixed(1)}% total return on equity through a combination of cash flow, principal paydown, and appreciation.

This strategy aligns with your ${profile.riskTolerance} risk tolerance and targets ${profile.propertyTypes?.includes('multi-family') ? 'multi-family properties' : 'residential properties'} with strong fundamentals and strategic advantages.
`;
  }

  private compilePropertyRecommendations(propertyFinancials: any[]): any[] {
    return propertyFinancials.slice(0, 10).map((pf, index) => {
      const property = pf.property;
      const recommended = pf.recommendedScenario;
      
      // Ensure complete address information from enhanced data
      const fullAddress = property.fullAddress || [
        property.address,
        property.city && property.state ? `${property.city}, ${property.state}` : property.city || property.state,
        property.postalCode || property.zip_code
      ].filter(Boolean).join(', ');

      return {
        rank: index + 1,
        address: property.address,
        fullAddress: fullAddress,
        city: property.city,
        state: property.state,
        postalCode: property.postalCode,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        propertyType: property.propertyType,
        location: property.location,
        
        // Financial highlights
        estimatedRent: pf.baseAnalysis.estimatedRent,
        capRate: pf.baseAnalysis.capRate,
        
        // Recommended scenario
        recommendedScenario: {
          name: recommended.scenario,
          downPayment: recommended.downPayment,
          monthlyCashFlow: recommended.monthlyCashFlow,
          monthlyPrincipal: recommended.monthlyPrincipal,
          monthlyAppreciation: recommended.monthlyAppreciation,
          totalEconomicBenefit: recommended.totalEconomicBenefit,
          returnOnEquity: recommended.returnOnEquity,
          walkthrough: recommended.walkthrough
        },
        
        // All scenarios for comparison
        allScenarios: pf.scenarios,
        
        // Strategic factors
        strategicScore: property.strategicScore || 0,
        proximityFactors: property.proximityFactors || {},
        
        // Risk assessment
        riskFactors: pf.riskFactors,
        
        // Investment rationale
        whyRecommended: this.generatePropertyRationale(pf),
        
        // Action items
        actionItems: this.generateActionItems(pf),
        
        // Concerns
        concerns: this.generateConcerns(pf)
      };
    });
  }

  private generatePropertyRationale(propertyFinancial: any): string {
    const rec = propertyFinancial.recommendedScenario;
    const property = propertyFinancial.property;
    
    if (rec.totalEconomicBenefit > 0) {
      return `Strong total economic benefit of $${Math.round(rec.totalEconomicBenefit)}/month combining cash flow ($${Math.round(rec.monthlyCashFlow)}), principal paydown ($${Math.round(rec.monthlyPrincipal)}), and appreciation ($${Math.round(rec.monthlyAppreciation)}). Total ROE: ${rec.returnOnEquity.toFixed(1)}%`;
    } else {
      return `Despite negative total economic benefit, this property offers strategic value through ${property.proximityFactors?.nearUniversity ? 'university proximity' : property.proximityFactors?.transitAccess ? 'transit access' : 'market position'} with potential for improved returns through optimization.`;
    }
  }

  private generateActionItems(propertyFinancial: any): string[] {
    const items = [
      'Schedule professional property inspection',
      'Verify rental income with local comparables',
      'Review property tax and insurance estimates'
    ];
    
    if (propertyFinancial.recommendedScenario.monthlyCashFlow < 0) {
      items.push('Consider higher down payment to improve cash flow');
    }
    
    if (propertyFinancial.property.proximityFactors?.nearUniversity) {
      items.push('Research student rental demand and lease terms');
    }
    
    if (propertyFinancial.property.proximityFactors?.transitAccess) {
      items.push('Verify public transportation schedules and reliability');
    }
    
    return items;
  }

  private generateConcerns(propertyFinancial: any): string[] {
    const concerns = [];
    
    if (propertyFinancial.recommendedScenario.monthlyCashFlow < -200) {
      concerns.push(`Negative cash flow of $${Math.abs(Math.round(propertyFinancial.recommendedScenario.monthlyCashFlow))} monthly`);
    }
    
    if (propertyFinancial.baseAnalysis.capRate < 4.0) {
      concerns.push(`Low cap rate of ${propertyFinancial.baseAnalysis.capRate.toFixed(1)}% may indicate overvaluation`);
    }
    
    return concerns.concat(propertyFinancial.riskFactors || []);
  }

  private generateFinancialProjections(propertyFinancials: any[], profile: any): any {
    const topProperties = propertyFinancials.slice(0, 5);
    
    const totalInvestment = topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.downPayment, 0);
    const totalMonthlyBenefit = topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.totalEconomicBenefit, 0);
    const totalMonthlyCashFlow = topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.monthlyCashFlow, 0);
    const avgROE = topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.returnOnEquity, 0) / topProperties.length;
    
    return {
      portfolioSummary: {
        totalInvestment: Math.round(totalInvestment),
        monthlyEconomicBenefit: Math.round(totalMonthlyBenefit),
        monthlyCashFlow: Math.round(totalMonthlyCashFlow),
        averageROE: avgROE,
        properties: topProperties.length
      },
      projections: {
        year1: {
          totalReturn: Math.round(totalMonthlyBenefit * 12),
          cashFlow: Math.round(totalMonthlyCashFlow * 12),
          appreciation: topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.monthlyAppreciation * 12, 0),
          principalPaydown: topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.monthlyPrincipal * 12, 0)
        },
        year5: {
          estimatedPortfolioValue: Math.round(topProperties.reduce((sum, pf) => sum + pf.property.price * Math.pow(1.03, 5), 0)),
          totalEquityBuilt: Math.round(topProperties.reduce((sum, pf) => sum + pf.recommendedScenario.monthlyPrincipal * 12 * 5, 0))
        }
      }
    };
  }

  private compileRiskAssessment(propertyFinancials: any[], marketAnalyses: any[]): string[] {
    const risks = new Set<string>();
    
    // Property-specific risks
    propertyFinancials.forEach(pf => {
      pf.riskFactors?.forEach((risk: string) => risks.add(risk));
    });
    
    // Market risks
    risks.add('Interest rate fluctuations could impact financing costs');
    risks.add('Local market conditions may affect property values');
    
    // Portfolio risks
    const avgCashFlow = propertyFinancials.reduce((sum, pf) => sum + pf.recommendedScenario.monthlyCashFlow, 0) / propertyFinancials.length;
    if (avgCashFlow < 0) {
      risks.add('Portfolio requires significant cash reserves for negative cash flow properties');
    }
    
    return Array.from(risks).slice(0, 8); // Top 8 risks
  }

  private generateNextSteps(profile: any, recommendations: any[]): string[] {
    const steps = [
      'Review top 3 property recommendations in detail',
      'Secure pre-approval for investment property financing',
      'Schedule property inspections for selected properties'
    ];
    
    if (profile.strategicFactors?.universities) {
      steps.push('Research local university enrollment trends and housing demand');
    }
    
    if (recommendations.some(r => r.recommendedScenario.monthlyCashFlow < 0)) {
      steps.push('Prepare cash reserves for properties with negative cash flow');
    }
    
    steps.push(
      'Consult with tax advisor on investment property benefits',
      'Develop property management plan or identify management companies',
      'Create timeline for property acquisition and portfolio building'
    );
    
    return steps;
  }

  async saveReportToMarkdown(report: InvestmentReport, strategyId: string): Promise<string> {
    const markdown = this.convertToMarkdown(report);
    const filePath = path.join(process.cwd(), 'strategies', `${strategyId}.md`);
    
    try {
      await fs.writeFile(filePath, markdown, 'utf-8');
      console.log(`📄 [Deal Packager] Report saved to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to save markdown report:', error);
      throw error;
    }
  }

  private convertToMarkdown(report: InvestmentReport): string {
    const sections = [
      '# Investment Strategy Report',
      `Generated: ${new Date().toLocaleDateString()}`,
      `Prepared for: Investor`,
      '',
      '## Executive Summary',
      report.executiveSummary,
      '',
      '## Your Investment Power',
      `- **Available Capital**: $${report.investmentProfile.capital?.toLocaleString()}`,
      `- **Target Monthly Return**: $${report.investmentProfile.targetReturn?.toLocaleString()}`,
      `- **Risk Tolerance**: ${report.investmentProfile.riskTolerance}`,
      `- **Geographic Focus**: ${report.investmentProfile.locations?.join(', ')}`,
      '',
      '## Property Recommendations',
      ''
    ];

    // Add detailed property recommendations
    report.propertyRecommendations.forEach(prop => {
      sections.push(
        `### ${prop.rank}. ${prop.address}`,
        `- **Price**: $${prop.price.toLocaleString()}`,
        `- **Type**: ${prop.propertyType}`,
        `- **Bedrooms**: ${prop.bedrooms} | **Bathrooms**: ${prop.bathrooms}`,
        `- **Cap Rate**: ${prop.capRate.toFixed(2)}%`,
        `- **Strategic Score**: ${prop.strategicScore}/100`,
        '',
        '#### Recommended Investment Scenario',
        `**${prop.recommendedScenario.name}**`,
        `- Down Payment: $${Math.round(prop.recommendedScenario.downPayment).toLocaleString()}`,
        `- Monthly Cash Flow: $${Math.round(prop.recommendedScenario.monthlyCashFlow).toLocaleString()}`,
        `- Total Economic Benefit: $${Math.round(prop.recommendedScenario.totalEconomicBenefit).toLocaleString()}/month`,
        `- Annual ROE: ${prop.recommendedScenario.returnOnEquity.toFixed(1)}%`,
        '',
        '#### Detailed Calculation Walkthrough',
        ...prop.recommendedScenario.walkthrough.map((step: string) => `- ${step}`),
        '',
        '#### All Scenarios Comparison',
        ...prop.allScenarios.map((scenario: any) => 
          `**${scenario.scenario}**: ${scenario.returnOnEquity.toFixed(1)}% ROE, $${Math.round(scenario.totalEconomicBenefit)} total benefit`
        ),
        '',
        '**Why This Property:**',
        prop.whyRecommended,
        '',
        '**Action Items:**',
        ...prop.actionItems.map((item: string) => `- ${item}`),
        '',
        prop.concerns.length > 0 ? '**Concerns:**' : '',
        ...prop.concerns.map((concern: string) => `- ${concern}`),
        '',
        '---',
        ''
      );
    });

    // Add financial projections
    sections.push(
      '## Financial Projections',
      '',
      '### Portfolio Summary',
      `- **Total Investment**: $${report.financialProjections.portfolioSummary.totalInvestment.toLocaleString()}`,
      `- **Monthly Economic Benefit**: $${report.financialProjections.portfolioSummary.monthlyEconomicBenefit.toLocaleString()}`,
      `- **Monthly Cash Flow**: $${report.financialProjections.portfolioSummary.monthlyCashFlow.toLocaleString()}`,
      `- **Average ROE**: ${report.financialProjections.portfolioSummary.averageROE.toFixed(1)}%`,
      '',
      '### 5-Year Projections',
      `- **Year 1 Total Return**: $${report.financialProjections.projections.year1.totalReturn.toLocaleString()}`,
      `- **Year 5 Portfolio Value**: $${report.financialProjections.projections.year5.estimatedPortfolioValue.toLocaleString()}`,
      `- **Total Equity Built**: $${report.financialProjections.projections.year5.totalEquityBuilt.toLocaleString()}`,
      ''
    );

    // Add risk assessment and next steps
    sections.push(
      '## Risk Assessment',
      ...report.riskAssessment.map(risk => `- ${risk}`),
      '',
      '## Next Steps',
      ...report.nextSteps.map((step, index) => `${index + 1}. ${step}`),
      '',
      '---',
      '*This strategy was generated using real-time market data and multi-agent AI analysis.',
      'Always consult with real estate professionals before making investment decisions.*'
    );

    return sections.join('\n');
  }
}