/**
 * Property Evaluator Comprehensive - Two-Phase Evaluation System
 * Phase 1: Deterministic screening of ALL properties
 * Phase 2: LLM evaluation of qualified properties (budget-bounded)
 */

import { tracedLLMCall } from '../observability/llm-tracer';
import type { ResearchResult } from '../ai-agents/smart-research-agent';
import { databaseMarketStatsStore } from '../services/database-market-stats-store.js';
import { rentDashboard } from '../services/rent-estimation-dashboard.js';
import { researchLogger } from '../utils/research-logger.js';
import { UnitConfidence } from '../utils/property-types.js';
import type { MarketStatsStore } from '../services/database-market-stats-store.js';
import { strictExtraction } from '../services/strict-extraction.js';
import { enhancedExtraction } from '../services/extraction-adapter.js';
import { cityRentTables } from '../services/city-rent-tables.js';
import pLimit from 'p-limit';
import * as fs from 'fs';
import * as path from 'path';

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

// DUAL OUTPUT: Separate As-Is facts from Pro-Forma projections
interface DualUWResult {
  // AS-IS: What we KNOW from MLS/facts
  asIs: {
    price: number;
    units: number;
    yearBuilt?: number;
    sqft?: number;
    currentRent?: number;        // If explicitly stated in MLS
    taxes?: number;               // If available
    insurance?: number;           // If available
    hoa?: number;                // If available
    utilities?: number;           // If owner-paid utilities known
    sources: {                   // Citation for each fact
      price?: string;
      units?: string;
      rent?: string;
      taxes?: string;
      insurance?: string;
    };
  };
  
  // PRO-FORMA: What we PROJECT with assumptions
  proForma: {
    // Assumptions clearly labeled
    assumptions: {
      rentEstimate?: number;      // Our estimate if no actual rent
      rentMethod?: string;        // How we estimated (e.g., "market comps", "rent table")
      vacancy: number;            // Always an assumption
      management: number;         // % assumption
      maintenance: number;        // % assumption with age factor
      reserves: number;           // % assumption
      insurance?: number;         // If we had to estimate
      taxes?: number;            // If we had to estimate
    };
    
    // Financial projections
    financials: {
      GSR: number;               // Gross Scheduled Rent
      vacancy: number;           // Dollar amount
      EGI: number;              // Effective Gross Income
      opex: number;             // Total operating expenses
      NOI: number;              // Net Operating Income
      capRate: number;          // Cap rate
      
      // With financing
      loan: number;
      payment: number;
      DSCR: number;
      cashFlow: number;
      CoC: number;
      cashNeeded: number;
    };
    
    // Stress test results
    stress: {
      assumptions: {
        rentDrop: number;
        rateIncrease: number;
        opexIncrease: number;
        vacancyIncrease: number;
      };
      results: {
        NOI: number;
        DSCR: number;
        CoC: number;
        passed: boolean;
      };
    };
  };
  
  // Overall evaluation
  verdict: {
    pass: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasons: string[];
    dataQuality: string;  // e.g., "Complete", "Missing rent", "Missing expenses"
  };
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

interface Phase1Scores {
  uw_base: number;    // 0.35 weight - financial metrics composite
  loc_score: number;  // 0.20 weight - location quality
  ppsf_score: number; // 0.15 weight - price efficiency
  dom_score: number;  // 0.10 weight - market freshness
  age_score: number;  // 0.10 weight - property age
  tax_score: number;  // 0.05 weight - tax burden
  photo_score: number;// 0.05 weight - marketing quality
  composite: number;  // Weighted sum (0-1)
}

interface Phase1Result {
  property: any;
  uw: UWResult | null;
  pass: boolean;
  score: number;
  scores: Phase1Scores;
  reasons: string[];
  data_asks?: string[];
  rentEstimate?: RentEstimate;
  dualOutput?: DualUWResult | null;  // Add dual output for transparency
}

interface EvaluationResult {
  property: any;
  uw: UWResult | null;
  pass: boolean;
  score: number;
  scores: Phase1Scores;
  llm_narrative?: any;
  final_score: number;
  confidence?: number;
  reasons: string[];
  metadata?: {
    llm_success?: boolean;
    fallback?: boolean;
    response_time_ms?: number;
  };
}

// Scoring helper functions

// Safe division helper
const safeDiv = (a?: number, b?: number): number | null => 
  (isFinite(a!) && isFinite(b!) && b! > 0 ? a!/b! : null);

// Age score with half-life decay (newer = better)
function ageScore(yearBuilt?: number, now = new Date().getFullYear()): number {
  const age = Math.max(0, now - (yearBuilt ?? now));
  const HALF_LIFE = 40; // tune per market
  return Math.exp(-Math.log(2) * age / HALF_LIFE);
}

// PPSF score with clamped z-score
function ppsfScore(ppsf: number, marketMedian: number, marketStd: number): number {
  if (!isFinite(marketStd) || marketStd === 0) return 0.5;
  const z = (marketMedian - ppsf) / marketStd; // cheaper = higher z
  const zc = Math.max(-3, Math.min(3, z)); // clamp
  return 1 / (1 + Math.exp(-zc)); // logistic, cheaper -> higher score
}

// Tax score with bounded normalization
function taxScore(taxRatio: number, marketMedian: number, marketStd: number): number {
  if (!isFinite(marketStd) || marketStd === 0) return 0.5;
  const z = (marketMedian - taxRatio) / marketStd; // lower tax = higher z
  const zc = Math.max(-3, Math.min(3, z));
  return 1 / (1 + Math.exp(-zc));
}

// DOM score with price cut consideration
function domScore(dom?: number, hasRecentCut = false): number {
  if (dom == null) return 0.5;
  if (dom <= 7) return 0.9;      // Fresh listing
  if (dom <= 30) return 0.75;     // Still fresh
  if (dom <= 90) return hasRecentCut ? 0.55 : 0.4;  // Getting stale
  return hasRecentCut ? 0.45 : 0.25;  // Very stale
}

// Photo/marketing score
function photoScore(photoCount?: number): number {
  const count = photoCount ?? 0;
  return Math.min(count, 30) / 30; // cap at 30
}

// Location score (placeholder - should use pre-computed ZIP scores)
function locationScore(zip?: string): number {
  // TODO: Implement ZIP-based scoring from pre-computed data
  // For now, return neutral score
  return 0.5;
}

// Compute composite score from all sub-scores
function computeComposite(scores: Omit<Phase1Scores, 'composite'>): number {
  return Math.max(0, Math.min(1,
    0.35 * scores.uw_base +
    0.20 * scores.loc_score +
    0.15 * scores.ppsf_score +
    0.10 * scores.dom_score +
    0.10 * scores.age_score +
    0.05 * scores.tax_score +
    0.05 * scores.photo_score
  ));
}

export class PropertyEvaluatorComprehensive {
  private evalBudgetUsed = 0;
  private readonly EVAL_BUDGET_USD_MAX = 100;
  private readonly COST_PER_EVAL_USD = 0.10;
  private readonly limit = pLimit(6);  // Max 6 concurrent LLM calls
  private readonly REQUEST_TIMEOUT_MS = 20000;  // 20s per request
  private readonly MAX_PHASE_TIME_MS = 180000;  // 3 min wall clock
  private readonly RETRY_DELAYS = [500, 1500, 3500]; // Retry delays with jitter
  
