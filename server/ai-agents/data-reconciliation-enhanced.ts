/**
 * Enhanced Data Reconciliation Service
 * 
 * Purpose: Reconcile multi-source research with source weighting and investor awareness
 * Philosophy: Statistical validation with context - trust but verify
 * 
 * Key Enhancements:
 * 1. Source reliability weighting
 * 2. Investor-specific critical metrics
 * 3. Cross-metric validation
 * 4. Temporal awareness
 * 5. Market-specific tolerances
 */

import { InvestorProfile } from './market-discovery-agent';
import { configRegistry } from '../config/config-registry.js';

// Enhanced raw finding with temporal data
export interface EnhancedRawFinding {
  city: string;
  state: string;
  metric: string;
  value: number | string | null;
  source: string;
  sourceWeight?: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: string;
  dataDate?: string;  // When the data is FROM (not when scraped)
  rawText?: string;
}

// Enhanced reconciled metric with investor context
export interface EnhancedReconciledMetric {
  city: string;
  state: string;
  metric: string;
  
  // Weighted consensus
  consensusValue: number | string | null;
  weightedConsensus?: number;  // Using source weights
  consensusType: 'UNANIMOUS' | 'MAJORITY' | 'DISPUTED' | 'SINGLE_SOURCE';
  
  // Enhanced range with weights
  range: {
    min: number;
    max: number;
    median: number;
    weightedMedian: number;  // Weighted by source reliability
    mean: number;
    weightedMean: number;    // Weighted by source reliability
    spread: number;
    normalizedSpread: number; // Spread / tolerance for this metric
  } | null;
  
  // Source validation with weights
  sources: {
    total: number;
    highQuality: number;  // Sources with weight > 0.7
    agreeing: number;
    names: string[];
    weights: number[];    // Weight for each source
    outliers: Array<{
      source: string;
      value: number | string;
      weight: number;
      reason: 'TOO_HIGH' | 'TOO_LOW' | 'WRONG_FORMAT' | 'OUTDATED';
    }>;
  };
  
  // Investor-aware quality
  dataQuality: {
    agreementLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence: number;
    investorRelevance: 'CRITICAL' | 'IMPORTANT' | 'SUPPORTING';
    warnings: string[];
    dataFreshness: 'CURRENT' | 'RECENT' | 'STALE' | 'UNKNOWN';
  };
  
  // Cross-validation flags
  crossValidation?: {
    consistent: boolean;
    issues: string[];
  };
  
  rawFindings: EnhancedRawFinding[];
}

// Investor-specific configuration
export interface InvestorContext {
  profile: InvestorProfile;
  criticalMetrics: string[];
  importantMetrics: string[];
  toleranceMultiplier: number;  // Stricter (0.5) or looser (1.5) based on timeline
}

export class EnhancedDataReconciliationService {
  private sourceWeights: Record<string, number> = {};
  private metricTolerances: Record<string, any> = {};
  private reconciliationConfig: any = {};
  private lastConfigRefresh: Date = new Date(0);
  private readonly CONFIG_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Load or refresh configuration from registry
   */
  private async ensureConfigLoaded(): Promise<void> {
    const now = new Date();
    if (now.getTime() - this.lastConfigRefresh.getTime() > this.CONFIG_REFRESH_INTERVAL) {
      console.log('🔄 Refreshing data reconciliation config...');
      
      // Load source weights
      const sourceWeightsConfig = await configRegistry.getValue('source-weights', {});
      this.sourceWeights = sourceWeightsConfig.weights || {};
      
      // Load reconciliation config with metric tolerances
      this.reconciliationConfig = await configRegistry.getValue('reconciliation', {});
      this.metricTolerances = this.reconciliationConfig.metricTolerances || {};
      
      this.lastConfigRefresh = now;
      console.log('✅ Config loaded: ', {
        sourceWeightCount: Object.keys(this.sourceWeights).length,
        metricToleranceCount: Object.keys(this.metricTolerances).length
      });
    }
  }
  
