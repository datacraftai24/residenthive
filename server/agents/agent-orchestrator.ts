/**
 * Agent Orchestrator
 * Role: Multi-Agent Coordination and Communication Hub
 * Responsibility: Coordinate all agents and manage comprehensive analysis workflow
 */

import { StrategyBuilderAgent, InvestmentProfile } from './strategy-builder.js';
import { MarketResearchAgent, MarketAnalysis } from './market-researcher.js';
import { PropertyHunterAgent, PropertySearchCriteria, EnrichedProperty } from './property-hunter.js';
import { FinancialCalculatorAgent, PropertyFinancials } from './financial-calculator.js';
import { RealEstateAdvisorAgent, PropertyEnhancementAnalysis } from './real-estate-advisor.js';
import { DealPackagerAgent, InvestmentReport } from './deal-packager.js';
import { withSpan } from '../observability/withSpan.js';

export interface ComprehensiveAnalysisRequest {
  userInput: string;
  priorityLevel: 'speed' | 'comprehensive' | 'detailed';
  agentInsights?: string[];
}

export interface AnalysisResult {
  strategyId: string;
  investmentProfile: InvestmentProfile;
  marketAnalyses: MarketAnalysis[];
  enhancedProperties: (EnrichedProperty & { 
    financialAnalysis: PropertyFinancials;
    enhancementAnalysis: PropertyEnhancementAnalysis;
  })[];
  investmentReport: InvestmentReport;
  reportFilePath: string;
}

export class AgentOrchestrator {
  private strategyBuilder: StrategyBuilderAgent;
  private marketResearcher: MarketResearchAgent;
  private propertyHunter: PropertyHunterAgent;
  private financialCalculator: FinancialCalculatorAgent;
  private realEstateAdvisor: RealEstateAdvisorAgent;
  private dealPackager: DealPackagerAgent;

  constructor() {
    this.strategyBuilder = new StrategyBuilderAgent();
    this.marketResearcher = new MarketResearchAgent();
    this.propertyHunter = new PropertyHunterAgent();
    this.financialCalculator = new FinancialCalculatorAgent();
    this.realEstateAdvisor = new RealEstateAdvisorAgent();
    this.dealPackager = new DealPackagerAgent();
  }

