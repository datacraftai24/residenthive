from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from uuid import uuid4

from ..db import fetchone_dict, get_conn


router = APIRouter(prefix="/api")


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
