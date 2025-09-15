import type { ResearchResult } from '../ai-agents/smart-research-agent.js';
import type { MarketStat } from './market-schemas.js';

export class ResearchToMarketExtractor {
  
  private parseRentString(s: string): { kind: 'rpsf' | 'avg'; value: number; sigma?: number } | null {
    const money = /\$?\s*([\d,]+(?:\.\d+)?)/g;
    const perSqft = /\/\s*(sf|sqft|ft2)\s*(\/\s*(mo|month))?/i;
    
    const vals = [...s.toString().matchAll(money)].map(m => parseFloat(m[1].replace(/,/g,'')));
    const isRpsf = perSqft.test(s.toString());
    
    if (vals.length >= 2) {
      const [min, max] = [Math.min(...vals), Math.max(...vals)];
      return { 
        kind: isRpsf ? 'rpsf' : 'avg', 
        value: (min + max) / 2, 
        sigma: (max - min) / 2.698  // Range to sigma
      };
    }
    if (vals.length === 1) {
      return { 
        kind: isRpsf ? 'rpsf' : 'avg', 
        value: vals[0],
        sigma: vals[0] * 0.15  // Conservative 15% if single value
      };
    }
    return null;
  }
  
  extractMarketStats(
    researchResults: ResearchResult[],
    location: string
  ): MarketStat[] {
    const stats: MarketStat[] = [];
    const now = new Date().toISOString();
    
    // Parse location - NO DEFAULTS
    let city: string | undefined;
    let state: string | undefined;
    
    if (location.includes(',')) {
      [city, state] = location.split(',').map(s => s.trim());
    } else if (location.trim().length === 2) {
      state = location.trim();
    } else {
      city = location.trim();
    }
    
    researchResults.forEach(result => {
      const key = (result as any).key;
      
      // Parse rent data
      if (result.answer) {
        const parsed = this.parseRentString(result.answer.toString());
        if (parsed) {
          // Determine bed count from question
          let bed: number | 'all' = 'all';
          const bedMatch = result.question.match(/(\d)[\s-]?(?:bed|br)/i);
          if (bedMatch) {
            bed = parseInt(bedMatch[1]);
          }
          
          if (parsed.kind === 'rpsf' && city) {
            stats.push({
              metric: 'rent_rpsf',
              geo: { level: 'city', id: city },
              bed,
              value: parsed.value,
              sigma: parsed.sigma,
              n_samples: result.sources?.length || 3,
              updated_at: now,
              sources: result.sources?.slice(0, 3).map(s => ({
                site: 'tavily',
                url: s.url
              }))
            });
          } else if (parsed.kind === 'avg' && city) {
            stats.push({
              metric: 'avg_rent_bed',
              geo: { level: 'city', id: city },
              bed: bed === 'all' ? 2 : bed,  // Default to 2BR if not specified
              value: parsed.value,
              sigma: parsed.sigma,
              n_samples: result.sources?.length || 3,
              updated_at: now,
              sources: result.sources?.slice(0, 3).map(s => ({
                site: 'tavily',
                url: s.url
              }))
            });
          }
        }
      }
      
      // Extract GRM if we have price and rent data
      if (key === 'median_price_sf' || key === 'median_price_mf') {
        const price = this.extractNumber(result.answer);
        const rentStat = stats.find(s => s.metric === 'avg_rent_bed');
        if (price && rentStat && city) {
          const annualGrm = price / (rentStat.value * 12);
          stats.push({
            metric: 'grm',
            geo: { level: 'city', id: city },
            bed: 'all',
            value: annualGrm,
            sigma: annualGrm * 0.15,
            n_samples: Math.min(result.sources?.length || 3, rentStat.n_samples),
            updated_at: now
          });
        }
      }
    });
    
    // Only return stats with sufficient samples
    return stats.filter(s => s.n_samples >= 3);
  }
  
  private extractNumber(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const match = value.match(/[\d,]+\.?\d*/);
      if (match) {
        return parseFloat(match[0].replace(/,/g, ''));
      }
    }
    return null;
  }
}

export const researchToMarketExtractor = new ResearchToMarketExtractor();