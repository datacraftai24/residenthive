import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SavePropertyButton } from './save-property-button';
import { ClientSummaryLight } from './ClientSummaryLight';
import { ClientSummaryDeep } from './ClientSummaryDeep';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Grid, 
  List, 
  MapPin, 
  Bed, 
  Bath, 
  Square, 
  DollarSign,
  Eye,
  Share2,
  Star,
  TrendingUp,
  Clock,
  Calendar,
  Home,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import type { BuyerProfile } from '@shared/schema';

// ============================================================================
// FIT CHIPS: Deterministic buyer-property match signals
// ============================================================================
interface FitChip {
  type: 'hard' | 'soft' | 'positive';
  icon: string;
  label: string;
  key: string;
  className: string;
}

interface FitResult {
  chips: FitChip[];
  fitScore: number;
  hardCount: number;
  softCount: number;
}

/**
 * Derive fit chips for a property based on profile requirements
 * Priority: Hard mismatches first, then soft risks, then positives
 * Caps: Max 2 hard, max 2 soft, fill with positives up to 5 total
 */
function deriveFitChips(
  listing: MarketOverviewListing,
  profile: BuyerProfile | null
): FitResult {
  if (!profile) {
    return { chips: [], fitScore: 100, hardCount: 0, softCount: 0 };
  }

  const hardChips: FitChip[] = [];
  const softChips: FitChip[] = [];
  const positiveChips: FitChip[] = [];

  // --- HARD MISMATCHES (deal-breakers) ---

  // 1. Fewer beds than required
  const profileBeds = typeof profile.bedrooms === 'number' ? profile.bedrooms : parseInt(String(profile.bedrooms)) || 0;
  const listingBeds = listing.bedrooms || 0;
  if (profileBeds > 0 && listingBeds < profileBeds) {
    hardChips.push({
      type: 'hard',
      icon: '❌',
      label: `${listingBeds} beds (need ${profileBeds})`,
      key: 'beds-short',
      className: 'bg-red-100 text-red-800 border-red-300',
    });
  }

  // 2. Fewer baths than required
  const profileBaths = typeof profile.bathrooms === 'number'
    ? profile.bathrooms
    : parseFloat(String(profile.bathrooms).replace(/[^0-9.]/g, '')) || 0;
  const listingBaths = listing.bathrooms || 0;
  if (profileBaths > 0 && listingBaths < profileBaths) {
    hardChips.push({
      type: 'hard',
      icon: '❌',
      label: `${listingBaths} baths (need ${profileBaths})`,
      key: 'baths-short',
      className: 'bg-red-100 text-red-800 border-red-300',
    });
  }

  // 3. Over budget >110%
  const budgetMax = profile.budgetMax || 0;
  const listPrice = listing.listPrice || 0;
  if (budgetMax > 0 && listPrice > budgetMax * 1.1) {
    const overPct = Math.round(((listPrice - budgetMax) / budgetMax) * 100);
    hardChips.push({
      type: 'hard',
      icon: '❌',
      label: `${overPct}% over budget`,
      key: 'over-budget',
      className: 'bg-red-100 text-red-800 border-red-300',
    });
  }

  // 4. Contains dealbreaker from profile.dealbreakers
  // (Would need description analysis - skip for now as it requires NLP)

  // --- SOFT RISKS (caution flags) ---

  // 1. At budget limit (100-110% of max)
  if (budgetMax > 0 && listPrice > budgetMax && listPrice <= budgetMax * 1.1) {
    softChips.push({
      type: 'soft',
      icon: '⚠',
      label: 'At budget limit',
      key: 'budget-limit',
      className: 'bg-amber-100 text-amber-800 border-amber-300',
    });
  }

  // 2. Year built logic - smarter buckets
  // Hard: <1900 (major rehab risk)
  // Soft: 1900-1959 (older build)
  // Neutral: 1960-1999 (no chip)
  // Positive: 2000+ (newer construction)
  const yearBuilt = listing.yearBuilt || 0;
  if (yearBuilt > 0 && yearBuilt < 1900) {
    hardChips.push({
      type: 'hard',
      icon: '❌',
      label: `Built ${yearBuilt} - rehab risk`,
      key: 'rehab-risk',
      className: 'bg-red-100 text-red-800 border-red-300',
    });
  } else if (yearBuilt >= 1900 && yearBuilt < 1960) {
    softChips.push({
      type: 'soft',
      icon: '⚠',
      label: `Built ${yearBuilt}`,
      key: 'old-build',
      className: 'bg-amber-100 text-amber-800 border-amber-300',
    });
  }
  // 1960-1999 = no chip (neutral)
  // 2000+ = positive (added below in positives section)

  // 3. Smaller home (<1200 sqft)
  const sqft = listing.sqft || 0;
  if (sqft > 0 && sqft < 1200) {
    softChips.push({
      type: 'soft',
      icon: '⚠',
      label: `${sqft.toLocaleString()} sqft`,
      key: 'small-home',
      className: 'bg-amber-100 text-amber-800 border-amber-300',
    });
  }

  // --- POSITIVES (matching criteria) ---

  // 1. Under budget (<90% of max)
  if (budgetMax > 0 && listPrice < budgetMax * 0.9) {
    const underPct = Math.round(((budgetMax - listPrice) / budgetMax) * 100);
    positiveChips.push({
      type: 'positive',
      icon: '✓',
      label: `${underPct}% under budget`,
      key: 'under-budget',
      className: 'bg-green-100 text-green-800 border-green-300',
    });
  }

  // 2. Beds match or exceed
  if (profileBeds > 0 && listingBeds >= profileBeds) {
    if (listingBeds > profileBeds) {
      positiveChips.push({
        type: 'positive',
        icon: '✓',
        label: `+${listingBeds - profileBeds} bed${listingBeds - profileBeds > 1 ? 's' : ''}`,
        key: 'beds-plus',
        className: 'bg-green-100 text-green-800 border-green-300',
      });
    } else {
      positiveChips.push({
        type: 'positive',
        icon: '✓',
        label: `${listingBeds} beds`,
        key: 'beds-match',
        className: 'bg-green-100 text-green-800 border-green-300',
      });
    }
  }

  // 3. Baths match or exceed
  if (profileBaths > 0 && listingBaths >= profileBaths) {
    if (listingBaths > profileBaths) {
      positiveChips.push({
        type: 'positive',
        icon: '✓',
        label: `+${(listingBaths - profileBaths).toFixed(1).replace('.0', '')} bath${listingBaths - profileBaths > 1 ? 's' : ''}`,
        key: 'baths-plus',
        className: 'bg-green-100 text-green-800 border-green-300',
      });
    } else {
      positiveChips.push({
        type: 'positive',
        icon: '✓',
        label: `${listingBaths} baths`,
        key: 'baths-match',
        className: 'bg-green-100 text-green-800 border-green-300',
      });
    }
  }

  // 4. Home type match
  const profileHomeType = (profile.homeType || '').toLowerCase();
  const listingType = (listing.propertyType || '').toLowerCase();
  if (profileHomeType && listingType) {
    // Fuzzy match for common variations
    const typeMatches =
      listingType.includes(profileHomeType) ||
      profileHomeType.includes(listingType) ||
      (profileHomeType.includes('single') && listingType.includes('single')) ||
      (profileHomeType.includes('condo') && listingType.includes('condo')) ||
      (profileHomeType.includes('town') && listingType.includes('town'));

    if (typeMatches) {
      positiveChips.push({
        type: 'positive',
        icon: '✓',
        label: listing.propertyType || 'Type match',
        key: 'type-match',
        className: 'bg-green-100 text-green-800 border-green-300',
      });
    }
  }

  // 5. Target area (city in preferredAreas)
  const preferredAreas = profile.preferredAreas || [];
  const listingCity = (listing.city || '').toLowerCase();
  if (listingCity && preferredAreas.length > 0) {
    const inPreferredArea = preferredAreas.some(area =>
      listingCity.includes(area.toLowerCase()) ||
      area.toLowerCase().includes(listingCity)
    );
    if (inPreferredArea) {
      positiveChips.push({
        type: 'positive',
        icon: '✓',
        label: listing.city,
        key: 'area-match',
        className: 'bg-green-100 text-green-800 border-green-300',
      });
    }
  }

  // 6. Newer construction (2000+)
  if (yearBuilt >= 2000) {
    positiveChips.push({
      type: 'positive',
      icon: '✓',
      label: `Built ${yearBuilt}`,
      key: 'newer-build',
      className: 'bg-green-100 text-green-800 border-green-300',
    });
  }

  // --- APPLY CAPS ---
  // Max 2 hard, max 2 soft, fill with positives up to 5 total
  const selectedHard = hardChips.slice(0, 2);
  const selectedSoft = softChips.slice(0, 2);
  const remainingSlots = 5 - selectedHard.length - selectedSoft.length;
  const selectedPositive = positiveChips.slice(0, Math.max(0, remainingSlots));

  const finalChips = [...selectedHard, ...selectedSoft, ...selectedPositive];

  // --- CALCULATE FIT SCORE ---
  // Formula: 100 - (30 * hardCount) - (10 * softCount)
  const hardCount = selectedHard.length;
  const softCount = selectedSoft.length;
  const fitScore = Math.max(0, 100 - (30 * hardCount) - (10 * softCount));

  return {
    chips: finalChips,
    fitScore,
    hardCount,
    softCount,
  };
}

