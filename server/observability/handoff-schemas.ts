/**
 * Input validation schemas for agent handoffs
 * Ensures clean data flow between agents
 */

import { z } from 'zod';
import { PROPERTY_TYPES } from './validators-base.js';

// ==================== Handoff Schemas ====================

/**
 * StrategyBuilder → MarketResearcher handoff
 */
export const MarketResearcherInput = z.object({
  locations: z.array(z.string()).min(1),
  strategicFactors: z.object({
    universities: z.boolean().optional(),
    publicTransport: z.boolean().optional(),
    developmentPlans: z.boolean().optional(),
    emergingMarkets: z.boolean().optional()
  }).optional()
});

/**
 * StrategyBuilder → PropertyHunter handoff
 */
export const PropertyHunterInput = z.object({
  locations: z.array(z.string()).min(1),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).min(1),
  maxPrice: z.number().min(0).optional(),
  minBedrooms: z.number().min(0).optional(),
  minBathrooms: z.number().min(0).optional(),
  preferences: z.object({
    multiFamily: z.boolean().optional(),
    aduInterest: z.boolean().optional()
  }).optional()
});

/**
 * PropertyHunter → FinancialCalculator handoff
 */
export const FinancialCalculatorInput = z.object({
  properties: z.array(z.object({
    id: z.string(),
    price: z.number().min(0),
    estimatedRent: z.number().min(0).optional(),
    currentRent: z.number().min(0).optional(),
    unitCount: z.number().min(1).optional(),
    propertyType: z.string()
  })).min(1),
  capital: z.number().min(0),
  targetReturn: z.number().optional(),
  assumptions: z.object({
    interestRate: z.number().min(0).max(20).optional(),
    loanTermYears: z.number().min(1).max(30).optional(),
    vacancyRate: z.number().min(0).max(1).optional(),
    maintenanceRate: z.number().min(0).max(1).optional()
  }).optional()
});

/**
 * Multiple agents → RealEstateAdvisor handoff
 */
export const RealEstateAdvisorInput = z.object({
  properties: z.array(z.object({
    id: z.string(),
    address: z.string(),
    price: z.number().min(0),
    aduPotential: z.boolean().optional()
  })).min(1),
  financialAnalyses: z.array(z.object({
    propertyId: z.string(),
    recommendedScenario: z.any().optional(),
    meetsTargetReturn: z.boolean()
  })).optional(),
  marketInsights: z.array(z.object({
    location: z.string(),
    strategicInsights: z.array(z.string())
  })).optional(),
  preferences: z.object({
    aduInterest: z.boolean().optional(),
    valueAddFocus: z.boolean().optional()
  }).optional()
});

/**
 * All agents → DealPackager handoff
 */
export const DealPackagerInput = z.object({
  strategyId: z.string(),
  strategy: z.any(), // From StrategyBuilder
  marketAnalyses: z.array(z.any()).min(1),
  properties: z.array(z.any()).min(1),
  financialAnalyses: z.array(z.any()).min(1),
  recommendations: z.array(z.any()).min(1)
});

/**
 * Validate handoff and return missing fields
 */
export function validateHandoff<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  sourceName: string,
  targetName: string
): {
  valid: boolean;
  data?: T;
  missing?: string[];
  error?: string;
} {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {
      valid: true,
      data: result.data
    };
  }
  
  const missing = result.error.issues
    .filter(i => i.code === 'invalid_type' || i.code === 'too_small')
    .map(i => i.path.join('.'));
  
  console.warn(`[Handoff] ${sourceName} → ${targetName} validation failed:`, {
    missing,
    errors: result.error.issues.slice(0, 3) // Log first 3 errors
  });
  
  return {
    valid: false,
    missing,
    error: `Invalid handoff from ${sourceName} to ${targetName}`
  };
}

// ==================== Export Handoff Validators ====================

export const HandoffSchemas = {
  marketResearcher: MarketResearcherInput,
  propertyHunter: PropertyHunterInput,
  financialCalculator: FinancialCalculatorInput,
  realEstateAdvisor: RealEstateAdvisorInput,
  dealPackager: DealPackagerInput
};