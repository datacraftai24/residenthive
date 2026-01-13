"""
Static lookup for valid Repliers API filter values.

Values sourced from Repliers Aggregates API (GET /listings?aggregates=...).
Used to standardize user input to exact API-expected values.

This module provides:
- standardize_style(): Map user homeType to valid API style
- parse_multi_city_location(): Parse multi-city and region location patterns
- format_location_display(): Format city list for UI display
"""

import re
from typing import Optional, List, Dict, Any

# Valid style values from Repliers Aggregates API
# Source: GET /listings?aggregates=details.style&listings=false&type=Sale
# Last updated: 2024-12-31
VALID_STYLES = [
    "Single Family Residence",
    "Condominium",
    "Other",
    "Residential",
    "Multi Family",
    "Mobile Home",
    "3 Family",
    "2 Family - 2 Units Up/Down",
    "Commercial",
    "5-9 Family",
    "3 Family - 3 Units Up/Down",
    "5+ Family - 5+ Units Up/Down",
    "2 Family - 2 Units Side By Side",
    "4 Family",
    "Condex",
    "Duplex",
    "Stock Cooperative",
    "Farm",
    "Attached (Townhouse/Rowhouse/Duplex)",
]

# User input → API value mapping
# Maps common user-friendly terms to exact API values
STYLE_ALIASES = {
    # Single family variations
    "single family": "Single Family Residence",
    "single-family": "Single Family Residence",
    "single family home": "Single Family Residence",
    "single-family home": "Single Family Residence",
    "singlefamily": "Single Family Residence",
    "sfr": "Single Family Residence",
    "house": "Single Family Residence",
    "detached": "Single Family Residence",
    "detached home": "Single Family Residence",
    # Condo variations
    "condo": "Condominium",
    "apartment": "Condominium",
    "apt": "Condominium",
    "flat": "Condominium",
    # Multi-family variations
    "multi-family": "Multi Family",
    "multifamily": "Multi Family",
    "multi family": "Multi Family",
    "investment": "Multi Family",
    # Townhouse variations
    "townhouse": "Attached (Townhouse/Rowhouse/Duplex)",
    "townhome": "Attached (Townhouse/Rowhouse/Duplex)",
    "town house": "Attached (Townhouse/Rowhouse/Duplex)",
    "town home": "Attached (Townhouse/Rowhouse/Duplex)",
    "rowhouse": "Attached (Townhouse/Rowhouse/Duplex)",
    "row house": "Attached (Townhouse/Rowhouse/Duplex)",
    # Duplex
    "duplex": "Duplex",
    "2 family": "2 Family - 2 Units Up/Down",
    "two family": "2 Family - 2 Units Up/Down",
    # Mobile home
    "mobile": "Mobile Home",
    "mobile home": "Mobile Home",
    "manufactured": "Mobile Home",
    "manufactured home": "Mobile Home",
    # Farm
    "farm": "Farm",
    "farmhouse": "Farm",
}


