"""
Requirements Analyzer Service

Computes deterministic requirement flags and category winners for buyer reports.
No LLM calls - all logic is rule-based.

Key design principles:
- Buyer-aware: Only show criteria the buyer asked for
- Conservative flags: ⚠️ for uncertain, never false ✅ or ❌
- Max 6 rows: Clean summaries, not data dumps
- No duplicates in category winners
"""
from typing import Dict, Any, List, Optional, Callable
import re


# =============================================================================
# TIER DEFINITIONS
# =============================================================================

# Tier A: Always show (universal, objective)
TIER_A = ["meets_bedrooms", "within_budget", "in_target_area"]

# Tier B: Intent-aware keywords for conditional criteria
INTENT_KEYWORDS = {
    "outdoor_space": {
        "words": ["yard", "patio", "garden", "outdoor", "backyard", "deck", "fenced",
                  "dog", "play", "bbq", "grill", "grass", "entertaining"],
        "phrases": ["kids play", "space for kids", "outdoor dining", "outdoor space"]
    },
    "low_noise": {
        "words": ["quiet", "peaceful", "calm"],
        "phrases": ["busy road", "main road", "busy street", "away from traffic",
                    "not on a busy", "no traffic", "quiet street"]
    },
    "good_layout": {
        "words": ["layout", "flow", "accessible"],
        "phrases": ["open concept", "floor plan", "open floor", "one level",
                    "single story", "no stairs"]
    },
    "has_parking": {
        "words": ["garage", "carport", "driveway"],
        "phrases": ["2 cars", "two cars", "street parking", "covered parking",
                    "off-street", "hate street parking", "need space for cars"]
    },
    "good_commute": {
        "words": ["commute"],
        "phrases": ["drive to work", "close to work", "minutes to"]
    },
    "good_schools": {
        "words": ["school", "district", "elementary", "education"],
        "phrases": ["good schools", "school district", "family-friendly"]
    }
}

# Dynamic label templates based on buyer's actual requirements
LABEL_TEMPLATES: Dict[str, Callable[[Dict], str]] = {
    "meets_bedrooms": lambda p: f"{p.get('bedrooms', 3)}+ Bedrooms",
    "within_budget": lambda p: f"Under ${int(p.get('budgetMax', 0)):,}" if p.get('budgetMax') else "Within Budget",
    "in_target_area": lambda p: f"In {p.get('location', 'Target Area')}" if p.get('location') else "In Target Area",
    "outdoor_space": lambda p: "Has Yard/Outdoor Space",
    "low_noise": lambda p: "Quiet Street",
    "has_parking": lambda p: "Off-Street Parking",
    "good_commute": lambda p: f"≤{p.get('max_commute_mins', 35)} min commute",
    "good_schools": lambda p: "Near Good Schools",
}


# =============================================================================
# KEYWORD MATCHING HELPERS
# =============================================================================

def tokenize(text: str) -> set:
    """Split text into words. Prevents 'parking' from matching 'sparkling'."""
    if not text:
        return set()
    return set(re.findall(r'\b\w+\b', text.lower()))


def matches_criterion(text: str, criterion: str) -> bool:
    """
    Check if text matches a criterion using:
    - Whole word matching for single words
    - Substring matching for multi-word phrases
    """
    if criterion not in INTENT_KEYWORDS:
        return False

    keywords = INTENT_KEYWORDS[criterion]
    words = tokenize(text)

    # Check single words (exact word match only)
    if any(kw in words for kw in keywords["words"]):
        return True

    # Check phrases (substring match for multi-word)
    text_lower = text.lower()
    if any(phrase in text_lower for phrase in keywords["phrases"]):
        return True

    return False


def buyer_cares_about(profile: Dict[str, Any], criterion: str) -> bool:
    """Check if buyer mentioned anything related to this criterion."""
    # Combine all profile text sources
    all_text = " ".join([
        " ".join(profile.get("mustHaveFeatures", []) or []),
        " ".join(profile.get("dealbreakers", []) or []),
        " ".join(profile.get("lifestyleDrivers", []) or []),
        " ".join(profile.get("specialNeeds", []) or []),
    ])

    # Check explicit fields
    if criterion == "good_commute" and profile.get("work_address"):
        return True
    if criterion == "good_schools" and profile.get("has_kids"):
        return True

    return matches_criterion(all_text, criterion)


