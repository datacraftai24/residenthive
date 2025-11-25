"""
In-memory search context store for photo analysis.
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
        "timestamp": datetime.now()
    }

    # Best-effort cleanup of old entries (simple eviction)
    _cleanup_expired()


def get_search_context(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve search context by searchId.

    Returns:
        Dict with 'profile' and 'ranked_listings', or None if not found/expired
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
        "ranked_listings": context["ranked_listings"]
    }


def _cleanup_expired() -> None:
    """Remove expired entries from cache (best-effort, runs on store)."""
    cutoff = datetime.now() - timedelta(hours=TTL_HOURS)
    expired_keys = [
        key for key, val in _cache.items()
        if val["timestamp"] < cutoff
    ]
    for key in expired_keys:
        del _cache[key]
