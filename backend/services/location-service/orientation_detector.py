"""
House Orientation Detector
Determines which direction a house faces using street geometry analysis.
"""

import math
import logging
from typing import Dict, Optional, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


class FacingDirection(str, Enum):
    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"
    NORTHEAST = "northeast"
    NORTHWEST = "northwest"
    SOUTHEAST = "southeast"
    SOUTHWEST = "southwest"
    UNKNOWN = "unknown"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


def calculate_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate bearing from point 1 to point 2 in degrees (0-360).
    0 = North, 90 = East, 180 = South, 270 = West
    """
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    lng_diff = math.radians(lng2 - lng1)

    x = math.sin(lng_diff) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - \
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(lng_diff)

    bearing = math.atan2(x, y)
    bearing_degrees = math.degrees(bearing)

    # Normalize to 0-360
    return (bearing_degrees + 360) % 360


def bearing_to_cardinal(bearing: float) -> FacingDirection:
    """Convert bearing to cardinal/intercardinal direction."""
    # Normalize bearing
    bearing = bearing % 360

    # 8-point compass rose
    if 337.5 <= bearing or bearing < 22.5:
        return FacingDirection.NORTH
    elif 22.5 <= bearing < 67.5:
        return FacingDirection.NORTHEAST
    elif 67.5 <= bearing < 112.5:
        return FacingDirection.EAST
    elif 112.5 <= bearing < 157.5:
        return FacingDirection.SOUTHEAST
    elif 157.5 <= bearing < 202.5:
        return FacingDirection.SOUTH
    elif 202.5 <= bearing < 247.5:
        return FacingDirection.SOUTHWEST
    elif 247.5 <= bearing < 292.5:
        return FacingDirection.WEST
    elif 292.5 <= bearing < 337.5:
        return FacingDirection.NORTHWEST

    return FacingDirection.UNKNOWN


def offset_point(lat: float, lng: float, bearing: float, distance_meters: float) -> Tuple[float, float]:
    """
    Calculate a point at a given distance and bearing from origin.

    Args:
        lat, lng: Origin coordinates
        bearing: Direction in degrees (0=N, 90=E, etc.)
        distance_meters: Distance to offset

    Returns:
        Tuple of (lat, lng) for the offset point
    """
    R = 6371000  # Earth radius in meters

    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    bearing_rad = math.radians(bearing)

    d = distance_meters / R

    new_lat = math.asin(
        math.sin(lat_rad) * math.cos(d) +
        math.cos(lat_rad) * math.sin(d) * math.cos(bearing_rad)
    )

    new_lng = lng_rad + math.atan2(
        math.sin(bearing_rad) * math.sin(d) * math.cos(lat_rad),
        math.cos(d) - math.sin(lat_rad) * math.sin(new_lat)
    )

    return (math.degrees(new_lat), math.degrees(new_lng))


async def detect_house_orientation(
    gmaps_client,
    property_lat: float,
    property_lng: float,
    is_cul_de_sac: bool = False
) -> Dict:
    """
    Detect house facing direction using street geometry analysis.

    Method:
    1. Query directions from 4 cardinal offset points to the property
    2. Find the approach that has the shortest/most direct route
    3. The street approach direction indicates which way the house faces (opposite)

    Args:
        gmaps_client: Initialized Google Maps client
        property_lat: Property latitude
        property_lng: Property longitude
        is_cul_de_sac: If True, use special cul-de-sac logic

    Returns:
        Dict with facing_direction, confidence, street_bearing, method
    """
    result = {
        "facing_direction": FacingDirection.UNKNOWN.value,
        "confidence": Confidence.LOW.value,
        "street_bearing": None,
        "method": "street_geometry"
    }

    if not gmaps_client:
        logger.warning("Maps client not initialized - cannot detect orientation")
        return result

    if property_lat is None or property_lng is None:
        logger.warning("No coordinates provided - cannot detect orientation")
        return result

    try:
        # Create offset points in 4 cardinal directions (100m away)
        offset_distance = 100  # meters
        test_bearings = [0, 90, 180, 270]  # N, E, S, W

        best_approach = None
        best_distance = float('inf')
        approach_results = []

        for bearing in test_bearings:
            offset_lat, offset_lng = offset_point(
                property_lat, property_lng, bearing, offset_distance
            )

            try:
                # Get directions from offset point to property
                directions = gmaps_client.directions(
                    f"{offset_lat},{offset_lng}",
                    f"{property_lat},{property_lng}",
                    mode="driving"
                )

                if directions and directions[0]['legs']:
                    leg = directions[0]['legs'][0]
                    distance = leg['distance']['value']  # meters
                    duration = leg['duration']['value']  # seconds

                    approach_results.append({
                        'bearing': bearing,
                        'distance': distance,
                        'duration': duration
                    })

                    # Shorter distance = more direct route = likely street approach
                    if distance < best_distance:
                        best_distance = distance
                        best_approach = bearing

            except Exception as e:
                logger.debug(f"Direction query failed for bearing {bearing}: {e}")
                continue

        if best_approach is not None and len(approach_results) >= 2:
            # The street approaches from best_approach direction
            # House faces the opposite direction (away from street)
            street_bearing = best_approach
            facing_bearing = (best_approach + 180) % 360
            facing_direction = bearing_to_cardinal(facing_bearing)

            # Calculate confidence based on how distinct the best approach is
            distances = [r['distance'] for r in approach_results]
            distances.sort()

            if len(distances) >= 2:
                ratio = distances[1] / distances[0] if distances[0] > 0 else 1

                if ratio > 1.5:
                    confidence = Confidence.HIGH
                elif ratio > 1.2:
                    confidence = Confidence.MEDIUM
                else:
                    confidence = Confidence.LOW
            else:
                confidence = Confidence.LOW

            # Special handling for cul-de-sac
            if is_cul_de_sac:
                # In cul-de-sacs, houses typically face toward the center
                # The approach analysis still works, but note the context
                logger.info(f"Cul-de-sac detected - orientation based on street approach")

            result = {
                "facing_direction": facing_direction.value,
                "confidence": confidence.value,
                "street_bearing": round(street_bearing),
                "method": "street_geometry",
                "street_approach_from": bearing_to_cardinal(street_bearing).value
            }

            logger.info(
                f"Orientation detected: faces {facing_direction.value} "
                f"(street from {bearing_to_cardinal(street_bearing).value}), "
                f"confidence={confidence.value}"
            )
        else:
            logger.warning("Could not determine orientation - insufficient direction data")

    except Exception as e:
        logger.error(f"Error detecting orientation: {e}", exc_info=True)

    return result


async def get_sun_exposure_summary(facing_direction: str) -> str:
    """
    Generate a human-readable summary of sun exposure based on facing direction.

    Args:
        facing_direction: Cardinal direction the house faces

    Returns:
        String summary of sun exposure characteristics
    """
    summaries = {
        "north": "Limited direct sunlight; cooler in summer, may feel darker. Good for hot climates.",
        "south": "Maximum sunlight throughout the day; bright and warm. Ideal for solar panels and gardens.",
        "east": "Morning sun, afternoon shade. Pleasant for breakfast areas and bedrooms.",
        "west": "Afternoon and evening sun; can be hot in summer. Great for sunset views.",
        "northeast": "Morning sun with moderate exposure. Good balance of light and shade.",
        "northwest": "Late afternoon sun. Watch for summer heat in western-facing rooms.",
        "southeast": "Morning to midday sun. Bright without excessive afternoon heat.",
        "southwest": "Strong afternoon sun; warmest orientation. Consider window treatments.",
        "unknown": "Orientation could not be determined."
    }

    return summaries.get(facing_direction, summaries["unknown"])
