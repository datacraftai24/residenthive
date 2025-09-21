/**
 * Research Validator - Enforces monotonic rent relationships
 * 
 * Ensures Studio < 1BR < 2BR < 3BR with minimal adjustments
 * Uses isotonic regression principles to maintain economic reality
 */

type RentPoint = { 
  label: "studio" | "oneBR" | "twoBR" | "threeBR"; 
  median?: number | null;
};

type ValidatedRent = {
  valid: boolean;
  issues: string[];
  corrected?: Record<string, { 
    median: number; 
    source: "original" | "corrected" | "imputed";
    delta?: number;
  }>;
  metrics?: {
    correctionRate: number;
    avgCorrection: number;
    seed: string;
  };
};

export function enforceMonotonic(
  inData: Record<string, { median?: number | null; low?: number | null; high?: number | null }>,
  options: { 
    minStep?: number; 
    ratios?: Record<string, number>;
    ratioBounds?: Record<string, [number, number]>;
  } = {}
): ValidatedRent {
  const { 
    minStep = 75,
    ratios = { studio: 0.75, oneBR: 0.85, twoBR: 1.00, threeBR: 1.15 },
    ratioBounds = {
      oneBR: [100, 600],   // 1BR must be studio + $100-600
      twoBR: [100, 700],   // 2BR must be 1BR + $100-700
      threeBR: [100, 800]  // 3BR must be 2BR + $100-800
    }
  } = options;

  const order: RentPoint[] = [
    { label: "studio", median: inData.studio?.median ?? null },
    { label: "oneBR", median: inData.oneBR?.median ?? null },
    { label: "twoBR", median: inData.twoBR?.median ?? null },
    { label: "threeBR", median: inData.threeBR?.median ?? null },
  ];

  const issues: string[] = [];
  const out: Record<string, { median: number; source: "original" | "corrected" | "imputed"; delta?: number }> = {};
  
  // 1) Seed from the most reliable point (prefer 2BR, else 1BR, else 3BR, else studio)
  const seedIdx = [2, 1, 3, 0].find(i => order[i].median && order[i].median! > 0);
  if (seedIdx === undefined) {
    return { 
      valid: false, 
      issues: ["NO_VALID_RENT_POINTS"],
      metrics: { correctionRate: 1.0, avgCorrection: 0, seed: "none" }
    };
  }

  const seedLabel = order[seedIdx].label;
  console.log(`[VALIDATOR] Seeding from ${seedLabel} = $${order[seedIdx].median}`);

  // 2) Initialize seed point
  out[seedLabel] = { 
    median: Math.round(order[seedIdx].median!), 
    source: "original",
    delta: 0
  };

  // 3) Backward fill with sensible ratios
  for (let i = seedIdx - 1; i >= 0; i--) {
    const label = order[i].label;
    const nextLabel = order[i + 1].label;
    const next = out[nextLabel].median;
    
    // Calculate expected value based on ratio
    const ratio = label === "studio" ? 0.8 : 0.9;
    let val = order[i].median ?? Math.round(next * ratio);
    const originalVal = order[i].median;
    
    // Enforce strict monotonicity
    if (val >= next) {
      issues.push(`${label.toUpperCase()}_GTE_${nextLabel.toUpperCase()}: $${val} >= $${next}`);
      val = next - minStep;
    }
    
    // Apply ratio bounds
    if (nextLabel === "oneBR" && label === "studio") {
      const [minDiff, maxDiff] = ratioBounds.oneBR;
      if (next - val < minDiff) {
        val = next - minDiff;
        issues.push(`RATIO_BOUND_${label}_${nextLabel}_MIN`);
      } else if (next - val > maxDiff) {
        val = next - maxDiff;
        issues.push(`RATIO_BOUND_${label}_${nextLabel}_MAX`);
      }
    }
    
    out[label] = { 
      median: Math.max(val, minStep), 
      source: originalVal ? (originalVal !== val ? "corrected" : "original") : "imputed",
      delta: originalVal ? Math.abs(val - originalVal) : 0
    };
  }

  // 4) Forward fill
  for (let i = seedIdx + 1; i < order.length; i++) {
    const label = order[i].label;
    const prevLabel = order[i - 1].label;
    const prev = out[prevLabel].median;
    
    const ratio = label === "threeBR" ? 1.15 : 1.10;
    let val = order[i].median ?? Math.round(prev * ratio);
    const originalVal = order[i].median;
    
    // Enforce strict monotonicity
    if (val <= prev) {
      issues.push(`${label.toUpperCase()}_LTE_${prevLabel.toUpperCase()}: $${val} <= $${prev}`);
      val = prev + minStep;
    }
    
    // Apply ratio bounds
    const bounds = ratioBounds[label as keyof typeof ratioBounds];
    if (bounds) {
      const [minDiff, maxDiff] = bounds;
      if (val - prev < minDiff) {
        val = prev + minDiff;
        issues.push(`RATIO_BOUND_${prevLabel}_${label}_MIN`);
      } else if (val - prev > maxDiff) {
        val = prev + maxDiff;
        issues.push(`RATIO_BOUND_${prevLabel}_${label}_MAX`);
      }
    }
    
    out[label] = { 
      median: Math.max(val, prev + minStep), 
      source: originalVal ? (originalVal !== val ? "corrected" : "original") : "imputed",
      delta: originalVal ? Math.abs(val - originalVal) : 0
    };
  }

  // 5) Final monotone sweep (pool-adjacent violators lite)
  const labels = ["studio", "oneBR", "twoBR", "threeBR"] as const;
  for (let i = 1; i < labels.length; i++) {
    if (out[labels[i]].median <= out[labels[i - 1]].median) {
      issues.push(`MONOTONE_FIX_${labels[i - 1]}_${labels[i]}`);
      const oldVal = out[labels[i]].median;
      out[labels[i]].median = out[labels[i - 1]].median + minStep;
      if (out[labels[i]].source === "original") {
        out[labels[i]].source = "corrected";
      }
      out[labels[i]].delta = (out[labels[i]].delta || 0) + Math.abs(out[labels[i]].median - oldVal);
    }
  }

  // 6) Calculate metrics
  const totalPoints = 4;
  const correctedPoints = Object.values(out).filter(v => v.source === "corrected").length;
  const imputedPoints = Object.values(out).filter(v => v.source === "imputed").length;
  const totalDelta = Object.values(out).reduce((sum, v) => sum + (v.delta || 0), 0);
  const correctionRate = (correctedPoints + imputedPoints) / totalPoints;
  const avgCorrection = correctedPoints > 0 ? totalDelta / correctedPoints : 0;

  // 7) Log correction summary
  if (issues.length > 0) {
    console.log(`[VALIDATOR] Corrected ${correctedPoints} points, imputed ${imputedPoints} points`);
    console.log(`[VALIDATOR] Issues: ${issues.join(", ")}`);
    console.log(`[VALIDATOR] Final values: Studio=$${out.studio.median}, 1BR=$${out.oneBR.median}, 2BR=$${out.twoBR.median}, 3BR=$${out.threeBR.median}`);
  }

  return { 
    valid: issues.length === 0, 
    issues, 
    corrected: out,
    metrics: {
      correctionRate,
      avgCorrection: Math.round(avgCorrection),
      seed: seedLabel
    }
  };
}

