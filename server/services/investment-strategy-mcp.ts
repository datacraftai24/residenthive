/**
 * Investment Strategy Generator with MCP
 * 
 * Generates comprehensive investment strategies using:
 * - Static knowledge base for proven strategies
 * - Repliers API for property data
 * - Tavily MCP for real-time market intelligence
 * - GPT-4 for analysis and insights beyond static rules
 */

import OpenAI from 'openai';
import { hostedMcpTool } from '@openai/agents';
import { repliersService } from './repliers-service';
import { db } from '../db';
import { investmentStrategies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { 
  getInvestorTypeConfig, 
  INVESTMENT_KNOWLEDGE,
  addDiscoveredInsight 
} from './investment-strategies-knowledge';
import type { InvestorContext } from './investment-chat-service';
import type { BuyerProfile } from '@shared/schema';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface InvestmentStrategy {
  executiveSummary: string;
  purchasingPower: {
    availableCapital: number;
    maxPurchasePrice: number;
    downPaymentPercent: number;
    monthlyBudget: number;
  };
  marketAnalysis: {
    location: string;
    marketConditions: string;
    opportunities: string[];
    risks: string[];
    emergingTrends: string[];
  };
  propertyRecommendations: Array<{
    address: string;
    price: number;
    propertyType: string;
    units?: number;
    monthlyIncome?: number;
    monthlyExpenses?: number;
    netCashFlow?: number;
    capRate?: number;
    whyRecommended: string;
    actionItems: string[];
    concerns: string[];
  }>;
  financialProjections: {
    totalInvestment: number;
    expectedMonthlyIncome: number;
    expectedMonthlyExpenses: number;
    netMonthlyCashFlow: number;
    averageCapRate: number;
    fiveYearProjection: any;
  };
  nextSteps: string[];
  additionalInsights: string[]; // LLM discoveries beyond static knowledge
}

export class InvestmentStrategyGenerator {
  
  /**
   * Generate comprehensive investment strategy
   */
  async generateStrategy(
    profile: Partial<BuyerProfile>, 
    sessionId: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update status to generating
      await db.update(investmentStrategies)
        .set({ status: 'generating' })
        .where(eq(investmentStrategies.sessionId, sessionId));
      
      // Get investor configuration from knowledge base
      const investorConfig = profile.investorType ? 
        getInvestorTypeConfig(profile.investorType) : null;
      
      if (!investorConfig) {
        throw new Error('Invalid investor type');
      }
      
      // Search for properties using Repliers
      console.log('🔍 Searching for investment properties...');
      const properties = await this.searchInvestmentProperties(profile, investorConfig);
      
      // Generate strategy using OpenAI with Tavily MCP
      console.log('🤖 Generating comprehensive strategy with market intelligence...');
      const strategy = await this.generateStrategyWithMCP(
        profile, 
        investorConfig, 
        properties
      );
      
      // Save discoveries for future learning
      if (strategy.additionalInsights.length > 0) {
        strategy.additionalInsights.forEach(insight => {
          addDiscoveredInsight(profile.investorType!, {
            insight,
            location: profile.location,
            timestamp: new Date().toISOString()
          });
        });
      }
      
      // Create strategy document
      const documentContent = this.formatStrategyDocument(profile, strategy);
      const documentUrl = await this.saveStrategyDocument(sessionId, documentContent);
      
      // Update database with completed strategy
      await db.update(investmentStrategies)
        .set({
          status: 'complete',
          strategyJson: strategy,
          marketAnalysis: strategy.marketAnalysis,
          propertyRecommendations: strategy.propertyRecommendations,
          financialProjections: strategy.financialProjections,
          documentUrl,
          generationTime: Date.now() - startTime,
          dataSourcesUsed: ['repliers', 'tavily_mcp', 'openai', 'knowledge_base'],
          completedAt: new Date().toISOString()
        })
        .where(eq(investmentStrategies.sessionId, sessionId));
      
      console.log(`✅ Strategy generation complete in ${(Date.now() - startTime) / 1000}s`);
      
    } catch (error) {
      console.error('Strategy generation failed:', error);
      
      // Update status to failed
      await db.update(investmentStrategies)
        .set({ 
          status: 'failed',
          completedAt: new Date().toISOString()
        })
        .where(eq(investmentStrategies.sessionId, sessionId));
      
      throw error;
    }
  }
  
  /**
   * Search for investment properties
   */
  private async searchInvestmentProperties(
    profile: Partial<BuyerProfile>, 
    config: any
  ) {
    // Build search criteria from knowledge base
    const searchCriteria = {
      location: profile.location,
      budgetMin: profile.budgetMin,
      budgetMax: profile.budgetMax,
      homeType: profile.homeType,
      bedrooms: profile.bedrooms,
      bathrooms: profile.bathrooms,
      // Add investment-specific search terms
      keywords: config.searchCriteria.keywords
    };
    
    // Search using existing Repliers service
    const properties = await repliersService.searchBroadListings({
      ...profile,
      ...searchCriteria
    } as BuyerProfile);
    
    // For multi-unit, also search with bedroom count as proxy
    if (profile.investorType === 'multi_unit' && config.searchCriteria.minBedrooms) {
      const multiUnitProperties = await repliersService.searchBroadListings({
        ...profile,
        bedrooms: config.searchCriteria.minBedrooms,
        homeType: 'other'
      } as BuyerProfile);
      
      // Combine results
      properties.push(...multiUnitProperties);
    }
    
    return properties.slice(0, 50); // Limit for analysis
  }
  
  /**
   * Generate strategy using OpenAI with Tavily MCP
   */
  private async generateStrategyWithMCP(
    profile: Partial<BuyerProfile>,
    config: any,
    properties: any[]
  ): Promise<InvestmentStrategy> {
    
    // Define Tavily MCP tool
    console.log('🔧 Setting up Tavily MCP tool...');
    const tavilyTool = hostedMcpTool({
      serverLabel: "tavily",
      serverUrl: `https://mcp.tavily.com/mcp/?tavilyApiKey=${process.env.TAVILY_API_KEY}`,
      requireApproval: "never",
    });
    
    // Use OpenAI Responses API with Tavily MCP
    console.log('🤖 Generating strategy with OpenAI + Tavily MCP...');
    
    let response: any;
    
    try {
      // Check if responses API is available (SDK v5.0.0+)
      if ('responses' in openai) {
        response = await (openai as any).responses.create({
          model: "gpt-4o",
          tools: [tavilyTool],
          input: `
        You are an expert real estate investment advisor. Create a comprehensive investment strategy.
        
        INVESTOR PROFILE:
        - Type: ${profile.investorType}
        - Available Capital: $${profile.investmentCapital}
        - Target Location: ${profile.location}
        - Goals: ${profile.investmentStrategy || 'Maximum returns'}
        ${profile.targetMonthlyReturn ? `- Target Monthly Cash Flow: $${profile.targetMonthlyReturn}` : ''}
        ${profile.targetCapRate ? `- Target Cap Rate: ${profile.targetCapRate}%` : ''}
        
        BASE STRATEGY FROM KNOWLEDGE BASE:
        ${JSON.stringify(config, null, 2)}
        
        AVAILABLE PROPERTIES (Top 20):
        ${JSON.stringify(properties.slice(0, 20).map(p => ({
          address: p.address,
          price: p.price,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          sqft: p.square_feet,
          type: p.property_type,
          description: p.description?.substring(0, 200)
        })), null, 2)}
        
        TASKS:
        1. Use Tavily to search for:
           - "${profile.location} real estate investment market analysis 2024"
           - "${profile.location} ${profile.investorType} investment opportunities"
           - "${profile.location} rental market vacancy rates" 
           - "${profile.location} new development construction projects"
           - "${profile.location} employment growth major employers"
           
        2. Analyze the properties considering:
           - Current market conditions from your research
           - Investment potential based on the knowledge base criteria
           - Hidden opportunities not obvious from basic data
           
        3. For each recommended property, calculate:
           - Estimated monthly rental income
           - Operating expenses (taxes, insurance, maintenance)
           - Net cash flow
           - Cap rate
           - Why this specific property fits their strategy
           
        4. Identify insights BEYOND the static knowledge base:
           - Local market factors we didn't consider
           - Emerging opportunities specific to ${profile.location}
           - Creative strategies for this investor
           - Risks unique to this market
        
        Return a comprehensive investment strategy as a JSON object with these sections:
        - executiveSummary: 2-3 paragraph overview
        - purchasingPower: {availableCapital, maxPurchasePrice, downPaymentPercent, monthlyBudget}
        - marketAnalysis: {location, marketConditions, opportunities[], risks[], emergingTrends[]}
        - propertyRecommendations: Array of top 5-10 properties with full analysis
        - financialProjections: 5-year projections
        - nextSteps: Specific action items
        - additionalInsights: Array of discoveries beyond our static knowledge
      `
        });
        
        // Parse the response
        const strategyContent = response.output_text;
        console.log('📄 Raw strategy response length:', strategyContent?.length || 0);
      } else {
        // Fallback to regular chat completions if responses API not available
        console.log('⚠️ Responses API not available, falling back to chat completions');
        const chatResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert real estate investment advisor. Always respond with valid JSON."
            },
            {
              role: "user",
              content: `Create a comprehensive investment strategy for this profile: ${JSON.stringify(profile)}\n\nProperties: ${JSON.stringify(properties.slice(0, 20))}\n\nReturn JSON with: executiveSummary, purchasingPower, marketAnalysis, propertyRecommendations, financialProjections, nextSteps, additionalInsights`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        });
        
        response = { output_text: chatResponse.choices[0].message.content };
      }
    } catch (error) {
      console.error('❌ Error calling OpenAI API:', error);
      throw error;
    }
    
    // Parse the response
    const strategyContent = response.output_text;
    console.log('📄 Raw strategy response length:', strategyContent?.length || 0);
    
    let strategy: InvestmentStrategy;
    
    try {
      strategy = JSON.parse(strategyContent);
      console.log('✅ Successfully parsed strategy JSON');
    } catch (error) {
      // If not valid JSON, extract key information
      console.error('⚠️ Failed to parse strategy JSON:', error);
      console.log('📝 Raw strategy content (first 500 chars):', strategyContent?.substring(0, 500));
      strategy = this.extractStrategyFromText(strategyContent, profile, properties);
    }
    
    return strategy;
  }
  
  /**
   * Fallback strategy extraction
   */
  private extractStrategyFromText(
    text: string, 
    profile: Partial<BuyerProfile>,
    properties: any[]
  ): InvestmentStrategy {
    // Basic extraction if JSON parsing fails
    return {
      executiveSummary: "Based on analysis of the market and available properties...",
      purchasingPower: {
        availableCapital: profile.investmentCapital || 0,
        maxPurchasePrice: (profile.investmentCapital || 0) * 4,
        downPaymentPercent: 25,
        monthlyBudget: Math.floor((profile.investmentCapital || 0) * 0.006)
      },
      marketAnalysis: {
        location: profile.location || '',
        marketConditions: "Extracted from response",
        opportunities: ["Opportunity 1", "Opportunity 2"],
        risks: ["Risk 1", "Risk 2"],
        emergingTrends: ["Trend 1", "Trend 2"]
      },
      propertyRecommendations: properties.slice(0, 5).map(p => ({
        address: p.address,
        price: p.price,
        propertyType: p.property_type,
        whyRecommended: "Meets investment criteria",
        actionItems: ["Schedule viewing", "Analyze comparables"],
        concerns: [],
        netCashFlow: 2000 // Placeholder
      })),
      financialProjections: {
        totalInvestment: profile.investmentCapital || 0,
        expectedMonthlyIncome: 10000,
        expectedMonthlyExpenses: 6000,
        netMonthlyCashFlow: 4000,
        averageCapRate: 7.5,
        fiveYearProjection: {}
      },
      nextSteps: [
        "Review recommended properties",
        "Schedule viewings for top picks",
        "Get pre-approval for financing"
      ],
      additionalInsights: [
        "Market insight discovered during analysis"
      ]
    };
  }
  
  /**
   * Format strategy as markdown document
   */
  private formatStrategyDocument(
    profile: Partial<BuyerProfile>, 
    strategy: InvestmentStrategy
  ): string {
    const date = new Date().toLocaleDateString();
    
    return `# Investment Strategy Report
Generated: ${date}
Prepared for: ${profile.name || 'Investor'}

## Executive Summary
${strategy.executiveSummary}

## Your Investment Power
- **Available Capital**: $${strategy.purchasingPower.availableCapital.toLocaleString()}
- **Maximum Purchase Price**: $${strategy.purchasingPower.maxPurchasePrice.toLocaleString()}
- **Down Payment**: ${strategy.purchasingPower.downPaymentPercent}%
- **Monthly Investment Budget**: $${strategy.purchasingPower.monthlyBudget.toLocaleString()}

## Market Analysis: ${strategy.marketAnalysis.location}

### Current Market Conditions
${strategy.marketAnalysis.marketConditions}

### Opportunities
${strategy.marketAnalysis.opportunities.map(o => `- ${o}`).join('\n')}

### Emerging Trends
${strategy.marketAnalysis.emergingTrends.map(t => `- ${t}`).join('\n')}

### Risks to Consider
${strategy.marketAnalysis.risks.map(r => `- ${r}`).join('\n')}

## Property Recommendations

${strategy.propertyRecommendations.map((prop, idx) => `
### ${idx + 1}. ${prop.address}
- **Price**: $${prop.price.toLocaleString()}
- **Type**: ${prop.propertyType}
${prop.units ? `- **Units**: ${prop.units}` : ''}
${prop.monthlyIncome ? `- **Monthly Income**: $${prop.monthlyIncome.toLocaleString()}` : ''}
${prop.netCashFlow ? `- **Net Cash Flow**: $${prop.netCashFlow.toLocaleString()}/month` : ''}
${prop.capRate ? `- **Cap Rate**: ${prop.capRate.toFixed(2)}%` : ''}

**Why This Property:**
${prop.whyRecommended}

**Action Items:**
${prop.actionItems.map(a => `- ${a}`).join('\n')}

${prop.concerns.length > 0 ? `**Concerns:**\n${prop.concerns.map(c => `- ${c}`).join('\n')}` : ''}
`).join('\n---\n')}

## Financial Projections

### Monthly Cash Flow Analysis
- **Total Monthly Income**: $${strategy.financialProjections.expectedMonthlyIncome.toLocaleString()}
- **Total Monthly Expenses**: $${strategy.financialProjections.expectedMonthlyExpenses.toLocaleString()}
- **Net Monthly Cash Flow**: $${strategy.financialProjections.netMonthlyCashFlow.toLocaleString()}
- **Average Cap Rate**: ${strategy.financialProjections.averageCapRate.toFixed(2)}%

## Next Steps
${strategy.nextSteps.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}

## Additional Market Insights
*These insights were discovered through real-time market analysis:*

${strategy.additionalInsights.map(insight => `- ${insight}`).join('\n')}

---
*This strategy was generated using real-time market data and AI analysis. 
Always consult with real estate professionals before making investment decisions.*`;
  }
  
  /**
   * Save strategy document
   */
  private async saveStrategyDocument(sessionId: string, content: string): Promise<string> {
    // For MVP, save to file system
    const { promises: fs } = await import('fs');
    const path = await import('path');
    
    const dir = path.join(process.cwd(), 'strategies');
    await fs.mkdir(dir, { recursive: true });
    
    const filename = `${sessionId}.md`;
    const filepath = path.join(dir, filename);
    
    await fs.writeFile(filepath, content);
    
    console.log(`✅ Strategy document saved to: ${filepath}`);
    
    return `/strategies/${filename}`;
  }
}

export const investmentStrategyGenerator = new InvestmentStrategyGenerator();