interface AgentDualViewSearchProps {
  profile: BuyerProfile;
}

interface SearchView1Results {
  viewType: 'broad';
  searchCriteria: {
    budgetRange: string;
    bedrooms: string;
    location: string;
    propertyType?: string;
  };
  totalFound: number;
  listings: MarketOverviewListing[];
  rejectedListings?: MarketOverviewListing[];  // Properties filtered out due to dealbreakers
  executionTime: number;
}

interface SearchView2Results {
  viewType: 'ai_recommendations';
  searchCriteria: {
    budgetRange: string;
    bedrooms: string;
    location: string;
    propertyType?: string;
  };
  totalFound: number;
  listings: AIRecommendationListing[];
  executionTime: number;
  aiAnalysis: {
    topMatches: number;
    visualAnalysis: boolean;
    scoringFactors: string[];
  };
}

interface StatusIndicator {
  type: string;
  label: string;
  color: string;
}

interface MarketOverviewListing {
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  listPrice: number;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  propertyType: string;
  daysOnMarket?: number;
  status: string;
  images: string[];
  photoCount: number;
  description?: string;
  yearBuilt?: number;
  lotSize?: number;
  features?: string[];
  // Market intelligence metrics
  pricePerSqft?: number;
  statusIndicators?: StatusIndicator[];
  filterReasons?: string[];  // Clear, objective filter reasons
  matchScore?: number;  // Deprecated - use fitScore instead
  matchReasons?: string[];  // What criteria this property matches
  // Price history fields for market recommendations
  originalPrice?: number | null;
  priceCutsCount?: number;
  totalPriceReduction?: number;
  lastPriceChangeDate?: string | null;
  priceTrendDirection?: 'down' | 'up' | 'flat' | null;
  lotAcres?: number | null;
  specialFlags?: string[];
  // NEW: Backend-computed buyer ranking fields
  fitScore?: number;
  fitChips?: Array<{
    type: 'hard' | 'soft' | 'positive';
    icon: string;
    label: string;
    key: string;
  }>;
  priorityTag?: PriorityTag;
  belowMarketPct?: number | null;
  statusLines?: string[];
  marketStrengthScore?: number;
  finalScore?: number | null;
  rank?: number | null;
  isTop20?: boolean;
}

// Market recommendation types - Action verbs for agents
type PriorityTag = 'STRIKE_NOW' | 'ACT_NOW' | 'LOWBALL' | 'REVIEW' | 'WALK_AWAY' | 'SKIP' | null;

interface MarketRecommendation {
  priorityTag: PriorityTag;
  statusLines: string[];
}

// Pure function to get market recommendation for a listing
// Priority order: STRIKE_NOW > ACT_NOW > LOWBALL > REVIEW > WALK_AWAY > SKIP
function getMarketRecommendation(
  listing: MarketOverviewListing,
  marketPricePerSqft?: number | null,
  minPricePerSqft?: number | null  // NEW: For "Top value in this search" detection
): MarketRecommendation {
  const {
    originalPrice,
    priceCutsCount = 0,
    totalPriceReduction = 0,
    daysOnMarket = 0,
    listPrice,
    pricePerSqft,
    priceTrendDirection,
    specialFlags = [],
  } = listing;

  // Check if investor-type listing based on special flags
  const investorKeywords = ['cash only', 'as-is', 'investor', 'tear down', 'builder', 'contractor'];
  const isInvestor = specialFlags.some(flag =>
    investorKeywords.some(keyword => flag.toLowerCase().includes(keyword))
  );

  // Calculate below/above market percentage
  let belowMarketPct: number | null = null;
  if (marketPricePerSqft && marketPricePerSqft > 0 && pricePerSqft && pricePerSqft > 0) {
    belowMarketPct = (marketPricePerSqft - pricePerSqft) / marketPricePerSqft;
  }

  // Check for meaningful price drop (>= 5%)
  const hasMeaningfulDrop =
    totalPriceReduction > 0 &&
    originalPrice &&
    totalPriceReduction / originalPrice >= 0.05;

  // Check for price increase (RED FLAG - erratic seller)
  const hadPriceIncrease = priceTrendDirection === 'up';

  // Overpriced thresholds - CORRECTED (30% = delusional, not 50%)
  const isOverpriced10 = belowMarketPct !== null && belowMarketPct <= -0.10;
  const isOverpriced15 = belowMarketPct !== null && belowMarketPct <= -0.15;
  const isOverpriced20 = belowMarketPct !== null && belowMarketPct <= -0.20;
  const isOverpriced30 = belowMarketPct !== null && belowMarketPct <= -0.30; // NEW: Delusional pricing

  // Below market thresholds
  const isBelow5 = belowMarketPct !== null && belowMarketPct >= 0.05;
  const isBelow10 = belowMarketPct !== null && belowMarketPct >= 0.10;
  const isBelow20 = belowMarketPct !== null && belowMarketPct >= 0.20;
  const isBelow25 = belowMarketPct !== null && belowMarketPct >= 0.25; // NEW: Truly rare discount

  // Is this the best value in the set?
  // FIX: Use tolerance for floating-point comparison (MLS data has precision issues)
  // FIX: Check for both null AND undefined (pricePerSqft can be undefined from API)
  const isTopValue =
    minPricePerSqft != null &&
    pricePerSqft != null &&
    pricePerSqft > 0 &&
    Math.abs(pricePerSqft - minPricePerSqft) < 0.01; // Floating-point tolerance


  // Priority rules - order: STRIKE_NOW > ACT_NOW > LOWBALL > REVIEW > WALK_AWAY > SKIP

  // SKIP - investor/builder listings (not for typical buyer)
  const isSkipListing = isInvestor;

  // WALK_AWAY - toxic listings (delusional pricing OR erratic seller)
  // 20%+ overpriced = walk away (30%+ = delusional)
  const isWalkAway =
    !isInvestor && (
      (isOverpriced20 && daysOnMarket > 60) ||  // 20%+ overpriced + stale = walk away
      (isOverpriced10 && hadPriceIncrease)  // 10%+ overpriced + price increase = erratic
    );

  // LOWBALL - seller weakness signals (requires seller movement: cuts OR drops)
  // Must have cuts/drops AND be in reasonable range (not 20%+ overpriced)
  const isLowball =
    !isInvestor &&
    !hadPriceIncrease &&
    !isWalkAway &&
    !isOverpriced20 && // Block LOWBALL when 20%+ overpriced
    (priceCutsCount >= 2 || hasMeaningfulDrop) && // MUST have seller movement
    (
      priceCutsCount >= 3 ||  // 3+ cuts = bleeding out
      (priceCutsCount >= 2 && daysOnMarket > 90) ||  // 2 cuts + stale = weakening
      (daysOnMarket > 120 && hasMeaningfulDrop) ||  // Long stale + drop
      (isOverpriced15 && daysOnMarket >= 60)  // 15-20% overpriced + stale
    );

  // STRIKE_NOW - below market value (5%+ below market)
  const isStrikeNow =
    !isInvestor &&
    !isWalkAway &&
    isBelow5; // 5%+ below market

  // ACT_NOW - new listing, priced right (0-5% below market, fresh)
  const isActNow =
    !isInvestor &&
    !isWalkAway &&
    !isStrikeNow &&
    daysOnMarket < 7 && // Fresh listing
    priceCutsCount === 0 &&
    belowMarketPct !== null &&
    belowMarketPct >= 0 && // At or slightly below market
    belowMarketPct < 0.05; // But not 5%+ below (that's STRIKE_NOW)


  // Determine priority tag (first match wins in priority order)
  let priorityTag: PriorityTag = 'REVIEW'; // Default fallback
  if (isSkipListing) priorityTag = 'SKIP';
  else if (isWalkAway) priorityTag = 'WALK_AWAY';
  else if (isStrikeNow) priorityTag = 'STRIKE_NOW';
  else if (isActNow) priorityTag = 'ACT_NOW';
  else if (isLowball) priorityTag = 'LOWBALL';

  // Build status lines - ALWAYS 3 lines (facts, primary with %, combined signal)
  const statusLines: string[] = [];

  // Line 1: Facts (DOM + cuts)
  const domPart = `${daysOnMarket} DOM`;
  let cutsPart = 'No drops';
  if (priceCutsCount > 0) {
    cutsPart = `${priceCutsCount} cut${priceCutsCount > 1 ? 's' : ''}`;
  }
  statusLines.push(`${domPart} • ${cutsPart}`);

  // Line 2: Primary implication with % above/below market
  // Format percentage as whole number (e.g., "26% below market")
  const pctStr = belowMarketPct !== null
    ? `${Math.abs(Math.round(belowMarketPct * 100))}%`
    : null;

  // Priority order: Delusional > Walk Away tiers > STRIKE NOW tiers > ACT NOW > LOWBALL tiers > REVIEW
  if (isOverpriced30) {
    statusLines.push(`Delusional pricing → Walk away`);
  } else if (isOverpriced20 && daysOnMarket > 60) {
    statusLines.push(`${pctStr} above market → Walk away`);
  } else if (hadPriceIncrease && isOverpriced10) {
    statusLines.push(`↑ Price increase → Erratic seller`);
  } else if (isBelow20) {
    statusLines.push(`${pctStr} below market → Strike now`);
  } else if (isBelow10) {
    statusLines.push(`${pctStr} below market → Strike now`);
  } else if (isBelow5) {
    statusLines.push(`${pctStr} below market → Strike now`);
  } else if (daysOnMarket < 7 && priceCutsCount === 0 && belowMarketPct !== null && belowMarketPct >= 0) {
    statusLines.push(`Priced right → Act now`);
  } else if (isOverpriced15 && daysOnMarket >= 60) {
    statusLines.push(`${pctStr} above market → Lowball`);
  } else if (priceCutsCount >= 3) {
    statusLines.push(`Seller bleeding out`);
  } else if (priceCutsCount >= 2 && daysOnMarket > 90) {
    statusLines.push(`Seller weakening`);
  } else if (belowMarketPct !== null && belowMarketPct >= 0 && belowMarketPct < 0.05) {
    statusLines.push(`Typical pricing → Review`);
  } else if (specialFlags.length > 0) {
    statusLines.push(specialFlags.slice(0, 2).join(' • '));
  } else {
    statusLines.push(`Review listing`);
  }

  // Line 3: Combined signal (CONDITIONAL - only when signals align)
  // STRIKE_NOW variants - 3-tier psychology
  // Tier 1: Best deal (1 per search) > Tier 2: Rare discount (25%+) > Tier 3: Motivated seller (10-24% + signals)
  if (priorityTag === 'STRIKE_NOW') {
    if (isTopValue) {
      // Tier 1: Lowest $/sqft in entire search - THE anchor property
      statusLines.push('Top value in this search');
    } else if (isBelow25) {
      // Tier 2: 25%+ below market - truly exceptional (was 20%, now rare means rare)
      statusLines.push('Rare discount opportunity');
    } else if (
      belowMarketPct !== null &&
      belowMarketPct >= 0.10 &&
      belowMarketPct < 0.25 &&
      (priceCutsCount >= 1 || daysOnMarket > 60 || hasMeaningfulDrop)
    ) {
      // Tier 3: 10-24% below + seller weakness signals - tactical opportunity
      statusLines.push('Below market + motivated seller');
    }
    // If none of these → no Line 3 (no forced signals)
  }

  // LOWBALL variants
  if (priorityTag === 'LOWBALL') {
    if (priceCutsCount >= 3 || (priceCutsCount >= 2 && daysOnMarket > 90)) {
      statusLines.push('Stale + weakening seller');
    } else if (isOverpriced15 && daysOnMarket >= 60) {
      statusLines.push('Overpriced + stale → leverage');
    }
  }

  // WALK_AWAY variants
  if (priorityTag === 'WALK_AWAY') {
    if (isOverpriced30) {
      statusLines.push('Delusional pricing');
    } else if (hadPriceIncrease && isOverpriced10) {
      statusLines.push('Overpriced + irrational seller');
    } else if (isOverpriced20 && daysOnMarket > 60 && priceCutsCount === 0) {
      statusLines.push('Overpriced + no movement');
    }
  }

  // ACT_NOW variant
  if (priorityTag === 'ACT_NOW') {
    if (daysOnMarket < 7) {
      statusLines.push('New + priced right');
    }
  }

  // SKIP: Flags only, NO Line 3 (no combined signals for dismissed properties)

  return { priorityTag, statusLines };
}

