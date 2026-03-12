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
                "SELECT COUNT(*) FROM search_transactions WHERE created_at::timestamptz >= %s",
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
                    ROUND(AVG(total_execution_time)::numeric, 0) AS avg_ms,
                    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_execution_time)::numeric, 0) AS p95_ms
                FROM search_transactions
                WHERE created_at::timestamptz >= %s AND total_execution_time IS NOT NULL
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


@router.get("/pilot-metrics")
def pilot_metrics(
    days: int = Query(30, ge=1, le=365),
    _admin: int = Depends(require_admin),
):
    """Pilot-specific KPIs — 7 metrics in a single response."""
    cutoff = _date_cutoff(days)

    # Risk topics reused from chat_insights
    RISK_TOPICS = [
        "school", "hoa", "flood", "permit", "zoning", "tax", "taxes",
        "assessment", "lien", "septic", "well", "easement", "deed",
        "title", "survey", "environmental", "asbestos", "lead", "radon",
    ]

    with get_conn() as conn:
        with conn.cursor() as cur:

            # ------------------------------------------------------------------
            # 1. Lead Response Time
            # ------------------------------------------------------------------
            cur.execute(
                """
                SELECT
                    ROUND(AVG(EXTRACT(EPOCH FROM (engaged_at - created_at)) / 60)::numeric, 1)
                        AS avg_minutes,
                    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (engaged_at - created_at)) / 60
                    )::numeric, 1) AS median_minutes,
                    COUNT(*) AS total_responded
                FROM leads
                WHERE created_at >= %s
                  AND engaged_at IS NOT NULL
                """,
                (cutoff,),
            )
            lrt = fetchone_dict(cur)
            avg_min = float(lrt["avg_minutes"]) if lrt["avg_minutes"] else 0
            median_min = float(lrt["median_minutes"]) if lrt["median_minutes"] else 0
            total_responded = lrt["total_responded"] or 0
            # % responded under 5 min
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM leads
                WHERE created_at >= %s
                  AND engaged_at IS NOT NULL
                  AND EXTRACT(EPOCH FROM (engaged_at - created_at)) / 60 < 5
                """,
                (cutoff,),
            )
            under5 = cur.fetchone()[0] or 0
            under5_pct = round(under5 / total_responded * 100, 1) if total_responded else 0

            # ------------------------------------------------------------------
            # 2. Report Open Rate
            # ------------------------------------------------------------------
            cur.execute(
                """
                SELECT COUNT(*) FROM leads
                WHERE created_at >= %s AND report_sent_at IS NOT NULL
                """,
                (cutoff,),
            )
            reports_sent = cur.fetchone()[0] or 0

            cur.execute(
                """
                SELECT COUNT(DISTINCT ree.share_id)
                FROM report_engagement_events ree
                JOIN buyer_reports br ON br.share_id = ree.share_id
                JOIN buyer_profiles bp ON bp.id = br.profile_id
                JOIN leads l ON l.id = bp.parent_lead_id
                WHERE ree.event_type = 'page_view'
                  AND l.created_at >= %s
                  AND l.report_sent_at IS NOT NULL
                """,
                (cutoff,),
            )
            reports_viewed = cur.fetchone()[0] or 0
            open_rate = round(reports_viewed / reports_sent * 100, 1) if reports_sent else 0

            # ------------------------------------------------------------------
            # 3. Buyer Engagement
            # ------------------------------------------------------------------
            cur.execute(
                """
                SELECT
                    ROUND(AVG(message_count)::numeric, 1) AS avg_messages,
                    ROUND(AVG(COALESCE(array_length(properties_discussed, 1), 0))::numeric, 1)
                        AS avg_properties,
                    COUNT(*) AS total_sessions,
                    ROUND(
                        COUNT(*) FILTER (WHERE cta_clicked = TRUE)::numeric
                        / NULLIF(COUNT(*), 0) * 100, 1
                    ) AS cta_click_rate,
                    ROUND(
                        COUNT(*) FILTER (WHERE buyer_identity_state = 'verified')::numeric
                        / NULLIF(COUNT(*), 0) * 100, 1
                    ) AS contact_capture_rate
                FROM chatbot_sessions
                WHERE created_at >= %s
                """,
                (cutoff,),
            )
            be = fetchone_dict(cur)
            total_sessions = be["total_sessions"] or 0

            # ------------------------------------------------------------------
            # 4. Lead-to-Showing Conversion
            # ------------------------------------------------------------------
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE status IN ('engaged','converted')) AS total_engaged,
                    COUNT(*) FILTER (WHERE status = 'converted') AS total_converted
                FROM leads
                WHERE created_at >= %s
                """,
                (cutoff,),
            )
            lc = fetchone_dict(cur)
            total_engaged = lc["total_engaged"] or 0
            total_converted = lc["total_converted"] or 0
            conversion_rate = (
                round(total_converted / total_engaged * 100, 1) if total_engaged else 0
            )

            # ------------------------------------------------------------------
            # 5. Compliance Flags
            # ------------------------------------------------------------------
            # Build ILIKE conditions for risk topics
            topic_case = " ".join(
                f"WHEN LOWER(cm.content) LIKE '%%{t}%%' THEN '{t}'"
                for t in RISK_TOPICS
            )
            cur.execute(
                f"""
                WITH flagged AS (
                    SELECT
                        cm.session_id,
                        CASE {topic_case} ELSE NULL END AS topic
                    FROM chatbot_messages cm
                    JOIN chatbot_sessions cs ON cs.session_id = cm.session_id
                    WHERE cs.created_at >= %s
                      AND cm.role = 'user'
                )
                SELECT topic, COUNT(DISTINCT session_id) AS cnt
                FROM flagged
                WHERE topic IS NOT NULL
                GROUP BY topic
                ORDER BY cnt DESC
                """,
                (cutoff,),
            )
            topic_rows = fetchall_dicts(cur)
            flagged_sessions_set: set = set()
            top_topics = []
            for r in topic_rows:
                top_topics.append({"topic": r["topic"], "count": r["cnt"]})
            # Count distinct sessions with any flag
            cur.execute(
                f"""
                SELECT COUNT(DISTINCT cm.session_id)
                FROM chatbot_messages cm
                JOIN chatbot_sessions cs ON cs.session_id = cm.session_id
                WHERE cs.created_at >= %s
                  AND cm.role = 'user'
                  AND ({" OR ".join(f"LOWER(cm.content) LIKE '%%{t}%%'" for t in RISK_TOPICS)})
                """,
                (cutoff,),
            )
            sessions_with_flags = cur.fetchone()[0] or 0
            flag_rate = (
                round(sessions_with_flags / total_sessions * 100, 1)
                if total_sessions
                else 0
            )

            # ------------------------------------------------------------------
            # 6. Agent Adoption
            # ------------------------------------------------------------------
            cur.execute("SELECT COUNT(*) FROM agents")
            total_agents = cur.fetchone()[0] or 0

            cur.execute(
                """
                SELECT COUNT(DISTINCT agent_id)
                FROM platform_events
                WHERE created_at >= %s
                """,
                (cutoff,),
            )
            agents_using = cur.fetchone()[0] or 0
            adoption_rate = (
                round(agents_using / total_agents * 100, 1) if total_agents else 0
            )

            cur.execute(
                "SELECT COUNT(*) FROM leads WHERE created_at >= %s",
                (cutoff,),
            )
            total_leads = cur.fetchone()[0] or 0
            cur.execute(
                "SELECT COUNT(*) FROM leads WHERE created_at >= %s AND status != 'new'",
                (cutoff,),
            )
            leads_processed_platform = cur.fetchone()[0] or 0

            # ------------------------------------------------------------------
            # 7. Agent Time Saved
            # ------------------------------------------------------------------
            cur.execute(
                """
                SELECT
                    ROUND(AVG(total_execution_time)::numeric, 0) AS avg_ms,
                    COUNT(*) AS total_searches
                FROM search_transactions
                WHERE created_at::timestamptz >= %s AND total_execution_time IS NOT NULL
                """,
                (cutoff,),
            )
            ts = fetchone_dict(cur)
            avg_search_ms = int(ts["avg_ms"]) if ts["avg_ms"] else 0
            total_searches = ts["total_searches"] or 0
            manual_baseline_min = 30
            avg_search_min = round(avg_search_ms / 60000, 2)
            saved_per_lead = round(manual_baseline_min - avg_search_min, 2)
            total_hours_saved = round(saved_per_lead * total_searches / 60, 1)

    return {
        "leadResponseTime": {
            "avgMinutes": avg_min,
            "medianMinutes": median_min,
            "under5MinPct": under5_pct,
            "totalResponded": total_responded,
        },
        "reportOpenRate": {
            "totalReportsSent": reports_sent,
            "totalReportsViewed": reports_viewed,
            "openRatePct": open_rate,
        },
        "buyerEngagement": {
            "avgMessagesPerSession": float(be["avg_messages"] or 0),
            "avgPropertiesDiscussed": float(be["avg_properties"] or 0),
            "ctaClickRate": float(be["cta_click_rate"] or 0),
            "contactCaptureRate": float(be["contact_capture_rate"] or 0),
            "totalSessions": total_sessions,
        },
        "leadToShowingConversion": {
            "totalEngaged": total_engaged,
            "totalConverted": total_converted,
            "conversionRatePct": conversion_rate,
        },
        "complianceFlags": {
            "totalSessionsWithFlags": sessions_with_flags,
            "totalSessions": total_sessions,
            "flagRatePct": flag_rate,
            "topTopics": top_topics,
        },
        "agentAdoption": {
            "agentsUsingPlatform": agents_using,
            "totalAgents": total_agents,
            "adoptionRatePct": adoption_rate,
            "leadsProcessedThroughPlatform": leads_processed_platform,
            "totalLeads": total_leads,
        },
        "agentTimeSaved": {
            "avgSearchTimeMs": avg_search_ms,
            "avgSearchTimeMinutes": avg_search_min,
            "manualBaselineMinutes": manual_baseline_min,
            "estimatedMinutesSavedPerLead": saved_per_lead,
            "totalSearches": total_searches,
            "totalHoursSaved": total_hours_saved,
        },
    }


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
