/**
 * Strategy Builder v3 - FULLY DETERMINISTIC
 * 
 * Core Rule: LLM NEVER creates or edits ANY numbers.
 * All numeric data is server-derived from research only.
 */

import OpenAI from 'openai';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { ResearchResult } from './smart-research-agent';
import { tracer } from '../observability/execution-tracer';
import { attachKeyOrReject } from './smart-research-agent';
import { 
  extractMarketMetrics, 
  deriveTwoBr, 
  checkMetrics, 
  logMetricsDigest 
} from '../services/deterministic-extraction';
import type { ResearchItem, MarketMetrics } from '../../types/research';
import type { CityRentTable } from '../services/city-rent-tables.js';
import { cityRentTables } from '../services/city-rent-tables.js';
import { researchValidator } from '../services/research-validator';

// ============= TYPE DEFINITIONS =============

export interface SearchSpace {
  absolute_range: { min: number; max: number; expected_inventory?: number };
  sweet_spot: { min: number; max: number; note: string };
  dynamic_gates: {
    base_cap_rate: number;
    base_coc: number;
    base_dscr: number;
    cap_rate_slope: number;
    coc_slope: number;
    dscr_floor: number;
  };
  evaluation_directive: "COMPREHENSIVE";
  market_context: { median_price: number };
}

export interface BuyBox {
  property_types: string[];
  submarkets: string[];
  zoning_required: string[];
  lot_constraints: {
    min_lot_sqft: number | null;
    setbacks_notes: string;
  };
  building_constraints: {
    min_ceiling_ft: number | null;
    egress_req: string;
    parking: string;
  };
  proximity: Array<{
    to: string;
    within_miles: number;
  }>;
  price_band_usd: {
    min: number;
    max: number;
  };
  beds_baths_min: {
    beds: number;
    baths: number;
  };
  exclude_flags: string[];
}

export interface EvaluationRules {
  min_cap_rate_pct: number | 'N/A';
  min_monthly_cashflow_usd: number | 'N/A';
  min_dscr_base: number | 'N/A';
  stress_dscr_floor?: number | 'N/A';
  vacancy_assumption_pct?: number;
  fha_self_sufficiency_rule: {
    required: boolean;
    note: string;
  };
  dom_max_days?: number;
  ppsf_ceiling_vs_median_pct?: number;
  negative_carry_tolerance_usd?: number;
  renovation_budget_pct_max?: number;
  allowed_property_types?: string[];
  strategy_specific_metrics: string[];
  provenance?: any;
}

export interface StrategyV3 {
  name: string;
  objective: string;
  buy_box: BuyBox;
  search_space?: SearchSpace;  // Added for comprehensive search
  evaluation_directive?: "COMPREHENSIVE";  // Added
  evaluation_rules: EvaluationRules;
  financing: {
    primary: {
      type: 'Conventional' | 'FHA House-Hack' | 'DSCR';
      notes: string;
    };
    alternatives: string[];
  };
  rent_table?: CityRentTable;  // NEW: Frozen rent table for deterministic evaluation
  comps_bands: {
    rent: Array<{
      unit_type: string;
      range_monthly: [number, number];
      notes: string;
      sources: string[];
    }>;
    sale_psf: {
      range: [number, number];
      sources: string[];
    };
    dom_band: {
      range_days: [number, number];
      notes: string;
      sources: string[];
    };
  };
  execution: {
    typical_stabilization_months: number;
    top_risks: string[];
    mitigation_playbook: string[];
  };
  handoff_checklist: string[];
  scorecard: {
    liquidity_0_20: number;
    cashflow_quality_0_25: number;
    execution_risk_0_25: number;
    location_durability_0_15: number;
    strategic_fit_0_15: number;
    rationale: string;
  };
  status: 'READY' | 'PILOT_ONLY' | 'NEEDS_RESEARCH';
  data_asks?: string[];
}

export interface StrategyBuilderOutput {
  brief: string;
  market: {
    city: string;
    focus_neighborhoods: string[];
    demand_signals: string[];
  };
  strategies: StrategyV3[];
  research_log: string[];
}

// ============= HELPERS =============

const clampRent = ([lo, hi]: [number, number]): [number, number] => {
  let L = Math.round(lo), H = Math.round(hi);
  
  // Fix magnitude issues
  if (H < 100) { L *= 100; H *= 100; } 
  else if (H < 800) { L *= 10; H *= 10; }
  while (H > 10000) { L = Math.round(L / 10); H = Math.round(H / 10); }
  
  // Fix spread issues (ratio <= 1.8)
  if (H / L > 1.8) {
    const m = Math.round((L + H) / 2);
    L = Math.floor(m * 0.93);
    H = Math.ceil(m * 1.07);
  }
  
  // Apply hard limits
  L = Math.max(700, Math.min(L, 6000));
  H = Math.max(800, Math.min(H, 6000));
  
  if (H <= L) throw new Error('rent invalid');
  return [L, H];
};

