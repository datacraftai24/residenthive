/**
 * Complete production-ready validators for all agents
 * Uses config for dynamic thresholds
 */

import { z } from 'zod';
import { ValidateResult } from './withSpan.js';
import { ObservabilityConfig, ErrorCode } from './config.js';
import { daysSince, validateMonotonicity, distanceMiles } from './utils.js';
import {
  PROPERTY_TYPES,
  MULTI_FAMILY_TYPES,
  extractMissingFields,
  getStatusFromError,
  calculateMarketGroundedRate,
  calculateFinancialGroundedRate
} from './validators-base.js';

// ==================== Strategy Builder ====================

const StrategyBuilderOutput = z.object({
  capital: z.number().min(0),
  maxPrice: z.number().min(0).optional(),
  targetReturn: z.number().optional(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).min(1),
  locations: z.array(z.string()).min(1).transform(xs => [...new Set(xs.map(s => s.trim().toUpperCase()))]),
  strategicFactors: z.object({
    universities: z.boolean().optional(),
    publicTransport: z.boolean().optional(), 
    developmentPlans: z.boolean().optional(),
    emergingMarkets: z.boolean().optional(),
  }).optional(),
  preferences: z.object({
    multiFamily: z.boolean().optional(),
    passiveIncome: z.number().min(0).optional(),
    maxCashFlowShortfall: z.number().max(0).optional(),
    aduInterest: z.boolean().optional(),
    valueAddFocus: z.boolean().optional(),
    comprehensiveAnalysis: z.boolean().optional(),
    minProperties: z.number().min(1).optional()
  }).partial()
});

export function validateStrategyBuilder(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = StrategyBuilderOutput.safeParse(output);
  
  if (!parsed.success) {
    const missing = extractMissingFields(parsed.error);
    const status = getStatusFromError(parsed.error);
    
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: status,
      missing_fields: missing
    };
  }
  
  const data = parsed.data;
  
  const missing: string[] = [];
  if (!data.targetReturn) missing.push('targetReturn');
  if (!data.riskTolerance) missing.push('riskTolerance');
  if (!data.strategicFactors) missing.push('strategicFactors');
  
  const complete = missing.length === 0;
  
  let confidence = 1.0;
  confidence -= missing.length * 0.15;
  
  const capitalOutlier = data.capital < 10000 || data.capital > 10000000;
  if (capitalOutlier) confidence -= 0.1;
  
  return {
    complete,
    confidence: Math.max(0.3, confidence),
    statusOverride: complete ? 'ok' : 'missing_fields',
    missing_fields: missing.length > 0 ? missing : undefined,
    extraTags: {
      capital: data.capital,
      max_price: data.maxPrice,
      property_types: data.propertyTypes.join(','),
      locations: data.locations.join(','),
      capital_outlier: capitalOutlier ? true : undefined,
      inferred_count: missing.length,
      min_properties: data.preferences?.minProperties || config.MIN_PROPERTIES,
      error_code: capitalOutlier ? ErrorCode.CAPITAL_OUTLIER : undefined
    }
  };
}

// ==================== Property Hunter ====================

const PropertySchema = z.object({
  id: z.string(),
  address: z.string(),
  city: z.string().optional(),
  state: z.string().optional().transform(s => s?.toUpperCase()),
  postalCode: z.string().regex(/^[A-Za-z0-9 \-]{3,10}$/).optional(),
  price: z.coerce.number().min(0),
  bedrooms: z.coerce.number().min(0).optional(),
  bathrooms: z.coerce.number().min(0).optional(),
  sqft: z.coerce.number().min(0).optional(),
  yearBuilt: z.coerce.number().optional(),
  propertyType: z.enum(PROPERTY_TYPES),
  unitCount: z.coerce.number().min(1).optional(),
  currentRent: z.coerce.number().min(0).optional(),
  estimatedRent: z.coerce.number().min(0).optional(),
  photos: z.array(z.string()).optional(),
  description: z.string().optional(),
  garage: z.coerce.number().min(0).optional(),
  listingUrl: z.string().url().optional(),
  mlsNumber: z.string().regex(/^[A-Z0-9\-]{3,20}$/i).optional(),
  listingDate: z.preprocess(
    v => {
      if (!v) return undefined;
      if (typeof v !== 'string') return v;
      try {
        return new Date(v).toISOString();
      } catch {
        return v;
      }
    },
    z.string().datetime().optional()
  ),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  aduPotential: z.boolean().optional(),
  aduDetails: z.string().optional()
});

