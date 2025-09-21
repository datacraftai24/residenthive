import { z } from "zod";

export const MarketMetricZ = z.enum(["rent_rpsf","unit_sqft","avg_rent_bed","grm"]);
export const GeoLevelZ = z.enum(["zip","city","county","metro","state","national"]);

const SourceZ = z.object({
  site: z.string().min(1),
  url: z.string().min(1),          // allow internal:// seeds
  observed_at: z.string().optional()
});

export const MarketStatZ = z.object({
  metric: MarketMetricZ,
  geo: z.object({ level: GeoLevelZ, id: z.string().min(1) }),
  bed: z.union([z.literal("all"), z.number().int().min(0).max(6)]),
  value: z.number().finite(),
  sigma: z.number().finite().optional(),
  n_samples: z.number().int().min(1),
  updated_at: z.string(),          // ISO
  sources: z.array(SourceZ).optional()
});

export type MarketStat = z.infer<typeof MarketStatZ>;
export type MarketMetric = z.infer<typeof MarketMetricZ>;
export type GeoLevel = z.infer<typeof GeoLevelZ>;

// Normalization helpers
export function normalizeGeoId(level: GeoLevel, id: string) {
  if (!id) return id;
  if (level === "zip") return id.toString().padStart(5, "0");
  return id.trim().toLowerCase();
}

export function normalizeStat(s: MarketStat): MarketStat {
  return {
    ...s,
    geo: { ...s.geo, id: normalizeGeoId(s.geo.level, s.geo.id) },
    value: Number(s.value),
    sigma: s.sigma === undefined ? undefined : Math.abs(Number(s.sigma))
  };
}