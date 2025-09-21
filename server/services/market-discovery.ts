/**
 * Market Discovery - Finds markets that fit investment strategies
 * 
 * Instead of searching properties in a predetermined location,
 * this service discovers which markets support your investment strategy
 */

import type { FactStore, Fact } from './fact-store';
import type { UserRequirements } from './strategy-builder';
import { ResearchMesh } from './research-mesh';
import { GapDetector } from './gap-detector-fixed';

export interface MarketCriteria {
  strategy: string;
  minCashFlow: number;
  maxPrice: number;
  cashAvailable: number;
  requirements: {
    aduAllowed?: boolean;
    section8Available?: boolean;
    nearUniversity?: boolean;
    minCapRate?: number;
    maxCrimeRate?: number;
  };
}

export interface MarketScore {
  city: string;
  state: string;
  score: number;
  metrics: {
    medianPrice: number;
    priceToRentRatio: number;
    capRate: number;
    cashFlowPotential: number;
    aduFeasibility: boolean;
    section8Payment: number;
    universityCount: number;
    crimeRate: number;
    propertyTaxRate: number;
  };
  viableStrategies: string[];
  reasoning: string[];
  dataQuality: number;
}

export interface MarketRecommendation {
  topMarkets: MarketScore[];
  fallbackStrategy?: {
    location: string;
    strategy: string;
    adjustments: string[];
    reasoning: string[];
  };
}

export class MarketDiscovery {
  private factStore: FactStore;
  private researchMesh: ResearchMesh;
  private gapDetector: GapDetector;
  
  // Massachusetts cities to screen (can be expanded)
  private readonly MA_MARKETS = [
    // Major cities
    'Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell',
    'Brockton', 'New Bedford', 'Quincy', 'Lynn', 'Fall River',
    'Newton', 'Lawrence', 'Somerville', 'Framingham', 'Haverhill',
    
    // University towns
    'Amherst', 'Northampton', 'Salem', 'Waltham', 'Medford',
    
    // Emerging markets
    'Everett', 'Revere', 'Chelsea', 'Malden', 'Taunton',
    'Chicopee', 'Weymouth', 'Peabody', 'Methuen', 'Barnstable',
    
    // Affordable markets
    'Fitchburg', 'Attleboro', 'Westfield', 'Holyoke', 'Pittsfield',
    'Gardner', 'North Adams', 'Greenfield'
  ];
  
  constructor(factStore: FactStore) {
    this.factStore = factStore;
    this.gapDetector = new GapDetector(factStore);
    this.researchMesh = new ResearchMesh(factStore, this.gapDetector);
  }
  
  /**
   * Discover markets that fit the investment criteria
   */
  async discoverMarkets(criteria: MarketCriteria): Promise<MarketRecommendation> {
    console.log('\n🔍 Market Discovery: Finding towns where your strategy works...\n');
    
    // Step 1: Quick pre-screen using available data
    const prescreenScores = await this.prescreenMarkets(criteria);
    
    // Step 2: Deep research top candidates
    const topCandidates = prescreenScores.slice(0, 10);
    const deepScores = await this.deepResearchMarkets(topCandidates, criteria);
    
    // Step 3: Rank and filter
    const viableMarkets = deepScores
      .filter(m => m.score > 60)
      .sort((a, b) => b.score - a.score);
    
    // Step 4: Generate fallback if no viable markets
    let fallback;
    if (viableMarkets.length === 0 && criteria.strategy !== 'any') {
      fallback = await this.generateFallbackStrategy(criteria, deepScores);
    }
    
    return {
      topMarkets: viableMarkets.slice(0, 5),
      fallbackStrategy: fallback
    };
  }
  
  /**
   * Quick pre-screen using basic metrics
   */
  private async prescreenMarkets(criteria: MarketCriteria): Promise<MarketScore[]> {
    const scores: MarketScore[] = [];
    
    for (const city of this.MA_MARKETS) {
      // Check if we have basic data
      const medianPrice = await this.getFactValue('comps', 'city', city, 'median_sale_price');
      
      if (!medianPrice) {
        // No data, assign neutral score for research priority
        scores.push(this.createDefaultScore(city));
        continue;
      }
      
      // Quick feasibility check
      if (medianPrice > criteria.maxPrice * 1.2) {
        continue; // Skip if way over budget
      }
      
      // Calculate basic score
      const score = await this.calculateQuickScore(city, criteria, medianPrice);
      scores.push(score);
    }
    
    return scores.sort((a, b) => b.score - a.score);
  }
  
