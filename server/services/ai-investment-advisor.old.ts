/**
 * AI Investment Advisor - Unified Multi-Agent System
 * 
 * This is the main orchestrator that coordinates all AI agents to provide
 * comprehensive investment recommendations based on real-time data.
 * 
 * Features:
 * - Natural language understanding
 * - Multi-agent collaboration
 * - Real property search via Repliers
 * - Agent debate and consensus
 * - Complete investment packaging
 */

import * as path from 'path';
import { withSpan, SpanContext } from '../observability/withSpan.js';
import { tracedLLMCall } from '../observability/llm-tracer.js';
import { FactStore } from './fact-store.js';
import { ResearchMesh } from './research-mesh.js';
import { PropertyHunterAgent } from '../agents/property-hunter.js';
import { InvestmentReportGenerator } from './investment-report-generator.js';
import { SmartFinancialCalculator } from '../agents/financial-calculator-smart.js';
import { templateManager } from './template-manager.js';
import { llmLogger } from './llm-decision-logger.js';
import { strategyEvaluator } from './strategy-evaluator.js';

// Import AI Agents
import { StrategyMindAgent } from '../ai-agents/strategy-mind-agent.js';

// Import Research-Driven Agents
import { researchCoordinator } from '../ai-agents/research-coordinator.js';
import { smartResearchAgent } from '../ai-agents/smart-research-agent.js';
import { strategyBuilderMCP } from '../ai-agents/strategy-builder-mcp.js';

// Types
import type { UserRequirements } from './market-discovery.js';
import type { EnrichedProperty } from '../agents/property-hunter.js';
import type { StrategyPackage } from '../ai-agents/strategy-mind-agent.js';

/**
 * Natural language input from user
 */
export interface InvestmentQuery {
  query: string;
  preferences?: {
    depth?: 'quick' | 'standard' | 'comprehensive';
    riskTolerance?: 'low' | 'medium' | 'high';
    timeHorizon?: number; // years
    locations?: string[]; // optional location preferences
  };
}

/**
 * Complete investment recommendation
 */
export interface InvestmentRecommendation {
  property: EnrichedProperty;
  strategy: {
    name: string;
    type: 'conservative' | 'innovative' | 'aggressive';
    description: string;
    implementation: string[];
    timeline: string;
  };
  financials: {
    purchasePrice: number;
    downPayment: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    netCashFlow: number;
    fiveYearROI: number;
    breakEvenMonths: number;
  };
  marketContext: {
    location: string;
    whyNowIsGoodTime: string;
    marketPhase: string;
    appreciation: string;
  };
  risks: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
  confidence: number;
  reasoning: string[];
  agentInsights: {
    strategyMind?: string;
    financialCalculator?: string;
  };
}

/**
 * Complete advisor response
 */
export interface AdvisorResponse {
  success: boolean;
  query: string;
  interpretedRequirements: UserRequirements;
  recommendations: InvestmentRecommendation[];
  marketOverview: {
    bestMarkets: string[];
    marketTrends: string[];
    timing: string;
  };
  debugInfo?: {
    agentDebates?: any;
    dataResearched?: string[];
    propertiesAnalyzed?: number;
    tracingId?: string;
  };
}

/**
 * AI Investment Advisor - Main Service
 */
export class AIInvestmentAdvisor {
  private factStore: FactStore;
  private researchMesh: ResearchMesh;
  private propertyHunter: PropertyHunterAgent;
  private reportGenerator: InvestmentReportGenerator;
  private smartFinancialCalculator: SmartFinancialCalculator;
  
  // AI Agents
  private strategyMind: StrategyMindAgent;
  
  constructor() {
    this.factStore = new FactStore();
    this.researchMesh = new ResearchMesh(this.factStore);
    this.propertyHunter = new PropertyHunterAgent();
    this.reportGenerator = new InvestmentReportGenerator();
    this.smartFinancialCalculator = new SmartFinancialCalculator(this.factStore, this.researchMesh);
    
    // Initialize AI agents
    this.strategyMind = new StrategyMindAgent(this.factStore);
  }
  
  /**
   * Initialize the advisor
   */
  async initialize(): Promise<void> {
    await this.factStore.initialize();
    await templateManager.initialize();
    console.log('✅ AI Investment Advisor initialized');
  }
  
