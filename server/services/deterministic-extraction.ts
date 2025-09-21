/**
 * Deterministic Market Metrics Extraction
 * NO GUESSING. NO QUESTION PARSING. KEY-BASED ONLY.
 */

import type { ResearchItem, Band, MarketMetrics, MetricsValidation } from '../../types/research';
import { validateMetric, normalizeRate } from '../../shared/metrics/registry';

const SPREAD = { low: 0.93, high: 1.07 };

const clampRent = ([lo, hi]: [number, number]): [number, number] => {
  let L = Math.round(lo), H = Math.round(hi);
  
  // Fix magnitude issues
  if (H < 100) { L *= 100; H *= 100; } 
  else if (H < 800) { L *= 10; H *= 10; }
  while (H > 10000) { L = Math.round(L / 10); H = Math.round(H / 10); }
  
  // Fix spread issues
  if (H / L > 1.8) {
    const m = Math.round((L + H) / 2);
    L = Math.floor(m * SPREAD.low);
    H = Math.ceil(m * SPREAD.high);
  }
  
  // Apply hard limits
  L = Math.max(700, Math.min(L, 6000));
  H = Math.max(800, Math.min(H, 6000));
  
  if (H <= L) throw new Error('rent invalid');
  return [L, H];
};

const bandFromPoint = (v: number): [number, number] => 
  [Math.floor(v * SPREAD.low), Math.ceil(v * SPREAD.high)];

/**
 * Extract market metrics using ONLY canonical keys
 * NO QUESTION PARSING ALLOWED
 */
