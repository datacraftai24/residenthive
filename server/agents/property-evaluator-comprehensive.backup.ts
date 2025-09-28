/**
 * Property Evaluator Comprehensive - Two-Phase Evaluation System
 * Phase 1: Deterministic screening of ALL properties
 * Phase 2: LLM evaluation of qualified properties (budget-bounded)
 */

import { tracedLLMCall } from '../observability/llm-tracer';
import type { ResearchResult } from '../ai-agents/smart-research-agent';
import { databaseMarketStatsStore } from '../services/database-market-stats-store.js';
import { rentDashboard } from '../services/rent-estimation-dashboard.js';
import type { MarketStatsStore } from '../services/database-market-stats-store.js';

interface UWInput {
  price: number;
  units: number;
  rentBand?: [number, number];
  rentConfidence: 'MARKET_DATA' | 'ESTIMATED' | 'MISSING';
  taxes: number;
  insurance: number;
  mgmtPct: number;    // As decimal
  maintPct: number;   // As decimal
  vacancyPct: number; // As decimal
  rate: number;       // As decimal
  downPct: number;    // As decimal
  closingPct: number; // As decimal
  termYrs: number;
  utilitiesOwner: number;
}

interface UWResult {
  NOI: number;
  CapRate: number;
  DSCR: number;
  CoC: number;
  cashNeeded: number;
  stress: { 
    DSCR: number; 
    CoC: number;
    passed: boolean;
  };
  pass: boolean;
  reasons: string[];
}

export type RentConfidence = 'MARKET_REPORTED' | 'COMPS_INFERRED' | 'MARKET_MODELED' | 'HEURISTIC';

export interface RentEstimate {
  point: number;               // central estimate
  band: [number, number];      // [low, high]
  confidence: RentConfidence;
  method: string;              // e.g., 'explicit', 'comps:p25-p75', 'rpsf:zip:02108:2br', 'grm:classB'
  provenance?: {
    source?: string;           // MLS, owner, scraped, model
    last_updated?: string;     // ISO timestamp
    n_samples?: number;        // comps count or sample size
    sigma?: number;            // stdev used, if any
    fallback_level?: number;   // 0=ZIP, 1=City, 2=County, etc.
    staleness_days?: number;   // Days since last update
  };
  notes?: string[];
}

interface Phase1Result {
  property: any;
  uw: UWResult | null;
  pass: boolean;
  score: number;
  reasons: string[];
  data_asks?: string[];
}

interface EvaluationResult {
  property: any;
  uw: UWResult;
  pass: boolean;
  score: number;
  llm_narrative?: any;
  final_score: number;
  reasons: string[];
}

export class PropertyEvaluatorComprehensive {
  private evalBudgetUsed = 0;
  private readonly EVAL_BUDGET_USD_MAX = 100;
  private readonly COST_PER_EVAL_USD = 0.10;
  
  async evaluateComprehensive(
    properties: any[],
    strategy: any,
    marketResearch: ResearchResult[],
    requirements: any & { marketStats?: MarketStatsStore }
  ): Promise<EvaluationResult[]> {
    console.log(`📊 [COMPREHENSIVE] Evaluating ${properties.length} properties`);
    
    // PHASE 1: Deterministic screening of ALL
    const phase1Results = await this.phase1Screen(properties, strategy, requirements.marketStats);
    const qualified = phase1Results.filter(r => r.pass);
    
    console.log(`   Phase 1: ${qualified.length}/${properties.length} passed gates`);
    
    // PHASE 2: LLM evaluation (budget-bounded)
    const llmResults = await this.phase2LLM(qualified, strategy, marketResearch);
    
    // Final ranking
    const final = llmResults
      .sort((a, b) => b.final_score - a.final_score)
      .slice(0, 10);
    
    const evalCost = Math.min(this.evalBudgetUsed, this.EVAL_BUDGET_USD_MAX);
    console.log(`[eval] total_props=${properties.length} | phase1_pass=${qualified.length} | llm_evaluated=${llmResults.length} | cost=$${evalCost.toFixed(2)} | budget=$${this.EVAL_BUDGET_USD_MAX}`);
    
    return final;
  }
  