  /**
   * Main reconciliation with investor awareness
   */
  async reconcileWithContext(
    findings: EnhancedRawFinding[],
    investorProfile: InvestorProfile
  ): Promise<any> {
    // Ensure config is loaded
    await this.ensureConfigLoaded();
    
    console.log(`🔄 [Enhanced Reconciliation] Processing ${findings.length} findings`);
    console.log(`   Investor context: $${investorProfile.availableCash} seeking $${investorProfile.monthlyIncomeTarget}/mo`);
    
    // Step 1: Build investor context
    const context = this.buildInvestorContext(investorProfile);
    console.log(`   Critical metrics: ${context.criticalMetrics.join(', ')}`);
    
    // Step 2: Add source weights to findings
    const weightedFindings = await this.addSourceWeights(findings);
    
    // Step 3: Group by city + metric
    const grouped = this.groupFindings(weightedFindings);
    
    // Step 4: Reconcile with weights and context
    const reconciled: EnhancedReconciledMetric[] = [];
    
    for (const [key, group] of grouped.entries()) {
      const metric = await this.reconcileWithWeights(group, context);
      reconciled.push(metric);
      
      // Log critical disputed metrics
      if (metric.consensusType === 'DISPUTED' && 
          metric.dataQuality.investorRelevance === 'CRITICAL') {
        console.log(`   ⚠️ CRITICAL disputed: ${key} - investigating...`);
      }
    }
    
    // Step 5: Cross-metric validation
    const validated = this.crossValidateMetrics(reconciled);
    
    // Step 6: Generate investor-specific summaries
    const summaries = this.generateInvestorSummaries(validated, context);
    
    // Step 7: Identify critical issues for THIS investor
    const criticalIssues = this.identifyInvestorCriticalIssues(validated, context);
    
    console.log(`✅ [Enhanced Reconciliation] Complete`);
    console.log(`   ${criticalIssues.length} critical issues for investor`);
    
    return {
      reconciledMetrics: validated,
      citySummaries: summaries,
      criticalIssues,
      investorContext: context
    };
  }
  
  /**
   * Build investor-specific context
   */
  private buildInvestorContext(profile: InvestorProfile): InvestorContext {
    const criticalMetrics: string[] = [];
    const importantMetrics: string[] = [];
    let toleranceMultiplier = 1.0;
    
    // Cash flow focused investor
    if (profile.monthlyIncomeTarget > 0) {
      criticalMetrics.push('median_rent', 'vacancy_rate', 'rental_demand');
      importantMetrics.push('property_tax_rate', 'insurance_cost', 'management_fees');
    }
    
    // Budget constraints
    if (profile.availableCash < 100000) {
      criticalMetrics.push('fha_loan_limits', 'down_payment_assistance');
      toleranceMultiplier = 0.7; // Stricter - less room for error
    } else if (profile.availableCash > 500000) {
      criticalMetrics.push('inventory_luxury', 'appreciation_rate');
      toleranceMultiplier = 1.2; // Looser - more flexibility
    }
    
    // Timeline urgency
    if (profile.timeline === '1 month' || profile.timeline === '3 months') {
      criticalMetrics.push('inventory', 'days_on_market');
      toleranceMultiplier *= 0.8; // Stricter - need accurate current data
    }
    
    // Owner occupancy
    if (profile.willingToOwnerOccupy) {
      criticalMetrics.push('school_ratings', 'crime_rate', 'walkability');
      importantMetrics.push('fha_loan_limits', 'first_time_buyer_programs');
    }
    
    // Default important metrics for all investors
    importantMetrics.push(
      'median_home_price',
      'price_per_sqft',
      'population_growth',
      'employment_rate'
    );
    
    return {
      profile,
      criticalMetrics: [...new Set(criticalMetrics)],
      importantMetrics: [...new Set(importantMetrics)],
      toleranceMultiplier
    };
  }
  
  /**
   * Add source weights to findings
   * ENHANCED: Now rejects stale data based on config
   */
  private async addSourceWeights(findings: EnhancedRawFinding[]): Promise<EnhancedRawFinding[]> {
    // Filter out stale data first
    const freshFindings = findings.filter(f => this.isDataFresh(f));
    
    if (freshFindings.length < findings.length) {
      console.log(`   ⚠️ Rejected ${findings.length - freshFindings.length} stale data points`);
    }
    
    // Use cached source weights (already loaded in ensureConfigLoaded)
    return freshFindings.map(f => {
      // Extract domain from source
      const domain = this.extractDomain(f.source);
      const weight = this.sourceWeights[domain] || this.sourceWeights['unknown'] || 0.2;
      
      // Adjust weight for data freshness
      const freshnessMultiplier = this.calculateFreshnessMultiplier(f);
      
      return {
        ...f,
        sourceWeight: weight * freshnessMultiplier
      };
    });
  }
  
