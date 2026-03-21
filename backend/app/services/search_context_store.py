"""
PostgreSQL-backed search context store for photo analysis and location analysis.
Stores profile + ranked listings by searchId for later retrieval.

Replaces the previous in-memory cache with persistent storage so search
contexts survive process restarts and are shared across workers.
"""
import json
import uuid
import logging
from typing import Dict, Any, Optional, List

from ..db import get_conn, fetchone_dict

logger = logging.getLogger(__name__)

# TTL for cached search contexts (2 hours) — enforced at query time
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
    analysis_status = {
        "text_complete": True,
        "vision_complete_for_top5": False,
        "location_complete_for_top5": False,
    }
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO search_contexts
                        (search_id, profile, ranked_listings, analysis_status)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (search_id) DO UPDATE SET
                        profile = EXCLUDED.profile,
                        ranked_listings = EXCLUDED.ranked_listings,
                        analysis_status = EXCLUDED.analysis_status,
                        expires_at = NOW() + INTERVAL '2 hours'
                    """,
                    (
                        search_id,
                        json.dumps(profile),
                        json.dumps(ranked_listings),
                        json.dumps(analysis_status),
                    ),
                )
    except Exception as e:
        logger.error(f"Failed to store search context {search_id}: {e}")
        raise


def get_search_context(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve search context by searchId.

    Returns:
        Dict with 'profile', 'ranked_listings', and 'analysis_status', or None if not found/expired
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT profile, ranked_listings, analysis_status
                    FROM search_contexts
                    WHERE search_id = %s AND expires_at > NOW()
                    """,
                    (search_id,),
                )
                row = fetchone_dict(cur)
                if not row:
                    return None

                return {
                    "profile": row["profile"] if isinstance(row["profile"], dict) else json.loads(row["profile"]),
                    "ranked_listings": row["ranked_listings"] if isinstance(row["ranked_listings"], list) else json.loads(row["ranked_listings"]),
                    "analysis_status": row["analysis_status"] if isinstance(row["analysis_status"], dict) else json.loads(row["analysis_status"]),
                }
    except Exception as e:
        logger.error(f"Failed to get search context {search_id}: {e}")
        return None


def mark_vision_complete(search_id: str) -> bool:
    """
    Mark photo/vision analysis as complete for top 5 listings.

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE search_contexts
                    SET analysis_status = jsonb_set(
                        COALESCE(analysis_status, '{}'),
                        '{vision_complete_for_top5}', 'true'
                    )
                    WHERE search_id = %s AND expires_at > NOW()
                    RETURNING search_id
                    """,
                    (search_id,),
                )
                return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"Failed to mark vision complete for {search_id}: {e}")
        return False


def store_photo_analysis_results(search_id: str, photo_analysis: Dict[str, Any]) -> bool:
    """
    Store photo analysis results to prevent re-running expensive vision calls.

    Args:
        search_id: Unique identifier for this search
        photo_analysis: Dict of {mlsNumber: photo_result} from photo analyzer

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE search_contexts
                    SET photo_analysis = %s
                    WHERE search_id = %s AND expires_at > NOW()
                    RETURNING search_id
                    """,
                    (json.dumps(photo_analysis), search_id),
                )
                return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"Failed to store photo analysis for {search_id}: {e}")
        return False


def get_photo_analysis_results(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve cached photo analysis results.

    Returns:
        Dict of {mlsNumber: photo_result} if cached, None otherwise
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT photo_analysis FROM search_contexts
                    WHERE search_id = %s AND expires_at > NOW()
                    """,
                    (search_id,),
                )
                row = fetchone_dict(cur)
                if not row or row.get("photo_analysis") is None:
                    return None
                pa = row["photo_analysis"]
                return pa if isinstance(pa, dict) else json.loads(pa)
    except Exception as e:
        logger.error(f"Failed to get photo analysis for {search_id}: {e}")
        return None


def mark_location_complete(search_id: str) -> bool:
    """
    Mark location analysis as complete for top 5 listings.

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE search_contexts
                    SET analysis_status = jsonb_set(
                        COALESCE(analysis_status, '{}'),
                        '{location_complete_for_top5}', 'true'
                    )
                    WHERE search_id = %s AND expires_at > NOW()
                    RETURNING search_id
                    """,
                    (search_id,),
                )
                return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"Failed to mark location complete for {search_id}: {e}")
        return False


def store_location_analysis_results(search_id: str, location_analysis: Dict[str, Any]) -> bool:
    """
    Store location analysis results to prevent re-running expensive location calls.

    Args:
        search_id: Unique identifier for this search
        location_analysis: Dict of {mlsNumber: location_result} from location service

    Returns:
        True if search_id found and updated, False otherwise
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE search_contexts
                    SET location_analysis = %s
                    WHERE search_id = %s AND expires_at > NOW()
                    RETURNING search_id
                    """,
                    (json.dumps(location_analysis), search_id),
                )
                return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"Failed to store location analysis for {search_id}: {e}")
        return False


def get_location_analysis_results(search_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve cached location analysis results.

    Returns:
        Dict of {mlsNumber: location_result} if cached, None otherwise
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT location_analysis FROM search_contexts
                    WHERE search_id = %s AND expires_at > NOW()
                    """,
                    (search_id,),
                )
                row = fetchone_dict(cur)
                if not row or row.get("location_analysis") is None:
                    return None
                la = row["location_analysis"]
                return la if isinstance(la, dict) else json.loads(la)
    except Exception as e:
        logger.error(f"Failed to get location analysis for {search_id}: {e}")
        return None
