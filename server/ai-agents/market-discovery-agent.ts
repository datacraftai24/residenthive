/**
 * Market Discovery Agent - Pure Research-Driven
 * 
 * Purpose: Discovers the best cities/markets for investment based on investor profile
 * Philosophy: "Why use rules when we have LLMs?" - No hardcoded thresholds or weights
 * 
 * Two-Pass Discovery:
 * Pass A: Meta-discovery - What metrics do we need?
 * Pass B: Data collection - Research those metrics across all cities
 */

import { tracedLLMCall } from '../observability/llm-tracer.js';
import { configRegistry } from '../config/config-registry.js';

// Default source weight if not in config
const DEFAULT_SOURCE_WEIGHT = 0.6;

// Config will be loaded from registry at runtime

// Warning severity levels
const WARNING_SEVERITY: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = {
  'Implausible rent/price ratio': 'CRITICAL',
  'Low vacancy with falling rents': 'HIGH',
  'Tax exceeds normal range': 'MEDIUM',
  'Data older than 12 months': 'LOW',
  'Source disagreement': 'MEDIUM'
};

// Utility functions
const hostOf = (u?: string) => {
  try { return u ? new URL(u).hostname.replace('www.', '') : ''; } catch { return ''; }
};

// Metric-aware recency weight
async function recencyWeight(asOfIso?: string, metric?: string): Promise<number> {
  if (!asOfIso) return 0.6;
  
  // Get freshness requirements from config
  const freshnessConfig = await configRegistry.getValue('reconciliation', {});
  const freshnessReqs = freshnessConfig.freshnessRequirements || {};
  const metricReq = freshnessReqs[metric || ''] || freshnessReqs.default || { maxAgeDays: 90 };
  
  const days = Math.max(0, (Date.now() - new Date(asOfIso).getTime()) / (1000*60*60*24));
  if (days <= metricReq.maxAgeDays) return 1.0;
  if (days >= 365) return metricReq.staleWeight || 0.2;
  
  // Linear decay from maxAgeDays to 365 days
  const t = (days - metricReq.maxAgeDays) / (365 - metricReq.maxAgeDays);
  const decayAmount = 1.0 - (metricReq.staleWeight || 0.2);
  return 1.0 - (decayAmount * Math.min(1, Math.max(0, t)));
}

async function weightForSource(url?: string): Promise<number> {
  const h = hostOf(url);
  if (!h) return DEFAULT_SOURCE_WEIGHT;
  
  // Get source weights from config
  const sourceWeights = await configRegistry.getValue('source-weights', {});
  const weights = sourceWeights.weights || {};
  
  const key = Object.keys(weights).find(k => h.endsWith(k));
  return key ? weights[key] : (weights.unknown || DEFAULT_SOURCE_WEIGHT);
}

// Input from investor profile
export interface InvestorProfile {
  availableCash: number;
  monthlyIncomeTarget: number;
  location: string; // State or region (e.g., "MA" or "Massachusetts")
  creditScore?: number;
  timeline: string;
  willingToOwnerOccupy?: boolean;
  investmentExperience?: string;
  investmentGoals?: string; // cash flow, appreciation, or balanced
}

// Meta-discovery result - what metrics the LLM thinks we need
export interface MetricRequirements {
  essentialMetrics: Array<{
    metric: string;
    reason: string;
    suggestedSources: string[];
  }>;
  investorSpecificFactors: string[];
  marketScreeningCriteria: string;
}

// Discovery query with source anchoring
export interface DiscoveryQuery {
  query: string;
  metric: string; // Which metric this query addresses
  sources: string[]; // Required data sources (Zillow, HUD, Census, etc.)
  validation: string; // How to validate if data is current/accurate
}

// Research finding from a single source with enhanced metadata
export interface ResearchFinding {
  query: string;
  source: string;          // ACTUAL source where data came from
  intendedSource?: string; // What we tried to query
  sourceMismatch?: boolean; // Flag if actual != intended
  crossMetricMismatch?: boolean; // Flag if response doesn't match metric type
  mirroredFrom?: string[]; // Other sources that had identical payload
  url?: string;            // Full source URL
  data: any;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  hasData?: boolean;       // Whether we got real data or "No data"
  timestamp: string;       // When we scraped
  asOf?: string;          // When the data is FROM
  effectiveWeight?: number; // Combined source + recency weight (0 if no data)
}

// Market candidate with multi-source validated data
export interface MarketCandidate {
  city: string;
  state: string;
  
  // Raw metrics from research (no hardcoded structure)
  metrics: Record<string, any>;
  
  // Multi-source validation
  dataQuality: {
    sourcesCount: number;
    agreementLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    lastUpdated: string;
    effectiveWeight?: number; // Average effective weight
    warnings?: string[];      // Data quality warnings
  };
  
  // LLM's analysis (not rule-based scoring)
  analysis: {
    strengths: string[];
    weaknesses: string[];
    investorAlignment: string;
    confidenceLevel: number;
    crossMetricWarnings?: string[]; // Cross-validation issues
  };
  
  recommendation: string;
  diagnostics?: {
    overallMetricConfidence: number;
    coreMetricCompleteness: number;
    crossMetricWarnings: string[];
  };
}