  /**
   * Main entry point - analyze investment query
   */
  analyze = withSpan(
    'ai_investment_advisor',
    async (
      investmentQuery: InvestmentQuery,
      ctx: SpanContext
    ): Promise<AdvisorResponse> => {
      
      console.log('\n' + '='.repeat(80));
      console.log('🤖 AI INVESTMENT ADVISOR ACTIVATED');
      console.log('='.repeat(80));
      console.log('Query:', investmentQuery.query);
      console.log('Depth:', investmentQuery.preferences?.depth || 'standard');
      
      ctx.addTag('query_length', investmentQuery.query.length);
      ctx.addTag('analysis_depth', investmentQuery.preferences?.depth || 'standard');
      
      try {
        // Generate session ID for tracking
        const sessionId = `advisor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        ctx.addTag('session_id', sessionId);
        
        // STEP 1: Parse natural language into requirements
        console.log('\n📝 Step 1: Understanding your requirements...');
        const requirements = await this.parseNaturalLanguage(investmentQuery.query, ctx, sessionId);
        
        // STEP 2: Develop investment strategies
        console.log('\n💡 Step 2: Developing investment strategies...');
        const strategies = await this.developStrategies(requirements, ctx);
        
        // STEP 3: Find best markets
        console.log('\n🔍 Step 3: Discovering market opportunities...');
        const markets = await this.findMarkets(requirements, strategies, ctx);
        
        // STEP 4: Search real properties
        console.log('\n🏠 Step 4: Searching real properties...');
        const properties = await this.searchProperties(requirements, markets, strategies, ctx);
        
        if (properties.length === 0) {
          console.log('⚠️ No properties found matching criteria');
          return this.createEmptyResponse(investmentQuery.query, requirements);
        }
        
        // STEP 5: Analyze each property with MULTIPLE strategies
        console.log('\n🧠 Step 5: Multi-strategy evaluation for each property...');
        const analyses = await this.analyzePropertiesMultiStrategy(properties, requirements, sessionId, ctx);
        
        // STEP 6: Package investment recommendations
        console.log('\n📦 Step 6: Packaging investment recommendations...');
        const recommendations = await this.packageRecommendations(
          properties,
          analyses,
          strategies,
          markets,
          requirements,
          ctx
        );
        
        // STEP 7: Agent debate and consensus
        console.log('\n🎭 Step 7: AI agents debating best options...');
        const finalRecommendations = await this.facilitateDebate(recommendations, ctx);
        
        // Build response
        const response: AdvisorResponse = {
          success: true,
          query: investmentQuery.query,
          interpretedRequirements: requirements,
          recommendations: finalRecommendations,
          marketOverview: {
            bestMarkets: markets.slice(0, 5).map(m => m.location),
            marketTrends: this.extractMarketTrends(markets),
            timing: this.determineMarketTiming(markets)
          },
          debugInfo: {
            propertiesAnalyzed: properties.length,
            dataResearched: await this.getResearchedTopics(),
            tracingId: ctx.getTraceId?.() || 'unknown'
          }
        };
        
        // Generate and save the markdown report
        try {
          const reportResult = await this.reportGenerator.generateReport(response);
          console.log(`\n📄 Report saved: ${reportResult.filePath}`);
          
          // Add report path to response
          response.debugInfo = {
            ...response.debugInfo,
            reportPath: reportResult.filePath,
            reportUrl: this.reportGenerator.generateShareableLink(
              path.basename(reportResult.filePath, '.md')
            )
          };
        } catch (reportError) {
          console.error('⚠️ Failed to generate report:', reportError);
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ ANALYSIS COMPLETE');
        console.log(`Found ${finalRecommendations.length} investment opportunities`);
        console.log('='.repeat(80));
        
        return response;
        
      } catch (error) {
        console.error('❌ AI Investment Advisor error:', error);
        ctx.setConfidence(0);
        ctx.addTag('error', true);
        throw error;
      }
    }
  );
  
  /**
   * Determine financing strategy using LLM based on full context
   */
  private async determineFinancingStrategy(
    query: string,
    context: any,
    sessionId: string,
    ctx: SpanContext
  ): Promise<{
    strategy: string;
    downPaymentPercent: number;
    budgetMin: number;
    budgetMax: number;
    reasoning: string[];
  }> {
    console.log('\n🤖 [LLM Decision] Determining financing strategy...');
    
    const cashAvailable = context.structured?.detectedBudget || 50000;
    
    const systemPrompt = `You are a real estate financing expert who determines the optimal financing strategy based on user context.
Analyze the full context and determine:
1. Best financing strategy (FHA, Conventional, Cash, BRRRR, etc.)
2. Appropriate down payment percentage
3. Realistic budget range based on cash available and financing type`;
    
    const userPrompt = `User Query: "${query}"

Context Analysis:
- Cash Available: $${cashAvailable.toLocaleString()}
- Location: ${context.structured?.detectedLocation || 'unknown'}
- Wants to live in property: ${context.structured?.hasHouseHack || false}
- Investment goals: ${context.structured?.wantsCashFlow ? 'cash flow' : 'general investment'}

Additional Context:
${JSON.stringify(context.messages || [], null, 2)}

Determine the optimal financing strategy. Consider:
- If user wants to live in property → FHA (3.5% down) or VA (0% down if veteran)
- If pure investment → Conventional (20-25% down) or BRRRR
- If cash buyer → Full cash purchase
- Market conditions and local opportunities

Return JSON:
{
  "strategy": "FHA" | "Conventional" | "Cash" | "BRRRR" | "VA" | "Hard Money",
  "downPaymentPercent": number (3.5 for FHA, 20-25 for conventional, etc),
  "budgetMin": number (minimum property price they should consider),
  "budgetMax": number (maximum they can afford with this strategy),
  "reasoning": ["reason1", "reason2", "reason3"],
  "confidence": 0.0-1.0
}`;

    // Use LLM logger to track this decision
    const decision = await llmLogger.withLogging(
      sessionId,
      'financing_strategist',
      'financing_strategy_selection',
      {
        userRequirements: context.structured,
        marketContext: { location: context.structured?.detectedLocation },
        systemPrompt,
        userPrompt
      },
      async () => {
        const result = await tracedLLMCall({
          agentName: 'financing_strategist',
          systemPrompt,
          userPrompt,
          temperature: 0.3,
          model: 'gpt-4o',
          responseFormat: 'json_object'
        });
        
        const parsed = result.parsed || JSON.parse(result.content);
        return {
          content: result.content,
          parsed,
          confidence: parsed.confidence || 0.8
        };
      }
    );

    // Log the decision details
    console.log(`  ✅ Strategy: ${decision.strategy}`);
    console.log(`  💰 Down Payment: ${decision.downPaymentPercent}%`);
    console.log(`  🏠 Budget Range: $${decision.budgetMin.toLocaleString()} - $${decision.budgetMax.toLocaleString()}`);
    console.log(`  📊 Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
    decision.reasoning?.forEach((reason: string) => {
      console.log(`     • ${reason}`);
    });
    
    return decision;
  }

  /**
   * Parse natural language into structured requirements
   */
  private async parseNaturalLanguage(
    query: string,
    ctx: SpanContext,
    sessionId?: string
  ): Promise<UserRequirements> {
    
    // Parse the structured context if provided
    let context: any;
    try {
      context = typeof query === 'string' && query.startsWith('{') 
        ? JSON.parse(query) 
        : { raw: query };
    } catch (e) {
      context = { raw: query };
    }
    
    const systemPrompt = `You are an expert at understanding real estate investment requirements.
Extract what the user ACTUALLY said, not what you assume they want.
Be open to creative strategies - single-family with ADUs, house hacking, co-living, etc.`;
    
    const userPrompt = `Parse this investment conversation into structured requirements:

Full conversation:
${JSON.stringify(context.messages || [], null, 2)}

Key information detected:
- Budget: ${context.structured?.detectedBudget ? '$' + context.structured.detectedBudget.toLocaleString() : 'not detected'}
- Location: ${context.structured?.detectedLocation || 'not detected'}
- House hack mentioned: ${context.structured?.hasHouseHack || false}
- Cash flow mentioned: ${context.structured?.wantsCashFlow || false}

Raw text: "${context.raw || query}"

Extract ONLY what was explicitly mentioned:
- Cash available (the actual amount they said they have)
- Location (the actual place they mentioned)
- Goals (what they actually said they want)
- Any specific preferences they mentioned

DO NOT assume property types - let the strategy agent figure that out.
DO NOT default locations - if they said Lowell, use Lowell.
DO NOT assume risk tolerance unless explicitly stated.

If cash amount is mentioned (e.g., "250K cash"), extract it accurately.

Return JSON:
{
  "locations": ["city, state"],
  "budget": {
    "min": number,
    "max": number,
    "cashAvailable": number
  },
  "goals": {
    "primaryGoal": "cash_flow" | "appreciation" | "both",
    "monthlyIncome": number,
    "timeHorizon": number
  },
  "preferences": {
    "willingToLiveIn": boolean,
    "willingToManage": boolean,
    "riskTolerance": "low" | "medium" | "high",
    "propertyTypes": ["single-family", "multi-family", "condo"]
  }
}`;
    
    const result = await tracedLLMCall({
      agentName: 'requirement_parser',
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      model: 'gpt-4o',
      responseFormat: 'json_object'
    });
    
    const parsed = result.parsed || JSON.parse(result.content);
    
    // Use LLM to determine financing strategy instead of hardcoded rules
    const financingDecision = await this.determineFinancingStrategy(
      query,
      context,
      sessionId || `advisor_${Date.now()}`,
      ctx
    );
    
    // Build requirements using LLM decision
    const requirements = {
      locations: parsed.locations?.length > 0 ? parsed.locations : 
        (context.structured?.detectedLocation ? [`${context.structured.detectedLocation}, MA`] : ['Massachusetts']),
      budget: {
        min: financingDecision.budgetMin,
        max: financingDecision.budgetMax,
        cashAvailable: parsed.budget?.cashAvailable > 0 
          ? parsed.budget.cashAvailable 
          : (context.structured?.detectedBudget || 50000),
        downPaymentPercent: financingDecision.downPaymentPercent,
        financingStrategy: financingDecision.strategy
      },
      goals: {
        primaryGoal: parsed.goals?.primaryGoal || 
          (context.structured?.wantsCashFlow ? 'cash_flow' : 'both'),
        monthlyIncome: parsed.goals?.monthlyIncome > 0 ? parsed.goals.monthlyIncome : 500,
        timeHorizon: parsed.goals?.timeHorizon > 0 ? parsed.goals.timeHorizon : 5
      },
      preferences: {
        willingToLiveIn: parsed.preferences?.willingToLiveIn ?? 
          (context.structured?.hasHouseHack || false),
        willingToManage: parsed.preferences?.willingToManage ?? true,
        riskTolerance: parsed.preferences?.riskTolerance || 'medium',
        propertyTypes: parsed.preferences?.propertyTypes || 
          ['single-family', 'multi-family', 'condo'] // Keep options open
      }
    };
    
    // Log financing decision reasoning
    if (sessionId) {
      console.log(`  📝 Financing Strategy: ${financingDecision.strategy}`);
      financingDecision.reasoning?.forEach((r: string) => console.log(`     • ${r}`));
    }
    
    // VALIDATION - Critical for preventing bad runs
    if (requirements.budget.cashAvailable <= 0) {
      console.error('❌ INVALID BUDGET DETECTED:', requirements.budget);
      throw new Error(`Invalid budget: Cash available must be greater than 0. Got: ${requirements.budget.cashAvailable}`);
    }
    
    if (!requirements.locations || requirements.locations.length === 0) {
      console.error('❌ NO LOCATION SPECIFIED');
      throw new Error('No location specified for property search');
    }
    
    // Log what we parsed for transparency
    console.log('════════════════════════════════════════');
    console.log('📊 PARSED REQUIREMENTS:');
    console.log(`  💰 Budget: $${requirements.budget.cashAvailable.toLocaleString()} cash`);
    console.log(`     → Property range: $${requirements.budget.min.toLocaleString()} - $${requirements.budget.max.toLocaleString()}`);
    console.log(`  📍 Locations: ${requirements.locations.join(', ')}`);
    console.log(`  🎯 Goal: ${requirements.goals.primaryGoal}`);
    console.log(`  💵 Target cash flow: $${requirements.goals.monthlyIncome}/month`);
    console.log(`  🏠 Property types: ${requirements.preferences.propertyTypes.join(', ')}`);
    console.log(`  👤 House hack: ${requirements.preferences.willingToLiveIn ? 'Yes' : 'No'}`);
    console.log('════════════════════════════════════════');
    
    return requirements;
  }
  
  /**
   * Develop investment strategies using templates and real market data
   */
  private async developStrategies(
    requirements: UserRequirements,
    ctx: SpanContext
  ): Promise<StrategyPackage> {
    
    // Determine target city from requirements or use default
    const targetCity = requirements.locations && requirements.locations.length > 0
      ? requirements.locations[0].split(',')[0].trim()
      : 'Worcester'; // Default to Worcester if no location specified
    
    console.log(`  🔍 Researching market conditions for ${targetCity}...`);
    
    // Step 1: Get real market context using ResearchMesh
    const marketContext = await this.getMarketContext(targetCity, requirements, ctx);
    
    // Step 2: Select appropriate strategy templates based on budget
    const selectedTemplates = await templateManager.selectTemplatesForUser(requirements, ctx);
    console.log(`  📋 Selected templates: ${Object.values(selectedTemplates).join(', ')}`);
    
    // Step 3: Load full template data
    const templates = {
      conservative: await templateManager.loadTemplate(selectedTemplates.conservative, ctx),
      innovative: await templateManager.loadTemplate(selectedTemplates.innovative, ctx),
      aggressive: await templateManager.loadTemplate(selectedTemplates.aggressive, ctx)
    };
    
    // Step 4: Pass templates and market context to StrategyMind for adaptation
    return await this.strategyMind.generateFromTemplates(
      templates,
      requirements,
      marketContext,
      ctx
    );
  }
  
  /**
   * Get market context using ResearchMesh with dynamic research
   */
  private getMarketContext = withSpan(
    'get_market_context',
    async (
      city: string,
      requirements: UserRequirements,
      ctx: SpanContext
    ): Promise<any> => {
      
      ctx.addTag('city', city);
      ctx.addTag('budget', requirements.budget.cashAvailable);
      
      // Basic market research using ResearchMesh
      console.log(`    • Researching current market trends...`);
      const marketTrends = await this.researchMesh.researchTopic(
        `${city} MA real estate market trends mortgage rates inventory housing prices 2025`,
        { topic: 'market', scopeLevel: 'city', scopeValue: city }
      );
      
      // Research regulations and opportunities
      console.log(`    • Researching local regulations and opportunities...`);
      const regulations = await this.researchMesh.researchTopic(
        `${city} Massachusetts ADU laws zoning changes rental regulations investment opportunities 2025`,
        { topic: 'regulations', scopeLevel: 'city', scopeValue: city }
      );
      
      // Identify additional research needs based on initial findings
      const additionalQueries = await this.identifyAdditionalResearchNeeds(
        city,
        requirements,
        { marketTrends: marketTrends.value, regulations: regulations.value },
        ctx
      );
      
      // Conduct additional targeted research if needed
      const additionalInsights: Record<string, any> = {};
      if (additionalQueries.length > 0) {
        console.log(`    • Conducting ${additionalQueries.length} additional targeted searches...`);
        for (const query of additionalQueries) {
          const result = await this.researchMesh.researchTopic(
            query,
            { topic: 'market', scopeLevel: 'city', scopeValue: city }
          );
          const key = this.extractTopicKey(query);
          additionalInsights[key] = result.value;
        }
      }
      
      ctx.addTag('research_queries_total', 2 + additionalQueries.length);
      
      return {
        location: city,
        budget: requirements.budget,
        goals: requirements.goals,
        marketTrends: marketTrends.value,
        regulations: regulations.value,
        additionalInsights,
        confidence: Math.min(marketTrends.confidence, regulations.confidence),
        lastUpdated: new Date()
      };
    }
  );
  
  /**
   * Identify what additional research would improve strategy development
   */
  private async identifyAdditionalResearchNeeds(
    city: string,
    requirements: UserRequirements,
    initialData: any,
    ctx: SpanContext
  ): Promise<string[]> {
    
    const systemPrompt = 'You identify critical information gaps for real estate investment strategy development.';
    
    const userPrompt = `
Given this initial market research for ${city}, MA:

Market Trends: ${initialData.marketTrends}
Regulations: ${initialData.regulations}

User Requirements:
- Budget: $${requirements.budget.cashAvailable} cash available
- Goal: $${requirements.goals.monthlyIncome}/month cash flow
- Time Horizon: ${requirements.goals.timeHorizon} years

What 2-3 SPECIFIC additional pieces of information would most improve investment strategy development?
Consider:
- Employment/economic drivers specific to this budget range
- Development opportunities (if high budget)
- Student housing (if near universities)
- Section 8 opportunities (if cash flow focused)

Return JSON array of specific search queries that would add value.
Return empty array if existing information is sufficient.`;
    
    try {
      const result = await tracedLLMCall({
        agentName: 'research_gap_identifier',
        systemPrompt,
        userPrompt,
        temperature: 0.5,
        model: 'gpt-4o',
        responseFormat: 'json_object'
      });
      
      const queries = result.parsed?.queries || [];
      ctx.addTag('additional_queries_identified', queries.length);
      
      return queries.slice(0, 3); // Limit to 3 for API efficiency
      
    } catch (error) {
      console.warn('Failed to identify research gaps:', error);
      return [];
    }
  }
  
  /**
   * Extract topic key from research query for organization
   */
  private extractTopicKey(query: string): string {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('university') || lowerQuery.includes('student')) return 'studentHousing';
    if (lowerQuery.includes('employment') || lowerQuery.includes('job')) return 'employment';
    if (lowerQuery.includes('section 8') || lowerQuery.includes('voucher')) return 'section8';
    if (lowerQuery.includes('crime') || lowerQuery.includes('safety')) return 'safety';
    if (lowerQuery.includes('school')) return 'schools';
    if (lowerQuery.includes('development') || lowerQuery.includes('construction')) return 'development';
    return 'other';
  }
  
  /**
   * Find best markets for the strategies
   */
  private async findMarkets(
    requirements: UserRequirements,
    strategies: StrategyPackage,
    ctx: SpanContext
  ): Promise<any[]> {
    
    // Determine markets to scan - ALWAYS use Massachusetts markets
    let marketsToScan = requirements.locations;
    
    // If no locations specified or locations are outside MA, use MA markets
    if (marketsToScan.length === 0 || !marketsToScan.some(loc => loc.includes('MA'))) {
      // Default Massachusetts markets for investment
      marketsToScan = [
        'Worcester, MA',
        'Springfield, MA',
        'Lowell, MA',
        'Cambridge, MA',
        'Quincy, MA',
        'Newton, MA',
        'Somerville, MA',
        'Framingham, MA',
        'Brockton, MA',
        'Lynn, MA'
      ];
    }
    
    // TODO: Replace with Research Coordinator driven approach
    // For now, return simple market objects
    return marketsToScan.map(location => ({
      location,
      opportunityType: 'emerging',
      score: 80,
      whyNowIsTheBestTime: 'Massachusetts ADU-friendly laws and strong rental demand',
      hiddenCatalysts: [],
      unconventionalStrategies: [],
      risksOthersIgnore: []
    }));
  }
  
  /**
   * Search real properties using PropertyHunter with strategy guidance
   */
  private async searchProperties(
    requirements: UserRequirements,
    markets: MarketOpportunity[],
    strategies: StrategyPackage,
    ctx: SpanContext
  ): Promise<EnrichedProperty[]> {
    
    // Extract guidance from the recommended strategy
    const recommendedStrategy = strategies[strategies.recommended];
    const guidance = recommendedStrategy.guidance;
    
    // Build search criteria using strategy guidance if available
    let searchCriteria: any = {
      locations: markets.slice(0, 3).map(m => m.location),
      maxPrice: requirements.budget.max
    };
    
    // Use strategy guidance if available
    if (guidance?.searchGuidance) {
      console.log(`  📋 Using strategy guidance for search: ${recommendedStrategy.name}`);
      
      searchCriteria = {
        ...searchCriteria,
        minBedrooms: this.extractMinBedrooms(guidance.searchGuidance),
        propertyTypes: guidance.searchGuidance.propertyTypes || ['single-family', 'multi-family'],
        strategicFactors: {
          universities: guidance.scoringGuidance?.criticalFactors?.includes('university proximity'),
          publicTransport: guidance.scoringGuidance?.importantFactors?.includes('transit access'),
          emergingMarkets: markets.some(m => m.opportunityType === 'emerging')
        },
        // Pass strategy context for adaptive scoring
        strategyContext: {
          name: recommendedStrategy.name,
          criticalFactors: guidance.scoringGuidance?.criticalFactors,
          dealBreakers: guidance.scoringGuidance?.dealBreakers
        }
      };
    } else {
      // Fallback to original logic if no guidance
      console.log(`  ⚠️ No strategy guidance available, using default search criteria`);
      searchCriteria.minBedrooms = strategies.recommended === 'aggressive' ? 4 : 2;
      searchCriteria.propertyTypes = requirements.preferences.propertyTypes || ['single-family', 'multi-family'];
      searchCriteria.strategicFactors = {
        universities: markets.some(m => m.dataPointsOthersMiss?.includes('university')),
        publicTransport: true,
        emergingMarkets: markets.some(m => m.opportunityType === 'emerging')
      };
    }
    
    console.log(`  Using PropertyHunter to search ${searchCriteria.locations.length} markets...`);
    
    // Use PropertyHunter's existing search functionality
    const properties = await this.propertyHunter.searchProperties(searchCriteria);
    
    ctx.addTag('properties_found', properties.length);
    console.log(`  ✅ Found ${properties.length} properties`);
    
    return properties;
  }
  
  /**
   * Extract minimum bedrooms from strategy guidance
   */
  private extractMinBedrooms(searchGuidance: any): number {
    // Look for bedroom requirements in mustHave or use default
    const mustHave = searchGuidance.mustHave || [];
    for (const requirement of mustHave) {
      if (requirement.includes('bedroom')) {
        const match = requirement.match(/(\d+)\+?\s*bedroom/i);
        if (match) return parseInt(match[1]);
      }
    }
    return 2; // Default
  }
  
  /**
   * Analyze properties with MULTIPLE strategies
   */
  private async analyzePropertiesMultiStrategy(
    properties: EnrichedProperty[],
    requirements: UserRequirements,
    sessionId: string,
    ctx: SpanContext
  ): Promise<any[]> {
    
    console.log(`  🎯 Evaluating top ${Math.min(properties.length, 20)} properties against relevant strategies`);
    console.log(`  📊 Using parallel processing for efficiency...`);
    
    const allAnalyses = [];
    const propertiesToEvaluate = properties.slice(0, 20); // Evaluate top 20 properties
    const propertyBatchSize = 5; // Process 5 properties at a time
    
    // Process properties in parallel batches with timeout and self-healing
    const failedBatches: { batchNum: number; properties: any[]; error: string }[] = [];
    const BATCH_TIMEOUT_MS = 600000; // 10 minutes per batch for comprehensive analysis
    
    for (let i = 0; i < propertiesToEvaluate.length; i += propertyBatchSize) {
      const propertyBatch = propertiesToEvaluate.slice(i, i + propertyBatchSize);
      const batchNum = Math.floor(i/propertyBatchSize) + 1;
      const totalBatches = Math.ceil(propertiesToEvaluate.length/propertyBatchSize);
      
      console.log(`\n  📦 Processing property batch ${batchNum}/${totalBatches}`);
      
      try {
        // Add timeout to batch processing
        const batchPromise = Promise.allSettled(
          propertyBatch.map(async (property, idx) => {
            const propertyNum = i + idx + 1;
            console.log(`    🏠 [${propertyNum}/${propertiesToEvaluate.length}] ${property.address}`);
            
            try {
              // Add individual property timeout
              const analysisPromise = strategyEvaluator.evaluateProperty(
                property,
                requirements,
                sessionId,
                ctx
              );
              
              // Race between analysis and timeout
              const analysis = await Promise.race([
                analysisPromise,
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Property evaluation timeout')), 120000) // 2 minutes per property
                )
              ]);
              
              // Log best strategy for this property
              if (analysis.bestStrategy) {
                console.log(`      🏆 Best: ${analysis.bestStrategy.strategyName} (${analysis.bestStrategy.score}/100)`);
              }
              
              return analysis;
            } catch (error) {
              console.error(`      ⚠️ Failed to analyze: ${error.message}`);
              return null;
            }
          })
        );
        
        // Add batch timeout
        const batchAnalyses = await Promise.race([
          batchPromise,
          new Promise<any[]>((_, reject) => 
            setTimeout(() => reject(new Error(`Batch ${batchNum} timeout after ${BATCH_TIMEOUT_MS}ms`)), BATCH_TIMEOUT_MS)
          )
        ]);
        
        // Collect successful analyses
        let batchSuccessCount = 0;
        batchAnalyses.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value) {
            allAnalyses.push(result.value);
            batchSuccessCount++;
          } else if (result.status === 'rejected') {
            console.error(`      ❌ Analysis failed for property ${i + idx + 1}: ${result.reason?.message || result.reason}`);
          }
        });
        
