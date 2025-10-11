from fastapi import APIRouter, HTTPException, Header, Depends
from typing import List, Optional
from ..models import BuyerProfile, BuyerProfileCreate, BuyerProfileUpdate
from ..db import get_conn, fetchall_dicts, fetchone_dict
from datetime import datetime
import json
from ..auth import get_current_agent_id


router = APIRouter(prefix="/api")


def _json(val):
    return json.dumps(val) if val is not None else json.dumps([])


ALLOWED_COLUMNS = {
    "name",
    "email",
    "phone",
    "location",
    "agentId",
    "createdAt",
    "buyerType",
    "budget",
    "budgetMin",
    "budgetMax",
    "homeType",
    "bedrooms",
    "bathrooms",
    "investorType",
    "investmentCapital",
    "targetMonthlyReturn",
    "targetCapRate",
    "investmentStrategy",
    "mustHaveFeatures",
    "dealbreakers",
    "preferredAreas",
    "lifestyleDrivers",
    "specialNeeds",
    "budgetFlexibility",
    "locationFlexibility",
    "timingFlexibility",
    "emotionalContext",
    "voiceTranscript",
    "inferredTags",
    "emotionalTone",
    "priorityScore",
    "rawInput",
    "inputMethod",
    "nlpConfidence",
    "version",
    "parentProfileId",
}


def _coerce_json_list(val):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return []
    return val or []


def _transform_for_db(data: dict) -> dict:
    out = {}
    for k, v in data.items():
        if k not in ALLOWED_COLUMNS:
            continue
        if isinstance(v, list):
            out[k] = json.dumps(v)
        else:
            out[k] = v
    return out