// Final discovery result
export interface MarketDiscoveryResult {
  metaDiscovery: MetricRequirements;
  candidateMarkets: MarketCandidate[];
  eliminatedMarkets: Array<{
    city: string;
    reason: string;
  }>;
  methodology: string; // How the LLM decided to rank cities
  dataValidation: {
    totalQueries: number;
    successfulQueries: number;
    multiSourceValidations: number;
    dataFreshness: string;
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  discoveryQueries: DiscoveryQuery[];
  researchData: any[];
  dataGaps: string[];
}

export class MarketDiscoveryAgent {
  private agentName = 'market_discovery';
  private crossMetricIssues: Array<{city: string; state: string; warnings: string[]}> = [];
  private configInitialized = false;
  
  /**
   * Ensure config registry is initialized
   */
  private async ensureConfigInitialized(): Promise<void> {
    if (!this.configInitialized) {
      await configRegistry.initialize();
      this.configInitialized = true;
    }
  }

  /**
   * Main entry point - discovers best markets through pure research
   */
  async discoverMarkets(
    profile: InvestorProfile,
    tavilySearch: (query: string) => Promise<any>
  ): Promise<MarketDiscoveryResult> {
    // Ensure config is initialized
    await this.ensureConfigInitialized();
    
    console.log(`🔍 [MarketDiscoveryAgent] Starting discovery for ${profile.location}`);
    console.log(`   No hardcoded rules - letting LLM determine what matters`);
    
    // Adjust metric sensitivities based on investor profile
    const metricSensitivity = await this.adjustSensitivityForInvestor(profile);
    
    try {
      // PASS A: Meta-discovery - What do we need to know?
      console.log(`\n📊 Pass A: Meta-discovery phase`);
      const metaRequirements = await this.discoverMetrics(profile);
      console.log(`   LLM identified ${metaRequirements.essentialMetrics.length} essential metrics`);
      metaRequirements.essentialMetrics.forEach(m => {
        console.log(`     - ${m.metric}: ${m.reason}`);
      });
      
      // PASS B: Generate source-anchored queries
      console.log(`\n🔎 Pass B: Query generation phase`);
      const queries = await this.generateSourceAnchoredQueries(profile, metaRequirements);
      console.log(`   Generated ${queries.length} source-specific queries`);
      
      // PASS C: Multi-source research execution
      console.log(`\n🌐 Pass C: Multi-source research phase`);
      const findings = await this.executeMultiSourceResearch(queries, tavilySearch);
      console.log(`   Collected ${findings.length} research findings`);
      
      // PASS D: Extract and analyze markets (no scoring formula!)
      console.log(`\n🏙️ Pass D: Market extraction and analysis`);
      const markets = await this.analyzeMarketsHolistically(
        profile,
        metaRequirements,
        findings
      );
      
      // PASS E: LLM-driven ranking (not formula-based)
      console.log(`\n🎯 Pass E: Holistic ranking for investor goals`);
      const rankedMarkets = await this.rankMarketsForInvestor(
        profile,
        markets,
        metaRequirements
      );
      
      // PASS F: Cross-metric validation
      console.log(`\n🔍 Pass F: Cross-metric validation`);
      const validatedMarkets = await this.validateCrossMetrics(rankedMarkets);
      
      // Compile result with full methodology explanation
      const result = this.compileResult(
        metaRequirements,
        validatedMarkets,
        queries,
        findings
      );
      
      console.log(`\n✅ [MarketDiscoveryAgent] Discovery complete`);
      console.log(`   Top markets: ${result.candidateMarkets.map(m => m.city).join(', ')}`);
      console.log(`   Confidence: ${result.confidence}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [MarketDiscoveryAgent] Discovery failed:`, error);
      throw error;
    }
  }

  /**
   * PASS A: Ask LLM what metrics matter for THIS investor
   * No hardcoded metric list!
   */
  private async discoverMetrics(profile: InvestorProfile): Promise<MetricRequirements> {
    const systemPrompt = `You are a real estate investment analyst doing market discovery.
Your job is to determine what data points are needed to find the best cities for THIS SPECIFIC investor.
Do not assume standard metrics - think about what matters for their unique situation.`;

    const userPrompt = `An investor wants to find the best cities for real estate investment.
Analyze their profile and determine what metrics we need to research.

INVESTOR PROFILE:
- Available Cash: $${profile.availableCash.toLocaleString()}
- Monthly Income Goal: $${profile.monthlyIncomeTarget.toLocaleString()}
- Location Preference: ${profile.location} (statewide search)
- Timeline: ${profile.timeline}
- Owner Occupancy: ${profile.willingToOwnerOccupy ? 'Yes, willing' : 'No, pure investment'}
- Experience: ${profile.investmentExperience || 'Not specified'}
- Goals: ${profile.investmentGoals || 'Cash flow focused'}
${profile.creditScore ? `- Credit Score: ${profile.creditScore}` : ''}

Think about:
1. What metrics would identify cities where this investor can afford properties?
2. What data points would predict if they can achieve their income goals?
3. What factors matter given their timeline and experience level?
4. What regulations or market conditions affect their strategy?

DO NOT assume standard metrics. Think specifically about THIS investor.
For each metric, explain WHY it matters and WHERE to find reliable data.

Return JSON:
{
  "essentialMetrics": [
    {
      "metric": "specific data point needed",
      "reason": "why this matters for this investor",
      "suggestedSources": ["Zillow", "HUD", "Census.gov", etc.]
    }
  ],
  "investorSpecificFactors": [
    "factors unique to this investor's situation"
  ],
  "marketScreeningCriteria": "overall approach to filtering cities"
}`;

    const result = await tracedLLMCall({
      agentName: this.agentName,
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      model: 'gpt-4o',
      responseFormat: 'json_object'
    });

    return JSON.parse(result.content);
  }

