"""
Buyer Ranking Service
Computes fit scores, priority tags, and ranks listings for a buyer profile.
This is the canonical source of truth for ranking logic (ported from frontend).
"""
from typing import Any, Dict, List, Optional
import re

# =============================================================================
# CONSTANTS
# =============================================================================

MARKET_STRENGTH_MAP = {
    'STRIKE_NOW': 1.00,
    'ACT_NOW': 0.85,
    'LOWBALL': 0.70,
    'REVIEW': 0.40,
    'WALK_AWAY': 0.10,
    'SKIP': 0.00,
}

INVESTOR_KEYWORDS = [
    'cash only',
    'as-is',
    'as is',
    'investor',
    'tear down',
    'teardown',
    'builder',
    'contractor'
]

# Remarks-based penalty patterns: (compiled_regex, type, chip_label)
# HARD penalties (-30): property is fundamentally not move-in ready
# SOFT penalties (-10): property has notable caveats
REMARKS_PENALTY_PATTERNS = [
    # HARD: Not habitable / not financeable
    (re.compile(r'\b(sold?\s+)?as[\s\-]?is\b', re.IGNORECASE), "hard", "Sold As-Is"),
    (re.compile(r'\bas[\s\-]?seen\b', re.IGNORECASE), "hard", "Sold As-Is"),
    (re.compile(r'\bwill\s+not\s+qualify\b', re.IGNORECASE), "hard", "Cash buyers only"),
    (re.compile(r'\bcash\s+only\b', re.IGNORECASE), "hard", "Cash buyers only"),
    (re.compile(r'\bno\s+conventional\b', re.IGNORECASE), "hard", "Cash buyers only"),
    (re.compile(r'\bunder\s+construction\b', re.IGNORECASE), "hard", "Under construction"),
    (re.compile(r'\brough\s+plumbing\b', re.IGNORECASE), "hard", "Under construction"),
    (re.compile(r'\bno\s+kitchen\b', re.IGNORECASE), "hard", "Under construction"),
    (re.compile(r'\bunfinished\b', re.IGNORECASE), "hard", "Under construction"),
    (re.compile(r'\bno\s+flooring\b', re.IGNORECASE), "hard", "Under construction"),
    # SOFT: Notable caveats
    (re.compile(r'\bhandyman\b', re.IGNORECASE), "soft", "Needs renovation"),
    (re.compile(r'\bneeds\s+work\b', re.IGNORECASE), "soft", "Needs renovation"),
    (re.compile(r'\btlc\b', re.IGNORECASE), "soft", "Needs renovation"),
    (re.compile(r'\bfixer\b', re.IGNORECASE), "soft", "Needs renovation"),
    (re.compile(r'\bcontractor\s+special\b', re.IGNORECASE), "soft", "Needs renovation"),
    (re.compile(r'\bestate\s+sale\b', re.IGNORECASE), "soft", "Estate/Probate sale"),
    (re.compile(r'\bprobate\b', re.IGNORECASE), "soft", "Estate/Probate sale"),
    (re.compile(r'\btenant\s+occupied\b', re.IGNORECASE), "soft", "Tenant occupied"),
    (re.compile(r'\blease\s+in\s+place\b', re.IGNORECASE), "soft", "Tenant occupied"),
    (re.compile(r'\bflood\s+zone\b', re.IGNORECASE), "soft", "Flood risk"),
    (re.compile(r'\bwetland\b', re.IGNORECASE), "soft", "Flood risk"),
]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _scan_remarks_penalties(listing: Dict[str, Any]) -> tuple:
    """
    Scan listing description/remarks for red-flag patterns.

    Returns:
        (hard_chips, soft_chips) — deduplicated by chip label
    """
    description = listing.get("description") or ""
    remarks = listing.get("remarks") or ""
    text = f"{description} {remarks}"

    if not text.strip():
        return [], []

    hard_chips = []
    soft_chips = []
    seen_labels = set()

    for pattern, penalty_type, label in REMARKS_PENALTY_PATTERNS:
        if label in seen_labels:
            continue
        if pattern.search(text):
            seen_labels.add(label)
            chip = {
                "type": "hard" if penalty_type == "hard" else "soft",
                "icon": "X" if penalty_type == "hard" else "!",
                "label": label,
                "key": f"remarks-{label.lower().replace(' ', '-').replace('/', '-')}",
            }
            if penalty_type == "hard":
                hard_chips.append(chip)
            else:
                soft_chips.append(chip)

    return hard_chips, soft_chips