  // Persistence tracking
  private evaluationSessionId: string = '';
  private evaluationLogPath: string = '';
  private evaluationSummaryPath: string = '';
  private evaluationProgressPath: string = '';
  private evaluationResults: any = {
    timestamp: '',
    strategy: null,
    totalProperties: 0,
    phase1Results: [],
    phase2Results: [],
    metrics: {
      phase1_duration_ms: 0,
      phase2_duration_ms: 0,
      total_duration_ms: 0,
      timeouts: 0,
      retries: 0,
      failures: 0
    }
  };
  
  async evaluateComprehensive(
    properties: any[],
    strategy: any,
    marketResearch: ResearchResult[],
    requirements: any & { marketStats?: MarketStatsStore }
  ): Promise<EvaluationResult[]> {
    const startTime = Date.now();
    
    // Initialize persistence
    this.initializePersistence(strategy);
    
    console.log(`📊 [COMPREHENSIVE] Evaluating ${properties.length} properties`);
    console.log(`   📁 Saving results to: ${this.evaluationLogPath}`);
    
    // Store initial data
    this.evaluationResults.timestamp = new Date().toISOString();
    this.evaluationResults.strategy = strategy;
    this.evaluationResults.totalProperties = properties.length;
    
    // PHASE 1: Deterministic screening of ALL
    console.log(`\n   🔍 Phase 1: Screening properties...`);
    const phase1Start = Date.now();
    const phase1Results = await this.phase1Screen(properties, strategy, requirements.marketStats);
    const qualified = phase1Results.filter(r => r.pass);
    const phase1Duration = Date.now() - phase1Start;
    
    console.log(`   ✅ Phase 1 Complete: ${qualified.length}/${properties.length} passed gates (${((qualified.length/properties.length)*100).toFixed(1)}%) in ${(phase1Duration/1000).toFixed(1)}s`);
    
    // Save Phase 1 results
    this.evaluationResults.phase1Results = phase1Results;
    this.evaluationResults.metrics.phase1_duration_ms = phase1Duration;
    this.saveResults();
    console.log(`   💾 Phase 1 results saved to disk`);
    
    // PHASE 2: LLM evaluation (budget-bounded)
    console.log(`\n   🤖 Phase 2: LLM evaluation of ${qualified.length} qualified properties`);
    console.log(`   ⚙️  Concurrency: 6 parallel | Timeout: 20s per property`);
    const phase2Start = Date.now();
    const llmResults = await this.phase2LLM(qualified, strategy, marketResearch);
    const phase2Duration = Date.now() - phase2Start;
    
    console.log(`   ✅ Phase 2 Complete: ${llmResults.length} properties evaluated in ${(phase2Duration/1000).toFixed(1)}s`);
    console.log(`   📊 Stats: ${llmResults.length} success, ${this.evaluationResults.metrics.timeouts} timeouts, ${this.evaluationResults.metrics.retries} retries`);
    
    // Save Phase 2 results
    this.evaluationResults.phase2Results = llmResults;
    this.evaluationResults.metrics.phase2_duration_ms = phase2Duration;
    this.evaluationResults.metrics.total_duration_ms = Date.now() - startTime;
    this.saveResults();
    
    // Final ranking
    const final = llmResults
      .sort((a, b) => b.final_score - a.final_score)
      .slice(0, 10);
    
    const evalCost = Math.min(this.evalBudgetUsed, this.EVAL_BUDGET_USD_MAX);
    console.log(`\n   💰 Evaluation cost: $${evalCost.toFixed(2)} | Budget: $${this.EVAL_BUDGET_USD_MAX}`);
    console.log(`   ✅ Full evaluation results saved to: ${this.evaluationLogPath}`);
    console.log(`   📄 Summary report: ${this.evaluationSummaryPath}`);
    
    // Generate summary report
    this.generateSummaryReport(final);
    
    return final;
  }
  
