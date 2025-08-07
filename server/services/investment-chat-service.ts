/**
 * Investment Chat Service
 * 
 * Handles conversational investment profile building
 * Uses static knowledge base + LLM enhancements
 */

import OpenAI from 'openai';
import type { BuyerProfile } from '@shared/schema';
import { v4 as uuidv4 } from 'uuid';
import { 
  INVESTMENT_KNOWLEDGE, 
  getInvestorTypeConfig, 
  getQuestionForField,
  getSearchCriteria 
} from './investment-strategies-knowledge';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface InvestorContext {
  buyerType: 'investor';
  investorType?: 'rental_income' | 'flip' | 'house_hack' | 'multi_unit';
  investmentCapital?: number;
  targetMonthlyReturn?: number;
  targetCapRate?: number;
  location?: string;
  investmentStrategy?: string;
  timeline?: string;
  experience?: string;
  goals?: string;
  messages: string[];
  [key: string]: any;
}

interface ChatResponse {
  type: 'need_info' | 'ready_to_analyze' | 'error';
  message: string;
  context?: InvestorContext;
  strategyId?: string;
  missingFields?: string[];
}

export class InvestmentChatService {
  
  /**
   * Process a chat message and extract investment information
   */
  async processMessage(message: string, existingContext: InvestorContext | any = {}): Promise<ChatResponse> {
    try {
      console.log('📨 Processing investment chat message:', { message, existingContext });
      
      // Initialize context if needed
      const context: InvestorContext = {
        buyerType: 'investor',
        messages: [...(existingContext.messages || []), message],
        ...existingContext
      };
      
      // Extract investment information from the message
      const extractedInfo = await this.extractInvestmentInfo(message, context);
      console.log('🔍 Extracted info:', extractedInfo);
      
      // Merge with existing context
      const updatedContext = {
        ...context,
        ...extractedInfo
      };
      console.log('📋 Updated context:', updatedContext);
      
      // Check what information is still missing
      const missingFields = this.checkMissingInfo(updatedContext);
      console.log('❓ Missing fields:', missingFields);
      
      if (missingFields.length > 0) {
        // Get next question from knowledge base
        const nextQuestion = await this.generateNextQuestion(missingFields[0], updatedContext);
        console.log('💬 Next question:', nextQuestion);
        
        return {
          type: 'need_info',
          message: nextQuestion,
          context: updatedContext,
          missingFields
        };
      }
      
      // All information collected - ready to generate strategy
      const strategyId = uuidv4();
      console.log('✅ Ready to generate strategy:', { strategyId, context: updatedContext });
      
      return {
        type: 'ready_to_analyze',
        message: "Perfect! I have all the information I need. I'm now searching real-time market data and analyzing properties for your investment strategy. This comprehensive analysis will take about 5-10 minutes. I'll notify you when your strategy document is ready.",
        context: updatedContext,
        strategyId
      };
      
    } catch (error) {
      console.error('❌ Error processing investment chat:', error);
      return {
        type: 'error',
        message: 'I encountered an error processing your message. Please try again.'
      };
    }
  }
  
  /**
   * Extract investment information using GPT-4
   */
  private async extractInvestmentInfo(message: string, context: InvestorContext): Promise<Partial<InvestorContext>> {
    const prompt = `
      Extract investment information from this conversation.
      
      Previous context: ${JSON.stringify(context)}
      New message: "${message}"
      
      Extract the following information if mentioned:
      - investorType: Map their goals to type:
        * "monthly cash flow" or "passive income" or "rental" → "rental_income"
        * "quick profits" or "flip" or "renovation" → "flip"  
        * "house hack" or "live in one unit" → "house_hack"
        * "multi-unit" or "apartment building" or "multiple units" → "multi_unit"
      - investmentCapital: How much capital do they have available? (extract number only)
      - location: What location(s) are they interested in?
      - targetMonthlyReturn: What monthly cash flow are they targeting? (number only)
      - targetCapRate: What cap rate are they looking for? (number only)
      - timeline: What's their investment timeline?
      - experience: Are they new or experienced investors?
      - goals: What are their specific investment goals?
      
      IMPORTANT: If they mention investment goals like "monthly cash flow", map it to the appropriate investorType.
      If they mention dollar amounts, extract the number (e.g., "$2 million" = 2000000).
      
      Return ONLY a JSON object with the extracted fields. If a field is not mentioned, don't include it.
      Example: {"investorType": "rental_income", "investmentCapital": 2000000, "location": "Boston"}
    `;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    
    const extracted = JSON.parse(response.choices[0].message.content || '{}');
    
    return extracted;
  }
  
