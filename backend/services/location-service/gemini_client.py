"""
Gemini 2.5 Flash client with Google Maps integration via Vertex AI
Handles location analysis requests using Gemini's Google Maps grounding
"""

import os
import json
import logging
from typing import Optional, Dict, Any
from google import genai
from google.genai import types

from models import (
    LocationAnalysis,
    CommuteAnalysis,
    StreetContext,
    AmenitiesProximity,
    WalkabilityScore,
    FamilyIndicators,
    LocationFlag,
    AnalysisMetadata,
    BuyerLocationPrefs,
    StreetType,
    TrafficLevel,
    NoiseRisk,
    RouteType,
    WalkabilityLabel,
    FlagLevel,
    FlagCategory
)

logger = logging.getLogger(__name__)

# Initialize Gemini client with API key (supports Google Maps grounding)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL_LOCATION", "gemini-2.5-flash")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")

# Use API key client (supports Google Maps grounding)
client = genai.Client(api_key=GEMINI_API_KEY)

logger.info(f"Initialized Gemini API client: model={GEMINI_MODEL}")


def build_analysis_prompt(
    address: str,
    buyer_prefs: Optional[BuyerLocationPrefs],
    hard_data: Optional[Dict[str, Any]] = None
) -> str:
    """
    Build the prompt for Gemini to analyze a property location

    Args:
        address: Full property address
        buyer_prefs: Optional buyer preferences for tailored analysis
        hard_data: Hard data from Maps APIs (commute, amenities) - DO NOT recalculate

    Returns:
        Formatted prompt for Gemini
    """

    # Base prompt
    prompt = f"""
Analyze this property location and return a STRICT JSON response.

Property Address: {address}
"""

    # Add hard data from Maps APIs (if provided)
    if hard_data:
        prompt += """
HARD DATA FROM GOOGLE MAPS APIs (DO NOT RECALCULATE - USE THESE EXACT VALUES):
"""

        if hard_data.get('commute'):
            commute = hard_data['commute']
            prompt += f"""
Commute Data (from Routes API with live traffic):
- Work Address: {commute.get('work_address', 'N/A')}
- Peak Commute: {commute.get('drive_peak_mins', 'N/A')} minutes
- Off-Peak Commute: {commute.get('drive_offpeak_mins', 'N/A')} minutes
- Distance: {commute.get('distance_miles', 'N/A')} miles
"""

        if hard_data.get('amenities'):
            amenities = hard_data['amenities']
            prompt += f"""
Amenity Drive Times (from Places API + Routes API):
- Nearest Grocery: {amenities.get('grocery_drive_mins', 'N/A')} minutes
- Nearest Pharmacy: {amenities.get('pharmacy_drive_mins', 'N/A')} minutes
"""

        prompt += """
YOU MUST USE THESE EXACT VALUES IN YOUR RESPONSE. DO NOT RECALCULATE.
"""

    # Add buyer preferences if provided
    if buyer_prefs:
        prompt += f"""
Buyer Preferences:
- Work Address: {buyer_prefs.work_address or 'Not provided (skip commute analysis)'}
- Max Commute: {buyer_prefs.max_commute_mins} minutes
- Prioritize Quiet Street: {buyer_prefs.prioritize_quiet_street}
- Prioritize Walkability: {buyer_prefs.prioritize_walkability}
- Has Kids: {buyer_prefs.has_kids}
"""

    # Instructions for analysis
    if hard_data:
        # Focused instructions when we have hard data
        prompt += """

CRITICAL INSTRUCTIONS:
1. USE THE EXACT VALUES from the HARD DATA above for commute and amenities
2. DO NOT recalculate or verify those numbers - they are from authoritative APIs
3. Use Google Maps grounding ONLY for:
   - Counting POIs (schools, parks, playgrounds within 1 mile)
   - Distance to major roads
   - Sidewalk presence
   - Walking times to parks/playgrounds

# STREET CONTEXT INTERPRETATION RULES

You MUST populate street_context fields using the following explicit rules.
Do NOT leave street_context null or empty.

## Data Sources:
- hard_data.geocoding.place_types (from Google Geocoding API)
- hard_data.geocoding.is_cul_de_sac (boolean from address components)
- hard_data.traffic_analysis.traffic_ratio (calculated from Directions API)
- hard_data.traffic_analysis.used_highway (boolean from route steps)
- Google Maps grounding (for gaps only)

## 1. street_type Classification:
Use geocoding.place_types and traffic_analysis from hard_data:
- If hard_data.traffic_analysis.used_highway is true → street_type = "highway_adjacent"
- If hard_data.geocoding.place_types contains "premise" or "subpremise" → street_type = "residential_side_street"
- If hard_data.geocoding.place_types contains "route" or "intersection" → Use Maps grounding to distinguish "collector" vs "arterial" based on road size
- Default: "residential_side_street"

## 2. traffic_level & noise_risk (use traffic_ratio from hard_data):
CRITICAL: hard_data.traffic_analysis.traffic_ratio = peak_duration / static_duration

- If traffic_ratio >= 1.4 (40%+ slower in traffic) → traffic_level="high", noise_risk="high"
- If traffic_ratio between 1.15-1.4 (15-40% slower) → traffic_level="moderate", noise_risk="moderate"
- If traffic_ratio < 1.15 (less than 15% slower) → traffic_level="low", noise_risk="low"
- If traffic_ratio is null (no commute data), use Google Maps grounding to estimate traffic level

## 3. near_major_road_meters:
Use Google Maps grounding to find distance to nearest highway, freeway, or major arterial road.
Return integer in meters (e.g., 250, 500, 1200).

## 4. is_cul_de_sac:
Check hard_data.geocoding.is_cul_de_sac value.
If true, set is_cul_de_sac = true.
If false but Google Maps shows dead-end street, override to true.
Otherwise set to false.

## 5. sidewalks_present:
Set to null for now (cannot be determined without Street View image analysis).

CRITICAL: You must return a complete street_context object.
Only set individual fields to null if data is truly unavailable.
Prioritize hard_data values over Google Maps grounding where available.

4. Return ONLY valid JSON matching the schema below (no markdown, no explanation)
5. If uncertain about a field, set it to null"""
    else:
        # Original instructions when no hard data (fallback mode)
        prompt += """

CRITICAL INSTRUCTIONS:
1. Use Google Maps to get ALL numeric data (DO NOT hallucinate or guess)
2. If Maps doesn't return a value, set that field to null
3. Return ONLY valid JSON matching the schema below (no markdown, no explanation)
4. Use Google Maps to calculate:
   - Driving times (peak and off-peak) if work_address is provided
   - Distance to major roads and intersections
   - Nearby amenities (grocery, pharmacy, parks, playgrounds, schools, train station)
   - Walking times to parks and playgrounds
   - Street type classification based on road hierarchy"""

    #JSON schema (same for both modes)
    prompt += """

JSON SCHEMA:
{
  "address": "<exact address>",
  "commute": {  // ONLY include if work_address is provided, otherwise null
    "work_address": "<work address>",
    "drive_peak_mins": <integer: driving time during peak hours>,
    "drive_offpeak_mins": <integer: driving time off-peak>,
    "distance_miles": <float: total distance>,
    "route_type": "<highway_majority|local_roads|mixed>"
  },
  "street_context": {
    "street_type": "<residential_side_street|collector|arterial|highway_adjacent>",
    "traffic_level": "<low|moderate|high>",
    "near_major_road_meters": <integer: meters to nearest major road>,
    "noise_risk": "<low|moderate|high>",
    "is_cul_de_sac": <boolean>
  },
  "amenities": {
    "grocery_drive_mins": <integer or null>,
    "pharmacy_drive_mins": <integer or null>,
    "cafes_drive_mins": <integer or null>,
    "primary_school_drive_mins": <integer or null>,
    "train_station_drive_mins": <integer or null>
  },
  "walkability": {
    "sidewalks_present": <boolean or null>,
    "closest_park_walk_mins": <integer or null>,
    "closest_playground_walk_mins": <integer or null>,
    "overall_walkability_label": "<low|moderate|high>",
    "walk_score_estimate": <integer 0-100 or null>
  },
  "family_indicators": {
    "nearby_playgrounds_count": <integer: within 1 mile>,
    "nearby_parks_count": <integer: within 1 mile>,
    "nearby_schools_count": <integer: within 1 mile>
  },
  "flags": [
    {
      "level": "<green|yellow|red>",
      "code": "<FLAG_CODE>",
      "message": "<human-readable message>",
      "category": "<commute|noise|walkability|family_friendly|amenities>"
    }
  ]
}

FLAG CODES TO USE:
- COMMUTE_OVER_MAX (red): Peak commute significantly exceeds max ({buyer_prefs.max_commute_mins if buyer_prefs else 35} mins)
- COMMUTE_SLIGHTLY_OVER_MAX (yellow): Peak commute slightly over max
- HIGH_TRAFFIC_STREET (yellow): Property on high-traffic collector or arterial
- NEAR_HIGHWAY (yellow): Within 200 meters of highway
- NEAR_RAIL (yellow): Near rail tracks
- NO_SIDEWALKS (yellow): No sidewalks on immediate street
- FAR_FROM_PARKS (yellow): Closest park over 20 min walk
- EXCELLENT_WALKABILITY (green): Very walkable area
- FAMILY_FRIENDLY_AREA (green): Quiet residential with nearby parks/playgrounds
- QUIET_RESIDENTIAL (green): Low traffic residential side street

IMPORTANT:
- Base all data on Google Maps queries
- Do not guess or hallucinate numeric values
- If uncertain about a field, set it to null
- Return ONLY the JSON, no other text
"""

    return prompt


