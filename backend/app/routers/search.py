from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import os
import uuid
import httpx

from ..services.search_context_store import (
    generate_search_id,
    store_search_context,
    get_search_context,
    mark_vision_complete,
    store_photo_analysis_results,
    get_photo_analysis_results,
    mark_location_complete,
    store_location_analysis_results,
    get_location_analysis_results
)
from ..services.photo_analyzer import analyze_property_photos
from ..services.property_analyzer import _generate_agent_take
from ..db import get_conn, fetchone_dict
from ..auth import get_current_agent_id
import json


router = APIRouter(prefix="/api")


# Search persistence TTL - searches older than this are considered expired
SEARCH_PERSISTENCE_HOURS = 4
logger = logging.getLogger(__name__)


class AgentSearchRequest(BaseModel):
    profileId: int
    useReactive: Optional[bool] = False
    forceEnhanced: Optional[bool] = False


def _map_to_agent_listing(search_results: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert listing search results to agent dashboard format.

    Uses new AI v2 schema with ai_analysis field containing:
    - headline, summary_for_buyer, whats_matching, whats_missing, red_flags
    """
    return [
        {
            "mlsNumber": x["listing"].get("mls_number") or x["listing"].get("id"),
            "address": x["listing"].get("address"),
            "city": x["listing"].get("city"),
            "state": x["listing"].get("state"),
            "zip": x["listing"].get("zip_code"),
            "listPrice": x["listing"].get("price"),
            "bedrooms": x["listing"].get("bedrooms"),
            "bathrooms": x["listing"].get("bathrooms"),
            "sqft": x["listing"].get("square_feet"),
            "propertyType": x["listing"].get("property_type"),
            "status": x["listing"].get("status"),
            "images": x["listing"].get("images", []),
            "photoCount": len(x["listing"].get("images", [])),
            "description": x["listing"].get("description"),
            "yearBuilt": x["listing"].get("year_built"),
            "lotSize": x["listing"].get("lot_size"),
            "daysOnMarket": x["listing"].get("days_on_market"),
            "matchLabel": x.get("label", "Match"),
            # NEW: AI v2 analysis object (None for non-Top-20)
            "aiAnalysis": x.get("ai_analysis"),
            # Market intelligence metrics for Market Overview
            "pricePerSqft": x.get("pricePerSqft") or x.get("price_per_sqft") or x["listing"].get("pricePerSqft") or x["listing"].get("price_per_sqft"),
            "statusIndicators": x.get("status_indicators", []),
            "filterReasons": x.get("filter_reasons", []),  # For rejected properties
            # Price history fields for market recommendations
            "originalPrice": x.get("originalPrice") or x.get("original_price"),
            "priceCutsCount": x.get("priceCutsCount") or x.get("price_cuts_count", 0),
            "totalPriceReduction": x.get("totalPriceReduction") or x.get("total_price_reduction", 0),
            "lastPriceChangeDate": x.get("lastPriceChangeDate") or x.get("last_price_change_date"),
            "priceTrendDirection": x.get("priceTrendDirection") or x.get("price_trend_direction"),
            "lotAcres": x.get("lotAcres") or x.get("lot_acres"),
            "specialFlags": x.get("specialFlags") or x.get("special_flags", []),
            # Buyer ranking fields
            "fitScore": x.get("fitScore"),
            "fitChips": x.get("fitChips", []),
            "priorityTag": x.get("priorityTag"),
            "belowMarketPct": x.get("belowMarketPct"),
            "statusLines": x.get("statusLines", []),
            "marketStrengthScore": x.get("marketStrengthScore"),
            "finalScore": x.get("finalScore"),
            "rank": x.get("rank"),
            "isTop20": x.get("isTop20", False),
        }
        for x in (search_results.get("top_picks", []) + search_results.get("other_matches", []))
    ]


@router.post("/agent-search")
def agent_search(req: AgentSearchRequest, agent_id: int = Depends(get_current_agent_id)):
    # Reuse /api/listings/search to obtain normalized and scored listings
    from .listings import listings_search, _load_profile
    base = listings_search({"profileId": req.profileId, "profile": {}})

    # Market Overview: Show ALL scored properties (not just top 20)
    all_listings = _map_to_agent_listing({"top_picks": base.get("all_scored_matches", []), "other_matches": []})

    # Rejected properties: Map rejected properties for Market Overview
    rejected_listings = _map_to_agent_listing({"top_picks": base.get("rejected_matches", []), "other_matches": []})

    # AI Recommendations: Show only top 20 with AI analysis
    ai_listings = _map_to_agent_listing(base)

    # Generate searchId and store context for photo analysis
    search_id = generate_search_id()

    # Load full profile for visionChecklist access
    profile = _load_profile(req.profileId)

    # Build ranked_listings for photo analyzer (with ranking context attached)
    # These are the Top 20 listings with all scoring fields
    ranked_listings_for_photos = []
    for item in (base.get("top_picks", []) + base.get("other_matches", [])):
        listing = item.get("listing", {})
        ranked_listings_for_photos.append({
            **listing,
            "fit_score": item.get("fitScore"),
            "priority_tag": item.get("priorityTag"),
            "final_score": item.get("finalScore"),
            "rank": item.get("rank"),
            "is_top20": item.get("isTop20", False),
        })

    # Store search context for later photo analysis AND buyer report (Redis optional)
    try:
        store_search_context(search_id, profile, ai_listings)  # Store mapped listings with aiAnalysis
        top20_count = sum(1 for l in ai_listings if l.get("isTop20"))
        print(f"[AGENT SEARCH] Stored context for searchId={search_id}, {len(ai_listings)} listings, {top20_count} with isTop20=True")
    except Exception as e:
        print(f"[AGENT SEARCH] Warning: Failed to cache search context in Redis: {e}")
        print(f"[AGENT SEARCH] Continuing without cache (data persisted to database)")

    view1 = {
        "viewType": "broad",
        "searchCriteria": {"budgetRange": "", "bedrooms": "", "location": "", "propertyType": ""},
        "totalFound": len(all_listings),  # Total ALL scored properties
        "listings": all_listings,  # ALL properties for Market Overview
        "rejectedListings": rejected_listings,  # Filtered out properties with dealbreaker reasons
        "executionTime": 0,
    }
    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": view1["searchCriteria"],
        "totalFound": len(ai_listings),  # Only analyzed properties
        "listings": ai_listings,  # Top 20 with AI for Recommendations
        "executionTime": 0,
        "aiAnalysis": {"topMatches": len([x for x in ai_listings if (x.get('fitScore') or 0) >= 80]), "visualAnalysis": False, "scoringFactors": ["budget","beds","location"]},
    }
    response = {
        "searchType": "agent_dual_view" if not req.useReactive else "agent_dual_view_reactive",
        "profileData": {"id": req.profileId, "name": "Client", "location": ""},
        "initialSearch": {"view1": view1, "view2": view2, "totalFound": len(all_listings), "sufficientResults": True},
        "totalExecutionTime": 0,
        "timestamp": datetime.utcnow().isoformat(),
        "searchId": search_id,  # For photo analysis endpoint
        "analysisStatus": {
            "text_complete": True,
            "vision_complete_for_top5": False
        }
    }
    if req.useReactive and req.forceEnhanced:
        response["enhancedSearch"] = {"triggered": True, "reason": "Requested enhanced search", "view1": view1, "adjustments": [], "adjustmentSummary": "", "clientSummary": ""}

    # Persist search to database for resume functionality
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE buyer_profiles
                    SET last_search_id = %s,
                        last_search_at = NOW(),
                        last_search_data = %s
                    WHERE id = %s
                """, (search_id, json.dumps(response), req.profileId))
        logger.info(f"[AGENT SEARCH] Persisted search to profile {req.profileId}, searchId={search_id}")
    except Exception as e:
        logger.warning(f"[AGENT SEARCH] Failed to persist search to database: {e}")
        # Non-blocking - search still works, just won't be resumable

    return response


