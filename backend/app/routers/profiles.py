from fastapi import APIRouter, HTTPException, Header, Depends
from typing import List, Optional
from ..models import BuyerProfile, BuyerProfileCreate, BuyerProfileUpdate
from ..db import get_conn, fetchall_dicts, fetchone_dict
from ..services.insights_analyzer import generate_buyer_insights
from .nlp import _generate_complete_insights
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
    "maxBedrooms",
    "minBedrooms",
    "bathrooms",
    "minBathrooms",
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
    # AI-generated insights (migrations 007, 008)
    "aiSummary",
    "decisionDrivers",
    "constraints",
    "niceToHaves",
    "flexibilityExplanations",
    "visionChecklist",
    "rawInput",
    "inputMethod",
    "nlpConfidence",
    "version",
    "parentProfileId",
    # Commute fields
    "workAddress",
    "maxCommuteMins",
}


def _coerce_json_list(val):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return []
    return val or []


def _coerce_json_dict(val):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {}
    return val or {}


def _row_to_profile(row: dict) -> dict:
    """Convert a database row to a BuyerProfile dict with proper field mapping."""
    return {
        **row,
        "agentId": row.get("agent_id"),
        "budgetMin": row.get("budget_min"),
        "budgetMax": row.get("budget_max"),
        "homeType": row.get("home_type"),
        "maxBedrooms": row.get("max_bedrooms"),
        "minBedrooms": row.get("min_bedrooms"),
        "minBathrooms": float(row.get("min_bathrooms")) if row.get("min_bathrooms") is not None else None,
        "targetMonthlyReturn": row.get("target_monthly_return"),
        "targetCapRate": float(row.get("target_cap_rate")) if row.get("target_cap_rate") is not None else None,
        "mustHaveFeatures": _coerce_json_list(row.get("must_have_features")),
        "dealbreakers": _coerce_json_list(row.get("dealbreakers")),
        "preferredAreas": _coerce_json_list(row.get("preferred_areas")),
        "lifestyleDrivers": _coerce_json_list(row.get("lifestyle_drivers")),
        "specialNeeds": _coerce_json_list(row.get("special_needs")),
        "inferredTags": _coerce_json_list(row.get("inferred_tags")),
        "budgetFlexibility": row.get("budget_flexibility"),
        "locationFlexibility": row.get("location_flexibility"),
        "timingFlexibility": row.get("timing_flexibility"),
        "priorityScore": row.get("priority_score"),
        # AI-generated insights
        "aiSummary": row.get("ai_summary"),
        "decisionDrivers": _coerce_json_list(row.get("decision_drivers")),
        "constraints": _coerce_json_list(row.get("constraints")),
        "niceToHaves": _coerce_json_list(row.get("nice_to_haves")),
        "flexibilityExplanations": _coerce_json_dict(row.get("flexibility_explanations")),
        "visionChecklist": _coerce_json_dict(row.get("vision_checklist")),
        "createdAt": row.get("created_at"),
        # Commute fields
        "workAddress": row.get("work_address"),
        "maxCommuteMins": row.get("max_commute_mins"),
    }


def _transform_for_db(data: dict) -> dict:
    out = {}
    for k, v in data.items():
        if k not in ALLOWED_COLUMNS:
            continue
        if isinstance(v, (list, dict)):
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
        bp = BuyerProfile(**_row_to_profile(row))
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
    profile_data = _row_to_profile(row)
    return BuyerProfile(**profile_data)