# Massachusetts region definitions for multi-city expansion
# Source: Common real estate market areas
# Last updated: 2025-01-12
MA_REGIONS = {
    # South Shore
    "south shore": ["Quincy", "Braintree", "Weymouth", "Hingham", "Cohasset",
                    "Scituate", "Marshfield", "Duxbury", "Norwell", "Hanover",
                    "Rockland", "Abington", "Whitman", "Hull"],
    "south shore ma": ["Quincy", "Braintree", "Weymouth", "Hingham", "Cohasset",
                       "Scituate", "Marshfield", "Duxbury", "Norwell", "Hanover"],

    # North Shore
    "north shore": ["Salem", "Beverly", "Marblehead", "Swampscott", "Lynn",
                    "Peabody", "Danvers", "Gloucester", "Rockport", "Manchester",
                    "Melrose", "Wakefield", "Stoneham", "Reading", "Woburn"],
    "north shore ma": ["Salem", "Beverly", "Marblehead", "Swampscott", "Lynn",
                       "Peabody", "Danvers", "Gloucester", "Rockport"],

    # Greater Boston / Metro
    "greater boston": ["Boston", "Cambridge", "Somerville", "Brookline",
                       "Newton", "Quincy", "Medford", "Malden", "Everett"],
    "metro boston": ["Boston", "Cambridge", "Somerville", "Brookline", "Newton"],
    "metro west": ["Framingham", "Natick", "Wellesley", "Needham", "Newton",
                   "Waltham", "Watertown", "Weston", "Wayland", "Sudbury"],

    # Cape Cod
    "cape cod": ["Barnstable", "Falmouth", "Sandwich", "Mashpee", "Bourne",
                 "Yarmouth", "Dennis", "Brewster", "Chatham", "Orleans",
                 "Eastham", "Wellfleet", "Truro", "Provincetown"],
    "the cape": ["Barnstable", "Falmouth", "Sandwich", "Mashpee", "Bourne",
                 "Yarmouth", "Dennis", "Brewster", "Chatham", "Orleans"],

    # Worcester Area
    "greater worcester": ["Worcester", "Shrewsbury", "Westborough", "Northborough",
                          "Grafton", "Millbury", "Auburn", "Holden", "Leicester"],
    "worcester area": ["Worcester", "Shrewsbury", "Westborough", "Northborough",
                       "Grafton", "Millbury", "Auburn"],

    # Specific combos
    "boston area": ["Boston", "Cambridge", "Somerville", "Brookline", "Newton"],
    "quincy area": ["Quincy", "Braintree", "Weymouth", "Milton"],
    "boston and quincy areas": ["Boston", "Cambridge", "Brookline", "Quincy",
                                 "Braintree", "Weymouth", "Milton"],
}


def standardize_style(user_input: str) -> Optional[str]:
    """
    Map user-provided homeType to valid Repliers API style value.

    Uses a multi-step matching strategy:
    1. Check explicit alias map (most common variations)
    2. Check if already a valid value (case-insensitive)
    3. Fuzzy substring match

    Args:
        user_input: User's homeType value (e.g., "single family home")

    Returns:
        Valid API style value, or None if no match found

    Examples:
        >>> standardize_style("single family home")
        "Single Family Residence"
        >>> standardize_style("condo")
        "Condominium"
        >>> standardize_style("Single Family Residence")
        "Single Family Residence"
        >>> standardize_style("random")
        None
    """
    if not user_input:
        return None

    normalized = user_input.strip().lower()

    # 1. Check alias map first (handles common variations)
    if normalized in STYLE_ALIASES:
        return STYLE_ALIASES[normalized]

    # 2. Check if already a valid value (case-insensitive match)
    for valid in VALID_STYLES:
        if normalized == valid.lower():
            return valid

    # 3. Fuzzy: check if user input contains or is contained in valid value
    for valid in VALID_STYLES:
        valid_lower = valid.lower()
        # "family" in "Single Family Residence" or "single family residence" in "single family"
        if normalized in valid_lower or valid_lower in normalized:
            return valid

    # 4. No match found - return None (caller should skip style filter)
    return None


