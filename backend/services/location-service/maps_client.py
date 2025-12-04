"""
Google Maps Platform API Client
Provides direct API access for precise location data (commute times, amenity distances)
"""

import os
import logging
from typing import Optional, Dict
from datetime import datetime, timedelta
import googlemaps

logger = logging.getLogger(__name__)

# Initialize Google Maps client
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

if not GOOGLE_MAPS_API_KEY:
    logger.warning("GOOGLE_MAPS_API_KEY not set - Maps API features will be disabled")
    gmaps = None
else:
    gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)
    logger.info("Initialized Google Maps API client")


def get_next_weekday_8am() -> datetime:
    """Get the next upcoming weekday at 8:00 AM for peak traffic simulation"""
    now = datetime.now()
    days_ahead = 0

    # Find next Monday-Friday
    while (now + timedelta(days=days_ahead)).weekday() >= 5:  # 5=Saturday, 6=Sunday
        days_ahead += 1

    if days_ahead == 0 and now.hour >= 8:
        days_ahead = 1  # If today but past 8am, use tomorrow

    target_date = now + timedelta(days=days_ahead)
    return target_date.replace(hour=8, minute=0, second=0, microsecond=0)


async def get_geocoding(property_address: str) -> Dict:
    """
    Get geocoding data for street classification.
    Extracts place_types, coordinates, and cul-de-sac detection.

    Args:
        property_address: Property address to geocode

    Returns:
        Dict with lat, lng, place_types, is_cul_de_sac, formatted_address
    """
    if not gmaps:
        logger.warning("Maps API not initialized - returning empty geocoding data")
        return {
            'lat': None,
            'lng': None,
            'place_types': [],
            'is_cul_de_sac': False,
            'formatted_address': property_address
        }

    try:
        geocode_result = gmaps.geocode(property_address)
        if not geocode_result:
            logger.warning(f"Could not geocode: {property_address}")
            return {
                'lat': None,
                'lng': None,
                'place_types': [],
                'is_cul_de_sac': False,
                'formatted_address': property_address
            }

        result = geocode_result[0]
        location = result['geometry']['location']
        place_types = result.get('types', [])
        address_components = result.get('address_components', [])

        # Check for cul-de-sac indicators in address
        is_cul_de_sac = any(
            'Ct' in comp.get('short_name', '') or
            'Court' in comp.get('long_name', '') or
            'Place' in comp.get('long_name', '')
            for comp in address_components if 'route' in comp.get('types', [])
        )

        logger.info(f"Geocoded {property_address}: types={place_types}, cul_de_sac={is_cul_de_sac}")

        return {
            'lat': location['lat'],
            'lng': location['lng'],
            'place_types': place_types,
            'is_cul_de_sac': is_cul_de_sac,
            'formatted_address': result.get('formatted_address', property_address)
        }
    except Exception as e:
        logger.error(f"Geocoding failed: {str(e)}", exc_info=True)
        return {
            'lat': None,
            'lng': None,
            'place_types': [],
            'is_cul_de_sac': False,
            'formatted_address': property_address
        }