  private async phase1Screen(properties: any[], strategy: any, marketStats?: MarketStatsStore): Promise<Phase1Result[]> {
    // Helper functions
    const normalizePropertyType = (type: string): string => {
      const map: Record<string, string> = {
        'single family': 'SingleFamily',
        'single-family': 'SingleFamily',
        'sfh': 'SingleFamily',
        '2 family': 'Duplex',
        'duplex': 'Duplex',
        '3 family': 'Triplex',
        'triplex': 'Triplex',
        '4 family': 'Fourplex',
        'fourplex': 'Fourplex',
        'condo': 'Condo',
        'townhouse': 'Townhouse',
        'townhome': 'Townhouse'
      };
      return map[type?.toLowerCase().trim()] || type || 'Unknown';
    };
    
    const isNA = (v: unknown): boolean => {
      return v === 'N/A' || v === undefined || v === null;
    };
    
    // Initialize telemetry
    const telemetry = {
      total_evaluated: properties.length,
      blocked_by_type: 0,
      blocked_by_price: 0,
      blocked_by_dom: 0,
      blocked_by_cap_rate: 0,
      blocked_by_dscr: 0,
      blocked_by_stress: 0,
      blocked_by_cashflow: 0,
      blocked_by_negative_carry: 0,
      blocked_by_ppsf: 0,
      not_actionable_strategies: 0,
      sent_to_llm: 0,
      mf_dom_penalties: 0
    };
    
    // Check if strategy is actionable
    if (strategy.status === 'NOT_ACTIONABLE_UNDER_BUDGET' || strategy.skip_evaluation) {
      telemetry.not_actionable_strategies++;
      console.log(`   ⚠️ Strategy ${strategy.name} marked NOT_ACTIONABLE - skipping evaluation`);
      return [];
    }
    
    // Use evaluation_rules instead of dynamic_gates
    const rules = strategy.evaluation_rules;
    if (!rules) {
      telemetry.not_actionable_strategies++;
      console.warn('⚠️ No evaluation_rules in strategy - marking NEEDS_RESEARCH');
      strategy.status = 'NEEDS_RESEARCH';
      strategy.data_asks = ['evaluation_rules'];
      return [];
    }
    
    const allowedTypes = rules.allowed_property_types || [];
    const isMultiFamily = allowedTypes.some((t: string) => 
      ['Duplex', 'Triplex', 'Fourplex'].includes(t)
    );
    
    // Check for stress parameters if needed
    if (!isNA(rules.stress_dscr_floor) && !strategy.stress_params) {
      telemetry.not_actionable_strategies++;
      console.warn('⚠️ Stress DSCR required but no stress_params - marking NEEDS_RESEARCH');
      strategy.status = 'NEEDS_RESEARCH';
      strategy.data_asks = ['stress_test_parameters'];
      return [];
    }
    
    // Get market context
    const median = strategy.market_context?.median_price || 435000;
    const medianPpsf = strategy.market_context?.median_ppsf;
    
    // For backward compatibility with dynamic gates (will be removed)
    const gates = {
      base_cap_rate: isNA(rules.min_cap_rate_pct) ? 0.065 : rules.min_cap_rate_pct,
      base_coc: 0.08,  // Not used anymore
      base_dscr: isNA(rules.min_dscr_base) ? 1.25 : rules.min_dscr_base,
      cap_rate_slope: 0.10,
      coc_slope: 0.20,
      dscr_floor: isNA(rules.stress_dscr_floor) ? 1.20 : rules.stress_dscr_floor
    };
    
    const results = [];
    let passCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      const propertyAddress = property.address || property.fullAddress || 'Unknown';
      
      // FIRST CHECK: Property type gate
      const normalizedPropType = normalizePropertyType(property.propertyType || property.type || '');
      if (allowedTypes.length > 0 && !allowedTypes.includes(normalizedPropType)) {
        telemetry.blocked_by_type++;
        failCount++;
        console.log(`   [${i + 1}/${properties.length}] ✗ ${propertyAddress} - FAIL (type ${normalizedPropType} not allowed)`);
        results.push({
          property,
          uw: null as any,
          pass: false,
          score: 0,
          scores: {} as any,
          reasons: [`Property type ${normalizedPropType} not allowed for ${strategy.name}`],
          blocked_by: 'type_mismatch'
        } as any);
        continue;
      }
      
      // Progress logging every 10 properties or at start
      if (i === 0 || (i + 1) % 10 === 0) {
        console.log(`   [${i + 1}/${properties.length}] Screening properties... (${passCount} passed, ${failCount} failed so far)`);
      }
      // Check data completeness FIRST
      const uwInput = await this.toUWInput(property, strategy, marketStats);
      
      if (!uwInput) {
        failCount++;
        console.log(`   [${i + 1}/${properties.length}] ⚠️  ${propertyAddress} - INCOMPLETE (missing critical data)`);
        
        // Even without UW, compute what scores we can
        const scores: Phase1Scores = {
          uw_base: 0,
          loc_score: locationScore(property.zip || property.postalCode),
          ppsf_score: 0.5, // neutral without data
          dom_score: domScore(property.daysOnMarket, (property.priceHistory?.length ?? 0) > 0),
          age_score: ageScore(property.details?.yearBuilt),
          tax_score: 0.5, // neutral without data
          photo_score: photoScore(property.images?.length),
          composite: 0
        };
        scores.composite = computeComposite(scores);
        
        results.push({
          property,
          uw: null,
          pass: false,
          score: 0,
          scores,
          reasons: ['INCOMPLETE: Missing critical data (rent/taxes/price)'],
          data_asks: this.getDataAsks(property),
          dualOutput: null  // Add dual output field
        });
        continue;
      }
      
      // Get extracted facts for dual output
      // Use enhanced extraction for multi-family properties (with feature flag)
      const useEnhancedExtraction = process.env.USE_ENHANCED_EXTRACTION === 'true' && 
                                    property.propertyType?.includes('Family');
      
      // Prepare MLS data for extraction - carefully preserve description/remarks
      const rawDescription = property.rawData?.details?.description || property.rawData?.description;
      const rawRemarks = property.rawData?.details?.remarks || property.rawData?.remarks;
      
      // Don't spread property over rawData to avoid overriding description
      const mlsDataForExtraction = property.rawData ? {
        // Start with raw data (has all MLS fields)
        ...property.rawData,
        // Only override specific fields from enriched property  
        address: property.address,
        mlsNumber: property.mlsNumber,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        propertyType: property.propertyType,
        // Explicitly preserve description and remarks
        description: rawDescription || property.description,
        remarks: rawRemarks
      } : property;
      
      // Add detailed logging
      if (useEnhancedExtraction) {
        console.log(`[ENHANCED_EXTRACTION] Preparing data for ${property.mlsNumber || property.address}`);
        console.log(`[ENHANCED_EXTRACTION] Raw description: ${rawDescription ? rawDescription.length + ' chars' : 'MISSING'}`);
        console.log(`[ENHANCED_EXTRACTION] Raw remarks: ${rawRemarks ? rawRemarks.length + ' chars' : 'MISSING'}`);
        console.log(`[ENHANCED_EXTRACTION] Final description: ${mlsDataForExtraction.description ? mlsDataForExtraction.description.length + ' chars' : 'MISSING'}`);
        console.log(`[ENHANCED_EXTRACTION] Final remarks: ${mlsDataForExtraction.remarks ? mlsDataForExtraction.remarks.length + ' chars' : 'MISSING'}`);
        
        // Log first 500 chars of description if available
        if (mlsDataForExtraction.description) {
          console.log(`[ENHANCED_EXTRACTION] Description preview: "${mlsDataForExtraction.description.substring(0, 500)}..."`);
        }
      }
      
      const extracted = useEnhancedExtraction 
        ? await enhancedExtraction.extractFromMLS(mlsDataForExtraction)
        : await strictExtraction.extractFromMLS(mlsDataForExtraction);
      
      // Use DUAL underwrite for transparency
      const dualResult = this.underwriteDual(property, uwInput, gates.dscr_floor, extracted);
      
      // Log dual output for multi-family properties to show transparency
      if (uwInput.units > 1) {
        console.log(`   📊 [DUAL OUTPUT] ${propertyAddress}:`);
        console.log(`      AS-IS (Facts): ${uwInput.units} units, $${property.price}`);
        if (dualResult.asIs.currentRent) {
          console.log(`      - Current rent: $${dualResult.asIs.currentRent}/mo (${dualResult.asIs.sources.rent})`);
        }
        console.log(`      PRO-FORMA (Projections):`);
        console.log(`      - Rent estimate: $${dualResult.proForma.assumptions.rentEstimate || dualResult.asIs.currentRent}/mo`);
        console.log(`      - Method: ${dualResult.proForma.assumptions.rentMethod || 'Actual rent'}`);
        console.log(`      - NOI: $${dualResult.proForma.financials.NOI.toFixed(0)}/yr`);
        console.log(`      - DSCR: ${dualResult.proForma.financials.DSCR.toFixed(2)}`);
        console.log(`      - Confidence: ${dualResult.verdict.confidence} (${dualResult.verdict.dataQuality})`);
      }
      
      // Convert dual result to standard UW for compatibility
      const uw: UWResult = {
        NOI: dualResult.proForma.financials.NOI,
        CapRate: dualResult.proForma.financials.capRate,
        DSCR: dualResult.proForma.financials.DSCR,
        CoC: dualResult.proForma.financials.CoC,
        cashNeeded: dualResult.proForma.financials.cashNeeded,
        stress: dualResult.proForma.stress.results,
        pass: dualResult.verdict.pass,
        reasons: dualResult.verdict.reasons
      };
      
      // Apply gates in order with immediate telemetry
      const failures = [];
      
      // Price gate (should be checked earlier but double-check)
      if (property.price < strategy.buy_box?.price_band_usd?.min || 
          property.price > strategy.buy_box?.price_band_usd?.max) {
        telemetry.blocked_by_price++;
        failures.push(`Price $${property.price} outside range`);
      }
      
      // Financial gates for MF
      if (!isNA(rules.min_cap_rate_pct) && uw.CapRate < rules.min_cap_rate_pct) {
        telemetry.blocked_by_cap_rate++;
        failures.push(`Cap rate ${(uw.CapRate*100).toFixed(1)}% < ${(rules.min_cap_rate_pct*100).toFixed(1)}%`);
      }
      
      if (!isNA(rules.min_dscr_base) && uw.DSCR < rules.min_dscr_base) {
        telemetry.blocked_by_dscr++;
        failures.push(`DSCR ${uw.DSCR.toFixed(2)} < ${rules.min_dscr_base}`);
      }
      
      if (!isNA(rules.stress_dscr_floor) && uw.stress.DSCR < rules.stress_dscr_floor) {
        telemetry.blocked_by_stress++;
        failures.push(`Stress DSCR ${uw.stress.DSCR.toFixed(2)} < ${rules.stress_dscr_floor}`);
      }
      
      if (!isNA(rules.min_monthly_cashflow_usd)) {
        const minCashflow = property.units > 1 ? 
          rules.min_monthly_cashflow_usd * property.units : 
          rules.min_monthly_cashflow_usd;
        
        if (uw.MonthlyCashflow < minCashflow) {
          telemetry.blocked_by_cashflow++;
          failures.push(`Monthly cashflow $${uw.MonthlyCashflow} < $${minCashflow}`);
        }
      }
      
      // DOM HANDLING - DIFFERENT FOR SFH vs MF
      let domPenalty = 0;
      if (!isNA(rules.dom_max_days) && property.daysOnMarket) {
        if (isMultiFamily) {
          // MF: DOM is SOFT signal - affects score, not pass/fail
          if (property.daysOnMarket > rules.dom_max_days) {
            const staleDays = property.daysOnMarket - rules.dom_max_days;
            domPenalty = Math.min(0.30, 0.15 + (staleDays / 100) * 0.15);
            telemetry.mf_dom_penalties++;
            // Log but DON'T fail
            console.log(`      ⚠️ MF DOM penalty: ${property.daysOnMarket} days (${(domPenalty*100).toFixed(0)}% score reduction)`);
          }
        } else {
          // SFH: DOM is HARD gate - blocks unless recent price cut
          if (property.daysOnMarket > rules.dom_max_days) {
            const hasRecentPriceCut = property.priceHistory?.some((pc: any) => 
              pc.date && (Date.now() - new Date(pc.date).getTime()) < 30 * 24 * 60 * 60 * 1000
            );
            
            if (!hasRecentPriceCut) {
              telemetry.blocked_by_dom++;
              failures.push(`DOM ${property.daysOnMarket} > ${rules.dom_max_days} days (stale SFH)`);
            }
          }
        }
      }
      
      // SFH specific gates
      if (!isNA(rules.negative_carry_tolerance_usd)) {
        const tolerance = -Math.abs(rules.negative_carry_tolerance_usd);
        if (uw.MonthlyCashflow < tolerance) {
          telemetry.blocked_by_negative_carry++;
          failures.push(`Monthly loss $${uw.MonthlyCashflow} exceeds tolerance $${tolerance}`);
        }
      }
      
      // PPSF CEILING - MUST HAVE MEDIAN OR FAIL
      if (!isNA(rules.ppsf_ceiling_vs_median_pct)) {
        if (!medianPpsf) {
          // IMMEDIATE FAILURE - need research
          telemetry.not_actionable_strategies++;
          failCount++;
          console.log(`   [${i + 1}/${properties.length}] ✗ ${propertyAddress} - NEEDS_RESEARCH (PPSF ceiling check requires median)`);
          results.push({
            property,
            uw,
            pass: false,
            score: 0,
            scores: {} as any,
            status: 'NEEDS_RESEARCH',
            data_asks: ['sfh_ppsf_median'],
            reasons: ['PPSF ceiling check requires median_ppsf from research']
          } as any);
          continue;
        }
        const ceiling = medianPpsf * (1 + rules.ppsf_ceiling_vs_median_pct);
        const ppsf = property.price / (property.sqft || 1);
        if (ppsf > ceiling) {
          telemetry.blocked_by_ppsf++;
          failures.push(`PPSF $${ppsf.toFixed(0)} > ceiling $${ceiling.toFixed(0)}`);
        }
      }
      
      const pass = failures.length === 0;
      if (pass) {
        telemetry.sent_to_llm++;
      }
      
      // Compute all normalized scores (including DOM penalty for MF)
      const hasRecentCut = (property.priceHistory?.length ?? 0) > 0;
      const ppsf = safeDiv(property.price, property.sqft) ?? median / 1500; // fallback
      const taxRatio = safeDiv(property.annual_taxes, property.price) ?? 0.012;
      
      // For market stats, use strategy context or defaults
      const marketPpsfMedian = strategy.market_context?.ppsf_median ?? median / 1500;
      const marketPpsfStd = strategy.market_context?.ppsf_std ?? marketPpsfMedian * 0.15;
      const marketTaxMedian = strategy.market_context?.tax_median ?? 0.012;
      const marketTaxStd = strategy.market_context?.tax_std ?? 0.003;
      
      // Normalize UW score to 0-1
      const uwBase = Math.max(0, Math.min(1, 
        0.5 * Math.min(uw.CoC / 0.15, 1) + 
        0.3 * Math.min(uw.CapRate / 0.10, 1) + 
        0.2 * Math.min(uw.DSCR / 2.0, 1)
      ));
      
      const scores: Phase1Scores = {
        uw_base: uwBase,
        loc_score: locationScore(property.zip || property.postalCode),
        ppsf_score: ppsfScore(ppsf, marketPpsfMedian, marketPpsfStd),
        dom_score: domScore(property.daysOnMarket, hasRecentCut) * (1 - domPenalty), // Apply MF penalty if any
        age_score: ageScore(property.details?.yearBuilt),
        tax_score: taxScore(taxRatio, marketTaxMedian, marketTaxStd),
        photo_score: photoScore(property.images?.length),
        composite: 0
      };
      scores.composite = computeComposite(scores);
      
      // Track pass/fail
      if (pass) {
        passCount++;
        console.log(`   [${i + 1}/${properties.length}] ✓ ${propertyAddress} - PASS`);
      } else {
        failCount++;
        if (i < 10) {  // Only log first 10 failures to avoid spam
          const mainReason = failures[0] || 'Unknown reason';
          console.log(`   [${i + 1}/${properties.length}] ✗ ${propertyAddress} - FAIL (${mainReason})`);
        }
      }
      
      results.push({
        property,
        uw,
        pass,
        score: 0.5 * uw.CoC + 0.3 * uw.CapRate + 0.2 * uw.DSCR, // Legacy score
        scores,
        reasons: pass ? ['Passes all gates'] : failures,
        rentEstimate: uwInput.rentEstimate, // Pass along rent estimate
        dualOutput: dualResult  // Include dual output for transparency
      });
    }
    