// AI v2 analysis schema - Layer 1 Text + Profile Deep Match
interface AIAnalysisV2 {
  headline: string;
  summary_for_buyer: string;
  whats_matching: Array<{
    requirement: string;
    evidence: string;
    source: 'explicit' | 'inferred';
  }>;
  whats_missing: Array<{
    requirement: string;
    assessment: string;
    workaround: string | null;
  }>;
  red_flags: Array<{
    concern: string;
    quote: string;
    risk_level: 'low' | 'medium' | 'high';
    follow_up: string;
  }>;
}

interface AIRecommendationListing extends MarketOverviewListing {
  matchLabel: string;
  // NEW: AI v2 analysis (null for non-Top-20)
  aiAnalysis?: AIAnalysisV2 | null;
}

interface SearchAdjustment {
  field: string;
  originalValue: any;
  adjustedValue: any;
  description: string;
}

interface AgentSearchResponse {
  searchType: 'agent_dual_view' | 'agent_dual_view_reactive';
  profileData: {
    id: number;
    name: string;
    location: string;
  };
  // For reactive search
  initialSearch?: {
    view1: SearchView1Results;
    view2: SearchView2Results;
    totalFound: number;
    sufficientResults: boolean;
  };
  enhancedSearch?: {
    triggered: boolean;
    reason: string;
    view1: SearchView1Results;
    adjustments: SearchAdjustment[];
    adjustmentSummary: string;
    clientSummary: string;
  };
  agentRecommendations?: {
    shouldEnhance: boolean;
    message: string;
    suggestedActions: string[];
  };
  // For standard search (backward compatibility)
  view1?: SearchView1Results;
  view2?: SearchView2Results;
  totalExecutionTime: number;
  timestamp: string;
  searchId?: string;  // NEW: For photo analysis endpoint
}

// Photo Analysis Response Types
interface PhotoMatch {
  requirement: string;
  status: 'present' | 'absent' | 'unclear';
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
}

interface PhotoRedFlag {
  concern: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high';
  follow_up: string;
}

interface PhotoAnalysisResult {
  photo_headline: string;
  photo_summary: string;
  photo_matches: PhotoMatch[];
  photo_red_flags: PhotoRedFlag[];
}

interface PhotoAnalysisResponse {
  searchId: string;
  photo_analysis: Record<string, PhotoAnalysisResult>;
  error?: string;
}

