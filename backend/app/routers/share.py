import os
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from uuid import uuid4

from ..auth import get_current_agent_id
from ..db import fetchone_dict, get_conn


router = APIRouter(prefix="/api")


CHATBOT_FRONTEND_URL = os.getenv("CHATBOT_FRONTEND_URL", "http://localhost:3000")


def _ensure_profile_chat_links_table(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS profile_chat_links (
            id SERIAL PRIMARY KEY,
            profile_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
            agent_id INTEGER NOT NULL,
            share_id TEXT UNIQUE NOT NULL,
            client_identifier TEXT,
            agent_name TEXT,
            agent_email TEXT,
            agent_phone TEXT,
            buyer_name TEXT,
            buyer_email TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            last_viewed TIMESTAMPTZ,
            view_count INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE
        )
        """
    )


def _isoformat(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _build_chat_share_url(
    *,
    share_id: str,
    agent_id: int,
    client_identifier: str,
    profile_id: int,
    base_url: Optional[str] = None,
) -> str:
    base = (base_url or CHATBOT_FRONTEND_URL or "").rstrip("/") or "http://localhost:3000"
    query = urlencode(
        {
            "agentId": agent_id,
            "clientId": client_identifier,
            "shareId": share_id,
            "profileId": profile_id,
        }
    )
    return f"{base}/client/{share_id}?{query}"


def _format_chat_share_response(
    row: Dict[str, Any],
    *,
    share_url: str,
    created: bool,
) -> Dict[str, Any]:
    return {
        "shareId": row["share_id"],
        "profileId": row["profile_id"],
        "agentId": row["agent_id"],
        "shareUrl": share_url,
        "clientIdentifier": row.get("client_identifier"),
        "agentName": row.get("agent_name"),
        "agentEmail": row.get("agent_email"),
        "agentPhone": row.get("agent_phone"),
        "buyerName": row.get("buyer_name"),
        "buyerEmail": row.get("buyer_email"),
        "createdAt": _isoformat(row.get("created_at")),
        "expiresAt": _isoformat(row.get("expires_at")),
        "lastViewed": _isoformat(row.get("last_viewed")),
        "viewCount": row.get("view_count", 0),
        "isActive": row.get("is_active", True),
        "wasCreated": created,
    }


@router.post("/profiles/share")
def create_share(payload: dict):
    profile_id = payload.get("profileId")
    if profile_id is None:
        raise HTTPException(status_code=400, detail="profileId is required")

    try:
        profile_id = int(profile_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="profileId must be an integer")
    share_id = str(uuid4())
    expires_in_days = payload.get("expiresInDays", 30)
    expires_at = (datetime.utcnow() + timedelta(days=expires_in_days)).isoformat()
    now = datetime.utcnow().isoformat()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO profile_shareable_links (
                  profile_id, share_id, agent_name, agent_email, agent_phone,
                  custom_message, branding_colors, show_visual_analysis, view_count,
                  last_viewed, expires_at, created_at, is_active
                ) VALUES (
                  %s, %s, %s, %s, %s,
                  %s, %s, %s, %s,
                  %s, %s, %s, %s
                ) RETURNING *
                """,
                (
                    profile_id,
                    share_id,
                    payload.get("agentName"),
                    payload.get("agentEmail"),
                    payload.get("agentPhone"),
                    payload.get("customMessage"),
                    None,
                    bool(payload.get("showVisualAnalysis", True)),
                    0,
                    None,
                    expires_at,
                    now,
                    True,
                ),
            )
            row = fetchone_dict(cur)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create share link")
    return {
        "shareId": row["share_id"],
        "profileId": row["profile_id"],
        "shareUrl": f"/client/{row['share_id']}",
        "agentName": row.get("agent_name"),
        "agentEmail": row.get("agent_email"),
        "agentPhone": row.get("agent_phone"),
        "customMessage": row.get("custom_message"),
        "showVisualAnalysis": row.get("show_visual_analysis"),
        "expiresAt": row.get("expires_at"),
        "isActive": row.get("is_active", True),
    }