async def analyze_location_with_gemini(
    address: str,
    buyer_prefs: Optional[BuyerLocationPrefs] = None,
    hard_data: Optional[Dict[str, Any]] = None,
    timeout: float = 5.0
) -> Optional[LocationAnalysis]:
    """
    Analyze a property location using Gemini 2.5 Flash with Google Maps

    Args:
        address: Full property address to analyze
        buyer_prefs: Optional buyer preferences for tailored analysis
        hard_data: Optional hard data from Maps APIs (commute, amenities) - Gemini will use these exact values
        timeout: Timeout in seconds (default 5.0)

    Returns:
        LocationAnalysis object or None if analysis fails
    """

    try:
        logger.info(f"Analyzing location for address: {address}")

        if hard_data:
            logger.info(f"Using hard data from Maps APIs: {hard_data.keys()}")

        # Build prompt
        prompt = build_analysis_prompt(address, buyer_prefs, hard_data)

        # Call Gemini 2.5 Flash with Google Maps tool
        # Note: response_mime_type="application/json" is not supported with Google Maps tool
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_maps=types.GoogleMaps())],
                temperature=0.1,  # Low temperature for consistency
                max_output_tokens=4096
            )
        )

        # Parse response
        response_text = response.text.strip()
        logger.debug(f"Gemini response: {response_text[:500]}...")  # Log first 500 chars

        # Extract JSON from response (may be wrapped in markdown code blocks)
        try:
            # Try direct JSON parse first
            data = json.loads(response_text)
        except json.JSONDecodeError:
            # Try extracting JSON from markdown code block
            import re
            json_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', response_text, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group(1))
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse extracted JSON: {e}")
                    logger.error(f"Response text: {response_text}")
                    return None
            else:
                # Try finding any JSON object in the text
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    try:
                        data = json.loads(json_match.group(0))
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse Gemini response as JSON: {e}")
                        logger.error(f"Response text: {response_text}")
                        return None
                else:
                    logger.error(f"No JSON found in response: {response_text}")
                    return None

        # Validate and construct LocationAnalysis
        location_analysis = LocationAnalysis(
            address=data.get("address", address),
            commute=CommuteAnalysis(**data["commute"]) if data.get("commute") else None,
            street_context=StreetContext(**data["street_context"]),
            amenities=AmenitiesProximity(**data["amenities"]),
            walkability=WalkabilityScore(**data["walkability"]),
            family_indicators=FamilyIndicators(**data["family_indicators"]),
            flags=[LocationFlag(**flag) for flag in data.get("flags", [])],
            metadata=AnalysisMetadata(
                cache_hit=False,
                gemini_model=GEMINI_MODEL
            )
        )

        logger.info(f"Successfully analyzed location for {address}")
        return location_analysis

    except Exception as e:
        logger.error(f"Error analyzing location for {address}: {str(e)}", exc_info=True)
        return None


def normalize_address(address: str) -> str:
    """
    Normalize address for cache key consistency

    Args:
        address: Raw address string

    Returns:
        Normalized address string
    """
    # Convert to uppercase
    normalized = address.upper().strip()

    # Standardize common abbreviations
    replacements = {
        " ST ": " STREET ",
        " AVE ": " AVENUE ",
        " BLVD ": " BOULEVARD ",
        " RD ": " ROAD ",
        " DR ": " DRIVE ",
        " LN ": " LANE ",
        " CT ": " COURT ",
        " PL ": " PLACE ",
        "  ": " "  # Remove double spaces
    }

    for old, new in replacements.items():
        normalized = normalized.replace(old, new)

    return normalized