  private async phase1Screen(properties: any[], strategy: any, marketStats?: MarketStatsStore): Promise<Phase1Result[]> {
    const searchSpace = strategy.search_space;
    if (!searchSpace) {
      console.warn('⚠️ No search_space in strategy, using defaults');
    }
    
    const median = searchSpace?.market_context?.median_price || 
                   strategy.market_context?.median_price || 
                   435000;
    const gates = searchSpace?.dynamic_gates || {
      base_cap_rate: 0.065,
      base_coc: 0.08,
      base_dscr: 1.25,
      cap_rate_slope: 0.10,
      coc_slope: 0.20,
      dscr_floor: 1.20
    };
    
    const results = [];
    for (const property of properties) {
      // Check data completeness FIRST
      const uwInput = await this.toUWInput(property, strategy, marketStats);
      
      if (!uwInput) {
        results.push({
          property,
          uw: null,
          pass: false,
          score: 0,
          reasons: ['INCOMPLETE: Missing critical data (rent/taxes/price)'],
          data_asks: this.getDataAsks(property)
        });
        continue;
      }
      
      // Underwrite with stress test
      const uw = this.underwrite(uwInput, gates.dscr_floor);
      
      // Get dynamic gates based on price
      const dynamicGates = this.getDynamicGates(property.price, median, gates);
      
      // Check ALL gates including stress
      const pass = (
        uw.CapRate >= dynamicGates.minCap &&
        uw.CoC >= dynamicGates.minCoC &&
        uw.DSCR >= dynamicGates.minDSCR &&
        uw.stress.passed  // MUST pass stress test
      );
      
      results.push({
        property,
        uw,
        pass,
        score: 0.5 * uw.CoC + 0.3 * uw.CapRate + 0.2 * uw.DSCR,
        reasons: pass ? ['Passes all gates'] : this.getFailureReasons(uw, dynamicGates, gates.dscr_floor)
      });
    }
    return results;
  }
  
  private async toUWInput(property: any, strategy: any, marketStats?: MarketStatsStore): Promise<UWInput | null> {
    // NEVER hallucinate rent
    const rentData = await this.estimateRent(property, strategy, marketStats);
    if (!rentData) {
      return null;  // Missing critical data
    }
    
    // Normalize all percentages at boundary
    const normalizeRate = (val: any, fieldName: string): number => {
      if (val == null) return 0;
      const num = typeof val === 'number' ? val : parseFloat(val);
      if (isNaN(num)) {
        console.warn(`Invalid ${fieldName}: ${val}`);
        return 0;
      }
      
      // If > 1, assume percentage notation
      const normalized = num > 1 ? num / 100 : num;
      
      // Sanity bounds
      if (normalized < 0 || normalized > 0.50) {
        console.warn(`${fieldName} out of bounds: ${normalized}`);
        return 0;
      }
      
      return normalized;
    };
    
    return {
      price: property.price,
      units: property.units || 1,
      rentBand: rentData.band,
      rentConfidence: rentData.confidence,
      taxes: property.annual_taxes || property.price * 0.012, // 1.2% fallback
      insurance: property.annual_insurance || property.price * 0.004, // 0.4% fallback
      mgmtPct: normalizeRate(0.08, 'mgmtPct'),
      maintPct: normalizeRate(0.05, 'maintPct'),
      vacancyPct: normalizeRate(strategy.market_context?.vacancy || 0.05, 'vacancyPct'),
      rate: normalizeRate(strategy.market_context?.rate || 0.065, 'rate'),
      downPct: normalizeRate(0.20, 'downPct'),
      closingPct: normalizeRate(0.035, 'closingPct'),
      termYrs: 30,
      utilitiesOwner: 0  // Conservative: assume tenant pays
    };
  }
  