@router.post("/agent-search/enhanced-only")
def agent_search_enhanced_only(req: AgentSearchRequest):
    from .listings import listings_search
    base = listings_search({"profileId": req.profileId, "profile": {}})

    # AI Recommendations: Show only top 20 with AI analysis
    ai_listings = _map_to_agent_listing(base)

    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": {"budgetRange": "", "bedrooms": "", "location": "", "propertyType": ""},
        "totalFound": len(ai_listings),
        "listings": ai_listings,
        "executionTime": 0,
        "aiAnalysis": {"topMatches": len([x for x in ai_listings if (x.get('fitScore') or 0) >= 80]), "visualAnalysis": False, "scoringFactors": ["budget","beds","location"]},
    }
    return {"searchType": "agent_dual_view", "view2": view2, "totalExecutionTime": 0, "timestamp": datetime.utcnow().isoformat()}


@router.get("/agent-search/photos")
def agent_search_photos(searchId: str = Query(..., description="Search ID from agent-search response")):
    """
    Run GPT-4o Vision photo analysis on Top 5 listings.

    Requires searchId from the main /agent-search response.
    Analyzes listing photos against buyer's visionChecklist.

    Returns:
        {
            "searchId": str,
            "photo_analysis": {
                "<mlsNumber>": {
                    "photo_headline": str,
                    "photo_summary": str,
                    "photo_matches": [...],
                    "photo_red_flags": [...]
                },
                ...
            }
        }
    """
    logger.info(f"[PHOTO ANALYSIS] Request received for searchId={searchId}")

    # Check if photo analysis results are already cached
    cached_results = get_photo_analysis_results(searchId)
    if cached_results is not None:
        print(f"[PHOTO ANALYSIS] Returning cached results for searchId={searchId} ({len(cached_results)} properties)")
        return {
            "searchId": searchId,
            "photo_analysis": cached_results
        }

    # Retrieve cached search context
    context = get_search_context(searchId)
    if not context:
        raise HTTPException(
            status_code=404,
            detail=f"Search context not found or expired for searchId={searchId}"
        )

    profile = context["profile"]
    ranked_listings = context["ranked_listings"]

    # Check if profile has visionChecklist
    vision_checklist = profile.get("visionChecklist") or []
    if not vision_checklist:
        print(f"[PHOTO ANALYSIS] No visionChecklist in profile for searchId={searchId}")
        return {
            "searchId": searchId,
            "photo_analysis": {},
            "error": "Buyer profile does not have a visionChecklist defined"
        }

    # Filter to Top 5 by finalScore from isTop20=True listings
    top20_listings = [r for r in ranked_listings if r.get("isTop20")]
    # Sort by finalScore descending and take top 5
    top20_listings.sort(key=lambda x: x.get("finalScore") or 0, reverse=True)
    top5_listings = top20_listings[:5]

    print(f"[PHOTO ANALYSIS] Analyzing {len(top5_listings)} Top 5 listings for searchId={searchId}")

    # Run photo analysis for each Top 5 listing
    photo_analysis = {}
    for listing in top5_listings:
        mls_number = listing.get("mls_number") or listing.get("mlsNumber") or listing.get("id")
        if not mls_number:
            continue

        # Build ranking context for photo analyzer
        ranking_context = {
            "fit_score": listing.get("fitScore"),
            "priority_tag": listing.get("priorityTag"),
            "final_score": listing.get("finalScore"),
            "rank": listing.get("rank"),
        }

        # Call photo analyzer
        photo_result = analyze_property_photos(profile, listing, ranking_context)

        # Merge photo results with existing text analysis to generate complete "My Take"
        # Get text analysis from listing's aiAnalysis field
        text_analysis = listing.get("aiAnalysis") or {}

        # Merge text + photo matches and concerns
        merged_analysis = {
            "whats_matching": text_analysis.get("whats_matching", []),
            "whats_missing": text_analysis.get("whats_missing", []),
            "red_flags": text_analysis.get("red_flags", []),
            "photo_matches": photo_result.get("photo_matches", []),
            "photo_red_flags": photo_result.get("photo_red_flags", []),
        }

        # Generate "My Take" with complete text + photo context
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            model = os.environ.get("OPENAI_MODEL", "gpt-4o")

            agent_take = _generate_agent_take(
                client, model, profile, listing, ranking_context, merged_analysis
            )
            photo_result["agent_take_ai"] = agent_take
            photo_result["vision_complete"] = True
            print(f"[PHOTO ANALYSIS] Generated My Take for {mls_number}: '{agent_take[:50]}...'")
        except Exception as e:
            print(f"[PHOTO ANALYSIS] Error generating My Take for {mls_number}: {e}")
            # Still set vision_complete but with text-only My Take if it exists
            photo_result["agent_take_ai"] = text_analysis.get("agent_take_ai")
            photo_result["vision_complete"] = False

        photo_analysis[mls_number] = photo_result

        print(f"[PHOTO ANALYSIS] Completed for {mls_number}: headline='{photo_result.get('photo_headline', '')[:50]}...'")

    # Store results in cache to prevent re-running on subsequent polls
    store_photo_analysis_results(searchId, photo_analysis)
    print(f"[PHOTO ANALYSIS] Cached results for searchId={searchId}")

    # Mark vision analysis as complete
    mark_vision_complete(searchId)
    print(f"[PHOTO ANALYSIS] Marked vision complete for searchId={searchId}")

    return {
        "searchId": searchId,
        "photo_analysis": photo_analysis
    }


