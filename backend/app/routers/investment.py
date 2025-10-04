from fastapi import APIRouter, BackgroundTasks, HTTPException
from ..models import InvestmentChatRequest, InvestmentChatResponse, InvestmentStrategyStatus
from ..db import get_conn, fetchone_dict
from uuid import uuid4
from datetime import datetime
import json


router = APIRouter(prefix="/api")


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _complete_strategy(session_id: str):
    # Background task to mark strategy as complete with minimal content
    with get_conn() as conn:
        with conn.cursor() as cur:
            strategy = {
                "overview": "Auto-generated strategy document",
                "sections": [
                    {"title": "Market Analysis", "content": "Pending integration with research services."},
                    {"title": "Top Recommendations", "content": []},
                    {"title": "Financial Projections", "content": {}}
                ],
            }
            cur.execute(
                """
                UPDATE investment_strategies
                SET status = 'complete',
                    strategy_json = %s,
                    market_analysis = %s,
                    property_recommendations = %s,
                    financial_projections = %s,
                    generation_time = %s,
                    completed_at = %s
                WHERE session_id = %s
                RETURNING id
                """,
                (
                    json.dumps(strategy),
                    json.dumps({"note": "research TBD"}),
                    json.dumps([]),
                    json.dumps({}),
                    2000,
                    _now_iso(),
                    session_id,
                ),
            )
            _ = cur.fetchone()


@router.post("/investment-chat-enhanced", response_model=InvestmentChatResponse)
def investment_chat(req: InvestmentChatRequest, background: BackgroundTasks):
    # Simple guide flow: first message -> ask one question; second -> ready and start generation
    session_id = req.sessionId or str(uuid4())
    message_lower = req.message.lower()

    # If user mentions budget and location, proceed
    ready = any(x in message_lower for x in ["$", "budget", "capital"]) and any(
        x in message_lower for x in ["ma", "massachusetts", "worcester", "springfield", "boston", "location"]
    )

    if not ready:
        return InvestmentChatResponse(
            type="question",
            message="Great! How much capital do you have available and which city are you targeting in MA?",
            sessionId=session_id,
            context={"messages": [req.message]},
        )

    # Create investment strategy record in DB with status 'generating'
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO investment_strategies (
                    profile_id, session_id, status, strategy_json, market_analysis,
                    property_recommendations, financial_projections, generation_time,
                    data_sources_used, created_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) ON CONFLICT (session_id) DO NOTHING
                RETURNING id
                """,
                (
                    1,  # placeholder profile linkage; to be enhanced
                    session_id,
                    "generating",
                    json.dumps({}),
                    json.dumps({}),
                    json.dumps([]),
                    json.dumps({}),
                    0,
                    json.dumps(["research_coordinator", "smart_research"]),
                    _now_iso(),
                ),
            )
            _ = cur.fetchone()

    # Kick off background completion to simulate analysis
    background.add_task(_complete_strategy, session_id)

    return InvestmentChatResponse(
        type="ready",
        message="Thanks! I’m generating your investment strategy now. This usually takes a few minutes.",
        sessionId=session_id,
        strategyId=session_id,
        rawConversation=json.dumps({"structured": {"detectedBudget": True, "detectedLocation": True}}),
        context={"messages": [req.message]},
    )


@router.get("/investment-strategy/{session_id}", response_model=InvestmentStrategyStatus)
def strategy_status(session_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, strategy_json, property_recommendations, market_analysis, financial_projections, generation_time, completed_at FROM investment_strategies WHERE session_id = %s",
                (session_id,),
            )
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Strategy not found")
    status = row["status"]
    if status == "complete":
        return InvestmentStrategyStatus(
            status=status,
            strategy=row.get("strategy_json"),
            propertyRecommendations=row.get("property_recommendations"),
            marketAnalysis=row.get("market_analysis"),
            financialProjections=row.get("financial_projections"),
            generationTime=row.get("generation_time"),
            completedAt=row.get("completed_at"),
        )
    elif status == "failed":
        return InvestmentStrategyStatus(status="failed", message="Strategy generation failed. Please try again.")
    else:
        return InvestmentStrategyStatus(status="generating", message="Your investment strategy is being generated.")