    // Log telemetry summary
    console.log(`
   📊 Phase 1 Evaluation Gate Summary:
      Type mismatches: ${telemetry.blocked_by_type}
      Price outside range: ${telemetry.blocked_by_price}
      DOM blocks (SFH only): ${telemetry.blocked_by_dom}
      DOM penalties (MF soft): ${telemetry.mf_dom_penalties}
      Cap rate fails: ${telemetry.blocked_by_cap_rate}
      DSCR fails: ${telemetry.blocked_by_dscr}
      Stress test fails: ${telemetry.blocked_by_stress}
      Cashflow insufficient: ${telemetry.blocked_by_cashflow}
      Negative carry excessive: ${telemetry.blocked_by_negative_carry}
      PPSF above ceiling: ${telemetry.blocked_by_ppsf}
      Not actionable: ${telemetry.not_actionable_strategies}
      → Sent to LLM: ${telemetry.sent_to_llm}/${telemetry.total_evaluated}
    `);
    
    console.log(`   Phase 1 Final: ${passCount} passed, ${failCount} failed`);
    return results;
  }
  
  private async toUWInput(property: any, strategy: any, marketStats?: MarketStatsStore): Promise<(UWInput & { rentEstimate?: RentEstimate; yearBuilt?: number }) | null> {
    // Step 1: Extract facts from MLS data first
    // Use enhanced extraction for multi-family properties (with feature flag)
    const useEnhancedExtraction = process.env.USE_ENHANCED_EXTRACTION === 'true' && 
                                  property.propertyType?.includes('Family');
    
    // Prepare MLS data for extraction - merge enriched property with rawData
    const mlsDataForExtraction = property.rawData ? {
      ...property.rawData,  // Use raw API data which has remarks field
      ...property,          // Override with enriched fields like address, price, etc.
      remarks: property.rawData?.details?.remarks || property.rawData?.remarks,  // Ensure remarks is available
      description: property.rawData?.details?.description || property.rawData?.description || property.rawData?.details?.remarks || property.rawData?.remarks  // Also map to description
    } : property;
    
    const extracted = useEnhancedExtraction 
      ? await enhancedExtraction.extractFromMLS(mlsDataForExtraction)
      : await strictExtraction.extractFromMLS(mlsDataForExtraction);
    
    // Step 2: Get rent using extracted facts and frozen tables
    const rentData = await this.estimateRentWithExtraction(property, strategy, extracted, marketStats);
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
    
    // Use extracted units (never hallucinate)
    let effectiveUnits = extracted.units?.value || property.units || 1;
    
    // Log extracted units for transparency
    if (effectiveUnits > 1) {
      console.log(`   💰 [UNITS] ${property.address}: ${effectiveUnits} units`);
      if (extracted.units?.breakdown) {
        extracted.units.breakdown.forEach(u => {
          console.log(`      Unit ${u.unit}: ${u.beds}BR/${u.baths}BA`);
        });
      }
      if (extracted.units?.citation) {
        console.log(`      Source: "${extracted.units.citation.substring(0, 60)}..."`);
      }
    }
    
    return {
      price: property.price,
      units: effectiveUnits,
      rentBand: rentData.band,
      rentConfidence: rentData.confidence === 'MARKET_REPORTED' || rentData.confidence === 'COMPS_INFERRED' ? 'MARKET_DATA' : 'ESTIMATED',
      taxes: extracted.taxes?.value || property.annual_taxes || property.price * 0.012, // Use extracted or fallback
      insurance: property.annual_insurance || property.price * 0.004, // 0.4% fallback
      mgmtPct: normalizeRate(0.08, 'mgmtPct'),
      maintPct: normalizeRate(0.05, 'maintPct'),
      vacancyPct: normalizeRate(strategy.market_context?.vacancy || 0.05, 'vacancyPct'),
      rate: normalizeRate(strategy.market_context?.rate || 0.065, 'rate'),
      downPct: normalizeRate(0.20, 'downPct'),
      closingPct: normalizeRate(0.035, 'closingPct'),
      termYrs: 30,
      utilitiesOwner: 0,  // Conservative: assume tenant pays
      rentEstimate: rentData,  // Include the full rent estimate
      yearBuilt: extracted.yearBuilt?.value || property.details?.yearBuilt || property.yearBuilt
    };
  }
  
