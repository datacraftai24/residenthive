from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..db import get_conn, fetchall_dicts, fetchone_dict


router = APIRouter(prefix="/api")


class DisagreeRequest(BaseModel):
    profileId: int
    tagName: Optional[str] = None
    personaField: Optional[str] = None


class AgentNoteRequest(BaseModel):
    profileId: int
    note: str


class InsightsLockRequest(BaseModel):
    profileId: int
    isLocked: bool


@router.post("/insights/disagree")
def insights_disagree(req: DisagreeRequest):
    feedback_type = "disagree_tag" if req.tagName else "disagree_persona"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO agent_insight_feedback (profile_id, tag_name, persona_field, feedback_type, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    req.profileId,
                    req.tagName,
                    req.personaField,
                    feedback_type,
                    datetime.utcnow().isoformat(),
                ),
            )
    return {"success": True}


@router.post("/agent-notes")
def save_agent_note(req: AgentNoteRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO agent_notes (profile_id, note, created_at) VALUES (%s, %s, %s)",
                (req.profileId, req.note, datetime.utcnow().isoformat()),
            )
    return {"success": True}


@router.get("/agent-notes/{profile_id}")
def get_agent_notes(profile_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, note, created_at FROM agent_notes WHERE profile_id = %s ORDER BY created_at DESC",
                (profile_id,),
            )
            rows = fetchall_dicts(cur)
    return rows


@router.post("/insights/lock")
def toggle_insights_lock(req: InsightsLockRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Try update existing
            cur.execute(
                "UPDATE profile_insights_lock SET is_locked = %s WHERE profile_id = %s RETURNING id",
                (1 if req.isLocked else 0, req.profileId),
            )
            row = cur.fetchone()
            if not row:
                # Insert new lock status
                cur.execute(
                    "INSERT INTO profile_insights_lock (profile_id, is_locked, created_at) VALUES (%s, %s, %s)",
                    (req.profileId, 1 if req.isLocked else 0, datetime.utcnow().isoformat()),
                )
    return {"success": True}


@router.get("/insights/lock/{profile_id}")
def get_insights_lock(profile_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT is_locked FROM profile_insights_lock WHERE profile_id = %s", (profile_id,))
            row = fetchone_dict(cur)
    return {"isLocked": bool(row.get("is_locked")) if row else False}

