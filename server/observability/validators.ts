/**
 * Production-ready validation schemas for agent outputs
 * All validators accept config to use dynamic thresholds
 */

import { z } from 'zod';
import { ValidateResult } from './withSpan.js';
import { ObservabilityConfig, ErrorCode } from './config.js';
import { daysSince, validateMonotonicity } from './utils.js';
import {
  PROPERTY_TYPES,
  MULTI_FAMILY_TYPES,
  extractMissingFields,
  getStatusFromError,
  calculateMarketGroundedRate,
  calculateFinancialGroundedRate
} from './validators-base.js';

// Export everything from validators-full which has all implementations
export * from './validators-full.js';

// Import validators for the AgentValidators map
import {
  validateStrategyBuilder,
  validateMarketResearcher,
  validatePropertyHunter,
  validateFinancialCalculator,
  validateRealEstateAdvisor,
  validateDealPackager
} from './validators-full.js';

// Create the validators map - includes both old and new agent names
export const AgentValidators = {
  // Original validators
  strategyBuilder: validateStrategyBuilder,
  marketResearcher: validateMarketResearcher,
  propertyHunter: validatePropertyHunter,
  financialCalculator: validateFinancialCalculator,
  realEstateAdvisor: validateRealEstateAdvisor,
  dealPackager: validateDealPackager,
  
  // New AI agent validators (using existing validators as placeholders)
  strategy_mind: validateStrategyBuilder,
  strategy_mind_validated: validateStrategyBuilder,
  market_scout: validateMarketResearcher,
  property_genius: validateRealEstateAdvisor,
  property_scoring: validatePropertyHunter,
  ai_orchestra: validateDealPackager,
  ai_investment_advisor: validateDealPackager
} as const;

// Re-export grounding calculations and constants
export { 
  calculateMarketGroundedRate, 
  calculateFinancialGroundedRate,
  PROPERTY_TYPES,
  MULTI_FAMILY_TYPES
};