  // Legacy wrapper for compatibility
  private async getRentData(property: any, strategy: any, marketStats?: MarketStatsStore): Promise<{ band: [number, number]; confidence: 'MARKET_DATA' | 'ESTIMATED' | 'MISSING' } | null> {
    const estimate = await this.estimateRent(property, strategy, marketStats);
    if (!estimate) return null;
    
    // Map new confidence to legacy format
    const legacyConfidence = estimate.confidence === 'MARKET_REPORTED' ? 'MARKET_DATA' : 'ESTIMATED';
    
    return {
      band: estimate.band,
      confidence: legacyConfidence as 'MARKET_DATA' | 'ESTIMATED'
    };
  }
  
  private deriveBandFromStats(point: number, sigma?: number, n?: number): [number, number] {
    // Wider bands for small n; clamp so we're never absurdly tight.
    const k = (n && n >= 8) ? 1.0 : (n && n >= 3) ? 1.5 : 2.0;
    const pct = Math.min(0.20, Math.max(0.05, (sigma ?? point * 0.07) * k / point));
    return [point * (1 - pct), point * (1 + pct)];
  }
  
  private widenForStaleness(band: [number, number], updatedAt?: string): [number, number] {
    if (!updatedAt) return band;
    const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
    if (days > 365) return [band[0] * 0.85, band[1] * 1.15];
    if (days > 180) return [band[0] * 0.9, band[1] * 1.1];
    return band;
  }
  
  private widenForFallback(band: [number, number], depth: number): [number, number] {
    // depth: 0=zip, 1=city, 2=county, 3=metro, 4=state, 5=national
    const factors = [1.00, 1.05, 1.10, 1.15, 1.20, 1.30];
    const f = factors[Math.min(depth, factors.length - 1)];
    return [band[0] / f, band[1] * f];
  }
  
