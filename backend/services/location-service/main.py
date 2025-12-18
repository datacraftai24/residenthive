"""
Location Intelligence Service
FastAPI microservice for property location analysis using Gemini 2.5 Flash + Google Maps
"""

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    LocationRequest,
    LocationAnalysis,
    LocationError,
    BuyerLocationPrefs,
    HouseOrientation,
    FacingDirection,
    OrientationConfidence
)
from gemini_client import analyze_location_with_gemini
from maps_client import get_commute_data, get_amenity_drive_times, get_geocoding, gmaps
from scoring import enhance_analysis_with_scoring
from orientation_detector import detect_house_orientation, get_sun_exposure_summary
from cache import (
    connect as cache_connect,
    disconnect as cache_disconnect,
    get_cached_analysis,
    cache_analysis,
    get_cache_stats,
    clear_cache_for_address
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Debug logger for replay - structured JSON output
debug_logger = logging.getLogger("location_debug")
debug_logger.setLevel(logging.INFO)


def get_signal(signals: list, code: str) -> dict | None:
    """Helper to extract signal by code from signals list."""
    return next((s for s in signals if s.get("code") == code), None)


def generate_comparison_flags(
    signals: list,
    orientation_data: dict | None,
    geocoding_data: dict | None,
    commute_data: dict | None
) -> list:
    """
    Generate comparison flags from buyer signals vs detected property data.

    TRUST CONTRACT:
    - GREEN: High confidence AND verified by deterministic data
    - YELLOW: Uncertain inference OR partial evidence
    - RED: Explicit buyer "avoid" matched deterministically

    SPECIFIC RULES:
    - ORIENTATION: GREEN only if detection confidence=high AND matches want
    - COMMUTE: NEVER green (estimates vary) - always YELLOW
    - QUIET_STREET: GREEN only for cul-de-sac
    """
    flags = []

    # 1. ORIENTATION - GREEN only if detection=high AND matches want
    orientation_signal = get_signal(signals, "orientation")
    actual_orientation = orientation_data.get("facing_direction") if orientation_data else None
    detection_confidence = orientation_data.get("confidence", "low") if orientation_data else "low"

    if orientation_signal and actual_orientation and actual_orientation != "unknown":
        want = orientation_signal.get("want")
        avoid = orientation_signal.get("avoid")

        if avoid and actual_orientation.lower() == avoid.lower():
            # RED: matches explicit avoid
            flags.append({
                "level": "red",
                "code": "ORIENTATION_AVOID",
                "message": f"House faces {actual_orientation} (you wanted to avoid this)",
                "category": "orientation",
                "evidence": f"Detected via street geometry",
                "confidence_band": detection_confidence
            })
        elif want and actual_orientation.lower() == want.lower():
            # GREEN only if detection confidence=high
            level = "green" if detection_confidence == "high" else "yellow"
            flags.append({
                "level": level,
                "code": "ORIENTATION_MATCH" if level == "green" else "ORIENTATION_ESTIMATED",
                "message": f"House faces {actual_orientation} as preferred" if level == "green"
                           else f"Estimated: faces {actual_orientation} (matches preference)",
                "category": "orientation",
                "evidence": f"Detected via street geometry (confidence: {detection_confidence})",
                "confidence_band": detection_confidence
            })
        elif want:
            # YELLOW: doesn't match preference
            flags.append({
                "level": "yellow",
                "code": "ORIENTATION_DIFFERENT",
                "message": f"House faces {actual_orientation} (you preferred {want})",
                "category": "orientation",
                "evidence": f"Detected via street geometry",
                "confidence_band": detection_confidence
            })

    # 2. QUIET STREET - GREEN only for cul-de-sac, everything else YELLOW
    quiet_signal = get_signal(signals, "quiet_street")
    if quiet_signal and geocoding_data:
        is_cul_de_sac = geocoding_data.get("is_cul_de_sac", False)

        if is_cul_de_sac:
            # GREEN: cul-de-sac is deterministic
            flags.append({
                "level": "green",
                "code": "QUIET_CUL_DE_SAC",
                "message": "Cul-de-sac location (typically quiet)",
                "category": "noise",
                "evidence": "Address indicates cul-de-sac (Court/Place)",
                "confidence_band": "high"
            })
        else:
            # YELLOW: residential != quiet
            flags.append({
                "level": "yellow",
                "code": "RESIDENTIAL_STREET",
                "message": "Residential street (quietness not guaranteed)",
                "category": "noise",
                "evidence": f"Road class from geocoding",
                "confidence_band": "medium"
            })

    # 3. COMMUTE - ALWAYS YELLOW (estimates vary)
    commute_signal = get_signal(signals, "commute")
    if commute_signal and commute_data:
        peak_mins = commute_data.get("drive_peak_mins")
        traffic_analysis = commute_data.get("traffic_analysis", {})
        static_mins = traffic_analysis.get("static_duration_mins")
        max_mins = commute_signal.get("max_mins", 30)
        work_text = commute_signal.get("work_text", "work")

        if peak_mins:
            # Build range string if we have both
            if static_mins and static_mins != peak_mins:
                range_str = f"{min(static_mins, peak_mins)}-{max(static_mins, peak_mins)}"
            else:
                range_str = f"~{peak_mins}"

            # ALWAYS YELLOW - commute estimates vary
            code = "COMMUTE_OK" if peak_mins <= max_mins else "COMMUTE_LONG"
            message = (f"{range_str} min to {work_text} (within {max_mins} max)"
                      if peak_mins <= max_mins
                      else f"{range_str} min to {work_text} (over {max_mins} max)")

            flags.append({
                "level": "yellow",  # NEVER green for commute
                "code": code,
                "message": message,
                "category": "commute",
                "evidence": "Google Maps 8am weekday estimate",
                "confidence_band": "medium"
            })

    # 4. HAS_KIDS - informational flag based on nearby amenities
    kids_signal = get_signal(signals, "has_kids")
    if kids_signal:
        # Just note the preference, don't make claims about schools
        flags.append({
            "level": "yellow",
            "code": "FAMILY_PRIORITY",
            "message": "Family with children - check school districts",
            "category": "family",
            "evidence": f"Buyer indicated: {kids_signal.get('evidence', ['family'])[0] if kids_signal.get('evidence') else 'family preference'}",
            "confidence_band": "high"
        })

    return flags


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events"""
    # Startup
    logger.info("Starting Location Intelligence Service...")
    await cache_connect()
    yield
    # Shutdown
    logger.info("Shutting down Location Intelligence Service...")
    await cache_disconnect()


# Initialize FastAPI app
app = FastAPI(
    title="Location Intelligence Service",
    description="Property location analysis using Gemini 2.5 Flash + Google Maps",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "location-intelligence",
        "status": "healthy",
        "version": "1.0.0",
        "model": "gemini-2.5-flash"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    cache_stats = await get_cache_stats()

    return {
        "status": "healthy",
        "cache": cache_stats
    }


@app.post("/analyze")
async def analyze_location(request: LocationRequest):
    """
    Analyze property location using hybrid approach (Maps APIs + Gemini + Scoring)

    Args:
        request: LocationRequest with address and optional buyer preferences

    Returns:
        Enhanced analysis with location_summary, location_match_score, location_flags

    Raises:
        HTTPException: If analysis fails
    """

    try:
        logger.info(f"Received analysis request for: {request.address}")

        # Check cache first
        cached_result = await get_cached_analysis(request.address)
        if cached_result:
            logger.info(f"Returning cached result for: {request.address}")
            return cached_result

        # Cache miss - start hybrid analysis
        logger.info(f"Cache miss - starting hybrid analysis: {request.address}")

        # Step 1: Get hard data from Maps APIs
        hard_data = {}

        # Get geocoding ONCE up front (for street classification)
        logger.info(f"Geocoding property address...")
        geocoding_data = await get_geocoding(request.address)
        logger.info(f"Got geocoding data: types={geocoding_data.get('place_types')}, cul_de_sac={geocoding_data.get('is_cul_de_sac')}")

        # Get commute data if work_address is provided
        if request.buyer_prefs and request.buyer_prefs.work_address:
            logger.info(f"Fetching commute data via Maps API...")
            commute_data = await get_commute_data(
                origin_address=request.address,
                destination_address=request.buyer_prefs.work_address
            )
            if commute_data:
                hard_data['commute'] = {
                    'work_address': request.buyer_prefs.work_address,
                    **commute_data
                }
                logger.info(f"Got commute data: {commute_data}")
                # Add traffic analysis separately for Gemini
                hard_data['traffic_analysis'] = commute_data.get('traffic_analysis', {})

        # Get amenity drive times (using geocoding data)
        logger.info(f"Fetching amenity data via Maps API...")
        amenity_data = await get_amenity_drive_times(geocoding_data)
        if amenity_data:
            hard_data['amenities'] = amenity_data
            logger.info(f"Got amenity data: {amenity_data}")

        # Add geocoding data for street context interpretation
        hard_data['geocoding'] = geocoding_data

        # Step 1b: Detect house orientation using street geometry
        orientation_data = None
        if geocoding_data.get('lat') and geocoding_data.get('lng'):
            logger.info(f"Detecting house orientation...")
            try:
                orientation_result = await detect_house_orientation(
                    gmaps_client=gmaps,
                    property_lat=geocoding_data['lat'],
                    property_lng=geocoding_data['lng'],
                    is_cul_de_sac=geocoding_data.get('is_cul_de_sac', False)
                )

                if orientation_result.get('facing_direction') != 'unknown':
                    # Get sun exposure summary
                    sun_summary = await get_sun_exposure_summary(
                        orientation_result.get('facing_direction', 'unknown')
                    )
                    orientation_result['sun_exposure_summary'] = sun_summary
                    orientation_data = orientation_result
                    hard_data['orientation'] = orientation_data
                    logger.info(f"Orientation detected: {orientation_result}")
                else:
                    logger.info("Could not determine house orientation")
            except Exception as e:
                logger.warning(f"Orientation detection failed: {e}")

        # Step 2: Pass hard data to Gemini for contextual analysis
        logger.info(f"Analyzing with Gemini (with hard data)...")
        analysis = await analyze_location_with_gemini(
            address=request.address,
            buyer_prefs=request.buyer_prefs,
            hard_data=hard_data if hard_data else None,
            timeout=10.0
        )

        if not analysis:
            logger.error(f"Gemini analysis failed for: {request.address}")
            raise HTTPException(
                status_code=500,
                detail={
                    "address": request.address,
                    "error": "LOCATION_UNAVAILABLE",
                    "message": "Failed to analyze location. Please try again later."
                }
            )

        # Step 3: Enhance with scoring and flags (if buyer_prefs provided)
        if request.buyer_prefs:
            logger.info(f"Calculating match score and flags...")
            enhanced_result = enhance_analysis_with_scoring(analysis, request.buyer_prefs)
        else:
            # No buyer prefs - just return structured data without scoring
            enhanced_result = {
                "location_summary": analysis.model_dump(mode="json"),
                "location_match_score": None,
                "location_flags": []
            }

        # Step 4: Add orientation data to the response (from Maps API, not Gemini)
        if orientation_data:
            orientation_model = HouseOrientation(
                facing_direction=FacingDirection(orientation_data.get('facing_direction', 'unknown')),
                confidence=OrientationConfidence(orientation_data.get('confidence', 'low')),
                street_bearing=orientation_data.get('street_bearing'),
                street_approach_from=orientation_data.get('street_approach_from'),
                sun_exposure_summary=orientation_data.get('sun_exposure_summary'),
                method=orientation_data.get('method', 'street_geometry')
            )
            # Add to location_summary
            if 'location_summary' in enhanced_result:
                enhanced_result['location_summary']['orientation'] = orientation_model.model_dump(mode="json")
            else:
                enhanced_result['orientation'] = orientation_model.model_dump(mode="json")

        # Step 5: Generate comparison flags from signals (trust contract enforced)
        if request.buyer_prefs and request.buyer_prefs.signals:
            comparison_flags = generate_comparison_flags(
                signals=request.buyer_prefs.signals,
                orientation_data=orientation_data,
                geocoding_data=geocoding_data,
                commute_data=hard_data.get('commute')
            )
            # Merge with existing flags
            existing_flags = enhanced_result.get('location_flags', [])
            enhanced_result['location_flags'] = existing_flags + comparison_flags
            logger.info(f"Added {len(comparison_flags)} comparison flags")

        # Cache the enhanced result
        await cache_analysis(request.address, enhanced_result)

        logger.info(f"Successfully analyzed location: {request.address}")
        if enhanced_result.get('location_match_score'):
            logger.info(f"Match score: {enhanced_result['location_match_score']}/100")

        # Debug logging for replay - structured JSON for debugging agent feedback
        debug_logger.info(json.dumps({
            "event": "location_analysis_complete",
            "address": request.address,
            "profile_id": request.buyer_prefs.profile_id if request.buyer_prefs else None,
            "signals_input": [s for s in (request.buyer_prefs.signals or [])] if request.buyer_prefs and request.buyer_prefs.signals else [],
            "flags_output": enhanced_result.get("location_flags", []),
            "orientation_detected": {
                "facing_direction": orientation_data.get("facing_direction") if orientation_data else None,
                "confidence": orientation_data.get("confidence") if orientation_data else None,
                "method": orientation_data.get("method") if orientation_data else None
            } if orientation_data else None,
            "geocoding": {
                "is_cul_de_sac": geocoding_data.get("is_cul_de_sac") if geocoding_data else None,
                "place_types": geocoding_data.get("place_types") if geocoding_data else None
            } if geocoding_data else None,
            "commute": {
                "drive_peak_mins": hard_data.get("commute", {}).get("drive_peak_mins"),
                "work_address": hard_data.get("commute", {}).get("work_address")
            } if hard_data.get("commute") else None,
            "service_version": "1.1.0",
            "timestamp": datetime.utcnow().isoformat()
        }))

        return enhanced_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error analyzing location: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "address": request.address,
                "error": "INTERNAL_ERROR",
                "message": str(e)
            }
        )


@app.delete("/cache/{address}")
async def clear_cache(address: str):
    """
    Clear cached analysis for a specific address

    Args:
        address: Property address to clear from cache

    Returns:
        Success status
    """

    try:
        success = await clear_cache_for_address(address)

        return {
            "success": success,
            "address": address,
            "message": "Cache cleared" if success else "No cache entry found"
        }

    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cache/stats")
async def cache_statistics():
    """
    Get cache statistics

    Returns:
        Cache stats including hit rate
    """

    try:
        stats = await get_cache_stats()
        return stats

    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
        log_level="info"
    )
