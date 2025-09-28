import { databaseMarketStatsStore as marketStatsStore } from './database-market-stats-store.js';

interface RentEstimate {
  point: number;
  band: [number, number];
  confidence: string;
  method: string;
  provenance?: {
    fallback_level?: number;
    staleness_days?: number;
    [key: string]: any;
  };
  notes?: string[];
}

export class RentEstimationDashboard {
  private evaluations: Map<string, any> = new Map();
  
  logEvaluation(propertyAddress: string, estimate: RentEstimate | null) {
    this.evaluations.set(propertyAddress, {
      timestamp: Date.now(),
      confidence: estimate?.confidence || 'FAILED',
      method: estimate?.method || 'none',
      point: estimate?.point,
      band: estimate?.band,
      fallbackLevel: estimate?.provenance?.fallback_level || 999,
      stalenessDays: estimate?.provenance?.staleness_days
    });
  }
  
  printSummary() {
    const total = this.evaluations.size;
    if (total === 0) {
      console.log('\n📊 No properties evaluated yet.\n');
      return;
    }
    
    const byConfidence = new Map<string, number>();
    const fallbackDepths: number[] = [];
    
    for (const evalData of this.evaluations.values()) {
      byConfidence.set(evalData.confidence, (byConfidence.get(evalData.confidence) || 0) + 1);
      if (evalData.fallbackLevel !== 999) {
        fallbackDepths.push(evalData.fallbackLevel);
      }
    }
    
    const avgFallback = fallbackDepths.length > 0 
      ? fallbackDepths.reduce((a, b) => a + b, 0) / fallbackDepths.length 
      : 0;
    
    const stats = marketStatsStore.getDashboardStats();
    
    console.log(`
╔════════════════════════════════════════════════════════════╗
║               RENT ESTIMATION STATS                       ║
╠════════════════════════════════════════════════════════════╣
║ Properties evaluated: ${total.toString().padEnd(36)} ║
║                                                            ║
║ Confidence Breakdown:                                      ║
║   - MARKET_REPORTED: ${this.formatStat(byConfidence.get('MARKET_REPORTED') || 0, total)} ║
║   - COMPS_INFERRED:  ${this.formatStat(byConfidence.get('COMPS_INFERRED') || 0, total)} ║
║   - MARKET_MODELED:  ${this.formatStat(byConfidence.get('MARKET_MODELED') || 0, total)} ║
║   - HEURISTIC:       ${this.formatStat(byConfidence.get('HEURISTIC') || 0, total)} ║
║   - FAILED:          ${this.formatStat(byConfidence.get('FAILED') || 0, total)} ║
║                                                            ║
║ Fallback Stats:                                           ║
║   Average depth: ${avgFallback.toFixed(2)} (0=ZIP, 1=City, 2=County...)      ║
║   ${fallbackDepths.filter(d => d === 0).length} used ZIP, ${fallbackDepths.filter(d => d === 1).length} used City, ${fallbackDepths.filter(d => d >= 2).length} used broader              ║
║                                                            ║
║ Cache Performance:                                         ║
║   Hit rate: ${stats.hitRate}%                                      ║
║   Cache size: ${stats.cacheSize} entries                             ║
║   Avg fallback: ${stats.avgFallbackDepth}                                  ║
╚════════════════════════════════════════════════════════════╝
    `);
  }
  
  private formatStat(count: number, total: number): string {
    const pct = ((count / total) * 100).toFixed(1);
    return `${count.toString().padEnd(5)} (${pct}%)`.padEnd(34);
  }
  
  clear() {
    this.evaluations.clear();
  }
}

export const rentDashboard = new RentEstimationDashboard();