  private async estimateRent(property: any, strategy: any, marketStats?: MarketStatsStore): Promise<RentEstimate | null> {
    // BUILD GEO - NO DEFAULTS
    const geo = {
      zip: property.zip || property.postalCode || undefined,
      city: property.city || undefined,
      county: property.county || undefined,
      state: property.state || undefined
    };
    
    // Log for dashboard
    const logEstimate = (estimate: RentEstimate) => {
      if (marketStats) {
        marketStats.trackConfidence(estimate.confidence);
      }
      rentDashboard.logEvaluation(property.address || 'Unknown', estimate);
      console.log(`   💰 [RENT] ${property.address}: ${estimate.method} → $${estimate.point} [${estimate.band[0]}-${estimate.band[1]}] (${estimate.confidence}, fallback:${estimate.provenance?.fallback_level || 0})`);
      return estimate;
    };
    
    // 1. MARKET_REPORTED - Explicit rent
    if (property.monthly_rent && property.monthly_rent > 0) {
      return logEstimate({
        point: property.monthly_rent,
        band: [property.monthly_rent * 0.95, property.monthly_rent * 1.05],
        confidence: 'MARKET_REPORTED',
        method: 'explicit',
        provenance: { source: 'listing' }
      });
    }
    
    // 2. COMPS_INFERRED - Strategy bands
    if (strategy?.comps_bands?.rent?.[0]?.range_monthly) {
      const [lo, hi] = strategy.comps_bands.rent[0].range_monthly;
      return logEstimate({
        point: (lo + hi) / 2,
        band: [lo, hi],
        confidence: 'COMPS_INFERRED',
        method: 'strategy_comps',
        provenance: { 
          source: strategy.comps_bands.rent[0].sources?.join(',') || 'market_research'
        }
      });
    }
    
    // If no store, stop here
    if (!marketStats) {
      console.log(`   ❌ No MarketStats store available for ${property.address}`);
      return null;
    }
    
    // 3. Multi-family special case
    if ((property.units ?? 1) > 1) {
      const mf = await this.estimateMultiFamilyRent(
        property, 
        marketStats, 
        this.deriveBandFromStats.bind(this),
        this.widenForStaleness.bind(this),
        this.widenForFallback.bind(this)
      );
      if (mf) return logEstimate(mf);
    }
    
    // 4. MARKET_MODELED - RPSF × sqft
    const { stat: rpsf, fallbackDepth: d1, stalenessDays: s1 } = await marketStats.getWithFallback(
      'rent_rpsf', geo, property.bedrooms || 'all'
    );
    
    if (rpsf && rpsf.n_samples >= 3) {  // Require minimum samples
      const { stat: unitSqft } = await marketStats.getWithFallback(
        'unit_sqft', geo, property.bedrooms || 'all'
      );
      
      const sqft = property.sqft || unitSqft?.value || (550 + 250 * (property.bedrooms || 2));
      const point = rpsf.value * sqft;
      
      let band = this.deriveBandFromStats(point, rpsf.sigma, rpsf.n_samples);
      band = this.widenForStaleness(band, rpsf.updated_at);
      band = this.widenForFallback(band, d1);
      
      return logEstimate({
        point,
        band,
        confidence: 'MARKET_MODELED',  // Only for RPSF with good samples
        method: `rpsf:${geo.zip || geo.city || 'fallback'}:${property.bedrooms || 'x'}br`,
        provenance: {
          n_samples: rpsf.n_samples,
          sigma: rpsf.sigma,
          fallback_level: d1,
          staleness_days: s1
        },
        notes: property.sqft ? [] : ['sqft_estimated']
      });
    }
    
    // 5. HEURISTIC - Bedroom average (ALWAYS HEURISTIC)
    const { stat: avgRent, fallbackDepth: d2, stalenessDays: s2 } = await marketStats.getWithFallback(
      'avg_rent_bed', geo, property.bedrooms || 2
    );
    
    if (avgRent) {
      const point = avgRent.value;
      let band = this.deriveBandFromStats(point, avgRent.sigma, avgRent.n_samples);
      band = this.widenForStaleness(band, avgRent.updated_at);
      band = this.widenForFallback(band, d2);
      
      return logEstimate({
        point,
        band,
        confidence: 'HEURISTIC',  // ALWAYS HEURISTIC for avg_bed
        method: `avg_bed:${property.bedrooms || 'x'}br`,
        provenance: {
          n_samples: avgRent.n_samples,
          fallback_level: d2,
          staleness_days: s2
        },
        notes: ['bedroom_average_fallback']
      });
    }
    
    // 6. HEURISTIC - GRM (last resort)
    if (property.price && property.price > 0) {
      const { stat: grm, fallbackDepth: d3, stalenessDays: s3 } = await marketStats.getWithFallback(
        'grm', geo, 'all'
      );
      
      if (grm) {
        const point = property.price / grm.value / 12;
        let band = this.deriveBandFromStats(point, grm.sigma, grm.n_samples);
        band = this.widenForStaleness(band, grm.updated_at);
        band = this.widenForFallback(band, d3);
        band = [band[0] * 0.85, band[1] * 1.15]; // Extra 15% widening for GRM
        
        return logEstimate({
          point,
          band,
          confidence: 'HEURISTIC',
          method: `grm:${grm.value.toFixed(1)}x`,
          provenance: {
            n_samples: grm.n_samples,
            fallback_level: d3,
            staleness_days: s3
          },
          notes: ['grm_heuristic_verify_before_offers']
        });
      }
    }
    
    // 7. No estimate possible
    console.log(`   ❌ No rent estimate for ${property.address} - needs research`);
    rentDashboard.logEvaluation(property.address || 'Unknown', null);
    return null;
  }
  