@router.get("/agent-search/location")
async def agent_search_location(searchId: str = Query(..., description="Search ID from agent-search response")):
    """
    Run location intelligence analysis on Top 5 listings using Gemini 2.5 Flash + Google Maps.

    Requires searchId from the main /agent-search response.
    Analyzes property locations against buyer's location preferences.

    Returns:
        {
            "searchId": str,
            "location_analysis": {
                "<mlsNumber>": {
                    "location_match_score": int (0-100),
                    "location_flags": [...],
                    "location_summary": {...}
                },
                ...
            }
        }
    """
    # Check if location analysis results are already cached
    cached_results = get_location_analysis_results(searchId)
    if cached_results is not None:
        print(f"[LOCATION ANALYSIS] Returning cached results for searchId={searchId} ({len(cached_results)} properties)")
        return {
            "searchId": searchId,
            "location_analysis": cached_results
        }

    # Retrieve cached search context
    context = get_search_context(searchId)
    if not context:
        raise HTTPException(
            status_code=404,
            detail=f"Search context not found or expired for searchId={searchId}"
        )

    profile = context["profile"]
    ranked_listings = context["ranked_listings"]

    # Build buyer location preferences from profile (optional - location service can work without it)
    buyer_prefs = None
    work_address = profile.get("work_address")
    if work_address:
        buyer_prefs = {
            "work_address": work_address,
            "max_commute_mins": profile.get("max_commute_mins", 30),
            "prioritize_quiet_street": profile.get("prioritize_quiet_street", False),
            "prioritize_walkability": profile.get("prioritize_walkability", False),
            "has_kids": profile.get("has_kids", False)
        }
        print(f"[LOCATION ANALYSIS] Using buyer preferences with work_address: {work_address}")
    else:
        print(f"[LOCATION ANALYSIS] No work_address in profile - will provide general location intelligence")

    # Filter to Top 5 by finalScore from isTop20=True listings
    top20_listings = [r for r in ranked_listings if r.get("isTop20")]
    # Sort by finalScore descending and take top 5
    top20_listings.sort(key=lambda x: x.get("finalScore") or 0, reverse=True)
    top5_listings = top20_listings[:5]

    print(f"[LOCATION ANALYSIS] Analyzing {len(top5_listings)} Top 5 listings for searchId={searchId}")

    # Location service URL (from env or default to localhost)
    location_service_url = os.environ.get("LOCATION_SERVICE_URL", "http://localhost:8002")

    # Run location analysis for each Top 5 listing
    location_analysis = {}
    async with httpx.AsyncClient(timeout=90.0) as client:  # Increased for Google Maps + Gemini API calls
        for listing in top5_listings:
            mls_number = listing.get("mls_number") or listing.get("mlsNumber") or listing.get("id")
            if not mls_number:
                continue

            # Build full address
            address_parts = [
                listing.get("address", ""),  # Full street address (e.g., "123 Main St")
                listing.get("city", ""),
                listing.get("state", ""),
                listing.get("zip_code", "")
            ]
            full_address = " ".join(str(p) for p in address_parts if p).strip()

            if not full_address:
                print(f"[LOCATION ANALYSIS] Missing address for {mls_number}, skipping")
                continue

            print(f"[LOCATION ANALYSIS] Analyzing {mls_number}: {full_address}")

            # Call location service
            try:
                response = await client.post(
                    f"{location_service_url}/analyze",
                    json={
                        "address": full_address,
                        "buyer_prefs": buyer_prefs
                    }
                )
                response.raise_for_status()
                location_result = response.json()

                # Flatten flags from location_summary.flags to top-level location_flags
                if location_result.get("location_summary", {}).get("flags"):
                    location_result["location_flags"] = location_result["location_summary"]["flags"]
                else:
                    location_result["location_flags"] = []

                location_analysis[mls_number] = location_result

                # Log match score if available
                if location_result.get("location_match_score"):
                    print(f"[LOCATION ANALYSIS] {mls_number} match score: {location_result['location_match_score']}/100")

            except Exception as e:
                logger.error(f"Error analyzing location for {mls_number}: {e}", exc_info=True)
                location_analysis[mls_number] = {
                    "error": str(e),
                    "location_match_score": None,
                    "location_flags": [],
                    "location_summary": None
                }

    # Store results in cache to prevent re-running on subsequent polls
    store_location_analysis_results(searchId, location_analysis)
    print(f"[LOCATION ANALYSIS] Cached results for searchId={searchId}")

    # Mark location analysis as complete
    mark_location_complete(searchId)
    print(f"[LOCATION ANALYSIS] Marked location complete for searchId={searchId}")

    return {
        "searchId": searchId,
        "location_analysis": location_analysis
    }


