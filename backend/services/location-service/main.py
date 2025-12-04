"""
Location Intelligence Service
FastAPI microservice for property location analysis using Gemini 2.5 Flash + Google Maps
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    LocationRequest,
    LocationAnalysis,
    LocationError,
    BuyerLocationPrefs
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