# =============================================================================
# DATA AVAILABILITY GATES
# =============================================================================

def has_sufficient_data(criterion: str, listings: List[Dict[str, Any]]) -> bool:
    """
    Returns True if we can compute meaningful values for >40% of listings.
    Prevents rows that are all ⚠️.
    """
    if not listings:
        return False

    if criterion == "good_commute":
        # Only show if commute_mins exists for most listings
        with_data = sum(1 for l in listings if l.get("commute_mins") is not None)
        return with_data / len(listings) >= 0.4

    if criterion == "good_schools":
        # Only show if we have school data
        with_data = sum(1 for l in listings
                        if l.get("nearby_schools_count") is not None
                        or (l.get("aiAnalysis", {}).get("location_summary", {}) or {}).get("nearby_schools_count") is not None)
        return with_data / len(listings) >= 0.4

    if criterion == "outdoor_space":
        # lotAcres OR yard mentioned in remarks/photos
        def has_outdoor_data(l):
            lot_acres = l.get("lotAcres") or l.get("lotSize")
            if lot_acres and float(lot_acres) > 0:
                return True
            remarks = (l.get("remarks") or "").lower()
            photo_summary = (l.get("aiAnalysis", {}).get("photo_summary") or "").lower()
            return any(kw in remarks or kw in photo_summary
                       for kw in ["yard", "patio", "deck", "garden"])
        with_data = sum(1 for l in listings if has_outdoor_data(l))
        return with_data / len(listings) >= 0.4

    if criterion == "has_parking":
        # garage_spaces OR parking mentioned
        def has_parking_data(l):
            if l.get("garage_spaces") or l.get("parkingSpaces") or l.get("garageSpaces"):
                return True
            remarks = (l.get("remarks") or "").lower()
            return "garage" in remarks or "parking" in remarks or "driveway" in remarks
        with_data = sum(1 for l in listings if has_parking_data(l))
        return with_data / len(listings) >= 0.4

    # Tier A criteria always have data (bedrooms, price, city)
    return True


# =============================================================================
# BUYER-AWARE CRITERIA SELECTION
# =============================================================================

def get_buyer_relevant_criteria(profile: Dict[str, Any], listings: List[Dict[str, Any]]) -> List[str]:
    """
    Returns max 6 criteria, prioritized by importance.
    Priority order: dealbreakers > must-haves > lifestyle > special needs
    """
    criteria = list(TIER_A)  # Always: bedrooms, budget, location

    # Build scored candidates from Tier B
    # (criterion, priority, source)
    candidates: List[tuple] = []

    # Scan profile text by source
    dealbreakers_text = " ".join(profile.get("dealbreakers", []) or []).lower()
    musthave_text = " ".join(profile.get("mustHaveFeatures", []) or []).lower()
    lifestyle_text = " ".join(profile.get("lifestyleDrivers", []) or []).lower()
    special_text = " ".join(profile.get("specialNeeds", []) or []).lower()

    for criterion in INTENT_KEYWORDS.keys():
        # Check which source mentioned it (priority order)
        if matches_criterion(dealbreakers_text, criterion):
            candidates.append((criterion, 1, "dealbreaker"))  # Highest priority
        elif matches_criterion(musthave_text, criterion):
            candidates.append((criterion, 2, "musthave"))
        elif matches_criterion(lifestyle_text, criterion):
            candidates.append((criterion, 3, "lifestyle"))
        elif matches_criterion(special_text, criterion):
            candidates.append((criterion, 4, "special"))

    # Also check explicit fields
    if profile.get("work_address"):
        candidates.append(("good_commute", 2, "explicit"))
    if profile.get("has_kids"):
        candidates.append(("good_schools", 2, "explicit"))

    # Sort by priority (lower = higher priority), dedupe
    seen = set(criteria)
    for criterion, priority, source in sorted(candidates, key=lambda x: x[1]):
        if criterion not in seen:
            # GATE: Only add if we have real data (>40% non-⚠️)
            if has_sufficient_data(criterion, listings):
                criteria.append(criterion)
                seen.add(criterion)

    return criteria[:6]  # Cap at 6


# =============================================================================
# DISPLAY REQUIREMENTS (Main Entry Point)
# =============================================================================

