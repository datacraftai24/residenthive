"""
Redis-backed search context store for photo analysis and location analysis.
Stores profile + ranked listings by searchId for later retrieval.
"""
from typing import Dict, Any, Optional, List
from datetime import timedelta
import uuid
import json
import os
import redis
import logging

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

    Returns:
        Dict with 'profile', 'ranked_listings', and 'analysis_status', or None if not found/expired
    """
    try:
        r = _get_redis()
        key = _make_key(search_id)

        data = r.get(key)
        if not data:
            logger.warning(f"Search context not found in Redis: {search_id}")
            return None

        context = json.loads(data)
        return {
            "profile": context["profile"],
            "ranked_listings": context["ranked_listings"],
            "analysis_status": context.get("analysis_status", {
                "text_complete": False,
                "vision_complete_for_top5": False,
                "location_complete_for_top5": False
            })
        }

    except Exception as e:
        logger.error(f"Error retrieving search context from Redis: {e}", exc_info=True)
        return None


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
