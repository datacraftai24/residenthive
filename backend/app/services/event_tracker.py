"""
Platform Event Tracking Service

Fire-and-forget functions for recording platform events.
Errors are logged but never raised — tracking must never break primary actions.
"""

import json
import logging
from typing import Optional

from ..db import get_conn

logger = logging.getLogger(__name__)


def track_event(
    agent_id: int,
    event_type: str,
    event_category: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Insert a platform event. Fire-and-forget — never raises."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO platform_events
                        (agent_id, event_type, event_category, entity_type, entity_id, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        agent_id,
                        event_type,
                        event_category,
                        entity_type,
                        str(entity_id) if entity_id is not None else None,
                        json.dumps(metadata or {}),
                    ),
                )
    except Exception:
        logger.warning("Failed to track event %s", event_type, exc_info=True)


def track_report_engagement(
    share_id: str,
    event_type: str,
    property_listing_id: Optional[str] = None,
    session_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Insert a report engagement event. Fire-and-forget — never raises."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO report_engagement_events
                        (share_id, event_type, property_listing_id, session_id, metadata)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        share_id,
                        event_type,
                        property_listing_id,
                        session_id,
                        json.dumps(metadata or {}),
                    ),
                )
    except Exception:
        logger.warning("Failed to track report engagement %s", event_type, exc_info=True)
