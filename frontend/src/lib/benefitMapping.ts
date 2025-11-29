/**
 * Template functions for Client Summary bullets
 * Maps requirements and concerns to human-readable benefit language
 */

export type FeatureKey =
  | "bedrooms"
  | "bathrooms"
  | "parking"
  | "backyard"
  | "kitchen"
  | "basement"
  | "light"
  | "other";

interface BuyerProfile {
  hasKids?: boolean;
  workFromHome?: boolean;
  entertainsOften?: boolean;
}

interface ExceedsTemplate {
  headline: string;
  body: string;
}

/**
 * Get canonical feature key from requirement text for deduplication
 */
export function getFeatureKey(requirement: string): FeatureKey {
  const r = requirement.toLowerCase();
  if (r.includes("bedroom")) return "bedrooms";
  if (r.includes("bath")) return "bathrooms";
  if (r.includes("garage") || r.includes("parking") || r.includes("driveway")) return "parking";
  if (r.includes("yard") || r.includes("backyard") || r.includes("patio")) return "backyard";
  if (r.includes("kitchen")) return "kitchen";
  if (r.includes("basement")) return "basement";
  if (r.includes("light") || r.includes("natural light")) return "light";
  return "other";
}

/**
 * Validate that evidence text actually mentions the requirement
 */
export function evidenceMentionsRequirement(
  evidence: string | undefined,
  key: FeatureKey
): boolean {
  if (!evidence) return false;
  const e = evidence.toLowerCase();

  if (key === "bedrooms") return e.includes("bedroom") || e.includes("bed");
  if (key === "bathrooms") return e.includes("bath") || e.includes("full bath") || e.includes("half bath");
  if (key === "parking") return e.includes("garage") || e.includes("driveway") || e.includes("parking");
  if (key === "backyard") return e.includes("yard") || e.includes("backyard") || e.includes("patio") || e.includes("deck");
  if (key === "kitchen") return e.includes("kitchen") || e.includes("counter") || e.includes("appliance");
  if (key === "basement") return e.includes("basement") || e.includes("finished basement");
  if (key === "light") return e.includes("light") || e.includes("window") || e.includes("bright");

  return true; // default: don't overfilter "other"
}

/**
 * Clean up evidence text (remove redundant prefixes and trailing punctuation)
 */
export function cleanEvidence(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();

  // Strip "photo(s) show..." noise
  s = s.replace(/^photos?\s+show\s+/i, "");
  s = s.replace(/^listing\s+says\s+/i, "");
  s = s.replace(/^the\s+home\s+features\s+/i, "");

  // Remove trailing punctuation (.,!?)
  s = s.replace(/[.!?]+$/, "");

  return s;
}

/**
 * Map requirement type to benefit phrase based on buyer profile
 */
export function mapBenefit(requirement: string, profile?: BuyerProfile): string {
  const reqLower = requirement.toLowerCase();

  if (reqLower.includes('bedroom')) {
    if (profile?.hasKids) return 'room for a growing family without feeling cramped';
    if (profile?.workFromHome) return 'space for a dedicated home office, guests, or future needs';
    if (profile?.entertainsOften) return 'room for hosting, a home office, or guest space';
    return 'room for an office, guests, or future plans without feeling cramped';
  }

  if (reqLower.includes('bath')) {
    return 'easier mornings and no bathroom traffic jams';
  }

  if (reqLower.includes('parking') || reqLower.includes('garage')) {
    return 'easier winters, storage for bikes/tools/seasonal items, and real off-street parking';
  }

  if (reqLower.includes('kitchen')) {
    return 'not walking into an immediate kitchen reno';
  }

  if (reqLower.includes('yard') || reqLower.includes('outdoor')) {
    if (profile?.hasKids) return 'practical space for kids to play outdoors';
    return 'practical for pets, outdoor seating, or gardening without heavy maintenance';
  }

  // Generic fallback
  return 'flexibility for your lifestyle and future needs';
}