  // New rent estimation using extraction and tables
  private async estimateRentWithExtraction(
    property: any,
    strategy: any,
    extracted: any,
    marketStats?: MarketStatsStore
  ): Promise<RentEstimate | null> {
    const city = property.city || strategy.market_context?.city || 'Unknown';
    const address = property.address || property.fullAddress || 'Unknown';
    
    // Check if we have frozen rent tables for this city
    const hasTable = cityRentTables.hasTableForCity(city);
    
    if (!hasTable) {
      console.log(`   ⚠️ No rent table for ${city} - falling back to legacy estimation`);
      return this.estimateRent(property, strategy, marketStats);
    }
    
    // Determine property condition (from extraction or default to B)
    const condition = extracted.condition?.value || 'B';
    
    // Calculate rent based on unit mix
    if (extracted.units?.breakdown && extracted.units.breakdown.length > 0) {
      // We have exact unit mix - use it!
      console.log(`   📊 [RENT] Using extracted unit mix for ${address}`);
      
      let totalRent = 0;
      const unitRents: any[] = [];
      
      for (const unit of extracted.units.breakdown) {
        const unitType = unit.beds === 0 ? 'STUDIO' : 
                        unit.beds === 1 ? '1BR' :
                        unit.beds === 2 ? '2BR' :
                        unit.beds === 3 ? '3BR' : '2BR'; // Default to 2BR for 4+
        
        const rent = cityRentTables.getRent(city, unitType, condition);
        if (!rent) {
          console.log(`   ⚠️ No rent for ${unitType} in ${city}`);
          return this.estimateRent(property, strategy, marketStats);
        }
        
        totalRent += rent;
        unitRents.push({ unit: unit.unit, type: unitType, rent });
        console.log(`      Unit ${unit.unit}: ${unitType} @ $${rent}/mo (condition ${condition})`);
      }
      
      // CRITICAL FIX: Return TOTAL rent for multi-family, not average
      return {
        point: totalRent,  // TOTAL rent for all units combined
        band: [totalRent * 0.95, totalRent * 1.05], // Tight band for deterministic
        confidence: 'MARKET_MODELED',
        method: `frozen_table:${city}:unit_mix`,
        provenance: {
          source: 'city_rent_table',
          n_samples: extracted.units.breakdown.length,
          per_unit_average: totalRent / extracted.units.breakdown.length
        },
        notes: [`Total rent: $${totalRent}/mo for ${extracted.units.breakdown.length} units`]
      };
    }
    
    // No unit mix - use property type or bedroom count
    const units = extracted.units?.value || property.units || 1;
    
    if (units > 1) {
      // Multi-family without unit mix - conservative estimate
      console.log(`   ⚠️ Multi-family without unit mix - using conservative 2BR estimate`);
      const rent2BR = cityRentTables.getRent(city, '2BR', condition);
      
      if (!rent2BR) {
        return this.estimateRent(property, strategy, marketStats);
      }
      
      // CRITICAL FIX: For multi-family, return TOTAL rent (per-unit × units)
      const totalRent = rent2BR * units;
      console.log(`   💰 Multi-family: ${units} units × $${rent2BR}/unit = $${totalRent}/mo total`);
      
      return {
        point: totalRent,  // TOTAL rent, not per-unit!
        band: [totalRent * 0.90, totalRent * 1.10], // Wider band for uncertainty
        confidence: 'HEURISTIC',
        method: `frozen_table:${city}:assumed_2BR×${units}`,
        provenance: {
          source: 'city_rent_table',
          units: units,
          per_unit_rent: rent2BR
        },
        notes: [`Unit mix unknown - assumed ${units} × 2BR units @ $${rent2BR}/unit`]
      };
    }
    
    // Single family - use bedroom count
    const bedrooms = property.bedrooms || 2;
    const unitType = bedrooms === 0 ? 'STUDIO' :
                    bedrooms === 1 ? '1BR' :
                    bedrooms === 2 ? '2BR' :
                    bedrooms >= 3 ? '3BR' : '2BR';
    
    const rent = cityRentTables.getRent(city, unitType, condition);
    
    if (!rent) {
      console.log(`   ⚠️ No rent for ${unitType} in ${city}`);
      return this.estimateRent(property, strategy, marketStats);
    }
    
    console.log(`   💰 [RENT] ${address}: ${unitType} @ $${rent}/mo (condition ${condition})`);
    
    return {
      point: rent,
      band: [rent * 0.95, rent * 1.05],
      confidence: 'MARKET_MODELED',
      method: `frozen_table:${city}:${unitType}`,
      provenance: {
        source: 'city_rent_table'
      }
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
  
  // New dual-output underwrite function
  private underwriteDual(
    property: any,
    input: UWInput & { yearBuilt?: number },
    dscrFloor: number,
    extracted?: any  // Extracted facts from MLS
  ): DualUWResult {
    // AS-IS: Gather facts from property and extraction
    const asIs = {
      price: property.price,
      units: input.units,
      yearBuilt: property.yearBuilt || input.yearBuilt,
      sqft: property.sqft,
      currentRent: extracted?.currentRent?.value,
      taxes: extracted?.taxes?.value || property.annual_taxes,
      insurance: extracted?.insurance?.value || property.annual_insurance,
      hoa: property.hoa_fee,
      utilities: extracted?.utilities?.value,
      sources: {
        price: 'MLS listing',
        units: extracted?.units?.citation || 'Property type analysis',
        rent: extracted?.currentRent?.citation,
        taxes: extracted?.taxes?.citation || (property.annual_taxes ? 'MLS data' : undefined),
        insurance: extracted?.insurance?.citation || (property.annual_insurance ? 'MLS data' : undefined)
      }
    };

    // PRO-FORMA: Build projections
    const monthlyRent = input.rentBand ? 
      (input.rentBand[0] + input.rentBand[1]) / 2 * input.units : 
      (asIs.currentRent || 0);
    
    const assumptions = {
      rentEstimate: !asIs.currentRent ? monthlyRent : undefined,
      rentMethod: !asIs.currentRent ? input.rentConfidence : undefined,
      vacancy: input.vacancyPct,
      management: input.mgmtPct,
      maintenance: input.maintPct,
      reserves: 0.05,
      insurance: !asIs.insurance ? input.insurance : undefined,
      taxes: !asIs.taxes ? input.taxes : undefined
    };

    // Calculate financials
    const GSR = monthlyRent * 12;
    const vacancyAmount = GSR * assumptions.vacancy;
    const EGI = GSR - vacancyAmount;
    
    // Age-based maintenance adjustment
    const propertyAge = asIs.yearBuilt ? (new Date().getFullYear() - asIs.yearBuilt) : 30;
    let maintMultiplier = 1.0;
    if (propertyAge > 50) maintMultiplier = 1.5;
    else if (propertyAge > 30) maintMultiplier = 1.25;
    else if (propertyAge > 20) maintMultiplier = 1.1;
    
    // Calculate expenses
    const expenses = {
      taxes: asIs.taxes || input.taxes,
      insurance: asIs.insurance || input.insurance,
      management: EGI * assumptions.management,
      maintenance: EGI * assumptions.maintenance * maintMultiplier,
      utilities: asIs.utilities || input.utilitiesOwner,
      reserves: EGI * assumptions.reserves,
      hoa: asIs.hoa || 0
    };
    
    const opex = Object.values(expenses).reduce((sum, val) => sum + (val || 0), 0);
    const NOI = EGI - opex;
    const capRate = NOI / asIs.price;
    
    // Financing calculations
    const loan = asIs.price * (1 - input.downPct);
    const payment = this.calculatePayment(loan, input.rate, input.termYrs);
    const annualDS = payment * 12;
    const DSCR = NOI / annualDS;
    const cashNeeded = asIs.price * (input.downPct + input.closingPct);
    const cashFlow = NOI - annualDS;
    const CoC = cashFlow / cashNeeded;
    
    // Stress test
    const stressAssumptions = {
      rentDrop: 0.10,
      rateIncrease: 0.0075,
      opexIncrease: 0.08,
      vacancyIncrease: 0.03
    };
    
    const stressRent = monthlyRent * (1 - stressAssumptions.rentDrop);
    const stressVacancy = Math.min(0.30, assumptions.vacancy + stressAssumptions.vacancyIncrease);
    const stressEGI = stressRent * 12 * (1 - stressVacancy);
    const stressOpex = opex * (1 + stressAssumptions.opexIncrease);
    const stressNOI = stressEGI - stressOpex;
    const stressRate = input.rate + stressAssumptions.rateIncrease;
    const stressPayment = this.calculatePayment(loan, stressRate, input.termYrs);
    const stressDSCR = stressNOI / (stressPayment * 12);
    const stressCoC = (stressNOI - stressPayment * 12) / cashNeeded;
    const stressPassed = stressDSCR >= dscrFloor;
    
    // Determine confidence
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    let dataQuality = 'Missing data';
    
    if (asIs.currentRent && asIs.taxes && asIs.insurance) {
      confidence = 'HIGH';
      dataQuality = 'Complete';
    } else if (asIs.currentRent || (asIs.taxes && asIs.insurance)) {
      confidence = 'MEDIUM';
      dataQuality = asIs.currentRent ? 'Missing expenses' : 'Missing rent';
    } else {
      confidence = 'LOW';
      dataQuality = 'Missing rent and expenses';
    }
    
    // Build result
    return {
      asIs,
      proForma: {
        assumptions,
        financials: {
          GSR,
          vacancy: vacancyAmount,
          EGI,
          opex,
          NOI,
          capRate,
          loan,
          payment,
          DSCR,
          cashFlow,
          CoC,
          cashNeeded
        },
        stress: {
          assumptions: stressAssumptions,
          results: {
            NOI: stressNOI,
            DSCR: stressDSCR,
            CoC: stressCoC,
            passed: stressPassed
          }
        }
      },
      verdict: {
        pass: stressPassed && DSCR >= dscrFloor,
        confidence,
        reasons: stressPassed ? [] : [`Failed stress test: DSCR ${stressDSCR.toFixed(2)} < ${dscrFloor}`],
        dataQuality
      }
    };
  }
  
  private underwrite(input: UWInput & { yearBuilt?: number }, dscrFloor: number): UWResult {
    // Calculate monthly rent
    // IMPORTANT: rentBand represents PER-UNIT rent for all property types
    // For multi-family: multiply by detected units
    // For single-family: units = 1
    const monthlyRent = input.rentBand ? 
      (input.rentBand[0] + input.rentBand[1]) / 2 * input.units : 0;
    
    // Log multi-family rent calculations for transparency
    if (input.units > 1) {
      console.log(`🏘️ Multi-family rent calculation:`, {
        units: input.units,
        rentBandPerUnit: input.rentBand,
        avgRentPerUnit: input.rentBand ? (input.rentBand[0] + input.rentBand[1]) / 2 : 0,
        totalMonthlyRent: monthlyRent
      });
    }
    
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
    
    // LINE-ITEM EXPENSES with age-based adjustments
    const propertyAge = input.yearBuilt ? (new Date().getFullYear() - input.yearBuilt) : 30;
    
    // Age affects maintenance costs (NOT rent!)
    let maintMultiplier = 1.0;
    if (propertyAge > 50) maintMultiplier = 1.5;      // 50% higher maintenance
    else if (propertyAge > 30) maintMultiplier = 1.25; // 25% higher maintenance
    else if (propertyAge > 20) maintMultiplier = 1.1;  // 10% higher maintenance
    
    // Line-item expense calculation
    const expenses = {
      taxes: input.taxes,                              // Actual or estimated
      insurance: input.insurance,                      // Actual or estimated
      management: EGI * input.mgmtPct,                // % of EGI
      maintenance: EGI * input.maintPct * maintMultiplier, // Age-adjusted
      utilities: input.utilitiesOwner,                // Owner-paid utilities
      reserves: EGI * 0.05,                          // 5% reserves (new!)
      total: 0
    };
    
    expenses.total = expenses.taxes + expenses.insurance + expenses.management + 
                    expenses.maintenance + expenses.utilities + expenses.reserves;
    
    const opex = expenses.total;
    
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
    const phaseStart = Date.now();
    const tasks: Promise<EvaluationResult>[] = [];
    const stats = { scheduled: 0, completed: 0, timeouts: 0, retries: 0, failures: 0 };
    let lastProgressLog = Date.now();
    
    // Evaluate ALL qualified properties (no limit)
    const toEvaluate = qualified.sort((a, b) => b.scores.composite - a.scores.composite);
    
    console.log(`   Phase 2: LLM evaluating ALL ${toEvaluate.length} qualified properties with concurrency 6`);
    
    // Schedule with wall clock limit
    for (const candidate of toEvaluate) {
      // STOP scheduling after wall clock limit
      if (Date.now() - phaseStart > this.MAX_PHASE_TIME_MS) {
        console.log(`   ⏰ Wall clock limit reached after scheduling ${stats.scheduled} tasks`);
        break;
      }
      
      stats.scheduled++;
      const propertyAddress = candidate.property.address || candidate.property.fullAddress || 'Unknown';
      console.log(`   [${stats.scheduled}/${toEvaluate.length}] Evaluating: ${propertyAddress} - Started`);
      
      const task = this.limit(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);
        const taskStart = Date.now();
        
        try {
          const payload = this.buildLLMPayload(candidate, strategy);
          
          // Retry logic with exponential backoff
          let narrative = null;
          for (let attempt = 0; attempt <= this.RETRY_DELAYS.length; attempt++) {
            try {
              // Add jitter to retry delay
              if (attempt > 0) {
                const delay = this.RETRY_DELAYS[attempt - 1] + Math.random() * 500;
                await new Promise(r => setTimeout(r, delay));
                stats.retries++;
              }
              
              narrative = await this.getLLMNarrative(payload, strategy, marketResearch, { signal: controller.signal });
              break; // Success
              
            } catch (err: any) {
              // Don't retry timeouts or client errors
              if (err?.name === 'AbortError') {
                stats.timeouts++;
                throw err;
              }
              if (err?.response?.status && err.response.status < 500 && err.response.status !== 429) {
                throw err;
              }
              
              // Max retries reached
              if (attempt === this.RETRY_DELAYS.length) {
                stats.failures++;
                throw err;
              }
              
              console.log(JSON.stringify({
                ctx: 'phase2',
                event: 'retry',
                id: candidate.property?.mlsNumber ?? candidate.property?.id,
                attempt: attempt + 1,
                status: err?.response?.status
              }));
            }
          }
          
          clearTimeout(timeout);
          
          // Validate and normalize scores
          const uw = Math.max(0, Math.min(1, candidate.scores?.composite ?? 0));
          const fit = Math.max(0, Math.min(1, Number(narrative?.fit?.score_0_1) || 0));
          const confidence = Math.max(0, Math.min(1, Number(narrative?.est_confidence_0_1) || 0.5));
          const finalScore = 0.6 * uw + 0.4 * fit;
          
          stats.completed++;
          const elapsed = Date.now() - taskStart;
          console.log(`   [${stats.completed}/${stats.scheduled}] ✓ ${propertyAddress} - Score: ${(finalScore * 100).toFixed(1)} (${(elapsed/1000).toFixed(1)}s)`);
          
          // Log progress every 10 completions
          if (stats.completed % 10 === 0) {
            const totalElapsed = Date.now() - phaseStart;
            const avgTime = totalElapsed / stats.completed;
            const remaining = stats.scheduled - stats.completed;
            const eta = remaining * avgTime;
            console.log(`   Progress: ${stats.completed}/${stats.scheduled} complete (${((stats.completed/stats.scheduled)*100).toFixed(1)}%) | ETA: ${(eta/1000).toFixed(0)}s`);
          }
          
          // Save result incrementally
          this.saveIncrementalResult({
            property: propertyAddress,
            score: finalScore,
            elapsed: elapsed
          });
          
          return {
            property: candidate.property,
            uw: candidate.uw,
            pass: candidate.pass,
            score: candidate.score,
            scores: candidate.scores,
            llm_narrative: narrative,
            final_score: finalScore,
            confidence: confidence,
            reasons: candidate.reasons,
            metadata: { 
              llm_success: true,
              response_time_ms: elapsed
            }
          };
          
        } catch (error: any) {
          clearTimeout(timeout);
          const errorType = error?.name === 'AbortError' ? 'timeout' : 'error';
          
          if (errorType === 'timeout') {
            stats.timeouts++;
            console.log(`   [${stats.scheduled}] ⏱️  ${propertyAddress} - TIMEOUT after 20s`);
          } else {
            stats.failures++;
            console.log(`   [${stats.scheduled}] ❌ ${propertyAddress} - FAILED: ${error.message?.substring(0, 50)}`);
          }
          
          stats.completed++;
          
          console.log(JSON.stringify({
            ctx: 'phase2',
            event: 'request_failed',
            id: candidate.property?.mlsNumber ?? candidate.property?.id,
            type: errorType,
            ms: Date.now() - taskStart
          }));
          
          return this.buildUWOnlyResult(candidate);
        }
      });
      
      tasks.push(task);
    }
    
    // Collect all results (partials included)
    const settled = await Promise.allSettled(tasks);
    const results = settled.map((r, i) => 
      r.status === 'fulfilled' ? r.value : this.buildUWOnlyResult(toEvaluate[i])
    );
    
    // Phase summary logging
    const llmSuccess = results.filter(r => r.metadata?.llm_success).length;
    const uwOnly = results.length - llmSuccess;
    
    console.log(JSON.stringify({
      ctx: 'phase2',
      event: 'phase_complete',
      qualified: qualified.length,
      scheduled: stats.scheduled,
      completed: results.length,
      with_llm: llmSuccess,
      fallback_uw_only: uwOnly,
      timeouts: stats.timeouts,
      retries: stats.retries,
      failures: stats.failures,
      duration_ms: Date.now() - phaseStart
    }));
    
    this.evalBudgetUsed = stats.scheduled * this.COST_PER_EVAL_USD;
    
    // Return sorted by final score
    return results.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
  }
  
