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
  
  // Calculate real grounding rate
  let groundedCount = 0;
  let totalFacts = 0;
  const ungroundedLocations: string[] = [];
  let maxSourceAge = 0;
  let hasNumericKPIs = false;
  
  for (const analysis of data) {
    const sources = analysis.sources || [];
    const sourceIds = new Set(sources.map(s => s.id));
    
    // Check source freshness using config
    sources.forEach(s => {
      const age = daysSince(s.as_of);
      maxSourceAge = Math.max(maxSourceAge, age);
    });
    
    // Check for numeric KPIs
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
  
  // Determine missing fields and errors
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
  
  // Calculate confidence with penalties
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
  downPayment: z.coerce.number().min(0),
  loanAmount: z.coerce.number().min(0),
  monthlyPayment: z.coerce.number().min(0),
  totalMonthlyExpenses: z.coerce.number().min(0),
  monthlyRentalIncome: z.coerce.number().min(0),
  monthlyCashFlow: z.coerce.number(),
  annualCashFlow: z.coerce.number(),
  cashOnCashReturn: z.coerce.number(),
  totalReturn: z.coerce.number(),
  breakEvenOccupancy: z.coerce.number().min(0).max(100)
});

const FinancialAnalysisSchema = z.object({
  propertyId: z.string(),
  scenarios: z.array(FinancialScenarioSchema).min(1),
  recommendedScenario: FinancialScenarioSchema.optional(),
  recommendedScenarioId: z.number().optional(),
  meetsTargetReturn: z.boolean(),
  riskAssessment: z.string(),
  calc_error: z.string().optional(),
  assumptions_version: z.string().optional()
});

export function validateFinancialCalculator(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = z.array(FinancialAnalysisSchema).safeParse(output);
  
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
  
  // Check for calculation errors
  const errored = data.filter(a => a.calc_error);
  if (errored.length > 0) {
    const errorRate = errored.length / data.length;
    const errorCodes = [...new Set(errored.map(e => e.calc_error!))];
    
    return {
      complete: false,
      confidence: 0.3 * (1 - errorRate),
      statusOverride: 'calc_error',
      missing_fields: ['valid_calculations'],
      extraTags: {
        error_count: errored.length,
        total_analyses: data.length,
        error_codes: errorCodes.join(','),
        error_code: ErrorCode.CALC_ERROR
      }
    };
  }
  
  // Validate monotonicity and scenario membership
  let monotonicityViolations = 0;
  const violatedPropertyIds: string[] = [];
  let invalidRecommendations = 0;
  
  for (const analysis of data) {
    // Check monotonicity
    const violations = validateMonotonicity(analysis.scenarios);
    if (violations.length > 0) {
      monotonicityViolations++;
      violatedPropertyIds.push(analysis.propertyId);
    }
    
    // Check recommended scenario membership
    if (analysis.recommendedScenario && analysis.recommendedScenarioId !== undefined) {
      const matches = analysis.scenarios[analysis.recommendedScenarioId];
      if (!matches || 
          matches.downPayment !== analysis.recommendedScenario.downPayment ||
          matches.monthlyCashFlow !== analysis.recommendedScenario.monthlyCashFlow) {
        invalidRecommendations++;
      }
    }
  }
  
  if (monotonicityViolations > 0) {
    return {
      complete: false,
      confidence: 0.2,
      statusOverride: 'calc_error',
      missing_fields: ['monotonic_scenarios'],
      extraTags: {
        monotonicity_violations: monotonicityViolations,
        violated_property_ids: violatedPropertyIds.join(','),
        invalid_recommendations: invalidRecommendations,
        error_code: ErrorCode.MONOTONICITY_FAIL
      }
    };
  }
  
  if (invalidRecommendations > 0) {
    return {
      complete: false,
      confidence: 0.3,
      statusOverride: 'invalid_type',
      missing_fields: ['valid_recommendation_ref'],
      extraTags: {
        invalid_recommendations: invalidRecommendations,
        error_code: ErrorCode.INVALID_RECOMMENDATION_REF
      }
    };
  }
  
  // Calculate metrics
  const withRecommended = data.filter(a => a.recommendedScenario);
  const groundedRate = withRecommended.length / data.length;
  
  // Check scenario variance
  const scenarioVariances = data.map(a => {
    if (a.scenarios.length < 2) return 0;
    const cashFlows = a.scenarios.map(s => s.monthlyCashFlow);
    const avg = cashFlows.reduce((s, v) => s + v, 0) / cashFlows.length;
    const variance = cashFlows.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / cashFlows.length;
    return Math.sqrt(variance);
  });
  
  const avgVariance = scenarioVariances.reduce((s, v) => s + v, 0) / Math.max(1, scenarioVariances.length);
  const hasVariance = avgVariance > config.MIN_SCENARIO_VARIANCE;
  
  // Confidence calculation
  let confidence = 0.4 + (groundedRate * 0.4);
  if (hasVariance) confidence += 0.2;
  
  const missing: string[] = [];
  if (!hasVariance) missing.push('scenario_variance');
  if (groundedRate < 0.5) missing.push('deterministic_inputs');
  
  return {
    complete: true,
    confidence,
    statusOverride: 'ok',
    missing_fields: missing.length > 0 ? missing : undefined,
    extraTags: {
      properties_analyzed: data.length,
      with_recommendation: withRecommended.length,
      avg_cash_flow: withRecommended.length > 0
        ? Math.round(withRecommended.reduce((sum, a) => 
            sum + (a.recommendedScenario?.monthlyCashFlow || 0), 0
          ) / withRecommended.length)
        : 0,
      scenario_variance: avgVariance,
      grounded_rate: groundedRate,
      assumptions_version: data[0]?.assumptions_version
    }
  };
}

