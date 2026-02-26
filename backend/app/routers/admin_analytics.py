"""
Admin Analytics Router

Platform-level analytics endpoints restricted to admin users.
Admin access controlled via ADMIN_EMAILS environment variable.
"""

import os
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import get_current_agent_id
from ..db import get_conn, fetchone_dict, fetchall_dicts
from ..services.event_tracker import track_report_engagement

router = APIRouter(prefix="/api/admin/analytics", tags=["admin-analytics"])

# ---------------------------------------------------------------------------
# Admin guard
# ---------------------------------------------------------------------------

ADMIN_EMAILS = set(
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
)


async def require_admin(agent_id: int = Depends(get_current_agent_id)) -> int:
    """Verify the current agent is an admin."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT email FROM agents WHERE id = %s", (agent_id,))
            row = fetchone_dict(cur)
    if not row or row["email"].lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return agent_id


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _date_cutoff(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _safe_isoformat(val):
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/overview")
def analytics_overview(
    days: int = Query(30, ge=1, le=365),
    _admin: int = Depends(require_admin),
):
    """Overview card metrics — queries existing tables for immediate value."""
    cutoff = _date_cutoff(days)
    prev_cutoff = cutoff - timedelta(days=days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Active agents (distinct agents with platform_events in period)
            cur.execute(
                "SELECT COUNT(DISTINCT agent_id) FROM platform_events WHERE created_at >= %s",
                (cutoff,),
            )
            active_agents = cur.fetchone()[0] or 0

            # Profiles created
            cur.execute(
                "SELECT COUNT(*) FROM buyer_profiles WHERE created_at >= %s",
                (cutoff,),
            )
            profiles_current = cur.fetchone()[0] or 0

            cur.execute(
                "SELECT COUNT(*) FROM buyer_profiles WHERE created_at >= %s AND created_at < %s",
                (prev_cutoff, cutoff),
            )
            profiles_prev = cur.fetchone()[0] or 0

            # Leads processed
            cur.execute(
                "SELECT COUNT(*) FROM leads WHERE created_at >= %s",
                (cutoff,),
            )
            leads_current = cur.fetchone()[0] or 0

            cur.execute(
                "SELECT COUNT(*) FROM leads WHERE created_at >= %s AND created_at < %s",
                (prev_cutoff, cutoff),
            )
            leads_prev = cur.fetchone()[0] or 0

            # Searches run
            cur.execute(
                "SELECT COUNT(*) FROM search_transactions WHERE created_at >= %s",
                (cutoff,),
            )
            searches_current = cur.fetchone()[0] or 0

            # Reports generated
            cur.execute(
                "SELECT COUNT(*) FROM buyer_reports WHERE created_at >= %s",
                (cutoff,),
            )
            reports_current = cur.fetchone()[0] or 0

            # Total agents
            cur.execute("SELECT COUNT(*) FROM agents")
            total_agents = cur.fetchone()[0] or 0

    def _pct_change(current, previous):
        if previous == 0:
            return None
        return round(((current - previous) / previous) * 100, 1)

    return {
        "activeAgents": active_agents,
        "totalAgents": total_agents,
        "profilesCreated": profiles_current,
        "profilesChange": _pct_change(profiles_current, profiles_prev),
        "leadsProcessed": leads_current,
        "leadsChange": _pct_change(leads_current, leads_prev),
        "searchesRun": searches_current,
        "reportsGenerated": reports_current,
        "days": days,
    }


@router.get("/activity-over-time")
def activity_over_time(
    days: int = Query(30, ge=1, le=365),
    _admin: int = Depends(require_admin),
):
    """Daily active agents + event counts."""
    cutoff = _date_cutoff(days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    DATE(created_at) AS day,
                    COUNT(DISTINCT agent_id) AS active_agents,
                    COUNT(*) AS total_events
                FROM platform_events
                WHERE created_at >= %s
                GROUP BY DATE(created_at)
                ORDER BY day
                """,
                (cutoff,),
            )
            rows = fetchall_dicts(cur)

    return [
        {
            "day": r["day"].isoformat() if hasattr(r["day"], "isoformat") else str(r["day"]),
            "activeAgents": r["active_agents"],
            "totalEvents": r["total_events"],
        }
        for r in rows
    ]


