"""
Redis caching layer for location analysis results
Provides 30-day caching by normalized address to minimize API costs
"""

import os
import json
import logging
from typing import Optional
import redis.asyncio as redis
from datetime import datetime

from models import LocationAnalysis, AnalysisMetadata
from gemini_client import normalize_address

logger = logging.getLogger(__name__)

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
CACHE_TTL = 30 * 24 * 60 * 60  # 30 days in seconds

# Redis client (will be initialized in connect())
redis_client: Optional[redis.Redis] = None


async def connect():
    """Initialize Redis connection"""
    global redis_client

    try:
        redis_client = redis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5
        )

        # Test connection
        await redis_client.ping()
        logger.info(f"Connected to Redis at {REDIS_URL}")

    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        redis_client = None


async def disconnect():
    """Close Redis connection"""
    global redis_client

    if redis_client:
        await redis_client.close()
        redis_client = None
        logger.info("Disconnected from Redis")


def get_cache_key(address: str) -> str:
    """
    Generate cache key from address

    Args:
        address: Property address

    Returns:
        Cache key string
    """
    normalized = normalize_address(address)
    return f"location:{normalized}"


async def get_cached_analysis(address: str) -> Optional[LocationAnalysis]:
    """
    Retrieve cached location analysis

    Args:
        address: Property address

    Returns:
        LocationAnalysis if cache hit, None if cache miss or error
    """
    if not redis_client:
        logger.warning("Redis client not initialized, skipping cache lookup")
        return None

    try:
        cache_key = get_cache_key(address)
        cached_data = await redis_client.get(cache_key)

        if cached_data:
            logger.info(f"Cache HIT for address: {address}")

            # Parse JSON and reconstruct LocationAnalysis
            data = json.loads(cached_data)

            # Update metadata to indicate cache hit
            if "metadata" in data:
                data["metadata"]["cache_hit"] = True

            analysis = LocationAnalysis(**data)
            return analysis

        else:
            logger.info(f"Cache MISS for address: {address}")
            return None

    except Exception as e:
        logger.error(f"Error retrieving from cache: {e}")
        return None


async def cache_analysis(address: str, analysis) -> bool:
    """
    Store location analysis in cache

    Args:
        address: Property address
        analysis: LocationAnalysis model or dict to cache

    Returns:
        True if successfully cached, False otherwise
    """
    if not redis_client:
        logger.warning("Redis client not initialized, skipping cache storage")
        return False

    try:
        cache_key = get_cache_key(address)

        # Convert to JSON - handle both Pydantic models and dicts
        if hasattr(analysis, 'model_dump'):
            # It's a Pydantic model
            analysis_dict = analysis.model_dump(mode="json")
        else:
            # It's already a dict
            analysis_dict = analysis

        cached_data = json.dumps(analysis_dict)

        # Store with TTL
        await redis_client.setex(
            cache_key,
            CACHE_TTL,
            cached_data
        )

        logger.info(f"Cached analysis for address: {address} (TTL: {CACHE_TTL}s / 30 days)")
        return True

    except Exception as e:
        logger.error(f"Error caching analysis: {e}")
        return False


async def clear_cache_for_address(address: str) -> bool:
    """
    Clear cached analysis for a specific address

    Args:
        address: Property address

    Returns:
        True if successfully cleared, False otherwise
    """
    if not redis_client:
        logger.warning("Redis client not initialized")
        return False

    try:
        cache_key = get_cache_key(address)
        result = await redis_client.delete(cache_key)

        if result > 0:
            logger.info(f"Cleared cache for address: {address}")
            return True
        else:
            logger.info(f"No cache entry found for address: {address}")
            return False

    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return False


async def get_cache_stats() -> dict:
    """
    Get cache statistics

    Returns:
        Dictionary with cache stats
    """
    if not redis_client:
        return {"error": "Redis not connected"}

    try:
        info = await redis_client.info("stats")

        return {
            "connected": True,
            "total_keys": await redis_client.dbsize(),
            "hits": info.get("keyspace_hits", 0),
            "misses": info.get("keyspace_misses", 0),
            "hit_rate": (
                info.get("keyspace_hits", 0) /
                (info.get("keyspace_hits", 0) + info.get("keyspace_misses", 1))
                if (info.get("keyspace_hits", 0) + info.get("keyspace_misses", 1)) > 0
                else 0
            )
        }

    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        return {"error": str(e)}