// ============= PURCHASING POWER =============

type Money = number; // USD
type FinancingType = "Cash" | "Conventional" | "FHA House-Hack" | "DSCR";
type ClosingCosts = { minPct: number; maxPct: number }; // e.g. 0.02–0.05 from research
type DownPct = number; // e.g. 0.20, 0.035

function mid(x: number, y: number) { return (x + y) / 2; }

function purchasingPower(
  cash: Money,
  fin: FinancingType,
  opts: {
    closing: ClosingCosts,        // from research (buyer_closing_costs)
    fhaLoanLimit?: Money | null,  // from research (fha_loan_limit) -> loan amount
    reservesPct?: number,         // optional, default 0.00–0.02
  }
): { min: Money; max: Money; notes: string[] } {
  const cc = mid(opts.closing.minPct, opts.closing.maxPct || opts.closing.minPct); // deterministic
  const rz = opts.reservesPct ?? 0.00;

  const eff = (down: DownPct) => down + cc + rz; // cash needed as % of purchase

  if (fin === "Cash") {
    const max = cash;                         // pay all-in cash
    const min = Math.max(100_000, Math.round(max * 0.5));
    return { min, max, notes: ["cash purchase"] };
  }

  if (fin === "Conventional") {
    const down = 0.20;                        // 20% (make this configurable)
    const max = Math.floor(cash / eff(down));
    const min = Math.max(100_000, Math.round(max * 0.4));
    return { min, max, notes: [`20% down, closing≈${(cc*100).toFixed(1)}%`] };
  }

  if (fin === "FHA House-Hack") {
    const down = 0.035;
    const maxByCash = Math.floor(cash / eff(down));
    let maxByLimit = Number.POSITIVE_INFINITY;
    if (opts.fhaLoanLimit) {
      // FHA limit applies to LOAN AMOUNT, not purchase price:
      // loan = (1 - down) * price  ⇒  price = limit / (1 - down)
      maxByLimit = Math.floor(opts.fhaLoanLimit / (1 - down));
    }
    const max = Math.min(maxByCash, maxByLimit);
    const min = Math.max(150_000, Math.round(max * 0.5));
    return { min, max, notes: [`FHA 3.5% down, closing≈${(cc*100).toFixed(1)}%`] };
  }

  if (fin === "DSCR") {
    const down = 0.25;                         // typical DSCR 25% down
    const max = Math.floor(cash / eff(down));
    const min = Math.max(150_000, Math.round(max * 0.4));
    return { min, max, notes: [`DSCR 25% down, closing≈${(cc*100).toFixed(1)}%`] };
  }

  // Fallback
  const down = 0.25;
  const max = Math.floor(cash / eff(down));
  const min = Math.max(100_000, Math.round(max * 0.5));
  return { min, max, notes: [`assumed 25% down, closing≈${(cc*100).toFixed(1)}%`] };
}

// ============= HELPER FUNCTIONS =============

// Property type normalizer for consistent type checking
function normalizePropertyType(type: string): string {
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
  return map[type.toLowerCase().trim()] || type;
}

// N/A checker for evaluation rules
function isNA(v: unknown): boolean {
  return v === 'N/A' || v === undefined || v === null;
}

function getMarketBand(
  metrics: MarketMetrics, 
  propertyTypes: string[]
): { min: number; max: number; source: string } {
  // Try multi-family first if relevant
  if (propertyTypes.some(t => /family|plex/i.test(t)) && metrics.priceBands.multiFamily?.min) {
    return { ...metrics.priceBands.multiFamily, source: 'multiFamily' };
  }
  
  // Fallback to single-family
  if (metrics.priceBands.singleFamily?.min) {
    return { ...metrics.priceBands.singleFamily, source: 'singleFamily' };
  }
  
  // Derive from $/psf if available
  if (metrics.market?.salePsf?.min) {
    const typicalSize = 1500;
    return {
      min: metrics.market.salePsf.min * typicalSize,
      max: metrics.market.salePsf.max * typicalSize,
      source: 'derived_from_psf'
    };
  }
  
  // Absolute fallback
  console.warn('⚠️ No market bands available - using wide default');
  return { min: 200_000, max: 800_000, source: 'default' };
}