@router.get("/buyer-profiles/{profile_id}/lead")
def get_profile_lead(profile_id: int, agent_id: int = Depends(get_current_agent_id)):
    """
    Get the parent lead data for a profile created from a lead conversion.
    Returns lead details including property info, source, and lifecycle status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get profile with lead info
            cur.execute("""
                SELECT parent_lead_id, created_by_method
                FROM buyer_profiles
                WHERE id = %s AND agent_id = %s
            """, (profile_id, agent_id))
            profile_row = fetchone_dict(cur)

            if not profile_row:
                raise HTTPException(status_code=404, detail="Profile not found")

            parent_lead_id = profile_row.get("parent_lead_id")
            created_by_method = profile_row.get("created_by_method") or "agent"

            if not parent_lead_id:
                return {
                    "hasLead": False,
                    "createdByMethod": created_by_method
                }

            # Get full lead data
            cur.execute("""
                SELECT id, agent_id, status, role, role_reason, lead_type, lead_type_reason,
                       source, property_url, property_address,
                       intent_score, intent_reasons,
                       extracted_name, extracted_email, extracted_phone,
                       extracted_location, extracted_budget,
                       extracted_budget_min, extracted_budget_max,
                       extracted_bedrooms, extracted_bathrooms,
                       extracted_home_type, extracted_timeline,
                       hints, suggested_message, clarifying_question, what_to_clarify,
                       mls_search_status, mls_matches, extraction_confidence,
                       property_listing_id, property_list_price,
                       property_bedrooms, property_bathrooms,
                       property_sqft, property_image_url, property_raw,
                       raw_input, raw_input_normalized,
                       created_at, engaged_at, converted_at, converted_profile_id,
                       report_sent_at, report_share_id
                FROM leads WHERE id = %s
            """, (parent_lead_id,))
            lead_row = fetchone_dict(cur)

            if not lead_row:
                return {
                    "hasLead": False,
                    "createdByMethod": created_by_method,
                    "error": "Lead record not found"
                }

            # Parse JSON fields
            def parse_json(val):
                if val is None:
                    return None
                if isinstance(val, (list, dict)):
                    return val
                if isinstance(val, str):
                    try:
                        return json.loads(val)
                    except:
                        return val
                return val

            # Build lead response
            lead_data = {
                "id": lead_row["id"],
                "agentId": lead_row["agent_id"],
                "status": lead_row["status"],
                "role": lead_row["role"],
                "roleReason": lead_row["role_reason"],
                "leadType": lead_row["lead_type"],
                "leadTypeReason": lead_row["lead_type_reason"],
                "source": lead_row["source"],
                "propertyUrl": lead_row["property_url"],
                "propertyAddress": lead_row["property_address"],
                "intentScore": lead_row["intent_score"],
                "intentReasons": parse_json(lead_row["intent_reasons"]) or [],
                "extractedName": lead_row["extracted_name"],
                "extractedEmail": lead_row["extracted_email"],
                "extractedPhone": lead_row["extracted_phone"],
                "extractedLocation": lead_row["extracted_location"],
                "extractedBudget": lead_row["extracted_budget"],
                "extractedBudgetMin": lead_row["extracted_budget_min"],
                "extractedBudgetMax": lead_row["extracted_budget_max"],
                "extractedBedrooms": lead_row["extracted_bedrooms"],
                "extractedBathrooms": lead_row["extracted_bathrooms"],
                "extractedHomeType": lead_row["extracted_home_type"],
                "extractedTimeline": lead_row["extracted_timeline"],
                "hints": parse_json(lead_row["hints"]) or [],
                "suggestedMessage": lead_row["suggested_message"],
                "clarifyingQuestion": lead_row["clarifying_question"],
                "whatToClarify": parse_json(lead_row["what_to_clarify"]) or [],
                "mlsSearchStatus": lead_row["mls_search_status"],
                "mlsMatches": parse_json(lead_row["mls_matches"]),
                "extractionConfidence": lead_row["extraction_confidence"],
                # Property details from Repliers API
                "propertyListingId": lead_row.get("property_listing_id"),
                "propertyListPrice": lead_row.get("property_list_price"),
                "propertyBedrooms": lead_row.get("property_bedrooms"),
                "propertyBathrooms": lead_row.get("property_bathrooms"),
                "propertySqft": lead_row.get("property_sqft"),
                "propertyImageUrl": lead_row.get("property_image_url"),
                "propertyRaw": parse_json(lead_row.get("property_raw")),
                "rawInput": lead_row["raw_input"],
                "rawInputNormalized": lead_row["raw_input_normalized"],
                "createdAt": lead_row["created_at"].isoformat() if lead_row["created_at"] else None,
                "engagedAt": lead_row["engaged_at"].isoformat() if lead_row.get("engaged_at") else None,
                "convertedAt": lead_row["converted_at"].isoformat() if lead_row.get("converted_at") else None,
                "convertedProfileId": lead_row["converted_profile_id"],
                # Report tracking
                "reportSentAt": lead_row["report_sent_at"].isoformat() if lead_row.get("report_sent_at") else None,
                "reportShareId": lead_row.get("report_share_id"),
            }

            return {
                "hasLead": True,
                "createdByMethod": created_by_method,
                "lead": lead_data
            }


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
            "max_bedrooms" if k == "maxBedrooms" else
            "min_bedrooms" if k == "minBedrooms" else
            "min_bathrooms" if k == "minBathrooms" else
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
            "ai_summary" if k == "aiSummary" else
            "decision_drivers" if k == "decisionDrivers" else
            "constraints" if k == "constraints" else
            "nice_to_haves" if k == "niceToHaves" else
            "flexibility_explanations" if k == "flexibilityExplanations" else
            "vision_checklist" if k == "visionChecklist" else
            "input_method" if k == "inputMethod" else
            "nlp_confidence" if k == "nlpConfidence" else
            "raw_input" if k == "rawInput" else
            "version" if k == "version" else
            "parent_profile_id" if k == "parentProfileId" else
            "created_at" if k == "createdAt" else
            "work_address" if k == "workAddress" else
            "max_commute_mins" if k == "maxCommuteMins" else
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
    return BuyerProfile(**_row_to_profile(row))

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
            "max_bedrooms" if k == "maxBedrooms" else
            "min_bedrooms" if k == "minBedrooms" else
            "min_bathrooms" if k == "minBathrooms" else
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
            "ai_summary" if k == "aiSummary" else
            "decision_drivers" if k == "decisionDrivers" else
            "constraints" if k == "constraints" else
            "nice_to_haves" if k == "niceToHaves" else
            "flexibility_explanations" if k == "flexibilityExplanations" else
            "vision_checklist" if k == "visionChecklist" else
            "input_method" if k == "inputMethod" else
            "nlp_confidence" if k == "nlpConfidence" else
            "raw_input" if k == "rawInput" else
            "version" if k == "version" else
            "parent_profile_id" if k == "parentProfileId" else
            "work_address" if k == "workAddress" else
            "max_commute_mins" if k == "maxCommuteMins" else
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
    return BuyerProfile(**_row_to_profile(row))

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
            cur.execute("DELETE FROM repliers_listings WHERE profile_id = %s", (profile_id,))

            # Finally, the profile
            cur.execute("DELETE FROM buyer_profiles WHERE id = %s", (profile_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Profile not found")
    return {"success": True}


@router.post("/buyer-profiles/{profile_id}/regenerate-insights", response_model=BuyerProfile)
def regenerate_profile_insights(profile_id: int, agent_id: int = Depends(get_current_agent_id)):
    """
    Regenerate AI insights for a buyer profile.

    Called after conversational edits to update:
    - aiSummary
    - decisionDrivers
    - constraints
    - flexibilityExplanations
    """
    # First, get the current profile
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM buyer_profiles WHERE id = %s AND agent_id = %s",
                (profile_id, agent_id)
            )
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")

    # Convert to profile dict for insight generation
    profile_data = _row_to_profile(row)

    # Generate new AI insights
    print(f"[REGENERATE INSIGHTS] Generating insights for profile {profile_id}...")
    try:
        insights = _generate_complete_insights(profile_data)
        print(f"[REGENERATE INSIGHTS] Generated insights: {list(insights.keys())}")
    except Exception as e:
        print(f"[REGENERATE INSIGHTS] Failed to generate insights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {str(e)}")

    # Update the profile with new insights
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE buyer_profiles
                SET ai_summary = %s,
                    decision_drivers = %s,
                    constraints = %s,
                    flexibility_explanations = %s
                WHERE id = %s AND agent_id = %s
                RETURNING *
                """,
                (
                    insights.get("aiSummary"),
                    json.dumps(insights.get("decisionDrivers", [])),
                    json.dumps(insights.get("constraints", [])),
                    json.dumps(insights.get("flexibilityExplanations", {})),
                    profile_id,
                    agent_id
                )
            )
            updated_row = fetchone_dict(cur)
            if not updated_row:
                raise HTTPException(status_code=500, detail="Failed to update profile with insights")

    print(f"[REGENERATE INSIGHTS] Profile {profile_id} updated successfully")
    return BuyerProfile(**_row_to_profile(updated_row))