def is_investor_listing(listing: Dict[str, Any]) -> bool:
    """
    Detect investor-style listings from special_flags and description.
    These are SKIP for retail buyers (no investor persona yet).
    """
    flags = listing.get("special_flags") or []
    desc = listing.get("description", "") or ""
    text = " ".join(flags + [desc]).lower()
    return any(kw in text for kw in INVESTOR_KEYWORDS)


def parse_bathrooms(value: Any) -> float:
    """Parse bathrooms from various formats (string or number)."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Strip non-numeric characters except decimal point
    cleaned = re.sub(r"[^0-9.]", "", str(value))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


# =============================================================================
# FIT SCORE COMPUTATION
# =============================================================================

def compute_fit_score(listing: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute buyer-property fit score based on profile requirements.

    Scoring:
    - Hard mismatches: -30 points each (max 2 counted)
    - Soft risks: -10 points each (max 2 counted)
    - Positives: display only (no score impact)

    Formula: fit_score = max(0, 100 - (30 * hard_count) - (10 * soft_count))

    Returns:
        {
            "chips": [...],
            "fit_score": 85,
            "hard_count": 0,
            "soft_count": 1
        }
    """
    if not profile:
        return {"chips": [], "fit_score": 100, "hard_count": 0, "soft_count": 0}

    hard_chips = []
    soft_chips = []
    positive_chips = []

    # Extract profile values
    profile_beds = int(profile.get("bedrooms") or 0)
    profile_baths = parse_bathrooms(profile.get("bathrooms"))
    budget_max = float(profile.get("budgetMax") or profile.get("budget_max") or 0)
    home_type = str(profile.get("homeType") or profile.get("home_type") or "").lower()
    preferred_areas = profile.get("preferredAreas") or profile.get("preferred_areas") or []
    if isinstance(preferred_areas, str):
        preferred_areas = [a.strip() for a in preferred_areas.split(",") if a.strip()]

    # Extract profile values (new)
    profile_garage = int(profile.get("minGarageSpaces") or 0)
    profile_max_hoa_raw = profile.get("maxMaintenanceFee")
    profile_max_hoa = int(profile_max_hoa_raw) if profile_max_hoa_raw is not None and profile_max_hoa_raw != "" else None
    profile_min_lot = int(profile.get("minLotSizeSqft") or 0)

    # Extract listing values
    listing_beds = int(listing.get("bedrooms") or 0)
    listing_baths = float(listing.get("bathrooms") or 0)
    list_price = float(listing.get("price") or listing.get("listPrice") or 0)
    year_built = int(listing.get("year_built") or listing.get("yearBuilt") or 0)
    sqft = float(listing.get("square_feet") or listing.get("sqft") or 0)
    property_type = str(listing.get("property_type") or listing.get("propertyType") or "").lower()
    city = str(listing.get("city") or "").lower()

    # Extract listing values (new)
    listing_garage = int(listing.get("garage_spaces") or listing.get("garageSpaces") or 0)
    listing_hoa_raw = listing.get("hoa_fee") or listing.get("maintenanceFee")
    listing_hoa = int(float(listing_hoa_raw)) if listing_hoa_raw else 0
    listing_lot_sqft = int(float(listing.get("lot_size") or listing.get("lotSize") or 0))
    listing_dom = int(listing.get("days_on_market") or listing.get("daysOnMarket") or 0)

    # =========================================================================
    # HARD MISMATCHES (deal-breakers) - max 2
    # =========================================================================

    # 1. Fewer beds than required
    if profile_beds > 0 and listing_beds < profile_beds:
        hard_chips.append({
            "type": "hard",
            "icon": "X",
            "label": f"{listing_beds} beds (need {profile_beds})",
            "key": "beds-short",
        })

    # 2. Fewer baths than required
    if profile_baths > 0 and listing_baths < profile_baths:
        hard_chips.append({
            "type": "hard",
            "icon": "X",
            "label": f"{listing_baths} baths (need {profile_baths})",
            "key": "baths-short",
        })

    # 3. Over budget >110%
    if budget_max > 0 and list_price > budget_max * 1.1:
        over_pct = round(((list_price - budget_max) / budget_max) * 100)
        hard_chips.append({
            "type": "hard",
            "icon": "X",
            "label": f"{over_pct}% over budget",
            "key": "over-budget",
        })

    # 4. No garage when buyer wants one
    if profile_garage > 0 and listing_garage == 0:
        hard_chips.append({
            "type": "hard",
            "icon": "X",
            "label": f"No garage (need {profile_garage}-car)",
            "key": "garage-missing",
        })

    # 5. HOA dealbreaker (buyer said no HOA, listing has HOA)
    if profile_max_hoa is not None and profile_max_hoa == 0 and listing_hoa > 0:
        hard_chips.append({
            "type": "hard",
            "icon": "X",
            "label": f"Has HOA (${listing_hoa:,}/mo)",
            "key": "hoa-dealbreaker",
        })

    # 6. Year built below buyer's minimum (or <1900 default)
    min_year_threshold = int(profile.get("minYearBuilt") or 1900)
    if year_built > 0 and year_built < min_year_threshold:
        year_gap = min_year_threshold - year_built
        if year_gap > 30:
            # Way below minimum — hard mismatch
            hard_chips.append({
                "type": "hard",
                "icon": "X",
                "label": f"Built {year_built} (wanted {min_year_threshold}+)",
                "key": "year-mismatch",
            })
        else:
            # Close to minimum — soft caution
            soft_chips.append({
                "type": "soft",
                "icon": "!",
                "label": f"Built {year_built} (wanted {min_year_threshold}+)",
                "key": "year-close",
            })

    # =========================================================================
    # SOFT RISKS (caution flags) - max 2
    # =========================================================================

    # 1. At budget limit (100-110%)
    if budget_max > 0 and list_price > budget_max and list_price <= budget_max * 1.1:
        soft_chips.append({
            "type": "soft",
            "icon": "!",
            "label": "At budget limit",
            "key": "budget-limit",
        })

    # 2. Old construction (only if not already flagged by year-mismatch/year-close above)
    if year_built >= min_year_threshold and year_built < 1960:
        soft_chips.append({
            "type": "soft",
            "icon": "!",
            "label": f"Built {year_built}",
            "key": "old-build",
        })

    # 3. Small home (below buyer's minimum or <1200 sqft default)
    min_sqft_threshold = int(profile.get("minSqft") or 1200)
    if sqft > 0 and sqft < min_sqft_threshold:
        sqft_ratio = sqft / min_sqft_threshold if min_sqft_threshold > 0 else 1
        if sqft_ratio < 0.70:
            # Way below minimum — hard mismatch
            hard_chips.append({
                "type": "hard",
                "icon": "X",
                "label": f"{int(sqft):,} sqft (wanted {min_sqft_threshold:,}+)",
                "key": "sqft-mismatch",
            })
        else:
            # Close to minimum — soft caution
            soft_chips.append({
                "type": "soft",
                "icon": "!",
                "label": f"{int(sqft):,} sqft (wanted {min_sqft_threshold:,}+)",
                "key": "sqft-close",
            })

    # 4. Garage short (has fewer than wanted, but not zero)
    if profile_garage > 0 and listing_garage > 0 and listing_garage < profile_garage:
        soft_chips.append({
            "type": "soft",
            "icon": "!",
            "label": f"{listing_garage}-car garage (wanted {profile_garage})",
            "key": "garage-short",
        })

    # 5. HOA over buyer's max (but buyer didn't say "no HOA")
    if (profile_max_hoa is not None and profile_max_hoa > 0
            and listing_hoa > profile_max_hoa):
        soft_chips.append({
            "type": "soft",
            "icon": "!",
            "label": f"HOA ${listing_hoa:,}/mo (max ${profile_max_hoa:,})",
            "key": "hoa-over",
        })

    # 6. Lot smaller than buyer's minimum
    if profile_min_lot > 0 and listing_lot_sqft > 0 and listing_lot_sqft < profile_min_lot:
        pct = round(listing_lot_sqft / profile_min_lot * 100)
        soft_chips.append({
            "type": "soft",
            "icon": "!",
            "label": f"Lot {listing_lot_sqft:,} sqft ({pct}% of wanted)",
            "key": "lot-small",
        })

    # =========================================================================
    # POSITIVES (matching criteria)
    # =========================================================================

    # 1. Under budget (<90%)
    if budget_max > 0 and list_price < budget_max * 0.9:
        under_pct = round(((budget_max - list_price) / budget_max) * 100)
        positive_chips.append({
            "type": "positive",
            "icon": "check",
            "label": f"{under_pct}% under budget",
            "key": "under-budget",
        })

    # 2. Beds match or exceed
    if profile_beds > 0 and listing_beds >= profile_beds:
        if listing_beds > profile_beds:
            diff = listing_beds - profile_beds
            positive_chips.append({
                "type": "positive",
                "icon": "check",
                "label": f"+{diff} bed{'s' if diff > 1 else ''}",
                "key": "beds-plus",
            })
        else:
            positive_chips.append({
                "type": "positive",
                "icon": "check",
                "label": f"{listing_beds} beds",
                "key": "beds-match",
            })

    # 3. Baths match or exceed
    if profile_baths > 0 and listing_baths >= profile_baths:
        if listing_baths > profile_baths:
            diff = listing_baths - profile_baths
            positive_chips.append({
                "type": "positive",
                "icon": "check",
                "label": f"+{diff} bath{'s' if diff > 1 else ''}",
                "key": "baths-plus",
            })
        else:
            positive_chips.append({
                "type": "positive",
                "icon": "check",
                "label": f"{listing_baths} baths",
                "key": "baths-match",
            })

    # 4. Home type match/mismatch (fuzzy)
    if home_type and property_type:
        type_matches = (
            home_type in property_type or
            property_type in home_type or
            ("single" in home_type and "single" in property_type) or
            ("condo" in home_type and "condo" in property_type) or
            ("town" in home_type and "town" in property_type)
        )
        if type_matches:
            positive_chips.append({
                "type": "positive",
                "icon": "check",
                "label": property_type.title() if property_type else home_type.title(),
                "key": "type-match",
            })
        else:
            hard_chips.append({
                "type": "hard",
                "icon": "X",
                "label": f"{property_type.title()} (wanted {home_type.title()})",
                "key": "type-mismatch",
            })

    # 5. Preferred area match
    if preferred_areas and city:
        in_preferred_area = any(
            city in area.lower() or area.lower() in city
            for area in preferred_areas
        )
        if in_preferred_area:
            positive_chips.append({
                "type": "positive",
                "icon": "check",
                "label": city.title(),
                "key": "area-match",
            })

    # 6. Newer construction (2000+)
    if year_built >= 2000:
        positive_chips.append({
            "type": "positive",
            "icon": "check",
            "label": f"Built {year_built}",
            "key": "newer-build",
        })

    # 7. Days on market insights
    if listing_dom > 0 and listing_dom <= 7:
        positive_chips.append({
            "type": "positive",
            "icon": "check",
            "label": "Just listed!",
            "key": "dom-fresh",
        })
    elif listing_dom >= 45:
        positive_chips.append({
            "type": "positive",
            "icon": "check",
            "label": f"{listing_dom} days — negotiation room",
            "key": "dom-stale",
        })

    # 8. Garage meets/exceeds buyer need
    if profile_garage > 0 and listing_garage >= profile_garage:
        positive_chips.append({
            "type": "positive",
            "icon": "check",
            "label": f"{listing_garage}-car garage",
            "key": "garage-match",
        })

    # =========================================================================
    # REMARKS PENALTIES (scan description for "AS IS", "cash only", etc.)
    # =========================================================================

    remarks_hard, remarks_soft = _scan_remarks_penalties(listing)
    # Deduplicate against existing chip keys
    existing_keys = {c["key"] for c in hard_chips + soft_chips}
    for chip in remarks_hard:
        if chip["key"] not in existing_keys:
            hard_chips.append(chip)
            existing_keys.add(chip["key"])
    for chip in remarks_soft:
        if chip["key"] not in existing_keys:
            soft_chips.append(chip)
            existing_keys.add(chip["key"])

    # =========================================================================
    # ASSEMBLE CHIPS (display max 2 hard + 2 soft, but score ALL)
    # =========================================================================

    # Score uses ALL hard/soft counts — no cap
    hard_count = len(hard_chips)
    soft_count = len(soft_chips)

    # Display: prioritize remarks-based chips (more critical), then structured
    # This ensures "Sold As-Is" shows instead of "No garage" when both exist
    remarks_hard = [c for c in hard_chips if c["key"].startswith("remarks-")]
    struct_hard = [c for c in hard_chips if not c["key"].startswith("remarks-")]
    display_hard = (remarks_hard + struct_hard)[:2]

    remarks_soft = [c for c in soft_chips if c["key"].startswith("remarks-")]
    struct_soft = [c for c in soft_chips if not c["key"].startswith("remarks-")]
    display_soft = (remarks_soft + struct_soft)[:2]

    chips = []
    chips.extend(display_hard)
    chips.extend(display_soft)
    remaining_slots = 5 - len(chips)
    chips.extend(positive_chips[:remaining_slots])

    # Calculate fit score — all penalties count
    fit_score = max(0, 100 - (30 * hard_count) - (10 * soft_count))

    return {
        "chips": chips,
        "fit_score": fit_score,
        "hard_count": hard_count,
        "soft_count": soft_count,
    }


