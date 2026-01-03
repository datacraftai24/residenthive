"""
Regional market configuration for smart search inference.

This module provides regional price data used to infer missing search parameters.
For example:
- Budget without bedrooms → Infer bedroom range from regional price-per-bedroom
- Location without budget → Infer price range from regional percentiles
"""

from typing import Dict, Any

# Regional market defaults
# These are hardcoded for now, but can be enhanced to pull from Repliers API
REGIONAL_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "Worcester, MA": {
        "median_price": 450000,
        "price_percentiles": {"p25": 350000, "p50": 450000, "p75": 600000},
        "price_per_bedroom": {1: 250000, 2: 350000, 3: 450000, 4: 550000},
    },
    "Boston, MA": {
        "median_price": 850000,
        "price_percentiles": {"p25": 600000, "p50": 850000, "p75": 1200000},
        "price_per_bedroom": {1: 450000, 2: 650000, 3: 900000, 4: 1200000},
    },
    "Shrewsbury, MA": {
        "median_price": 550000,
        "price_percentiles": {"p25": 450000, "p50": 550000, "p75": 700000},
        "price_per_bedroom": {1: 300000, 2: 400000, 3: 550000, 4: 700000},
    },
    "Cambridge, MA": {
        "median_price": 950000,
        "price_percentiles": {"p25": 700000, "p50": 950000, "p75": 1400000},
        "price_per_bedroom": {1: 500000, 2: 750000, 3: 1000000, 4: 1300000},
    },
    "Newton, MA": {
        "median_price": 1200000,
        "price_percentiles": {"p25": 900000, "p50": 1200000, "p75": 1600000},
        "price_per_bedroom": {1: 600000, 2: 900000, 3: 1200000, 4: 1500000},
    },
    "Somerville, MA": {
        "median_price": 800000,
        "price_percentiles": {"p25": 600000, "p50": 800000, "p75": 1000000},
        "price_per_bedroom": {1: 450000, 2: 650000, 3: 850000, 4: 1050000},
    },
    "_default": {
        "median_price": 400000,
        "price_percentiles": {"p25": 300000, "p50": 400000, "p75": 600000},
        "price_per_bedroom": {1: 200000, 2: 300000, 3: 400000, 4: 500000},
    }
}


def get_regional_config(location: str) -> Dict[str, Any]:
    """
    Get regional config for a location with fuzzy matching and fallback.

    Args:
        location: Location string (e.g., "Worcester, MA" or "Worcester")

    Returns:
        Regional config dict with median_price, price_percentiles, price_per_bedroom
    """
    if not location:
        return REGIONAL_DEFAULTS["_default"]

    # Normalize: extract city name from "City, State" format
    city = location.split(",")[0].strip().lower()

    # Try fuzzy match against known regions
    for key, config in REGIONAL_DEFAULTS.items():
        if key == "_default":
            continue
        key_city = key.split(",")[0].strip().lower()
        if city == key_city or city in key_city or key_city in city:
            return config

    return REGIONAL_DEFAULTS["_default"]


def get_all_regions() -> list:
    """Return list of all configured regions."""
    return [k for k in REGIONAL_DEFAULTS.keys() if k != "_default"]