@router.get("/buyer-insights/{profile_id}")
def get_buyer_insights(profile_id: int, agent_id: int = Depends(get_current_agent_id)):
    """
    Generate on-demand buyer insights by analyzing chat history with LLM.
    
    Returns comprehensive insights including:
    - Statistics: session counts, sentiment, engagement metrics
    - LLM Insights: preferences, dealbreakers, readiness score, key quotes
    - Recent Interactions: property likes/dislikes with reasons
    - Sentiment History: trend data for charts
    """
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
                raise HTTPException(status_code=403, detail="Not authorized to access this profile")
    
    # Generate insights
    try:
        insights = generate_buyer_insights(profile_id)
        return insights
    except Exception as e:
        print(f"[BUYER INSIGHTS] Error generating insights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {str(e)}")


@router.get("/buyer-profiles/{profile_id}/chat-insights")
def get_profile_chat_insights(profile_id: int, agent_id: int = Depends(get_current_agent_id)):
    """
    Get chatbot session insights for a buyer profile.
    Returns actionable insights from chatbot conversations including:
    - Captured preferences
    - Properties discussed
    - Risk topics flagged
    - Suggested actions
    - Ready-to-use follow-up message
    """
    from ..services.chat_insights import get_chat_insights

    # Verify the profile belongs to this agent and get profile details
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, agent_id, name, email FROM buyer_profiles WHERE id = %s",
                (profile_id,)
            )
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            if row["agent_id"] != agent_id:
                raise HTTPException(status_code=403, detail="Not authorized to access this profile")

    buyer_name = row.get("name")
    buyer_email = row.get("email")

    # Get chat insights
    chat_insights = get_chat_insights(
        profile_id=profile_id,
        buyer_name=buyer_name,
        buyer_email=buyer_email
    )

    if not chat_insights.get("hasSession"):
        return {
            "hasSession": False,
            "summary": {
                "totalMessages": 0,
                "engagementLevel": "LOW",
                "readiness": "LOW",
                "preferences": {},
                "propertiesDiscussed": []
            },
            "insights": None
        }

    return chat_insights