# =============================================================================
# PRIORITY TAG COMPUTATION
# =============================================================================

def get_priority_tag(
    listing: Dict[str, Any],
    avg_price_per_sqft: Optional[float],
    min_price_per_sqft: Optional[float] = None  # For "Top value in this search" detection
) -> Dict[str, Any]:
    """
    Determine market priority tag for a listing.

    Priority order (STRICT - first match wins):
    1. SKIP - investor-style listings
    2. WALK_AWAY - toxic/irrational pricing
    3. STRIKE_NOW - 5%+ below market
    4. ACT_NOW - fresh + priced right
    5. LOWBALL - seller weakness signals
    6. REVIEW - default

    Returns:
        {
            "priority_tag": "STRIKE_NOW",
            "below_market_pct": 0.12,
            "status_lines": ["45 DOM . 2 cuts", "12% below market -> Strike now", "..."]
        }
    """
    # Extract listing values
    price_per_sqft = listing.get("pricePerSqft") or listing.get("price_per_sqft")
    original_price = listing.get("original_price") or listing.get("originalPrice")
    list_price = listing.get("price") or listing.get("listPrice") or 0
    dom = listing.get("days_on_market") or listing.get("daysOnMarket") or 0
    cuts = listing.get("price_cuts_count") or listing.get("priceCutsCount") or 0
    total_reduction = listing.get("total_price_reduction") or listing.get("totalPriceReduction") or 0
    price_trend = listing.get("price_trend_direction") or listing.get("priceTrendDirection")
    special_flags = listing.get("special_flags") or listing.get("specialFlags") or []

    # Calculate below market percentage
    below_market_pct = None
    if avg_price_per_sqft and price_per_sqft and avg_price_per_sqft > 0:
        below_market_pct = (avg_price_per_sqft - price_per_sqft) / avg_price_per_sqft

    # Meaningful price drop (5%+ of original)
    has_meaningful_drop = False
    if total_reduction > 0 and original_price and original_price > 0:
        has_meaningful_drop = (total_reduction / original_price) >= 0.05

    # Price increase flag
    had_price_increase = (price_trend == 'up')

    # =========================================================================
    # MARKET POSITION THRESHOLDS
    # =========================================================================

    # Overpriced thresholds
    is_overpriced_10 = below_market_pct is not None and below_market_pct <= -0.10
    is_overpriced_15 = below_market_pct is not None and below_market_pct <= -0.15
    is_overpriced_20 = below_market_pct is not None and below_market_pct <= -0.20
    is_overpriced_30 = below_market_pct is not None and below_market_pct <= -0.30

    # Below market thresholds
    is_below_5 = below_market_pct is not None and below_market_pct >= 0.05
    is_below_10 = below_market_pct is not None and below_market_pct >= 0.10
    is_below_20 = below_market_pct is not None and below_market_pct >= 0.20
    is_below_25 = below_market_pct is not None and below_market_pct >= 0.25

    # =========================================================================
    # PRIORITY DETERMINATION (strict order - first match wins)
    # =========================================================================

    priority_tag = "REVIEW"  # default

    # 1. SKIP - investor-style listings (always skip for now)
    if is_investor_listing(listing):
        priority_tag = "SKIP"

    # 2. WALK_AWAY - toxic/irrational (filter garbage BEFORE good deals)
    elif (is_overpriced_20 and dom > 60) or (is_overpriced_10 and had_price_increase):
        priority_tag = "WALK_AWAY"

    # 3. STRIKE_NOW - 5%+ below market (only after confirming not toxic)
    elif is_below_5:
        priority_tag = "STRIKE_NOW"

    # 4. ACT_NOW - fresh + priced right
    elif (dom < 7 and cuts == 0 and
          below_market_pct is not None and
          below_market_pct >= 0 and below_market_pct < 0.05):
        priority_tag = "ACT_NOW"

    # 5. LOWBALL - seller weakness signals
    elif (not had_price_increase and
          not is_overpriced_20 and
          (cuts >= 2 or has_meaningful_drop) and
          (cuts >= 3 or
           (cuts >= 2 and dom > 90) or
           (dom > 120 and has_meaningful_drop) or
           (is_overpriced_15 and dom >= 60))):
        priority_tag = "LOWBALL"

    # 6. REVIEW - default (already set)

    # =========================================================================
    # BUILD STATUS LINES
    # =========================================================================

    status_lines = []

    # Line 1: Facts (DOM + cuts)
    dom_part = f"{dom} DOM"
    cuts_part = f"{cuts} cut{'s' if cuts != 1 else ''}" if cuts > 0 else "No drops"
    status_lines.append(f"{dom_part} . {cuts_part}")

    # Line 2: Primary implication with % above/below market
    pct_str = None
    if below_market_pct is not None:
        pct_str = f"{abs(round(below_market_pct * 100))}%"

    if is_overpriced_30:
        status_lines.append("Delusional pricing -> Walk away")
    elif is_overpriced_20 and dom > 60:
        status_lines.append(f"{pct_str} above market -> Walk away")
    elif had_price_increase and is_overpriced_10:
        status_lines.append("Price increase -> Erratic seller")
    elif is_below_20:
        status_lines.append(f"{pct_str} below market -> Strike now")
    elif is_below_10:
        status_lines.append(f"{pct_str} below market -> Strike now")
    elif is_below_5:
        status_lines.append(f"{pct_str} below market -> Strike now")
    elif dom < 7 and cuts == 0 and below_market_pct is not None and below_market_pct >= 0:
        status_lines.append("Priced right -> Act now")
    elif is_overpriced_15 and dom >= 60:
        status_lines.append(f"{pct_str} above market -> Lowball")
    elif cuts >= 3:
        status_lines.append("Seller bleeding out")
    elif cuts >= 2 and dom > 90:
        status_lines.append("Seller weakening")
    elif below_market_pct is not None and below_market_pct >= 0 and below_market_pct < 0.05:
        status_lines.append("Typical pricing -> Review")
    elif special_flags:
        status_lines.append(" . ".join(special_flags[:2]))
    else:
        status_lines.append("Review listing")

    # Line 3: Combined signal (CONDITIONAL - only when signals align)
    # STRIKE_NOW variants - 3-tier psychology (matches frontend logic)
    # Tier 1: Best deal (1 per search) > Tier 2: Rare discount (25%+) > Tier 3: Motivated seller (10-24% + signals)
    if priority_tag == "STRIKE_NOW":
        # Tier 1: isTopValue - lowest $/sqft in entire search (THE anchor property)
        is_top_value = (
            min_price_per_sqft is not None and
            price_per_sqft is not None and
            price_per_sqft > 0 and
            abs(price_per_sqft - min_price_per_sqft) < 0.01  # Floating-point tolerance
        )
        if is_top_value:
            status_lines.append("Top value in this search")
        elif is_below_25:
            # Tier 2: 25%+ below market - truly exceptional
            status_lines.append("Rare discount opportunity")
        elif (below_market_pct is not None and
              below_market_pct >= 0.10 and below_market_pct < 0.25 and
              (cuts >= 1 or dom > 60 or has_meaningful_drop)):
            # Tier 3: 10-24% below + seller weakness signals - tactical opportunity
            status_lines.append("Below market + motivated seller")
    elif priority_tag == "LOWBALL":
        if cuts >= 3 or (cuts >= 2 and dom > 90):
            status_lines.append("Stale + weakening seller")
        elif is_overpriced_15 and dom >= 60:
            status_lines.append("Overpriced + stale -> leverage")
    elif priority_tag == "WALK_AWAY":
        if is_overpriced_30:
            status_lines.append("Delusional pricing")
        elif had_price_increase and is_overpriced_10:
            status_lines.append("Overpriced + irrational seller")
        elif is_overpriced_20 and dom > 60 and cuts == 0:
            status_lines.append("Overpriced + no movement")
    elif priority_tag == "ACT_NOW":
        if dom < 7:
            status_lines.append("New + priced right")
    elif priority_tag == "SKIP":
        status_lines.append("Investor-style listing (cash/as-is)")

    return {
        "priority_tag": priority_tag,
        "below_market_pct": below_market_pct,
        "status_lines": status_lines,
    }


