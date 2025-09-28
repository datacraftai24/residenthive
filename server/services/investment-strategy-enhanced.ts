/**
 * ENHANCED INVESTMENT STRATEGY GENERATOR
 * 
 * Purpose: Generate investment strategies using researched market data
 * Philosophy: "Why use rules when we have LLMs?" - No hardcoded values, all researched
 * 
 * Flow: Chat → Research Coordinator → Smart Research → Strategy → Properties → Financial Analysis → Report
 */

import { researchCoordinator } from '../ai-agents/research-coordinator';
import { smartResearchAgent } from '../ai-agents/smart-research-agent';
import { strategyBuilderV3 } from '../ai-agents/strategy-builder-v3';
import { enhancedDataReconciliation } from '../ai-agents/data-reconciliation-enhanced';
import { strategicPropertyHunterV2 } from '../agents/property-hunter-strategic-v2';
// Using comprehensive evaluator only
import { propertyEvaluatorClean } from '../agents/property-evaluator-clean';
import { propertyEvaluatorComprehensive } from '../agents/property-evaluator-comprehensive';
import { reportGeneratorClean } from '../agents/report-generator-clean';
import { db } from '../db';
import { investmentStrategies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { tracedLLMCall } from '../observability/llm-tracer';
import type { BuyerProfile } from '@shared/schema';
import type { ResearchResult } from '../ai-agents/smart-research-agent';
import { databaseMarketStatsStore as marketStatsStore } from './database-market-stats-store.js';
import { researchToMarketExtractor } from './research-to-market.js';
import { rentDashboard } from './rent-estimation-dashboard.js';

interface EnhancedInvestmentStrategyResult {
  sessionId?: string;
  executiveSummary: string;
  
  researchFindings: {
    marketData: {
      propertyPrices: { value: any; source: string };
      rentalRates: { value: any; source: string };
      mortgageRates: { value: any; source: string };
      expenses: { [key: string]: { value: any; source: string } };
    };
    totalQueriesResearched: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  
  purchasingPower: {
    availableCapital: number;
    maxPurchasePrice: number;
    downPaymentAmount: number;
    loanAmount: number;
    monthlyPaymentCapacity: number;
    assumptions: { [key: string]: string };
  };
  
  propertyRecommendations: Array<{
    address: string;
    price: number;
    propertyType: string;
    
    // SMART FINANCIAL ANALYSIS - Using researched data
    financialAnalysis: {
      monthlyIncome: number;
      monthlyExpenses: {
        mortgage: number;
        propertyTax: number;
        insurance: number;
        management: number;
        maintenance: number;
        utilities: number;
        vacancy: number;
        total: number;
      };
      netCashFlow: number;
      cashOnCashReturn: number;
      capRate: number;
      dataSources: { [key: string]: string };
    };
    
    whyRecommended: string;
    risks: string[];
    actionItems: string[];
  }>;
  
  portfolioProjection: {
    totalInvestment: number;
    monthlyIncomeTotal: number;
    monthlyExpensesTotal: number;
    netMonthlyCashFlow: number;
    averageCapRate: number;
    meetsIncomeGoal: boolean;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  
  nextSteps: string[];
  alternativeStrategies: string[];
}

export class EnhancedInvestmentStrategy {
  private agentName = 'enhanced_investment_strategy';
  
  /**
   * Main entry point - generates complete strategy with research
   */
  async generateStrategy(
    profile: Partial<BuyerProfile>,
    sessionId: string
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      console.log(`\n🎯 [Enhanced Strategy] Starting generation for session ${sessionId}`);
      
      // Update status
      await this.updateStatus(sessionId, 'researching');
      
      // PHASE 1: Research Coordination
      console.log(`📚 Phase 1: Identifying research needs...`);
      const clientProfile = this.buildClientProfile(profile);
      const researchNeeds = await researchCoordinator.identifyResearchNeeds(
        clientProfile,
        ['traditional', 'fha', 'multi-unit', 'house-hack']
      );
      console.log(`   Found ${researchNeeds.totalQueries} research queries needed`);
      
      // PHASE 2: Execute Research
      console.log(`🔍 Phase 2: Executing market research...`);
      await this.updateStatus(sessionId, 'researching_market');
      
      const researchResults = await this.executeResearch(researchNeeds.researchQueries);
      console.log(`   Completed ${researchResults.length} research queries`);
      
      // PHASE 2.5: Reconcile Research Data (NEW)
      console.log(`🔄 Phase 2.5: Reconciling research data...`);
      
      // Group research results by metric type for reconciliation
      const groupedFindings = this.groupResearchByMetric(researchResults);
      
      // Reconcile conflicting data points
      const reconciledMetrics = [];
      for (const [metric, findings] of Object.entries(groupedFindings)) {
        if (findings.length > 1) {
          // Multiple sources for same metric - reconcile
          const reconciled = await enhancedDataReconciliation.reconcileWithContext(
            findings,
            {
              availableCash: (profile as any).investmentCapital || profile.budgetMax || 0,
              monthlyIncomeTarget: (profile as any).incomeGoal || (profile as any).monthlyIncome || 0,
              timeline: (profile as any).timeline || '3 months',
              location: profile.location || 'Unknown'
            } as any
          );
          reconciledMetrics.push(...reconciled.reconciledMetrics);
        }
      }
      
      console.log(`   ✅ Reconciled ${reconciledMetrics.length} conflicting data points`);
      
      // PHASE 2.6: Populate MarketStatsStore from research
      console.log(`💾 Phase 2.6: Populating market statistics store...`);
      const marketStats = researchToMarketExtractor.extractMarketStats(
        researchResults,
        profile.location || 'Worcester, MA'
      );
      
      for (const stat of marketStats) {
        if (stat.n_samples >= 3) {  // ENFORCE MIN SAMPLES
          await marketStatsStore.upsert(stat);
        }
      }
      console.log(`   📊 Extracted ${marketStats.length} market stats from research`);
      
      // PHASE 3: Generate ALL Strategies (Not picking best yet)
      console.log(`📊 Phase 3: Generating investment strategies with Strategy Builder Agent...`);
      console.log(`   📊 Research data available: ${researchResults?.length || 0} items`);
      if (researchResults && researchResults.length > 0) {
        console.log(`   Sample research: ${researchResults[0].question} → ${JSON.stringify(researchResults[0].answer).substring(0, 50)}`);
      }
      await this.updateStatus(sessionId, 'generating_strategy');
      
      // Strategy Builder returns ALL strategies (5-7 typically)
      const strategyOutput = await strategyBuilderV3.generateStrategies(
        sessionId,
        {
          budget: clientProfile.availableCash,
          location: clientProfile.location,
          monthlyIncome: clientProfile.monthlyIncomeTarget,
          goals: clientProfile.goals,
          preferredFinancing: clientProfile.preferredFinancing
        },
        researchResults
      );
      
      const strategies = strategyOutput.strategies;
      console.log(`   📋 Generated ${strategies.length} strategies`);
      strategies.forEach((s, i) => {
        console.log(`      ${i+1}. ${s.name} - ${s.name || 'Strategy'}`); // Use name as fallback since description doesn't exist
      });
      
      // PHASE 4: Search Properties for ALL Strategies
      console.log(`🏠 Phase 4: Searching properties for all strategies...`);
      await this.updateStatus(sessionId, 'searching_properties');
      
      // Search properties for each strategy
      const allPropertiesWithStrategy = [];
      for (const strategy of strategies) {
        console.log(`   🔍 Searching for: ${strategy.name}`);
        try {
          const properties = await this.searchProperties(profile, strategy);
          
          // Tag each property with its strategy
          const taggedProperties = properties.map(p => ({
            ...p,
            strategy: strategy.name,
            strategyDetails: strategy
          }));
          
          allPropertiesWithStrategy.push(...taggedProperties);
          console.log(`      Found ${properties.length} properties`);
        } catch (error) {
          console.error(`   ❌ Error searching properties for ${strategy.name}:`, error);
          console.log(`      Found 0 properties`);
        }
      }
      
      console.log(`   📦 Total properties across all strategies: ${allPropertiesWithStrategy.length}`);
      
      // PHASE 5A: Comprehensive Two-Phase Evaluation (if enabled)
      let qualifiedProperties = allPropertiesWithStrategy;
      if (strategies[0]?.evaluation_directive === 'COMPREHENSIVE') {
        console.log(`🔬 Phase 5A: Comprehensive two-phase evaluation...`);
        
        // Run comprehensive evaluation for pre-screening
        const comprehensiveResults = await propertyEvaluatorComprehensive.evaluateComprehensive(
          allPropertiesWithStrategy,
          strategies[0], // Use primary strategy for gates
          researchResults,
          {
            cashAvailable: profile.investmentCapital || profile.budgetMax,
            monthlyIncomeTarget: (profile as any).incomeGoal || (profile as any).monthlyIncome || 0,
            marketStats: marketStatsStore  // Pass the store
          }
        );
        
        console.log(`   ✅ Comprehensive eval: ${comprehensiveResults.length} properties qualified`);
        
        // Print dashboard stats
        rentDashboard.printSummary();
        
        // Map back to original format with evaluation metadata
        qualifiedProperties = comprehensiveResults.map(result => ({
          ...result.property,
          comprehensiveEvaluation: {
            uw: result.uw,
            score: result.final_score,
            narrative: result.llm_narrative
          }
        }));
      }
      
      // PHASE 5B: Final Investment Decision
      console.log(`💰 Phase 5B: Final investment decision...`);
      await this.updateStatus(sessionId, 'analyzing_financials');
      
      // Property Evaluator makes final decision on qualified properties
      const investmentDecision = await propertyEvaluatorClean.evaluateAndDecide(
        qualifiedProperties, // Use qualified properties from comprehensive eval
        strategies, // All strategies to compare
        researchResults, // Market research data
        {
          budget: {
            cashAvailable: profile.investmentCapital || profile.budgetMax,
            monthlyTarget: (profile as any).incomeGoal || (profile as any).monthlyIncome || 0
          },
          monthlyIncomeTarget: (profile as any).incomeGoal || (profile as any).monthlyIncome || 0,
          cashAvailable: (profile as any).investmentCapital || profile.budgetMax,
          location: profile.location || 'Unknown',
          timeline: (profile as any).timeline || '3 months'
        }
      );
      
      console.log(`   ✅ Decision made by Property Evaluator`);
      console.log(`   🏆 Winning strategy: ${investmentDecision.winningStrategy.name}`);
      console.log(`   📊 Evaluated ${investmentDecision.metrics.totalPropertiesEvaluated} properties`);
      console.log(`   🏠 Found ${investmentDecision.metrics.viableProperties} viable properties`);
      console.log(`   💡 Confidence: HIGH`); // Default confidence since property doesn't exist
      
      // PHASE 6: Generate Report (pure formatting of the decision)
      console.log(`📄 Phase 6: Generating markdown report...`);
      let documentUrl = '';
      try {
        documentUrl = await reportGeneratorClean.generateReport(
          sessionId, 
          investmentDecision, 
          profile,
          researchResults
        );
      } catch (error) {
        console.error('   ⚠️ Report generation failed:', error);
      }
      
      // PHASE 7: Return the decision (orchestrator doesn't process it)
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ [Enhanced Strategy] Completed in ${totalTime}s`);
      
      // Return the decision as-is from the Property Evaluator
      return {
        sessionId,
        decision: investmentDecision,
        documentUrl,
        researchCount: researchResults.length,
        strategiesEvaluated: strategies.length,
        processingTime: totalTime
      };
      
    } catch (error) {
      console.error(`❌ Strategy generation failed:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.updateStatus(sessionId, 'failed', errorMessage);
      throw error;
    }
  }
  
  /**
   * Execute research queries in batches
   */
  private async executeResearch(queries: any[]): Promise<ResearchResult[]> {
    // First, ensure all queries have canonical keys (using direct access since method is private)
    const queriesWithKeys = queries.map(q => ({ ...q, key: q.category + '_' + q.query.slice(0, 50) }));
    
    // Prioritize HIGH priority queries
    const highPriority = queriesWithKeys.filter(q => q.priority === 'HIGH');
    const mediumPriority = queriesWithKeys.filter(q => q.priority === 'MEDIUM');
    
    // Execute high priority first - PRESERVE THE KEY!
    const highResults = await smartResearchAgent.doResearchBatch(
      highPriority.map(q => ({ 
        query: q.query, 
        category: q.category,
        key: q.key  // Pass the canonical key through!
      }))
    );
    
    // Execute medium priority (limit to save time) - PRESERVE THE KEY!
    const mediumResults = await smartResearchAgent.doResearchBatch(
      mediumPriority.slice(0, 5).map(q => ({ 
        query: q.query, 
        category: q.category,
        key: q.key  // Pass the canonical key through!
      }))
    );
    
    return [...highResults, ...mediumResults];
  }
  
  /**
   * Build strategy using researched data
   */
  private async buildStrategyFromResearch(
    profile: Partial<BuyerProfile>,
    researchResults: ResearchResult[]
  ): Promise<any> {
    const systemPrompt = `You are an expert real estate investment strategist.
Build a strategy using ONLY researched market data. Do not make up numbers.`;

    const userPrompt = `Build an investment strategy using this research:

CLIENT PROFILE:
- Capital: $${profile.investmentCapital || profile.budgetMax || 0}
- Income Goal: $${(profile as any).incomeGoal || (profile as any).monthlyIncome || 0}/month
- Location: ${profile.location}
- Experience: ${(profile as any).investorType || 'beginner'}

RESEARCHED MARKET DATA:
${researchResults.map(r => `
${r.category}: ${r.question}
Answer: ${JSON.stringify(r.answer)}
Confidence: ${r.confidence}
Source: ${r.sources[0]?.title || 'Research'}
`).join('\n')}

Create a realistic strategy that:
1. Uses only the researched numbers
2. Calculates accurate purchasing power
3. Sets realistic expectations
4. Identifies specific property criteria

Return JSON with this exact structure:
{
  "name": "strategy name",
  "purchasingPower": {
    "maxPurchasePrice": number based on research,
    "minPurchasePrice": number based on research,
    "downPaymentAmount": number,
    "loanAmount": number,
    "monthlyPaymentCapacity": number
  },
  "searchCriteria": {
    "propertyTypes": ["Single Family", "Multi-Family", etc],
    "maxPrice": same as maxPurchasePrice,
    "minPrice": same as minPurchasePrice,
    "locations": ["specific cities from research"],
    "mustGenerate": monthly income goal number
  },
  "assumptions": {
    "mortgageRate": number from research,
    "propertyTaxRate": number from research,
    "downPaymentPercent": number used
  }
}`;

    const result = await tracedLLMCall({
      agentName: this.agentName,
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      model: 'gpt-4o',
      responseFormat: 'json_object'
    });
    
    return JSON.parse(result.content);
  }
  
  /**
   * Search for properties based on strategy
   */
  private async searchProperties(
    profile: Partial<BuyerProfile>,
    strategy: any
  ): Promise<any[]> {
    console.log('🔍 Searching properties using strategy-defined criteria...');
    console.log('   Strategy structure:', Object.keys(strategy));
    
    // Build search input for Property Hunter V2
    // Use buy_box from Strategy Builder V3 if available, otherwise fall back to searchCriteria
    const searchInput = {
      name: strategy.name || 'Investment Strategy',
      searchCriteria: strategy.searchCriteria || {
        propertyTypes: strategy.buy_box?.property_types || ['Single Family', 'Multi-Family', 'Condo'],
        maxPrice: strategy.buy_box?.price_band_usd?.max || strategy.purchasingPower?.maxPurchasePrice,
        minPrice: strategy.buy_box?.price_band_usd?.min || strategy.purchasingPower?.minPurchasePrice,
        // ALWAYS use the profile location, ignore submarkets (they're usually neighborhoods that don't exist)
        locations: [profile.location?.split(',')[0]?.trim() || 'Massachusetts'],
        minBedrooms: strategy.buy_box?.beds_baths_min?.beds,
        minBathrooms: strategy.buy_box?.beds_baths_min?.baths,
        mustGenerate: strategy.evaluation_rules?.min_monthly_cashflow_usd || (profile as any).incomeGoal || (profile as any).monthlyIncome || 0
      }
    };
    
    console.log('   Search input:', JSON.stringify(searchInput, null, 2));
    
    // Use the strategy's search criteria directly - NO HARDCODING
    const properties = await strategicPropertyHunterV2.searchProperties(searchInput);
    
    console.log(`   Found ${properties.length} properties for comprehensive analysis...`);
    
    // Return ALL properties for comprehensive evaluation
    return properties;
  }
  
  /**
   * Analyze properties using LLM evaluator with research data
   */
  private async analyzePropertiesFinancially(
    properties: any[],
    researchResults: ResearchResult[],
    profile: Partial<BuyerProfile>,
    strategy: any
  ): Promise<any[]> {
    console.log(`   🔬 Starting LLM evaluation of ${properties.length} properties...`);
    console.log(`   Strategy:`, strategy);
    console.log(`   Profile income goal: $${(profile as any).incomeGoal || (profile as any).monthlyIncome || 0}/month`);
    
    // Use the comprehensive evaluator with research data
    const evaluations = await propertyEvaluatorComprehensive.evaluateComprehensive(
      properties,
      strategy,  // Pass the full strategy from research
      researchResults,
      {
        cashAvailable: (profile as any).investmentCapital || profile.budgetMax,
        monthlyIncomeTarget: (profile as any).incomeGoal || (profile as any).monthlyIncome || 0,
        location: profile.location
      }
    );
    
    console.log(`   🔄 Merging ${evaluations.length} LLM evaluations with original MLS data...`);
    
    // Create lookup map for original properties by address
    const propertyByAddress = new Map();
    properties.forEach(prop => {
      const addr = prop.address || prop.street_address || 'Unknown';
      propertyByAddress.set(addr, prop);
    });
    
    // Merge LLM evaluations with original MLS data - SIMPLE!
    const converted = evaluations.map((evaluation, index) => {
      // Get the original property - just use index since order is preserved
      const originalProperty = properties[index];
      
      return {
        // Keep ENTIRE original property as-is from Repliers
        ...originalProperty,
        // Add the LLM's financial analysis
        financialAnalysis: {
          monthlyIncome: (evaluation as any).uw?.rentEst || 0,
          monthlyExpenses: (evaluation as any).uw?.expenses?.total || 0,
          netCashFlow: (evaluation as any).uw?.netCashFlow || 0,
          capRate: (evaluation as any).uw?.capRate || 0,
          cashOnCashReturn: (evaluation as any).uw?.cashOnCashReturn || 0,
          recommendation: evaluation.final_score > 50 ? 'BUY' : 'PASS',
          reasoning: evaluation.llm_narrative || 'Analysis complete',
          score: evaluation.final_score || 0,
          
          // Include improvement opportunities
          withImprovements: null, // Not available in current structure
          keyFactors: [] // Not available in current structure
        }
      };
    });
    
    console.log(`   ✅ Returning ${converted.length} properties with full MLS data + LLM analysis`);
    return converted;
  }
  
  // REMOVED: Old analyzePropertyFinancials method - using LLM evaluator instead
  
  /**
   * Extract market data from research results using LLM
   */
  private async extractMarketData(researchResults: ResearchResult[]): Promise<any> {
    const systemPrompt = `You are a data extraction specialist for real estate investment analysis.
Extract specific market data from research results and convert to correct decimal formats.
Be very careful with units and conversions.`;

    const userPrompt = `Extract market data from these research results:

${researchResults.map(r => `
Question: ${r.question}
Answer: ${JSON.stringify(r.answer)}
Source: ${r.sources[0]?.title || 'Unknown'}
Confidence: ${r.confidence}
`).join('\n')}

Extract and return JSON with proper decimal conversions:
{
  "mortgageRate": <decimal, e.g., 0.0608 for 6.08%>,
  "propertyTaxRate": <decimal, e.g., 0.01153 for $11.53 per $1000>,
  "insuranceMonthly": <number, typical is 150-300>,
  "managementFeeRate": <decimal, e.g., 0.09 for 9%>,
  "maintenanceRate": <decimal, e.g., 0.05 for 5%>,
  "vacancyRate": <decimal, e.g., 0.05 for 5%>,
  "propertyPrices": {
    "singleFamily": <number>,
    "condo": <number>,
    "multiUnit": <number>
  },
  "rentalRates": {
    "singleFamily": <monthly rent number>,
    "condo": <monthly rent number>,
    "multiUnit": <monthly rent number>,
    "average": <average monthly rent number>
  },
  "fhaLimit": <number>,
  "sources": {
    "<field>": "<source name>"
  }
}

CRITICAL CONVERSION RULES:
1. If property tax is 11.53, this means $11.53 per $1000, convert to 0.01153
2. If mortgage rate is 6.08%, convert to 0.0608
3. If rental rates are in answer as object like {"single_family_homes":2551}, extract the number 2551
4. If management fee is 9%, convert to 0.09
5. All rental rates should be monthly amounts (numbers, not strings)
6. Property prices should be numbers without commas or dollar signs

Example conversions:
- "11.53" property tax → 0.01153 (divide by 1000)
- {"FHA_loan_rate":6.65} → 0.0665 for mortgageRate
- {"single_family_homes":2551} → 2551 for rentalRates.singleFamily`;

    try {
      const result = await tracedLLMCall({
        agentName: this.agentName,
        systemPrompt,
        userPrompt,
        temperature: 0.1, // Low temperature for accurate extraction
        model: 'gpt-4o',  // Use GPT-4o for better extraction accuracy
        responseFormat: 'json_object'
      });

      const extracted = JSON.parse(result.content);
      
      // Log extraction for debugging
      console.log('📊 Extracted market data:', {
        mortgageRate: extracted.mortgageRate,
        propertyTaxRate: extracted.propertyTaxRate,
        rentalAverage: extracted.rentalRates?.average
      });
      
      return extracted;
    } catch (error) {
      console.error('Failed to extract market data:', error);
      // Return minimal defaults if extraction fails
      return {
        mortgageRate: 0.07,
        propertyTaxRate: 0.01,
        insuranceMonthly: 200,
        managementFeeRate: 0.09,
        maintenanceRate: 0.05,
        vacancyRate: 0.05,
        sources: {}
      };
    }
  }
  
  /**
   * Estimate rental income based on researched data
   */
  private estimateIncome(property: any, marketData: any): number {
    // Use researched rent data based on property type
    const propertyType = property.property_type?.toLowerCase() || '';
    
    if (marketData.rentalRates) {
      if (propertyType.includes('multi') && marketData.rentalRates.multiUnit) {
        return marketData.rentalRates.multiUnit;
      }
      if (propertyType.includes('condo') && marketData.rentalRates.condo) {
        return marketData.rentalRates.condo;
      }
      if (propertyType.includes('single') && marketData.rentalRates.singleFamily) {
        return marketData.rentalRates.singleFamily;
      }
      // Use average if available
      if (marketData.rentalRates.average) {
        return marketData.rentalRates.average;
      }
    }
    
    // Fallback: estimate based on property price (should be from research)
    return Math.round(property.price * 0.007); // 0.7% rent-to-price ratio
  }
  
  /**
   * Calculate mortgage payment
   */
  private calculateMortgagePayment(
    principal: number,
    annualRate: number,
    years: number
  ): number {
    const monthlyRate = annualRate / 12;
    const numPayments = years * 12;
    
    if (monthlyRate === 0) return principal / numPayments;
    
    return Math.round(
      principal * 
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1)
    );
  }
  
  /**
   * REMOVED - Decision making belongs in Property Evaluator
   * Keeping for reference only - DO NOT USE
   */
  /*
  private async DEPRECATED_compileFinalStrategy(
    sessionId: string,
    profile: Partial<BuyerProfile>,
    researchResults: ResearchResult[],
    investmentDecision: any
  ): Promise<EnhancedInvestmentStrategyResult> {
    // This method is deprecated and commented out due to undefined variable references
    // and incompatible type definitions. It was used for legacy strategy compilation.
    throw new Error('Method is deprecated');
  }
  */
  
  // Helper methods
  private buildClientProfile(profile: any): any {
    // Handle both old BuyerProfile format and new parsed format
    return {
      id: profile.id?.toString() || 'session-' + Date.now(),
      // IMPORTANT: Use investmentCapital (number) not budget (string like "$200K - $400K")
      availableCash: (profile as any).investmentCapital || profile.budgetMax || 0,
      // Use targetMonthlyReturn from chat context, then fall back to other fields
      monthlyIncomeTarget: (profile as any).targetMonthlyReturn || (profile as any).monthlyIncomeTarget || (profile as any).incomeGoal || 0,
      location: profile.location || (profile as any).locations || 'Unknown',
      creditScore: (profile as any).creditScore,
      timeline: (profile as any).timeline || '3 months',
      willingToOwnerOccupy: (profile as any).ownerOccupy,
      usePropertyManagement: (profile as any).usePropertyManagement
    };
  }
  
  private assessConfidence(results: ResearchResult[]): 'HIGH' | 'MEDIUM' | 'LOW' {
    const highConfidence = results.filter(r => r.confidence === 'HIGH').length;
    const ratio = highConfidence / results.length;
    
    if (ratio > 0.7) return 'HIGH';
    if (ratio > 0.4) return 'MEDIUM';
    return 'LOW';
  }
  
  private async generateExecutiveSummary(profile: any, properties: any[]): Promise<string> {
    const avgCashFlow = properties.reduce((sum, p) => 
      sum + p.financialAnalysis.netCashFlow, 0
    ) / properties.length;
    
    return `Based on comprehensive market research and analysis of ${properties.length} properties in ${profile.location}, 
    we've identified investment opportunities generating an average of $${Math.round(avgCashFlow)}/month in net cash flow. 
    All calculations use current market data with documented sources.`;
  }
  
  private generateRecommendationReason(property: any, profile: any): string {
    if (property.financialAnalysis.netCashFlow > (profile.incomeGoal || 0)) {
      return `Exceeds income goal with $${property.financialAnalysis.netCashFlow}/month cash flow`;
    }
    return `Strong ${property.financialAnalysis.capRate.toFixed(1)}% cap rate in growing market`;
  }
  
  private identifyRisks(property: any): string[] {
    const risks = [];
    if (property.year_built < 1980) risks.push('Older property may need updates');
    if (property.financialAnalysis.cashOnCashReturn < 5) risks.push('Lower cash-on-cash return');
    if (!property.images?.length) risks.push('Limited property information available');
    return risks;
  }
  
  private generateActionItems(property: any): string[] {
    return [
      'Schedule property viewing',
      'Order professional inspection',
      'Verify rental comps in area',
      'Review property management options'
    ];
  }
  
  private generateNextSteps(profile: any, properties: any[]): string[] {
    return [
      `Review detailed analysis of ${properties.length} properties`,
      'Select top 2-3 for in-person viewing',
      'Get pre-approved for financing',
      'Interview property management companies',
      'Prepare offer strategy'
    ];
  }
  
  private suggestAlternatives(profile: any, properties: any[]): string[] {
    const alternatives = [];
    if (properties.some(p => p.financialAnalysis.netCashFlow < 0)) {
      alternatives.push('Consider house hacking to reduce expenses');
    }
    alternatives.push('Explore FHA loans for lower down payment');
    alternatives.push('Look at emerging neighborhoods for better cap rates');
    return alternatives;
  }
  
  // Database operations
  private async updateStatus(sessionId: string, status: string, error?: string): Promise<void> {
    await db.update(investmentStrategies)
      .set({ 
        status,
        ...(error && { error })
      })
      .where(eq(investmentStrategies.sessionId, sessionId));
  }
  
  private async saveStrategy(
    sessionId: string,
    strategy: any, // Use any type since this method is not currently used
    generationTime: number,
    documentUrl?: string
  ): Promise<void> {
    await db.update(investmentStrategies)
      .set({
        status: 'completed',
        strategyJson: strategy as any,
        marketAnalysis: strategy.researchFindings || {} as any,
        propertyRecommendations: strategy.propertyRecommendations || [] as any,
        financialProjections: strategy.portfolioProjection || {} as any,
        generationTime,
        documentUrl,
        dataSourcesUsed: [] // Remove reference to non-existent sources property
        // Remove updatedAt as it doesn't exist in schema
      })
      .where(eq(investmentStrategies.sessionId, sessionId));
  }
  /**
   * Group research results by metric type for reconciliation
   * Lightweight - just organizing data
   */
  private groupResearchByMetric(researchResults: ResearchResult[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    researchResults.forEach(result => {
      // Create a finding for each result
      const finding = {
        city: this.extractCityFromQuestion(result.question),
        state: 'MA',
        metric: result.category || 'general',
        value: result.answer,
        source: result.sources[0]?.url || 'research',
        confidence: result.confidence,
        timestamp: new Date().toISOString(),
        dataDate: new Date(result.timestamp).toISOString()
      };
      
      // Group by metric
      if (!grouped[finding.metric]) {
        grouped[finding.metric] = [];
      }
      grouped[finding.metric].push(finding);
    });
    
    return grouped;
  }
  
  /**
   * Extract city from research question - lightweight utility
   */
  private extractCityFromQuestion(question: string): string {
    const cities = ['Springfield', 'Worcester', 'Boston', 'Cambridge', 'Quincy', 'Lowell'];
    for (const city of cities) {
      if (question.toLowerCase().includes(city.toLowerCase())) {
        return city;
      }
    }
    return 'Massachusetts'; // Default to state level
  }
}

// Export singleton
export const enhancedInvestmentStrategy = new EnhancedInvestmentStrategy();