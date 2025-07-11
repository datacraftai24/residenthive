/**
 * Score Display Utilities - Defensive scoring logic to prevent display errors
 * This utility provides a standardized way to display scoring data that won't break
 * when backend scoring systems change.
 */

export interface ScoreBreakdown {
  feature_match?: number;
  budget_match?: number;
  bedroom_match?: number;
  location_match?: number;
  visual_tag_match?: number;
  behavioral_tag_match?: number;
  listing_quality_score?: number;
  dealbreaker_penalty?: number;
  missing_data_penalty?: number;
  visual_boost?: number;
  raw_total?: number;
  final_score?: number;
  // Legacy support for old scoring system
  feature_score?: number;
  budget_score?: number;
  location_score?: number;
}

/**
 * Safely convert score to percentage with defensive logic
 * Handles both 0-1 scale and 0-100 scale values automatically
 */
export function scoreToPercentage(score: number | undefined, maxValue?: number): number {
  if (score === undefined || score === null || isNaN(score)) {
    return 0;
  }

  // If maxValue is provided, use it as the scale
  if (maxValue) {
    return Math.round((score / maxValue) * 100);
  }

  // Auto-detect scale based on value range
  if (score <= 1) {
    // 0-1 scale, convert to percentage
    return Math.round(score * 100);
  } else if (score <= 100) {
    // Assume already in percentage or weighted score
    return Math.round(score);
  } else {
    // Value is too high, likely an error - cap at 100%
    console.warn(`Score value ${score} is unusually high, capping at 100%`);
    return 100;
  }
}

/**
 * Get score percentage for display with proper scale detection
 * Includes fallback to legacy property names for backward compatibility
 */
export function getScorePercentage(
  breakdown: ScoreBreakdown, 
  scoreType: 'budget' | 'feature' | 'location'
): number {
  let score: number | undefined;
  let maxValue: number | undefined;

  switch (scoreType) {
    case 'budget':
      score = breakdown.budget_match ?? breakdown.budget_score;
      maxValue = breakdown.budget_match !== undefined ? 20 : undefined; // Budget weight is 20%
      break;
    case 'feature':
      score = breakdown.feature_match ?? breakdown.feature_score;
      maxValue = breakdown.feature_match !== undefined ? 25 : undefined; // Feature weight is 25%
      break;
    case 'location':
      score = breakdown.location_match ?? breakdown.location_score;
      maxValue = breakdown.location_match !== undefined ? 10 : undefined; // Location weight is 10%
      break;
    default:
      return 0;
  }

  return scoreToPercentage(score, maxValue);
}

/**
 * Get display-ready score data with error handling
 */
export function getDisplayScore(breakdown: ScoreBreakdown, scoreType: 'budget' | 'feature' | 'location') {
  const percentage = getScorePercentage(breakdown, scoreType);
  
  return {
    percentage: Math.min(100, Math.max(0, percentage)), // Clamp between 0-100
    width: `${Math.min(100, Math.max(0, percentage))}%`,
    isValid: !isNaN(percentage) && percentage >= 0
  };
}

/**
 * Validate score breakdown structure and log warnings for debugging
 */
export function validateScoreBreakdown(breakdown: ScoreBreakdown): boolean {
  const hasNewFormat = Boolean(
    breakdown.feature_match !== undefined || 
    breakdown.budget_match !== undefined || 
    breakdown.location_match !== undefined
  );
  
  const hasLegacyFormat = Boolean(
    breakdown.feature_score !== undefined || 
    breakdown.budget_score !== undefined || 
    breakdown.location_score !== undefined
  );

  if (!hasNewFormat && !hasLegacyFormat) {
    console.warn('Score breakdown missing both new and legacy format properties');
    return false;
  }

  return true;
}