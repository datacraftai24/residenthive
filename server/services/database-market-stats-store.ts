import { db } from '../db.js';
import { MarketStat, MarketMetric, GeoLevel } from './market-schemas.js';

/**
 * Database-powered MarketStatsStore that extracts market data from investment_strategies
 * This replaces the JSON file-based approach with real database data
 */
export class DatabaseMarketStatsStore {
  private cache = new Map<string, MarketStat>();
  private initialized = false;
  
  // Stats tracking for dashboard
  private stats = {
    hits: new Map<string, number>(),
    misses: new Map<string, number>(),
    fallbackDepths: [] as number[],
    confidenceCounts: new Map<string, number>()
  };

  private makeKey(metric: MarketMetric, level: GeoLevel, geoId: string, bed: number | "all") {
    return `${metric}:${level}:${geoId.toLowerCase()}:${bed}`;
  }

  async initialize() {
    if (this.initialized) return;

    console.log('🔍 Loading market data from database...');
    
    try {
      // Extract market data from completed investment strategies
      const result = await db.execute(`
        SELECT 
          market_analysis,
          financial_projections,
          created_at
        FROM investment_strategies 
        WHERE status = 'complete' 
        AND market_analysis IS NOT NULL 
        AND market_analysis::jsonb <> '{}'::jsonb
      `);

      const strategies = (Array.isArray(result)
        ? result
        : ((result as { rows?: unknown[] }).rows ?? [])) as any[];
      console.log(`📊 Found ${strategies.length} investment strategies with market data`);

      let statsExtracted = 0;
      
      for (const strategy of strategies) {
        const marketAnalysis = this.parseJSON(strategy.market_analysis);
        const financialProjections = this.parseJSON(strategy.financial_projections);
        
        if (marketAnalysis) {
          // Extract rental income estimates (using avg_rent_bed metric)
          if (marketAnalysis.expectedRentalIncome || marketAnalysis.averageRent) {
            const rentValue = this.extractNumber(marketAnalysis.expectedRentalIncome || marketAnalysis.averageRent);
            if (rentValue !== null) {
              this.addMarketStat('avg_rent_bed', 'city', 'boston', 'all', rentValue, strategy.created_at);
              statsExtracted++;
            }
          }

          // Extract rent per sqft data
          if (marketAnalysis.rentPerSqft || marketAnalysis.rpsf) {
            const rpsfValue = this.extractNumber(marketAnalysis.rentPerSqft || marketAnalysis.rpsf);
            if (rpsfValue !== null) {
              this.addMarketStat('rent_rpsf', 'city', 'boston', 'all', rpsfValue, strategy.created_at);
              statsExtracted++;
            }
          }

          // Extract GRM (Gross Rent Multiplier) if available
          if (marketAnalysis.grm || marketAnalysis.grossRentMultiplier) {
            const grmValue = this.extractNumber(marketAnalysis.grm || marketAnalysis.grossRentMultiplier);
            if (grmValue !== null) {
              this.addMarketStat('grm', 'city', 'boston', 'all', grmValue, strategy.created_at);
              statsExtracted++;
            }
          }
        }

        // Extract rental income estimates from financial projections
        if (financialProjections?.expectedRentalIncome || financialProjections?.expectedMonthlyRent) {
          const rentValue = this.extractNumber(
            financialProjections.expectedRentalIncome || 
            financialProjections.expectedMonthlyRent
          );
          if (rentValue !== null) {
            this.addMarketStat('avg_rent_bed', 'city', 'boston', 'all', rentValue, strategy.created_at);
            statsExtracted++;
          }
        }
      }

      // Add some default fallback data if we don't have enough
      if (statsExtracted < 10) {
        this.addDefaultFallbackData();
      }

      console.log(`✅ Extracted ${statsExtracted} market statistics from database`);
      console.log(`📈 Total cached stats: ${this.cache.size}`);
      
      this.initialized = true;
      
    } catch (error) {
      console.error('❌ Failed to load market data from database:', error);
      // Add fallback data so the system still works
      this.addDefaultFallbackData();
      this.initialized = true;
    }
  }

  private parseJSON(jsonString: any): any {
    if (typeof jsonString === 'object') return jsonString;
    if (typeof jsonString !== 'string') return null;
    
    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  }

  private extractPercentage(text: string): number | null {
    if (typeof text !== 'string') return null;
    
    // Look for patterns like "12.5%", "7.8%", "5.6%"
    const match = text.match(/(\d+\.?\d*)\s*%/);
    if (match) {
      return parseFloat(match[1]);
    }
    
    // Look for decimal patterns like "0.125" (12.5%)
    const decimalMatch = text.match(/(\d\.\d+)/);
    if (decimalMatch) {
      const value = parseFloat(decimalMatch[1]);
      // If it's less than 1, assume it's already a percentage in decimal form
      return value < 1 ? value * 100 : value;
    }
    
    return null;
  }