  /**
   * Check if data is fresh enough to use
   */
  private isDataFresh(finding: EnhancedRawFinding): boolean {
    // Get max age from config
    const freshnessReq = this.reconciliationConfig.freshnessRequirements?.[finding.metric];
    const maxAgeDays = freshnessReq?.maxAgeDays || 90; // Default 90 days
    
    // Check data date
    if (finding.dataDate) {
      const ageInDays = (Date.now() - new Date(finding.dataDate).getTime()) / (1000 * 60 * 60 * 24);
      
      if (ageInDays > maxAgeDays) {
        console.log(`     🗑️ Rejecting ${finding.source} data for ${finding.metric}: ${Math.round(ageInDays)} days old (max: ${maxAgeDays})`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Extract domain from source string
   */
  private extractDomain(source: string): string {
    // Handle various source formats
    if (source.includes('zillow')) return 'zillow.com';
    if (source.includes('redfin')) return 'redfin.com';
    if (source.includes('hud.gov')) return 'hud.gov';
    if (source.includes('census')) return 'census.gov';
    if (source.includes('realtor')) return 'realtor.com';
    if (source.includes('apartments')) return 'apartments.com';
    if (source.includes('rentdata')) return 'rentdata.org';
    if (source.includes('blog')) return 'blog';
    
    // Try to extract actual domain
    const match = source.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
    return match ? match[1] : 'unknown';
  }
  
  /**
   * Calculate freshness multiplier (0.5 to 1.0)
   */
  private calculateFreshnessMultiplier(finding: EnhancedRawFinding): number {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    // Check if data date is specified
    if (finding.dataDate) {
      const dataYear = parseInt(finding.dataDate.substring(0, 4));
      if (dataYear === currentYear) return 1.0;
      if (dataYear === currentYear - 1) return 0.8;
      return 0.5;
    }
    
    // Check raw text for year mentions
    if (finding.rawText) {
      if (finding.rawText.includes(`${currentYear}`)) return 1.0;
      if (finding.rawText.includes(`${currentYear - 1}`)) return 0.7;
      if (finding.rawText.includes('2024') && currentYear > 2024) return 0.6;
    }
    
    return 0.8; // Default if unknown
  }
  
  /**
   * Group findings by city + metric
   */
  private groupFindings(findings: EnhancedRawFinding[]): Map<string, EnhancedRawFinding[]> {
    const groups = new Map<string, EnhancedRawFinding[]>();
    
    findings.forEach(f => {
      const key = `${f.city}|${f.state}|${f.metric}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(f);
    });
    
    return groups;
  }
  
  /**
   * Reconcile with source weights and investor context
   */
  private async reconcileWithWeights(
    group: EnhancedRawFinding[],
    context: InvestorContext
  ): Promise<EnhancedReconciledMetric> {
    const first = group[0];
    const metricName = first.metric;
    
    // Determine investor relevance
    const relevance = this.determineRelevance(metricName, context);
    
    // Extract weighted values
    const weightedValues = this.extractWeightedValues(group);
    
    if (weightedValues.length === 0) {
      return this.createNonNumericReconciliation(group, relevance);
    }
    
    if (weightedValues.length === 1) {
      return this.createSingleSourceReconciliation(group, weightedValues[0], relevance);
    }
    
    // Calculate weighted statistics
    const stats = this.calculateWeightedStatistics(weightedValues);
    
    // Get metric tolerance (adjusted for investor) from cached config
    const metricTolerance = this.metricTolerances[metricName];
    const baseTolerance = metricTolerance ? metricTolerance.tolerance : 0.25;
    const adjustedTolerance = baseTolerance * context.toleranceMultiplier;
    
    // Identify outliers with weighted approach
    const outliers = this.identifyWeightedOutliers(weightedValues, stats, adjustedTolerance);
    
    // Clean values (remove outliers)
    const cleanValues = weightedValues.filter(v => 
      !outliers.some(o => o.value === v.value && o.source === v.source)
    );
    
    // Recalculate consensus without outliers
    const consensus = cleanValues.length > 0 
      ? this.calculateWeightedStatistics(cleanValues)
      : stats;
    
    // Determine consensus type with tolerance awareness
    const normalizedSpread = stats.spread / adjustedTolerance;
    const consensusType = this.determineWeightedConsensusType(
      normalizedSpread,
      outliers.length,
      group.length,
      this.sumWeights(cleanValues)
    );
    
    // Calculate confidence with investor awareness
    const confidence = this.calculateInvestorConfidence(
      cleanValues,
      group,
      normalizedSpread,
      consensusType,
      relevance
    );
    
    // Check data freshness
    const freshness = this.assessDataFreshness(group);
    
    return {
      city: first.city,
      state: first.state,
      metric: metricName,
      consensusValue: consensus.weightedMedian,
      weightedConsensus: consensus.weightedMedian,
      consensusType,
      range: {
        min: stats.min,
        max: stats.max,
        median: stats.median,
        weightedMedian: consensus.weightedMedian,
        mean: stats.mean,
        weightedMean: consensus.weightedMean,
        spread: stats.spread,
        normalizedSpread
      },
      sources: {
        total: group.length,
        highQuality: group.filter(g => (g.sourceWeight || 0) > 0.7).length,
        agreeing: cleanValues.length,
        names: group.map(g => g.source),
        weights: group.map(g => g.sourceWeight || 0),
        outliers
      },
      dataQuality: {
        agreementLevel: this.determineWeightedAgreement(normalizedSpread, outliers.length),
        confidence,
        investorRelevance: relevance,
        warnings: this.generateInvestorWarnings(group, stats, outliers, relevance, freshness),
        dataFreshness: freshness
      },
      rawFindings: group
    };
  }
  
  /**
   * Determine metric relevance for investor
   */
  private determineRelevance(
    metric: string,
    context: InvestorContext
  ): 'CRITICAL' | 'IMPORTANT' | 'SUPPORTING' {
    if (context.criticalMetrics.includes(metric)) return 'CRITICAL';
    if (context.importantMetrics.includes(metric)) return 'IMPORTANT';
    return 'SUPPORTING';
  }
  
  /**
   * Extract values with weights
   */
  private extractWeightedValues(group: EnhancedRawFinding[]): Array<{
    value: number;
    source: string;
    weight: number;
  }> {
    const values: Array<{value: number; source: string; weight: number}> = [];
    
    group.forEach(f => {
      const numeric = this.parseNumericValue(f.value);
      if (numeric !== null) {
        values.push({
          value: numeric,
          source: f.source,
          weight: f.sourceWeight || 0.2
        });
      }
    });
    
    return values;
  }
  
  /**
   * Calculate weighted statistics
   */
  private calculateWeightedStatistics(values: Array<{
    value: number;
    source: string;
    weight: number;
  }>): any {
    const numbers = values.map(v => v.value).sort((a, b) => a - b);
    const weights = values.map(v => v.weight);
    
    // Basic stats
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const median = this.calculateMedian(numbers);
    const mean = this.calculateMean(numbers);
    
    // Weighted stats
    const weightedMean = this.calculateWeightedMean(values);
    const weightedMedian = this.calculateWeightedMedian(values);
    
    // Spread
    const spread = max > 0 ? (max - min) / median : 0;
    
    return {
      min,
      max,
      median,
      mean,
      weightedMean,
      weightedMedian,
      spread
    };
  }
  
  /**
   * Calculate weighted mean
   */
  private calculateWeightedMean(values: Array<{value: number; weight: number}>): number {
    const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0) return 0;
    
    const weightedSum = values.reduce((sum, v) => sum + (v.value * v.weight), 0);
    return weightedSum / totalWeight;
  }
  
  /**
   * Calculate weighted median
   */
  private calculateWeightedMedian(values: Array<{value: number; weight: number}>): number {
    // Sort by value
    const sorted = [...values].sort((a, b) => a.value - b.value);
    
    const totalWeight = sorted.reduce((sum, v) => sum + v.weight, 0);
    const halfWeight = totalWeight / 2;
    
    let cumWeight = 0;
    for (const item of sorted) {
      cumWeight += item.weight;
      if (cumWeight >= halfWeight) {
        return item.value;
      }
    }
    
    return sorted[sorted.length - 1].value;
  }
  
  /**
   * Basic median calculation
   */
  private calculateMedian(numbers: number[]): number {
    const mid = Math.floor(numbers.length / 2);
    return numbers.length % 2 === 0
      ? (numbers[mid - 1] + numbers[mid]) / 2
      : numbers[mid];
  }
  
  /**
   * Basic mean calculation
   */
  private calculateMean(numbers: number[]): number {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
  
  /**
   * Identify outliers with weight consideration
   * FIXED: High-trust sources (>0.8) become the baseline, not outliers
   */
  private identifyWeightedOutliers(
    values: Array<{value: number; source: string; weight: number}>,
    stats: any,
    tolerance: number
  ): Array<{source: string; value: number; weight: number; reason: string}> {
    const outliers: Array<{source: string; value: number; weight: number; reason: string}> = [];
    
    // NEW: Separate high-trust sources (they define the baseline)
    const highTrustValues = values.filter(v => v.weight >= 0.8);
    const lowTrustValues = values.filter(v => v.weight < 0.8);
    
    // If we have high-trust sources, use them as the baseline
    if (highTrustValues.length > 0) {
      // Calculate baseline from high-trust sources only
      const highTrustStats = this.calculateWeightedStatistics(highTrustValues);
      const baseline = highTrustStats.weightedMean;
      
      // Check if low-trust sources deviate from high-trust baseline
      lowTrustValues.forEach(v => {
        const deviation = Math.abs(v.value - baseline) / baseline;
        
        // Low-trust sources need tighter tolerance
        const adjustedTolerance = tolerance * (1.5 - v.weight); // Stricter for lower weights
        
        if (deviation > adjustedTolerance) {
          outliers.push({
            source: v.source,
            value: v.value,
            weight: v.weight,
            reason: v.value < baseline ? 'TOO_LOW' : 'TOO_HIGH'
          });
        }
      });
      
      // High-trust sources can only be outliers if they disagree with each other significantly
      if (highTrustValues.length > 1) {
        const highTrustSpread = (highTrustStats.max - highTrustStats.min) / highTrustStats.median;
        
        // Only if high-trust sources have huge disagreement
        if (highTrustSpread > tolerance * 2) {
          highTrustValues.forEach(v => {
            const deviation = Math.abs(v.value - highTrustStats.median) / highTrustStats.median;
            if (deviation > tolerance) {
              outliers.push({
                source: v.source,
                value: v.value,
                weight: v.weight,
                reason: v.value < highTrustStats.median ? 'TOO_LOW' : 'TOO_HIGH'
              });
            }
          });
        }
      }
    } else {
      // Fallback to original logic if no high-trust sources
      const lowerBound = stats.weightedMean * (1 - tolerance);
      const upperBound = stats.weightedMean * (1 + tolerance);
      
      values.forEach(v => {
        if (v.value < lowerBound || v.value > upperBound) {
          outliers.push({
            source: v.source,
            value: v.value,
            weight: v.weight,
            reason: v.value < lowerBound ? 'TOO_LOW' : 'TOO_HIGH'
          });
        }
      });
    }
    
    return outliers;
  }
  
  /**
   * Sum weights of values
   */
  private sumWeights(values: Array<{weight: number}>): number {
    return values.reduce((sum, v) => sum + v.weight, 0);
  }
  
  /**
   * Determine consensus type with weights
   */
  private determineWeightedConsensusType(
    normalizedSpread: number,
    outlierCount: number,
    totalSources: number,
    cleanWeight: number
  ): 'UNANIMOUS' | 'MAJORITY' | 'DISPUTED' | 'SINGLE_SOURCE' {
    if (totalSources === 1) return 'SINGLE_SOURCE';
    
    // If high-weight sources agree
    if (normalizedSpread < 0.5 && cleanWeight > 2.5) return 'UNANIMOUS';
    if (normalizedSpread < 1.0 && cleanWeight > 1.5) return 'MAJORITY';
    
    return 'DISPUTED';
  }
  
  /**
   * Calculate confidence with investor awareness
   */
  private calculateInvestorConfidence(
    cleanValues: any[],
    allValues: any[],
    normalizedSpread: number,
    consensusType: string,
    relevance: string
  ): number {
    let confidence = 50; // Base
    
    // Consensus type bonus
    switch (consensusType) {
      case 'UNANIMOUS': confidence += 30; break;
      case 'MAJORITY': confidence += 20; break;
      case 'DISPUTED': confidence += 0; break;
      case 'SINGLE_SOURCE': confidence -= 10; break;
    }
    
    // Source quality bonus
    const avgWeight = this.sumWeights(cleanValues) / cleanValues.length;
    confidence += Math.round(avgWeight * 20); // Up to +20 for high-quality sources
    
    // Agreement bonus
    const agreementRatio = cleanValues.length / allValues.length;
    confidence += Math.round(agreementRatio * 10);
    
    // Spread penalty
    if (normalizedSpread > 2) confidence -= 20;
    else if (normalizedSpread > 1) confidence -= 10;
    
    // Critical metric penalty if disputed
    if (relevance === 'CRITICAL' && consensusType === 'DISPUTED') {
      confidence -= 20;
    }
    
    return Math.max(0, Math.min(100, confidence));
  }
  
  /**
   * Determine agreement level with weights
   */
  private determineWeightedAgreement(
    normalizedSpread: number,
    outlierCount: number
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (normalizedSpread < 0.5 && outlierCount === 0) return 'HIGH';
    if (normalizedSpread < 1.0 && outlierCount <= 1) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Generate investor-specific warnings
   */
  private generateInvestorWarnings(
    group: EnhancedRawFinding[],
    stats: any,
    outliers: any[],
    relevance: string,
    freshness: string
  ): string[] {
    const warnings: string[] = [];
    
    // Critical metric warnings
    if (relevance === 'CRITICAL') {
      if (outliers.length > 0) {
        warnings.push(`⚠️ CRITICAL metric has ${outliers.length} conflicting sources`);
      }
      if (freshness === 'STALE') {
        warnings.push(`⚠️ CRITICAL metric data may be outdated`);
      }
    }
    
    // High spread warning
    if (stats.spread > 0.5) {
      warnings.push(`Large variance: ${Math.round(stats.min)} to ${Math.round(stats.max)}`);
    }
    
    // Low quality sources
    const lowQualitySources = group.filter(g => (g.sourceWeight || 0) < 0.5).length;
    if (lowQualitySources > group.length / 2) {
      warnings.push(`Majority sources are low quality`);
    }
    
    return warnings;
  }
  
  /**
   * Assess data freshness
   */
  private assessDataFreshness(group: EnhancedRawFinding[]): 'CURRENT' | 'RECENT' | 'STALE' | 'UNKNOWN' {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    const currentData = group.filter(g => 
      g.rawText?.includes(`${currentYear}`) ||
      g.dataDate?.includes(`${currentYear}`)
    ).length;
    
    const ratio = currentData / group.length;
    
    if (ratio > 0.7) return 'CURRENT';
    if (ratio > 0.3) return 'RECENT';
    if (ratio > 0) return 'STALE';
    return 'UNKNOWN';
  }
  
  /**
   * Parse numeric value from various formats
   */
  private parseNumericValue(value: number | string | null): number | null {
    if (value === null) return null;
    if (typeof value === 'number') return value;
    
    const cleaned = value
      .toString()
      .replace(/[$,]/g, '')
      .replace(/k$/i, '000')
      .replace(/m$/i, '000000')
      .replace(/%/g, '');
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  
  /**
   * Get cross-check ratio from config
   */
  private getCrossCheckRatio(checkType: string): { min: number; max: number; expectedRange: string } {
    const crossChecks = this.reconciliationConfig.crossChecks || {};
    const check = crossChecks[checkType];
    if (check) {
      return {
        min: check.minRatio || 0,
        max: check.maxRatio || 1,
        expectedRange: check.expectedRange || '0-1'
      };
    }
    // Default values
    if (checkType === 'rentPriceRatio') {
      return { min: 0.003, max: 0.015, expectedRange: '0.3%-1.5%' };
    }
    return { min: 0, max: 1, expectedRange: '0-100%' };
  }
  
  /**
   * Cross-validate metrics for consistency
   */
  private crossValidateMetrics(metrics: EnhancedReconciledMetric[]): EnhancedReconciledMetric[] {
    // Group by city
    const cityGroups = new Map<string, EnhancedReconciledMetric[]>();
    
    metrics.forEach(m => {
      const key = `${m.city}|${m.state}`;
      if (!cityGroups.has(key)) {
        cityGroups.set(key, []);
      }
      cityGroups.get(key)!.push(m);
    });
    
    // Validate each city's metrics
    for (const [city, cityMetrics] of cityGroups.entries()) {
      const issues: string[] = [];
      
      // Find price and rent
      const price = cityMetrics.find(m => m.metric === 'median_home_price');
      const rent = cityMetrics.find(m => m.metric === 'median_rent');
      const vacancy = cityMetrics.find(m => m.metric === 'vacancy_rate');
      const tax = cityMetrics.find(m => m.metric === 'property_tax_rate');
      
      // Validate rent-to-price ratio using config
      if (price && rent) {
        const priceVal = Number(price.consensusValue);
        const rentVal = Number(rent.consensusValue);
        if (priceVal > 0 && rentVal > 0) {
          const ratio = rentVal / priceVal;
          const rentPriceCheck = this.getCrossCheckRatio('rentPriceRatio');
          
          // ENHANCED: Flag as invalid if ratio is impossible
          if (ratio < rentPriceCheck.min) {
            issues.push(`❌ IMPOSSIBLE rent/price ratio: ${(ratio * 100).toFixed(2)}% (minimum: ${(rentPriceCheck.min * 100).toFixed(2)}%)`);
            
            // Mark both metrics as low confidence
            price.dataQuality.confidence = Math.min(price.dataQuality.confidence, 30);
            rent.dataQuality.confidence = Math.min(rent.dataQuality.confidence, 30);
            price.dataQuality.warnings.push('Cross-validation failed: rent/price ratio too low');
            rent.dataQuality.warnings.push('Cross-validation failed: rent/price ratio too low');
          }
          
          if (ratio > rentPriceCheck.max) {
            issues.push(`⚠️ SUSPICIOUS rent/price ratio: ${(ratio * 100).toFixed(2)}% (maximum: ${(rentPriceCheck.max * 100).toFixed(2)}%)`);
            
            // Flag but don't penalize as much (could be accurate in some markets)
            price.dataQuality.warnings.push('Cross-validation warning: unusually high rent/price ratio');
            rent.dataQuality.warnings.push('Cross-validation warning: unusually high rent/price ratio');
          }
        }
      }
      
      // Validate vacancy vs rent growth using config thresholds
      if (vacancy && rent) {
        const vacancyVal = Number(vacancy.consensusValue);
        const vacancyThreshold = this.reconciliationConfig.dataQualityThresholds?.lowVacancyThreshold || 0.02;
        const confidenceThreshold = this.reconciliationConfig.dataQualityThresholds?.minConfidenceForCritical || 50;
        if (vacancyVal < vacancyThreshold && rent.dataQuality.confidence < confidenceThreshold) {
          issues.push(`Low vacancy (<${(vacancyThreshold * 100).toFixed(0)}%) but uncertain rent data (confidence: ${rent.dataQuality.confidence}%)`);
        }
      }
      
      // Add validation results to metrics
      cityMetrics.forEach(m => {
        m.crossValidation = {
          consistent: issues.length === 0,
          issues
        };
      });
    }
    
    return metrics;
  }
  
  /**
   * Generate investor-specific city summaries
   */
  private generateInvestorSummaries(
    metrics: EnhancedReconciledMetric[],
    context: InvestorContext
  ): any[] {
    const summaries: any[] = [];
    
    // Group by city
    const cityGroups = new Map<string, EnhancedReconciledMetric[]>();
    metrics.forEach(m => {
      const key = `${m.city}|${m.state}`;
      if (!cityGroups.has(key)) {
        cityGroups.set(key, []);
      }
      cityGroups.get(key)!.push(m);
    });
    
    for (const [cityKey, cityMetrics] of cityGroups.entries()) {
      const [city, state] = cityKey.split('|');
      
      // Count critical metrics
      const criticalMetrics = cityMetrics.filter(m => 
        m.dataQuality.investorRelevance === 'CRITICAL'
      );
      const criticalHighConfidence = criticalMetrics.filter(m => 
        m.dataQuality.confidence > 70
      ).length;
      const criticalDisputed = criticalMetrics.filter(m => 
        m.consensusType === 'DISPUTED'
      ).length;
      
      // Missing critical metrics
      const missingCritical = context.criticalMetrics.filter(cm => 
        !cityMetrics.some(m => m.metric === cm)
      );
      
      // Overall investor score
      const investorScore = this.calculateInvestorScore(
        cityMetrics,
        context,
        missingCritical.length
      );
      
      summaries.push({
        city,
        state,
        investorScore,
        criticalMetrics: {
          total: criticalMetrics.length,
          highConfidence: criticalHighConfidence,
          disputed: criticalDisputed,
          missing: missingCritical
        },
        dataQuality: this.assessCityDataQuality(cityMetrics),
        recommendation: this.generateCityRecommendation(investorScore, missingCritical)
      });
    }
    
    return summaries.sort((a, b) => b.investorScore - a.investorScore);
  }
  
  /**
   * Calculate investor-specific city score
   */
  private calculateInvestorScore(
    metrics: EnhancedReconciledMetric[],
    context: InvestorContext,
    missingCriticalCount: number
  ): number {
    let score = 70; // Base score
    
    // Critical metrics bonus/penalty
    metrics.forEach(m => {
      if (m.dataQuality.investorRelevance === 'CRITICAL') {
        if (m.dataQuality.confidence > 70) score += 5;
        else if (m.dataQuality.confidence < 40) score -= 10;
        
        if (m.consensusType === 'DISPUTED') score -= 15;
      }
    });
    
    // Missing critical metrics penalty
    score -= missingCriticalCount * 20;
    
    // Data quality bonus
    const avgConfidence = metrics.reduce((sum, m) => sum + m.dataQuality.confidence, 0) / metrics.length;
    if (avgConfidence > 70) score += 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Assess city data quality
   */
  private assessCityDataQuality(metrics: EnhancedReconciledMetric[]): string {
    const avgConfidence = metrics.reduce((sum, m) => sum + m.dataQuality.confidence, 0) / metrics.length;
    const disputed = metrics.filter(m => m.consensusType === 'DISPUTED').length;
    
    if (avgConfidence > 70 && disputed < 2) return 'HIGH';
    if (avgConfidence > 50 && disputed < 4) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Generate city recommendation
   */
  private generateCityRecommendation(score: number, missingCritical: string[]): string {
    if (score > 80 && missingCritical.length === 0) {
      return 'STRONG CANDIDATE - High confidence data on all critical metrics';
    }
    if (score > 60 && missingCritical.length <= 1) {
      return 'GOOD CANDIDATE - Mostly complete data, consider further research';
    }
    if (score > 40) {
      return 'POSSIBLE CANDIDATE - Significant data gaps, proceed with caution';
    }
    return 'WEAK CANDIDATE - Too many data issues or missing critical information';
  }
  
  /**
   * Identify critical issues for this investor
   */
  private identifyInvestorCriticalIssues(
    metrics: EnhancedReconciledMetric[],
    context: InvestorContext
  ): string[] {
    const issues: string[] = [];
    
    // Group by city
    const cities = new Set(metrics.map(m => `${m.city}, ${m.state}`));
    
    for (const city of cities) {
      const cityMetrics = metrics.filter(m => `${m.city}, ${m.state}` === city);
      
      // Check critical metrics
      for (const critical of context.criticalMetrics) {
        const metric = cityMetrics.find(m => m.metric === critical);
        
        if (!metric) {
          issues.push(`${city}: Missing CRITICAL data - ${critical}`);
        } else if (metric.consensusType === 'DISPUTED') {
          issues.push(`${city}: CRITICAL metric disputed - ${critical}`);
        } else if (metric.dataQuality.confidence < 40) {
          issues.push(`${city}: Low confidence on CRITICAL metric - ${critical}`);
        }
      }
      
      // Timeline-specific issues
      if (context.profile.timeline === '1 month' || context.profile.timeline === '3 months') {
        const hasStaleData = cityMetrics.some(m => 
          m.dataQuality.dataFreshness === 'STALE' && 
          m.dataQuality.investorRelevance !== 'SUPPORTING'
        );
        if (hasStaleData) {
          issues.push(`${city}: Stale data with urgent timeline (${context.profile.timeline})`);
        }
      }
    }
    
    return issues;
  }
  
  // Simplified helper methods for non-numeric and single-source cases
  private createNonNumericReconciliation(
    group: EnhancedRawFinding[],
    relevance: 'CRITICAL' | 'IMPORTANT' | 'SUPPORTING'
  ): EnhancedReconciledMetric {
    const first = group[0];
    return {
      city: first.city,
      state: first.state,
      metric: first.metric,
      consensusValue: first.value,
      weightedConsensus: null,
      consensusType: 'SINGLE_SOURCE',
      range: null,
      sources: {
        total: group.length,
        highQuality: group.filter(g => (g.sourceWeight || 0) > 0.7).length,
        agreeing: group.length,
        names: group.map(g => g.source),
        weights: group.map(g => g.sourceWeight || 0),
        outliers: []
      },
      dataQuality: {
        agreementLevel: 'LOW',
        confidence: 30,
        investorRelevance: relevance,
        warnings: ['Non-numeric data'],
        dataFreshness: 'UNKNOWN'
      },
      rawFindings: group
    };
  }
  
  private createSingleSourceReconciliation(
    group: EnhancedRawFinding[],
    value: any,
    relevance: 'CRITICAL' | 'IMPORTANT' | 'SUPPORTING'
  ): EnhancedReconciledMetric {
    const first = group[0];
    return {
      city: first.city,
      state: first.state,
      metric: first.metric,
      consensusValue: value.value,
      weightedConsensus: value.value,
      consensusType: 'SINGLE_SOURCE',
      range: null,
      sources: {
        total: 1,
        highQuality: value.weight > 0.7 ? 1 : 0,
        agreeing: 1,
        names: [value.source],
        weights: [value.weight],
        outliers: []
      },
      dataQuality: {
        agreementLevel: 'LOW',
        confidence: Math.min(50, Math.round(value.weight * 60)),
        investorRelevance: relevance,
        warnings: ['Single source only'],
        dataFreshness: this.assessDataFreshness(group)
      },
      rawFindings: group
    };
  }
}

// Export singleton
export const enhancedDataReconciliation = new EnhancedDataReconciliationService();