const PropertyHunterOutput = z.object({
  properties: z.array(PropertySchema),
  maxPrice: z.number().optional(),
  reason: z.string().optional()
});

export function validatePropertyHunter(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = PropertyHunterOutput.safeParse(output);
  
  if (!parsed.success) {
    const missing = extractMissingFields(parsed.error);
    const status = getStatusFromError(parsed.error);
    
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: status,
      missing_fields: missing
    };
  }
  
  const data = parsed.data;
  
  if (data.properties.length === 0) {
    return {
      complete: false,
      confidence: data.reason === 'no_match' ? 0.9 : 0.3,
      statusOverride: 'no_match',
      missing_fields: [],
      extraTags: {
        reason: data.reason || 'No properties found'
      }
    };
  }
  
  const invalidMultiFamily = data.properties.filter(p => 
    MULTI_FAMILY_TYPES.includes(p.propertyType) && !p.unitCount
  );
  
  if (invalidMultiFamily.length > 0) {
    return {
      complete: false,
      confidence: 0.3,
      statusOverride: 'missing_fields',
      missing_fields: invalidMultiFamily.map(p => `${p.id}.unitCount`),
      extraTags: {
        missing_unit_counts: invalidMultiFamily.length,
        error_code: ErrorCode.MISSING_UNIT_COUNT
      }
    };
  }
  
  const overBudgetCount = data.maxPrice 
    ? data.properties.filter(p => p.price > data.maxPrice).length
    : 0;
  
  const listingAges = data.properties
    .filter(p => p.listingDate)
    .map(p => daysSince(p.listingDate!));
  const avgListingAge = listingAges.length > 0
    ? Math.round(listingAges.reduce((a, b) => a + b, 0) / listingAges.length)
    : undefined;
  const staleCount = listingAges.filter(age => age > config.MAX_LISTING_AGE_DAYS).length;
  
  const residentialTypes = ['SINGLE-FAMILY', 'MULTI-FAMILY', 'CONDO', 'TOWNHOUSE', 'DUPLEX', '3-FAMILY', '4-FAMILY'];
  const residentialProps = data.properties.filter(p => residentialTypes.includes(p.propertyType));
  const nonResidentialProps = data.properties.filter(p => !residentialTypes.includes(p.propertyType));
  
  const completeResidential = residentialProps.filter(p => 
    p.address && p.price && p.bedrooms !== undefined && p.bathrooms !== undefined
  );
  
  const dataQuality = residentialProps.length > 0 
    ? completeResidential.length / residentialProps.length
    : 1.0;
  
  const avgPrice = data.properties.length > 0
    ? Math.round(data.properties.reduce((sum, p) => sum + p.price, 0) / data.properties.length)
    : 0;
  
  let confidence = 0.5 + (dataQuality * 0.3);
  if (data.properties.some(p => p.photos && p.photos.length > 0)) confidence += 0.1;
  if (overBudgetCount > 0) confidence -= 0.1;
  if (staleCount > data.properties.length / 2) confidence -= 0.1;
  
  const errorCodes: string[] = [];
  if (overBudgetCount > 0) errorCodes.push(ErrorCode.OVER_BUDGET);
  if (staleCount > 0) errorCodes.push(ErrorCode.STALE_LISTINGS);
  
  return {
    complete: true,
    confidence: Math.max(0.2, Math.min(1, confidence)),
    statusOverride: 'ok',
    extraTags: {
      property_count: data.properties.length,
      residential_count: residentialProps.length,
      non_residential_count: nonResidentialProps.length,
      avg_price: avgPrice,
      data_quality: dataQuality,
      over_budget_count: overBudgetCount || undefined,
      avg_listing_age_days: avgListingAge,
      stale_listing_count: staleCount || undefined,
      error_codes: errorCodes.length > 0 ? errorCodes.join(',') : undefined
    }
  };
}

// ==================== Market Researcher ====================

const MarketFactSchema = z.object({
  text: z.string(),
  source_id: z.string(),
  as_of: z.string().datetime()
});

const MarketSourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  as_of: z.string().datetime()
});

const MarketAnalysisSchema = z.object({
  location: z.string(),
  universityPresence: z.string().optional(),
  publicTransport: z.string().optional(),
  developmentPlans: z.string().optional(),
  rentGrowth: z.coerce.number().min(-100).max(100).optional(),
  occupancyRate: z.coerce.number().min(0).max(100).optional(),
  marketTrends: z.array(MarketFactSchema).min(1),
  strategicInsights: z.array(MarketFactSchema).min(1),
  emergingOpportunities: z.array(MarketFactSchema).min(1),
  sources: z.array(MarketSourceSchema).optional()
});