  // Multi-family rent estimator (50 lines)
  private async estimateMultiFamilyRent(
    property: { zip?: string; city?: string; sqft?: number; units?: number; unit_mix?: Array<{ bed: number; count: number; sqft?: number }> },
    market: MarketStatsStore,
    deriveBandFromStats: (point: number, sigma?: number, n?: number) => [number,number],
    widenForStaleness: (b:[number,number], updatedAt?: string)=>[number,number],
    widenForFallback: (b:[number,number], depth:number)=>[number,number]
  ): Promise<RentEstimate | null> {
    const geo = { zip: property.zip, city: property.city };
    const compileUnit = async (bed: number, count: number, sqftHint?: number) => {
      const { stat: rpsf, fallbackDepth:d1 } = await market.getWithFallback("rent_rpsf", geo, bed);
      const { stat: uSq } = await market.getWithFallback("unit_sqft", geo, bed);
      if (!rpsf && !uSq) return null;
      const sqft = sqftHint ?? uSq?.value ?? (550 + 225*bed);
      const point = (rpsf?.value ?? 0) * sqft || (await market.getWithFallback("avg_rent_bed", geo, bed)).stat?.value || 0;
      if (!point) return null;
      let band = deriveBandFromStats(point, rpsf?.sigma, rpsf?.n_samples);
      band = widenForStaleness(band, rpsf?.updated_at);
      band = widenForFallback(band, d1);
      return { bed, count, point, band, src: rpsf ? "RPSF" : "AVG_BED" };
    };

    // Known mix
    if (property.unit_mix?.length) {
      const parts = (await Promise.all(property.unit_mix.map(u => compileUnit(u.bed, u.count, u.sqft)))).filter(Boolean) as any[];
      if (!parts.length) return null;
      const point = parts.reduce((s,p)=>s+p.point*p.count,0);
      const low  = parts.reduce((s,p)=>s+p.band[0]*p.count,0);
      const high = parts.reduce((s,p)=>s+p.band[1]*p.count,0);
      const heuristic = parts.some(p => p.src!=="RPSF");
      return {
        point, band:[low,high] as [number,number],
        confidence: heuristic ? "HEURISTIC" : "MARKET_MODELED",
        method: "unit_mix_sum",
        provenance: { source: [...new Set(parts.map(p=>p.src))].join(",") },
        notes: ["per-unit aggregation"]
      };
    }

    // Unknown mix → two scenarios: all 1BR vs all 2BR
    const u = Math.max(property.units ?? 2, 2);
    const s1 = await compileUnit(1, u);
    const s2 = await compileUnit(2, u);
    if (!s1 && !s2) return null;
    const point = ((s1?.point ?? 0)+(s2?.point ?? 0))/ (s1 && s2 ? 2 : 1);
    const lows  = [s1?.band?.[0]*u, s2?.band?.[0]*u].filter(Boolean) as number[];
    const highs = [s1?.band?.[1]*u, s2?.band?.[1]*u].filter(Boolean) as number[];
    const band: [number,number] = [Math.min(...lows), Math.max(...highs)];
    return {
      point, band,
      confidence: "HEURISTIC",
      method: "unit_mix_scenarios(1BR|2BR)",
      notes: ["ASSUMED_UNIT_MIX","report range; verify"]
    };
  }
  