  /**
   * Deep research top candidate markets
   */
  private async deepResearchMarkets(
    candidates: MarketScore[],
    criteria: MarketCriteria
  ): Promise<MarketScore[]> {
    const enhanced: MarketScore[] = [];
    
    for (const candidate of candidates) {
      console.log(`📊 Researching ${candidate.city}, MA...`);
      
      // Define what data we need for this market
      const requirements = this.getMarketDataRequirements(candidate.city, criteria);
      
      // Check gaps
      const gaps = await this.gapDetector.analyze(requirements);
      
      // Research if needed
      if (gaps.allGaps.length > 0) {
        console.log(`  🔬 Researching ${gaps.allGaps.length} missing facts...`);
        await this.researchMesh.processGaps(gaps.allGaps.slice(0, 5)); // Limit for speed
      }
      
      // Calculate comprehensive score
      const detailedScore = await this.calculateDetailedScore(candidate.city, criteria);
      enhanced.push(detailedScore);
    }
    
    return enhanced;
  }
  
  /**
   * Calculate quick score for pre-screening
   */
  private async calculateQuickScore(
    city: string,
    criteria: MarketCriteria,
    medianPrice: number
  ): Promise<MarketScore> {
    let score = 50; // Base score
    const metrics: any = { medianPrice };
    const reasoning: string[] = [];
    
    // Price feasibility
    if (medianPrice <= criteria.maxPrice * 0.8) {
      score += 20;
      reasoning.push(`Affordable market: median $${(medianPrice/1000).toFixed(0)}k`);
    }
    
    // Check university presence if needed
    if (criteria.requirements.nearUniversity) {
      const universities = await this.getFactValue('demographics', 'city', city, 'university_count');
      if (universities > 0) {
        score += 15;
        metrics.universityCount = universities;
        reasoning.push(`${universities} universities nearby`);
      }
    }
    
    return {
      city,
      state: 'MA',
      score,
      metrics,
      viableStrategies: [],
      reasoning,
      dataQuality: 0.3
    };
  }
  