export function extractMarketMetrics(rows: ResearchItem[], city: string): MarketMetrics {
  console.log(`\n📊 [Deterministic Extraction] Processing ${rows.length} research items`);
  console.log(`   City: ${city}`);
  
  const mm: MarketMetrics = {
    priceBands: {},
    rentBands: {},
    market: { city },
    rates: { sourceIds: [] }
  };
  
  // Process ONLY by canonical key
  for (const r of rows) {
    const a = r.answer;
    const src = r.id;
    
    switch (r.key) {
      case 'sf_price_median':
        if (typeof a === 'number' && a > 50000) {
          mm.priceBands.singleFamily = {
            min: Math.floor(a * 0.85),
            max: Math.ceil(a * 1.15),
            sourceIds: [src]
          };
          console.log(`   ✅ SF price: $${a.toLocaleString()} → [$${mm.priceBands.singleFamily.min.toLocaleString()}, $${mm.priceBands.singleFamily.max.toLocaleString()}]`);
        }
        break;
        
      case 'mf_price_median':
        if (typeof a === 'number' && a > 50000) {
          mm.priceBands.multiFamily = {
            min: Math.floor(a * 0.85),
            max: Math.ceil(a * 1.15),
            sourceIds: [src]
          };
          console.log(`   ✅ MF price: $${a.toLocaleString()} → [$${mm.priceBands.multiFamily.min.toLocaleString()}, $${mm.priceBands.multiFamily.max.toLocaleString()}]`);
        }
        break;
        
      case 'avg_rent_2br':
        if (typeof a === 'number' && a >= 800 && a <= 6000) {
          mm.rentBands.point2Br = { value: Math.round(a), sourceId: src };
          console.log(`   ✅ 2BR rent point: $${a}`);
        } else if (typeof a === 'object' && a?.range) {
          // Handle if answer is {range: {min, max}}
          const avg = (a.range.min + a.range.max) / 2;
          if (avg >= 800 && avg <= 6000) {
            mm.rentBands.point2Br = { value: Math.round(avg), sourceId: src };
            console.log(`   ✅ 2BR rent from range: $${avg}`);
          }
        }
        break;
        
      case 'rent_range_2br':
        if (a?.min != null && a?.max != null) {
          mm.rentBands.twoBr = { min: +a.min, max: +a.max, sourceIds: [src] };
          console.log(`   ✅ 2BR rent range: [$${a.min}, $${a.max}]`);
        }
        break;
        
      case 'dom_p10_p90':
        if (a?.min != null && a?.max != null) {
          mm.market.domDays = { min: +a.min, max: +a.max, sourceIds: [src] };
          console.log(`   ✅ DOM: ${a.min}-${a.max} days`);
        }
        break;
        
      case 'sale_psf_p10_p90':
        if (a?.min != null && a?.max != null) {
          mm.market.salePsf = { min: +a.min, max: +a.max, sourceIds: [src] };
          console.log(`   ✅ Sale $/PSF: $${a.min}-$${a.max}`);
        }
        break;
        
      case 'rate_30yr_conventional': {
        const v = typeof a === 'number' ? a : 
                  (a?.['30_year_fixed']?.rate ?? a?.rate);
        if (v != null) {
          // Normalize and validate using registry
          const normalized = normalizeRate('rate_30yr_conventional', v);
          if (validateMetric('rate_30yr_conventional', normalized)) {
            mm.rates.conventional = normalized;
            mm.rates.sourceIds.push(src);
            console.log(`   ✅ Conventional rate: ${(mm.rates.conventional * 100).toFixed(2)}%`);
          } else {
            console.log(`   ❌ Invalid conventional rate: ${v} (must be 3-10%)`);
          }
        }
        break;
      }
      
      case 'rate_fha': {
        const v = typeof a === 'number' ? a : a?.interest_rate;
        if (v != null) {
          // Normalize and validate using registry
          const normalized = normalizeRate('rate_fha', v);
          if (validateMetric('rate_fha', normalized)) {
            mm.rates.fha = normalized;
            mm.rates.sourceIds.push(src);
            console.log(`   ✅ FHA rate: ${(mm.rates.fha * 100).toFixed(2)}%`);
          } else {
            console.log(`   ❌ Invalid FHA rate: ${v} (must be 3-10%)`);
          }
        }
        break;
      }
      
      case 'fha_loan_limit': {
        // Handle FHA loan limit separately - NOT a rate!
        if (typeof a === 'number' && validateMetric('fha_loan_limit', a)) {
          // Store separately if needed, but not in rates
          console.log(`   ✅ FHA loan limit: $${a.toLocaleString()} (not a rate)`);
        } else {
          console.log(`   ❌ Invalid FHA loan limit: ${a}`);
        }
        break;
      }
      
      default:
        // Ignore non-comp keys (vacancy, tax, insurance)
        console.log(`   ⚠️ Ignoring key: ${r.key}`);
        break;
    }
  }
  
  // Telemetry digest - FORCE VISIBILITY
  const sf = mm.priceBands.singleFamily;
  const mf = mm.priceBands.multiFamily;
  const rent = mm.rentBands.twoBr;
  const dom = mm.market.domDays;
  const psf = mm.market.salePsf;
  const conv = mm.rates.conventional;
  const fha = mm.rates.fha;
  
  const digest = [
    `[metrics] ${mm.market.city}`,
    sf ? `SF=[${sf.min?.toLocaleString()},${sf.max?.toLocaleString()}]` : 'SF=MISSING',
    mf ? `MF=[${mf.min?.toLocaleString()},${mf.max?.toLocaleString()}]` : 'MF=MISSING',
    rent ? `2BR=[${rent.min},${rent.max}]` : '2BR=MISSING',
    dom ? `DOM=[${dom.min},${dom.max}]` : 'DOM=MISSING',
    psf ? `PSF=[${psf.min},${psf.max}]` : 'PSF=MISSING',
    conv ? `Conv=${(conv * 100).toFixed(2)}%` : 'Conv=MISSING',
    fha ? `FHA=${(fha * 100).toFixed(2)}%` : 'FHA=MISSING'
  ].join(' | ');
  
  console.log(`\n📊 ${digest}\n`);
  
  return mm;
}

/**
 * Derive 2BR band from point and/or range
 * Point-first, with clamping
 */
export function deriveTwoBr(mm: MarketMetrics): Band | null {
  const cands: Array<{ rng: [number, number]; src: string[]; kind: 'point' | 'range' }> = [];
  
  if (mm.rentBands.point2Br) {
    cands.push({
      rng: bandFromPoint(mm.rentBands.point2Br.value),
      src: [mm.rentBands.point2Br.sourceId],
      kind: 'point'
    });
  }
  
  if (mm.rentBands.twoBr?.min != null && mm.rentBands.twoBr?.max != null) {
    cands.push({
      rng: [mm.rentBands.twoBr.min, mm.rentBands.twoBr.max],
      src: mm.rentBands.twoBr.sourceIds,
      kind: 'range'
    });
  }
  
  if (!cands.length) return null;
  
  // If we have a point, filter ranges that are too far off
  const point = cands.find(c => c.kind === 'point');
  const use = point ? cands.filter(c => {
    if (c.kind === 'point') return true;
    const pm = (point.rng[0] + point.rng[1]) / 2;
    const rm = (c.rng[0] + c.rng[1]) / 2;
    return rm >= pm * 0.7 && rm <= pm * 1.3;
  }) : cands;
  
  // Compute envelope
  const env = use.map(c => c.rng).reduce(
    (a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])] as [number, number]
  );
  
  // Clamp and return
  const [L, H] = clampRent(env);
  const src = Array.from(new Set(use.flatMap(c => c.src)));
  
  console.log(`   📊 Derived 2BR band: [$${L}, $${H}] from ${use.length} sources`);
  return { min: L, max: H, sourceIds: src };
}