        console.log(`  ✅ Batch ${batchNum} completed: ${batchSuccessCount}/${propertyBatch.length} successful`);
        
      } catch (batchError) {
        // Log batch failure but continue processing
        console.error(`  ⚠️ Batch ${batchNum} failed: ${batchError.message}`);
        console.error(`  📝 Logging ${propertyBatch.length} properties for retry queue`);
        
        failedBatches.push({
          batchNum,
          properties: propertyBatch,
          error: batchError.message
        });
        
        // Continue with next batch
        console.log(`  ➡️ Continuing with next batch...`);
      }
    }
    
    // Log failed batches for retry
    if (failedBatches.length > 0) {
      console.log(`\n  ⚠️ ${failedBatches.length} batches failed and logged for retry:`);
      failedBatches.forEach(fb => {
        console.log(`     - Batch ${fb.batchNum}: ${fb.properties.length} properties (${fb.error})`);
      });
      
      // TODO: Save to database for retry queue
      // await this.logFailedBatches(failedBatches);
    }
    
    // Summary statistics
    const totalEvaluations = allAnalyses.reduce((sum, a) => sum + a.evaluations.length, 0);
    const viableCount = allAnalyses.filter(a => a.viableStrategies.length > 0).length;
    
    console.log(`\n  📊 Analysis Summary:`);
    console.log(`     Total evaluations: ${totalEvaluations}`);
    console.log(`     Properties with viable strategies: ${viableCount}/${allAnalyses.length}`);
    console.log(`     Average strategies per property: ${(totalEvaluations / Math.max(allAnalyses.length, 1)).toFixed(1)}`);
    
    // Debug the structure being returned
    console.log(`  🔍 Sample analysis structure:`, {
      totalAnalyses: allAnalyses.length,
      firstAnalysis: allAnalyses[0] ? {
        hasProperty: !!allAnalyses[0].property,
        hasBestStrategy: !!allAnalyses[0].bestStrategy,
        bestStrategyName: allAnalyses[0].bestStrategy?.strategyName,
        bestStrategyScore: allAnalyses[0].bestStrategy?.score
      } : null
    });
    
    // Return analyses sorted by best score
    return allAnalyses
      .sort((a, b) => (b.bestStrategy?.score || 0) - (a.bestStrategy?.score || 0))
      .map(analysis => ({
        property: analysis.property,
        bestStrategy: analysis.bestStrategy,
        viableStrategies: analysis.viableStrategies,
        rejectedStrategies: analysis.rejectedStrategies,
        score: analysis.bestStrategy?.score || 0,
        confidence: analysis.bestStrategy?.confidence || 0,
        reasoning: analysis.bestStrategy?.acceptanceReasons || [],
        recommendation: analysis.bestStrategy?.strategyName || 'No viable strategy',
        financialProjection: analysis.bestStrategy?.financials
      }));
  }
  
  /**
   * Package investment recommendations
   */
  private async packageRecommendations(
    properties: EnrichedProperty[],
    analyses: any[], // Changed from PropertyInsight[] to any[] to handle multi-strategy format
    strategies: StrategyPackage,
    markets: MarketOpportunity[],
    requirements: UserRequirements,
    ctx: SpanContext
  ): Promise<InvestmentRecommendation[]> {
    
    const recommendations: InvestmentRecommendation[] = [];
    
    // Process all properties but limit detailed recommendations to top performers
    const maxDetailedRecommendations = 20; // Increased from 10 to 20
    console.log(`  📦 Creating detailed recommendations for top ${maxDetailedRecommendations} properties...`);
    
    for (let i = 0; i < Math.min(analyses.length, maxDetailedRecommendations); i++) {
      const analysis = analyses[i];
      
      // Debug what we're getting
      console.log(`  📊 Processing recommendation ${i+1}/${analyses.length}:`, {
        hasAnalysis: !!analysis,
        hasProperty: !!analysis?.property,
        hasBestStrategy: !!analysis?.bestStrategy,
        bestStrategyScore: analysis?.bestStrategy?.score,
        viableCount: analysis?.viableStrategies?.length || 0
      });
      
      // Skip if analysis is undefined (safety check)
      if (!analysis || !analysis.property || !analysis.bestStrategy) {
        console.warn(`  ⚠️ Skipping property ${i+1}: No analysis data or no viable strategy`);
        continue;
      }
      
      const property = analysis.property; // Get property from analysis
      const bestStrategy = analysis.bestStrategy; // Get best strategy from analysis
      const market = markets.find(m => m.location.includes(property.city || ''));
      
      // Use the best strategy from multi-strategy evaluation
      const strategy = {
        name: bestStrategy.strategyName,
        type: bestStrategy.strategyType,
        description: bestStrategy.acceptanceReasons?.join('. ') || 'Investment strategy',
        implementation: bestStrategy.assumptions || [],
        timeline: '12-24 months'
      };
      
      // Handle different strategy structures safely
      let implementationSteps: string[] = [];
      let timeline = '12-24 months';
      
      if (strategy?.implementation) {
        if (Array.isArray(strategy.implementation)) {
          // Old format: implementation is directly an array
          implementationSteps = strategy.implementation;
        } else if (strategy.implementation.steps) {
          // New format: implementation has steps and timeline
          implementationSteps = strategy.implementation.steps;
          timeline = strategy.implementation.timeline || timeline;
        }
      }
      
      // Use financials from the bestStrategy if available, otherwise calculate
      let financialAnalysis;
      
      if (bestStrategy.financials && bestStrategy.financials.monthlyExpenses > 0) {
        // Use pre-calculated financials from strategy evaluation
        console.log(`  💰 Using pre-calculated financials for ${property.address}:`, {
          income: bestStrategy.financials.monthlyIncome,
          expenses: bestStrategy.financials.monthlyExpenses,
          cashFlow: bestStrategy.financials.netCashFlow
        });
        
        // Calculate mortgage payment
        const downPayment = requirements.budget.cashAvailable * 0.25;
        const loanAmount = property.price - downPayment;
        const monthlyRate = 0.07 / 12;
        const numPayments = 360;
        const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                               (Math.pow(1 + monthlyRate, numPayments) - 1);
        
        financialAnalysis = {
          financing: {
            downPayment: downPayment,
            monthlyPayment: Math.round(monthlyPayment)
          },
          monthlyRent: bestStrategy.financials.monthlyIncome || 0,
          totalMonthlyExpenses: bestStrategy.financials.monthlyExpenses || Math.round(monthlyPayment * 1.5),
          cashFlow: {
            monthly: bestStrategy.financials.netCashFlow || 0
          },
          returns: {
            totalReturn: bestStrategy.financials.fiveYearROI ? bestStrategy.financials.fiveYearROI / 5 : 0
          },
          confidence: bestStrategy.confidence || 0.7,
          warnings: [],
          reasoning: bestStrategy.acceptanceReasons || []
        };
      } else {
        // Fallback: Calculate financials if not provided or expenses are zero
        console.log(`  💰 Calculating financials for ${property.address} (${i+1}/${analyses.length})...`);
        
        if (bestStrategy.financials && bestStrategy.financials.monthlyExpenses === 0) {
          console.warn(`  ⚠️ Strategy has zero expenses, recalculating...`);
        }
        
        const maxRetries = 3;
        let lastError;
        
        // Try up to 3 times with 1 minute timeout
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 1) {
              console.log(`  🔄 Retry attempt ${attempt}/${maxRetries} for ${property.address}...`);
            }
            
            // Add timeout to prevent hanging (60 seconds max per attempt)
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Financial calculation timeout after 60s')), 60000)
            );
            
            const calculationPromise = this.smartFinancialCalculator.analyzeProperty(
              property,
              {
                capital: requirements.budget.cashAvailable,
                goals: requirements.goals.primaryGoal,
                selfManaging: requirements.preferences.willingToManage,
                riskTolerance: requirements.preferences.riskTolerance
              }
            );
            
            financialAnalysis = await Promise.race([calculationPromise, timeoutPromise]);
            
            // If successful, break out of retry loop
            break;
            
          } catch (error) {
            lastError = error;
            
            if (attempt === maxRetries) {
              // Final attempt failed
              console.error(`  ❌ Failed to calculate financials for ${property.address} after ${maxRetries} attempts: ${lastError.message}`);
              console.log(`  ⏭️  Skipping property and continuing with next...`);
              // Mark as failed, will skip below
              financialAnalysis = null;
            } else {
              // Wait a bit before retrying (exponential backoff)
              const waitTime = attempt * 2000; // 2s, 4s, 6s
              console.log(`  ⏳ Waiting ${waitTime/1000}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
        
        // If we get here and financialAnalysis is undefined, skip this property
        if (!financialAnalysis) {
          console.error(`  ⚠️ No financial analysis available for ${property.address}, skipping...`);
          continue;
        }
      }
      
      recommendations.push({
        property,
        strategy: {
          name: strategy?.name || 'Investment Strategy',
          type: strategy?.type || 'conservative',
          description: strategy?.description || 'Strategic investment approach',
          implementation: implementationSteps,
          timeline: timeline
        },
        financials: {
          purchasePrice: property.price,
          downPayment: financialAnalysis.financing.downPayment,
          monthlyIncome: financialAnalysis.monthlyRent,
          monthlyExpenses: financialAnalysis.totalMonthlyExpenses + financialAnalysis.financing.monthlyPayment,
          netCashFlow: financialAnalysis.cashFlow.monthly,
          fiveYearROI: financialAnalysis.returns.totalReturn * 5, // 5-year projection
          breakEvenMonths: financialAnalysis.cashFlow.monthly > 0 
            ? Math.ceil(financialAnalysis.financing.downPayment / financialAnalysis.cashFlow.monthly)
            : 999 // High number if negative cash flow
        },
        marketContext: {
          location: property.location,
          whyNowIsGoodTime: market?.whyNowIsTheBestTime || 'Market conditions favorable',
          marketPhase: market?.marketTiming?.phase || 'growth',
          appreciation: market?.marketTiming?.exitStrategy || 'Hold for appreciation'
        },
        risks: [
          // Add rejection reasons as risks
          ...(bestStrategy.rejectionReasons || []).map(reason => ({
            type: 'strategy' as const,
            severity: 'medium' as const,
            mitigation: reason
          })),
          // Add financial warnings as risks
          ...(Array.isArray(financialAnalysis.warnings) ? 
            financialAnalysis.warnings.map(w => ({
              type: 'financial' as const,
              severity: 'medium' as const,
              mitigation: w
            })) : [])
        ],
        confidence: Math.min(bestStrategy.confidence || 0.5, financialAnalysis.confidence || 0.5),
        reasoning: [
          ...(bestStrategy.acceptanceReasons || []),
          ...(market?.dataPointsOthersMiss || []),
          ...(Array.isArray(financialAnalysis.reasoning) ? financialAnalysis.reasoning : [])
        ].filter(Boolean),
        agentInsights: {
          strategyMind: bestStrategy.strategyName + ': ' + (bestStrategy.acceptanceReasons?.join('. ') || ''),
          financialCalculator: Array.isArray(financialAnalysis.reasoning) ? 
            financialAnalysis.reasoning.join('. ') : 
            (financialAnalysis.reasoning || '')
        }
      });
    }
    
    // Sort by confidence and financial metrics
    recommendations.sort((a, b) => {
      // Primary sort by confidence
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
      
      // Secondary sort by cash flow
      const cashFlowDiff = b.financials.netCashFlow - a.financials.netCashFlow;
      if (Math.abs(cashFlowDiff) > 100) return cashFlowDiff;
      
      // Tertiary sort by ROI
      return b.financials.fiveYearROI - a.financials.fiveYearROI;
    });
    
    // Return all recommendations (up to 20)
    console.log(`  ✅ Successfully packaged ${recommendations.length} property recommendations`);
    
    return recommendations;
  }
  
  /**
   * Facilitate agent debate
   */
  private async facilitateDebate(
    recommendations: InvestmentRecommendation[],
    ctx: SpanContext
  ): Promise<InvestmentRecommendation[]> {
    
    // Return all recommendations (already sorted by packageRecommendations)
    // In future, implement full debate mechanism to further refine ranking
    console.log(`  🎯 Finalizing ${recommendations.length} recommendations for report`);
    return recommendations;
  }
  
  /**
   * Select best strategy for a property
   */
  private selectStrategy(
    property: EnrichedProperty,
    analysis: PropertyInsight,
    strategies: StrategyPackage
  ): any {
    // Validate strategies exist
    if (!strategies) {
      console.error('❌ No strategies available for property:', property.address);
      return this.getDefaultStrategy();
    }
    
    // Select based on AI recommendation or score
    const recommendation = analysis?.recommendation || analysis?.aiRecommendation;
    const score = analysis?.score || analysis?.confidence || 0;
    
    let selectedStrategy;
    if (recommendation === 'strong_buy' || score >= 85) {
      selectedStrategy = strategies.aggressive;
    } else if (recommendation === 'buy' || score >= 70) {
      selectedStrategy = strategies.innovative;
    } else {
      selectedStrategy = strategies.conservative;
    }
    
    // Fallback to any available strategy
    if (!selectedStrategy) {
      selectedStrategy = strategies.conservative || strategies.innovative || strategies.aggressive;
    }
    
    // Final fallback
    if (!selectedStrategy) {
      console.warn('⚠️ No strategy found, using default');
      return this.getDefaultStrategy();
    }
    
    return selectedStrategy;
  }
  
  /**
   * Get default strategy when none available
   */
  private getDefaultStrategy(): any {
    return {
      name: 'Traditional Investment',
      type: 'conservative',
      description: 'Standard buy and hold rental strategy',
      implementation: {
        steps: [
          'Research property values',
          'Secure financing',
          'Purchase property',
          'Find tenants',
          'Manage property'
        ],
        timeline: '6-12 months'
      },
      financials: {
        monthlyIncome: 0,
        monthlyExpenses: 0,
        netCashFlow: 0,
        roi: 0,
        breakEvenMonths: 0
      },
      confidence: 0.5
    };
  }
  
  /**
   * Extract market trends
   */
  private extractMarketTrends(markets: MarketOpportunity[]): string[] {
    const trends: string[] = [];
    
    for (const market of markets.slice(0, 3)) {
      if (market.hiddenCatalysts.length > 0) {
        trends.push(market.hiddenCatalysts[0].description);
      }
    }
    
    return trends;
  }
  
  /**
   * Determine market timing
   */
  private determineMarketTiming(markets: MarketOpportunity[]): string {
    const avgMonths = markets
      .slice(0, 3)
      .reduce((sum, m) => sum + (m.marketTiming?.monthsUntilPeakOpportunity || 12), 0) / 3;
    
    if (avgMonths < 6) return 'Act quickly - window closing';
    if (avgMonths < 12) return 'Good timing - moderate urgency';
    return 'Plenty of time - be selective';
  }
  
  /**
   * Get researched topics
   */
  private async getResearchedTopics(): Promise<string[]> {
    // This would query the fact store for recently researched topics
    return ['ADU regulations', 'Market prices', 'Rental rates', 'Demographics'];
  }
  
  /**
   * Create empty response
   */
  private createEmptyResponse(
    query: string,
    requirements: UserRequirements
  ): AdvisorResponse {
    return {
      success: false,
      query,
      interpretedRequirements: requirements,
      recommendations: [],
      marketOverview: {
        bestMarkets: [],
        marketTrends: [],
        timing: 'No suitable opportunities found'
      }
    };
  }
}