  /**
   * PASS B: Generate queries with explicit source requirements
   */
  private async generateSourceAnchoredQueries(
    profile: InvestorProfile,
    metaReqs: MetricRequirements
  ): Promise<DiscoveryQuery[]> {
    const systemPrompt = `You are a research query specialist.
Generate specific queries to discover the required metrics across ALL cities in the target area.
Each query must specify WHERE to find the data for accuracy and freshness.`;

    // Calculate actual purchasing power with leverage
    const downPaymentPercent = 0.25; // Standard 25% down
    const maxPurchasePrice = profile.availableCash / downPaymentPercent;
    const minPurchasePrice = profile.availableCash * 0.5 / downPaymentPercent; // Allow some flexibility
    
    const userPrompt = `Generate research queries to discover these metrics across ${profile.location}.

REQUIRED METRICS:
${JSON.stringify(metaReqs.essentialMetrics, null, 2)}

INVESTOR CONTEXT:
- Location: ${profile.location} (search ALL cities in this area)
- Available Cash: $${profile.availableCash.toLocaleString()}
- Purchase Power: Can afford properties $${minPurchasePrice.toLocaleString()} to $${maxPurchasePrice.toLocaleString()} (with 25% down)
- Income Target: $${profile.monthlyIncomeTarget}/month

IMPORTANT: The investor has $${profile.availableCash.toLocaleString()} for down payment, NOT as a max property price.
With standard 25% down, they can buy up to $${maxPurchasePrice.toLocaleString()} properties.
Look for cities with median prices in the $${(minPurchasePrice/1000).toFixed(0)}k-$${(maxPurchasePrice/1000).toFixed(0)}k range.

REQUIREMENTS:
1. Queries must be comparative ("Which cities..." not "What is Springfield's...")
2. Each query must specify the data source (site:domain.com)
3. Include date qualifiers (2024, latest, current) for freshness
4. One query per metric per source (we'll validate across sources)
5. Include validation criteria (how to check if data is reliable)

Return JSON:
{
  "queries": [
    {
      "query": "Which cities in Massachusetts have median home prices under $500000 site:zillow.com 2024",
      "metric": "median_home_price",
      "sources": ["zillow.com"],
      "validation": "Check if data is from last 90 days"
    }
  ]
}

Generate 2-3 queries per metric (different sources) for validation.`;

    const result = await tracedLLMCall({
      agentName: this.agentName,
      systemPrompt,
      userPrompt,
      temperature: 0.5,
      model: 'gpt-4o',
      responseFormat: 'json_object'
    });

    return JSON.parse(result.content).queries;
  }

  /**
   * PASS C: Execute research with multi-source validation
   */
  private async executeMultiSourceResearch(
    queries: DiscoveryQuery[],
    tavilySearch: (query: string) => Promise<any>
  ): Promise<ResearchFinding[]> {
    const findings: ResearchFinding[] = [];
    
    // Group queries by metric for cross-validation
    const queryGroups = this.groupQueriesByMetric(queries);
    
    for (const [metric, metricQueries] of Object.entries(queryGroups)) {
      console.log(`   Researching ${metric} from ${metricQueries.length} sources...`);
      
      // Execute queries for this metric in parallel
      const metricFindings = await Promise.all(
        metricQueries.map(async (q) => {
          try {
            const result = await tavilySearch(q.query);
            
            // Extract ACTUAL source from the data, not intended source
            const best = Array.isArray(result?.results) ? result.results[0] : undefined;
            const actualUrl = best?.url ?? result?.sources?.[0]?.url ?? result?.url ?? '';
            const actualSource = hostOf(actualUrl) || 'unknown';
            const intendedSource = q.sources?.[0] || 'unknown';
            
            // Flag source mismatch
            const sourceMismatch = intendedSource !== 'unknown' && 
                                   actualSource !== 'unknown' && 
                                   !actualUrl.includes(intendedSource);
            
            // Enhanced "as of" extraction with multiple patterns
            const text = best?.snippet || best?.content || result?.answer || '';
            const asOf = this.extractDataDate(text);
            
            // Check if we got actual data or empty response
            const hasData = result?.answer && 
                           result.answer !== 'No data' && 
                           result.answer !== 'Limited data available' &&
                           result.answer !== 'Limited data available for this specific query.';
            
            // Cross-metric validation: Check if response matches query type
            let crossMetricMismatch = false;
            if (hasData && result?.answer) {
              const answer = result.answer.toLowerCase();
              const queryLower = q.query.toLowerCase();
              
              // Check for metric mismatches
              if (metric.includes('price') && !metric.includes('rent')) {
                // Looking for prices but got rent data
                if (answer.includes('rent') && !answer.includes('price')) {
                  crossMetricMismatch = true;
                  console.log(`     ⚠️ Cross-metric mismatch: Expected prices, got rent data`);
                }
              } else if (metric.includes('vacancy')) {
                // Looking for vacancy but got something else
                if (!answer.includes('vacanc') && !answer.includes('%')) {
                  crossMetricMismatch = true;
                  console.log(`     ⚠️ Cross-metric mismatch: Expected vacancy rates`);
                }
              } else if (metric.includes('time_on_market') || metric.includes('days')) {
                // Looking for time metrics but got rent/price data
                if ((answer.includes('$') || answer.includes('rent')) && 
                    !answer.includes('day') && !answer.includes('week') && !answer.includes('month')) {
                  crossMetricMismatch = true;
                  console.log(`     ⚠️ Cross-metric mismatch: Expected time data, got financial data`);
                }
              }
            }
            
            // Calculate weights - ZERO if no data or cross-metric mismatch
            const baseSourceWeight = (hasData && !crossMetricMismatch) ? weightForSource(actualUrl) : 0;
            const recency = (hasData && !crossMetricMismatch) ? recencyWeight(asOf, metric) : 0;
            const effectiveWeight = (hasData && !crossMetricMismatch) ? 
              Math.max(0.2, Math.min(1.0, baseSourceWeight * recency)) : 0;
            
            // Assess confidence - downgrade if source mismatch, no data, or cross-metric mismatch
            let confidence = await this.assessDataConfidence(result, q.validation, asOf);
            if (!hasData) confidence = 'NONE' as any;
            else if (sourceMismatch || crossMetricMismatch) confidence = 'LOW';
            
            return {
              query: q.query,
              source: actualSource,  // Use ACTUAL source
              intendedSource,         // Track what we tried to query
              sourceMismatch,         // Flag mismatches
              crossMetricMismatch,    // Flag metric mismatches
              url: actualUrl,
              data: result,
              confidence,
              hasData,
              timestamp: new Date().toISOString(),
              asOf,
              effectiveWeight
            } as ResearchFinding;
          } catch (error) {
            console.warn(`     ⚠️ Failed: ${q.query.substring(0, 50)}...`);
            return null;
          }
        })
      );
      
      findings.push(...metricFindings.filter(f => f !== null));
    }
    
    // De-duplicate mirrored payloads
    return this.deduplicateMirroredPayloads(findings);
  }

