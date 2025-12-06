"""
Redis-backed search context store for photo analysis and location analysis.
Stores profile + ranked listings by searchId for later retrieval.
Falls back to database when Redis is unavailable.
"""
from typing import Dict, Any, Optional, List
from datetime import timedelta
import uuid
import json
import os
import redis
import logging
from ..db import get_conn, fetchone_dict, fetchall_dicts

logger = logging.getLogger(__name__)

# Redis client
_redis_client: Optional[redis.Redis] = None

# TTL for cached search contexts (2 hours)
TTL_HOURS = 2
TTL_SECONDS = int(timedelta(hours=TTL_HOURS).total_seconds())


def _get_redis() -> redis.Redis:
    """Get or create Redis client."""
    global _redis_client

    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        _redis_client = redis.from_url(
            redis_url,
            decode_responses=True,  # Automatically decode bytes to strings
            socket_connect_timeout=5,
            socket_timeout=5
        )
        logger.info(f"Initialized Redis client: {redis_url}")

    return _redis_client


def generate_search_id() -> str:
    """Generate a unique search ID using UUID4."""
    return str(uuid.uuid4())


def _make_key(search_id: str, suffix: str = "") -> str:
    """Generate Redis key for search context."""
    if suffix:
        return f"search_context:{search_id}:{suffix}"
    return f"search_context:{search_id}"