const MarketResearcherOutput = z.array(MarketAnalysisSchema);

export function validateMarketResearcher(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = MarketResearcherOutput.safeParse(output);
  
  if (!parsed.success) {
    const missing = extractMissingFields(parsed.error);
    const status = getStatusFromError(parsed.error);
    
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: status,
      missing_fields: missing
    };
  }
  
  const data = parsed.data;
  
  if (data.length === 0) {
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: 'no_match',
      missing_fields: []
    };
  }
  
  let groundedCount = 0;
  let totalFacts = 0;
  const ungroundedLocations: string[] = [];
  let maxSourceAge = 0;
  let hasNumericKPIs = false;
  
  for (const analysis of data) {
    const sources = analysis.sources || [];
    const sourceIds = new Set(sources.map(s => s.id));
    
    sources.forEach(s => {
      const age = daysSince(s.as_of);
      maxSourceAge = Math.max(maxSourceAge, age);
    });
    
    if (analysis.rentGrowth !== undefined || analysis.occupancyRate !== undefined) {
      hasNumericKPIs = true;
    }
    
    const facts = [
      ...analysis.marketTrends,
      ...analysis.strategicInsights,
      ...analysis.emergingOpportunities
    ];
    
    const localGrounded = facts.filter(f => sourceIds.has(f.source_id)).length;
    
    totalFacts += facts.length;
    groundedCount += localGrounded;
    
    if (!sources.length || localGrounded === 0) {
      ungroundedLocations.push(analysis.location);
    }
  }
  
  const groundedRate = totalFacts > 0 ? groundedCount / totalFacts : 0;
  const groundingBucket = config.getGroundingBucket(groundedRate);
  
  const missing: string[] = [];
  const errorCodes: string[] = [];
  
  if (totalFacts === 0) {
    missing.push('facts');
  } else if (ungroundedLocations.length > 0) {
    missing.push('sources');
    errorCodes.push(ErrorCode.UNGROUNDED_FACTS);
  }
  
  if (!hasNumericKPIs) {
    missing.push('numeric_kpis');
    errorCodes.push(ErrorCode.MISSING_NUMERIC_KPIS);
  }
  
  if (maxSourceAge > config.MAX_SOURCE_AGE_DAYS) {
    errorCodes.push(ErrorCode.STALE_SOURCES);
  }
  
  let confidence = 0.3 + (groundedRate * 0.4);
  if (hasNumericKPIs) confidence += 0.2;
  if (maxSourceAge > config.MAX_SOURCE_AGE_DAYS) confidence *= 0.7;
  
  return {
    complete: groundedRate >= config.MIN_GROUNDED_RATE && totalFacts > 0 && hasNumericKPIs,
    confidence: Math.min(1, confidence),
    statusOverride: (!hasNumericKPIs || groundedRate < config.MIN_GROUNDED_RATE) ? 'missing_fields' : 'ok',
    missing_fields: missing.length > 0 ? missing : undefined,
    extraTags: {
      grounded_rate: groundedRate,
      grounding_bucket: groundingBucket,
      total_facts: totalFacts,
      grounded_facts: groundedCount,
      ungrounded_locations: ungroundedLocations.length > 0 ? ungroundedLocations.join(',') : undefined,
      locations_analyzed: data.length,
      max_source_age_days: maxSourceAge,
      needs_numeric_kpis: !hasNumericKPIs || undefined,
      error_codes: errorCodes.length > 0 ? errorCodes.join(',') : undefined
    }
  };
}

// ==================== Financial Calculator ====================

const FinancialScenarioSchema = z.object({
  scenarioName: z.string(),
  downPayment: z.number().min(0),
  loanAmount: z.number().min(0),
  monthlyPayment: z.number(),
  totalMonthlyExpenses: z.number(),
  monthlyRentalIncome: z.number().min(0),
  monthlyCashFlow: z.number(),
  annualReturn: z.number().optional(),
  capRate: z.number().optional(),
  cashOnCashReturn: z.number().optional()
});

const FinancialAnalysisSchema = z.object({
  propertyId: z.string(),
  scenarios: z.array(FinancialScenarioSchema).min(1),
  bestScenario: z.string().optional(),
  calc_error: z.boolean().optional(),
  error_message: z.string().optional()
});