  private buildUWOnlyResult(candidate: Phase1Result): EvaluationResult {
    const uw = Math.max(0, Math.min(1, candidate.scores?.composite ?? 0));
    return {
      property: candidate.property,
      uw: candidate.uw,
      pass: candidate.pass,
      score: candidate.score,
      scores: candidate.scores,
      llm_narrative: null,
      final_score: uw, // Pure UW score, no LLM component
      confidence: 0.7, // Lower confidence without LLM
      reasons: candidate.reasons,
      metadata: { 
        llm_success: false,
        fallback: true 
      }
    };
  }

  private buildLLMPayload(candidate: Phase1Result, strategy: any): any {
    const property = candidate.property;
    const hasRecentCut = (property.priceHistory?.length ?? 0) > 0;
    const pid = property?.mlsNumber ?? property?.id ?? `p${Date.now()}`;
    
    return {
      property: {
        id: pid,
        address: { 
          city: property.city, 
          neighborhood: property.address?.neighborhood 
        },
        type: property.property_type || property.details?.style,
        beds: property.bedrooms,
        baths: property.bathrooms,
        sqft: property.sqft,
        year_built: property.details?.yearBuilt,
        lot_sqft: property.lot?.size
      },
      phase1_metrics: {
        // Financial
        cap_rate: candidate.uw?.CapRate ?? null,
        coc: candidate.uw?.CoC ?? null,
        dscr: candidate.uw?.DSCR ?? null,
        noi: candidate.uw?.NOI ?? null,
        rent_estimate: candidate.rentEstimate?.point ?? null,
        rent_confidence: candidate.rentEstimate?.confidence ?? 'UNKNOWN',
        
        // Market positioning
        ppsf: safeDiv(property.price, property.sqft),
        ppsf_market_median: strategy.market_context?.ppsf_median,
        dom: property.daysOnMarket,
        tax_ratio: safeDiv(property.annual_taxes, property.price),
        
        // All normalized scores
        scores: candidate.scores
      },
      market_context: {
        median_price: strategy.market_context?.median_price,
        above_median_pct: ((property.price - (strategy.market_context?.median_price ?? property.price)) / property.price * 100),
        trend_notes: strategy.market_context?.trends ?? ""
      },
      marketing: {
        photo_count: property.images?.length || 0,
        has_virtual_tour: !!property.details?.virtualTour,
        days_on_market: property.daysOnMarket
      },
      // FULL DESCRIPTION - NO TRUNCATION
      description: property.details?.description || "",
      listing: {
        list_date: property.listDate,
        original_price: property.originalPrice,
        price_reductions: property.priceHistory || [],
        has_recent_cut: hasRecentCut
      },
      investor_profile: {
        goal: strategy.objective,
        min_dscr: strategy.financing?.min_dscr ?? 1.25,
        min_coc: strategy.financing?.min_coc ?? 0.10,
        strategy: strategy.name
      }
    };
  }