def _get_search_context_from_db(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve search context from database as fallback when Redis is unavailable.

    Queries buyer_reports and property_listings tables to reconstruct the context
    that would have been stored in Redis.

    Returns:
        Dict with 'profile', 'ranked_listings', and 'analysis_status', or None if not found
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Get buyer_report for this search_id
                cur.execute("""
                    SELECT profile_id, included_listing_ids
                    FROM buyer_reports
                    WHERE search_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (search_id,))

                report = fetchone_dict(cur)
                if not report:
                    logger.warning(f"No buyer_report found for search_id={search_id}")
                    return None

                profile_id = report['profile_id']
                listing_ids = report['included_listing_ids'] or []

                # Get full buyer profile
                cur.execute("""
                    SELECT *
                    FROM buyer_profiles
                    WHERE id = %s
                """, (profile_id,))

                profile = fetchone_dict(cur)
                if not profile:
                    logger.warning(f"No buyer_profile found for profile_id={profile_id}")
                    return None

                # Convert profile to dict, handling JSONB fields
                if isinstance(profile.get('vision_checklist'), str):
                    profile['visionChecklist'] = json.loads(profile['vision_checklist'])
                else:
                    profile['visionChecklist'] = profile.get('vision_checklist', [])

                if isinstance(profile.get('location_preferences'), str):
                    location_prefs = json.loads(profile['location_preferences'])
                else:
                    location_prefs = profile.get('location_preferences', {})

                # Add location preferences to profile
                profile['work_address'] = profile.get('work_address')
                profile['max_commute_mins'] = profile.get('max_commute_mins', 30)
                profile['prioritize_quiet_street'] = location_prefs.get('prioritize_quiet_street', False)
                profile['prioritize_walkability'] = location_prefs.get('prioritize_walkability', False)
                profile['has_kids'] = location_prefs.get('has_kids', False)

                # Get property listings with AI analysis
                if listing_ids:
                    placeholders = ','.join(['%s'] * len(listing_ids))
                    cur.execute(f"""
                        SELECT
                            mls_number,
                            address,
                            price,
                            bedrooms,
                            bathrooms,
                            sqft,
                            lot_size,
                            year_built,
                            property_type,
                            description,
                            features,
                            images,
                            latitude,
                            longitude,
                            listing_url,
                            ai_analysis
                        FROM property_listings
                        WHERE mls_number IN ({placeholders})
                    """, listing_ids)

                    listings = fetchall_dicts(cur)

                    # Process listings to match expected format
                    ranked_listings = []
                    for listing in listings:
                        # Parse JSON fields if they're strings
                        if isinstance(listing.get('images'), str):
                            listing['images'] = json.loads(listing['images'])
                        if isinstance(listing.get('features'), str):
                            listing['features'] = json.loads(listing['features'])
                        if isinstance(listing.get('ai_analysis'), str):
                            ai_analysis = json.loads(listing['ai_analysis'])
                        else:
                            ai_analysis = listing.get('ai_analysis', {})

                        # Create listing dict with all fields
                        listing_dict = {
                            "mlsNumber": listing['mls_number'],
                            "address": listing['address'],
                            "price": listing['price'],
                            "bedrooms": listing['bedrooms'],
                            "bathrooms": listing['bathrooms'],
                            "sqft": listing['sqft'],
                            "lotSize": listing.get('lot_size'),
                            "yearBuilt": listing.get('year_built'),
                            "propertyType": listing.get('property_type'),
                            "description": listing.get('description'),
                            "features": listing.get('features', []),
                            "images": listing.get('images', []),
                            "latitude": listing.get('latitude'),
                            "longitude": listing.get('longitude'),
                            "listingUrl": listing.get('listing_url'),
                            "fit_score": ai_analysis.get('fit_score', 0),
                            "priority_tag": ai_analysis.get('priority_tag'),
                            "final_score": ai_analysis.get('final_score', 0),
                            "rank": ai_analysis.get('rank', 0),
                            "is_top20": ai_analysis.get('is_top20', False),
                        }
                        ranked_listings.append(listing_dict)

                    # Sort by rank
                    ranked_listings.sort(key=lambda x: x.get('rank', 999))
                else:
                    ranked_listings = []

                logger.info(f"Retrieved search context from database: search_id={search_id}, {len(ranked_listings)} listings")

                return {
                    "profile": profile,
                    "ranked_listings": ranked_listings,
                    "analysis_status": {
                        "text_complete": True,
                        "vision_complete_for_top5": False,
                        "location_complete_for_top5": False
                    }
                }

    except Exception as e:
        logger.error(f"Error retrieving search context from database: {e}", exc_info=True)
        return None


def store_search_context(
    search_id: str,
    profile: Dict[str, Any],
    ranked_listings: List[Dict[str, Any]]
) -> None:
    """
    Store search context for later photo analysis.

    Args:
        search_id: Unique identifier for this search
        profile: FULL buyer profile object (must include visionChecklist)
        ranked_listings: POST-ranking list with fit_score, priority_tag,
                        final_score, rank, is_top20, images already attached
    """
    try:
        r = _get_redis()

        # Store as JSON in Redis with TTL
        context_data = {
            "profile": profile,
            "ranked_listings": ranked_listings,
            "analysis_status": {
                "text_complete": True,  # Set to true since text analysis is done when storing
                "vision_complete_for_top5": False,  # Will be set later by photo analysis
                "location_complete_for_top5": False  # Will be set later by location analysis
            }
        }

        key = _make_key(search_id)
        r.setex(key, TTL_SECONDS, json.dumps(context_data))
        logger.info(f"Stored search context in Redis: {search_id}")

    except Exception as e:
        logger.warning(f"Redis unavailable - skipping search context cache: {e}")
        # Don't raise - Redis is optional for Cloud Run deployments
        # Data is already persisted to PostgreSQL


def get_search_context(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve search context by searchId.

    Tries Redis first (fast path), falls back to database if Redis is unavailable.

    Returns:
        Dict with 'profile', 'ranked_listings', and 'analysis_status', or None if not found/expired
    """
    # Try Redis first (fast path)
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if data:
            context = json.loads(data)
            logger.info(f"Retrieved search context from Redis: {search_id}")
            return {
                "profile": context["profile"],
                "ranked_listings": context["ranked_listings"],
                "analysis_status": context.get("analysis_status", {
                    "text_complete": False,
                    "vision_complete_for_top5": False,
                    "location_complete_for_top5": False
                })
            }
        else:
            logger.warning(f"Search context not found in Redis: {search_id}, trying database...")

    except Exception as e:
        logger.warning(f"Redis unavailable for search context retrieval: {e}, falling back to database...")

    # Fall back to database (slower but works without Redis)
    return _get_search_context_from_db(search_id)


def mark_vision_complete(search_id: str) -> bool:
    """
    Mark photo/vision analysis as complete for top 5 listings.

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if not data:
            return False

        context = json.loads(data)

        if "analysis_status" not in context:
            context["analysis_status"] = {
                "text_complete": True,
                "vision_complete_for_top5": False,
                "location_complete_for_top5": False
            }

        context["analysis_status"]["vision_complete_for_top5"] = True

        # Update in Redis, preserving TTL
        ttl = r.ttl(key)
        if ttl > 0:
            r.setex(key, ttl, json.dumps(context))
        else:
            r.setex(key, TTL_SECONDS, json.dumps(context))

        return True

    except Exception as e:
        logger.error(f"Error marking vision complete in Redis: {e}", exc_info=True)
        return False


def store_photo_analysis_results(search_id: str, photo_analysis: Dict[str, Any]) -> bool:
    """
    Store photo analysis results in cache to prevent re-running expensive vision calls.

    Args:
        search_id: Unique identifier for this search
        photo_analysis: Dict of {mlsNumber: photo_result} from photo analyzer

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if not data:
            return False

        context = json.loads(data)
        context["photo_analysis"] = photo_analysis

        # Update in Redis, preserving TTL
        ttl = r.ttl(key)
        if ttl > 0:
            r.setex(key, ttl, json.dumps(context))
        else:
            r.setex(key, TTL_SECONDS, json.dumps(context))

        return True

    except Exception as e:
        logger.error(f"Error storing photo analysis in Redis: {e}", exc_info=True)
        return False


def get_photo_analysis_results(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve cached photo analysis results.

    Returns:
        Dict of {mlsNumber: photo_result} if cached, None otherwise
    """
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if not data:
            return None

        context = json.loads(data)
        return context.get("photo_analysis")

    except Exception as e:
        logger.error(f"Error retrieving photo analysis from Redis: {e}", exc_info=True)
        return None


def mark_location_complete(search_id: str) -> bool:
    """
    Mark location analysis as complete for top 5 listings.

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if not data:
            return False

        context = json.loads(data)

        if "analysis_status" not in context:
            context["analysis_status"] = {
                "text_complete": True,
                "vision_complete_for_top5": False,
                "location_complete_for_top5": False
            }

        context["analysis_status"]["location_complete_for_top5"] = True

        # Update in Redis, preserving TTL
        ttl = r.ttl(key)
        if ttl > 0:
            r.setex(key, ttl, json.dumps(context))
        else:
            r.setex(key, TTL_SECONDS, json.dumps(context))

        return True

    except Exception as e:
        logger.error(f"Error marking location complete in Redis: {e}", exc_info=True)
        return False


def store_location_analysis_results(search_id: str, location_analysis: Dict[str, Any]) -> bool:
    """
    Store location analysis results in cache to prevent re-running expensive location calls.

    Args:
        search_id: Unique identifier for this search
        location_analysis: Dict of {mlsNumber: location_result} from location service

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if not data:
            return False

        context = json.loads(data)
        context["location_analysis"] = location_analysis

        # Update in Redis, preserving TTL
        ttl = r.ttl(key)
        if ttl > 0:
            r.setex(key, ttl, json.dumps(context))
        else:
            r.setex(key, TTL_SECONDS, json.dumps(context))

        return True

    except Exception as e:
        logger.error(f"Error storing location analysis in Redis: {e}", exc_info=True)
        return False


def get_location_analysis_results(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve cached location analysis results.

    Returns:
        Dict of {mlsNumber: location_result} if cached, None otherwise
    """
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if not data:
            return None

        context = json.loads(data)
        return context.get("location_analysis")

    except Exception as e:
        logger.error(f"Error retrieving location analysis from Redis: {e}", exc_info=True)
        return None