  /**
   * De-duplicate findings with identical payloads
   * When multiple "sources" return identical text, they're mirrors not independent validation
   */
  private deduplicateMirroredPayloads(findings: ResearchFinding[]): ResearchFinding[] {
    const dedupedFindings: ResearchFinding[] = [];
    const seenPayloads = new Map<string, ResearchFinding>();
    
    for (const finding of findings) {
      const payload = finding.data?.answer || JSON.stringify(finding.data);
      const payloadHash = payload?.substring(0, 100); // Use first 100 chars as hash
      
      if (!payloadHash || !finding.hasData) {
        // Keep findings with no data (they already have weight 0)
        dedupedFindings.push(finding);
        continue;
      }
      
      const existing = seenPayloads.get(payloadHash);
      
      if (existing) {
        // Found duplicate - merge sources but don't count as independent validation
        console.log(`     ⚠️ Mirrored payload detected: ${finding.source} mirrors ${existing.source}`);
        
        // Keep the one with higher weight
        if ((finding.effectiveWeight || 0) > (existing.effectiveWeight || 0)) {
          // Replace with better source
          seenPayloads.set(payloadHash, finding);
          const idx = dedupedFindings.indexOf(existing);
          if (idx >= 0) {
            dedupedFindings[idx] = {
              ...finding,
              mirroredFrom: [existing.source, ...(existing.mirroredFrom || [])]
            };
          }
        } else {
          // Just track that this was mirrored
          existing.mirroredFrom = [...(existing.mirroredFrom || []), finding.source];
        }
      } else {
        // First time seeing this payload
        seenPayloads.set(payloadHash, finding);
        dedupedFindings.push(finding);
      }
    }
    
    return dedupedFindings;
  }

  /**
   * PASS D: Extract markets from research without hardcoded scoring
   */
  private async analyzeMarketsHolistically(
    profile: InvestorProfile,
    metaReqs: MetricRequirements,
    findings: ResearchFinding[]
  ): Promise<MarketCandidate[]> {
    const systemPrompt = `You are a market analyst extracting and analyzing cities from research data.
Do NOT score cities with a formula. Instead, analyze how well each city fits the investor's needs.`;

    const userPrompt = `Extract cities from this research and analyze them for the investor.

INVESTOR PROFILE:
${JSON.stringify({
  cash: profile.availableCash,
  incomeGoal: profile.monthlyIncomeTarget,
  location: profile.location,
  timeline: profile.timeline,
  ownerOccupy: profile.willingToOwnerOccupy
}, null, 2)}

METRICS WE RESEARCHED:
${JSON.stringify(metaReqs.essentialMetrics.map(m => ({
  metric: m.metric,
  whyItMatters: m.reason
})), null, 2)}

RESEARCH FINDINGS:
${JSON.stringify(findings.map(f => ({
  source: f.source,
  confidence: f.confidence,
  data: f.data?.answer || f.data
})), null, 2)}

For each city found in the research:
1. Extract all available metrics (don't force a structure)
2. Note which sources agree/disagree on data
3. Analyze strengths/weaknesses for THIS investor's goals
4. Explain alignment with their specific needs
5. Flag any data quality issues

DO NOT create arbitrary scores. Provide nuanced analysis.

Return JSON:
{
  "markets": [
    {
      "city": "City Name",
      "state": "MA",
      "metrics": {
        // Whatever metrics were found - don't force structure
      },
      "dataQuality": {
        "sourcesCount": 3,
        "agreementLevel": "HIGH",
        "lastUpdated": "2024-Q4"
      },
      "analysis": {
        "strengths": ["specific advantages"],
        "weaknesses": ["specific concerns"],
        "investorAlignment": "How well it matches their goals",
        "confidenceLevel": 85
      },
      "recommendation": "Plain English explanation"
    }
  ],
  "dataIssues": ["Any problems with the research data"]
}`;

    const result = await tracedLLMCall({
      agentName: this.agentName,
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      model: 'gpt-4o',
      responseFormat: 'json_object',
      maxTokens: 4000
    });

    const parsed = JSON.parse(result.content);
    this.dataGaps = parsed.dataIssues || [];
    return parsed.markets || [];
  }

