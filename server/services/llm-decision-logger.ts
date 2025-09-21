/**
 * LLM Decision Logger Service
 * 
 * Comprehensive logging of all LLM decisions for traceability and ML training
 * Tracks full context, prompts, responses, and decision chains
 */

import { db } from '../db.js';
import { llmDecisions, investmentStrategyScores } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export interface LLMDecision {
  sessionId: string;
  agentName: string;
  decisionType: string;
  userRequirements?: any;
  marketContext?: any;
  systemPrompt?: string;
  userPrompt: string;
  rawResponse: string;
  parsedResponse?: any;
  reasoning?: string[];
  confidence?: number;
  model?: string;
  temperature?: number;
  tokensUsed?: number;
  responseTimeMs?: number;
  parentDecisionId?: number;
  decisionPath?: number[];
}

export interface StrategyScore {
  sessionId: string;
  propertyId: string;
  strategyId: string;
  propertyAddress: string;
  propertyPrice: number;
  propertyData: any;
  strategyName: string;
  strategyType?: string;
  downPaymentPercent?: number;
  downPaymentAmount?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlyCashFlow?: number;
  capRate?: number;
  cashOnCashReturn?: number;
  overallScore: number;
  scoringFactors?: any;
  aiReasoning?: string;
  isFeasible?: boolean;
  feasibilityIssues?: string[];
}

export class LLMDecisionLogger {
  private static instance: LLMDecisionLogger;
  private decisionBuffer: LLMDecision[] = [];
  private scoreBuffer: StrategyScore[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private currentSessionDecisions: Map<string, number[]> = new Map();
  
  private constructor() {
    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000);
  }
  
  static getInstance(): LLMDecisionLogger {
    if (!LLMDecisionLogger.instance) {
      LLMDecisionLogger.instance = new LLMDecisionLogger();
    }
    return LLMDecisionLogger.instance;
  }
  
  /**
   * Log an LLM decision with full context
   */
  async logDecision(decision: LLMDecision): Promise<number> {
    const startLog = Date.now();
    
    console.log(`📝 [LLM Logger] ${decision.agentName} - ${decision.decisionType}`);
    console.log(`   Context: ${JSON.stringify(decision.userRequirements?.budget || {})}`);
    console.log(`   Confidence: ${decision.confidence ? (decision.confidence * 100).toFixed(0) + '%' : 'N/A'}`);
    
    // Build decision path if parent exists
    let decisionPath = decision.decisionPath || [];
    if (decision.parentDecisionId) {
      const parentPath = this.currentSessionDecisions.get(decision.sessionId) || [];
      decisionPath = [...parentPath, decision.parentDecisionId];
    }
    
    try {
      // Insert directly for important decisions
      const result = await db.insert(llmDecisions).values({
        sessionId: decision.sessionId,
        agentName: decision.agentName,
        decisionType: decision.decisionType,
        userRequirements: decision.userRequirements,
        marketContext: decision.marketContext,
        systemPrompt: decision.systemPrompt,
        userPrompt: decision.userPrompt,
        rawResponse: decision.rawResponse,
        parsedResponse: decision.parsedResponse,
        reasoning: decision.reasoning,
        confidence: decision.confidence?.toString(),
        model: decision.model || 'gpt-4o',
        temperature: decision.temperature?.toString() || '0.7',
        tokensUsed: decision.tokensUsed,
        responseTimeMs: decision.responseTimeMs || (Date.now() - startLog),
        parentDecisionId: decision.parentDecisionId,
        decisionPath: decisionPath
      }).returning({ id: llmDecisions.id });
      
      const decisionId = result[0].id;
      
      // Track decision chain for session
      const sessionDecisions = this.currentSessionDecisions.get(decision.sessionId) || [];
      sessionDecisions.push(decisionId);
      this.currentSessionDecisions.set(decision.sessionId, sessionDecisions);
      
      console.log(`   ✅ Logged decision #${decisionId}`);
      return decisionId;
      
    } catch (error) {
      console.error('❌ [LLM Logger] Failed to log decision:', error);
      // Add to buffer as fallback
      this.decisionBuffer.push(decision);
      return -1;
    }
  }
  