/**
 * Get benefit headline for exceeds-vs-minimums template
 */
export function getBenefitHeadline(requirement: string): string {
  const reqLower = requirement.toLowerCase();

  if (reqLower.includes('bedroom')) return 'More space than you asked for';
  if (reqLower.includes('bath')) return 'Extra bathrooms for easier mornings';
  if (reqLower.includes('parking') || reqLower.includes('garage')) return 'Winter-friendly parking + storage';
  if (reqLower.includes('kitchen')) return 'Kitchen that\'s already done';
  if (reqLower.includes('yard')) return 'Usable outdoor space';

  return 'Exceeds your requirements';
}

/**
 * Generate exceeds-vs-minimums template
 */
export function getExceedsTemplate(
  requirement: string,
  min: number,
  actual: number,
  profile?: BuyerProfile
): ExceedsTemplate {
  const benefit = mapBenefit(requirement, profile);
  const headline = getBenefitHeadline(requirement);

  return {
    headline,
    body: `You were looking for at least ${min} ${requirement}; this home has ${actual} ${requirement}, which gives you ${benefit}.`
  };
}

/**
 * Generate verified feature template (text + photo confirmed)
 */
export function getVerifiedFeatureTemplate(
  feature: string,
  evidence: string,
  photoConfirmed: boolean
): { headline: string; body: string } | null {
  const featureLower = feature.toLowerCase();

  if (featureLower.includes('kitchen')) {
    return {
      headline: 'Kitchen that\'s already done',
      body: `Listing and photos show ${evidence}${photoConfirmed ? ' (confirmed in photos)' : ''}, so you're not walking into an immediate kitchen reno.`
    };
  }

  if (featureLower.includes('backyard') || featureLower.includes('yard')) {
    return {
      headline: 'Usable, low-stress backyard',
      body: `Photos show ${evidence}, which is practical for kids, pets, or outdoor seating without heavy maintenance.`
    };
  }

  if (featureLower.includes('parking') || featureLower.includes('garage') || featureLower.includes('driveway')) {
    return {
      headline: 'Winter-friendly parking + storage',
      body: `${evidence} gives you real off-street parking, easier snow days, and extra storage for bikes, tools, or seasonal items.`
    };
  }

  // Generic fallback
  return {
    headline: feature,
    body: evidence + (photoConfirmed ? ' (confirmed in photos)' : '')
  };
}

/**
 * Concern templates for "What You Should Know" section
 */
export const concernTemplates = {
  vague_language: (quote: string): string =>
    `Listing uses vague "${quote}" language — Phrases like this often mean some level of updates are expected. I'd ask exactly what work they think a buyer will want to do (purely cosmetic vs bigger items).`,

  older_home: (yearBuilt?: number): string =>
    yearBuilt
      ? `Age of the home (built ${yearBuilt}) = likely ongoing maintenance — Worth asking what major items (roof, windows, electrical, plumbing) have been done recently.`
      : `The age of the home likely means ongoing maintenance — Worth asking what major items (roof, windows, electrical, plumbing) have been done recently.`,

  yard_size_unclear: (): string =>
    `Yard likely on the smaller side — The yard looks usable but not huge in the photos. If outdoor space is important, I'd confirm dimensions and how it feels in person.`,

  exterior_condition: (): string =>
    `Exterior condition deserves a closer look — Some exterior elements can show wear on older homes. During a showing, I'd focus on siding, trim and any signs of moisture issues.`,

  generic_concern: (label: string, followUp?: string): string =>
    followUp
      ? `${label} — ${followUp}`
      : `${label} — worth asking your agent about this.`
};

/**
 * Map concern to appropriate template
 */