const FinancialCalculatorOutput = z.array(FinancialAnalysisSchema);

export function validateFinancialCalculator(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = FinancialCalculatorOutput.safeParse(output);
  
  if (!parsed.success) {
    const missing = extractMissingFields(parsed.error);
    const status = getStatusFromError(parsed.error);
    
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: status,
      missing_fields: missing
    };
  }
  
  const data = parsed.data;
  
  if (data.length === 0) {
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: 'no_match',
      missing_fields: []
    };
  }
  
  const calcErrors = data.filter(a => a.calc_error);
  const validAnalyses = data.filter(a => !a.calc_error);
  
  if (validAnalyses.length === 0) {
    return {
      complete: false,
      confidence: 0.2,
      statusOverride: 'calc_error',
      missing_fields: [],
      extraTags: {
        error_code: ErrorCode.CALC_ERROR,
        calc_error_count: calcErrors.length
      }
    };
  }
  
  // Check for monotonicity issues
  const monotonicityIssues: string[] = [];
  for (const analysis of validAnalyses) {
    const downPayments = analysis.scenarios.map(s => s.downPayment);
    const cashFlows = analysis.scenarios.map(s => s.monthlyCashFlow);
    
    if (!validateMonotonicity(downPayments, cashFlows, true)) {
      monotonicityIssues.push(analysis.propertyId);
    }
  }
  
  // Calculate financial metrics
  const allCashFlows = validAnalyses
    .flatMap(a => a.scenarios)
    .map(s => s.monthlyCashFlow);
  
  const avgCashFlow = Math.round(
    allCashFlows.reduce((sum, cf) => sum + cf, 0) / allCashFlows.length
  );
  
  const minCashFlow = Math.min(...allCashFlows);
  const maxCashFlow = Math.max(...allCashFlows);
  const variance = maxCashFlow - minCashFlow;
  
  const groundedRate = calculateFinancialGroundedRate(validAnalyses);
  
  let confidence = 0.3 + (groundedRate * 0.3);
  if (validAnalyses.every(a => a.bestScenario)) confidence += 0.2;
  if (monotonicityIssues.length > 0) confidence -= 0.15;
  if (calcErrors.length > validAnalyses.length / 2) confidence -= 0.2;
  
  const errorCodes: string[] = [];
  if (monotonicityIssues.length > 0) errorCodes.push(ErrorCode.MONOTONICITY_FAIL);
  if (calcErrors.length > 0) errorCodes.push(ErrorCode.CALC_ERROR);
  
  return {
    complete: validAnalyses.length > 0,
    confidence: Math.max(0.2, Math.min(1, confidence)),
    statusOverride: monotonicityIssues.length > 0 ? 'monotonicity_fail' : 'ok',
    extraTags: {
      property_count: data.length,
      valid_count: validAnalyses.length,
      calc_error_count: calcErrors.length || undefined,
      avg_cash_flow: avgCashFlow,
      scenario_variance: variance,
      min_cash_flow: minCashFlow,
      max_cash_flow: maxCashFlow,
      monotonicity_issues: monotonicityIssues.length > 0 ? monotonicityIssues.join(',') : undefined,
      error_codes: errorCodes.length > 0 ? errorCodes.join(',') : undefined
    }
  };
}

// ==================== Real Estate Advisor ====================

const RecommendationSchema = z.object({
  propertyId: z.string(),
  score: z.number().min(0).max(100),
  pros: z.array(z.string()).min(1),
  cons: z.array(z.string()).min(1),
  keyInsights: z.string(),
  investmentThesis: z.string().optional(),
  riskAssessment: z.string().optional(),
  exitStrategy: z.string().optional()
});

const RealEstateAdvisorOutput = z.array(RecommendationSchema);