def compute_display_requirements(
    profile: Dict[str, Any],
    listings: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Build the buyer-aware requirements table for display.

    Returns:
        {
            "criteria": ["meets_bedrooms", "within_budget", ...],  # Max 6
            "labels": {"meets_bedrooms": "3+ Bedrooms", ...},
            "table": [
                {"mlsNumber": "W123", "flags": {"meets_bedrooms": "✅", ...}},
                ...
            ],
            "condition_notes": {
                "W123": "0 red flags detected",
                "W456": "2 items to verify"
            },
            "hidden_count": 0  # How many buyer preferences were hidden
        }
    """
    # Stage 1: Get buyer-relevant criteria
    criteria = get_buyer_relevant_criteria(profile, listings)

    # Count hidden preferences (for microcopy)
    all_intent_criteria = [c for c in INTENT_KEYWORDS.keys() if buyer_cares_about(profile, c)]
    total_buyer_wants = len(TIER_A) + len(all_intent_criteria)
    hidden_count = max(0, total_buyer_wants - len(criteria))

    # Stage 2: Generate dynamic labels
    labels = {}
    for c in criteria:
        if c in LABEL_TEMPLATES:
            labels[c] = LABEL_TEMPLATES[c](profile)
        else:
            # Fallback to readable name
            labels[c] = c.replace("_", " ").title()

    # Stage 3: Compute flags for each listing (only for selected criteria)
    table = []
    condition_notes = {}

    for listing in listings:
        mls = listing.get("mlsNumber")
        all_flags = compute_requirements_checklist(profile, listing)

        # Filter to only selected criteria
        filtered_flags = {c: all_flags.get(c, "⚠️") for c in criteria}

        table.append({
            "mlsNumber": mls,
            "flags": filtered_flags
        })

        # Condition notes (not a grid flag)
        ai_analysis = listing.get("aiAnalysis") or {}
        red_flags = ai_analysis.get("red_flags", [])
        photo_red_flags = ai_analysis.get("photo_red_flags", [])
        total_flags = len(red_flags) + len(photo_red_flags)

        if total_flags == 0:
            condition_notes[mls] = "No red flags detected"
        else:
            condition_notes[mls] = f"{total_flags} item{'s' if total_flags > 1 else ''} to verify"

    return {
        "criteria": criteria,
        "labels": labels,
        "table": table,
        "condition_notes": condition_notes,
        "hidden_count": hidden_count
    }


def compute_requirements_checklist(
    profile: Dict[str, Any],
    listing: Dict[str, Any]
) -> Dict[str, str]:
    """
    Compute deterministic requirement flags for a listing against buyer profile.

    Flag semantics (CRITICAL):
    ✅ = Confirmed from listing data (hard evidence)
    ⚠️ = Needs verification (no data OR fuzzy inference)
    ❌ = Clearly does not meet (hard evidence against)

    Args:
        profile: Buyer profile with preferences
        listing: Property listing with details and aiAnalysis

    Returns:
        Dict of requirement_name -> flag ("✅", "⚠️", "❌")
    """
    ai_analysis = listing.get("aiAnalysis") or {}

    # Ensure all analysis fields are lists (not dicts or other types)
    whats_matching = ai_analysis.get("whats_matching", [])
    if not isinstance(whats_matching, list):
        whats_matching = []

    whats_missing = ai_analysis.get("whats_missing", [])
    if not isinstance(whats_missing, list):
        whats_missing = []

    red_flags = ai_analysis.get("red_flags", [])
    if not isinstance(red_flags, list):
        red_flags = []

    photo_matches = ai_analysis.get("photo_matches", [])
    if not isinstance(photo_matches, list):
        photo_matches = []

    photo_red_flags = ai_analysis.get("photo_red_flags", [])
    if not isinstance(photo_red_flags, list):
        photo_red_flags = []

    # Helper to check if any text in list contains a keyword (case-insensitive)
    def contains_keyword(text_list: List[str], keyword: str) -> bool:
        keyword_lower = keyword.lower()
        return any(
            keyword_lower in text.lower()
            for text in text_list
            if isinstance(text, str)
        )

    flags = {}

    # ==========================================================================
    # TIER A: OBJECTIVE CRITERIA (Hard data available)
    # ==========================================================================

    # 1. Meets Bedrooms
    profile_beds = profile.get("bedrooms") or 0
    listing_beds = listing.get("bedrooms") or 0

    try:
        profile_beds = int(profile_beds) if profile_beds else 0
        listing_beds = int(listing_beds) if listing_beds else 0
    except (ValueError, TypeError):
        profile_beds = 0
        listing_beds = 0

    if listing_beds >= profile_beds:
        flags["meets_bedrooms"] = "✅"
    else:
        flags["meets_bedrooms"] = "❌"

    # 2. Within Budget
    list_price = listing.get("listPrice") or 0
    budget_max = profile.get("budgetMax") or float('inf')

    try:
        list_price = float(list_price) if list_price else 0
        budget_max = float(budget_max) if budget_max else float('inf')
    except (ValueError, TypeError):
        list_price = 0
        budget_max = float('inf')

    if list_price <= budget_max:
        flags["within_budget"] = "✅"
    elif list_price <= budget_max * 1.05:  # Within 5%
        flags["within_budget"] = "⚠️"
    else:
        flags["within_budget"] = "❌"

    # 3. In Target Area (supports list of locations)
    listing_city = (listing.get("city") or "").lower()
    listing_neighborhood = (listing.get("neighborhood") or "").lower()

    # Get allowed locations (support both string and list)
    allowed = profile.get("allowed_locations") or profile.get("preferredAreas") or [profile.get("location")]
    if isinstance(allowed, str):
        allowed = [allowed]
    allowed = [loc.lower() for loc in allowed if loc and isinstance(loc, str)]

    if not allowed:
        flags["in_target_area"] = "⚠️"  # No target specified
    else:
        matched = False
        for loc in allowed:
            if loc in listing_city or listing_city in loc:
                matched = True
                break
            if listing_neighborhood and (loc in listing_neighborhood or listing_neighborhood in loc):
                matched = True
                break
        flags["in_target_area"] = "✅" if matched else "❌"

    # ==========================================================================
    # TIER B: CONDITIONAL CRITERIA (May have fuzzy data)
    # ==========================================================================

    # 4. Has Parking
    garage_spaces = listing.get("garage_spaces") or listing.get("garageSpaces") or listing.get("parkingSpaces")
    remarks = (listing.get("remarks") or "").lower()

    if garage_spaces and int(garage_spaces) > 0:
        flags["has_parking"] = "✅"
    elif "garage" in remarks or "driveway" in remarks or "carport" in remarks:
        flags["has_parking"] = "✅"
    elif "parking" in remarks:
        flags["has_parking"] = "⚠️"  # Mentioned but not clear if off-street
    else:
        flags["has_parking"] = "⚠️"  # No data, default to verify

    # 5. Outdoor Space
    lot_size = listing.get("lotSize") or 0
    lot_acres = listing.get("lotAcres") or 0

    try:
        lot_size = float(lot_size) if lot_size else 0
        lot_acres = float(lot_acres) if lot_acres else 0
    except (ValueError, TypeError):
        lot_size = 0
        lot_acres = 0

    has_yard_in_photos = (
        contains_keyword(photo_matches, "yard") or
        contains_keyword(photo_matches, "outdoor") or
        contains_keyword(photo_matches, "patio") or
        contains_keyword(photo_matches, "deck") or
        contains_keyword(photo_matches, "garden")
    )
    has_yard_in_remarks = any(kw in remarks for kw in ["yard", "patio", "deck", "garden", "outdoor space"])

    if lot_acres > 0.15 or (has_yard_in_photos and lot_acres > 0.05):
        flags["outdoor_space"] = "✅"
    elif lot_acres > 0 or has_yard_in_photos or has_yard_in_remarks:
        flags["outdoor_space"] = "⚠️"  # Some evidence, verify size
    else:
        flags["outdoor_space"] = "⚠️"  # No data, default to verify (not ❌!)

    # 6. Good Layout (CONSERVATIVE: default to ⚠️)
    vision_checklist = profile.get("visionChecklist", [])
    if not isinstance(vision_checklist, list):
        vision_checklist = []

    # Check for explicit layout matches in photo analysis
    layout_keywords = ["open concept", "open floor", "layout", "flow"]
    has_layout_match = any(
        contains_keyword(photo_matches, kw) for kw in layout_keywords
    )

    if has_layout_match:
        flags["good_layout"] = "✅"
    else:
        # CONSERVATIVE: No explicit evidence = needs verification
        flags["good_layout"] = "⚠️"

    # 7. Low Noise (CONSERVATIVE: default to ⚠️ unless explicit data)
    location_summary = ai_analysis.get("location_summary", {}) or {}
    street_context = location_summary.get("street_context", {}) or {}
    noise_risk = street_context.get("noise_risk")
    traffic_level = street_context.get("traffic_level")

    # Check for explicit noise concerns
    has_noise_concerns = (
        contains_keyword(red_flags, "noise") or
        contains_keyword(red_flags, "traffic") or
        contains_keyword(red_flags, "busy") or
        contains_keyword(red_flags, "highway") or
        contains_keyword(photo_red_flags, "noise") or
        contains_keyword(photo_red_flags, "traffic") or
        contains_keyword(photo_red_flags, "busy") or
        contains_keyword(photo_red_flags, "highway")
    )

    if has_noise_concerns or noise_risk == "high" or traffic_level == "high":
        flags["low_noise"] = "❌"
    elif noise_risk == "low" or traffic_level == "low":
        flags["low_noise"] = "✅"
    else:
        # CONSERVATIVE: No explicit data = needs verification
        flags["low_noise"] = "⚠️"

    # 8. Good Commute (only if we have commute data)
    commute_mins = listing.get("commute_mins")
    max_commute = profile.get("max_commute_mins", 35)

    if commute_mins is not None:
        try:
            commute_mins = int(commute_mins)
            max_commute = int(max_commute)
            if commute_mins <= max_commute:
                flags["good_commute"] = "✅"
            elif commute_mins <= max_commute * 1.2:  # Within 20%
                flags["good_commute"] = "⚠️"
            else:
                flags["good_commute"] = "❌"
        except (ValueError, TypeError):
            flags["good_commute"] = "⚠️"
    else:
        flags["good_commute"] = "⚠️"  # No data

    # 9. Good Schools (only if we have school data)
    nearby_schools = listing.get("nearby_schools_count")
    if nearby_schools is None:
        # Try location analysis
        family_indicators = location_summary.get("family_indicators", {}) or {}
        nearby_schools = family_indicators.get("nearby_schools_count")

    if nearby_schools is not None:
        try:
            nearby_schools = int(nearby_schools)
            if nearby_schools >= 2:
                flags["good_schools"] = "✅"
            elif nearby_schools >= 1:
                flags["good_schools"] = "⚠️"
            else:
                flags["good_schools"] = "❌"
        except (ValueError, TypeError):
            flags["good_schools"] = "⚠️"
    else:
        flags["good_schools"] = "⚠️"  # No data

    # ==========================================================================
    # LEGACY: Keep for backwards compatibility (not shown in new table)
    # ==========================================================================

    # Has Amenities (legacy)
    must_have = profile.get("mustHaveFeatures", []) or profile.get("mustHave", [])
    if not isinstance(must_have, list):
        must_have = []
    must_have = [item for item in must_have if isinstance(item, str)]

    if not must_have:
        flags["has_amenities"] = "✅"
    else:
        matched_count = sum(1 for item in must_have if contains_keyword(whats_matching, item))
        match_ratio = matched_count / len(must_have)

        if match_ratio >= 0.8:
            flags["has_amenities"] = "✅"
        elif match_ratio >= 0.4:
            flags["has_amenities"] = "⚠️"
        else:
            flags["has_amenities"] = "⚠️"  # CONSERVATIVE: Not ❌

    # Good Condition (moved to condition_notes, kept for backwards compat)
    total_red_flags = len(red_flags) + len(photo_red_flags)
    if total_red_flags == 0:
        flags["good_condition"] = "✅"
    elif total_red_flags <= 2:
        flags["good_condition"] = "⚠️"
    else:
        flags["good_condition"] = "⚠️"  # CONSERVATIVE: Not ❌

    return flags


def compute_category_winners(
    profile: Dict[str, Any],
    listings: List[Dict[str, Any]],
    ranked_picks: List[Dict[str, Any]] = None
) -> Dict[str, Optional[str]]:
    """
    Identify best property in each category.

    Rules:
    - Max 3 category winners
    - No property can win twice (no duplicates)
    - Categories are buyer-aware (only show what they care about)

    Returns:
        Dict with mlsNumber for each category winner (max 3):
        {
            "best_overall": str,           # Always included
            "best_yard": str,              # Only if buyer cares about outdoor_space
            "shortest_commute": str,       # Only if buyer cares about commute
            "best_parking": str,           # Only if buyer cares about parking
            "quietest_location": str,      # Only if buyer cares about noise
            "most_budget_room": str        # Always included as fallback
        }
    """
    if not listings:
        return {"best_overall": None}

    # Helper to safely get numeric value
    def safe_float(value, default=0.0):
        try:
            return float(value) if value else default
        except (ValueError, TypeError):
            return default

    def get_lot_acres(listing):
        lot_acres = safe_float(listing.get("lotAcres"))
        if lot_acres > 0:
            return lot_acres
        lot_size = safe_float(listing.get("lotSize"))
        return lot_size / 43560 if lot_size > 0 else 0

    def get_noise_score(listing):
        """Lower = quieter. Returns 0-100."""
        ai = listing.get("aiAnalysis", {}) or {}
        loc_summary = ai.get("location_summary", {}) or {}
        street_ctx = loc_summary.get("street_context", {}) or {}
        noise_risk = street_ctx.get("noise_risk", "moderate")
        return {"low": 0, "moderate": 50, "high": 100}.get(noise_risk, 50)

    winners = {}
    used_mls = set()

    # ==========================================================================
    # 1. Top Match (always, from synthesis ranking)
    # ==========================================================================
    if ranked_picks and len(ranked_picks) > 0:
        top_match_mls = ranked_picks[0].get("mlsNumber")
    else:
        top_match = max(listings, key=lambda x: safe_float(x.get("finalScore")))
        top_match_mls = top_match.get("mlsNumber")

    winners["top_match"] = top_match_mls
    used_mls.add(top_match_mls)

    # ==========================================================================
    # 2. One buyer-priority highlight (pick first that applies, avoid duplicates)
    # ==========================================================================
    buyer_highlight_added = False

    # Check buyer priorities in order
    if not buyer_highlight_added and buyer_cares_about(profile, "outdoor_space"):
        candidates = [l for l in listings if l.get("mlsNumber") not in used_mls]
        if candidates:
            winner = max(candidates, key=get_lot_acres)
            if get_lot_acres(winner) > 0:  # Only add if there's actual yard data
                winners["best_yard"] = winner.get("mlsNumber")
                used_mls.add(winner.get("mlsNumber"))
                buyer_highlight_added = True

    if not buyer_highlight_added and buyer_cares_about(profile, "good_commute"):
        candidates = [l for l in listings
                      if l.get("mlsNumber") not in used_mls
                      and l.get("commute_mins") is not None]
        if candidates:
            winner = min(candidates, key=lambda l: safe_float(l.get("commute_mins"), 999))
            winners["shortest_commute"] = winner.get("mlsNumber")
            used_mls.add(winner.get("mlsNumber"))
            buyer_highlight_added = True

    if not buyer_highlight_added and buyer_cares_about(profile, "has_parking"):
        candidates = [l for l in listings if l.get("mlsNumber") not in used_mls]
        if candidates:
            winner = max(candidates, key=lambda l: safe_float(
                l.get("garage_spaces") or l.get("garageSpaces") or l.get("parkingSpaces"), 0
            ))
            if safe_float(winner.get("garage_spaces") or winner.get("garageSpaces"), 0) > 0:
                winners["best_parking"] = winner.get("mlsNumber")
                used_mls.add(winner.get("mlsNumber"))
                buyer_highlight_added = True

    if not buyer_highlight_added and buyer_cares_about(profile, "low_noise"):
        candidates = [l for l in listings if l.get("mlsNumber") not in used_mls]
        if candidates:
            winner = min(candidates, key=get_noise_score)
            if get_noise_score(winner) < 50:  # Only add if actually quiet
                winners["quietest_location"] = winner.get("mlsNumber")
                used_mls.add(winner.get("mlsNumber"))
                buyer_highlight_added = True

    # ==========================================================================
    # 3. Best Price (always, if not already used)
    # ==========================================================================
    budget_candidates = [l for l in listings if l.get("mlsNumber") not in used_mls]
    if budget_candidates:
        budget_max = safe_float(profile.get("budgetMax"), float('inf'))

        def get_budget_room(listing):
            price = safe_float(listing.get("listPrice"))
            if budget_max == float('inf'):
                return -price  # Lower price = more room
            return budget_max - price

        winner = max(budget_candidates, key=get_budget_room)
        winners["best_price"] = winner.get("mlsNumber")

    return winners  # Max 3 entries, no duplicates