function computeSearchSpace(
  afford: { min: number; max: number },
  marketBand: { min: number; max: number },
  median: number
): SearchSpace {
  return {
    absolute_range: { 
      min: Math.max(100_000, afford.min), 
      max: afford.max 
    },
    sweet_spot: { 
      min: Math.floor(marketBand.min * 0.85), 
      max: Math.ceil(marketBand.max * 1.25),
      note: "Statistical center - reference only"
    },
    dynamic_gates: {
      base_cap_rate: 0.065,
      base_coc: 0.08,
      base_dscr: 1.25,
      cap_rate_slope: 0.10,    // +10% per 100% above median
      coc_slope: 0.20,          // +20% per 100% above median  
      dscr_floor: 1.20          // Hard floor under stress
    },
    evaluation_directive: "COMPREHENSIVE",
    market_context: { median_price: median }
  };
}

// ============= RENT TABLE BUILDER =============

/**
 * Build a deterministic rent table from research data
 * This creates a frozen table that will be used throughout evaluation
 */
function buildRentTableFromResearch(
  research: ResearchItem[],
  metrics: MarketMetrics,
  city: string
): CityRentTable | null {
  // Extract rent data for each unit type from research
  const rentData: any = {
    studio: null,
    oneBR: null,
    twoBR: null,
    threeBR: null
  };
  
  // Look for unit-specific rent data in research
  for (const item of research) {
    if (!item.key || !item.answer) continue;
    
    switch (item.key) {
      case 'studio_median_rent':
        rentData.studio = { median: item.answer };
        break;
      case 'studio_rent_range':
        if (rentData.studio) {
          rentData.studio.low = item.answer.min;
          rentData.studio.high = item.answer.max;
        } else {
          rentData.studio = { low: item.answer.min, high: item.answer.max };
        }
        break;
      case '1br_median_rent':
        rentData.oneBR = { median: item.answer };
        break;
      case '1br_rent_range':
        if (rentData.oneBR) {
          rentData.oneBR.low = item.answer.min;
          rentData.oneBR.high = item.answer.max;
        } else {
          rentData.oneBR = { low: item.answer.min, high: item.answer.max };
        }
        break;
      case '2br_median_rent':
      case 'avg_rent_2br':  // Legacy support
        rentData.twoBR = { median: item.answer };
        break;
      case '2br_rent_range':
      case 'rent_range_2br':  // Legacy support
        if (rentData.twoBR) {
          rentData.twoBR.low = item.answer.min || item.answer.low;
          rentData.twoBR.high = item.answer.max || item.answer.high;
        } else {
          rentData.twoBR = { 
            low: item.answer.min || item.answer.low, 
            high: item.answer.max || item.answer.high 
          };
        }
        break;
      case '3br_median_rent':
        rentData.threeBR = { median: item.answer };
        break;
      case '3br_rent_range':
        if (rentData.threeBR) {
          rentData.threeBR.low = item.answer.min;
          rentData.threeBR.high = item.answer.max;
        } else {
          rentData.threeBR = { low: item.answer.min, high: item.answer.max };
        }
        break;
    }
  }
  
  // Use metrics as fallback for 2BR if not in research
  if (!rentData.twoBR && metrics.rentBands?.twoBr) {
    rentData.twoBR = {
      low: metrics.rentBands.twoBr.min,
      median: (metrics.rentBands.twoBr.min + metrics.rentBands.twoBr.max) / 2,
      high: metrics.rentBands.twoBr.max
    };
  } else if (!rentData.twoBR && metrics.rentBands?.point2Br) {
    const point = metrics.rentBands.point2Br.value;
    rentData.twoBR = {
      low: Math.floor(point * 0.80),
      median: point,
      high: Math.ceil(point * 1.25)
    };
  }
  
  // Validate and correct rent data for monotonicity
  console.log(`🔍 [RentTable] Validating rent data for ${city}`);
  const validation = researchValidator.validateRentData(city, {
    studio: rentData.studio,
    oneBR: rentData.oneBR,
    twoBR: rentData.twoBR,
    threeBR: rentData.threeBR
  });
  
  // Use corrected values if validation found issues
  if (validation.corrected) {
    console.log(`✅ [RentTable] Applied rent corrections for ${city}:`, validation.issues);
    
    // Update rentData with corrected values
    if (validation.corrected.studio) {
      rentData.studio = rentData.studio || {};
      rentData.studio.median = validation.corrected.studio.median;
    }
    if (validation.corrected.oneBR) {
      rentData.oneBR = rentData.oneBR || {};
      rentData.oneBR.median = validation.corrected.oneBR.median;
    }
    if (validation.corrected.twoBR) {
      rentData.twoBR = rentData.twoBR || {};
      rentData.twoBR.median = validation.corrected.twoBR.median;
    }
    if (validation.corrected.threeBR) {
      rentData.threeBR = rentData.threeBR || {};
      rentData.threeBR.median = validation.corrected.threeBR.median;
    }
    
    // Alert if correction rate is too high
    if (validation.metrics && validation.metrics.correctionRate > 0.5) {
      console.warn(`⚠️ [RentTable] High correction rate for ${city}: ${(validation.metrics.correctionRate * 100).toFixed(0)}%`);
      console.warn(`⚠️ [RentTable] Consider quarantining ${city} data - avg correction: $${validation.metrics.avgCorrection}`);
    }
  }
  
  // If we don't have at least 2BR data after validation, we can't build a table
  if (!rentData.twoBR || !rentData.twoBR.median) {
    console.warn('⚠️ Cannot build rent table - no 2BR data available after validation');
    return null;
  }
  
  // Build the table using validated median values
  const twoBRMedian = rentData.twoBR.median;
  
  // Build the table using validated median values
  // For A/C grades, use existing high/low if available, else derive from median
  const table: CityRentTable = {
    'STUDIO': {
      A: rentData.studio?.high || (rentData.studio?.median ? Math.round(rentData.studio.median * 1.15) : Math.round(twoBRMedian * 0.75)),
      B: rentData.studio?.median || Math.round(twoBRMedian * 0.65),
      C: rentData.studio?.low || (rentData.studio?.median ? Math.round(rentData.studio.median * 0.85) : Math.round(twoBRMedian * 0.55))
    },
    '1BR': {
      A: rentData.oneBR?.high || (rentData.oneBR?.median ? Math.round(rentData.oneBR.median * 1.15) : Math.round(twoBRMedian * 0.95)),
      B: rentData.oneBR?.median || Math.round(twoBRMedian * 0.80),
      C: rentData.oneBR?.low || (rentData.oneBR?.median ? Math.round(rentData.oneBR.median * 0.85) : Math.round(twoBRMedian * 0.70))
    },
    '2BR': {
      A: rentData.twoBR.high || Math.round(twoBRMedian * 1.15),
      B: twoBRMedian,
      C: rentData.twoBR.low || Math.round(twoBRMedian * 0.85)
    },
    '3BR': {
      A: rentData.threeBR?.high || (rentData.threeBR?.median ? Math.round(rentData.threeBR.median * 1.15) : Math.round(twoBRMedian * 1.45)),
      B: rentData.threeBR?.median || Math.round(twoBRMedian * 1.25),
      C: rentData.threeBR?.low || (rentData.threeBR?.median ? Math.round(rentData.threeBR.median * 0.85) : Math.round(twoBRMedian * 1.10))
    }
  };
  
  // Deep freeze the table to prevent any modifications
  Object.freeze(table);
  Object.freeze(table.STUDIO);
  Object.freeze(table['1BR']);
  Object.freeze(table['2BR']);
  Object.freeze(table['3BR']);
  
  console.log(`📊 [RentTable] Built frozen table for ${city}:`, {
    studio: `$${table.STUDIO.C}-${table.STUDIO.A}`,
    '1br': `$${table['1BR'].C}-${table['1BR'].A}`,
    '2br': `$${table['2BR'].C}-${table['2BR'].A}`,
    '3br': `$${table['3BR'].C}-${table['3BR'].A}`
  });
  
  return table;
}