  /**
   * PASS E: Rank markets based on investor goals (not formula)
   */
  private async rankMarketsForInvestor(
    profile: InvestorProfile,
    markets: MarketCandidate[],
    metaReqs: MetricRequirements
  ): Promise<MarketCandidate[]> {
    const systemPrompt = `You are an investment advisor ranking cities for a specific investor.
Rank based on likelihood of achieving their goals, not abstract scores.`;

    const userPrompt = `Rank these cities for the investor based on their specific goals.

INVESTOR'S PRIMARY GOAL:
Generate $${profile.monthlyIncomeTarget}/month passive income with $${profile.availableCash} capital

INVESTOR'S CONSTRAINTS:
- Timeline: ${profile.timeline}
- Location: Must be in ${profile.location}
- Owner Occupancy: ${profile.willingToOwnerOccupy ? 'Yes' : 'No'}

WHAT MATTERS TO THIS INVESTOR:
${metaReqs.investorSpecificFactors.join('\n')}

CITIES TO RANK:
${JSON.stringify(markets, null, 2)}

Rank cities by likelihood of achieving the investor's goals.
Consider the whole picture, not just individual metrics.
Explain your ranking methodology.

Return JSON:
{
  "rankedMarkets": [
    {
      ...existingMarketData,
      "rank": 1,
      "rankingRationale": "Why this city ranks here"
    }
  ],
  "methodology": "How you decided the ranking",
  "eliminatedMarkets": [
    {
      "city": "City Name",
      "reason": "Why it was eliminated"
    }
  ]
}`;

    const result = await tracedLLMCall({
      agentName: this.agentName,
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      model: 'gpt-4o',
      responseFormat: 'json_object'
    });

    const parsed = JSON.parse(result.content);
    this.eliminatedMarkets = parsed.eliminatedMarkets || [];
    this.rankingMethodology = parsed.methodology;
    
    // Add diagnostics to each market
    const marketsWithDiagnostics = (parsed.rankedMarkets || []).map(market => {
      const diagnostics = this.computeMarketDiagnostics(market);
      return { ...market, diagnostics };
    });
    
    return marketsWithDiagnostics;
  }
  
  /**
   * Compute diagnostics for a market
   */
  private computeMarketDiagnostics(market: MarketCandidate): any {
    const coreMetrics = ['median_price', 'median_rent', 'vacancy_rate', 'property_tax_rate'];
    const presentCore = coreMetrics.filter(m => market.metrics[m] !== undefined).length;
    
    return {
      overallMetricConfidence: market.analysis?.confidenceLevel || 0,
      coreMetricCompleteness: presentCore / coreMetrics.length,
      crossMetricWarnings: market.analysis?.crossMetricWarnings || []
    };
  }
  
  /**
   * Validate cross-metric consistency
   */
  private async validateCrossMetrics(markets: MarketCandidate[]): Promise<MarketCandidate[]> {
    this.crossMetricIssues = [];
    
    return Promise.all(markets.map(async market => {
      const warnings: string[] = [];
      const m = market.metrics;
      
      // Rent-to-price ratio check
      if (m.median_price && m.median_rent) {
        const ratio = m.median_rent / m.median_price;
        const crossChecks = await configRegistry.getValue('reconciliation', {}).then(r => r.crossChecks || {});
        const rentPriceCheck = crossChecks.rentPriceRatio || { min: 0.0035, max: 0.015 };
        
        if (ratio < rentPriceCheck.min) {
          warnings.push(`Implausible rent/price ratio: ${(ratio * 100).toFixed(2)}% (below ${(rentPriceCheck.min * 100).toFixed(1)}%)`);
        }
        if (ratio > rentPriceCheck.max) {
          warnings.push(`Suspiciously high rent/price ratio: ${(ratio * 100).toFixed(2)}% (above ${(rentPriceCheck.max * 100).toFixed(1)}%)`);
        }
      }
      
      // Vacancy vs rent growth check
      if (typeof m.vacancy_rate === 'number' && typeof m.rent_growth_yoy === 'number') {
        const vacancyCheck = crossChecks.vacancyRentGrowth || { maxVacancyWithNegativeGrowth: 0.02, minGrowthThreshold: -0.04 };
        const th = { vacancy: vacancyCheck.maxVacancyWithNegativeGrowth, rentGrowth: vacancyCheck.minGrowthThreshold };
        if (m.vacancy_rate < th.vacancy && m.rent_growth_yoy < th.rentGrowth) {
          warnings.push(`Low vacancy (${(m.vacancy_rate * 100).toFixed(1)}%) with falling rents (${(m.rent_growth_yoy * 100).toFixed(1)}%)`);
        }
      }
      
      // Property tax sanity check
      if (m.property_tax_rate && m.median_price) {
        const annualTaxRate = m.property_tax_rate;
        const taxCheck = crossChecks.propertyTaxCap || { maxAnnualRate: 0.05 };
        if (annualTaxRate > taxCheck.maxAnnualRate) {
          warnings.push(`High property tax rate: ${(annualTaxRate * 100).toFixed(2)}% annually`);
        }
      }
      
      // Cap rate vs cash flow consistency
      if (m.cap_rate && m.cash_flow_positive === true) {
        const capRateCheck = crossChecks.capRateFloor || { minCapRate: 0.03 };
        if (m.cap_rate < capRateCheck.minCapRate) {
          warnings.push(`Low cap rate (${(m.cap_rate * 100).toFixed(1)}%) for positive cash flow claim`);
        }
      }
      
      if (warnings.length > 0) {
        this.crossMetricIssues.push({
          city: market.city,
          state: market.state,
          warnings
        });
        
        // Add warnings to market
        market.analysis = {
          ...market.analysis,
          crossMetricWarnings: warnings
        };
        
        // Reduce confidence if critical warnings
        const criticalWarningCount = warnings.filter(w => 
          WARNING_SEVERITY[w.split(':')[0]] === 'CRITICAL'
        ).length;
        
        if (criticalWarningCount > 0 && market.analysis.confidenceLevel) {
          market.analysis.confidenceLevel = Math.max(20, market.analysis.confidenceLevel - (criticalWarningCount * 15));
        }
      }
      
      return market;
    }));
  }
  