export function validateRealEstateAdvisor(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = RealEstateAdvisorOutput.safeParse(output);
  
  if (!parsed.success) {
    const missing = extractMissingFields(parsed.error);
    const status = getStatusFromError(parsed.error);
    
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: status,
      missing_fields: missing
    };
  }
  
  const data = parsed.data;
  
  if (data.length === 0) {
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: 'no_match',
      missing_fields: []
    };
  }
  
  const scoresValid = data.every(r => r.score >= 0 && r.score <= 100);
  const hasThesis = data.filter(r => r.investmentThesis).length;
  const hasRiskAssessment = data.filter(r => r.riskAssessment).length;
  const hasExitStrategy = data.filter(r => r.exitStrategy).length;
  
  const avgScore = data.reduce((sum, r) => sum + r.score, 0) / data.length;
  const topScores = data.filter(r => r.score >= 70).length;
  
  let confidence = 0.4;
  if (scoresValid) confidence += 0.2;
  if (hasThesis === data.length) confidence += 0.15;
  if (hasRiskAssessment === data.length) confidence += 0.15;
  if (hasExitStrategy === data.length) confidence += 0.1;
  
  const missing: string[] = [];
  if (hasThesis < data.length) missing.push('investmentThesis');
  if (hasRiskAssessment < data.length) missing.push('riskAssessment');
  if (hasExitStrategy < data.length) missing.push('exitStrategy');
  
  return {
    complete: scoresValid && data.length > 0,
    confidence: Math.min(1, confidence),
    statusOverride: !scoresValid ? 'invalid_scores' : 'ok',
    missing_fields: missing.length > 0 ? missing : undefined,
    extraTags: {
      recommendation_count: data.length,
      avg_score: Math.round(avgScore),
      top_scores_count: topScores,
      has_thesis_count: hasThesis,
      has_risk_count: hasRiskAssessment,
      has_exit_count: hasExitStrategy
    }
  };
}

// ==================== Deal Packager ====================

const ExecutiveSummarySchema = z.object({
  totalCapital: z.number().min(0),
  propertyCount: z.number().min(0),
  projectedAnnualReturn: z.number(),
  projectedMonthlyCashFlow: z.number(),
  topRecommendations: z.array(z.string()).optional(),
  keyRisks: z.array(z.string()).optional(),
  synthetic: z.boolean().optional()
});

const DealPackagerOutput = z.object({
  reportFilePath: z.string(),
  executiveSummary: ExecutiveSummarySchema,
  purchasingPower: z.any(),
  marketAnalyses: z.array(z.any()),
  enhancedProperties: z.array(z.any()),
  financialAnalyses: z.array(z.any()),
  recommendations: z.array(z.any())
});

export function validateDealPackager(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = DealPackagerOutput.safeParse(output);
  
  if (!parsed.success) {
    const missing = extractMissingFields(parsed.error);
    const status = getStatusFromError(parsed.error);
    
    return {
      complete: false,
      confidence: 0.1,
      statusOverride: status,
      missing_fields: missing
    };
  }
  
  const data = parsed.data;
  const summary = data.executiveSummary;
  
  // Check if this is a synthetic/aborted package
  if (summary.synthetic) {
    return {
      complete: false,
      confidence: 0.3,
      statusOverride: 'synthetic',
      extraTags: {
        synthetic: true,
        property_count: summary.propertyCount
      }
    };
  }
  
  const hasReport = data.reportFilePath && data.reportFilePath.length > 0;
  const hasProperties = data.enhancedProperties.length > 0;
  const hasFinancials = data.financialAnalyses.length > 0;
  const hasRecommendations = data.recommendations.length > 0;
  const hasMarkets = data.marketAnalyses.length > 0;
  
  const dataConsistency = 
    summary.propertyCount === data.enhancedProperties.length &&
    data.enhancedProperties.length === data.financialAnalyses.length;
  
  let confidence = 0.2;
  if (hasReport) confidence += 0.2;
  if (hasProperties) confidence += 0.15;
  if (hasFinancials) confidence += 0.15;
  if (hasRecommendations) confidence += 0.15;
  if (hasMarkets) confidence += 0.1;
  if (dataConsistency) confidence += 0.15;
  
  const missing: string[] = [];
  if (!hasReport) missing.push('reportFilePath');
  if (!summary.topRecommendations) missing.push('topRecommendations');
  if (!summary.keyRisks) missing.push('keyRisks');
  
  return {
    complete: hasReport && hasProperties && hasFinancials,
    confidence: Math.min(1, confidence),
    statusOverride: !dataConsistency ? 'data_mismatch' : 'ok',
    missing_fields: missing.length > 0 ? missing : undefined,
    extraTags: {
      has_report: hasReport,
      property_count: summary.propertyCount,
      market_count: data.marketAnalyses.length,
      recommendation_count: data.recommendations.length,
      data_consistent: dataConsistency,
      projected_return: summary.projectedAnnualReturn,
      projected_cash_flow: summary.projectedMonthlyCashFlow
    }
  };
}