  /**
   * Calculate detailed score with full data
   */
  private async calculateDetailedScore(
    city: string,
    criteria: MarketCriteria
  ): Promise<MarketScore> {
    const metrics: any = {};
    const reasoning: string[] = [];
    const viableStrategies: string[] = [];
    let score = 0;
    
    // Get all relevant facts
    const medianPrice = await this.getFactValue('comps', 'city', city, 'median_sale_price') || 400000;
    const avgRent2br = await this.getFactValue('comps', 'city', city, 'avg_rent_2br') || 2000;
    const section8_2br = await this.getFactValue('section8', 'city', city, 'max_payment_2br') || 0;
    const aduAllowed = await this.getFactValue('adu_rules', 'city', city, 'adu_by_right') || false;
    const universityCount = await this.getFactValue('demographics', 'city', city, 'university_count') || 0;
    const crimeRate = await this.getFactValue('crime', 'city', city, 'crime_rate_per_1000') || 30;
    const taxRate = await this.getFactValue('taxes', 'city', city, 'property_tax_rate') || 15;
    const fhaLimit = await this.getFactValue('incentives', 'city', city, 'fha_loan_limit') || 500000;
    
    metrics.medianPrice = medianPrice;
    metrics.priceToRentRatio = medianPrice / (avgRent2br * 12);
    metrics.capRate = ((avgRent2br * 12 * 0.6) / medianPrice) * 100; // 60% NOI estimate
    metrics.section8Payment = section8_2br;
    metrics.aduFeasibility = aduAllowed;
    metrics.universityCount = universityCount;
    metrics.crimeRate = crimeRate;
    metrics.propertyTaxRate = taxRate;
    
    // Calculate cash flow potential
    const typicalPrice = Math.min(medianPrice, criteria.maxPrice);
    const downPayment = typicalPrice * 0.2;
    const loanAmount = typicalPrice - downPayment;
    const monthlyPayment = loanAmount * 0.006; // ~7.2% rate
    const monthlyTaxInsurance = typicalPrice * 0.015 / 12;
    const totalMonthly = monthlyPayment + monthlyTaxInsurance;
    const netCashFlow = avgRent2br - totalMonthly;
    metrics.cashFlowPotential = netCashFlow;
    
    // Score components
    
    // 1. Cash flow scoring (40 points max)
    if (netCashFlow >= criteria.minCashFlow) {
      score += 40;
      viableStrategies.push('Traditional Buy & Hold');
      reasoning.push(`Positive cash flow: $${netCashFlow.toFixed(0)}/month`);
    } else if (netCashFlow > 0) {
      score += 20;
      reasoning.push(`Some cash flow: $${netCashFlow.toFixed(0)}/month`);
    }
    
    // 2. Price-to-rent ratio (20 points max)
    if (metrics.priceToRentRatio < 15) {
      score += 20;
      reasoning.push(`Excellent price-to-rent: ${metrics.priceToRentRatio.toFixed(1)}`);
    } else if (metrics.priceToRentRatio < 20) {
      score += 10;
      reasoning.push(`Good price-to-rent: ${metrics.priceToRentRatio.toFixed(1)}`);
    }
    
    // 3. Strategy-specific scoring (30 points max)
    if (criteria.strategy.includes('ADU') && aduAllowed) {
      score += 15;
      viableStrategies.push('House Hack ADU');
      reasoning.push('ADU by-right allowed');
    }
    
    if (criteria.strategy.includes('Section 8') && section8_2br > monthlyPayment) {
      score += 15;
      viableStrategies.push('Section 8 Guaranteed');
      reasoning.push(`Section 8 covers mortgage: $${section8_2br}/month`);
    }
    
    if (criteria.requirements.nearUniversity && universityCount > 0) {
      score += 10;
      viableStrategies.push('Student Housing');
      reasoning.push(`${universityCount} universities for student housing`);
    }
    
    if (medianPrice < fhaLimit && downPayment < criteria.cashAvailable) {
      viableStrategies.push('FHA First-Time Buyer');
    }
    
    // 4. Market fundamentals (10 points max)
    if (crimeRate < 30) {
      score += 5;
      reasoning.push('Low crime area');
    }
    
    if (taxRate < 15) {
      score += 5;
      reasoning.push(`Low property tax: $${taxRate}/$1000`);
    }
    
    return {
      city,
      state: 'MA',
      score: Math.min(score, 100),
      metrics,
      viableStrategies,
      reasoning,
      dataQuality: 0.8
    };
  }
  