  /**
   * Fill gaps with fallback queries
   */
  private async fillMetricGapsWithFallbacks(
    missingByCity: Array<{city: string; state: string; metric: string}>,
    tavilySearch: (q: string) => Promise<any>
  ): Promise<ResearchFinding[]> {
    const results: ResearchFinding[] = [];
    
    for (const m of missingByCity) {
      console.log(`   🔄 Attempting fallback for ${m.city} - ${m.metric}`);
      
      // Try multiple fallback levels
      const fallbackQueries = [
        // 1. County level
        `${m.metric} for ${m.city} county ${m.state} 2024 site:zillow.com OR site:rentdata.org`,
        // 2. State percentile
        `${m.metric} ${m.state} 60th percentile cities by population 2024`,
        // 3. Similar sized cities
        `${m.metric} comparable cities to ${m.city} ${m.state} 2024 site:census.gov OR site:zillow.com`,
        // 4. State average
        `${m.metric} ${m.state} state average 2024`
      ];
      
      for (const query of fallbackQueries) {
        try {
          const result = await tavilySearch(query);
          if (result?.answer || result?.results?.length) {
            const best = result.results?.[0] || result;
            results.push({
              query,
              source: hostOf(best.url) || 'fallback',
              url: best.url,
              data: result,
              confidence: 'LOW', // Mark as estimated
              timestamp: new Date().toISOString(),
              asOf: this.extractDataDate(best.snippet || result.answer || ''),
              effectiveWeight: 0.5 // Lower weight for fallback data
            });
            break; // Stop at first successful fallback
          }
        } catch (error) {
          console.warn(`     Fallback failed: ${query.substring(0, 50)}...`);
        }
      }
    }
    
    return results;
  }

  private eliminatedMarkets: any[] = [];
  private rankingMethodology: string = '';
  private dataGaps: string[] = [];

  /**
   * Helper: Group queries by metric for validation
   */
  private groupQueriesByMetric(queries: DiscoveryQuery[]): Record<string, DiscoveryQuery[]> {
    const groups: Record<string, DiscoveryQuery[]> = {};
    
    queries.forEach(q => {
      if (!groups[q.metric]) {
        groups[q.metric] = [];
      }
      groups[q.metric].push(q);
    });
    
    return groups;
  }

  /**
   * Helper: Assess confidence in research data
   */
  private async assessDataConfidence(data: any, validationCriteria: string, asOf?: string): Promise<'HIGH' | 'MEDIUM' | 'LOW'> {
    const plain = (data?.answer || data?.results?.[0]?.snippet || '').toString();
    if (!plain) return 'LOW';
    
    // Check if answer contains specific numbers
    const hasNumbers = /\d/.test(plain);
    if (!hasNumbers) return 'LOW';
    
    // Check source quality
    const sourceWeights = await configRegistry.getValue('source-weights', {});
    const weights = sourceWeights.weights || {};
    const hasGoodSource = data.sources?.some(s => {
      const url = s.url?.toLowerCase() || '';
      return weights[hostOf(url)] >= 0.8;
    });
    
    // Recency check
    const currentYear = new Date().getFullYear();
    let isRecent = false;
    if (asOf) {
      const dataYear = new Date(asOf).getFullYear();
      isRecent = dataYear >= currentYear - 1;
    } else {
      isRecent = plain.includes(currentYear.toString()) || 
                 plain.includes(`${currentYear - 1}`);
    }
    
    if (isRecent && hasNumbers && hasGoodSource) return 'HIGH';
    if ((isRecent || hasGoodSource) && hasNumbers) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Extract data date from text with multiple patterns
   */
  private extractDataDate(text: string): string | undefined {
    const patterns = [
      // "As of December 2024"
      /\b(?:As of|as of|Updated|Last updated|Through)\s+([A-Z][a-z]+\s+\d{4})/i,
      // "Q3 2024", "2024-Q3"
      /\b(Q[1-4]\s+20\d{2}|20\d{2}-Q[1-4])/i,
      // "YTD 2024", "TTM 2024"
      /\b(YTD|TTM|LTM)\s+(20\d{2})/i,
      // ISO dates "2024-12-01"
      /\b(20\d{2}-\d{2}-\d{2})\b/,
      // "December 2024" standalone
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i,
      // "12/2024" or "12/01/2024"
      /\b(\d{1,2}\/\d{1,2}\/20\d{2}|\d{1,2}\/20\d{2})\b/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          // Clean up the match
          const dateStr = match[0].replace(/^(As of|as of|Updated|Last updated|Through)\s+/i, '');
          
          // Handle special cases
          if (dateStr.includes('Q')) {
            // Convert Q3 2024 to September 2024
            const [quarter, year] = dateStr.replace(/[Q-]/g, ' ').trim().split(/\s+/);
            const monthMap = { '1': '03', '2': '06', '3': '09', '4': '12' };
            return new Date(`${year}-${monthMap[quarter]}-01`).toISOString();
          }
          
          if (dateStr.includes('YTD') || dateStr.includes('TTM')) {
            const year = dateStr.match(/20\d{2}/)?.[0];
            return year ? new Date(`${year}-${new Date().getMonth() + 1}-01`).toISOString() : undefined;
          }
          
          return new Date(dateStr).toISOString();
        } catch (e) {
          // Invalid date, continue
        }
      }
    }
    