  private underwrite(input: UWInput, dscrFloor: number): UWResult {
    // Normal calculations
    const monthlyRent = input.rentBand ? 
      (input.rentBand[0] + input.rentBand[1]) / 2 * input.units : 0;
    
    if (monthlyRent === 0) {
      return {
        NOI: 0,
        CapRate: 0,
        DSCR: 0,
        CoC: 0,
        cashNeeded: input.price * (input.downPct + input.closingPct),
        stress: { DSCR: 0, CoC: 0, passed: false },
        pass: false,
        reasons: ['No rent data']
      };
    }
    
    const annualRent = monthlyRent * 12;
    const vacancy = annualRent * input.vacancyPct;
    const EGI = annualRent - vacancy;
    
    const opex = input.taxes + input.insurance + 
                 (EGI * input.mgmtPct) + (EGI * input.maintPct) + 
                 input.utilitiesOwner;
    
    const NOI = EGI - opex;
    const CapRate = NOI / input.price;
    
    // Financing
    const loan = input.price * (1 - input.downPct);
    const monthlyPayment = this.calculatePayment(loan, input.rate, input.termYrs);
    const annualDS = monthlyPayment * 12;
    const DSCR = NOI / annualDS;
    
    const cashNeeded = input.price * (input.downPct + input.closingPct);
    const CoC = (NOI - annualDS) / cashNeeded;
    
    // REALISTIC stress test
    const stress = {
      rentDrop: 0.10,        // 10% rent drop
      rateIncrease: 0.0075,  // 75bps
      opexIncrease: 0.08,    // 8% expense increase
      vacancyIncrease: 0.03  // 3pp vacancy increase
    };
    
    const stressRent = monthlyRent * (1 - stress.rentDrop);
    const stressVacancy = Math.min(0.30, input.vacancyPct + stress.vacancyIncrease);
    const stressEGI = stressRent * 12 * (1 - stressVacancy);
    const stressOpex = opex * (1 + stress.opexIncrease);
    const stressNOI = stressEGI - stressOpex;
    
    const stressRate = input.rate + stress.rateIncrease;
    const stressPayment = this.calculatePayment(loan, stressRate, input.termYrs);
    const stressDSCR = stressNOI / (stressPayment * 12);
    const stressCoC = (stressNOI - stressPayment * 12) / cashNeeded;
    
    const stressPassed = stressDSCR >= dscrFloor;
    
    return {
      NOI,
      CapRate,
      DSCR,
      CoC,
      cashNeeded,
      stress: { 
        DSCR: stressDSCR, 
        CoC: stressCoC,
        passed: stressPassed
      },
      pass: stressPassed,  // Must pass stress!
      reasons: stressPassed ? [] : [`Failed stress: DSCR ${stressDSCR.toFixed(2)} < ${dscrFloor}`]
    };
  }
  
  private calculatePayment(loan: number, rate: number, years: number): number {
    const monthlyRate = rate / 12;
    const numPayments = years * 12;
    if (monthlyRate === 0) return loan / numPayments;
    
    const payment = loan * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                    (Math.pow(1 + monthlyRate, numPayments) - 1);
    return payment;
  }
  
  private getDynamicGates(price: number, median: number, gates: any) {
    const ratio = Math.max(0, price / median - 1);
    return {
      minCap: gates.base_cap_rate * (1 + gates.cap_rate_slope * ratio),
      minCoC: gates.base_coc * (1 + gates.coc_slope * ratio),
      minDSCR: Math.max(gates.base_dscr, 1.25 + 0.10 * ratio)
    };
  }
  
  private getDataAsks(property: any): string[] {
    const asks = [];
    if (!property.monthly_rent) asks.push('Current rent roll');
    if (!property.annual_taxes) asks.push('Annual property taxes');
    if (!property.annual_insurance) asks.push('Annual insurance cost');
    if (!property.hoa_fee) asks.push('HOA fees if applicable');
    return asks;
  }
  
  private getFailureReasons(uw: UWResult, gates: any, dscrFloor: number): string[] {
    const reasons = [];
    if (uw.CapRate < gates.minCap) {
      reasons.push(`Cap rate ${(uw.CapRate * 100).toFixed(2)}% < required ${(gates.minCap * 100).toFixed(2)}%`);
    }
    if (uw.CoC < gates.minCoC) {
      reasons.push(`CoC ${(uw.CoC * 100).toFixed(2)}% < required ${(gates.minCoC * 100).toFixed(2)}%`);
    }
    if (uw.DSCR < gates.minDSCR) {
      reasons.push(`DSCR ${uw.DSCR.toFixed(2)} < required ${gates.minDSCR.toFixed(2)}`);
    }
    if (!uw.stress.passed) {
      reasons.push(`Stress DSCR ${uw.stress.DSCR.toFixed(2)} < floor ${dscrFloor}`);
    }
    return reasons;
  }
  