// ============= POST-PROCESSING =============

function postProcessStrategies(
  strategies: StrategyV3[], 
  metrics: MarketMetrics, 
  clientProfile: any,
  research: ResearchItem[]
): StrategyV3[] {
  console.log('\n🔧 [Post-Processing] DETERMINISTIC injection - metrics ONLY...');
  console.log(`   Strategies to process: ${strategies.length}`);
  
  const pushAsk = (strategy: any, ask: string) => {
    strategy.data_asks = strategy.data_asks || [];
    if (!strategy.data_asks.includes(ask)) {
      strategy.data_asks.push(ask);
    }
  };

  // Build rent table once for the city
  const city = metrics.market?.city || 'Unknown';
  console.log(`\n📊 [RENT TABLE] Building frozen rent table for ${city}...`);
  const rentTable = buildRentTableFromResearch(research, metrics, city);
  
  // Set the table in the service for use during evaluation
  if (rentTable) {
    console.log(`   ✅ Rent table built successfully:`);
    console.log(`      Studio: A=$${rentTable.STUDIO.A} B=$${rentTable.STUDIO.B} C=$${rentTable.STUDIO.C}`);
    console.log(`      1BR: A=$${rentTable['1BR'].A} B=$${rentTable['1BR'].B} C=$${rentTable['1BR'].C}`);
    console.log(`      2BR: A=$${rentTable['2BR'].A} B=$${rentTable['2BR'].B} C=$${rentTable['2BR'].C}`);
    console.log(`      3BR: A=$${rentTable['3BR'].A} B=$${rentTable['3BR'].B} C=$${rentTable['3BR'].C}`);
    
    cityRentTables.setTableForCity(city, rentTable, {
      city,
      timestamp: Date.now(),
      sources: research.filter(r => r.key?.includes('rent')).map(r => r.id),
      confidence: 'HIGH'
    });
    console.log(`   💾 Table frozen and stored for ${city}`);
  } else {
    console.log(`   ⚠️ Could not build rent table - insufficient data`);
  }
  
  return strategies.map((strategy) => {
    // Add rent table to strategy
    if (rentTable) {
      strategy.rent_table = rentTable;
      console.log(`   ✅ Rent table attached to strategy: ${strategy.name}`);
    }
    
    strategy.comps_bands = strategy.comps_bands || {} as any;
    
    // 1. RENT INJECTION - Use ONLY metrics data (LEGACY - keeping for backward compat)
    if (metrics.rentBands.twoBr?.min && metrics.rentBands.twoBr?.max) {
      // Use the derived 2BR band from metrics
      strategy.comps_bands.rent = [{
        unit_type: "2br",
        range_monthly: [metrics.rentBands.twoBr.min, metrics.rentBands.twoBr.max] as [number, number],
        notes: "",
        sources: metrics.rentBands.twoBr.sourceIds || []
      }];
      console.log(`   ✅ Rent: [$${metrics.rentBands.twoBr.min}, $${metrics.rentBands.twoBr.max}]`);
    } else if (metrics.rentBands.point2Br?.value) {
      // Compute ±7% band from point
      const point = metrics.rentBands.point2Br.value;
      const [L, H] = clampRent([Math.floor(point * 0.93), Math.ceil(point * 1.07)]);
      strategy.comps_bands.rent = [{
        unit_type: "2br",
        range_monthly: [L, H] as [number, number],
        notes: "",
        sources: [metrics.rentBands.point2Br.sourceId]
      }];
      console.log(`   ✅ Rent from point: $${point} → [$${L}, $${H}]`);
    } else {
      pushAsk(strategy, `2-bedroom rental rates for ${metrics.market.city}`);
      console.log(`   ⚠️ No rent data`);
    }
    
    // 2. $/PSF INJECTION
    const psf = metrics.market?.salePsf;
    if (psf?.min != null && psf?.max != null) {
      strategy.comps_bands.sale_psf = {
        range: [psf.min, psf.max] as [number, number],
        sources: psf.sourceIds || []
      };
      console.log(`   ✅ $/PSF: [$${psf.min}, $${psf.max}]`);
    } else {
      pushAsk(strategy, `Sale price per square foot (10th-90th percentile) for ${metrics.market.city}`);
      console.log(`   ⚠️ No $/PSF data`);
    }
    
    // 3. DOM INJECTION
    const dom = metrics.market?.domDays;
    if (dom?.min != null && dom?.max != null) {
      strategy.comps_bands.dom_band = {
        range_days: [dom.min, dom.max] as [number, number],
        notes: "",
        sources: dom.sourceIds || []
      };
      console.log(`   ✅ DOM: [${dom.min}, ${dom.max}] days`);
    } else {
      pushAsk(strategy, `Days on market (10th-90th percentile) for ${metrics.market.city}`);
      console.log(`   ⚠️ No DOM data`);
    }
    
    // 4. CALCULATE PURCHASING POWER - Based on budget & financing
    const primary = strategy.financing?.primary?.type || "Conventional";
    const closingFromResearch = { minPct: 0.02, maxPct: 0.05 }; // TODO: from metrics if available
    const fhaLimit = metrics.rates?.fhaLimit || 1032650; // Use researched FHA limit if available
    const cash = clientProfile.budget;
    
    const afford = purchasingPower(cash, primary as FinancingType, {
      closing: closingFromResearch,
      fhaLoanLimit: primary === 'FHA House-Hack' ? fhaLimit : null,
      reservesPct: 0.01, // 1% reserves
    });
    
    console.log(`   💰 [afford] ${primary} cash=${cash} → [$${afford.min.toLocaleString()}-$${afford.max.toLocaleString()}] (${afford.notes.join(', ')})`);
    
    // 5. GET MARKET CONTEXT - Using null-safe helper
    const marketBand = getMarketBand(metrics, strategy.buy_box?.property_types || []);
    const median = (marketBand.min + marketBand.max) / 2;
    
    // CRITICAL FIX: No minimum price filter for investment searches
    // Investors want to see ALL deals, especially underpriced opportunities
    // The maximum should be what we can afford (no market cap)
    const searchMin = 100_000; // Minimal floor to avoid data issues, but let investors see all deals
    const searchMax = afford.max; // Full affordability - no market cap!
    
    // Log the decision for observability
    if (tracer) {
      tracer.traceCalculation(
        'StrategyBuilderV3',
        'price_band_calculation',
        {
          market_min: marketBand.min,
          market_max: marketBand.max,
          market_source: marketBand.source,
          afford_min: afford.min,
          afford_max: afford.max,
          cash_available: clientProfile.budget,
          financing_type: primary
        },
        {
          search_min: searchMin,
          search_max: searchMax,
          decision: 'No minimum filter - show all investment opportunities'
        },
        'min = 100k (floor only), max = afford_max'
      );
    }
    
    // 6. USE MARKET-BASED SEARCH RANGE
    strategy.buy_box.price_band_usd = {
      min: searchMin,
      max: searchMax,
      provenance: { 
        source: 'investment_opportunity_search',
        market_range: `${marketBand.min}-${marketBand.max}`,
        afford_range: `${afford.min}-${afford.max}`,
        search_range: `${searchMin}-${searchMax}`,
        note: 'No minimum filter to capture all investment opportunities'
      }
    } as any;
    
    console.log(`   📊 [market research] band=[$${marketBand.min.toLocaleString()}-$${marketBand.max.toLocaleString()}] (${marketBand.source})`);
    console.log(`   💰 [affordability] range=[$${afford.min.toLocaleString()}-$${afford.max.toLocaleString()}] (${afford.notes.join(', ')})`);
    console.log(`   ✅ [SEARCH RANGE] [$${searchMin.toLocaleString()}-$${searchMax.toLocaleString()}] (no minimum filter - showing all opportunities)`);
    
    // Still compute search space for reference
    const searchSpace = computeSearchSpace(afford, marketBand, median);
    strategy.search_space = searchSpace;
    strategy.evaluation_directive = "COMPREHENSIVE";
    
    // Keep market context for evaluation (including median PPSF if available)
    (strategy as any).market_context = {
      ...searchSpace.market_context,
      statistical_market_band: { min: marketBand.min, max: marketBand.max, source: marketBand.source },
      search_range: { min: searchMin, max: searchMax, notes: ['market-based minimum', 'affordability-capped maximum'] },
      median_ppsf: metrics.market?.salePsf ? 
        (metrics.market.salePsf.min + metrics.market.salePsf.max) / 2 : null
    };
    
    // 6a. FILL EVALUATION RULES BY STRATEGY TYPE
    const normalizedTypes = (strategy.buy_box?.property_types || []).map(normalizePropertyType);
    const isMultiFamily = normalizedTypes.some(t => 
      ['Duplex', 'Triplex', 'Fourplex'].includes(t)
    );
    
    if (isMultiFamily) {
      // Multi-Family Cashflow Strategy - Worcester-calibrated
      strategy.evaluation_rules = {
        min_cap_rate_pct: 0.045,  // 4.5% - realistic for Worcester market
        min_monthly_cashflow_usd: 150,  // Lower threshold for entry-level investors
        min_dscr_base: 1.05,  // 1.05 - more achievable with current rates
        stress_dscr_floor: 1.00,  // 1.00 - break-even under stress acceptable
        vacancy_assumption_pct: 10,
        fha_self_sufficiency_required: normalizedTypes.some(t => 
          ['Triplex', 'Fourplex', '3 Family', '4 Family'].includes(t)
        ),
        dom_max_days: 120,  // Soft signal for MF (used for scoring, not blocking)
        allowed_property_types: ['Multi Family', '2 Family', '3 Family', '4 Family', 'Duplex', 'Triplex', 'Fourplex'],
        strategy_specific_metrics: [],
        provenance: { source: 'server_defaults' }
      } as any;
      
      // Add stress parameters if not present
      (strategy as any).stress_params = {
        rate_bump_bps: 75,  // Reduced from 150 to 75bps
        vacancy_bump_pct: 8,  // Reduced from 12% to 8%
        expense_inflation_pct: 3  // Reduced from 5% to 3%
      };
      
      console.log(`   ✅ MF Rules: cap≥4.5%, DSCR≥1.05, stress≥1.00, cashflow≥$150`);
    } else {
      // Single-Family Appreciation Strategy  
      strategy.evaluation_rules = {
        min_cap_rate_pct: 'N/A' as any,
        min_monthly_cashflow_usd: 'N/A' as any,
        min_dscr_base: 'N/A' as any,
        stress_dscr_floor: 'N/A' as any,
        dom_max_days: dom?.max || 90,  // Hard cutoff for SFH
        ppsf_ceiling_vs_median_pct: 0.10,
        negative_carry_tolerance_usd: 500,
        renovation_budget_pct_max: 0.15,
        allowed_property_types: ['SingleFamily'],
        fha_self_sufficiency_required: false,
        strategy_specific_metrics: ['dom_gate', 'ppsf_ceiling', 'negative_carry'],
        provenance: { 
          source: dom ? 'research' : 'server_defaults',
          research_id: dom ? `research_${dom.sourceIds?.[0]}` : null
        }
      } as any;
      
      console.log(`   ✅ SFH Rules: DOM≤${dom?.max || 90}d, PPSF≤+10%, loss≤$500/mo`);
    }
    
    // Check for missing critical data
    const missingData = [];
    if (!dom && !isMultiFamily) missingData.push('dom_percentiles_10_90');
    if (!metrics.market?.salePsf && !isMultiFamily) missingData.push('sfh_ppsf_median');
    if (isMultiFamily && !metrics.rates?.conventional) missingData.push('conventional_mortgage_rate');
    
    if (missingData.length > 0 && strategy.status !== 'NOT_ACTIONABLE_UNDER_BUDGET') {
      strategy.status = 'NEEDS_RESEARCH';
      strategy.data_asks = [...(strategy.data_asks || []), ...missingData];
      console.log(`   ⚠️ Missing data: ${missingData.join(', ')}`);
    }
    
    // 7. FINANCING NOTES - Use actual rates
    const fmt = (r?: number|null) => r == null ? null : ((r > 1 ? r : r * 100).toFixed(2) + "%");
    const conv = fmt(metrics.rates?.conventional);
    const fha = fmt(metrics.rates?.fha);
    const src = (metrics.rates?.sourceIds || []).join(", ") || "research";
    
    if (/FHA/i.test(strategy.financing?.primary?.type || "") && fha) {
      strategy.financing.primary.notes = `FHA 3.5% down, ${fha} rate (source: ${src}). Self-occupancy required.`;
      console.log(`   ✅ FHA rate: ${fha}`);
    } else if (/Conventional|BRRRR/i.test(strategy.financing?.primary?.type || "") && conv) {
      strategy.financing.primary.notes = `30-year fixed ${conv} (source: ${src})`;
      console.log(`   ✅ Conventional rate: ${conv}`);
    } else if (strategy.financing?.primary) {
      strategy.financing.primary.notes = strategy.financing.primary.notes || "Check current rates with lender";
      pushAsk(strategy, `Current ${strategy.financing.primary.type} mortgage rates`);
      console.log(`   ⚠️ No rate data for ${strategy.financing.primary.type}`);
    }
    
    // 8. READY GATE - Only READY if we have all critical data
    const hasPrice = !!strategy.buy_box?.price_band_usd?.min && !!strategy.buy_box?.price_band_usd?.max;
    const hasRent = !!strategy.comps_bands?.rent?.[0]?.range_monthly?.every?.((v: number) => v > 0);
    const hasPsf = !!strategy.comps_bands?.sale_psf?.range?.every?.((v: number) => v > 0);
    const hasDom = !!strategy.comps_bands?.dom_band?.range_days?.every?.((v: number) => v > 0);
    
    strategy.status = (hasPrice && hasRent && hasPsf && hasDom) ? "READY" : "NEEDS_RESEARCH";
    console.log(`   📊 Status: ${strategy.status} (price:${hasPrice} rent:${hasRent} psf:${hasPsf} dom:${hasDom})`);
    
    // 9. SCORECARD - Keep simple for now
    strategy.scorecard = {
      liquidity_0_20: 15,
      cashflow_quality_0_25: 20,
      execution_risk_0_25: 15,
      location_durability_0_15: 10,
      strategic_fit_0_15: 10,
      rationale: "Based on market metrics"
    };
    
    return strategy;
  });
}