def parse_multi_city_location(location: str) -> List[str]:
    """
    Parse location string that may contain multiple cities or regions.

    Supported formats:
    - "Boston" → ["Boston"]
    - "Worcester, MA" → ["Worcester"]
    - "Boston or Quincy" → ["Boston", "Quincy"]
    - "Boston and Quincy" → ["Boston", "Quincy"]
    - "Boston, Quincy, Brookline" → ["Boston", "Quincy", "Brookline"]
    - "Boston MA, Quincy MA" → ["Boston", "Quincy"]
    - "South Shore MA" → [region cities...]
    - "Greater Boston" → [metro cities...]

    Args:
        location: User's location input

    Returns:
        List of cleaned city names
    """
    if not location:
        return []

    normalized = location.strip().lower()

    # Step 1: Check for region match first
    # Only match if input is exactly the region or contains the full region name
    for region_key, region_cities in MA_REGIONS.items():
        # Exact match or input contains the full region key
        if normalized == region_key or region_key in normalized:
            print(f"[LOCATION PARSER] Matched region '{region_key}' → {len(region_cities)} cities")
            return region_cities

    # Step 2: Strip common suffixes for cleaner parsing
    # "boston and quincy areas" → "boston and quincy"
    normalized = re.sub(r'\s+(areas?|region|metro|greater)\s*$', '', normalized, flags=re.IGNORECASE)

    cities = []

    # Step 3: Check for "or" / "and" / "&" connectors
    if re.search(r'\s+(or|and|&)\s+', normalized, re.IGNORECASE):
        parts = re.split(r'\s+(?:or|and|&)\s+', normalized, flags=re.IGNORECASE)
        for part in parts:
            city = _extract_city(part.strip())
            if city:
                cities.append(city)
        return cities

    # Step 4: Check for comma-separated cities
    # "Boston, Quincy, Brookline" or "Boston MA, Quincy MA"
    if "," in normalized:
        parts = normalized.split(",")
        for part in parts:
            city = _extract_city(part.strip())
            if city:
                cities.append(city)
        return cities

    # Step 5: Single city
    city = _extract_city(location)
    if city:
        cities.append(city)

    return cities


def _extract_city(loc: str) -> str:
    """
    Extract city name from various location formats.

    Handles:
    - "Worcester, MA" → "Worcester"
    - "Boston Massachusetts" → "Boston"
    - "Boston MA" → "Boston"
    - "Worcester" → "Worcester"
    - "new york" → "New York" (title cased)

    Args:
        loc: Location string in various formats

    Returns:
        Extracted city name (title cased), or empty string if not parseable
    """
    if not loc:
        return ""

    loc = loc.strip()

    # Remove "area/areas" suffix
    loc = re.sub(r'\s+areas?\s*$', '', loc, flags=re.IGNORECASE)

    # Format 1: Comma-separated (e.g., "Worcester, MA" or "Boston, Massachusetts")
    if "," in loc:
        return loc.split(",")[0].strip().title()

    # Format 2: Full state name at end (e.g., "Boston Massachusetts")
    state_pattern = r'\s+(massachusetts|california|texas|florida|new york|connecticut|rhode island|new hampshire|maine|vermont)\s*$'
    match = re.search(state_pattern, loc, re.IGNORECASE)
    if match:
        return loc[:match.start()].strip().title()

    # Format 3: Space + 2-letter state code at end (e.g., "Boston MA")
    parts = loc.split()
    if len(parts) >= 2 and len(parts[-1]) == 2 and parts[-1].isalpha():
        return " ".join(parts[:-1]).strip().title()

    # Format 4: Single word or multi-word city (e.g., "Boston" or "New York")
    return loc.strip().title()


def format_location_display(cities: List[str]) -> str:
    """
    Format city list for display in UI.

    Examples:
    - ["Boston"] → "Boston"
    - ["Boston", "Quincy"] → "Boston & Quincy"
    - ["Boston", "Quincy", "Brookline"] → "Boston, Quincy & Brookline"
    - 5+ cities → "Boston, Quincy + 3 more"

    Args:
        cities: List of city names

    Returns:
        Formatted string for display
    """
    if not cities:
        return ""
    if len(cities) == 1:
        return cities[0]
    if len(cities) == 2:
        return f"{cities[0]} & {cities[1]}"
    if len(cities) <= 4:
        return f"{', '.join(cities[:-1])} & {cities[-1]}"
    return f"{', '.join(cities[:2])} + {len(cities) - 2} more"


def get_region_suggestions(partial: str) -> List[Dict[str, Any]]:
    """
    Get region suggestions for autocomplete (future enhancement).
    Returns matching regions with their city counts.

    Args:
        partial: Partial region name to match

    Returns:
        List of matching region suggestions
    """
    suggestions = []
    partial_lower = partial.lower()
    for region, cities in MA_REGIONS.items():
        if partial_lower in region:
            suggestions.append({
                "region": region.title(),
                "cities": cities,
                "city_count": len(cities),
                "display": f"{region.title()} ({len(cities)} cities)"
            })
    return suggestions