@router.get("/feature-usage")
def feature_usage(
    days: int = Query(30, ge=1, le=365),
    _admin: int = Depends(require_admin),
):
    """Counts by event_category."""
    cutoff = _date_cutoff(days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_category, COUNT(*) AS count
                FROM platform_events
                WHERE created_at >= %s
                GROUP BY event_category
                ORDER BY count DESC
                """,
                (cutoff,),
            )
            rows = fetchall_dicts(cur)

    return [{"category": r["event_category"], "count": r["count"]} for r in rows]


@router.get("/top-agents")
def top_agents(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    _admin: int = Depends(require_admin),
):
    """Top agents by activity."""
    cutoff = _date_cutoff(days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    pe.agent_id,
                    a.first_name || ' ' || a.last_name AS name,
                    a.email,
                    COUNT(*) AS event_count
                FROM platform_events pe
                JOIN agents a ON pe.agent_id = a.id
                WHERE pe.created_at >= %s
                GROUP BY pe.agent_id, a.first_name, a.last_name, a.email
                ORDER BY event_count DESC
                LIMIT %s
                """,
                (cutoff, limit),
            )
            rows = fetchall_dicts(cur)

    return [
        {
            "agentId": r["agent_id"],
            "name": r["name"],
            "email": r["email"],
            "eventCount": r["event_count"],
        }
        for r in rows
    ]


@router.get("/lead-funnel")
def lead_funnel(
    days: int = Query(30, ge=1, le=365),
    _admin: int = Depends(require_admin),
):
    """Lead conversion funnel."""
    cutoff = _date_cutoff(days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM leads
                WHERE created_at >= %s
                GROUP BY status
                ORDER BY
                    CASE status
                        WHEN 'new' THEN 1
                        WHEN 'classified' THEN 2
                        WHEN 'engaged' THEN 3
                        WHEN 'converted' THEN 4
                        ELSE 5
                    END
                """,
                (cutoff,),
            )
            rows = fetchall_dicts(cur)

    return [{"status": r["status"], "count": r["count"]} for r in rows]


@router.get("/api-performance")
def api_performance(
    days: int = Query(7, ge=1, le=90),
    _admin: int = Depends(require_admin),
):
    """Search execution times, P95, counts by day."""
    cutoff = _date_cutoff(days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    DATE(created_at) AS day,
                    COUNT(*) AS count,
                    ROUND(AVG(execution_time_ms)::numeric, 0) AS avg_ms,
                    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 0) AS p95_ms
                FROM search_transactions
                WHERE created_at >= %s AND execution_time_ms IS NOT NULL
                GROUP BY DATE(created_at)
                ORDER BY day
                """,
                (cutoff,),
            )
            rows = fetchall_dicts(cur)

    return [
        {
            "day": r["day"].isoformat() if hasattr(r["day"], "isoformat") else str(r["day"]),
            "count": r["count"],
            "avgMs": int(r["avg_ms"]) if r["avg_ms"] else 0,
            "p95Ms": int(r["p95_ms"]) if r["p95_ms"] else 0,
        }
        for r in rows
    ]