    return undefined;
  }

  /**
   * Compile final result with complete transparency
   */
  private compileResult(
    metaReqs: MetricRequirements,
    rankedMarkets: MarketCandidate[],
    queries: DiscoveryQuery[],
    findings: ResearchFinding[]
  ): MarketDiscoveryResult {
    const successfulQueries = findings.filter(f => f.confidence !== 'LOW').length;
    const multiSourceMetrics = this.countMultiSourceValidations(findings);
    
    // Calculate weighted average confidence
    const avgEffectiveWeight = findings.reduce((sum, f) => sum + (f.effectiveWeight || 0.5), 0) / Math.max(1, findings.length);
    
    // Assess data quality with cross-metric issues
    const crossMetricIssueCount = this.crossMetricIssues.length;
    const hasHighSeverityIssues = this.crossMetricIssues.some(issue => 
      issue.warnings.some(w => {
        const severity = Object.entries(WARNING_SEVERITY).find(([pattern]) => 
          w.toLowerCase().includes(pattern.toLowerCase())
        )?.[1];
        return severity === 'CRITICAL' || severity === 'HIGH';
      })
    );
    
    // Adjust confidence based on data quality
    let baseConfidence = this.assessOverallConfidence(successfulQueries, queries.length);
    if (hasHighSeverityIssues) {
      baseConfidence = baseConfidence === 'HIGH' ? 'MEDIUM' : 
                      baseConfidence === 'MEDIUM' ? 'LOW' : 'LOW';
    }
    
    // FAIL-SOFT: Always return results, even if partial
    let finalMarkets = rankedMarkets.slice(0, 3);
    let warnings: string[] = [];
    
    // If we have no candidate markets but have some data, show what we found
    if (finalMarkets.length === 0 && this.eliminatedMarkets.length > 0) {
      console.log(`   ⚠️ FAIL-SOFT: No perfect matches, showing closest candidates with warnings`);
      
      // Convert eliminated markets to candidates with warnings
      finalMarkets = this.eliminatedMarkets.slice(0, 3).map(em => ({
        city: em.city,
        state: 'MA',
        metrics: {},
        dataQuality: { sourcesCount: 1, agreementLevel: 'LOW', lastUpdated: 'Unknown' },
        analysis: {
          strengths: [],
          weaknesses: [em.reason],
          investorAlignment: 'Does not meet all criteria',
          confidenceLevel: 25
        },
        recommendation: `PARTIAL DATA: ${em.reason}`
      } as MarketCandidate));
      
      warnings.push('No cities fully meet criteria - showing closest matches');
      warnings.push('Consider adjusting budget expectations or income goals');
    }
    
    // Add warnings for data quality issues
    if (hasHighSeverityIssues) {
      warnings.push('High severity data quality issues detected');
    }
    if (avgEffectiveWeight < 0.5) {
      warnings.push('Overall data quality is low - many sources had no data');
    }
    if (successfulQueries < queries.length * 0.3) {
      warnings.push(`Only ${successfulQueries}/${queries.length} queries returned usable data`);
    }
    
    // Add specific data gap warnings
    const missingCritical = ['median_price', 'median_rent', 'vacancy_rate'].filter(metric => 
      !findings.some(f => f.query.toLowerCase().includes(metric) && f.hasData)
    );
    if (missingCritical.length > 0) {
      warnings.push(`Missing critical data: ${missingCritical.join(', ')}`);
    }
    
    return {
      metaDiscovery: metaReqs,
      candidateMarkets: finalMarkets,
      eliminatedMarkets: this.eliminatedMarkets,
      methodology: this.rankingMethodology,
      dataValidation: {
        totalQueries: queries.length,
        successfulQueries,
        multiSourceValidations: multiSourceMetrics,
        dataFreshness: this.assessOverallFreshness(findings),
        averageEffectiveWeight: Math.round(avgEffectiveWeight * 100) / 100,
        crossMetricIssuesCount: crossMetricIssueCount,
        hasHighSeverityIssues
      },
      confidence: baseConfidence,
      warnings,  // New field for fail-soft warnings
      discoveryQueries: queries,
      researchData: findings,
      dataGaps: this.dataGaps,
      crossMetricIssues: this.crossMetricIssues
    } as any;
  }