// ==================== Real Estate Advisor ====================

const ADUAnalysisSchema = z.object({
  basementAduFeasible: z.boolean().nullable(),
  estimatedCost: z.coerce.number().min(0).optional(),
  estimatedRent: z.coerce.number().min(0).optional(),
  permittingComplexity: z.string().optional(),
  timeToComplete: z.string().optional(),
  missing_data: z.array(z.string()).optional()
});

const PropertyRecommendationSchema = z.object({
  propertyId: z.string(),
  recommendationScore: z.coerce.number().min(0).max(100),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  investmentThesis: z.string(),
  actionItems: z.array(z.string()),
  aduAnalysis: ADUAnalysisSchema.optional()
});

export function validateRealEstateAdvisor(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = z.array(PropertyRecommendationSchema).safeParse(output);
  
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
      confidence: 0.2,
      statusOverride: 'no_match',
      missing_fields: []
    };
  }
  
  // Calculate metrics
  const avgScore = data.reduce((sum, r) => sum + r.recommendationScore, 0) / data.length;
  const topScore = Math.max(...data.map(r => r.recommendationScore));
  
  const hasDetailedAnalysis = data.every(r => 
    r.strengths.length > 0 && 
    r.investmentThesis.length > 50
  );
  
  const hasAduAnalysis = data.some(r => r.aduAnalysis);
  const aduMissingData = data
    .filter(r => r.aduAnalysis?.missing_data)
    .flatMap(r => r.aduAnalysis!.missing_data!)
    .filter((v, i, a) => a.indexOf(v) === i);
  
  // Calculate confidence
  let confidence = 0.5;
  if (avgScore > 70) confidence += 0.2;
  if (hasDetailedAnalysis) confidence += 0.2;
  if (hasAduAnalysis) confidence += 0.1;
  
  const missing = aduMissingData.length > 0 ? aduMissingData : undefined;
  
  return {
    complete: true,
    confidence: Math.min(1, confidence),
    statusOverride: 'ok',
    missing_fields: missing,
    extraTags: {
      properties_recommended: data.length,
      avg_score: Math.round(avgScore),
      top_score: topScore,
      has_adu_analysis: hasAduAnalysis
    }
  };
}