  private async getLLMNarrative(payload: any, strategy: any, marketResearch: ResearchResult[], options: { signal: AbortSignal }) {
    const systemPrompt = `You are a real estate investment agent analyzing properties for your buyer client. 
You're preparing a professional investment analysis report that will be shared with the buyer.
The financial metrics have been calculated. Focus on property-specific insights, opportunities, and considerations.
Be professional but honest - call out red flags while maintaining objectivity.`;

    const userPrompt = `Analyze this investment property for your buyer client's investment report:

PROPERTY: ${payload.property.address?.city || 'Unknown'} - ${payload.property.type || 'Property'}
Price: $${payload.phase1_metrics.cap_rate ? (payload.phase1_metrics.noi / payload.phase1_metrics.cap_rate).toLocaleString() : 'N/A'}
Type: ${payload.property.type}
Above Median: ${payload.market_context.above_median_pct?.toFixed(1)}%

KEY INVESTMENT METRICS (already calculated):
Cap Rate: ${(payload.phase1_metrics.cap_rate * 100).toFixed(2)}%
Cash-on-Cash: ${(payload.phase1_metrics.coc * 100).toFixed(2)}%
DSCR: ${payload.phase1_metrics.dscr?.toFixed(2)}
Rent Estimate: $${payload.phase1_metrics.rent_estimate?.toLocaleString()} (${payload.phase1_metrics.rent_confidence})

STRATEGY: ${payload.investor_profile.strategy}

Full Property Data:
${JSON.stringify(payload, null, 2)}

Provide professional analysis for the buyer covering:
1. Investment thesis - why this property fits their goals
2. Value opportunities - specific improvements to enhance returns
3. Risk assessment - material concerns that need investigation
4. Market positioning - how it compares to other investments
5. Next steps - specific due diligence items

Return JSON:
{
  "summary": "2-3 sentence executive summary",
  "pros": ["max 3 key advantages"],
  "cons": ["max 3 concerns or limitations"],
  "hidden_value": ["renovation/ADU/rent optimization opportunities"],
  "risks": ["material red flags from description/age/DOM"],
  "fit": {
    "score_0_1": 0.0,
    "why": "1-2 sentence justification"
  },
  "actions_next_7_days": ["specific due diligence steps"],
  "est_confidence_0_1": 0.0
}

If uncertain about any aspect, set est_confidence_0_1 lower and explain in the summary.`;

    const response = await tracedLLMCall({
      agentName: 'property_evaluator_comprehensive',
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      model: 'gpt-4o',
      responseFormat: 'json_object',
      signal: options.signal
    });
    
    // Parse with one repair attempt
    try {
      return JSON.parse(response.content);
    } catch (e) {
      const repaired = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      try {
        return JSON.parse(repaired);
      } catch (e2) {
        console.log(JSON.stringify({
          ctx: 'phase2',
          event: 'json_parse_failed',
          content_preview: response.content.substring(0, 100)
        }));
        return null;
      }
    }
  }
  
