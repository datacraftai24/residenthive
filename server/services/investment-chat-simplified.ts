/**
 * Simplified Investment Chat Service
 * 
 * PURPOSE: Gather information and capture agent insights
 * - Ask smart questions (max 5-6)
 * - Capture and persist agent insights (THE GOLD!)
 * - Pass raw conversation to AI Investment Advisor for parsing
 * 
 * NO strategic decisions made here - that's the Strategy Agent's job
 */

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { agentInsights } from '../db/schema-agent-insights';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ChatSession {
  sessionId: string;
  messages: Array<{
    role: 'agent' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  questionsAsked: number;
  hasAskedForInsights: boolean;
}

export interface ChatResponse {
  type: 'question' | 'ready' | 'error';
  message: string;
  sessionId: string;
  rawConversation?: string; // For passing to parseNaturalLanguage
}

export class SimplifiedInvestmentChatService {
  private readonly MAX_QUESTIONS = 5;
  private readonly INSIGHT_QUESTION_NUMBER = 4; // Ask for insights as question #4
  private sessions = new Map<string, ChatSession>(); // Store sessions in memory
  
  /**
   * Main entry point - process agent message
   */
  async processMessage(
    message: string,
    sessionId?: string
  ): Promise<ChatResponse> {
    
    // Retrieve existing session or create new
    const currentSession = sessionId 
      ? this.sessions.get(sessionId) || this.createNewSession()
      : this.createNewSession();
    
    // Store session for next call
    this.sessions.set(currentSession.sessionId, currentSession);
    
    // Log for debugging
    console.log(`📝 Session ${currentSession.sessionId}: Message ${currentSession.messages.length + 1}`);
    console.log(`   Content: "${message}"`);
    
    // Add agent's message
    currentSession.messages.push({
      role: 'agent',
      content: message,
      timestamp: new Date()
    });
    
    // Check if this might be agent insights
    if (currentSession.hasAskedForInsights && currentSession.questionsAsked >= this.INSIGHT_QUESTION_NUMBER) {
      // This response likely contains agent insights - PERSIST THEM!
      await this.persistAgentInsights(message, currentSession);
    }
    
    // Check if we have enough info (simple heuristic)
    const hasEnoughInfo = await this.assessCompleteness(currentSession);
    
    if (hasEnoughInfo || currentSession.questionsAsked >= this.MAX_QUESTIONS) {
      // We're done - prepare conversation for AI Investment Advisor
      const rawConversation = this.formatConversationForParsing(currentSession);
      
      return {
        type: 'ready',
        message: "Perfect! I have everything I need. Let me analyze the market and find the best investment opportunities for your client. This will take about 5-10 minutes.",
        sessionId: currentSession.sessionId,
        rawConversation
      };
    }
    
    // Generate next question
    let nextQuestion: string;
    
    if (currentSession.questionsAsked === this.INSIGHT_QUESTION_NUMBER - 1 && !currentSession.hasAskedForInsights) {
      // Time to ask for agent insights!
      nextQuestion = await this.generateAgentInsightQuestion(currentSession);
      currentSession.hasAskedForInsights = true;
    } else {
      // Regular information gathering question
      nextQuestion = await this.generateSmartQuestion(currentSession);
    }
    
    // Add our question
    currentSession.messages.push({
      role: 'assistant',
      content: nextQuestion,
      timestamp: new Date()
    });
    currentSession.questionsAsked++;
    
    return {
      type: 'question',
      message: nextQuestion,
      sessionId: currentSession.sessionId
    };
  }
  
  /**
   * Generate a smart question based on conversation context
   */
  private async generateSmartQuestion(session: ChatSession): Promise<string> {
    
    const conversationSoFar = session.messages
      .map(m => `${m.role === 'agent' ? 'Agent' : 'Assistant'}: ${m.content}`)
      .join('\n');
    
    const prompt = `You are an expert real estate investment advisor helping an agent with their client.

Conversation so far:
${conversationSoFar}

You have ${this.MAX_QUESTIONS - session.questionsAsked} questions remaining.

Generate ONE question that:
1. Builds naturally on the conversation
2. Gathers essential investment information
3. Is specific and actionable
4. Avoids repetition

Essential information needed:
- Investment capital/budget
- Target locations  
- Investment goals (cash flow, appreciation, etc.)
- Timeline (immediate income vs long-term)
- Risk tolerance
- Property preferences
- Renovation willingness (turnkey vs fixer-upper)
- Management preference (self-manage vs passive)
- Living situation (will they live in property?)

Based on what's been discussed, ask the MOST RELEVANT follow-up question.

For example:
- If they said "immediate cash flow" → Ask about turnkey vs renovation
- If they said "best returns" → Ask about time commitment and management
- If they have large budget → Ask about multiple properties vs single larger
- If they mention location → Ask about specific neighborhoods

RULES:
- NO market statistics or claims
- NO promises about availability
- Focus on the CLIENT's situation
- Keep it conversational and concise
- Make questions build on previous answers

Return only the question text.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 150
    });
    
    return response.choices[0].message.content || this.getFallbackQuestion(session.questionsAsked);
  }
  
  /**
   * Generate question specifically asking for agent insights
   */
  private async generateAgentInsightQuestion(session: ChatSession): Promise<string> {
    
    // Extract client name if mentioned
    const clientName = this.extractClientName(session);
    const clientRef = clientName || "your client";
    
    const insightPrompts = [
      `Based on your experience with ${clientRef} and knowledge of the local market, what investment strategy do you think would work best? Are there any off-market opportunities or upcoming developments I should know about?`,
      
      `You know ${clientRef} better than anyone - what's really driving their investment decision? And from your local market expertise, are there any hidden opportunities or timing considerations I should factor in?`,
      
      `Given ${clientRef}'s personality and your insider knowledge of the local market, what approach would you recommend? Are there any red flags I should watch for or special opportunities only you know about?`
    ];
    
    // Pick one randomly for variety
    return insightPrompts[Math.floor(Math.random() * insightPrompts.length)];
  }
  
  /**
   * Persist agent insights to database - THIS IS THE GOLD!
   */
  private async persistAgentInsights(message: string, session: ChatSession): Promise<void> {
    console.log('💎 CAPTURING AGENT INSIGHTS - THIS IS GOLD!');
    
    // Use LLM to extract structured insights from the agent's response
    const extractedInsights = await this.extractInsightsFromMessage(message, session);
    
    try {
      await db.insert(agentInsights).values({
        sessionId: session.sessionId,
        
        // Client insights
        clientPersonality: extractedInsights.clientPersonality,
        clientMotivations: extractedInsights.clientMotivations,
        decisionStyle: extractedInsights.decisionStyle,
        hiddenConcerns: extractedInsights.hiddenConcerns,
        
        // Market intelligence
        offMarketOpportunities: extractedInsights.offMarketOpportunities,
        neighborhoodDynamics: extractedInsights.neighborhoodDynamics,
        localDevelopmentPlans: extractedInsights.localDevelopmentPlans,
        timingConsiderations: extractedInsights.timingConsiderations,
        
        // Strategy
        recommendedStrategy: extractedInsights.recommendedStrategy,
        whyThisStrategy: extractedInsights.whyThisStrategy,
        alternativeApproaches: extractedInsights.alternativeApproaches,
        
        // Risks
        redFlags: extractedInsights.redFlags,
        mitigationStrategies: extractedInsights.mitigationStrategies,
        
        // Relationship intelligence
        sellerMotivations: extractedInsights.sellerMotivations,
        negotiationTips: extractedInsights.negotiationTips,
        
        // Next steps
        nextSteps: extractedInsights.nextSteps,
        agentCommitments: extractedInsights.agentCommitments,
        
        // Full conversation for context
        fullConversation: session.messages,
        
        // Quality markers
        insightQuality: this.assessInsightQuality(extractedInsights),
        hasOffMarketInfo: !!extractedInsights.offMarketOpportunities,
        hasLocalIntelligence: !!extractedInsights.neighborhoodDynamics || !!extractedInsights.localDevelopmentPlans
      });
      
      console.log('✅ Agent insights persisted successfully!');
      
      // Log what we captured for debugging
      if (extractedInsights.offMarketOpportunities) {
        console.log('🏠 Off-market opportunities captured!');
      }
      if (extractedInsights.neighborhoodDynamics) {
        console.log('📍 Local intelligence captured!');
      }
      
    } catch (error) {
      console.error('❌ Failed to persist agent insights:', error);
    }
  }
  
  /**
   * Extract structured insights from agent's message
   */
  private async extractInsightsFromMessage(message: string, session: ChatSession): Promise<any> {
    
    const prompt = `Extract valuable agent insights from this message. This is GOLD - real human knowledge that can't be found online.

Agent's message: "${message}"

Context: This is an agent sharing insights about their client and local market.

Extract the following if mentioned:
- clientPersonality: How the agent describes the client's personality
- clientMotivations: What's really driving the client
- decisionStyle: How the client makes decisions
- hiddenConcerns: Concerns the client hasn't expressed directly
- offMarketOpportunities: Any off-market properties or sellers mentioned
- neighborhoodDynamics: Local knowledge about neighborhoods
- localDevelopmentPlans: Upcoming developments or changes
- timingConsiderations: When to buy/sell based on local patterns
- recommendedStrategy: Agent's recommended approach
- whyThisStrategy: Why this strategy makes sense
- alternativeApproaches: Other options to consider (array)
- redFlags: Concerns or warnings (array)
- mitigationStrategies: How to handle the risks
- sellerMotivations: Insights about sellers in the area
- negotiationTips: How to negotiate in this market
- nextSteps: What the agent will do next (array)
- agentCommitments: Specific commitments the agent is making

BE GENEROUS in extraction - this is valuable human insight we want to preserve.
Return a JSON object with any insights found.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    
    return JSON.parse(response.choices[0].message.content || '{}');
  }
  
  /**
   * Assess the quality of insights provided
   */
  private assessInsightQuality(insights: any): 'high' | 'medium' | 'low' {
    let score = 0;
    
    // High value insights
    if (insights.offMarketOpportunities) score += 3;
    if (insights.localDevelopmentPlans) score += 3;
    if (insights.neighborhoodDynamics) score += 2;
    
    // Medium value insights
    if (insights.clientPersonality) score += 1;
    if (insights.recommendedStrategy) score += 1;
    if (insights.negotiationTips) score += 1;
    
    if (score >= 5) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }
  
  /**
   * Simple check if we have enough information
   */
  private async assessCompleteness(session: ChatSession): Promise<boolean> {
    // Simple heuristic: need at least 3 questions answered
    // and either agent insights or 5 questions total
    return session.questionsAsked >= 3 && 
           (session.hasAskedForInsights || session.questionsAsked >= this.MAX_QUESTIONS);
  }
  
  /**
   * Format conversation for parseNaturalLanguage in AI Investment Advisor
   */
  private formatConversationForParsing(session: ChatSession): string {
    // Extract key information from conversation
    const structured = this.extractKeyInfo(session);
    
    // Create comprehensive context
    const context = {
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      raw: session.messages
        .filter(m => m.role === 'agent')
        .map(m => m.content)
        .join('\n'), // Use newlines for better parsing
      structured: structured
    };
    
    console.log('📦 Formatted context for parsing:', JSON.stringify(structured, null, 2));
    
    return JSON.stringify(context);
  }
  
  /**
   * Extract key information from conversation
   */
  private extractKeyInfo(session: ChatSession): any {
    const allText = session.messages.map(m => m.content).join(' ');
    const lowerText = allText.toLowerCase();
    
    // Extract budget explicitly - handle various formats
    const budgetPatterns = [
      /\$?([\d,]+)\s*[Kk]\s*(cash|available|budget)/,
      /(\d+)\s*[Kk]\s+as\s+cash/i,
      /have\s+\$?([\d,]+)\s*[Kk]?/i,
      /budget\s+of\s+\$?([\d,]+)\s*[Kk]?/i
    ];
    
    let detectedBudget = null;
    for (const pattern of budgetPatterns) {
      const match = allText.match(pattern);
      if (match) {
        const amount = parseInt(match[1].replace(/,/g, ''));
        // Check if K/k was mentioned
        if (match[0].toLowerCase().includes('k')) {
          detectedBudget = amount * 1000;
        } else {
          detectedBudget = amount > 10000 ? amount : amount * 1000; // Assume K if number is small
        }
        break;
      }
    }
    
    // Extract location - expanded list including Quincy
    const locationMatch = allText.match(/(Quincy|Lowell|Lowel|Springfield|Worcester|Lynn|Boston|Cambridge|Somerville|Medford|Malden|Revere)/i);
    
    // Extract timeline preferences
    const wantsImmediate = /immediate|right away|asap|quick|now|urgent/.test(lowerText);
    const canWait = /long term|patient|wait|future|years/.test(lowerText);
    
    // Extract renovation willingness
    const willingToRenovate = /fix|renovate|rehab|update|improve|brrrr|distressed/.test(lowerText);
    const wantsTurnkey = /turnkey|move-in ready|no work|ready to rent/.test(lowerText);
    
    // Extract management preferences
    const selfManage = /manage myself|self-manage|hands-on/.test(lowerText);
    const wantsPassive = /passive|property manager|hands-off/.test(lowerText);
    
    // Extract property type preferences
    const wantsMultifamily = /multi-family|multifamily|duplex|triplex|fourplex|units/.test(lowerText);
    const wantsSingleFamily = /single family|single-family|house/.test(lowerText);
    
    // Extract return preferences
    const prioritizeCashFlow = /cash flow|monthly income|rental income|immediate cash/.test(lowerText);
    const prioritizeAppreciation = /appreciation|long term|equity|growth/.test(lowerText);
    const wantsBestReturns = /best return|maximum return|highest return/.test(lowerText);
    
    return {
      detectedBudget: detectedBudget,
      detectedLocation: locationMatch ? locationMatch[1] : null,
      hasHouseHack: /stay in|live in|move in|occupy/.test(allText),
      wantsCashFlow: prioritizeCashFlow || /cash earning/.test(lowerText),
      
      // New context fields for better strategy selection
      timeline: wantsImmediate ? 'immediate' : (canWait ? 'long-term' : 'flexible'),
      renovationWilling: willingToRenovate,
      prefersTurnkey: wantsTurnkey,
      managementStyle: selfManage ? 'self' : (wantsPassive ? 'passive' : 'flexible'),
      propertyTypePreference: wantsMultifamily ? 'multifamily' : (wantsSingleFamily ? 'single-family' : 'any'),
      returnPriority: wantsBestReturns ? 'maximum' : (prioritizeCashFlow ? 'cash-flow' : (prioritizeAppreciation ? 'appreciation' : 'balanced')),
      
      allText: allText // Include full text for LLM to parse
    };
  }
  
  /**
   * Extract client name from conversation
   */
  private extractClientName(session: ChatSession): string | null {
    // Simple regex to find names after "client" or "investor"
    const text = session.messages.map(m => m.content).join(' ');
    const match = text.match(/(?:client|investor)\s+named?\s+(\w+)/i);
    return match ? match[1] : null;
  }
  
  /**
   * Get fallback question if LLM fails
   */
  private getFallbackQuestion(questionNumber: number): string {
    const fallbacks = [
      "Tell me about your client's investment goals and available capital.",
      "What locations are they considering, and what's their timeline?",
      "What's their experience level with real estate investing?",
      "Are there any specific property features they need or want to avoid?",
      "Based on your knowledge of this client and the local market, what strategy would work best?"
    ];
    
    return fallbacks[Math.min(questionNumber, fallbacks.length - 1)];
  }
  
  /**
   * Create new session
   */
  private createNewSession(): ChatSession {
    return {
      sessionId: uuidv4(),
      messages: [],
      questionsAsked: 0,
      hasAskedForInsights: false
    };
  }
  
  /**
   * Retrieve agent insights for a session (for Strategy Agent to use)
   */
  async getAgentInsights(sessionId: string): Promise<any> {
    const insights = await db.select()
      .from(agentInsights)
      .where(eq(agentInsights.sessionId, sessionId))
      .limit(1);
    
    return insights[0] || null;
  }
}

// Import for eq
import { eq } from 'drizzle-orm';

export const simplifiedInvestmentChatService = new SimplifiedInvestmentChatService();