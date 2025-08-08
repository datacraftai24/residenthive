/**
 * Strategy Builder Agent
 * Role: Investment Strategy Analyst
 * Responsibility: Parse requirements and generate investment strategy framework
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface InvestmentProfile {
  capital: number;
  targetReturn: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  propertyTypes: string[];
  locations: string[];
  strategicFactors: {
    universities?: boolean;
    publicTransport?: boolean;
    developmentPlans?: boolean;
    emergingMarkets?: boolean;
  };
  preferences: {
    multiFamily?: boolean;
    passiveIncome: number;
    maxCashFlowShortfall: number;
  };
}

export class StrategyBuilderAgent {
  private model = 'gpt-3.5-turbo';

  async analyzeInvestorRequirements(userInput: string, agentInsights?: string[]): Promise<InvestmentProfile> {
    const prompt = `
You are an expert Investment Strategy Analyst working with experienced real estate agents. Parse the following investor requirements and extract structured investment criteria, incorporating expert real estate insights.

User Input: "${userInput}"

${agentInsights ? `
Real Estate Agent Insights to Consider:
${agentInsights.join('\n')}

Incorporate these professional insights into your analysis, especially regarding:
- ADU (Accessory Dwelling Unit) potential
- Property improvement opportunities  
- Value-add strategies
- Market-specific considerations
` : ''}

Extract and return a JSON object with the following structure:
{
  "capital": number (investment capital available),
  "targetReturn": number (monthly target return),
  "riskTolerance": "conservative" | "moderate" | "aggressive",
  "propertyTypes": ["single-family", "multi-family", "condo", etc.],
  "locations": [list of preferred locations],
  "strategicFactors": {
    "universities": boolean (wants university towns),
    "publicTransport": boolean (wants good transportation),
    "developmentPlans": boolean (interested in upcoming development),
    "emergingMarkets": boolean (wants emerging markets with lower prices)
  },
  "preferences": {
    "multiFamily": boolean (prefers 3-4 unit properties),
    "passiveIncome": number (target passive income after expenses),
    "maxCashFlowShortfall": number (acceptable monthly shortfall),
    "aduInterest": boolean (interested in ADU potential),
    "valueAddFocus": boolean (willing to invest in improvements),
    "comprehensiveAnalysis": boolean (wants detailed property enhancement analysis)
  }
}

Focus on extracting:
- Investment capital amount
- Target returns/passive income
- Geographic preferences 
- Property type preferences (especially multi-family 3-4 units)
- Strategic factors like universities, transportation, development plans
- Risk tolerance based on language used

Return only valid JSON.
`;

    try {
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }

      return JSON.parse(content) as InvestmentProfile;
    } catch (error) {
      console.error('Strategy Builder Agent error:', error);
      
      // Fallback parsing for basic requirements
      return this.fallbackParser(userInput);
    }
  }

  private fallbackParser(userInput: string): InvestmentProfile {
    const capitalMatch = userInput.match(/\$?(\d+)k/i);
    const capital = capitalMatch ? parseInt(capitalMatch[1]) * 1000 : 300000;
    
    const returnMatch = userInput.match(/\$?(\d+)(?:k)?\s*(?:monthly|passive)/i);
    const targetReturn = returnMatch ? parseInt(returnMatch[1]) : 2000;

    return {
      capital,
      targetReturn,
      riskTolerance: 'moderate',
      propertyTypes: userInput.includes('multi') ? ['multi-family'] : ['single-family', 'multi-family'],
      locations: this.extractLocations(userInput),
      strategicFactors: {
        universities: userInput.includes('university') || userInput.includes('college'),
        publicTransport: userInput.includes('transport') || userInput.includes('transit'),
        developmentPlans: userInput.includes('development') || userInput.includes('emerging'),
        emergingMarkets: userInput.includes('emerging') || userInput.includes('potential')
      },
      preferences: {
        multiFamily: userInput.includes('3-4') || userInput.includes('multi'),
        passiveIncome: targetReturn,
        maxCashFlowShortfall: 500,
        aduInterest: userInput.includes('ADU') || userInput.includes('basement') || userInput.includes('accessory'),
        valueAddFocus: userInput.includes('renovation') || userInput.includes('improvement') || userInput.includes('value-add'),
        comprehensiveAnalysis: userInput.includes('comprehensive') || userInput.includes('detailed') || !userInput.includes('speed')
      }
    };
  }

  private extractLocations(userInput: string): string[] {
    const locations = [];
    
    if (userInput.includes('Massachusetts') || userInput.includes('MA')) {
      locations.push('Massachusetts');
    }
    if (userInput.includes('Boston')) {
      locations.push('Boston');
    }
    if (userInput.includes('emerging') && !locations.length) {
      locations.push('Massachusetts'); // Default to MA for emerging markets
    }
    
    return locations.length ? locations : ['Massachusetts'];
  }

  async generateInvestmentStrategy(profile: InvestmentProfile): Promise<string> {
    const prompt = `
Based on this investment profile, generate a comprehensive investment strategy:

Profile: ${JSON.stringify(profile, null, 2)}

Provide a strategic framework that includes:
1. Investment approach based on capital and risk tolerance
2. Geographic focus rationale  
3. Property type recommendations
4. Expected returns and timeline
5. Risk mitigation strategies
6. Strategic advantages (universities, development, etc.)

Keep it concise but comprehensive.
`;

    const response = await openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    return response.choices[0]?.message?.content || 'Strategy generation failed';
  }
}