async def get_commute_data(origin_address: str, destination_address: str) -> Optional[Dict]:
    """
    Get precise commute data using Routes API

    Args:
        origin_address: Property address
        destination_address: Work address

    Returns:
        Dict with drive_peak_mins, drive_offpeak_mins, distance_miles
        or None if API call fails
    """
    if not gmaps:
        logger.warning("Maps API not initialized - returning null commute data")
        return None

    try:
        logger.info(f"Calculating commute: {origin_address} → {destination_address}")

        # Get peak time (weekday 8am with traffic)
        peak_time = get_next_weekday_8am()
        peak_result = gmaps.directions(
            origin_address,
            destination_address,
            mode="driving",
            departure_time=peak_time,
            traffic_model="best_guess"
        )

        if not peak_result:
            logger.warning(f"No route found for {origin_address} → {destination_address}")
            return None

        # Extract peak data
        peak_duration_secs = peak_result[0]['legs'][0]['duration_in_traffic']['value']
        distance_meters = peak_result[0]['legs'][0]['distance']['value']
        drive_peak_mins = round(peak_duration_secs / 60)
        distance_miles = round(distance_meters / 1609.34, 1)  # meters to miles

        # Get static duration (no traffic baseline)
        static_duration_mins = None
        used_highway = False
        traffic_ratio = None

        try:
            static_result = gmaps.directions(
                origin_address,
                destination_address,
                mode="driving"
                # No departure_time = static baseline
            )

            if static_result and static_result[0]['legs']:
                static_duration_secs = static_result[0]['legs'][0]['duration']['value']
                static_duration_mins = round(static_duration_secs / 60)

                # Extract highway usage from route steps
                steps = static_result[0]['legs'][0].get('steps', [])
                used_highway = any(
                    'highway' in step.get('html_instructions', '').lower() or
                    'interstate' in step.get('html_instructions', '').lower() or
                    'freeway' in step.get('html_instructions', '').lower()
                    for step in steps
                )

                # Calculate traffic ratio
                if static_duration_mins is not None and drive_peak_mins is not None:
                    traffic_ratio = round(drive_peak_mins / static_duration_mins, 2)

        except Exception as e:
            logger.warning(f"Could not get static duration: {str(e)}")

        logger.info(f"Commute calculated: {drive_peak_mins} min peak, {static_duration_mins} min static, ratio={traffic_ratio}, highway={used_highway}, {distance_miles} mi")

        return {
            "drive_peak_mins": drive_peak_mins,
            "distance_miles": distance_miles,
            "traffic_analysis": {
                "static_duration_mins": static_duration_mins,
                "peak_duration_mins": drive_peak_mins,
                "traffic_ratio": traffic_ratio,
                "used_highway": used_highway
            }
        }

    except Exception as e:
        logger.error(f"Error calculating commute: {str(e)}", exc_info=True)
        return None


async def get_amenity_drive_times(geocoding_data: Dict) -> Dict:
    """
    Get drive times to nearest amenities using Places API + Routes API

    Args:
        geocoding_data: Dict with lat, lng from geocoding

    Returns:
        Dict with grocery_drive_mins, pharmacy_drive_mins
        (null for any that can't be found)
    """
    if not gmaps:
        logger.warning("Maps API not initialized - returning null amenity data")
        return {
            "grocery_drive_mins": None,
            "pharmacy_drive_mins": None
        }

    result = {
        "grocery_drive_mins": None,
        "pharmacy_drive_mins": None
    }

    try:
        # Use geocoding data passed from caller
        if not geocoding_data.get('lat') or not geocoding_data.get('lng'):
            logger.warning("No valid geocoding data available")
            return result

        location = {'lat': geocoding_data['lat'], 'lng': geocoding_data['lng']}

        # Find nearest grocery store
        try:
            grocery_places = gmaps.places_nearby(
                location=location,
                radius=3000,  # 3km radius
                type='supermarket'
            )

            if grocery_places['results']:
                grocery_location = grocery_places['results'][0]['geometry']['location']
                grocery_address = grocery_places['results'][0].get('vicinity', '')

                # Calculate drive time
                directions = gmaps.directions(
                    f"{location['lat']},{location['lng']}",
                    f"{grocery_location['lat']},{grocery_location['lng']}",
                    mode="driving"
                )

                if directions:
                    duration_secs = directions[0]['legs'][0]['duration']['value']
                    result["grocery_drive_mins"] = round(duration_secs / 60)
                    logger.info(f"Grocery: {result['grocery_drive_mins']} min drive to {grocery_address}")

        except Exception as e:
            logger.warning(f"Error finding grocery: {str(e)}")

        # Find nearest pharmacy
        try:
            pharmacy_places = gmaps.places_nearby(
                location=location,
                radius=3000,
                type='pharmacy'
            )

            if pharmacy_places['results']:
                pharmacy_location = pharmacy_places['results'][0]['geometry']['location']
                pharmacy_address = pharmacy_places['results'][0].get('vicinity', '')

                # Calculate drive time
                directions = gmaps.directions(
                    f"{location['lat']},{location['lng']}",
                    f"{pharmacy_location['lat']},{pharmacy_location['lng']}",
                    mode="driving"
                )

                if directions:
                    duration_secs = directions[0]['legs'][0]['duration']['value']
                    result["pharmacy_drive_mins"] = round(duration_secs / 60)
                    logger.info(f"Pharmacy: {result['pharmacy_drive_mins']} min drive to {pharmacy_address}")

        except Exception as e:
            logger.warning(f"Error finding pharmacy: {str(e)}")

        return result

    except Exception as e:
        logger.error(f"Error getting amenity drive times: {str(e)}", exc_info=True)
        return result