/**
 * Validate rent ranges (low/median/high consistency)
 */
export function validateRentRanges(
  data: Record<string, { low?: number | null; median?: number | null; high?: number | null }>
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  for (const [unitType, rents] of Object.entries(data)) {
    if (!rents) continue;
    
    const { low, median, high } = rents;
    
    // Check internal consistency
    if (low && median && low >= median) {
      issues.push(`${unitType}_LOW_GTE_MEDIAN: $${low} >= $${median}`);
    }
    if (median && high && median >= high) {
      issues.push(`${unitType}_MEDIAN_GTE_HIGH: $${median} >= $${high}`);
    }
    if (low && high && low >= high) {
      issues.push(`${unitType}_LOW_GTE_HIGH: $${low} >= $${high}`);
    }
    
    // Check reasonable spreads (high shouldn't be >2x low)
    if (low && high && high > low * 2.5) {
      issues.push(`${unitType}_EXCESSIVE_SPREAD: $${low} to $${high}`);
    }
  }
  
  return { valid: issues.length === 0, issues };
}

/**
 * Main validation pipeline
 */
export class ResearchValidator {
  private correctionMetrics: Map<string, { count: number; totalDelta: number }> = new Map();

  validateRentData(
    location: string,
    rentData: Record<string, { median?: number | null; low?: number | null; high?: number | null }>
  ): ValidatedRent & { location: string } {
    console.log(`\n[VALIDATOR] Validating rent data for ${location}`);
    console.log(`[VALIDATOR] Input: Studio=$${rentData.studio?.median}, 1BR=$${rentData.oneBR?.median}, 2BR=$${rentData.twoBR?.median}, 3BR=$${rentData.threeBR?.median}`);
    
    // Validate monotonicity
    const result = enforceMonotonic(rentData);
    
    // Validate ranges
    const rangeValidation = validateRentRanges(rentData);
    if (!rangeValidation.valid) {
      result.issues.push(...rangeValidation.issues);
    }
    
    // Track metrics
    if (result.metrics) {
      const existing = this.correctionMetrics.get(location) || { count: 0, totalDelta: 0 };
      this.correctionMetrics.set(location, {
        count: existing.count + 1,
        totalDelta: existing.totalDelta + result.metrics.avgCorrection
      });
      
      // Alert if correction rate is too high
      if (result.metrics.correctionRate > 0.5) {
        console.warn(`⚠️ [VALIDATOR] High correction rate for ${location}: ${(result.metrics.correctionRate * 100).toFixed(0)}%`);
      }
    }
    
    return { ...result, location };
  }

  getCorrectionStats(): Map<string, { count: number; avgDelta: number }> {
    const stats = new Map<string, { count: number; avgDelta: number }>();
    
    for (const [location, metrics] of this.correctionMetrics) {
      stats.set(location, {
        count: metrics.count,
        avgDelta: metrics.count > 0 ? metrics.totalDelta / metrics.count : 0
      });
    }
    
    return stats;
  }

  shouldQuarantineCity(location: string): boolean {
    const metrics = this.correctionMetrics.get(location);
    if (!metrics) return false;
    
    // Quarantine if we've corrected more than 5 times with high average delta
    return metrics.count > 5 && (metrics.totalDelta / metrics.count) > 500;
  }
}

// Export singleton instance
export const researchValidator = new ResearchValidator();