  /**
   * Generate fallback strategy for committed location
   */
  async generateFallbackStrategy(
    criteria: MarketCriteria,
    marketScores: MarketScore[]
  ): Promise<any> {
    // Find the user's preferred location if specified
    const preferredMarket = marketScores[0]; // Or could be Worcester specifically
    
    if (!preferredMarket) return null;
    
    const adjustments: string[] = [];
    const reasoning: string[] = [];
    let recommendedStrategy = 'Modified Traditional Rental';
    
    // Analyze why current strategy doesn't work
    const cashFlow = preferredMarket.metrics.cashFlowPotential;
    const medianPrice = preferredMarket.metrics.medianPrice;
    
    if (cashFlow < criteria.minCashFlow) {
      const gap = criteria.minCashFlow - cashFlow;
      
      // Calculate what would make it work
      if (gap < 500) {
        adjustments.push(`Increase budget to $${(medianPrice * 1.2).toFixed(0)} for better properties`);
        adjustments.push('Target 3-4 unit properties for multiple income streams');
        adjustments.push('Consider property management yourself to save 8-10%');
      } else {
        adjustments.push(`Lower cash flow expectation to $${Math.max(0, cashFlow).toFixed(0)}/month`);
        adjustments.push('Focus on appreciation over cash flow');
        adjustments.push('Consider house hacking to live free while building equity');
        recommendedStrategy = 'House Hack for Equity Building';
      }
    }
    
    // Budget adjustments
    const affordablePrice = criteria.cashAvailable * 5; // 20% down
    if (affordablePrice < medianPrice * 0.8) {
      adjustments.push('Partner with another investor to increase buying power');
      adjustments.push(`Save additional $${((medianPrice * 0.2) - criteria.cashAvailable).toFixed(0)} for 20% down`);
      adjustments.push('Consider FHA with 3.5% down to maximize leverage');
      recommendedStrategy = 'FHA House Hack';
    }
    
    // Market-specific opportunities
    if (preferredMarket.metrics.aduFeasibility) {
      adjustments.push('Buy single-family and add ADU for $120-150k');
      adjustments.push('Live in main house year 1, rent both units after');
      reasoning.push('ADU adds $1,500-2,000/month rental income');
      recommendedStrategy = 'ADU Development Play';
    }
    
    if (preferredMarket.metrics.section8Payment > 0) {
      adjustments.push(`Target Section 8 approved properties`);
      reasoning.push(`Guaranteed rent of $${preferredMarket.metrics.section8Payment}/month`);
    }
    
    // Time-based strategy
    adjustments.push('Consider 2-year plan: Buy, improve, refinance');
    adjustments.push('Use BRRRR strategy to recycle capital');
    
    reasoning.push(`${preferredMarket.city} median price: $${(medianPrice/1000).toFixed(0)}k`);
    reasoning.push(`Current cash flow potential: $${cashFlow.toFixed(0)}/month`);
    reasoning.push(`Your cash can support: $${(affordablePrice/1000).toFixed(0)}k purchase`);
    
    return {
      location: preferredMarket.city,
      strategy: recommendedStrategy,
      adjustments,
      reasoning
    };
  }
  
  /**
   * Optimize strategy for a specific committed location
   */
  async optimizeForLocation(
    location: string,
    requirements: UserRequirements
  ): Promise<{
    bestStrategy: string;
    whyItWorks: string[];
    requiredAdjustments: string[];
    alternativeStrategies: Array<{
      strategy: string;
      pros: string[];
      cons: string[];
    }>;
    marketReality: {
      medianPrice: number;
      typicalRent: number;
      cashFlowReality: number;
    };
  }> {
    console.log(`\n🎯 Optimizing strategy for ${location}...\n`);
    
    // Get comprehensive market data
    const marketData = await this.getMarketData(location);
    
    // Calculate what actually works in this market
    const viableStrategies = this.evaluateStrategies(marketData, requirements);
    
    // Find the best fit
    const bestStrategy = this.selectBestStrategy(viableStrategies, requirements);
    
    // Generate alternatives
    const alternatives = this.generateAlternatives(viableStrategies, bestStrategy);
    
    return {
      bestStrategy: bestStrategy.name,
      whyItWorks: bestStrategy.reasoning,
      requiredAdjustments: bestStrategy.adjustments,
      alternativeStrategies: alternatives,
      marketReality: {
        medianPrice: marketData.medianPrice,
        typicalRent: marketData.avgRent,
        cashFlowReality: marketData.typicalCashFlow
      }
    };
  }
  
  /**
   * Helper: Get fact value
   */
  private async getFactValue(
    topic: string,
    scopeLevel: string,
    scopeValue: string,
    key: string
  ): Promise<any> {
    const fact = await this.factStore.get({
      topic: topic as any,
      scopeLevel: scopeLevel as any,
      scopeValue,
      key
    });
    return fact?.value;
  }
  
  /**
   * Helper: Create default score
   */
  private createDefaultScore(city: string): MarketScore {
    return {
      city,
      state: 'MA',
      score: 50,
      metrics: {
        medianPrice: 0,
        priceToRentRatio: 0,
        capRate: 0,
        cashFlowPotential: 0,
        aduFeasibility: false,
        section8Payment: 0,
        universityCount: 0,
        crimeRate: 0,
        propertyTaxRate: 0
      },
      viableStrategies: [],
      reasoning: ['No data available - needs research'],
      dataQuality: 0
    };
  }
  
