"""
In-memory search context store for photo analysis and location analysis.
Stores profile + ranked listings by searchId for later retrieval.
"""
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import uuid


# In-memory cache: {searchId: {profile, ranked_listings, timestamp}}
_cache: Dict[str, Dict[str, Any]] = {}

# TTL for cached search contexts (2 hours)
TTL_HOURS = 2


def generate_search_id() -> str:
    """Generate a unique search ID using UUID4."""
    return str(uuid.uuid4())


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
    _cache[search_id] = {
        "profile": profile,
        "ranked_listings": ranked_listings,
        "analysis_status": {
            "text_complete": True,  # Set to true since text analysis is done when storing
            "vision_complete_for_top5": False,  # Will be set later by photo analysis
            "location_complete_for_top5": False  # Will be set later by location analysis
        },
        "timestamp": datetime.now()
    }

    # Best-effort cleanup of old entries (simple eviction)
    _cleanup_expired()


def get_search_context(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve search context by searchId.

    Returns:
        Dict with 'profile', 'ranked_listings', and 'analysis_status', or None if not found/expired
    """
    context = _cache.get(search_id)

    if not context:
        return None

    # Check TTL
    if datetime.now() - context["timestamp"] > timedelta(hours=TTL_HOURS):
        # Expired, remove and return None
        del _cache[search_id]
        return None

    return {
        "profile": context["profile"],
        "ranked_listings": context["ranked_listings"],
        "analysis_status": context.get("analysis_status", {
            "text_complete": False,
            "vision_complete_for_top5": False,
            "location_complete_for_top5": False
        })
    }


def mark_vision_complete(search_id: str) -> bool:
    """
    Mark photo/vision analysis as complete for top 5 listings.

    Returns:
        True if search_id found and updated, False otherwise
    """
    context = _cache.get(search_id)
    if not context:
        return False

    if "analysis_status" not in context:
        context["analysis_status"] = {
            "text_complete": True,
            "vision_complete_for_top5": False,
            "location_complete_for_top5": False
        }

    context["analysis_status"]["vision_complete_for_top5"] = True
    return True


def store_photo_analysis_results(search_id: str, photo_analysis: Dict[str, Any]) -> bool:
    """
    Store photo analysis results in cache to prevent re-running expensive vision calls.

    Args:
        search_id: Unique identifier for this search
        photo_analysis: Dict of {mlsNumber: photo_result} from photo analyzer

    Returns:
        True if search_id found and updated, False otherwise
    """
    context = _cache.get(search_id)
    if not context:
        return False

    context["photo_analysis"] = photo_analysis
    return True


def get_photo_analysis_results(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve cached photo analysis results.

    Returns:
        Dict of {mlsNumber: photo_result} if cached, None otherwise
    """
    context = _cache.get(search_id)
    if not context:
        return None

    return context.get("photo_analysis")


def mark_location_complete(search_id: str) -> bool:
    """
    Mark location analysis as complete for top 5 listings.

    Returns:
        True if search_id found and updated, False otherwise
    """
    context = _cache.get(search_id)
    if not context:
        return False

    if "analysis_status" not in context:
        context["analysis_status"] = {
            "text_complete": True,
            "vision_complete_for_top5": False,
            "location_complete_for_top5": False
        }

    context["analysis_status"]["location_complete_for_top5"] = True
    return True


def store_location_analysis_results(search_id: str, location_analysis: Dict[str, Any]) -> bool:
    """
    Store location analysis results in cache to prevent re-running expensive location calls.

    Args:
        search_id: Unique identifier for this search
        location_analysis: Dict of {mlsNumber: location_result} from location service

    Returns:
        True if search_id found and updated, False otherwise
    """
    context = _cache.get(search_id)
    if not context:
        return False

    context["location_analysis"] = location_analysis
    return True


def get_location_analysis_results(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve cached location analysis results.

    Returns:
        Dict of {mlsNumber: location_result} if cached, None otherwise
    """
    context = _cache.get(search_id)
    if not context:
        return None

    return context.get("location_analysis")


def _cleanup_expired() -> None:
    """Remove expired entries from cache (best-effort, runs on store)."""
    cutoff = datetime.now() - timedelta(hours=TTL_HOURS)
    expired_keys = [
        key for key, val in _cache.items()
        if val["timestamp"] < cutoff
    ]
    for key in expired_keys:
        del _cache[key]