@router.get("/buyer-profiles", response_model=List[BuyerProfile])
def list_profiles(agent_id: int = Depends(get_current_agent_id)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM buyer_profiles
                WHERE agent_id = %s
                ORDER BY created_at DESC
                """,
                (agent_id,),
            )
            rows = fetchall_dicts(cur)
    result = []
    for row in rows:
        bp = BuyerProfile(**{
            **row,
            "agentId": row.get("agent_id"),
            "budgetMin": row.get("budget_min"),
            "budgetMax": row.get("budget_max"),
            "homeType": row.get("home_type"),
            "targetMonthlyReturn": row.get("target_monthly_return"),
            "targetCapRate": float(row.get("target_cap_rate")) if row.get("target_cap_rate") is not None else None,
            "mustHaveFeatures": _coerce_json_list(row.get("must_have_features")),
            "dealbreakers": _coerce_json_list(row.get("dealbreakers")),
            "preferredAreas": _coerce_json_list(row.get("preferred_areas")),
            "lifestyleDrivers": _coerce_json_list(row.get("lifestyle_drivers")),
            "specialNeeds": _coerce_json_list(row.get("special_needs")),
            "inferredTags": _coerce_json_list(row.get("inferred_tags")),
            "createdAt": row.get("created_at"),
        })
        result.append(bp)
    return result


@router.get("/buyer-profiles/{profile_id}", response_model=BuyerProfile)
def get_profile(profile_id: int, agent_id: int = Depends(get_current_agent_id)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM buyer_profiles WHERE id = %s AND agent_id = %s",
                (profile_id, agent_id)
            )
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
    return BuyerProfile(**{
        **row,
        "agentId": row.get("agent_id"),
        "budgetMin": row.get("budget_min"),
        "budgetMax": row.get("budget_max"),
        "homeType": row.get("home_type"),
        "targetMonthlyReturn": row.get("target_monthly_return"),
        "targetCapRate": float(row.get("target_cap_rate")) if row.get("target_cap_rate") is not None else None,
        "mustHaveFeatures": _coerce_json_list(row.get("must_have_features")),
        "dealbreakers": _coerce_json_list(row.get("dealbreakers")),
        "preferredAreas": _coerce_json_list(row.get("preferred_areas")),
        "lifestyleDrivers": _coerce_json_list(row.get("lifestyle_drivers")),
        "specialNeeds": _coerce_json_list(row.get("special_needs")),
        "inferredTags": _coerce_json_list(row.get("inferred_tags")),
        "createdAt": row.get("created_at"),
    })


@router.post("/buyer-profiles", response_model=BuyerProfile)
def create_profile(profile: BuyerProfileCreate, agent_id: int = Depends(get_current_agent_id)):
    data = profile.model_dump()
    # Always associate to current agent
    data["agentId"] = agent_id
    data["createdAt"] = datetime.utcnow().isoformat()
    db_map = _transform_for_db(data)
    columns = []
    values = []
    params = []
    for k, v in db_map.items():
        # map camelCase to snake_case columns
        col = (
            "agent_id" if k == "agentId" else
            "buyer_type" if k == "buyerType" else
            "budget_min" if k == "budgetMin" else
            "budget_max" if k == "budgetMax" else
            "home_type" if k == "homeType" else
            "investor_type" if k == "investorType" else
            "investment_capital" if k == "investmentCapital" else
            "target_monthly_return" if k == "targetMonthlyReturn" else
            "target_cap_rate" if k == "targetCapRate" else
            "investment_strategy" if k == "investmentStrategy" else
            "budget_flexibility" if k == "budgetFlexibility" else
            "location_flexibility" if k == "locationFlexibility" else
            "timing_flexibility" if k == "timingFlexibility" else
            "must_have_features" if k == "mustHaveFeatures" else
            "preferred_areas" if k == "preferredAreas" else
            "lifestyle_drivers" if k == "lifestyleDrivers" else
            "special_needs" if k == "specialNeeds" else
            "emotional_context" if k == "emotionalContext" else
            "emotional_tone" if k == "emotionalTone" else
            "voice_transcript" if k == "voiceTranscript" else
            "inferred_tags" if k == "inferredTags" else
            "priority_score" if k == "priorityScore" else
            "input_method" if k == "inputMethod" else
            "nlp_confidence" if k == "nlpConfidence" else
            "raw_input" if k == "rawInput" else
            "version" if k == "version" else
            "parent_profile_id" if k == "parentProfileId" else
            "created_at" if k == "createdAt" else
            k
        )
        columns.append(col)
        values.append("%s")
        params.append(v)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO buyer_profiles ({', '.join(columns)}) VALUES ({', '.join(values)}) RETURNING *",
                tuple(params),
            )
            row = fetchone_dict(cur)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create profile")
    return BuyerProfile(**{
        **row,
        "agentId": row.get("agent_id"),
        "budgetMin": row.get("budget_min"),
        "budgetMax": row.get("budget_max"),
        "homeType": row.get("home_type"),
        "targetMonthlyReturn": row.get("target_monthly_return"),
        "targetCapRate": float(row.get("target_cap_rate")) if row.get("target_cap_rate") is not None else None,
        "mustHaveFeatures": _coerce_json_list(row.get("must_have_features")),
        "dealbreakers": _coerce_json_list(row.get("dealbreakers")),
        "preferredAreas": _coerce_json_list(row.get("preferred_areas")),
        "lifestyleDrivers": _coerce_json_list(row.get("lifestyle_drivers")),
        "specialNeeds": _coerce_json_list(row.get("special_needs")),
        "inferredTags": _coerce_json_list(row.get("inferred_tags")),
        "createdAt": row.get("created_at"),
    })

@router.patch("/buyer-profiles/{profile_id}", response_model=BuyerProfile)
def update_profile(profile_id: int, updates: BuyerProfileUpdate, agent_id: int = Depends(get_current_agent_id)):
    # Verify the profile belongs to this agent
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT agent_id FROM buyer_profiles WHERE id = %s",
                (profile_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            if row[0] != agent_id:
                raise HTTPException(status_code=403, detail="Not authorized to update this profile")
    
    data = {k: v for k, v in updates.model_dump(exclude_unset=True).items() if v is not None}
    if not data:
        # Return current
        return get_profile(profile_id, agent_id)
    db_map = _transform_for_db(data)
    sets = []
    params = []
    for k, v in db_map.items():
        col = (
            "agent_id" if k == "agentId" else
            "buyer_type" if k == "buyerType" else
            "budget_min" if k == "budgetMin" else
            "budget_max" if k == "budgetMax" else
            "home_type" if k == "homeType" else
            "investor_type" if k == "investorType" else
            "investment_capital" if k == "investmentCapital" else
            "target_monthly_return" if k == "targetMonthlyReturn" else
            "target_cap_rate" if k == "targetCapRate" else
            "investment_strategy" if k == "investmentStrategy" else
            "budget_flexibility" if k == "budgetFlexibility" else
            "location_flexibility" if k == "locationFlexibility" else
            "timing_flexibility" if k == "timingFlexibility" else
            "must_have_features" if k == "mustHaveFeatures" else
            "preferred_areas" if k == "preferredAreas" else
            "lifestyle_drivers" if k == "lifestyleDrivers" else
            "special_needs" if k == "specialNeeds" else
            "emotional_context" if k == "emotionalContext" else
            "emotional_tone" if k == "emotionalTone" else
            "voice_transcript" if k == "voiceTranscript" else
            "inferred_tags" if k == "inferredTags" else
            "priority_score" if k == "priorityScore" else
            "input_method" if k == "inputMethod" else
            "nlp_confidence" if k == "nlpConfidence" else
            "raw_input" if k == "rawInput" else
            "version" if k == "version" else
            "parent_profile_id" if k == "parentProfileId" else
            k
        )
        sets.append(f"{col} = %s")
        params.append(v)
    params.append(profile_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE buyer_profiles SET {', '.join(sets)} WHERE id = %s RETURNING *",
                tuple(params),
            )
            row = fetchone_dict(cur)
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    return BuyerProfile(**{
        **row,
        "agentId": row.get("agent_id"),
        "budgetMin": row.get("budget_min"),
        "budgetMax": row.get("budget_max"),
        "homeType": row.get("home_type"),
        "targetMonthlyReturn": row.get("target_monthly_return"),
        "targetCapRate": float(row.get("target_cap_rate")) if row.get("target_cap_rate") is not None else None,
        "mustHaveFeatures": row.get("must_have_features") or [],
        "dealbreakers": row.get("dealbreakers") or [],
        "preferredAreas": row.get("preferred_areas") or [],
        "lifestyleDrivers": row.get("lifestyle_drivers") or [],
        "specialNeeds": row.get("special_needs") or [],
        "inferredTags": row.get("inferred_tags") or [],
        "createdAt": row.get("created_at"),
    })

@router.delete("/buyer-profiles/{profile_id}")
def delete_profile(profile_id: int, agent_id: int = Depends(get_current_agent_id)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # First verify the profile belongs to this agent
            cur.execute(
                "SELECT agent_id FROM buyer_profiles WHERE id = %s",
                (profile_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            if row[0] != agent_id:
                raise HTTPException(status_code=403, detail="Not authorized to delete this profile")
            
            # Delete dependent rows to satisfy FK constraints
            # Search transactions and results
            cur.execute("SELECT transaction_id FROM search_transactions WHERE profile_id = %s", (profile_id,))
            tids = [row[0] for row in cur.fetchall()]
            if tids:
                # psycopg supports passing list for ANY with array casting
                cur.execute("DELETE FROM search_transaction_results WHERE transaction_id = ANY(%s)", (tids,))
            cur.execute("DELETE FROM search_transactions WHERE profile_id = %s", (profile_id,))

            # Caches and logs
            cur.execute("DELETE FROM cached_search_results WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM nlp_search_logs WHERE profile_id = %s", (profile_id,))

            # Investment strategies
            cur.execute("DELETE FROM investment_strategies WHERE profile_id = %s", (profile_id,))

            # Share links
            cur.execute("DELETE FROM profile_shareable_links WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM listing_shareable_links WHERE profile_id = %s", (profile_id,))

            # Feedback/notes/locks/tags/persona
            cur.execute("DELETE FROM agent_insight_feedback WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM agent_action_feedback WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM agent_notes WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM profile_insights_lock WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM profile_tags WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM profile_persona WHERE profile_id = %s", (profile_id,))

            # Finally, the profile
            cur.execute("DELETE FROM buyer_profiles WHERE id = %s", (profile_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Profile not found")
    return {"success": True}
