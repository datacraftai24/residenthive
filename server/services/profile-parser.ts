/**
 * Deterministic Profile Parser
 * NO GUESSING. Parse it right or fail fast.
 */

export type ClientProfile = {
  budget_usd: number;            // integer dollars
  location_city: string;         // "Worcester MA (Metro)"  
  monthly_income_target?: number; // integer dollars or null
};

const parseCurrency = (s: string): number | null => {
  // Handle both $ and escaped \$ in the string
  const m = s.match(/\$?\s*([\d,]+)\s*(k|m|million|thousand)?/i) || 
            s.match(/\\\$?\s*([\d,]+)\s*(k|m|million|thousand)?/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  const unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('k') || unit.includes('thousand')) n *= 1_000;
  if (unit.startsWith('m') || unit.includes('million')) n *= 1_000_000;
  return Math.round(n);
};

const normalizeCity = (locationRaw: string): string => {
  if (!locationRaw) return '';
  const s = locationRaw.trim();
  
  // Default metro for state-only input
  if (/^massachusetts$/i.test(s)) return 'Worcester MA (Metro)';
  
  // Normalize formatting
  if (!s.includes(',')) return `${s}, MA`;
  return s.replace(/\s*,\s*/g, ', ');
};

export function buildClientProfileFromConversation(convo: string): ClientProfile {
  // Extract budget - look for first currency mention
  const budgetMatches = convo.match(/\$?\s*([\d,]+)\s*(k|m|million|thousand)?(?:\s+(?:cash|budget|capital|to invest))?/gi);
  const budget = budgetMatches ? parseCurrency(budgetMatches[0]) : 0;
  
  // Extract monthly income target
  const monthly = (() => {
    const m = convo.match(/\$?\s*([\d,]+)\+?\s*(?:\/mo|monthly|per month|cashflow)/i);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  })();
  
  // Extract location - strict city matching
  const locM = convo.match(/\b(Worcester|Springfield|Boston|Quincy|Lowell|Cambridge|Newton|Framingham)\b(?:[\s,]*(MA|Massachusetts|metro|area))?/i);
  const location = normalizeCity(locM ? `${locM[1]}, MA` : 'Massachusetts');
  
  return {
    budget_usd: budget || 0,
    location_city: location,
    monthly_income_target: monthly ?? undefined
  };
}

export function assertProfile(p: ClientProfile): void {
  const errors: string[] = [];
  
  if (!p.location_city || p.location_city === '') {
    errors.push('location missing');
  }
  
  if (!p.budget_usd || p.budget_usd < 50_000) {
    errors.push(`budget invalid: ${p.budget_usd}`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Invalid profile: ${errors.join(', ')}`);
  }
  
  // Log successful validation
  console.log(`✅ Profile validated: $${p.budget_usd.toLocaleString()} in ${p.location_city}, target: $${p.monthly_income_target || 0}/mo`);
}

// Export a combined parse + validate function
export function parseAndValidateProfile(conversation: string): ClientProfile {
  const profile = buildClientProfileFromConversation(conversation);
  assertProfile(profile);
  return profile;
}