  private async phase2LLM(qualified: Phase1Result[], strategy: any, marketResearch: ResearchResult[]): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];
    const maxEvals = Math.floor((this.EVAL_BUDGET_USD_MAX - this.evalBudgetUsed) / this.COST_PER_EVAL_USD);
    
    // Sort by score and take top candidates within budget
    const toEvaluate = qualified
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(maxEvals, qualified.length));
    
    console.log(`   Phase 2: LLM evaluating top ${toEvaluate.length} properties (budget allows ${maxEvals})`);
    
    for (const candidate of toEvaluate) {
      // HARD STOP at budget
      if (this.evalBudgetUsed >= this.EVAL_BUDGET_USD_MAX) {
        console.log(`   💰 BUDGET CAP HIT: $${this.evalBudgetUsed.toFixed(2)}. Stopping.`);
        break;
      }
      
      try {
        // LLM evaluation (narrative only, no numbers)
        const narrative = await this.getLLMNarrative(candidate, strategy, marketResearch);
        
        results.push({
          property: candidate.property,
          uw: candidate.uw!,
          pass: candidate.pass,
          score: candidate.score,
          llm_narrative: narrative,
          final_score: candidate.score * 0.6 + narrative.score * 0.4,
          reasons: candidate.reasons
        });
        
        this.evalBudgetUsed += this.COST_PER_EVAL_USD;
      } catch (error) {
        console.error(`   ❌ LLM evaluation failed for property:`, error);
        // Include without LLM score
        results.push({
          property: candidate.property,
          uw: candidate.uw!,
          pass: candidate.pass,
          score: candidate.score,
          llm_narrative: null,
          final_score: candidate.score,
          reasons: candidate.reasons
        });
      }
    }
    
    console.log(`   ✅ Phase 2 complete: ${results.length} evaluated, cost: $${this.evalBudgetUsed.toFixed(2)}`);
    return results;
  }
  
  private async getLLMNarrative(candidate: Phase1Result, strategy: any, marketResearch: ResearchResult[]) {
    const systemPrompt = `You are an expert real estate investment analyst providing narrative context for property evaluation.
DO NOT calculate any numbers - they have already been calculated deterministically.
Focus on qualitative factors, market positioning, and strategic fit.`;

    const userPrompt = `Provide narrative evaluation for this property that passed deterministic gates:

PROPERTY: ${candidate.property.address || 'Unknown Address'}
Price: $${candidate.property.price?.toLocaleString()}
Type: ${candidate.property.property_type}
Above Median: ${candidate.property.search_metadata?.above_median_pct}%

DETERMINISTIC METRICS (already calculated):
Cap Rate: ${(candidate.uw?.CapRate || 0 * 100).toFixed(2)}%
Cash-on-Cash: ${(candidate.uw?.CoC || 0 * 100).toFixed(2)}%
DSCR: ${candidate.uw?.DSCR?.toFixed(2)}
Stress Test: ${candidate.uw?.stress.passed ? 'PASSED' : 'FAILED'}

STRATEGY: ${strategy.name}

Evaluate:
1. Strategic fit with investor goals
2. Market positioning (above/below median context)
3. Risk factors specific to this property
4. Opportunities for value-add or optimization
5. Data quality and confidence level

Return JSON:
{
  "strategic_fit": "explanation",
  "market_position": "analysis of price relative to market",
  "key_risks": ["risk1", "risk2"],
  "opportunities": ["opp1", "opp2"],
  "confidence": "HIGH|MEDIUM|LOW",
  "score": 0.0-1.0,
  "recommendation": "brief recommendation"
}`;

    const response = await tracedLLMCall({
      agentName: 'property_evaluator_comprehensive',
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      model: 'gpt-4o',
      responseFormat: 'json_object'
    });
    
    return JSON.parse(response.content);
  }
}

// Export singleton instance
export const propertyEvaluatorComprehensive = new PropertyEvaluatorComprehensive();