  // Persistence methods
  private initializePersistence(strategy: any): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.evaluationSessionId = timestamp;
    
    const logsDir = path.join(process.cwd(), 'evaluation-logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    this.evaluationLogPath = path.join(logsDir, `evaluation-${timestamp}.json`);
    this.evaluationSummaryPath = path.join(logsDir, `evaluation-${timestamp}-summary.txt`);
    this.evaluationProgressPath = path.join(logsDir, `evaluation-${timestamp}-progress.log`);
    
    // Initialize progress log
    fs.writeFileSync(this.evaluationProgressPath, `Evaluation started at ${new Date().toISOString()}\n`);
    fs.writeFileSync(this.evaluationProgressPath, `Strategy: ${strategy?.name || 'Unknown'}\n\n`, { flag: 'a' });
  }
  
  private saveResults(): void {
    try {
      fs.writeFileSync(this.evaluationLogPath, JSON.stringify(this.evaluationResults, null, 2));
    } catch (error) {
      console.error('Failed to save evaluation results:', error);
    }
  }
  
  private saveIncrementalResult(result: any): void {
    try {
      const logEntry = `${new Date().toISOString()} - ${result.property}: Score ${result.score.toFixed(3)} (${result.elapsed}ms)\n`;
      fs.appendFileSync(this.evaluationProgressPath, logEntry);
    } catch (error) {
      console.error('Failed to save incremental result:', error);
    }
  }
  
  private generateSummaryReport(topProperties: EvaluationResult[]): void {
    try {
      const summary = [];
      summary.push('=' .repeat(80));
      summary.push('PROPERTY EVALUATION SUMMARY REPORT');
      summary.push('=' .repeat(80));
      summary.push(`Generated: ${new Date().toISOString()}`);
      summary.push(`Strategy: ${this.evaluationResults.strategy?.name || 'Unknown'}`);
      summary.push('');
      
      summary.push('EVALUATION METRICS');
      summary.push('-'.repeat(40));
      summary.push(`Total Properties Evaluated: ${this.evaluationResults.totalProperties}`);
      summary.push(`Phase 1 Passed: ${this.evaluationResults.phase1Results.filter((r: any) => r.pass).length}`);
      summary.push(`Phase 2 Completed: ${this.evaluationResults.phase2Results.length}`);
      summary.push(`Total Duration: ${(this.evaluationResults.metrics.total_duration_ms / 1000).toFixed(1)}s`);
      summary.push(`  - Phase 1: ${(this.evaluationResults.metrics.phase1_duration_ms / 1000).toFixed(1)}s`);
      summary.push(`  - Phase 2: ${(this.evaluationResults.metrics.phase2_duration_ms / 1000).toFixed(1)}s`);
      summary.push(`Timeouts: ${this.evaluationResults.metrics.timeouts}`);
      summary.push(`Retries: ${this.evaluationResults.metrics.retries}`);
      summary.push(`Failures: ${this.evaluationResults.metrics.failures}`);
      summary.push('');
      
      summary.push('TOP 10 PROPERTIES');
      summary.push('-'.repeat(40));
      topProperties.slice(0, 10).forEach((prop, i) => {
        const address = prop.property?.address || prop.property?.fullAddress || 'Unknown';
        const score = (prop.final_score * 100).toFixed(1);
        const cashFlow = prop.uw?.cashNeeded ? `$${prop.uw.cashNeeded.toFixed(0)}` : 'N/A';
        summary.push(`${i + 1}. ${address}`);
        summary.push(`   Score: ${score}/100 | Cash Needed: ${cashFlow}`);
        summary.push('');
      });
      
      summary.push('=' .repeat(80));
      summary.push(`Full results saved to: ${this.evaluationLogPath}`);
      
      fs.writeFileSync(this.evaluationSummaryPath, summary.join('\n'));
    } catch (error) {
      console.error('Failed to generate summary report:', error);
    }
  }
}

// Export singleton instance
export const propertyEvaluatorComprehensive = new PropertyEvaluatorComprehensive();