# =============================================================================
# RANKING FUNCTION
# =============================================================================

def rank_listings(
    listings: List[Dict[str, Any]],
    profile: Dict[str, Any],
    avg_price_per_sqft: Optional[float],
    top_n: int = 20
) -> List[Dict[str, Any]]:
    """
    Rank listings by combined buyer fit + market strength score.

    Formula: final_score = 0.55 * fit_norm + 0.45 * market_strength

    SKIP and WALK_AWAY listings are excluded from ranking but included in results.

    Args:
        listings: Raw listings from Repliers
        profile: Buyer profile
        avg_price_per_sqft: Market average for comparison
        top_n: Number of top listings to flag (default 20)

    Returns:
        List of listings with added fields:
        - fit_score, fit_chips, hard_count, soft_count
        - priority_tag, below_market_pct, status_lines
        - market_strength_score, final_score, rank, is_top20
    """
    # ==========================================================================
    # PRE-COMPUTE: min_price_per_sqft among discount candidates (5%+ below market, not investor)
    # This is needed for "Top value in this search" detection
    # ==========================================================================
    min_price_per_sqft = None
    if avg_price_per_sqft:
        discount_candidates = []
        for listing in listings:
            pps = listing.get("pricePerSqft") or listing.get("price_per_sqft")
            if not pps or pps <= 0:
                continue
            below_market_pct = (avg_price_per_sqft - pps) / avg_price_per_sqft
            # Must be 5%+ below market and not investor listing
            if below_market_pct >= 0.05 and not is_investor_listing(listing):
                discount_candidates.append(pps)
        if discount_candidates:
            min_price_per_sqft = min(discount_candidates)

    results = []

    for listing in listings:
        # Compute fit score
        fit_result = compute_fit_score(listing, profile)

        # Compute priority tag (pass min_price_per_sqft for "Top value" detection)
        priority_result = get_priority_tag(listing, avg_price_per_sqft, min_price_per_sqft)

        # Build result with all fields
        result = {
            **listing,
            # Fit fields
            "fit_score": fit_result["fit_score"],
            "fit_chips": fit_result["chips"],
            "hard_count": fit_result["hard_count"],
            "soft_count": fit_result["soft_count"],
            # Priority fields
            "priority_tag": priority_result["priority_tag"],
            "below_market_pct": priority_result["below_market_pct"],
            "status_lines": priority_result["status_lines"],
        }

        # SKIP/WALK_AWAY excluded from ranking
        if priority_result["priority_tag"] in ['SKIP', 'WALK_AWAY']:
            result["market_strength_score"] = MARKET_STRENGTH_MAP[priority_result["priority_tag"]]
            result["final_score"] = None
            result["rank"] = None
            result["is_top20"] = False
        else:
            # Compute final score
            fit_norm = fit_result["fit_score"] / 100
            market_strength = MARKET_STRENGTH_MAP[priority_result["priority_tag"]]
            final_score = 0.55 * fit_norm + 0.45 * market_strength

            result["market_strength_score"] = market_strength
            result["final_score"] = round(final_score, 4)

        results.append(result)

    # Sort eligible listings
    eligible = [r for r in results if r.get("final_score") is not None]

    def sort_key(x):
        bmp = x.get("below_market_pct")
        # None = unknown market position = treat as worst (no discount info)
        bmp_safe = bmp if bmp is not None else -999.0
        return (-x["final_score"], -bmp_safe)

    eligible.sort(key=sort_key)

    # Assign ranks to all eligible listings
    for i, item in enumerate(eligible):
        item["rank"] = i + 1
        item["is_top20"] = (i < top_n)

    return results


def calculate_avg_price_per_sqft(listings: List[Dict[str, Any]]) -> Optional[float]:
    """Calculate average price per sqft across listings with valid data."""
    valid_prices = []
    for listing in listings:
        pps = listing.get("pricePerSqft") or listing.get("price_per_sqft")
        if pps is not None and pps > 0:
            valid_prices.append(pps)

    if not valid_prices:
        return None

    return round(sum(valid_prices) / len(valid_prices), 2)