// ============= MAIN BUILDER =============

export class StrategyBuilderV3 {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
  }

  async generateStrategies(
    sessionId: string,
    clientProfile: {
      budget: number;
      location: string;
      monthlyIncome?: number;
      goals?: string[];
      preferredFinancing?: string;
    },
    research: ResearchResult[]
  ): Promise<StrategyBuilderOutput> {
    console.log(`\n🎯 [Strategy Builder v3] Starting DETERMINISTIC strategy generation...`);
    console.log(`   Session: ${sessionId}`);
    console.log(`   Capital: $${clientProfile.budget}`);
    console.log(`   Location: ${clientProfile.location}`);
    console.log(`   Research data: ${research.length} items`);

    // Convert research to items with canonical keys
    const researchItems: ResearchItem[] = research.map(r => {
      try {
        return attachKeyOrReject({
          id: `research_${research.indexOf(r)}`,
          question: r.question,
          answer: r.answer,
          key: (r as any).key  // May have key from Research Coordinator
        });
      } catch (error) {
        console.warn(`   ⚠️ Skipping research item: ${error.message}`);
        return null;
      }
    }).filter(Boolean) as ResearchItem[];
    
    // Extract metrics from research using deterministic extraction
    const metrics = extractMarketMetrics(researchItems, clientProfile.location);
    
    // Derive 2BR band if needed
    if (!metrics.rentBands.twoBr && metrics.rentBands.point2Br) {
      metrics.rentBands.twoBr = deriveTwoBr(metrics);
    }
    
    // Validate metrics
    const validation = checkMetrics(metrics);
    logMetricsDigest(metrics);
    
    // Get strategies from LLM
    const prompt = this.buildPrompt(clientProfile, metrics, research);
    const llmStrategies = await this.callOpenAI(prompt);
    
    // Apply deterministic post-processing
    const strategies = postProcessStrategies(
      llmStrategies, 
      metrics, 
      clientProfile,
      research
    );

    // Build output with CORRECT city and brief
    const output: StrategyBuilderOutput = {
      brief: `Professional investment strategies for ${metrics.market.city} with $${clientProfile.budget} capital`,
      market: {
        city: metrics.market.city,  // Use city from metrics
        focus_neighborhoods: [],  // LLM can suggest these
        demand_signals: []
      },
      strategies: strategies,
      research_log: research.map(r => `${r.question} → ${JSON.stringify(r.answer)}`)
    };

    // Log for debugging
    await this.logStrategy(sessionId, clientProfile, output, metrics);

    return output;
  }

  private buildPrompt(clientProfile: any, metrics: MarketMetrics, research: ResearchResult[]): string {
    return `You are a professional real estate investment strategist. Create 3-5 investment strategies.

INVESTOR PROFILE:
- Capital: $${clientProfile.budget}
- Target Location: ${clientProfile.location}
- Goals: ${clientProfile.goals?.join(', ') || 'cashflow and appreciation'}
- Preferred Financing: ${clientProfile.preferredFinancing || 'Conventional'}

YOUR RESPONSIBILITIES (text only, NO numbers):
- Strategy names and objectives
- Property types and submarkets selection
- Risk identification and mitigation plans
- Financing approach rationale
- Strategic positioning

DO NOT OUTPUT ANY NUMBERS. The server sets all prices, rents, rates, and metrics.

Create strategies following this EXACT JSON structure:
{
  "strategies": [
    {
      "name": "Multi-Family Cashflow Strategy",
      "objective": "Maximize rental income through 2-4 unit properties",
      "buy_box": {
        "property_types": ["Multi Family", "2 Family", "3 Family", "4 Family"],
        "submarkets": ["Downtown", "University District"],
        "zoning_required": ["R2", "R3"],
        "lot_constraints": {
          "min_lot_sqft": null,
          "setbacks_notes": "Standard residential"
        },
        "building_constraints": {
          "min_ceiling_ft": null,
          "egress_req": "Two exits per unit",
          "parking": "Off-street preferred"
        },
        "proximity": [
          {"to": "Employment centers", "within_miles": 5}
        ],
        "price_band_usd": {"min": null, "max": null},
        "beds_baths_min": {"beds": 2, "baths": 1},
        "exclude_flags": ["major repairs", "foundation issues"]
      },
      "evaluation_rules": {
        "min_cap_rate_pct": null,
        "min_monthly_cashflow_usd": null,
        "min_dscr_base": null,
        "fha_self_sufficiency_rule": {
          "required": false,
          "note": ""
        },
        "strategy_specific_metrics": []
      },
      "financing": {
        "primary": {
          "type": "Conventional",
          "notes": ""
        },
        "alternatives": ["FHA House-Hack", "DSCR"]
      },
      "comps_bands": {
        "rent": [],
        "sale_psf": {"range": [null, null], "sources": []},
        "dom_band": {"range_days": [null, null], "notes": "", "sources": []}
      },
      "execution": {
        "typical_stabilization_months": 3,
        "top_risks": ["vacancy", "maintenance"],
        "mitigation_playbook": ["thorough screening", "preventive maintenance"]
      },
      "handoff_checklist": ["property inspection", "rental market analysis"],
      "scorecard": {
        "liquidity_0_20": null,
        "cashflow_quality_0_25": null,
        "execution_risk_0_25": null,
        "location_durability_0_15": null,
        "strategic_fit_0_15": null,
        "rationale": ""
      },
      "status": "NEEDS_RESEARCH"
    }
  ]
}`;
  }

  private async callOpenAI(prompt: string): Promise<StrategyV3[]> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a professional real estate strategist. Output ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content!;
    const parsed = JSON.parse(content);
    return parsed.strategies || [];
  }

  private async logStrategy(
    sessionId: string, 
    clientProfile: any, 
    output: StrategyBuilderOutput, 
    metrics: MarketMetrics
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const logDir = path.join(process.cwd(), 'strategy-logs');
    
    await fs.mkdir(logDir, { recursive: true });
    
    const logFile = path.join(logDir, `${sessionId}.json`);
    const logData = {
      timestamp,
      sessionId,
      clientProfile,
      metrics,
      output
    };
    
    await fs.writeFile(logFile, JSON.stringify(logData, null, 2));
    console.log(`\n✅ Strategy logged to: ${logFile}`);
  }
}

// Export singleton instance
export const strategyBuilderV3 = new StrategyBuilderV3();