/**
 * Check if metrics are complete
 */
export function checkMetrics(mm: MarketMetrics): MetricsValidation {
  const missing: string[] = [];
  
  if (!mm.priceBands.singleFamily?.min && !mm.priceBands.multiFamily?.min) {
    missing.push('prices');
  }
  if (!mm.rentBands.point2Br && !mm.rentBands.twoBr) {
    missing.push('rent_2br');
  }
  if (!mm.market.domDays) {
    missing.push('dom');
  }
  if (!mm.market.salePsf) {
    missing.push('sale_psf');
  }
  if (!mm.rates.conventional && !mm.rates.fha) {
    missing.push('rates');
  }
  
  const critical = missing.includes('prices') || missing.includes('rent_2br') || missing.includes('rates');
  
  if (missing.length > 0) {
    console.log(`   ❌ Missing metrics: ${missing.join(', ')}`);
  } else {
    console.log(`   ✅ All metrics present`);
  }
  
  return { 
    ok: missing.length === 0, 
    missing,
    critical
  };
}

/**
 * Generate targeted queries for missing metrics
 */
export function generateMissingQueries(missing: string[], city: string): Array<{
  query: string;
  key: string;
}> {
  const queries: Array<{ query: string; key: string }> = [];
  
  for (const m of missing) {
    switch (m) {
      case 'prices':
        queries.push({
          query: `What is the median sale price for single-family homes in ${city}?`,
          key: 'sf_price_median'
        });
        queries.push({
          query: `What is the median sale price for 2-4 unit properties in ${city}?`,
          key: 'mf_price_median'
        });
        break;
      case 'rent_2br':
        queries.push({
          query: `What is the average monthly rent for a 2-bedroom apartment in ${city}?`,
          key: 'avg_rent_2br'
        });
        break;
      case 'dom':
        queries.push({
          query: `What are the 10th and 90th percentile Days on Market for ${city} in the last 12 months?`,
          key: 'dom_p10_p90'
        });
        break;
      case 'sale_psf':
        queries.push({
          query: `What are the 10th and 90th percentile sale price per square foot for ${city} in the last 12 months?`,
          key: 'sale_psf_p10_p90'
        });
        break;
      case 'rates':
        queries.push({
          query: `What is the current 30-year conventional mortgage rate?`,
          key: 'rate_30yr_conventional'
        });
        break;
    }
  }
  
  return queries;
}

/**
 * Log metrics digest for monitoring
 */
export function logMetricsDigest(mm: MarketMetrics): void {
  const sf = mm.priceBands.singleFamily;
  const mf = mm.priceBands.multiFamily;
  const rent = mm.rentBands.twoBr || (mm.rentBands.point2Br ? 
    { min: mm.rentBands.point2Br.value, max: mm.rentBands.point2Br.value, sourceIds: [] } : null);
  const dom = mm.market.domDays;
  const psf = mm.market.salePsf;
  
  console.log(`\n📊 METRICS DIGEST: {
    SF: ${sf ? `[$${sf.min?.toLocaleString()}, $${sf.max?.toLocaleString()}]` : 'MISSING'}
    MF: ${mf ? `[$${mf.min?.toLocaleString()}, $${mf.max?.toLocaleString()}]` : 'MISSING'}
    2BR: ${rent ? `[$${rent.min}, $${rent.max}]` : 'MISSING'}
    DOM: ${dom ? `[${dom.min}, ${dom.max}]` : 'MISSING'}
    PSF: ${psf ? `[$${psf.min}, $${psf.max}]` : 'MISSING'}
    Rates: { conv: ${mm.rates.conventional ? (mm.rates.conventional * 100).toFixed(2) + '%' : 'MISSING'}, fha: ${mm.rates.fha ? (mm.rates.fha * 100).toFixed(2) + '%' : 'MISSING'} }
    City: ${mm.market.city}
  }\n`);
}