export function getConcernTemplate(
  label: string,
  quote?: string,
  followUp?: string,
  yearBuilt?: number
): string {
  const labelLower = label.toLowerCase();

  // Check for vague language patterns
  if (
    quote &&
    (quote.toLowerCase().includes('make it your own') ||
      quote.toLowerCase().includes('opportunity') ||
      quote.toLowerCase().includes('potential'))
  ) {
    return concernTemplates.vague_language(quote);
  }

  // Check for age/condition concerns
  if (labelLower.includes('age') || labelLower.includes('older home') || labelLower.includes('built')) {
    return concernTemplates.older_home(yearBuilt);
  }

  // Check for yard size
  if (labelLower.includes('yard') && labelLower.includes('size')) {
    return concernTemplates.yard_size_unclear();
  }

  // Check for exterior condition
  if (labelLower.includes('exterior') || labelLower.includes('siding') || labelLower.includes('condition')) {
    return concernTemplates.exterior_condition();
  }

  // Generic fallback
  return concernTemplates.generic_concern(label, followUp);
}

/**
 * Benefit-focused bullet builders for key features
 */

interface ParkingDetail {
  spaces?: number;
  hasGarage: boolean;
  hasDriveway: boolean;
  type: string;
}

/**
 * Extract parking details from evidence text
 */
export function extractParkingDetail(evidence?: string): ParkingDetail {
  if (!evidence) {
    return { hasGarage: false, hasDriveway: false, type: 'parking' };
  }

  const e = evidence.toLowerCase();
  const hasGarage = e.includes('garage');
  const hasDriveway = e.includes('driveway');

  // Try to extract number of spaces
  const spaceMatch = e.match(/(\d+)\s*(space|car|vehicle)/);
  const spaces = spaceMatch ? parseInt(spaceMatch[1], 10) : undefined;

  return {
    spaces,
    hasGarage,
    hasDriveway,
    type: hasGarage ? 'garage' : hasDriveway ? 'driveway' : 'parking'
  };
}

/**
 * Build benefit-focused parking bullet
 */
export function buildParkingBullet(evidence?: string, photoEvidence?: string): string {
  const detail = extractParkingDetail(evidence || photoEvidence);

  if (detail.hasGarage) {
    const spaces = detail.spaces ? ` for about ${detail.spaces} cars` : '';
    return `Garage${detail.hasDriveway ? ' plus driveway' : ''} parking${spaces}, so winters and guests are easier and you're not juggling street parking`;
  }

  if (detail.hasDriveway) {
    const spaces = detail.spaces ? ` for about ${detail.spaces} cars` : '';
    return `Driveway parking${spaces}, so you're not relying on street parking, especially in winter`;
  }

  // Generic parking
  const spaces = detail.spaces ? ` for ${detail.spaces} cars` : '';
  return `Off-street parking${spaces} makes winters and guest visits easier`;
}

/**
 * Build benefit-focused kitchen bullet
 */
export function buildKitchenBullet(evidence?: string): string {
  const e = (evidence || '').toLowerCase();

  if (e.includes('updated') || e.includes('renovated') || e.includes('new')) {
    return "Kitchen has been updated, so you're not walking into an immediate reno";
  }

  if (e.includes('granite') || e.includes('quartz') || e.includes('stainless')) {
    return "Kitchen features modern finishes, so you're not facing a major renovation on day one";
  }

  return "Kitchen is in usable condition, so you're not walking into an immediate big reno";
}

/**
 * Build benefit-focused backyard bullet
 */
export function buildBackyardBullet(evidence?: string, profile?: BuyerProfile): string {
  const e = (evidence || '').toLowerCase();
  const isFenced = e.includes('fenced') || e.includes('fence');
  const isPatio = e.includes('patio') || e.includes('deck');

  let feature = 'backyard space';
  if (isFenced) feature = 'fenced backyard';
  else if (isPatio) feature = 'patio/deck area';

  if (profile?.hasKids) {
    return `${feature.charAt(0).toUpperCase() + feature.slice(1)} is practical for kids to play outdoors${isFenced ? ' safely' : ''}`;
  }

  return `${feature.charAt(0).toUpperCase() + feature.slice(1)} is practical for pets, outdoor seating, or gardening without heavy maintenance`;
}