// ==================== Deal Packager ====================

const DealPackageSchema = z.object({
  strategyId: z.string(),
  reportFilePath: z.string(),
  executiveSummary: z.object({
    totalCapital: z.coerce.number().min(0),
    propertyCount: z.coerce.number().min(0),
    projectedAnnualReturn: z.coerce.number(),
    projectedMonthlyCashFlow: z.coerce.number(),
    topRecommendation: z.object({
      address: z.string(),
      score: z.coerce.number().min(0).max(100),
      price: z.coerce.number().min(0),
      cashFlow: z.coerce.number()
    }).optional(),
    synthetic: z.boolean().optional()
  }),
  marketAnalyses: z.array(z.any()),
  enhancedProperties: z.array(z.any()),
  financialAnalyses: z.array(z.any()),
  recommendations: z.array(z.any()),
  aborted_at: z.string().optional(),
  minProperties: z.number().optional()
});

export function validateDealPackager(output: any, config: ObservabilityConfig): ValidateResult {
  const parsed = DealPackageSchema.safeParse(output);
  
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
  
  // Check if aborted early
  if (data.aborted_at) {
    return {
      complete: false,
      confidence: 0.2,
      statusOverride: 'missing_fields',
      missing_fields: ['full_analysis'],
      extraTags: {
        aborted_at: data.aborted_at,
        strategy_id: data.strategyId,
        incomplete_reason: 'aborted_early',
        error_code: ErrorCode.ABORTED_EARLY
      }
    };
  }
  
  // Check for synthetic summary
  if (data.executiveSummary.synthetic) {
    return {
      complete: false,
      confidence: 0.4,
      statusOverride: 'missing_fields',
      missing_fields: ['executiveSummary'],
      extraTags: {
        strategy_id: data.strategyId,
        synthetic_summary: true,
        incomplete_reason: 'synthetic_summary',
        error_code: ErrorCode.SYNTHETIC_SUMMARY
      }
    };
  }
  
  // Check completeness
  const missing: string[] = [];
  if (!data.marketAnalyses.length) missing.push('market_analyses');
  if (!data.enhancedProperties.length) missing.push('properties');
  if (!data.financialAnalyses.length) missing.push('financial_analyses');
  if (!data.recommendations.length) missing.push('recommendations');
  if (!data.reportFilePath) missing.push('report');
  
  if (missing.length > 0) {
    return {
      complete: false,
      confidence: 0.4,
      statusOverride: 'missing_fields',
      missing_fields: missing,
      extraTags: {
        incomplete_reason: 'missing_components',
        error_code: ErrorCode.MISSING_COMPONENTS
      }
    };
  }
  
  // Check minimum property threshold using config
  const minProperties = data.minProperties || config.MIN_PROPERTIES;
  if (data.enhancedProperties.length < minProperties) {
    return {
      complete: false,
      confidence: 0.6,
      statusOverride: 'missing_fields',
      missing_fields: ['sufficient_properties'],
      extraTags: {
        property_count: data.enhancedProperties.length,
        min_required: minProperties,
        incomplete_reason: 'insufficient_properties',
        error_code: ErrorCode.INSUFFICIENT_PROPERTIES
      }
    };
  }
  
  // High confidence for complete package
  let confidence = 0.8;
  if (data.executiveSummary.topRecommendation) {
    confidence += 0.2;
  }
  
  return {
    complete: true,
    confidence: Math.min(1, confidence),
    statusOverride: 'ok',
    extraTags: {
      strategy_id: data.strategyId,
      property_count: data.enhancedProperties.length,
      projected_return: data.executiveSummary.projectedAnnualReturn,
      has_top_rec: !!data.executiveSummary.topRecommendation
    }
  };
}