export function AgentDualViewSearch({ profile }: AgentDualViewSearchProps) {
  const [hasSearched, setHasSearched] = useState(false);
  const [activeView, setActiveView] = useState<'view1' | 'view2'>('view1');
  const [forceEnhanced, setForceEnhanced] = useState(false);
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation to save multiple properties
  const savePropertiesMutation = useMutation({
    mutationFn: async (propertyIds: string[]) => {
      const savePromises = propertyIds.map(listingId =>
        apiRequest('POST', `/api/buyer-profiles/${profile.id}/properties`, {
          listing_id: listingId,
          interaction_type: 'saved'
        })
      );
      return Promise.all(savePromises);
    },
    onSuccess: () => {
      toast({
        title: 'Properties saved',
        description: `Successfully saved ${selectedProperties.size} properties to this buyer profile`
      });
      setSelectedProperties(new Set());
      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profile.id}/properties`] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save properties. Please try again.',
        variant: 'destructive'
      });
    }
  });

  // Search query with reactive search enabled - NO CACHING
  const { data: searchResults, isLoading, refetch } = useQuery<AgentSearchResponse>({
    queryKey: ['/api/agent-search', profile.id, forceEnhanced], // Stable query key
    queryFn: async () => {
      const response = await fetch('/api/agent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          useReactive: true,  // Enable reactive search
          forceEnhanced
        })
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      return response.json();
    },
    enabled: hasSearched,
    staleTime: 0, // Never use cache - always fetch fresh
    gcTime: 0, // Don't keep in cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false, // Don't retry on failure to avoid loops
  });

  // Photo Analysis query - fetches after search completes and we have a searchId
  const { data: photoAnalysis, isLoading: isLoadingPhotos, refetch: refetchPhotos } = useQuery<PhotoAnalysisResponse>({
    queryKey: ['/api/agent-search/photos', searchResults?.searchId],
    queryFn: async () => {
      if (!searchResults?.searchId) {
        throw new Error('No searchId available');
      }
      const response = await fetch(`/api/agent-search/photos?searchId=${searchResults.searchId}`);
      if (!response.ok) {
        throw new Error('Photo analysis failed');
      }
      const data = await response.json();
      console.log('[PHOTO ANALYSIS] Query result:', {
        searchId: searchResults.searchId,
        propertiesWithPhotos: Object.keys(data.photo_analysis || {}).length,
        timestamp: new Date().toISOString()
      });
      return data;
    },
    enabled: !!searchResults?.searchId && activeView === 'view2', // Only fetch when viewing AI recommendations
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
    // Poll every 10 seconds until we have photo data, then stop
    refetchInterval: (data) => {
      const hasPhotoData = data && data.photo_analysis && Object.keys(data.photo_analysis).length > 0;
      return hasPhotoData ? false : 10000; // Poll every 10s if no data, stop if we have data
    },
  });

  const handleSearch = () => {
    // Clear cache to ensure fresh results
    queryClient.invalidateQueries({ queryKey: ['/api/agent-search', profile.id] });
    setHasSearched(true);
    setForceEnhanced(false); // Reset force enhanced
    refetch();
  };

  const handleEnhancedSearch = () => {
    // Clear cache for enhanced search too
    queryClient.invalidateQueries({ queryKey: ['/api/agent-search', profile.id] });
    setForceEnhanced(true);
    refetch();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 75) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (score >= 65) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Property Search for {profile.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium">Location</label>
              <p className="text-sm text-gray-600">{profile.location}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Budget</label>
              <p className="text-sm text-gray-600">
                {profile.budgetMin && profile.budgetMax 
                  ? `${formatPrice(profile.budgetMin)} - ${formatPrice(profile.budgetMax)}`
                  : 'Any budget'
                }
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Requirements</label>
              <p className="text-sm text-gray-600">
                {profile.bedrooms} beds, {profile.bathrooms} baths
              </p>
            </div>
          </div>
          
          <Button 
            onClick={handleSearch} 
            disabled={isLoading} 
            className="w-full md:w-auto"
          >
            {isLoading ? 'Searching Properties...' : hasSearched ? 'Refresh Search' : 'Search Properties'}
          </Button>
        </CardContent>
      </Card>

      {/* Search Results */}
      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Searching properties for {profile.name}...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {searchResults && !isLoading && (
        <div className="space-y-6">
          {/* Enhanced Search Alert */}
          {searchResults.enhancedSearch?.triggered && (
            <Alert className="border-blue-200 bg-blue-50">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-900">Enhanced Search Activated</AlertTitle>
              <AlertDescription className="text-blue-800">
                {searchResults.enhancedSearch.reason}. {searchResults.enhancedSearch.adjustmentSummary}
              </AlertDescription>
            </Alert>
          )}

          {/* Agent Recommendations */}
          {searchResults.agentRecommendations && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Agent Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 mb-3">
                  {searchResults.agentRecommendations.message}
                </p>
                <ul className="space-y-1">
                  {searchResults.agentRecommendations.suggestedActions.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* View Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant={activeView === 'view1' ? 'default' : 'outline'}
                onClick={() => setActiveView('view1')}
                className="flex items-center gap-2"
              >
                <List className="h-4 w-4" />
                Market Overview ({
                  searchResults.enhancedSearch?.triggered 
                    ? searchResults.enhancedSearch.view1.totalFound 
                    : (searchResults.initialSearch?.view1.totalFound || searchResults.view1?.totalFound || 0)
                })
              </Button>
              <Button
                variant={activeView === 'view2' ? 'default' : 'outline'}
                onClick={() => setActiveView('view2')}
                className="flex items-center gap-2"
              >
                <Star className="h-4 w-4" />
                AI Recommendations ({
                  searchResults.initialSearch?.view2.totalFound || searchResults.view2?.totalFound || 0
                })
              </Button>
            </div>
            
            <div className="text-sm text-gray-600">
              Search completed in {searchResults.totalExecutionTime}ms
            </div>
          </div>

          {/* View 1: Market Overview */}
          {activeView === 'view1' && (
            <>
              {/* Show adjustments if enhanced search was triggered */}
              {searchResults.enhancedSearch?.adjustments && searchResults.enhancedSearch.adjustments.length > 0 && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Search Criteria Adjustments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {searchResults.enhancedSearch.adjustments.map((adj, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="font-medium capitalize">{adj.field}:</span>
                          <span>
                            <span className="text-gray-500 line-through mr-2">{adj.originalValue}</span>
                            <span className="text-blue-700 font-medium">→ {adj.adjustedValue}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Client-ready summary */}
                    <div className="p-3 bg-white rounded-lg border border-blue-200">
                      <p className="text-xs font-medium text-gray-600 mb-1">Copy for Client:</p>
                      <p className="text-sm text-gray-800 italic">
                        "{searchResults.enhancedSearch.clientSummary}"
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <MarketOverviewView 
                results={
                  searchResults.enhancedSearch?.triggered 
                    ? searchResults.enhancedSearch.view1 
                    : (searchResults.initialSearch?.view1 || searchResults.view1!)
                }
                formatPrice={formatPrice}
                profile={profile}
                selectedProperties={selectedProperties}
                setSelectedProperties={setSelectedProperties}
                onSaveProperties={(ids) => savePropertiesMutation.mutate(ids)}
              />

              {/* Manual Enhanced Search Button */}
              {searchResults.initialSearch && 
               searchResults.initialSearch.totalFound < 20 && 
               !searchResults.enhancedSearch?.triggered && (
                <div className="text-center pt-4">
                  <Button 
                    onClick={handleEnhancedSearch}
                    variant="outline"
                    className="gap-2"
                  >
                    <Search className="h-4 w-4" />
                    Find More Options with Flexible Criteria
                  </Button>
                  <p className="text-sm text-gray-500 mt-2">
                    This will expand budget by ±20% and include ±1 bedroom
                  </p>
                </div>
              )}
            </>
          )}

          {/* View 2: AI Recommendations */}
          {activeView === 'view2' && (
            <AIRecommendationsView
              results={searchResults.initialSearch?.view2 || searchResults.view2!}
              formatPrice={formatPrice}
              getScoreColor={getScoreColor}
              profile={profile}
              selectedProperties={selectedProperties}
              setSelectedProperties={setSelectedProperties}
              onSaveProperties={(ids) => savePropertiesMutation.mutate(ids)}
              photoAnalysis={photoAnalysis?.photo_analysis}
              isLoadingPhotos={isLoadingPhotos}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Market Overview Component
function MarketOverviewView({
  results,
  formatPrice,
  profile,
  selectedProperties,
  setSelectedProperties,
  onSaveProperties
}: {
  results: SearchView1Results;
  formatPrice: (price: number) => string;
  profile: BuyerProfile;
  selectedProperties: Set<string>;
  setSelectedProperties: (selected: Set<string>) => void;
  onSaveProperties: (propertyIds: string[]) => void;
}) {
  const [showRejected, setShowRejected] = useState(true);

  // Calculate market average $/sqft for value comparison
  const avgPricePerSqft = React.useMemo(() => {
    const validPrices = results.listings
      .map(p => p.pricePerSqft)
      .filter((p): p is number => p !== undefined && p !== null && p > 0);

    if (validPrices.length === 0) return null;
    return Math.round(validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length);
  }, [results.listings]);

  // Helper to get priority badge based on property characteristics
  // Calculate minimum price per sqft among DISCOUNT CANDIDATES only
  // (Economic filter: 5%+ below market, not investor - separate from UI's STRIKE_NOW definition)
  const minPricePerSqft = React.useMemo(() => {
    const discountCandidates = results.listings.filter(p => {
      const pps = p.pricePerSqft;
      if (!pps || pps <= 0 || !avgPricePerSqft) return false;
      const belowMarketPct = (avgPricePerSqft - pps) / avgPricePerSqft;
      // Exclude investor listings from "top value" consideration
      const isInvestor = (p.specialFlags || []).some(f =>
        ['Investor Special', 'As-Is', 'Cash Only'].includes(f)
      );
      return belowMarketPct >= 0.05 && !isInvestor;
    });

    const prices = discountCandidates
      .map(p => p.pricePerSqft)
      .filter((p): p is number => p !== undefined && p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  }, [results.listings, avgPricePerSqft]);

  const getPriorityBadge = (property: MarketOverviewListing) => {
    // Use backend-computed priority data if available, otherwise compute locally
    const priorityTag = property.priorityTag ?? getMarketRecommendation(property, avgPricePerSqft, minPricePerSqft).priorityTag;
    const statusLines = property.statusLines ?? getMarketRecommendation(property, avgPricePerSqft, minPricePerSqft).statusLines;

    // Map priority tags to badge styling - Action verbs with visual hierarchy
    const badgeConfig: Record<string, { icon: string; label: string; className: string; rowClassName: string; description: string; sortOrder: number }> = {
      'STRIKE_NOW': {
        icon: '💎',
        label: 'STRIKE NOW',
        className: 'bg-green-200 text-green-900 border-green-400 font-bold',
        rowClassName: 'border-l-4 border-green-500',
        description: 'Below market value - act immediately',
        sortOrder: 1,
      },
      'ACT_NOW': {
        icon: '⚡',
        label: 'ACT NOW',
        className: 'bg-blue-200 text-blue-900 border-blue-400 font-bold',
        rowClassName: 'border-l-4 border-blue-500',
        description: 'New listing - priced right',
        sortOrder: 2,
      },
      'LOWBALL': {
        icon: '🎯',
        label: 'LOWBALL',
        className: 'bg-yellow-200 text-yellow-900 border-yellow-400 font-bold',
        rowClassName: '',
        description: 'Seller showing weakness - negotiate hard',
        sortOrder: 3,
      },
      'REVIEW': {
        icon: '👁️',
        label: 'REVIEW',
        className: 'bg-gray-100 text-gray-600 border-gray-300',
        rowClassName: '',
        description: 'Needs evaluation',
        sortOrder: 4,
      },
      'WALK_AWAY': {
        icon: '🚫',
        label: 'WALK AWAY',
        className: 'bg-gray-300 text-gray-700 border-gray-400',
        rowClassName: 'opacity-80 bg-gray-50',
        description: 'Overpriced with no flexibility',
        sortOrder: 5,
      },
      'SKIP': {
        icon: '⏭️',
        label: 'SKIP',
        className: 'bg-gray-200 text-gray-600 border-gray-300',
        rowClassName: 'opacity-80 bg-gray-50',
        description: 'Investor/Builder opportunity - not for typical buyer',
        sortOrder: 6,
      },
    };

    if (priorityTag && badgeConfig[priorityTag]) {
      const config = badgeConfig[priorityTag];
      return {
        label: config.label,
        icon: config.icon,
        className: config.className,
        rowClassName: config.rowClassName,
        description: config.description,
        sortOrder: config.sortOrder,
        statusReason: statusLines.join('\n'),
        statusLines: statusLines,
      };
    }

    // Default: REVIEW (always have a tag)
    const reviewConfig = badgeConfig['REVIEW'];
    return {
      label: reviewConfig.label,
      icon: reviewConfig.icon,
      className: reviewConfig.className,
      rowClassName: reviewConfig.rowClassName,
      description: reviewConfig.description,
      sortOrder: reviewConfig.sortOrder,
      statusReason: statusLines.length > 0 ? statusLines.join('\n') : `${property.daysOnMarket || 0} DOM`,
      statusLines: statusLines.length > 0 ? statusLines : [`${property.daysOnMarket || 0} DOM • No drops`],
    };
  };

  // Helper to get value indicator based on $/sqft vs market average
  const getValueIndicator = (pricePerSqft?: number) => {
    if (!pricePerSqft || !avgPricePerSqft) return null;

    const percentDiff = ((pricePerSqft - avgPricePerSqft) / avgPricePerSqft) * 100;

    if (percentDiff < -20) {
      return { icon: '🔥', label: `${Math.abs(Math.round(percentDiff))}% below`, color: 'text-green-700' };
    } else if (percentDiff > 20) {
      return { icon: '⚠️', label: `${Math.round(percentDiff)}% above`, color: 'text-orange-700' };
    }
    return null;
  };

  // Sort properties by priority with special STRIKE_NOW sorting
  const sortedListings = React.useMemo(() => {
    const allListings = [...results.listings].map(listing => ({
      ...listing,
      badge: getPriorityBadge(listing)
    }));

    // Separate STRIKE_NOW listings for special sorting
    const strikeNowListings = allListings
      .filter(l => l.badge.label === 'STRIKE NOW')
      .sort((a, b) => {
        // 1. Top value ALWAYS first (lowest $/sqft in entire search)
        const aIsTopValue = a.pricePerSqft !== null && a.pricePerSqft !== undefined &&
                           minPricePerSqft !== null &&
                           Math.abs(a.pricePerSqft - minPricePerSqft) < 0.01;
        const bIsTopValue = b.pricePerSqft !== null && b.pricePerSqft !== undefined &&
                           minPricePerSqft !== null &&
                           Math.abs(b.pricePerSqft - minPricePerSqft) < 0.01;

        if (aIsTopValue && !bIsTopValue) return -1;
        if (!aIsTopValue && bIsTopValue) return 1;

        // 2. Sort by % below market (higher % = better deal)
        const aBelowPct = avgPricePerSqft && a.pricePerSqft
          ? (avgPricePerSqft - a.pricePerSqft) / avgPricePerSqft
          : 0;
        const bBelowPct = avgPricePerSqft && b.pricePerSqft
          ? (avgPricePerSqft - b.pricePerSqft) / avgPricePerSqft
          : 0;
        const diffPct = bBelowPct - aBelowPct;
        if (Math.abs(diffPct) > 0.001) return diffPct > 0 ? 1 : -1;

        // 3. Sort by price cuts (more cuts = more motivated seller)
        const diffCuts = (b.priceCutsCount ?? 0) - (a.priceCutsCount ?? 0);
        if (diffCuts !== 0) return diffCuts;

        // 4. Sort by $/sqft (lower = better value)
        const diffSqft = (a.pricePerSqft ?? 999999) - (b.pricePerSqft ?? 999999);
        if (diffSqft !== 0) return diffSqft;

        // 5. Sort by DOM (newer = more urgent)
        return (a.daysOnMarket ?? 9999) - (b.daysOnMarket ?? 9999);
      });

    // Keep other priority groups sorted by their sortOrder
    const otherListings = allListings
      .filter(l => l.badge.label !== 'STRIKE NOW')
      .sort((a, b) => a.badge.sortOrder - b.badge.sortOrder);

    // Merge: STRIKE_NOW first (with special sort), then others
    return [...strikeNowListings, ...otherListings];
  }, [results.listings, avgPricePerSqft, minPricePerSqft]);

  // Calculate insight metrics
  const insights = React.useMemo(() => {
    const allProperties = results.listings;

    // Count priority types with new action verbs
    let strikeNowCount = 0;
    let actNowCount = 0;
    let lowballCount = 0;
    let reviewCount = 0;
    let walkAwayCount = 0;
    let skipCount = 0;
    let belowMarketTotal = 0;
    let belowMarketProperties = 0;

    allProperties.forEach(property => {
      const valueIndicator = getValueIndicator(property.pricePerSqft);
      const priorityBadge = getPriorityBadge(property);

      if (priorityBadge && priorityBadge.label) {
        switch (priorityBadge.label) {
          case 'STRIKE NOW': strikeNowCount++; break;
          case 'ACT NOW': actNowCount++; break;
          case 'LOWBALL': lowballCount++; break;
          case 'REVIEW': reviewCount++; break;
          case 'WALK AWAY': walkAwayCount++; break;
          case 'SKIP': skipCount++; break;
        }
      }

      // Calculate average savings for below-market properties
      if (valueIndicator && valueIndicator.icon === '🔥' && avgPricePerSqft) {
        const percentDiff = Math.abs(((property.pricePerSqft! - avgPricePerSqft) / avgPricePerSqft) * 100);
        belowMarketTotal += percentDiff;
        belowMarketProperties++;
      }
    });

    // Price range
    const prices = allProperties.map(p => p.listPrice).filter(p => p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // $/sqft range
    const sqftPrices = allProperties.map(p => p.pricePerSqft).filter((p): p is number => p !== undefined && p > 0);
    const minSqft = sqftPrices.length > 0 ? Math.min(...sqftPrices) : 0;
    const maxSqft = sqftPrices.length > 0 ? Math.max(...sqftPrices) : 0;

    const avgSavings = belowMarketProperties > 0 ? Math.round(belowMarketTotal / belowMarketProperties) : 0;

    // Urgent = STRIKE NOW + ACT NOW (immediate action needed)
    const urgentCount = strikeNowCount + actNowCount;

    return {
      strikeNowCount,
      actNowCount,
      lowballCount,
      reviewCount,
      walkAwayCount,
      skipCount,
      urgentCount,
      avgSavings,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
      totalProperties: allProperties.length,
      // Priority actions = actionable items (STRIKE_NOW + ACT_NOW + LOWBALL)
      priorityActions: strikeNowCount + actNowCount + lowballCount,
    };
  }, [results.listings, avgPricePerSqft]);

  // Calculate market strategy line
  const marketStrategy = React.useMemo(() => {
    if (results.listings.length === 0) return null;

    const allDOM = results.listings.map(p => p.daysOnMarket || 0);
    const avgDOM = allDOM.reduce((a, b) => a + b, 0) / allDOM.length;
    const propertiesWithCuts = results.listings.filter(p => (p.priceCutsCount || 0) > 0).length;
    const pctWithCuts = propertiesWithCuts / results.listings.length;

    if (avgDOM > 60) {
      return "Soft market — lowball anything stale";
    }
    if (avgDOM < 21) {
      return "Hot market — ACT NOW or lose";
    }
    if (pctWithCuts > 0.5) {
      return "Sellers weakening — push hard on price";
    }
    return "Mixed market — let seller behavior guide strategy";
  }, [results.listings]);

  return (
    <div className="space-y-4">
    {/* Market Strategy Line - THE KILLER INSIGHT */}
    {marketStrategy && (
      <div className="bg-gray-900 text-white p-4 rounded-lg">
        <div className="text-lg font-bold">{marketStrategy}</div>
      </div>
    )}

    {/* Insight Cards */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Market Snapshot Card */}
      <Card className="col-span-1 md:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Market Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Total Properties</div>
              <div className="text-2xl font-bold">{insights.totalProperties}</div>
            </div>
            <div>
              <div className="text-gray-600">Avg $/SqFt</div>
              <div className="text-2xl font-bold">{avgPricePerSqft ? `$${avgPricePerSqft}` : 'N/A'}</div>
              <div className="text-xs text-gray-500">${insights.minSqft} - ${insights.maxSqft}</div>
            </div>
            <div>
              <div className="text-gray-600">Price Range</div>
              <div className="text-lg font-bold">{formatPrice(insights.minPrice)}</div>
              <div className="text-xs text-gray-500">to {formatPrice(insights.maxPrice)}</div>
            </div>
            <div>
              <div className="text-gray-600">Priority Actions</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {insights.strikeNowCount > 0 && (
                  <Badge className="bg-green-200 text-green-900 border-green-400">
                    💎 {insights.strikeNowCount}
                  </Badge>
                )}
                {insights.actNowCount > 0 && (
                  <Badge className="bg-blue-200 text-blue-900 border-blue-400">
                    ⚡ {insights.actNowCount}
                  </Badge>
                )}
                {insights.lowballCount > 0 && (
                  <Badge className="bg-yellow-200 text-yellow-900 border-yellow-400">
                    🎯 {insights.lowballCount}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* STRIKE NOW Card */}
      {insights.strikeNowCount > 0 && (
        <Card className="border-green-300 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-900">
              💎 STRIKE NOW
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-900 mb-1">{insights.strikeNowCount}</div>
            <div className="text-sm text-green-700">below market</div>
            <div className="text-xs text-green-600 mt-2">Avg savings: {insights.avgSavings}%</div>
          </CardContent>
        </Card>
      )}

      {/* ACT NOW Card */}
      {insights.actNowCount > 0 && (
        <Card className="border-blue-300 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-blue-900">
              ⚡ ACT NOW
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900 mb-1">{insights.actNowCount}</div>
            <div className="text-sm text-blue-700">new listings</div>
            <div className="text-xs text-blue-600 mt-2">Priced right, move fast</div>
          </CardContent>
        </Card>
      )}

      {/* LOWBALL Card */}
      {insights.lowballCount > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-yellow-900">
              🎯 LOWBALL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-900 mb-1">{insights.lowballCount}</div>
            <div className="text-sm text-yellow-700">seller weakness</div>
            <div className="text-xs text-yellow-600 mt-2">High leverage opportunities</div>
          </CardContent>
        </Card>
      )}
    </div>

    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Market Overview ({results.totalFound} properties)
            </CardTitle>
            <div className="text-sm text-gray-600 mt-1">
              Search criteria: {results.searchCriteria.budgetRange}, {results.searchCriteria.bedrooms} beds, {results.searchCriteria.location}
            </div>
          </div>
          {selectedProperties.size > 0 && (
            <Button
              onClick={() => {
                onSaveProperties(Array.from(selectedProperties));
              }}
            >
              Save {selectedProperties.size} Properties
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium w-12">
                  <Checkbox
                    checked={selectedProperties.size === results.listings.slice(0, 20).length && results.listings.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const allIds = new Set(results.listings.slice(0, 20).map(p => p.mlsNumber || `${p.address}-${p.listPrice}`));
                        setSelectedProperties(allIds);
                      } else {
                        setSelectedProperties(new Set());
                      }
                    }}
                  />
                </th>
                <th className="text-left p-4 font-medium">Priority</th>
                <th className="text-left p-4 font-medium">Property</th>
                <th className="text-left p-4 font-medium">Price</th>
                <th className="text-left p-4 font-medium">$/SqFt</th>
                <th className="text-left p-4 font-medium">Beds/Baths</th>
                <th className="text-left p-4 font-medium">Buyer Fit</th>
                <th className="text-left p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedListings.map((property, index) => {
                const valueIndicator = getValueIndicator(property.pricePerSqft);
                const priorityBadge = getPriorityBadge(property);

                // Check if this is the top value property (lowest $/sqft)
                const isTopValue = property.pricePerSqft !== null &&
                                  property.pricePerSqft !== undefined &&
                                  minPricePerSqft !== null &&
                                  Math.abs(property.pricePerSqft - minPricePerSqft) < 0.01;

                // Enhanced styling for top value property
                const rowClassName = isTopValue
                  ? 'border-l-4 border-green-500 bg-green-50'
                  : priorityBadge.rowClassName || '';

                return (
                <tr key={property.mlsNumber || `property-${index}`} className={`border-b hover:bg-gray-50 ${rowClassName}`}>
                  <td className="p-4">
                    <Checkbox
                      checked={selectedProperties.has(property.mlsNumber || `${property.address}-${property.listPrice}`)}
                      onCheckedChange={(checked) => {
                        const id = property.mlsNumber || `${property.address}-${property.listPrice}`;
                        const newSelected = new Set(selectedProperties);
                        if (checked) {
                          newSelected.add(id);
                        } else {
                          newSelected.delete(id);
                        }
                        setSelectedProperties(newSelected);
                      }}
                    />
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className={`text-xs ${priorityBadge.className}`}>
                      {priorityBadge.icon} {priorityBadge.label}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-12 bg-gray-200 rounded flex items-center justify-center">
                        <Home className="h-6 w-6 text-gray-400" />
                      </div>
                      <div>
                        <div className="font-medium">{property.address}</div>
                        <div className="text-sm text-gray-600">
                          {property.city}, {property.state} {property.zip}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">{formatPrice(property.listPrice)}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-gray-700">
                      {property.pricePerSqft ? `$${property.pricePerSqft}` : 'N/A'}
                    </div>
                    {valueIndicator && (
                      <div className={`text-xs font-medium ${valueIndicator.color}`}>
                        {valueIndicator.icon} {valueIndicator.label}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Bed className="h-4 w-4" />
                        {property.bedrooms}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bath className="h-4 w-4" />
                        {property.bathrooms}
                      </span>
                      <span className="text-sm text-gray-500">
                        {property.sqft ? `${property.sqft?.toLocaleString()} sf` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {(() => {
                      // Use backend-computed fit data if available, otherwise compute locally
                      const fitResult = property.fitScore !== undefined && property.fitChips
                        ? {
                            fitScore: property.fitScore,
                            chips: property.fitChips.map(chip => ({
                              ...chip,
                              className: chip.type === 'hard' ? 'bg-red-100 text-red-800 border-red-300' :
                                         chip.type === 'soft' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                         'bg-green-100 text-green-800 border-green-300',
                              icon: chip.type === 'hard' ? '❌' : chip.type === 'soft' ? '⚠' : '✓',
                            })),
                            hardCount: property.fitChips.filter(c => c.type === 'hard').length,
                            softCount: property.fitChips.filter(c => c.type === 'soft').length,
                          }
                        : deriveFitChips(property, profile);
                      return (
                        <div className="flex flex-col gap-1">
                          {/* Fit Score */}
                          <span className={`text-xs font-medium ${
                            fitResult.fitScore >= 80 ? 'text-green-700' :
                            fitResult.fitScore >= 50 ? 'text-amber-700' :
                            'text-red-700'
                          }`}>
                            Fit: {fitResult.fitScore}%
                          </span>
                          {/* Chips */}
                          <div className="flex flex-wrap gap-1">
                            {fitResult.chips.length > 0 ? (
                              fitResult.chips.map((chip) => (
                                <span
                                  key={chip.key}
                                  className={`text-xs px-1.5 py-0.5 rounded border ${chip.className}`}
                                >
                                  {chip.icon} {chip.label}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-500">No specific signals</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-4">
                    <div className="text-sm space-y-0.5">
                      {priorityBadge.statusLines ? (
                        priorityBadge.statusLines.map((line, idx) => {
                          // Make "Top value in this search" visually dominant
                          const isTopValueLine = line.includes('Top value in this search');
                          return (
                            <div
                              key={idx}
                              className={
                                isTopValueLine
                                  ? 'text-emerald-700 font-bold text-sm flex items-center gap-1'
                                  : idx === 0
                                    ? 'text-gray-700 font-medium'
                                    : 'text-gray-500 text-xs'
                              }
                            >
                              {isTopValueLine ? '⭐ ' : ''}{line}
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-gray-700">{priorityBadge.statusReason}</span>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

      {/* Filtered Out Properties Section */}
      {results.rejectedListings && results.rejectedListings.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="cursor-pointer" onClick={() => setShowRejected(!showRejected)}>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-5 w-5" />
                Filtered Out Properties ({results.rejectedListings.length})
              </CardTitle>
              <Button variant="ghost" size="sm">
                {showRejected ? 'Hide' : 'Show'}
              </Button>
            </div>
            <div className="text-sm text-red-600 mt-1">
              Properties excluded based on objective criteria (budget, bedrooms, etc.)
            </div>
          </CardHeader>
          {showRejected && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-red-50 border-b border-red-200">
                    <tr>
                      <th className="text-left p-4 font-medium text-red-900">Property</th>
                      <th className="text-left p-4 font-medium text-red-900">Price</th>
                      <th className="text-left p-4 font-medium text-red-900">Beds/Baths</th>
                      <th className="text-left p-4 font-medium text-red-900">Filter Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.rejectedListings.map((property, index) => (
                      <tr key={property.mlsNumber || `rejected-${index}`} className="border-b border-red-100 hover:bg-red-50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-12 bg-red-100 rounded flex items-center justify-center">
                              <Home className="h-6 w-6 text-red-400" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{property.address}</div>
                              <div className="text-sm text-gray-600">
                                {property.city}, {property.state} {property.zip}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-semibold text-gray-900">{formatPrice(property.listPrice)}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1 text-gray-700">
                              <Bed className="h-4 w-4" />
                              {property.bedrooms}
                            </span>
                            <span className="flex items-center gap-1 text-gray-700">
                              <Bath className="h-4 w-4" />
                              {property.bathrooms}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {property.filterReasons && property.filterReasons.length > 0 ? (
                              property.filterReasons.map((reason, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-300">
                                  {reason}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="outline" className="text-xs bg-gray-100 text-gray-800 border-gray-300">
                                Filtered out
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

// AI Recommendations Component
function AIRecommendationsView({
  results,
  formatPrice,
  getScoreColor,
  profile,
  selectedProperties,
  setSelectedProperties,
  onSaveProperties,
  photoAnalysis,
  isLoadingPhotos
}: {
  results: SearchView2Results;
  formatPrice: (price: number) => string;
  getScoreColor: (score: number) => string;
  profile: BuyerProfile;
  selectedProperties: Set<string>;
  setSelectedProperties: (selected: Set<string>) => void;
  onSaveProperties: (propertyIds: string[]) => void;
  photoAnalysis?: Record<string, PhotoAnalysisResult>;
  isLoadingPhotos?: boolean;
}) {
  // State to track selected image index for each property
  const [selectedImageIndex, setSelectedImageIndex] = useState<Record<string, number>>({});

  // Top-K sorting logic: Mark top 5 properties by fitScore as "top picks"
  const TOP_K = 5;
  const listingsWithTopPicks = React.useMemo(() => {
    const sorted = [...results.listings]
      .filter(l => l.aiAnalysis) // Only properties with AI analysis
      .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));

    return results.listings.map((property, index) => {
      const sortedIndex = sorted.findIndex(p => p.mlsNumber === property.mlsNumber);
      const isTopByRank = sortedIndex < TOP_K && sortedIndex >= 0;
      const isScoreOk = (property.fitScore ?? 0) >= 70;

      return {
        ...property,
        isTopPick: isTopByRank && isScoreOk
      };
    });
  }, [results.listings]);

  // Sort listings for display: top picks first, then by fitScore DESC
  const orderedListings = React.useMemo(() => {
    const sorted = [...listingsWithTopPicks].sort((a, b) => {
      // Top picks first
      if (a.isTopPick !== b.isTopPick) {
        return a.isTopPick ? -1 : 1;
      }
      // Within each group, sort by fitScore DESC
      return (b.fitScore ?? 0) - (a.fitScore ?? 0);
    });

    // Debug: Log top 5 order
    console.log('[AI TAB] Top 5 Order:', sorted.slice(0, 5).map((p, i) => ({
      rank: i + 1,
      address: p.address,
      fitScore: p.fitScore,
      isTopPick: p.isTopPick,
      mlsNumber: p.mlsNumber
    })));

    return sorted;
  }, [listingsWithTopPicks]);

  // Handler to change the displayed image
  const handleImageClick = (propertyId: string, imageIndex: number) => {
    setSelectedImageIndex(prev => ({
      ...prev,
      [propertyId]: imageIndex
    }));
  };

  // Handler to cycle to next image when clicking main image
  const handleMainImageClick = (propertyId: string, totalImages: number) => {
    setSelectedImageIndex(prev => {
      const currentIndex = prev[propertyId] || 0;
      const nextIndex = (currentIndex + 1) % totalImages;
      return {
        ...prev,
        [propertyId]: nextIndex
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Select All Header */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedProperties.size === orderedListings.slice(0, 10).length && orderedListings.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    const allIds = new Set(orderedListings.slice(0, 10).map(p => p.mlsNumber || `${p.address}-${p.listPrice}`));
                    setSelectedProperties(allIds);
                  } else {
                    setSelectedProperties(new Set());
                  }
                }}
              />
              <span className="font-medium">
                Select All ({selectedProperties.size} selected)
              </span>
            </div>
            {selectedProperties.size > 0 && (
              <Button
                onClick={() => {
                  onSaveProperties(Array.from(selectedProperties));
                }}
              >
                Save {selectedProperties.size} Properties
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Property Recommendations */}
      <div className="grid grid-cols-1 gap-6">
        {orderedListings.slice(0, 10).map((property, index) => (
          <Card key={property.mlsNumber || `ai-property-${index}`} className="overflow-hidden hover:shadow-lg transition-shadow">
            {/* Property Images Section */}
            <div className="relative">
              <div className="aspect-[2/1] bg-gray-100">
                {property.images && property.images.length > 0 ? (
                  <div className="relative h-full">
                    {/* Main Image - Click to expand */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <img
                          src={property.images[selectedImageIndex[property.mlsNumber] || 0]}
                          alt={`${property.address} - ${property.city}, ${property.state}`}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                          }}
                        />
                      </DialogTrigger>
                      <DialogContent className="max-w-7xl w-full p-0">
                        <img
                          src={property.images[selectedImageIndex[property.mlsNumber] || 0]}
                          alt={`${property.address} - ${property.city}, ${property.state}`}
                          className="w-full h-auto"
                        />
                      </DialogContent>
                    </Dialog>

                    {/* Image Counter */}
                    <div className="absolute top-4 right-4">
                      <Badge className="bg-black/70 text-white backdrop-blur-sm">
                        {(selectedImageIndex[property.mlsNumber] || 0) + 1} / {property.images.length}
                      </Badge>
                    </div>

                    {/* Thumbnail strip for additional images - Now Clickable */}
                    {property.images.length > 1 && (
                      <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto">
                        {property.images.map((img, idx) => {
                          const isSelected = (selectedImageIndex[property.mlsNumber] || 0) === idx;
                          return (
                            <div
                              key={idx}
                              className={`w-16 h-12 rounded overflow-hidden cursor-pointer transition-all flex-shrink-0
                                ${isSelected
                                  ? 'ring-2 ring-white ring-offset-2 ring-offset-black/50'
                                  : 'hover:opacity-100 opacity-70'
                                }`}
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent triggering main image click
                                handleImageClick(property.mlsNumber, idx);
                              }}
                            >
                              <img
                                src={img}
                                alt={`View ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Home className="h-16 w-16 text-gray-400" />
                  </div>
                )}
              </div>
              
              {/* Selection Checkbox */}
              <div className="absolute top-4 left-4 bg-white rounded-md p-2 shadow-md">
                <Checkbox
                  checked={selectedProperties.has(property.mlsNumber || `${property.address}-${property.listPrice}`)}
                  onCheckedChange={(checked) => {
                    const id = property.mlsNumber || `${property.address}-${property.listPrice}`;
                    const newSelected = new Set(selectedProperties);
                    if (checked) {
                      newSelected.add(id);
                    } else {
                      newSelected.delete(id);
                    }
                    setSelectedProperties(newSelected);
                  }}
                />
              </div>

              {/* Fit Score Badge */}
              <div className="absolute top-4 left-14">
                <Badge className={`${getScoreColor(property.fitScore ?? property.matchScore ?? 0)} border font-semibold text-sm px-3 py-1`}>
                  {property.fitScore ?? property.matchScore ?? 0}% Fit
                </Badge>
              </div>
            </div>
            
            <CardContent className="space-y-6">
              {/* Property Header */}
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-3xl font-bold text-gray-900">{formatPrice(property.listPrice)}</div>
                    <div className="text-lg font-medium text-gray-700">{property.address}</div>
                    <div className="text-gray-600">
                      {property.city}, {property.state} {property.zip}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-3">
                      <div className="text-center px-3">
                        <div className="text-2xl font-bold">{property.bedrooms}</div>
                        <div className="text-xs text-gray-600">Beds</div>
                      </div>
                      <div className="text-center px-3 border-l border-gray-200">
                        <div className="text-2xl font-bold">{property.bathrooms}</div>
                        <div className="text-xs text-gray-600">Baths</div>
                      </div>
                      <div className="text-center px-3 border-l border-gray-200">
                        <div className="text-2xl font-bold">
                          {property.sqft ? Math.round(property.sqft).toLocaleString() : '—'}
                        </div>
                        <div className="text-xs text-gray-600">Sq Ft</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats Bar */}
                <div className="flex items-center gap-4 text-sm text-gray-600 pb-4 border-b">
                  <span className="flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    {property.propertyType}
                  </span>
                  {property.yearBuilt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Built {property.yearBuilt}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {property.daysOnMarket ? `${property.daysOnMarket} days on market` : 'New listing'}
                  </span>
                </div>
              </div>

              {/* Client Summary - Buyer-Facing Dashboard */}
              {property.aiAnalysis && (
                <div className="space-y-4">
                  {property.isTopPick ? (
                    <ClientSummaryDeep
                      analysis={{
                        fit_score: property.fitScore ?? property.matchScore ?? null,
                        whats_matching: property.aiAnalysis.whats_matching,
                        whats_missing: property.aiAnalysis.whats_missing,
                        red_flags: property.aiAnalysis.red_flags,
                        photo_matches: photoAnalysis?.[property.mlsNumber]?.photo_matches,
                        photo_red_flags: photoAnalysis?.[property.mlsNumber]?.photo_red_flags,
                        agent_take_ai: photoAnalysis?.[property.mlsNumber]?.agent_take_ai ?? property.aiAnalysis.agent_take_ai,
                        agent_take_final: property.aiAnalysis.agent_take_final,
                        vision_complete: photoAnalysis?.[property.mlsNumber]?.vision_complete ?? property.aiAnalysis.vision_complete ?? false,
                      }}
                      buyerProfile={profile}
                      listing={property}
                      isLoadingPhotos={isLoadingPhotos && index < 5}
                    />
                  ) : (
                    <ClientSummaryLight
                      analysis={{
                        fit_score: property.fitScore ?? property.matchScore ?? null,
                        whats_matching: property.aiAnalysis.whats_matching,
                        whats_missing: property.aiAnalysis.whats_missing,
                        red_flags: property.aiAnalysis.red_flags,
                        photo_red_flags: photoAnalysis?.[property.mlsNumber]?.photo_red_flags,
                      }}
                      isLoadingPhotos={isLoadingPhotos && index < 5}
                    />
                  )}

                  {/* Collapsible Detailed Analysis */}
                  <Accordion type="single" collapsible className="border rounded-lg">
                    <AccordionItem value="details" className="border-none">
                      <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 text-sm text-gray-600">
                        View detailed AI analysis →
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-4">
                        {/* Original Headline + Summary */}
                        <div className="text-lg font-bold text-gray-900">
                          {property.aiAnalysis.headline}
                        </div>
                        <div className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          {property.aiAnalysis.summary_for_buyer}
                        </div>

                        {/* Section 1: What's Matching */}
                  {property.aiAnalysis.whats_matching?.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <h4 className="font-semibold text-green-900">What's Matching</h4>
                      </div>
                      <div className="space-y-2">
                        {(property.aiAnalysis.whats_matching || []).slice(0, 5).map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${item.source === 'explicit' ? 'bg-green-200 text-green-800' : 'bg-green-100 text-green-700'}`}>
                              {item.source === 'explicit' ? '✓' : '~'}
                            </span>
                            <div className="flex-1">
                              <span className="text-sm font-medium text-green-900">{item.requirement}</span>
                              <p className="text-xs text-green-700 italic">"{item.evidence}"</p>
                            </div>
                          </div>
                        ))}
                        {(property.aiAnalysis.whats_matching?.length || 0) > 5 && (
                          <div className="text-xs text-green-600">+{(property.aiAnalysis.whats_matching?.length || 0) - 5} more matches</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section 2: What's Missing */}
                  {property.aiAnalysis.whats_missing?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                        <h4 className="font-semibold text-amber-900">What's Missing</h4>
                      </div>
                      <div className="space-y-2">
                        {(property.aiAnalysis.whats_missing || []).slice(0, 5).map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">?</span>
                            <div className="flex-1">
                              <span className="text-sm font-medium text-amber-900">{item.requirement}</span>
                              <p className="text-xs text-amber-700">{item.assessment}</p>
                              {item.workaround && (
                                <p className="text-xs text-amber-600 italic">Workaround: {item.workaround}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {(property.aiAnalysis.whats_missing?.length || 0) > 5 && (
                          <div className="text-xs text-amber-600">+{(property.aiAnalysis.whats_missing?.length || 0) - 5} more items</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section 3: Red Flags */}
                  {property.aiAnalysis.red_flags?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <h4 className="font-semibold text-red-900">Red Flags</h4>
                      </div>
                      <div className="space-y-3">
                        {(property.aiAnalysis.red_flags || []).slice(0, 5).map((flag, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              flag.risk_level === 'high' ? 'bg-red-300 text-red-900' :
                              flag.risk_level === 'medium' ? 'bg-red-200 text-red-800' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {flag.risk_level.toUpperCase()}
                            </span>
                            <div className="flex-1">
                              <span className="text-sm font-medium text-red-900">{flag.concern}</span>
                              {flag.quote && flag.quote !== 'N/A' && (
                                <p className="text-xs text-red-700 italic">"{flag.quote}"</p>
                              )}
                              <p className="text-xs text-red-600">Ask: {flag.follow_up}</p>
                            </div>
                          </div>
                        ))}
                        {(property.aiAnalysis.red_flags?.length || 0) > 5 && (
                          <div className="text-xs text-red-600">+{(property.aiAnalysis.red_flags?.length || 0) - 5} more flags</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Photo Checks Section - Vision AI Analysis */}
                  {(() => {
                const propertyPhotoAnalysis = photoAnalysis?.[property.mlsNumber];

                // Show loading state for Top 5 properties
                if (isLoadingPhotos && index < 5) {
                  return (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye className="h-5 w-5 text-purple-600 animate-pulse" />
                        <h4 className="font-semibold text-purple-900">Photo Checks (AI)</h4>
                        <span className="text-xs text-purple-600">Analyzing photos...</span>
                      </div>
                      <div className="h-20 flex items-center justify-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                      </div>
                    </div>
                  );
                }

                // Show photo analysis if available
                if (propertyPhotoAnalysis) {
                  return (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye className="h-5 w-5 text-purple-600" />
                        <h4 className="font-semibold text-purple-900">Photo Checks (AI)</h4>
                      </div>

                      {/* Photo Headline */}
                      <div className="text-sm font-medium text-purple-900 mb-2">
                        {propertyPhotoAnalysis.photo_headline}
                      </div>

                      {/* Photo Summary */}
                      <div className="text-xs text-purple-700 mb-3 italic">
                        {propertyPhotoAnalysis.photo_summary}
                      </div>

                      {/* Photo Matches */}
                      {propertyPhotoAnalysis.photo_matches?.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <div className="text-xs font-medium text-purple-800">Visual Requirements Check:</div>
                          {propertyPhotoAnalysis.photo_matches.map((match, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                match.status === 'present' ? 'bg-green-200 text-green-800' :
                                match.status === 'absent' ? 'bg-red-200 text-red-800' :
                                'bg-gray-200 text-gray-700'
                              }`}>
                                {match.status === 'present' ? '✓' : match.status === 'absent' ? '✗' : '?'}
                              </span>
                              <div className="flex-1">
                                <span className="text-xs font-medium text-purple-900">{match.requirement}</span>
                                <p className="text-xs text-purple-600">{match.evidence}</p>
                              </div>
                              <span className={`text-xs px-1 py-0.5 rounded ${
                                match.confidence === 'high' ? 'bg-purple-200 text-purple-800' :
                                match.confidence === 'medium' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {match.confidence}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Photo Red Flags */}
                      {propertyPhotoAnalysis.photo_red_flags?.length > 0 && (
                        <div className="space-y-2 border-t border-purple-200 pt-3">
                          <div className="text-xs font-medium text-red-700">Visual Concerns:</div>
                          {propertyPhotoAnalysis.photo_red_flags.map((flag, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                flag.severity === 'high' ? 'bg-red-300 text-red-900' :
                                flag.severity === 'medium' ? 'bg-red-200 text-red-800' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {flag.severity.toUpperCase()}
                              </span>
                              <div className="flex-1">
                                <span className="text-xs font-medium text-red-800">{flag.concern}</span>
                                <p className="text-xs text-red-600">{flag.evidence}</p>
                                <p className="text-xs text-red-500 italic">Ask: {flag.follow_up}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                // For Top 5 properties without photo analysis yet, show placeholder
                if (index < 5 && !isLoadingPhotos && !propertyPhotoAnalysis) {
                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <Eye className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Photo analysis will load when available</span>
                      </div>
                    </div>
                  );
                }

                return null;
              })()}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}

              {/* Fallback if no AI analysis */}
              {!property.aiAnalysis && (
                <div className="text-sm text-gray-500 italic">
                  AI analysis not available for this property.
                </div>
              )}

              {/* Property Description */}
              {property.description && (
                <div>
                  <h4 className="font-medium text-sm text-gray-900 mb-2">Property Description</h4>
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {property.description}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button className="flex-1" size="sm">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share with Client
                </Button>
                <Button variant="outline" className="flex-1" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  Full Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}