@router.get("/agent/{agent_id}/detail")
def agent_detail(
    agent_id: int,
    days: int = Query(30, ge=1, le=365),
    _admin: int = Depends(require_admin),
):
    """Agent-specific drilldown."""
    cutoff = _date_cutoff(days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Agent info
            cur.execute(
                "SELECT id, first_name, last_name, email, created_at FROM agents WHERE id = %s",
                (agent_id,),
            )
            agent = fetchone_dict(cur)
            if not agent:
                raise HTTPException(status_code=404, detail="Agent not found")

            # Feature usage breakdown
            cur.execute(
                """
                SELECT event_category, COUNT(*) AS count
                FROM platform_events
                WHERE agent_id = %s AND created_at >= %s
                GROUP BY event_category
                ORDER BY count DESC
                """,
                (agent_id, cutoff),
            )
            usage = fetchall_dicts(cur)

            # Daily activity
            cur.execute(
                """
                SELECT DATE(created_at) AS day, COUNT(*) AS count
                FROM platform_events
                WHERE agent_id = %s AND created_at >= %s
                GROUP BY DATE(created_at)
                ORDER BY day
                """,
                (agent_id, cutoff),
            )
            daily = fetchall_dicts(cur)

            # Recent actions
            cur.execute(
                """
                SELECT event_type, event_category, entity_type, entity_id, created_at
                FROM platform_events
                WHERE agent_id = %s AND created_at >= %s
                ORDER BY created_at DESC
                LIMIT 20
                """,
                (agent_id, cutoff),
            )
            recent = fetchall_dicts(cur)

    return {
        "agent": {
            "id": agent["id"],
            "name": f"{agent['first_name']} {agent['last_name']}",
            "email": agent["email"],
            "joinedAt": _safe_isoformat(agent["created_at"]),
        },
        "featureUsage": [{"category": r["event_category"], "count": r["count"]} for r in usage],
        "dailyActivity": [
            {
                "day": r["day"].isoformat() if hasattr(r["day"], "isoformat") else str(r["day"]),
                "count": r["count"],
            }
            for r in daily
        ],
        "recentActions": [
            {
                "eventType": r["event_type"],
                "category": r["event_category"],
                "entityType": r["entity_type"],
                "entityId": r["entity_id"],
                "createdAt": _safe_isoformat(r["created_at"]),
            }
            for r in recent
        ],
    }


@router.get("/report-engagement")
def report_engagement(
    days: int = Query(30, ge=1, le=365),
    _admin: int = Depends(require_admin),
):
    """Client engagement aggregates."""
    cutoff = _date_cutoff(days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    event_type,
                    COUNT(*) AS count,
                    COUNT(DISTINCT share_id) AS unique_reports,
                    COUNT(DISTINCT session_id) AS unique_sessions
                FROM report_engagement_events
                WHERE created_at >= %s
                GROUP BY event_type
                ORDER BY count DESC
                """,
                (cutoff,),
            )
            rows = fetchall_dicts(cur)

    return [
        {
            "eventType": r["event_type"],
            "count": r["count"],
            "uniqueReports": r["unique_reports"],
            "uniqueSessions": r["unique_sessions"],
        }
        for r in rows
    ]


@router.get("/agents-list")
def agents_list(
    _admin: int = Depends(require_admin),
):
    """List all agents for the agent detail dropdown."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, first_name || ' ' || last_name AS name, email FROM agents ORDER BY first_name, last_name"
            )
            rows = fetchall_dicts(cur)

    return [{"id": r["id"], "name": r["name"], "email": r["email"]} for r in rows]


# ---------------------------------------------------------------------------
# Public endpoint: report engagement tracking (no auth)
# ---------------------------------------------------------------------------

class ReportEngagementRequest(BaseModel):
    shareId: str
    eventType: str
    propertyListingId: Optional[str] = None
    sessionId: Optional[str] = None
    metadata: Optional[dict] = None


# This endpoint sits outside the admin prefix — register on a separate mini-router
public_router = APIRouter(prefix="/api/public", tags=["public"])


@public_router.post("/report-engagement")
def track_report_engagement_endpoint(req: ReportEngagementRequest):
    """Public endpoint for client engagement tracking (no auth)."""
    track_report_engagement(
        share_id=req.shareId,
        event_type=req.eventType,
        property_listing_id=req.propertyListingId,
        session_id=req.sessionId,
        metadata=req.metadata,
    )
    return {"ok": True}