  private extractNumber(text: string | number): number | null {
    if (typeof text === 'number') return text;
    if (typeof text !== 'string') return null;
    
    // Remove common currency symbols and commas
    const cleaned = text.replace(/[$,]/g, '');
    const match = cleaned.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  private addMarketStat(
    metric: MarketMetric, 
    level: GeoLevel, 
    geoId: string, 
    bed: number | "all", 
    value: number,
    createdAt: string
  ) {
    const key = this.makeKey(metric, level, geoId, bed);
    
    // Only add if we don't already have this stat or if this one is newer
    const existing = this.cache.get(key);
    const statDate = new Date(createdAt);
    
    if (!existing || new Date(existing.updated_at) < statDate) {
      const stat: MarketStat = {
        metric,
        geo: { level, id: geoId.toLowerCase() },
        bed,
        value,
        sigma: value * 0.1, // 10% standard deviation estimate
        n_samples: 10, // Estimated sample size
        updated_at: createdAt
      };
      
      this.cache.set(key, stat);
    }
  }

  private addDefaultFallbackData() {
    console.log('📊 Adding fallback market data...');
    const now = new Date().toISOString();
    
    // Boston market data based on typical values (using valid MarketMetric types)
    const fallbackStats = [
      { metric: 'rent_rpsf', geo: 'boston', value: 3.2, bed: 'all' },
      { metric: 'avg_rent_bed', geo: 'boston', value: 2800, bed: 1 },
      { metric: 'avg_rent_bed', geo: 'boston', value: 3400, bed: 2 },
      { metric: 'avg_rent_bed', geo: 'boston', value: 4200, bed: 3 },
      { metric: 'grm', geo: 'boston', value: 15.5, bed: 'all' }, // Typical GRM for Boston
      { metric: 'unit_sqft', geo: 'boston', value: 850, bed: 'all' }, // Average unit size
    ];

    for (const stat of fallbackStats) {
      this.addMarketStat(
        stat.metric as MarketMetric,
        'city',
        stat.geo,
        stat.bed as any,
        stat.value,
        now
      );
    }
  }

  async get(metric: MarketMetric, level: GeoLevel, geoId: string, bed: number | "all"): Promise<MarketStat | null> {
    await this.initialize();
    
    const key = this.makeKey(metric, level, geoId, bed);
    const stat = this.cache.get(key) ?? null;
    
    // Track hit/miss for analytics
    if (stat) {
      this.stats.hits.set(metric, (this.stats.hits.get(metric) || 0) + 1);
    } else {
      this.stats.misses.set(metric, (this.stats.misses.get(metric) || 0) + 1);
    }
    
    return stat;
  }

  async getWithFallback(
    metric: MarketMetric,
    level: GeoLevel,
    geoId: string,
    bed: number | "all",
    fallbacks: Array<{ level: GeoLevel; geoId: string; bed: number | "all" }>
  ): Promise<{ stat: MarketStat | null; fallbackDepth: number; stalenessDays: number }> {
    await this.initialize();
    
    // Try primary first
    let stat = await this.get(metric, level, geoId, bed);
    let depth = 0;
    
    // Try fallbacks
    if (!stat && fallbacks.length > 0) {
      for (const fallback of fallbacks) {
        depth++;
        stat = await this.get(metric, fallback.level, fallback.geoId, fallback.bed);
        if (stat) break;
      }
    }
    
    const stalenessDays = stat ? 
      Math.floor((Date.now() - new Date(stat.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : 
      999;
    
    if (depth > 0) {
      this.stats.fallbackDepths.push(depth);
    }
    
    return { stat, fallbackDepth: depth, stalenessDays };
  }

  trackConfidence(confidence: string) {
    this.stats.confidenceCounts.set(
      confidence, 
      (this.stats.confidenceCounts.get(confidence) || 0) + 1
    );
  }

  getStats() {
    return {
      totalStats: this.cache.size,
      hits: Object.fromEntries(this.stats.hits),
      misses: Object.fromEntries(this.stats.misses),
      avgFallbackDepth: this.stats.fallbackDepths.length > 0 ? 
        this.stats.fallbackDepths.reduce((a, b) => a + b) / this.stats.fallbackDepths.length : 0,
      confidenceCounts: Object.fromEntries(this.stats.confidenceCounts)
    };
  }

  getDashboardStats() {
    return this.getStats();
  }

  async upsert(stat: MarketStat) {
    // For database version, we could implement this to save back to DB
    // For now, just update the cache
    const key = this.makeKey(stat.metric, stat.geo.level, stat.geo.id, stat.bed);
    this.cache.set(key, stat);
    console.log(`💾 Updated market stat: ${key}`);
  }

  async save() {
    // No-op for database version - data is already persisted in DB
    console.log('💾 Database-backed store - no manual save needed');
  }
}

// Create singleton instance
export const databaseMarketStatsStore = new DatabaseMarketStatsStore();
export type { DatabaseMarketStatsStore as MarketStatsStore };