  /**
   * Helper: Get market data requirements
   */
  private getMarketDataRequirements(city: string, criteria: MarketCriteria): any[] {
    return [
      {
        topic: 'comps',
        scopeLevel: 'city',
        scopeValue: city,
        keys: ['median_sale_price', 'avg_rent_2br', 'avg_rent_3br', 'inventory'],
        priority: 'critical',
        reason: 'Market pricing baseline'
      },
      {
        topic: 'section8',
        scopeLevel: 'city',
        scopeValue: city,
        keys: ['max_payment_2br', 'max_payment_3br'],
        priority: 'high',
        reason: 'Section 8 opportunity'
      },
      {
        topic: 'adu_rules',
        scopeLevel: 'city',
        scopeValue: city,
        keys: ['adu_by_right', 'min_lot_sqft'],
        priority: 'high',
        reason: 'ADU development potential'
      }
    ];
  }
  
  /**
   * Helper: Get comprehensive market data
   */
  private async getMarketData(location: string): Promise<any> {
    // Fetch all relevant facts for the location
    const data = {
      medianPrice: await this.getFactValue('comps', 'city', location, 'median_sale_price') || 400000,
      avgRent: await this.getFactValue('comps', 'city', location, 'avg_rent_2br') || 2000,
      section8: await this.getFactValue('section8', 'city', location, 'max_payment_2br') || 0,
      aduAllowed: await this.getFactValue('adu_rules', 'city', location, 'adu_by_right') || false,
      typicalCashFlow: 0
    };
    
    // Calculate typical cash flow
    const monthlyPayment = (data.medianPrice * 0.8) * 0.006; // 20% down, ~7.2% rate
    const expenses = data.medianPrice * 0.015 / 12; // Tax, insurance, maintenance
    data.typicalCashFlow = data.avgRent - monthlyPayment - expenses;
    
    return data;
  }
  
  /**
   * Helper: Evaluate strategies
   */
  private evaluateStrategies(marketData: any, requirements: UserRequirements): any[] {
    const strategies = [];
    
    // Traditional rental
    strategies.push({
      name: 'Traditional Buy & Hold',
      viable: marketData.typicalCashFlow > 0,
      score: marketData.typicalCashFlow > requirements.goals.monthlyIncome ? 100 : 50,
      reasoning: [`Cash flow: $${marketData.typicalCashFlow.toFixed(0)}/month`],
      adjustments: marketData.typicalCashFlow < requirements.goals.monthlyIncome ? 
        ['Need multi-family for more income', 'Consider property management yourself'] : []
    });
    
    // House hack
    if (requirements.preferences.willingToLiveIn) {
      strategies.push({
        name: 'House Hack',
        viable: true,
        score: 80,
        reasoning: ['Live free while tenants pay mortgage', 'Build equity with minimal cash'],
        adjustments: ['Must live in property for 1 year', 'Need to find multi-family']
      });
    }
    
    // ADU strategy
    if (marketData.aduAllowed) {
      const aduRent = 1500; // Typical ADU rent
      const totalIncome = marketData.avgRent + aduRent;
      strategies.push({
        name: 'ADU Development',
        viable: true,
        score: 90,
        reasoning: [`Total income after ADU: $${totalIncome}/month`, 'Forced appreciation through development'],
        adjustments: ['Need $120-150k for ADU construction', 'May take 6-12 months to complete']
      });
    }
    
    return strategies;
  }
  
  /**
   * Helper: Select best strategy
   */
  private selectBestStrategy(strategies: any[], requirements: UserRequirements): any {
    // Sort by score and viability
    const viable = strategies.filter(s => s.viable).sort((a, b) => b.score - a.score);
    
    if (viable.length > 0) {
      return viable[0];
    }
    
    // Return best non-viable with adjustments
    return strategies.sort((a, b) => b.score - a.score)[0];
  }
  
  /**
   * Helper: Generate alternative strategies
   */
  private generateAlternatives(strategies: any[], best: any): any[] {
    return strategies
      .filter(s => s.name !== best.name)
      .slice(0, 3)
      .map(s => ({
        strategy: s.name,
        pros: s.reasoning,
        cons: s.adjustments
      }));
  }
}