  /**
   * Log with automatic context capture
   */
  async withLogging<T>(
    sessionId: string,
    agentName: string,
    decisionType: string,
    context: {
      userRequirements?: any;
      marketContext?: any;
      systemPrompt?: string;
      userPrompt: string;
      parentDecisionId?: number;
    },
    llmCall: () => Promise<{
      content: string;
      parsed?: any;
      confidence?: number;
      model?: string;
      tokensUsed?: number;
    }>
  ): Promise<T> {
    const startTime = Date.now();
    
    console.log(`\n🤖 [${agentName}] Making ${decisionType} decision...`);
    
    try {
      // Execute LLM call
      const result = await llmCall();
      
      // Extract reasoning if present
      let reasoning: string[] = [];
      if (result.parsed?.reasoning) {
        reasoning = Array.isArray(result.parsed.reasoning) 
          ? result.parsed.reasoning 
          : [result.parsed.reasoning];
      }
      
      // Log the decision
      const decisionId = await this.logDecision({
        sessionId,
        agentName,
        decisionType,
        userRequirements: context.userRequirements,
        marketContext: context.marketContext,
        systemPrompt: context.systemPrompt,
        userPrompt: context.userPrompt,
        rawResponse: result.content,
        parsedResponse: result.parsed,
        reasoning,
        confidence: result.confidence,
        model: result.model,
        tokensUsed: result.tokensUsed,
        responseTimeMs: Date.now() - startTime,
        parentDecisionId: context.parentDecisionId
      });
      
      // Return parsed result with decision ID
      const output = result.parsed || result.content;
      if (typeof output === 'object' && output !== null) {
        output._decisionId = decisionId;
      }
      
      return output as T;
      
    } catch (error) {
      console.error(`❌ [${agentName}] Decision failed:`, error);
      
      // Log error case
      await this.logDecision({
        sessionId,
        agentName,
        decisionType,
        userRequirements: context.userRequirements,
        systemPrompt: context.systemPrompt,
        userPrompt: context.userPrompt,
        rawResponse: `ERROR: ${error.message}`,
        confidence: 0,
        responseTimeMs: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Log strategy scoring for a property
   */
  async logStrategyScore(score: StrategyScore): Promise<void> {
    console.log(`📊 [Score Logger] ${score.propertyAddress} - ${score.strategyName}: ${score.overallScore}`);
    
    try {
      await db.insert(investmentStrategyScores).values({
        sessionId: score.sessionId,
        propertyId: score.propertyId,
        strategyId: score.strategyId,
        propertyAddress: score.propertyAddress,
        propertyPrice: score.propertyPrice,
        propertyData: score.propertyData,
        strategyName: score.strategyName,
        strategyType: score.strategyType,
        downPaymentPercent: score.downPaymentPercent?.toString(),
        downPaymentAmount: score.downPaymentAmount,
        monthlyIncome: score.monthlyIncome,
        monthlyExpenses: score.monthlyExpenses,
        monthlyCashFlow: score.monthlyCashFlow,
        capRate: score.capRate?.toString(),
        cashOnCashReturn: score.cashOnCashReturn?.toString(),
        overallScore: score.overallScore.toString(),
        scoringFactors: score.scoringFactors,
        aiReasoning: score.aiReasoning,
        isFeasible: score.isFeasible !== false,
        feasibilityIssues: score.feasibilityIssues
      });
    } catch (error) {
      console.error('❌ [Score Logger] Failed to log score:', error);
      this.scoreBuffer.push(score);
    }
  }
  
  /**
   * Get all decisions for a session
   */
  async getSessionDecisions(sessionId: string): Promise<LLMDecision[]> {
    const results = await db
      .select()
      .from(llmDecisions)
      .where(eq(llmDecisions.sessionId, sessionId))
      .orderBy(llmDecisions.timestamp);
    
    return results.map(r => ({
      sessionId: r.sessionId,
      agentName: r.agentName,
      decisionType: r.decisionType,
      userRequirements: r.userRequirements,
      marketContext: r.marketContext,
      systemPrompt: r.systemPrompt,
      userPrompt: r.userPrompt,
      rawResponse: r.rawResponse,
      parsedResponse: r.parsedResponse,
      reasoning: r.reasoning as string[],
      confidence: r.confidence ? parseFloat(r.confidence) : undefined,
      model: r.model,
      temperature: r.temperature ? parseFloat(r.temperature) : undefined,
      tokensUsed: r.tokensUsed,
      responseTimeMs: r.responseTimeMs,
      parentDecisionId: r.parentDecisionId,
      decisionPath: r.decisionPath as number[]
    }));
  }
  
  /**
   * Get decision chain for analysis
   */
  async getDecisionChain(decisionId: number): Promise<LLMDecision[]> {
    const decision = await db
      .select()
      .from(llmDecisions)
      .where(eq(llmDecisions.id, decisionId))
      .limit(1);
    
    if (!decision[0]) return [];
    
    const chain: LLMDecision[] = [];
    const decisionPath = decision[0].decisionPath as number[] || [];
    
    // Get all decisions in the path
    for (const id of decisionPath) {
      const d = await db
        .select()
        .from(llmDecisions)
        .where(eq(llmDecisions.id, id))
        .limit(1);
      
      if (d[0]) {
        chain.push({
          sessionId: d[0].sessionId,
          agentName: d[0].agentName,
          decisionType: d[0].decisionType,
          userPrompt: d[0].userPrompt,
          rawResponse: d[0].rawResponse,
          confidence: d[0].confidence ? parseFloat(d[0].confidence) : undefined
        });
      }
    }
    
    return chain;
  }
  
  /**
   * Get all strategy scores for a session
   */
  async getSessionScores(sessionId: string): Promise<StrategyScore[]> {
    const results = await db
      .select()
      .from(investmentStrategyScores)
      .where(eq(investmentStrategyScores.sessionId, sessionId))
      .orderBy(desc(investmentStrategyScores.overallScore));
    
    return results.map(r => ({
      sessionId: r.sessionId,
      propertyId: r.propertyId,
      strategyId: r.strategyId,
      propertyAddress: r.propertyAddress,
      propertyPrice: r.propertyPrice,
      propertyData: r.propertyData,
      strategyName: r.strategyName,
      strategyType: r.strategyType,
      monthlyCashFlow: r.monthlyCashFlow,
      overallScore: parseFloat(r.overallScore),
      aiReasoning: r.aiReasoning,
      isFeasible: r.isFeasible
    }));
  }
  
  /**
   * Export decisions for fine-tuning
   */
  async exportForFineTuning(
    filters: {
      agentName?: string;
      decisionType?: string;
      minConfidence?: number;
      successOnly?: boolean;
    } = {}
  ): Promise<Array<{
    messages: Array<{ role: string; content: string }>;
    metadata: any;
  }>> {
    let query = db.select().from(llmDecisions);
    
    if (filters.agentName) {
      query = query.where(eq(llmDecisions.agentName, filters.agentName));
    }
    
    const results = await query;
    
    return results
      .filter(r => !filters.decisionType || r.decisionType === filters.decisionType)
      .filter(r => !filters.minConfidence || (r.confidence && parseFloat(r.confidence) >= filters.minConfidence))
      .filter(r => !filters.successOnly || r.outcomeSuccess === true)
      .map(r => ({
        messages: [
          { role: 'system', content: r.systemPrompt || '' },
          { role: 'user', content: r.userPrompt },
          { role: 'assistant', content: r.rawResponse }
        ],
        metadata: {
          agent: r.agentName,
          type: r.decisionType,
          confidence: r.confidence ? parseFloat(r.confidence) : null,
          context: r.userRequirements,
          success: r.outcomeSuccess
        }
      }));
  }
  
  /**
   * Analyze decision patterns for insights
   */
  async analyzePatterns(sessionId?: string): Promise<{
    totalDecisions: number;
    byAgent: Record<string, number>;
    byType: Record<string, number>;
    averageConfidence: number;
    decisionChains: number;
    averageChainLength: number;
    successRate: number;
  }> {
    let query = db.select().from(llmDecisions);
    
    if (sessionId) {
      query = query.where(eq(llmDecisions.sessionId, sessionId));
    }
    
    const results = await query;
    
    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalConfidence = 0;
    let confidenceCount = 0;
    let successCount = 0;
    let outcomeCount = 0;
    const chains = new Set<string>();
    
    for (const decision of results) {
      byAgent[decision.agentName] = (byAgent[decision.agentName] || 0) + 1;
      byType[decision.decisionType] = (byType[decision.decisionType] || 0) + 1;
      
      if (decision.confidence) {
        totalConfidence += parseFloat(decision.confidence);
        confidenceCount++;
      }
      
      if (decision.outcomeSuccess !== null) {
        outcomeCount++;
        if (decision.outcomeSuccess) successCount++;
      }
      
      if (decision.decisionPath && Array.isArray(decision.decisionPath)) {
        chains.add(JSON.stringify(decision.decisionPath));
      }
    }
    
    const avgChainLength = chains.size > 0 
      ? Array.from(chains).reduce((sum, chain) => sum + JSON.parse(chain).length, 0) / chains.size 
      : 0;
    
    return {
      totalDecisions: results.length,
      byAgent,
      byType,
      averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      decisionChains: chains.size,
      averageChainLength: avgChainLength,
      successRate: outcomeCount > 0 ? successCount / outcomeCount : 0
    };
  }
  
  /**
   * Flush buffers to database
   */
  async flush(): Promise<void> {
    // Flush decisions
    if (this.decisionBuffer.length > 0) {
      const toInsert = [...this.decisionBuffer];
      this.decisionBuffer = [];
      
      try {
        await db.insert(llmDecisions).values(
          toInsert.map(d => ({
            sessionId: d.sessionId,
            agentName: d.agentName,
            decisionType: d.decisionType,
            userRequirements: d.userRequirements,
            marketContext: d.marketContext,
            systemPrompt: d.systemPrompt,
            userPrompt: d.userPrompt,
            rawResponse: d.rawResponse,
            parsedResponse: d.parsedResponse,
            reasoning: d.reasoning,
            confidence: d.confidence?.toString(),
            model: d.model || 'gpt-4o',
            temperature: d.temperature?.toString() || '0.7',
            tokensUsed: d.tokensUsed,
            responseTimeMs: d.responseTimeMs,
            parentDecisionId: d.parentDecisionId,
            decisionPath: d.decisionPath
          }))
        );
        console.log(`✅ [LLM Logger] Flushed ${toInsert.length} decisions`);
      } catch (error) {
        console.error('❌ [LLM Logger] Flush failed:', error);
        this.decisionBuffer = [...toInsert, ...this.decisionBuffer];
      }
    }
    
    // Flush scores
    if (this.scoreBuffer.length > 0) {
      const toInsert = [...this.scoreBuffer];
      this.scoreBuffer = [];
      
      try {
        await db.insert(investmentStrategyScores).values(
          toInsert.map(s => ({
            sessionId: s.sessionId,
            propertyId: s.propertyId,
            strategyId: s.strategyId,
            propertyAddress: s.propertyAddress,
            propertyPrice: s.propertyPrice,
            propertyData: s.propertyData,
            strategyName: s.strategyName,
            strategyType: s.strategyType,
            downPaymentPercent: s.downPaymentPercent?.toString(),
            downPaymentAmount: s.downPaymentAmount,
            monthlyIncome: s.monthlyIncome,
            monthlyExpenses: s.monthlyExpenses,
            monthlyCashFlow: s.monthlyCashFlow,
            capRate: s.capRate?.toString(),
            cashOnCashReturn: s.cashOnCashReturn?.toString(),
            overallScore: s.overallScore.toString(),
            scoringFactors: s.scoringFactors,
            aiReasoning: s.aiReasoning,
            isFeasible: s.isFeasible !== false,
            feasibilityIssues: s.feasibilityIssues
          }))
        );
        console.log(`✅ [Score Logger] Flushed ${toInsert.length} scores`);
      } catch (error) {
        console.error('❌ [Score Logger] Flush failed:', error);
        this.scoreBuffer = [...toInsert, ...this.scoreBuffer];
      }
    }
  }
  
  /**
   * Clean up
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

// Export singleton
export const llmLogger = LLMDecisionLogger.getInstance();