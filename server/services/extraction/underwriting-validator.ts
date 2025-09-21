/**
 * Underwriting Validator - Enforces conservative assumptions for financial calculations
 * 
 * Core principle: When in doubt, be conservative to protect investor capital
 */

import { UnitType, MixResolution } from '../../../shared/types/extraction';

export interface UnderwritingValidation {
  passed: boolean;
  adjustments: UnitType[];
  flags: string[];
  conservativeScore: number; // 0-100, higher is more conservative
}

/**
 * Validates and adjusts unit mix for conservative underwriting
 */
export function validateForUnderwriting(
  resolution: MixResolution,
  marketData?: { avgRentByType?: Record<string, number> }
): UnderwritingValidation {
  const flags: string[] = [];
  const adjustments: UnitType[] = [];
  let conservativeScore = 100;

  // Rule 0: Check for MLS reconciliation flag - critical for accuracy
  if (resolution.source === 'INFERRED_MLS_RECONCILED') {
    // This is good - we reconciled with MLS data
    flags.push('MLS_RECONCILED');
    console.log('✅ [Underwriting] Unit mix reconciled with MLS bedroom count');
  } else if (resolution.flags?.includes('BEDROOM_COUNT_MISMATCH')) {
    // This is concerning - extraction doesn't match MLS
    conservativeScore -= 25;
    flags.push('MLS_MISMATCH_UNRESOLVED');
    console.warn('⚠️ [Underwriting] Unit mix does not match MLS bedroom count');
  }

  // Rule 1: Penalize non-HIGH confidence units
  const lowConfidenceUnits = resolution.final_mix.filter(u => u.confidence !== 'HIGH');
  if (lowConfidenceUnits.length > 0) {
    const lowConfidenceRatio = lowConfidenceUnits.length / resolution.final_mix.length;
    conservativeScore -= Math.round(lowConfidenceRatio * 30); // Max 30 point penalty
    flags.push(`LOW_CONFIDENCE_UNITS: ${lowConfidenceUnits.length}/${resolution.final_mix.length}`);
  }

  // Rule 2: Flag if using DEFAULT source
  const defaultUnits = resolution.final_mix.filter(u => u.source === 'DEFAULT');
  if (defaultUnits.length > 0) {
    conservativeScore -= 20; // Flat 20 point penalty for defaults
    flags.push(`DEFAULT_ASSUMPTIONS: ${defaultUnits.length} units`);
    
    // For underwriting, always use conservative 1BR for defaults
    for (const unit of defaultUnits) {
      if (unit.label !== '1BR') {
        adjustments.push({
          ...unit,
          beds: 1,
          label: '1BR',
          assumption_code: 'UNDERWRITING_CONSERVATIVE_v1',
          citation: 'Conservative underwriting adjustment'
        });
      }
    }
  }

  // Rule 3: Studios require explicit evidence
  const studios = resolution.final_mix.filter(u => u.label === 'Studio');
  for (const studio of studios) {
    if (studio.confidence !== 'HIGH' || !studio.citation?.includes('studio')) {
      // Downgrade unconfirmed studios to 1BR
      adjustments.push({
        ...studio,
        beds: 1,
        label: '1BR',
        assumption_code: 'UNDERWRITING_STUDIO_DOWNGRADE_v1',
        citation: 'Studio downgraded to 1BR for conservative underwriting'
      });
      flags.push('STUDIO_DOWNGRADED');
      conservativeScore -= 10;
    }
  }

  // Rule 4: 2BR+ units need strong evidence
  const largeUnits = resolution.final_mix.filter(u => u.beds >= 2);
  for (const unit of largeUnits) {
    if (unit.confidence === 'LOW' || (unit.confidence === 'MEDIUM' && !unit.citation)) {
      // Downgrade uncertain large units to 1BR
      adjustments.push({
        ...unit,
        beds: 1,
        label: '1BR',
        assumption_code: 'UNDERWRITING_LARGE_UNIT_DOWNGRADE_v1',
        citation: 'Large unit downgraded to 1BR due to insufficient evidence'
      });
      flags.push('LARGE_UNIT_DOWNGRADED');
      conservativeScore -= 5;
    }
  }

  // Rule 5: Check for reasonable unit mix diversity
  const unitCounts = resolution.final_mix.reduce((acc, u) => {
    acc[u.label] = (acc[u.label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const uniqueTypes = Object.keys(unitCounts).length;
  if (uniqueTypes === 1 && resolution.final_mix.length > 2) {
    // All same type in multi-unit is suspicious unless it's 1BR
    if (!unitCounts['1BR']) {
      flags.push('HOMOGENEOUS_MIX_SUSPICIOUS');
      conservativeScore -= 15;
    }
  }

  // Rule 6: Market validation if data available
  if (marketData?.avgRentByType) {
    const expectedRentOrder = ['Studio', '1BR', '2BR', '3BR'];
    let lastRent = 0;
    for (const type of expectedRentOrder) {
      const rent = marketData.avgRentByType[type];
      if (rent && rent <= lastRent) {
        flags.push(`MARKET_RENT_INVERSION: ${type}`);
        conservativeScore -= 10;
        break;
      }
      if (rent) lastRent = rent;
    }
  }

  // Apply adjustments to create conservative mix
  let finalMix = [...resolution.final_mix];
  if (adjustments.length > 0) {
    const adjustmentMap = new Map(adjustments.map(a => [a.unit_id, a]));
    finalMix = finalMix.map(u => adjustmentMap.get(u.unit_id) || u);
  }

  // Calculate final pass/fail
  const passed = conservativeScore >= 70; // Need 70+ to pass underwriting

  if (!passed) {
    flags.push('UNDERWRITING_FAILED');
    console.warn(`⚠️ [Underwriting] Failed with score ${conservativeScore}: ${flags.join(', ')}`);
  } else {
    console.log(`✅ [Underwriting] Passed with score ${conservativeScore}`);
  }

  return {
    passed,
    adjustments: finalMix,
    flags,
    conservativeScore
  };
}

/**
 * Enforces conservative rent assumptions
 */
export function applyConservativeRents(
  units: UnitType[],
  rentTable: Record<string, { A: number; B: number; C: number }>
): { unit: UnitType; rent: number; grade: 'A' | 'B' | 'C' }[] {
  return units.map(unit => {
    const rents = rentTable[unit.label.toUpperCase()] || rentTable['1BR'];
    
    // Use grade based on confidence
    let grade: 'A' | 'B' | 'C';
    let rent: number;
    
    if (unit.confidence === 'HIGH' && unit.source === 'STRICT') {
      // Only use A-grade for explicitly stated units
      grade = 'A';
      rent = rents.A;
    } else if (unit.confidence === 'HIGH' || unit.confidence === 'MEDIUM') {
      // Use B-grade for inferred units
      grade = 'B';
      rent = rents.B;
    } else {
      // Use C-grade for defaults and low confidence
      grade = 'C';
      rent = rents.C;
    }
    
    return { unit, rent, grade };
  });
}

/**
 * Calculate conservative cash flow with risk adjustments
 */
export function calculateConservativeCashFlow(
  monthlyRent: number,
  monthlyExpenses: number,
  mortgage: number,
  unitMixConfidence: number // 0-100
): {
  nominalCashFlow: number;
  adjustedCashFlow: number;
  riskAdjustment: number;
} {
  const nominalCashFlow = monthlyRent - monthlyExpenses - mortgage;
  
  // Apply risk adjustment based on confidence
  const riskMultiplier = 0.7 + (unitMixConfidence / 100) * 0.3; // 70% to 100% of nominal
  const adjustedCashFlow = Math.round(nominalCashFlow * riskMultiplier);
  const riskAdjustment = nominalCashFlow - adjustedCashFlow;
  
  return {
    nominalCashFlow,
    adjustedCashFlow,
    riskAdjustment
  };
}