  /**
   * Check what required information is missing
   */
  private checkMissingInfo(context: InvestorContext): string[] {
    const required = ['investorType', 'investmentCapital', 'location'];
    const missing = required.filter(field => !context[field]);
    
    // Additional checks based on investor type
    if (context.investorType) {
      const config = getInvestorTypeConfig(context.investorType);
      if (config) {
        // Check if we need specific return targets
        if ((context.investorType === 'rental_income' || context.investorType === 'multi_unit') 
            && !context.targetMonthlyReturn && !context.targetCapRate && !context.goals) {
          missing.push('targetMonthlyReturn'); // Ask for specific return targets instead of goals
        }
      }
    }
    
    return missing;
  }
  
  /**
   * Generate contextual next question using knowledge base
   */
  private async generateNextQuestion(missingField: string, context: InvestorContext): Promise<string> {
    // Get base question from knowledge base
    const baseQuestion = getQuestionForField(missingField);
    
    // For the first question, return as-is
    if (context.messages.length <= 1) {
      return baseQuestion;
    }
    
    // Otherwise, make it contextual using GPT
    const prompt = `
      Make this question more conversational and contextual.
      
      Base question: ${baseQuestion}
      Context so far: ${JSON.stringify({
        investorType: context.investorType,
        investmentCapital: context.investmentCapital,
        location: context.location
      })}
      
      Make it friendly and reference what they've told us. Keep it to 1-2 sentences.
    `;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 100
    });
    
    return response.choices[0].message.content || baseQuestion;
  }
  
  /**
   * Build complete investor profile from context
   */
  buildInvestorProfile(context: InvestorContext): Partial<BuyerProfile> {
    const config = context.investorType ? getInvestorTypeConfig(context.investorType) : null;
    
    const profile: Partial<BuyerProfile> = {
      buyerType: 'investor',
      investorType: context.investorType,
      investmentCapital: context.investmentCapital,
      targetMonthlyReturn: context.targetMonthlyReturn,
      targetCapRate: context.targetCapRate?.toString(),
      location: context.location,
      investmentStrategy: context.investmentStrategy || context.goals,
      
      // Set defaults for investor profiles
      name: context.name || 'Investor',
      email: context.email || 'investor@example.com',
      budget: this.calculateBudgetString(context.investmentCapital),
      budgetMin: context.investmentCapital ? Math.floor(context.investmentCapital * 0.8) : undefined,
      budgetMax: context.investmentCapital ? Math.floor(context.investmentCapital * ((config?.searchCriteria as any)?.priceMultiplier || 4)) : undefined,
      
      // Use config for defaults
      homeType: context.investorType === 'multi_unit' ? 'other' : 'single-family',
      bedrooms: (config?.searchCriteria as any)?.minBedrooms || 3,
      bathrooms: context.investorType === 'multi_unit' ? '8+' : '2+',
      
      // Get features from knowledge base
      mustHaveFeatures: config?.mustHaveFeatures || [],
      dealbreakers: config?.dealbreakers || [],
      
      rawInput: JSON.stringify(context.messages || []),
      inputMethod: 'text'
    };
    
    return profile;
  }
  
  /**
   * Get search criteria for Repliers based on investor profile
   */
  getInvestorSearchCriteria(context: InvestorContext) {
    if (!context.investorType || !context.investmentCapital) {
      return null;
    }
    
    return getSearchCriteria(context.investorType, context.investmentCapital);
  }
  
  private calculateBudgetString(capital?: number): string {
    if (!capital) return 'To be determined';
    
    // Assume 25% down payment for investment properties
    const maxPurchase = capital * 4;
    const minPurchase = capital * 2; // Conservative leverage
    
    return `$${(minPurchase / 1000).toFixed(0)}K - $${(maxPurchase / 1000).toFixed(0)}K`;
  }
}

export const investmentChatService = new InvestmentChatService();