# NOTE: This route MUST be defined AFTER /photos and /location routes
# because FastAPI matches routes in order, and {profile_id} would match "photos" or "location"
@router.get("/agent-search/{profile_id}")
def get_agent_search(profile_id: int, agent_id: int = Depends(get_current_agent_id)):
    """
    Get the last search for a buyer profile.

    Returns the cached search if:
    - Search exists and is within TTL (4 hours)
    - In-memory context still valid

    Otherwise returns status indicating search needs to be re-run.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT last_search_id, last_search_at, last_search_data
                FROM buyer_profiles
                WHERE id = %s AND agent_id = %s
            """, (profile_id, agent_id))
            row = fetchone_dict(cur)

    if not row or not row.get('last_search_id'):
        return {
            "hasSearch": False,
            "reason": "no_previous_search"
        }

    search_id = row['last_search_id']
    search_at = row['last_search_at']
    search_data = row.get('last_search_data')

    # Check if search is within TTL
    from datetime import timedelta
    if search_at and (datetime.utcnow() - search_at) > timedelta(hours=SEARCH_PERSISTENCE_HOURS):
        return {
            "hasSearch": False,
            "reason": "search_expired",
            "expiredAt": search_at.isoformat() if search_at else None
        }

    # Check if in-memory context is still valid (needed for photo/location analysis)
    context = get_search_context(search_id)
    context_valid = context is not None

    # Parse search data
    if isinstance(search_data, str):
        try:
            search_data = json.loads(search_data)
        except json.JSONDecodeError:
            search_data = None

    if not search_data:
        return {
            "hasSearch": False,
            "reason": "search_data_missing"
        }

    # Return the cached search with context validity status
    return {
        "hasSearch": True,
        "searchId": search_id,
        "searchAt": search_at.isoformat() if search_at else None,
        "contextValid": context_valid,  # If False, photo/location analysis won't work
        "searchData": search_data
    }
