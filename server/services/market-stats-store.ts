import { promises as fs } from "fs";
import path from "path";
import { MarketStatZ, MarketStat, MarketMetric, GeoLevel, normalizeStat, normalizeGeoId } from "./market-schemas.js";

const TTL_DAYS = 365;

export class MarketStatsStore {
  private cache = new Map<string, MarketStat>();
  private dataPath = path.join(process.env.MARKET_STATS_DIR ?? path.dirname(new URL(import.meta.url).pathname), "../../data/market-stats.json");
  private pending?: NodeJS.Timeout;
  
  // Stats tracking for dashboard
  private stats = {
    hits: new Map<string, number>(),
    misses: new Map<string, number>(),
    fallbackDepths: [] as number[],
    confidenceCounts: new Map<string, number>()
  };

  private makeKey(metric: MarketMetric, level: GeoLevel, geoId: string, bed: number | "all") {
    // Include level in key to prevent collision
    return `${metric}:${level}:${normalizeGeoId(level, geoId)}:${bed}`;
  }

  async initialize() {
    await this.loadPersisted();
    const seedDir = path.join(process.env.MARKET_STATS_DIR ?? path.dirname(new URL(import.meta.url).pathname), "../../data/seed-market");
    await this.loadSeedDir(seedDir);
  }

  private async loadPersisted() {
    try {
      const raw = await fs.readFile(this.dataPath, "utf8");
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error("persisted data is not array");
      let ok = 0, failed = 0;
      for (const item of arr) {
        const parsed = MarketStatZ.safeParse(item);
        if (parsed.success) {
          const st = normalizeStat(parsed.data);
          const key = this.makeKey(st.metric, st.geo.level, st.geo.id, st.bed);
          this.cache.set(key, st);
          ok++;
        } else {
          console.warn(`   ⚠️ Invalid stat rejected:`, parsed.error.message);
          failed++;
        }
      }
      console.log(`✅ Loaded ${ok}/${arr.length} market stats (${failed} rejected)`);
    } catch {
      console.log("📊 No existing market stats, starting fresh");
    }
  }

  private async loadSeedDir(dir: string) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(dir, file), "utf8");
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) continue;
        let added = 0, skipped = 0;
        for (const item of arr) {
          const parsed = MarketStatZ.safeParse(item);
          if (!parsed.success) {
            console.warn(`   ⚠️ Invalid seed rejected from ${file}:`, parsed.error.message);
            continue;
          }
          const st = normalizeStat(parsed.data);
          const key = this.makeKey(st.metric, st.geo.level, st.geo.id, st.bed);
          if (!this.cache.has(key)) { 
            this.cache.set(key, st); 
            added++;
          } else {
            skipped++;
          }
        }
        console.log(`   📦 Loaded ${file}: +${added} new, ${skipped} existing`);
      }
    } catch (e) {
      console.log("   ⚠️ No seed data directory");
    }
  }

  async get(metric: MarketMetric, level: GeoLevel, geoId: string, bed: number | "all"): Promise<MarketStat|null> {
    const key = this.makeKey(metric, level, geoId, bed);
    const stat = this.cache.get(key) ?? null;
    
    // Track hit/miss
    if (stat) {
      this.stats.hits.set(metric, (this.stats.hits.get(metric) || 0) + 1);
    } else {
      this.stats.misses.set(metric, (this.stats.misses.get(metric) || 0) + 1);
    }
    
    return stat;
  }

  async getWithFallback(
    metric: MarketMetric,
    geo: { zip?: string; city?: string; county?: string; metro?: string; state?: string },
    bed: number | "all"
  ): Promise<{ stat: MarketStat | null; fallbackDepth: number; stalenessDays: number }> {
    const attempts: Array<[GeoLevel, string|undefined]> = [
      ["zip", geo.zip], 
      ["city", geo.city], 
      ["county", geo.county],
      ["metro", geo.metro], 
      ["state", geo.state], 
      ["national", "US"]
    ];
    
    for (let i = 0; i < attempts.length; i++) {
      const [level, raw] = attempts[i];
      if (!raw) continue;
      
      const stat = await this.get(metric, level, raw, bed);
      if (!stat) continue;
      
      // ENFORCE TTL
      const days = (Date.now() - new Date(stat.updated_at).getTime()) / 86400000;
      if (days > TTL_DAYS) {
        console.log(`   ⏰ Skipping stale stat (${Math.floor(days)} days old): ${metric}:${raw}`);
        continue; // Skip stale data, try next level
      }
      
      // Track fallback depth
      this.stats.fallbackDepths.push(i);
      
      return { stat, fallbackDepth: i, stalenessDays: Math.floor(days) };
    }
    
    return { stat: null, fallbackDepth: attempts.length, stalenessDays: Infinity };
  }

  async upsert(stat: MarketStat): Promise<void> {
    // VALIDATE AND NORMALIZE
    const validated = MarketStatZ.parse(stat);
    const st = normalizeStat(validated);
    
    // ENFORCE MINIMUM SAMPLES
    if (st.n_samples < 3) {
      console.log(`   ⚠️ Skipping upsert; insufficient samples (${st.n_samples} < 3):`, st.metric, st.geo.id);
      return;
    }
    
    const key = this.makeKey(st.metric, st.geo.level, st.geo.id, st.bed);
    this.cache.set(key, st);
    this.persist(); // Debounced
  }

  private persist() {
    clearTimeout(this.pending as any);
    this.pending = setTimeout(async () => {
      try {
        const stats = Array.from(this.cache.values());
        await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
        
        // ATOMIC WRITE
        const tmp = this.dataPath + ".tmp";
        await fs.writeFile(tmp, JSON.stringify(stats, null, 2), "utf8");
        await fs.rename(tmp, this.dataPath);
        
        console.log(`   💾 Persisted ${stats.length} stats`);
      } catch (e) {
        console.error("❌ Persist failed:", e);
      }
    }, 250); // Debounced
  }
  
  // Dashboard stats
  trackConfidence(confidence: string) {
    this.stats.confidenceCounts.set(confidence, (this.stats.confidenceCounts.get(confidence) || 0) + 1);
  }
  
  getDashboardStats() {
    const totalHits = Array.from(this.stats.hits.values()).reduce((a, b) => a + b, 0);
    const totalMisses = Array.from(this.stats.misses.values()).reduce((a, b) => a + b, 0);
    const hitRate = totalHits / Math.max(totalHits + totalMisses, 1);
    
    const avgFallbackDepth = this.stats.fallbackDepths.length > 0
      ? this.stats.fallbackDepths.reduce((a, b) => a + b, 0) / this.stats.fallbackDepths.length
      : 0;
    
    return {
      hitRate: (hitRate * 100).toFixed(1),
      metrics: Object.fromEntries(this.stats.hits),
      avgFallbackDepth: avgFallbackDepth.toFixed(2),
      confidenceBreakdown: Object.fromEntries(this.stats.confidenceCounts),
      cacheSize: this.cache.size
    };
  }
}

export const databaseMarketStatsStore = new MarketStatsStore();