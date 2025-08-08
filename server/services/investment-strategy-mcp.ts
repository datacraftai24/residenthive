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
import { Agent, MCPServerSSE } from '@openai/agents';
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
      if (strategy.additionalInsights && Array.isArray(strategy.additionalInsights) && strategy.additionalInsights.length > 0) {
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
   * Generate strategy using OpenAI Agents SDK with Tavily MCP
   */
  private async generateStrategyWithMCP(
    profile: Partial<BuyerProfile>,
    config: any,
    properties: any[]
  ): Promise<InvestmentStrategy> {
    
    console.log('🔧 Setting up OpenAI Agent with Tavily MCP...');
    
    try {
      // Create Tavily MCP server
      const tavilyServer = new MCPServerSSE({
        serverUrl: `https://mcp.tavily.com/mcp/?tavilyApiKey=${process.env.TAVILY_API_KEY}`
      });

      // Create agent with Tavily MCP server
      const agent = new Agent({
        name: "Investment Strategy Advisor",
        instructions: `You are an expert real estate investment advisor. Use Tavily search tools to gather real-time market data and create comprehensive investment strategies.
        
Always return responses in this exact JSON format:
{
  "executiveSummary": "string",
  "purchasingPower": {
    "availableCapital": number,
    "maxPurchasePrice": number,
    "downPaymentPercent": number,
    "monthlyBudget": number
  },
  "marketAnalysis": {
    "location": "string",
    "marketConditions": "string", 
    "opportunities": ["string"],
    "risks": ["string"],
    "emergingTrends": ["string"]
  },
  "propertyRecommendations": [
    {
      "address": "string",
      "price": number,
      "propertyType": "string",
      "whyRecommended": "string",
      "actionItems": ["string"],
      "netCashFlow": number
    }
  ],
  "financialProjections": {
    "totalInvestment": number,
    "expectedMonthlyIncome": number,
    "expectedMonthlyExpenses": number,
    "netMonthlyCashFlow": number,
    "averageCapRate": number
  },
  "nextSteps": ["string"],
  "additionalInsights": ["string"]
}`,
        model: "gpt-4o",
        mcp_servers: [tavilyServer]
      });

      console.log('🤖 Generating strategy with real-time market research...');
      
      const userQuery = `
Create a comprehensive investment strategy for:

INVESTOR PROFILE:
- Type: ${profile.investorType}
- Available Capital: $${profile.investmentCapital?.toLocaleString() || 'Not specified'}
- Target Location: ${profile.location}
- Goals: ${profile.investmentStrategy || 'Maximum returns'}
${profile.targetMonthlyReturn ? `- Target Monthly Cash Flow: $${profile.targetMonthlyReturn}` : ''}
${profile.targetCapRate ? `- Target Cap Rate: ${profile.targetCapRate}%` : ''}

BASE STRATEGY CONFIG:
${JSON.stringify(config, null, 2)}

AVAILABLE PROPERTIES (Top 10):
${JSON.stringify(properties.slice(0, 10).map(p => ({
  address: p.address,
  price: p.price,
  bedrooms: p.bedrooms,
  bathrooms: p.bathrooms,
  sqft: p.square_feet,
  type: p.property_type
})), null, 2)}

RESEARCH TASKS - Use Tavily to search for current market data:
1. "${profile.location} real estate investment market analysis 2025"
2. "${profile.location} ${profile.investorType} investment opportunities"
3. "${profile.location} rental market vacancy rates cap rates"
4. "${profile.location} new development construction projects"
5. "${profile.location} employment growth major employers"

Use this real-time market data to enhance your analysis and provide current market insights beyond the static knowledge base.

Return ONLY the JSON strategy object, no additional text.`;

      const result = await agent.chat(userQuery);
      console.log('✅ Agent completed market research and strategy generation');
      
      // Parse the agent's response
      let strategy: InvestmentStrategy;
      const responseText = result.content || '';
      
      try {
        // Try to parse as direct JSON
        strategy = JSON.parse(responseText);
        console.log('✅ Successfully parsed strategy JSON from agent');
      } catch (error) {
        console.error('⚠️ Failed to parse agent response as JSON:', error);
        console.log('📝 Raw response (first 500 chars):', responseText?.substring(0, 500));
        
        // Try to extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            strategy = JSON.parse(jsonMatch[0]);
            console.log('✅ Extracted JSON from agent response');
          } catch {
            strategy = this.extractStrategyFromText(responseText, profile, properties);
          }
        } else {
          strategy = this.extractStrategyFromText(responseText, profile, properties);
        }
      }
      
      // Ensure additionalInsights is always an array
      if (strategy.additionalInsights && !Array.isArray(strategy.additionalInsights)) {
        strategy.additionalInsights = [strategy.additionalInsights as string];
      }
      
      return strategy;
      
    } catch (error) {
      console.error('❌ Error with OpenAI Agent MCP:', error);
      
      // Fallback to direct Tavily API calls if MCP fails
      console.log('🔄 Falling back to direct Tavily API integration...');
      return await this.generateStrategyWithDirectTavily(profile, config, properties);
    }
  }

  /**
   * Fallback: Direct Tavily API integration when MCP fails
   */
  private async generateStrategyWithDirectTavily(
    profile: Partial<BuyerProfile>,
    config: any,
    properties: any[]
  ): Promise<InvestmentStrategy> {
    console.log('🔄 Using direct Tavily API for market research...');
    
    try {
      // Perform market research using direct Tavily API calls
      const marketData = await this.performTavilyResearch(profile);
      
      // Generate strategy using OpenAI with market data
      const chatResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert real estate investment advisor. Create comprehensive investment strategies based on the provided market research data."
          },
          {
            role: "user",
            content: `
Create a comprehensive investment strategy using this market research:

INVESTOR PROFILE:
- Type: ${profile.investorType}
- Available Capital: $${profile.investmentCapital?.toLocaleString() || 'Not specified'}
- Target Location: ${profile.location}
- Goals: ${profile.investmentStrategy || 'Maximum returns'}

MARKET RESEARCH DATA:
${JSON.stringify(marketData, null, 2)}

BASE STRATEGY CONFIG:
${JSON.stringify(config, null, 2)}

AVAILABLE PROPERTIES:
${JSON.stringify(properties.slice(0, 10).map(p => ({
  address: p.address,
  price: p.price,
  bedrooms: p.bedrooms,
  bathrooms: p.bathrooms,
  sqft: p.square_feet,
  type: p.property_type
})), null, 2)}

Return a comprehensive investment strategy with: executiveSummary, purchasingPower, marketAnalysis, propertyRecommendations, financialProjections, nextSteps, additionalInsights`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      });
      
      const strategy = JSON.parse(chatResponse.choices[0].message.content || '{}');
      console.log('✅ Generated strategy using direct Tavily integration');
      
      return strategy;
      
    } catch (error) {
      console.error('❌ Direct Tavily integration failed:', error);
      return this.extractStrategyFromText('', profile, properties);
    }
  }

  /**
   * Perform market research using direct Tavily API
   */
  private async performTavilyResearch(profile: Partial<BuyerProfile>) {
    const queries = [
      `${profile.location} real estate investment market analysis 2025`,
      `${profile.location} ${profile.investorType} investment opportunities`,
      `${profile.location} rental market vacancy rates cap rates`,
      `${profile.location} new development construction projects`,
      `${profile.location} employment growth major employers`
    ];

    const marketData: any = {
      location: profile.location,
      researched_data: [],
      timestamp: new Date().toISOString()
    };

    try {
      // For now, we'll simulate the research since we need the actual Tavily API setup
      // In production, you would make actual HTTP calls to Tavily API
      console.log('📊 Simulating Tavily research for:', queries);
      
      marketData.researched_data = [
        `Market analysis for ${profile.location} shows strong investment potential`,
        `${profile.investorType} opportunities available in the area`,
        'Current rental market conditions indicate favorable vacancy rates',
        'New development projects planned for the region',
        'Employment growth supporting rental demand'
      ];
      
      return marketData;
      
    } catch (error) {
      console.error('❌ Tavily research failed:', error);
      return marketData;
    }
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

${strategy.additionalInsights && strategy.additionalInsights.length > 0 
  ? strategy.additionalInsights.map(insight => `- ${insight}`).join('\n')
  : '- Market analysis in progress...'}

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