  executeComprehensiveAnalysis = withSpan(
    'ai_orchestra',
    async (request: ComprehensiveAnalysisRequest): Promise<AnalysisResult> => {
    const strategyId = this.generateStrategyId();
    console.log(`🎯 [Orchestrator] Starting comprehensive analysis: ${strategyId}`);

    try {
      // Phase 1: Strategy Building with Agent Insights
      console.log(`📋 [Orchestrator] Phase 1: Investment Strategy Development`);
      const investmentProfile = await this.strategyBuilder.analyzeInvestorRequirements(
        request.userInput, 
        request.agentInsights
      );

      // Phase 2: Market Research (Parallel)
      console.log(`📊 [Orchestrator] Phase 2: Market Intelligence Gathering`);
      const marketAnalyses = await this.marketResearcher.conductMarketResearch(
        investmentProfile.locations,
        investmentProfile.strategicFactors
      );

      // Phase 3: Property Discovery with Strategic Factors
      console.log(`🏠 [Orchestrator] Phase 3: Property Discovery & Enrichment`);
      
      // Expand geographic search for better property discovery
      const expandedLocations = await this.propertyHunter.expandGeographicSearch({
        locations: investmentProfile.locations,
        maxPrice: investmentProfile.capital * 4,
        minBedrooms: investmentProfile.preferences.multiFamily ? 3 : 2,
        propertyTypes: investmentProfile.propertyTypes,
        strategicFactors: investmentProfile.strategicFactors
      });

      console.log(`🗺️ [Orchestrator] Expanded search to ${expandedLocations.length} locations: ${expandedLocations.join(', ')}`);

      const searchCriteria: PropertySearchCriteria = {
        locations: expandedLocations,
        maxPrice: investmentProfile.capital * 4, // 4x leverage ratio
        minBedrooms: investmentProfile.preferences.multiFamily ? 3 : 2,
        propertyTypes: investmentProfile.propertyTypes,
        strategicFactors: investmentProfile.strategicFactors
      };

      const rawProperties = await this.propertyHunter.searchProperties(searchCriteria);
      console.log(`📊 [Orchestrator] Discovery complete: ${rawProperties.length} properties found`);

      // Phase 4: Comprehensive Analysis (Financial + Enhancement)
      console.log(`💰 [Orchestrator] Phase 4: Comprehensive Financial & Enhancement Analysis`);
      
      if (rawProperties.length === 0) {
        console.log(`⚠️ [Orchestrator] No properties found for analysis - expanding search criteria`);
        
        // Fallback: expand search with relaxed criteria
        const relaxedCriteria = {
          ...searchCriteria,
          maxPrice: searchCriteria.maxPrice * 1.2, // 20% higher price range
          minBedrooms: Math.max(1, searchCriteria.minBedrooms - 1), // One less bedroom minimum
          locations: ['Massachusetts', 'Boston', 'Worcester', 'Springfield', 'Lowell', 'Cambridge', 'Quincy']
        };
        
        const fallbackProperties = await this.propertyHunter.searchProperties(relaxedCriteria);
        console.log(`🔄 [Orchestrator] Fallback search found ${fallbackProperties.length} properties`);
        
        if (fallbackProperties.length === 0) {
          throw new Error('No properties found even with expanded criteria');
        }
        
        rawProperties.push(...fallbackProperties);
      }

      const enhancedProperties = await this.performComprehensiveAnalysis(
        rawProperties.slice(0, 20), // Top 20 properties for detailed analysis
        investmentProfile,
        request.priorityLevel
      );

      console.log(`✅ [Orchestrator] Analysis complete: ${enhancedProperties.length} properties analyzed`);

      // Phase 5: Report Generation
      console.log(`📄 [Orchestrator] Phase 5: Investment Report Compilation`);
      const investmentReport = await this.dealPackager.generateComprehensiveReport(
        investmentProfile,
        marketAnalyses,
        enhancedProperties.map(p => p.financialAnalysis)
      );

      // Phase 6: Save and Finalize
      const reportFilePath = await this.dealPackager.saveReportToMarkdown(investmentReport, strategyId);

      console.log(`✅ [Orchestrator] Analysis complete: ${strategyId}`);

      return {
        strategyId,
        investmentProfile,
        marketAnalyses,
        enhancedProperties,
        investmentReport,
        reportFilePath
      };

    } catch (error) {
      console.error(`❌ [Orchestrator] Analysis failed for ${strategyId}:`, error);
      throw error;
    }
  }
  );

  private async performComprehensiveAnalysis(
    properties: EnrichedProperty[],
    profile: InvestmentProfile,
    priorityLevel: string
  ): Promise<(EnrichedProperty & { 
    financialAnalysis: PropertyFinancials;
    enhancementAnalysis: PropertyEnhancementAnalysis;
  })[]> {
    
    const results = [];

    for (const property of properties) {
      console.log(`🔍 [Orchestrator] Analyzing ${property.address}...`);

      try {
        // Financial Analysis
        const financialAnalysis = await this.financialCalculator.analyzeProperty(property, profile);

        // Enhancement Analysis (ADU potential, value-add opportunities)
        let enhancementAnalysis: PropertyEnhancementAnalysis;
        
        if (priorityLevel === 'comprehensive' || profile.preferences.comprehensiveAnalysis) {
          enhancementAnalysis = await this.realEstateAdvisor.analyzePropertyPotential(
            property, 
            property.location
          );

          // Incorporate ADU potential into financial analysis
          if (enhancementAnalysis.aduPotential.basementAduFeasible) {
            financialAnalysis.scenarios = this.enhanceWithAduScenarios(
              financialAnalysis.scenarios,
              enhancementAnalysis.aduPotential,
              property
            );
          }
        } else {
          // Basic enhancement analysis for speed
          enhancementAnalysis = {
            aduPotential: {
              hasBasement: false,
              basementAduFeasible: false,
              estimatedAduCost: 0,
              estimatedAduRent: 0,
              monthlyROI: 0,
              paybackPeriod: 0
            },
            valueAddOpportunities: { renovationPotential: [], estimatedCosts: {}, rentIncreaseOpportunities: {} },
            zoningConsiderations: { aduAllowed: false, requiresPermits: [], restrictions: [] },
            marketFactors: { aduDemand: 'medium', competitiveRates: 0, occupancyProjection: 0.92 }
          };
        }

        results.push({
          ...property,
          financialAnalysis,
          enhancementAnalysis
        });

      } catch (error) {
        console.error(`❌ [Orchestrator] Error analyzing ${property.address}:`, error);
        // Continue with other properties
      }
    }

    // Sort by enhanced total economic benefit (including ADU potential)
    return results.sort((a, b) => {
      const aTotal = this.calculateEnhancedEconomicBenefit(a);
      const bTotal = this.calculateEnhancedEconomicBenefit(b);
      return bTotal - aTotal;
    });
  }