@router.get("/profiles/share/{share_id}")
def get_share(share_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM profile_shareable_links WHERE share_id = %s",
                (share_id,),
            )
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Share link not found")
    return {
        "shareId": row["share_id"],
        "profileId": row["profile_id"],
        "shareUrl": f"/client/{row['share_id']}",
        "agentName": row.get("agent_name"),
        "agentEmail": row.get("agent_email"),
        "agentPhone": row.get("agent_phone"),
        "customMessage": row.get("custom_message"),
        "showVisualAnalysis": row.get("show_visual_analysis"),
        "expiresAt": row.get("expires_at"),
        "isActive": row.get("is_active", True),
    }


@router.post("/profiles/chat-share")
def create_chat_share(payload: dict, agent_id: int = Depends(get_current_agent_id)):
    profile_id = payload.get("profileId")
    if profile_id is None:
        raise HTTPException(status_code=400, detail="profileId is required")

    try:
        profile_id = int(profile_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="profileId must be an integer")

    regenerate = bool(payload.get("regenerate"))
    client_identifier = payload.get("clientIdentifier") or str(profile_id)
    now = datetime.utcnow()

    expires_at: Optional[datetime] = None
    expires_in_days = payload.get("expiresInDays")
    if expires_in_days is not None:
        try:
            expires_int = int(expires_in_days)
            if expires_int > 0:
                expires_at = now + timedelta(days=expires_int)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="expiresInDays must be an integer")

    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_profile_chat_links_table(cur)

            cur.execute(
                "SELECT agent_id, name, email FROM buyer_profiles WHERE id = %s",
                (profile_id,),
            )
            profile_row = fetchone_dict(cur)
            if not profile_row or profile_row.get("agent_id") != agent_id:
                raise HTTPException(status_code=404, detail="Profile not found")

            if not regenerate:
                cur.execute(
                    """
                    SELECT * FROM profile_chat_links
                    WHERE profile_id = %s AND agent_id = %s AND is_active = TRUE
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (profile_id, agent_id),
                )
                existing = fetchone_dict(cur)
                if existing:
                    share_url = _build_chat_share_url(
                        share_id=existing["share_id"],
                        agent_id=agent_id,
                        client_identifier=existing.get("client_identifier") or str(profile_id),
                        profile_id=profile_id,
                    )
                    return _format_chat_share_response(existing, share_url=share_url, created=False)

            share_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO profile_chat_links (
                    profile_id,
                    agent_id,
                    share_id,
                    client_identifier,
                    agent_name,
                    agent_email,
                    agent_phone,
                    buyer_name,
                    buyer_email,
                    created_at,
                    expires_at,
                    is_active
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING *
                """,
                (
                    profile_id,
                    agent_id,
                    share_id,
                    client_identifier,
                    payload.get("agentName"),
                    payload.get("agentEmail"),
                    payload.get("agentPhone"),
                    payload.get("buyerName"),
                    payload.get("buyerEmail"),
                    now,
                    expires_at,
                    True,
                ),
            )
            row = fetchone_dict(cur)

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create chat share link")

    share_url = _build_chat_share_url(
        share_id=row["share_id"],
        agent_id=agent_id,
        client_identifier=row.get("client_identifier") or str(profile_id),
        profile_id=profile_id,
    )
    return _format_chat_share_response(row, share_url=share_url, created=True)


@router.get("/profiles/chat-share/{share_id}")
def get_chat_share(share_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_profile_chat_links_table(cur)
            cur.execute(
                """
                SELECT * FROM profile_chat_links
                WHERE share_id = %s AND is_active = TRUE
                """,
                (share_id,),
            )
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Chat share link not found")

    share_url = _build_chat_share_url(
        share_id=row["share_id"],
        agent_id=row["agent_id"],
        client_identifier=row.get("client_identifier") or str(row["profile_id"]),
        profile_id=row["profile_id"],
    )
    return _format_chat_share_response(row, share_url=share_url, created=False)
