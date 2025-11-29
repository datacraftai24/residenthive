"""
Requirements Analyzer Service

Computes deterministic requirement flags and category winners for buyer reports.
No LLM calls - all logic is rule-based.
"""
from typing import Dict, Any, List, Optional


def compute_requirements_checklist(
    profile: Dict[str, Any],
    listing: Dict[str, Any]
) -> Dict[str, str]:
    """
    Compute deterministic requirement flags for a listing against buyer profile.

    Args:
        profile: Buyer profile with preferences
        listing: Property listing with details and aiAnalysis

    Returns:
        Dict of requirement_name -> flag ("✅", "⚠", "❌")
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
            if isinstance(text, str)  # Skip non-string items
        )

    flags = {}

    # 1. Meets Bedrooms
    profile_beds = profile.get("bedrooms") or 0
    listing_beds = listing.get("bedrooms") or 0

    # Ensure numeric types
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

    # Ensure numeric types
    try:
        list_price = float(list_price) if list_price else 0
        budget_max = float(budget_max) if budget_max else float('inf')
    except (ValueError, TypeError):
        list_price = 0
        budget_max = float('inf')

    if list_price <= budget_max:
        flags["within_budget"] = "✅"
    elif list_price <= budget_max * 1.05:  # Within 5%
        flags["within_budget"] = "⚠"
    else:
        flags["within_budget"] = "❌"

    # 3. In Target Area
    listing_city = listing.get("city")
    profile_location = profile.get("location")

    # Ensure both are strings (not dicts or other types)
    if not isinstance(listing_city, str):
        listing_city = ""
    if not isinstance(profile_location, str):
        profile_location = ""

    listing_city = listing_city.lower()
    profile_location = profile_location.lower()

    # Check if profile location is in listing city or vice versa
    if listing_city and profile_location:
        if listing_city in profile_location or profile_location in listing_city:
            flags["in_target_area"] = "✅"
        else:
            flags["in_target_area"] = "❌"
    else:
        flags["in_target_area"] = "❌"

    # 4. Has Amenities (based on mustHave items appearing in whats_matching)
    must_have = profile.get("mustHave", [])

    # Ensure must_have is a list and filter to only strings
    if not isinstance(must_have, list):
        must_have = []
    must_have = [item for item in must_have if isinstance(item, str)]

    if not must_have:
        # No must-haves specified
        flags["has_amenities"] = "✅"
    else:
        # Count how many must-haves appear in whats_matching
        matched_count = 0
        for item in must_have:
            if contains_keyword(whats_matching, item):
                matched_count += 1

        match_ratio = matched_count / len(must_have)

        if match_ratio >= 0.8:  # 80%+ matched
            flags["has_amenities"] = "✅"
        elif match_ratio >= 0.4:  # 40-79% matched
            flags["has_amenities"] = "⚠"
        else:
            flags["has_amenities"] = "❌"

    # 5. Good Condition (based on red_flags count)
    total_red_flags = len(red_flags) + len(photo_red_flags)

    if total_red_flags == 0:
        flags["good_condition"] = "✅"
    elif total_red_flags <= 2:
        flags["good_condition"] = "⚠"
    else:
        flags["good_condition"] = "❌"

    # 6. Outdoor Space
    lot_size = listing.get("lotSize") or 0
    lot_acres = listing.get("lotAcres") or 0

    # Ensure numeric types
    try:
        lot_size = float(lot_size) if lot_size else 0
        lot_acres = float(lot_acres) if lot_acres else 0
    except (ValueError, TypeError):
        lot_size = 0
        lot_acres = 0

    # Check lot size or photo mentions of yard/outdoor space
    has_yard_in_photos = (
        contains_keyword(photo_matches, "yard") or
        contains_keyword(photo_matches, "outdoor") or
        contains_keyword(photo_matches, "patio") or
        contains_keyword(photo_matches, "deck")
    )

    if lot_acres > 0.15 or (has_yard_in_photos and lot_acres > 0.05):
        flags["outdoor_space"] = "✅"
    elif lot_acres > 0 or has_yard_in_photos:
        flags["outdoor_space"] = "⚠"
    else:
        flags["outdoor_space"] = "❌"

    # 7. Good Layout (based on vision checklist matches)
    vision_checklist = profile.get("visionChecklist", [])

    # Ensure vision_checklist is a list
    if not isinstance(vision_checklist, list):
        vision_checklist = []

    if not vision_checklist:
        # No vision requirements
        flags["good_layout"] = "✅"
    elif photo_matches:
        # Has vision checklist and has photo matches
        flags["good_layout"] = "✅"
    elif ai_analysis.get("vision_complete"):
        # Vision analysis done but no matches found
        flags["good_layout"] = "⚠"
    else:
        # No vision analysis yet
        flags["good_layout"] = "❌"

    # 8. Low Noise (check for noise/traffic concerns)
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

    if has_noise_concerns:
        flags["low_noise"] = "❌"
    else:
        flags["low_noise"] = "✅"

    return flags


def compute_category_winners(
    profile: Dict[str, Any],
    listings: List[Dict[str, Any]],
    ranked_picks: List[Dict[str, Any]] = None
) -> Dict[str, Optional[str]]:
    """
    Identify best property in each category.

    Args:
        profile: Buyer profile
        listings: All listings in the report
        ranked_picks: Optional synthesis ranked picks (to align Best Overall with #1 rank)

    Returns:
        Dict with mlsNumber for each category winner:
        {
            "best_overall": str,
            "most_space": str,
            "best_yard": str,
            "most_budget_room": str
        }
    """
    if not listings:
        return {
            "best_overall": None,
            "most_space": None,
            "best_yard": None,
            "most_budget_room": None
        }

    # Helper to safely get numeric value
    def safe_float(value, default=0.0):
        try:
            return float(value) if value else default
        except (ValueError, TypeError):
            return default

    # Best Overall = first in synthesis ranking (aligned with agent's top pick)
    if ranked_picks and len(ranked_picks) > 0:
        best_overall_mls = ranked_picks[0].get("mlsNumber")
    else:
        # Fallback to highest finalScore if no synthesis
        best_overall = max(listings, key=lambda x: safe_float(x.get("finalScore")))
        best_overall_mls = best_overall.get("mlsNumber")

    # Most Space (highest sqft)
    most_space = max(listings, key=lambda x: safe_float(x.get("sqft")))

    # Best Yard (highest lotAcres or lotSize)
    def get_lot_acres(listing):
        lot_acres = safe_float(listing.get("lotAcres"))
        if lot_acres > 0:
            return lot_acres
        else:
            lot_size = safe_float(listing.get("lotSize"))
            return lot_size / 43560 if lot_size > 0 else 0

    best_yard = max(listings, key=get_lot_acres)

    # Most Budget Room (lowest price OR largest gap to budgetMax)
    budget_max = safe_float(profile.get("budgetMax"), float('inf'))

    # Calculate budget room for each listing
    def get_budget_room(listing: Dict[str, Any]) -> float:
        price = safe_float(listing.get("listPrice"))
        if budget_max == float('inf'):
            # No budget limit, just use lowest price
            return -price  # Negative so max() gets lowest price
        else:
            # Return gap to budget max
            return budget_max - price

    most_budget_room = max(listings, key=get_budget_room)

    return {
        "best_overall": best_overall_mls,
        "most_space": most_space.get("mlsNumber"),
        "best_yard": best_yard.get("mlsNumber"),
        "most_budget_room": most_budget_room.get("mlsNumber")
    }