  private enhanceWithAduScenarios(scenarios: any[], aduPotential: any, property: any): any[] {
    // Add ADU scenarios to existing financial scenarios
    const enhancedScenarios = [...scenarios];

    // ADU Development Scenario
    const baseScenario = scenarios[0]; // Use 25% down scenario as base
    
    const aduScenario = {
      ...baseScenario,
      scenario: "ADU Development Strategy",
      includesAdu: true,
      aduDevelopmentCost: aduPotential.estimatedAduCost,
      aduMonthlyRent: aduPotential.estimatedAduRent,
      enhancedMonthlyIncome: baseScenario.monthlyCashFlow + aduPotential.estimatedAduRent,
      totalInvestment: baseScenario.downPayment + aduPotential.estimatedAduCost,
      enhancedROE: ((baseScenario.monthlyCashFlow + aduPotential.estimatedAduRent) * 12 / 
                   (baseScenario.downPayment + aduPotential.estimatedAduCost)) * 100,
      walkthrough: [
        ...baseScenario.walkthrough,
        '',
        '--- ADU Development Analysis ---',
        `ADU Development Cost: $${aduPotential.estimatedAduCost.toLocaleString()}`,
        `ADU Monthly Rent: $${aduPotential.estimatedAduRent.toLocaleString()}`,
        `Enhanced Monthly Income: $${Math.round(baseScenario.monthlyCashFlow + aduPotential.estimatedAduRent).toLocaleString()}`,
        `Total Investment: $${Math.round(baseScenario.downPayment + aduPotential.estimatedAduCost).toLocaleString()}`,
        `Enhanced ROE: ${(((baseScenario.monthlyCashFlow + aduPotential.estimatedAduRent) * 12 / 
                         (baseScenario.downPayment + aduPotential.estimatedAduCost)) * 100).toFixed(1)}%`,
        `ADU Payback Period: ${aduPotential.paybackPeriod.toFixed(1)} years`
      ]
    };

    enhancedScenarios.push(aduScenario);
    return enhancedScenarios;
  }

  private calculateEnhancedEconomicBenefit(property: any): number {
    let baseBenefit = property.financialAnalysis.recommendedScenario.totalEconomicBenefit || 0;

    // Add ADU potential if feasible
    if (property.enhancementAnalysis.aduPotential.basementAduFeasible) {
      baseBenefit += property.enhancementAnalysis.aduPotential.estimatedAduRent;
    }

    // Add value-add potential (estimated monthly benefit from improvements)
    const valueAddMonthly = Object.values(property.enhancementAnalysis.valueAddOpportunities.rentIncreaseOpportunities)
      .reduce((sum: number, increase: any) => sum + (increase || 0), 0);
    
    baseBenefit += valueAddMonthly * 0.7; // Apply 70% probability factor

    return baseBenefit;
  }

  private generateStrategyId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper method for real estate agent insights integration
  static getRealEstateAgentInsights(): string[] {
    return [
      "Check for basement potential - ADU conversion can add $1,500-2,000 monthly income",
      "Properties with unfinished basements offer 15-25% additional return potential",
      "Look for properties with separate utility access for easier ADU development",
      "Consider properties with existing separate entrances or easy conversion potential",
      "Multi-family properties (3-4 units) provide better cash flow and ADU opportunities",
      "Properties near universities have higher ADU rental demand and occupancy rates",
      "Check local zoning for ADU permissions - some MA cities require owner occupancy",
      "Basement ADU development typically costs $80k-$120k in Greater Boston area",
      "Properties with good parking can command 10-15% rent premium",
      "Energy efficiency improvements (windows, insulation) increase rent by $100-200/month",
      "Kitchen and bathroom renovations provide highest ROI for rental properties",
      "Properties built before 1980 often need electrical updates for ADU compliance",
      "Good transit access (within 0.5 mile of T stop) adds $200-300 monthly rent premium",
      "Properties in emerging neighborhoods offer better appreciation potential",
      "Consider total carrying costs including taxes, insurance, and maintenance reserves"
    ];
  }
}