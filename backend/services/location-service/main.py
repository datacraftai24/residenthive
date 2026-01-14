"""
Location Intelligence Service
FastAPI microservice for property location analysis using Gemini 2.5 Flash + Google Maps
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from typing import Optional, Dict, Any
from models import (
    LocationRequest,
    LocationAnalysis,
    LocationError,
    BuyerLocationPrefs,
    # Fast mode models
    CommuteAnalysis,
    StreetContext,
    AmenitiesProximity,
    WalkabilityScore,
    FamilyIndicators,
    LocationFlag,
    AnalysisMetadata,
    StreetType,
    TrafficLevel,
    NoiseRisk,
    RouteType,
    FlagLevel,
    FlagCategory
)
from gemini_client import analyze_location_with_gemini
from maps_client import get_commute_data, get_amenity_drive_times, get_geocoding
from scoring import enhance_analysis_with_scoring
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


def _build_fast_mode_analysis(
    address: str,
    hard_data: Dict[str, Any],
    buyer_prefs: Optional[BuyerLocationPrefs]
) -> LocationAnalysis:
    """
    Build LocationAnalysis from Maps API hard data only (no Gemini).

    Used for batch operations like buyer report generation where speed matters
    more than detailed analysis. Provides:
    - Commute times (peak/off-peak)
    - Basic street context (derived from traffic ratio)
    - Amenity distances (grocery, pharmacy)
    - Simple flags (commute over max, high traffic)

    Does NOT provide (requires Gemini):
    - Walkability scoring
    - Family indicators (playground/park counts)
    - Detailed noise risk analysis
    """
    # Extract commute data
    commute = None
    commute_data = hard_data.get('commute', {})
    if commute_data:
        route_type = None
        if hard_data.get('traffic_analysis', {}).get('used_highway'):
            route_type = RouteType.HIGHWAY_MAJORITY
        commute = CommuteAnalysis(
            work_address=commute_data.get('work_address'),
            drive_peak_mins=commute_data.get('drive_peak_mins'),
            drive_offpeak_mins=commute_data.get('drive_offpeak_mins'),
            distance_miles=commute_data.get('distance_miles'),
            route_type=route_type
        )

    # Determine traffic level from traffic_ratio
    # traffic_ratio = peak_duration / static_duration
    # >= 1.4 means 40%+ slower in traffic = high traffic area
    traffic_analysis = hard_data.get('traffic_analysis', {})
    traffic_ratio = traffic_analysis.get('traffic_ratio')
    traffic_level = TrafficLevel.MODERATE  # default
    noise_risk = NoiseRisk.MODERATE  # default

    if traffic_ratio:
        if traffic_ratio >= 1.4:
            traffic_level = TrafficLevel.HIGH
            noise_risk = NoiseRisk.HIGH
        elif traffic_ratio < 1.15:
            traffic_level = TrafficLevel.LOW
            noise_risk = NoiseRisk.LOW

    # Determine street type from geocoding data
    geocoding = hard_data.get('geocoding', {})
    is_cul_de_sac = geocoding.get('is_cul_de_sac', False)
    street_type = StreetType.RESIDENTIAL_SIDE_STREET  # default

    if traffic_analysis.get('used_highway'):
        street_type = StreetType.HIGHWAY_ADJACENT

    street_context = StreetContext(
        street_type=street_type,
        traffic_level=traffic_level,
        near_major_road_meters=None,  # Requires additional API call
        noise_risk=noise_risk,
        is_cul_de_sac=is_cul_de_sac
    )

    # Extract amenity data from Maps API
    amenity_data = hard_data.get('amenities', {})
    amenities = AmenitiesProximity(
        grocery_drive_mins=amenity_data.get('grocery_drive_mins'),
        pharmacy_drive_mins=amenity_data.get('pharmacy_drive_mins'),
        cafes_drive_mins=None,  # Not fetched in fast mode
        primary_school_drive_mins=None,
        train_station_drive_mins=None
    )

    # Walkability requires Gemini - set to null in fast mode
    walkability = WalkabilityScore(
        sidewalks_present=None,
        closest_park_walk_mins=None,
        closest_playground_walk_mins=None,
        overall_walkability_label=None,
        walk_score_estimate=None
    )

    # Family indicators require Gemini POI counting - set to 0 in fast mode
    family_indicators = FamilyIndicators(
        nearby_playgrounds_count=0,
        nearby_parks_count=0,
        nearby_schools_count=0
    )

    # Build flags based on hard data
    flags = []

    # Commute flags
    if buyer_prefs and commute and commute.drive_peak_mins:
        max_commute = buyer_prefs.max_commute_mins
        peak_mins = commute.drive_peak_mins

        if peak_mins > max_commute + 10:
            flags.append(LocationFlag(
                level=FlagLevel.RED,
                code="COMMUTE_OVER_MAX",
                message=f"Peak commute ({peak_mins} min) exceeds your max ({max_commute} min) by {peak_mins - max_commute} min",
                category=FlagCategory.COMMUTE
            ))
        elif peak_mins > max_commute:
            flags.append(LocationFlag(
                level=FlagLevel.YELLOW,
                code="COMMUTE_SLIGHTLY_OVER_MAX",
                message=f"Peak commute ({peak_mins} min) is {peak_mins - max_commute} min over your {max_commute} min max",
                category=FlagCategory.COMMUTE
            ))
        else:
            flags.append(LocationFlag(
                level=FlagLevel.GREEN,
                code="COMMUTE_WITHIN_MAX",
                message=f"Peak commute ({peak_mins} min) is within your {max_commute} min limit",
                category=FlagCategory.COMMUTE
            ))

    # Traffic/noise flags
    if traffic_level == TrafficLevel.HIGH:
        flags.append(LocationFlag(
            level=FlagLevel.YELLOW,
            code="HIGH_TRAFFIC_AREA",
            message="Area shows high traffic congestion patterns",
            category=FlagCategory.NOISE
        ))

    # Cul-de-sac flag (positive)
    if is_cul_de_sac:
        flags.append(LocationFlag(
            level=FlagLevel.GREEN,
            code="QUIET_CUL_DE_SAC",
            message="Cul-de-sac location - quiet with minimal through traffic",
            category=FlagCategory.NOISE
        ))

    return LocationAnalysis(
        address=address,
        commute=commute,
        street_context=street_context,
        amenities=amenities,
        walkability=walkability,
        family_indicators=family_indicators,
        flags=flags,
        metadata=AnalysisMetadata(
            cache_hit=False,
            gemini_model="fast_mode_maps_only"
        )
    )


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

        # Step 2: Build analysis (fast mode vs full Gemini mode)
        if request.fast_mode:
            # Fast mode: Skip Gemini LLM, use only Maps API data
            # ~3s per property vs ~20s with Gemini
            logger.info(f"FAST MODE: Building analysis from Maps API data only")
            analysis = _build_fast_mode_analysis(
                address=request.address,
                hard_data=hard_data,
                buyer_prefs=request.buyer_prefs
            )
        else:
            # Full mode: Pass hard data to Gemini for contextual analysis
            logger.info(f"FULL MODE: Analyzing with Gemini (with hard data)...")
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

        # Cache the enhanced result
        await cache_analysis(request.address, enhanced_result)

        logger.info(f"Successfully analyzed location: {request.address}")
        if enhanced_result.get('location_match_score'):
            logger.info(f"Match score: {enhanced_result['location_match_score']}/100")

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