/**
 * Build space bullet combining bedrooms and bathrooms with buyer context
 *
 * Three cases:
 * - Case A: Have minimums & actuals → "You were looking for at least X..."
 * - Case B: No minimums but have actuals → "This home has X bedrooms and Y baths"
 * - Case C: Missing actuals → return null (no bullet)
 */
export function buildSpaceBullet(params: {
  bedsActual: number;
  bathsActual: number;
  bedsMin?: number;
  bathsMin?: number;
  profile?: BuyerProfile;
}): { headline: string; body: string } | null {
  const { bedsActual, bathsActual, bedsMin, bathsMin, profile } = params;

  // Case C: Missing actuals → no bullet
  if (bedsActual === undefined || bedsActual === null ||
      bathsActual === undefined || bathsActual === null) {
    return null;
  }

  // Check if we have buyer minimums
  const haveMinimums = bedsMin !== undefined && bedsMin !== null &&
                       bathsMin !== undefined && bathsMin !== null;

  if (haveMinimums) {
    // Case A: Have minimums → full template with benefits

    // Don't create bullet if property doesn't meet minimums
    if (bedsActual < bedsMin || bathsActual < bathsMin) {
      return null;
    }

    // Build benefit reasons from profile (max 2 to keep sentence under ~15 words)
    const reasons: string[] = [];

    if (profile?.hasKids) {
      reasons.push('room for a growing family');
    }

    if (profile?.workFromHome && reasons.length < 2) {
      reasons.push('space for a dedicated home office');
    }

    if (profile?.entertainsOften && reasons.length < 2) {
      reasons.push('space to host friends and family comfortably');
    }

    // Default if no profile flags or still need more
    if (reasons.length === 0) {
      reasons.push('more room to spread out and avoid feeling cramped');
    }

    // Combine reasons (max 2)
    const benefit = reasons.length === 1
      ? reasons[0]
      : `${reasons[0]} and ${reasons[1]}`;

    // Handle .5 baths correctly in display (e.g., "2.5 baths")
    const bedsDisplay = bedsActual;
    const bathsDisplay = bathsActual;

    const body = `You were looking for at least ${bedsMin} ${bedsMin === 1 ? 'bedroom' : 'bedrooms'} and ${bathsMin} ${bathsMin === 1 ? 'bath' : 'baths'}; this home has ${bedsDisplay} ${bedsDisplay === 1 ? 'bedroom' : 'bedrooms'} and ${bathsDisplay} ${bathsDisplay === 1 ? 'bath' : 'baths'}, which gives you ${benefit}`;

    return {
      headline: 'More space than you asked for',
      body
    };
  } else {
    // Case B: No minimums → neutral template
    const bedsDisplay = bedsActual;
    const bathsDisplay = bathsActual;

    return {
      headline: 'Space for your needs',
      body: `This home has ${bedsDisplay} ${bedsDisplay === 1 ? 'bedroom' : 'bedrooms'} and ${bathsDisplay} ${bathsDisplay === 1 ? 'bath' : 'baths'}`
    };
  }
}

/**
 * Parse bedroom count from evidence text or fallback to listing data
 */
export function parseBedroomCount(evidence?: string, listing?: { bedrooms?: number }): number | undefined {
  if (evidence) {
    const match = evidence.match(/(\d+)[\s-]*(bed|bedroom)/i);
    if (match) return parseInt(match[1], 10);
  }
  return listing?.bedrooms;
}

/**
 * Parse bathroom count from evidence text or fallback to listing data
 */
export function parseBathroomCount(evidence?: string, listing?: { bathrooms?: number }): number | undefined {
  if (evidence) {
    const match = evidence.match(/(\d+(?:\.\d+)?)[\s-]*(bath|bathroom)/i);
    if (match) return parseFloat(match[1]);
  }
  return listing?.bathrooms;
}