  private countMultiSourceValidations(findings: ResearchFinding[]): number {
    const metricSources = new Map<string, Set<string>>();
    
    findings.forEach(f => {
      const metric = f.query.split(' ').find(word => word.includes('price') || word.includes('rent') || word.includes('rate')) || 'unknown';
      if (!metricSources.has(metric)) {
        metricSources.set(metric, new Set());
      }
      metricSources.get(metric).add(f.source);
    });
    
    return Array.from(metricSources.values()).filter(sources => sources.size > 1).length;
  }

  private assessOverallFreshness(findings: ResearchFinding[]): string {
    const currentYear = new Date().getFullYear();
    const recentFindings = findings.filter(f => 
      f.data?.answer?.includes(currentYear.toString()) ||
      f.data?.answer?.includes('2024')
    );
    
    const freshness = recentFindings.length / findings.length;
    if (freshness > 0.7) return 'Current (2024 data)';
    if (freshness > 0.4) return 'Mixed (some 2024, some older)';
    return 'Potentially stale';
  }

  private assessOverallConfidence(successful: number, total: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    const ratio = successful / total;
    if (ratio > 0.7) return 'HIGH';
    if (ratio > 0.4) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Adjust metric sensitivities based on investor profile
   */
  private async adjustSensitivityForInvestor(profile: InvestorProfile): Promise<Record<string, { normalSpread: number }>> {
    // Clone default sensitivities
    const reconciliationConfig = await configRegistry.getValue('reconciliation', {});
    const metricSensitivity = reconciliationConfig.metricSensitivity || {};
    const adjusted = JSON.parse(JSON.stringify(metricSensitivity));
    
    // Cash flow focused investors
    const isCashflow = profile.monthlyIncomeTarget && profile.monthlyIncomeTarget >= (profile.availableCash || 250000) * 0.01;
    if (isCashflow) {
      // Tighter tolerance on rent (more important)
      adjusted.median_rent.normalSpread = 0.06;
      adjusted.vacancy_rate.normalSpread = 0.15;
      // Looser tolerance on price (less important)
      adjusted.median_price.normalSpread = 0.12;
    }
    
    // Appreciation focused investors
    if (profile.investmentGoals?.toLowerCase().includes('appreciation')) {
      // Tighter tolerance on price and growth metrics
      adjusted.median_price.normalSpread = 0.07;
      adjusted.rent_growth_yoy.normalSpread = 0.20;
      // Looser tolerance on current rent
      adjusted.median_rent.normalSpread = 0.12;
    }
    
    // Urgent timeline - need more certainty
    if (profile.timeline?.toLowerCase().includes('1 month') || 
        profile.timeline?.toLowerCase().includes('30 day')) {
      // Reduce all tolerances by 20%
      Object.keys(adjusted).forEach(key => {
        adjusted[key].normalSpread *= 0.8;
      });
    }
    
    // Conservative investors (high cash, low leverage)
    if (profile.availableCash && profile.availableCash > 500000) {
      // More tolerance for variance (can absorb risk)
      Object.keys(adjusted).forEach(key => {
        adjusted[key].normalSpread *= 1.15;
      });
    }
    
    // First-time investors need tighter data
    if (profile.investmentExperience?.toLowerCase().includes('beginner') ||
        profile.investmentExperience?.toLowerCase().includes('first')) {
      Object.keys(adjusted).forEach(key => {
        adjusted[key].normalSpread *= 0.9;
      });
    }
    
    return adjusted;
  }
  
  /**
   * Identify source disagreement patterns
   */
  private detectSourceDisagreements(findings: ResearchFinding[]): string[] {
    const warnings: string[] = [];
    
    // Group by metric
    const byMetric = new Map<string, ResearchFinding[]>();
    findings.forEach(f => {
      const metric = f.query.split(' ').find(w => 
        w.includes('price') || w.includes('rent') || w.includes('vacancy')
      ) || 'unknown';
      
      if (!byMetric.has(metric)) {
        byMetric.set(metric, []);
      }
      byMetric.get(metric)!.push(f);
    });
    
    // Check for systematic disagreements
    byMetric.forEach((metricFindings, metric) => {
      const zillow = metricFindings.find(f => f.source.includes('zillow'));
      const redfin = metricFindings.find(f => f.source.includes('redfin'));
      
      if (zillow && redfin) {
        // Extract numeric values for comparison
        const zValue = this.extractNumericFromText(zillow.data?.answer || '');
        const rValue = this.extractNumericFromText(redfin.data?.answer || '');
        
        if (zValue && rValue) {
          const ratio = zValue / rValue;
          if (ratio > 1.2) {
            warnings.push(`Zillow ${metric} 20%+ higher than Redfin - possible listing status mismatch`);
          } else if (ratio < 0.8) {
            warnings.push(`Zillow ${metric} 20%+ lower than Redfin - check data freshness`);
          }
        }
      }
    });
    
    return warnings;
  }
  
  /**
   * Extract numeric value from text
   */
  private extractNumericFromText(text: string): number | null {
    const match = text.match(/\$?([\d,]+)/);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
  }
}

// Export singleton
export const marketDiscoveryAgent = new MarketDiscoveryAgent();