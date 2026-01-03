"""
Static lookup for valid Repliers API filter values.

Values sourced from Repliers Aggregates API (GET /listings?aggregates=...).
Used to standardize user input to exact API-expected values.

This module provides:
- standardize_style(): Map user homeType to valid API style
- parse_multi_city_location(): Parse "X or Y" location patterns
"""

import re
from typing import Optional, List

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
    Parse location string that may contain multiple cities.

    Handles various formats:
    - "Westborough or Shrewsbury" → ["Westborough", "Shrewsbury"]
    - "Worcester, MA" → ["Worcester"]
    - "Boston" → ["Boston"]
    - "Newton and Cambridge" → ["Newton", "Cambridge"]

    Args:
        location: User's location input

    Returns:
        List of cleaned city names
    """
    if not location:
        return []

    cities = []

    # Pattern: "City1 or City2" or "City1 and City2" (case insensitive)
    if re.search(r'\s+(or|and)\s+', location, re.IGNORECASE):
        parts = re.split(r'\s+(?:or|and)\s+', location, flags=re.IGNORECASE)
        for part in parts:
            city = _extract_city(part.strip())
            if city:
                cities.append(city)
    else:
        # Single city
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

    Args:
        loc: Location string in various formats

    Returns:
        Extracted city name, or empty string if not parseable
    """
    if not loc:
        return ""

    loc = loc.strip()

    # Format 1: Comma-separated (e.g., "Worcester, MA" or "Boston, Massachusetts")
    if "," in loc:
        return loc.split(",")[0].strip()

    # Format 2: Space + 2-letter state code at end (e.g., "Boston MA")
    parts = loc.split()
    if len(parts) >= 2 and len(parts[-1]) == 2 and parts[-1].isalpha():
        return " ".join(parts[:-1]).strip()

    # Format 3: Single word or multi-word city (e.g., "Boston" or "New York")
    return loc
