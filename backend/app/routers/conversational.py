from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Any
from ..db import get_conn, fetchone_dict
import re
import json


router = APIRouter(prefix="/api")


class ParseChangesRequest(BaseModel):
    text: str
    currentProfile: dict


class ChangeItem(BaseModel):
    field: str
    oldValue: Any | None = None
    newValue: Any | None = None
    confidence: int = 80
    action: str


class ApplyChangesRequest(BaseModel):
    changes: List[ChangeItem]


@router.post("/buyer-profiles/{profile_id}/parse-changes")
def parse_changes(profile_id: int, req: ParseChangesRequest):
    text = req.text.lower()
    changes: List[ChangeItem] = []

    # Budget increase pattern
    m_inc = re.search(r"increase budget by \$?(\d+)k", text)
    if m_inc and (req.currentProfile.get("budgetMin") or req.currentProfile.get("budgetMax")):
        inc = int(m_inc.group(1)) * 1000
        old_min = req.currentProfile.get("budgetMin") or 0
        old_max = req.currentProfile.get("budgetMax") or 0
        changes.append(ChangeItem(field="budgetMin", oldValue=old_min, newValue=old_min + inc, action="update"))
        changes.append(ChangeItem(field="budgetMax", oldValue=old_max, newValue=old_max + inc, action="update"))

    # Direct budget set pattern
    m_set = re.search(r"change budget to \$?(\d+)[k]?", text)
    if m_set:
        val = int(m_set.group(1))
        val = val * 1000 if 'k' in req.text.lower() else val
        changes.append(ChangeItem(field="budgetMin", oldValue=req.currentProfile.get("budgetMin"), newValue=val, action="update"))
        changes.append(ChangeItem(field="budgetMax", oldValue=req.currentProfile.get("budgetMax"), newValue=val, action="update"))

    # Add feature
    m_add = re.search(r"add (.+?) to must-haves|add (.+)", text)
    if m_add:
        feat = (m_add.group(1) or m_add.group(2) or "").strip()
        if feat:
            changes.append(ChangeItem(field="mustHaveFeatures", newValue=feat, action="add"))

    # Remove feature
    m_rm = re.search(r"remove (.+)", text)
    if m_rm:
        feat = (m_rm.group(1) or "").strip()
        if feat:
            changes.append(ChangeItem(field="dealbreakers", newValue=feat, action="add"))

    # Bedrooms adjustment
    m_bed_plus = re.search(r"add (\d+) more bedroom", text)
    if m_bed_plus:
        add = int(m_bed_plus.group(1))
        old = int(req.currentProfile.get("bedrooms") or 0)
        changes.append(ChangeItem(field="bedrooms", oldValue=old, newValue=old + add, action="update"))

    return {"changes": [c.model_dump() for c in changes], "confidence": 85}


@router.patch("/buyer-profiles/{profile_id}/apply-changes")
def apply_changes(profile_id: int, req: ApplyChangesRequest):
    updates = {}
    features_add: List[str] = []
    for ch in req.changes:
        if ch.field in ("budgetMin", "budgetMax", "bedrooms") and ch.newValue is not None:
            updates[{
                "budgetMin": "budget_min",
                "budgetMax": "budget_max",
                "bedrooms": "bedrooms",
            }[ch.field]] = ch.newValue
        elif ch.field == "mustHaveFeatures" and ch.action == "add" and ch.newValue:
            features_add.append(str(ch.newValue))
        elif ch.field == "dealbreakers" and ch.action == "add" and ch.newValue:
            # store in dealbreakers list as preference to avoid destructive changes
            updates.setdefault("dealbreakers", None)

    # Fetch current lists
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT must_have_features, dealbreakers FROM buyer_profiles WHERE id = %s", (profile_id,))
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            current_must = row.get("must_have_features") or []
            current_deal = row.get("dealbreakers") or []

    if features_add:
        current_must = list({*current_must, *features_add})

    # Build SQL parts
    sets = []
    params = []
    if "budget_min" in updates:
        sets.append("budget_min = %s")
        params.append(updates["budget_min"])
    if "budget_max" in updates:
        sets.append("budget_max = %s")
        params.append(updates["budget_max"])
    if "bedrooms" in updates:
        sets.append("bedrooms = %s")
        params.append(updates["bedrooms"])
    sets.append("must_have_features = %s")
    params.append(json.dumps(current_must))
    sets.append("dealbreakers = %s")
    params.append(json.dumps(current_deal))
    params.append(profile_id)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE buyer_profiles SET {', '.join(sets)} WHERE id = %s RETURNING *",
                tuple(params),
            )
            row = fetchone_dict(cur)
    # Return updated profile in UI shape
    def cj(v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []
    result = {
        **row,
        "agentId": row.get("agent_id"),
        "budgetMin": row.get("budget_min"),
        "budgetMax": row.get("budget_max"),
        "homeType": row.get("home_type"),
        "targetMonthlyReturn": row.get("target_monthly_return"),
        "targetCapRate": float(row.get("target_cap_rate")) if row.get("target_cap_rate") is not None else None,
        "mustHaveFeatures": cj(row.get("must_have_features")),
        "dealbreakers": cj(row.get("dealbreakers")),
        "preferredAreas": cj(row.get("preferred_areas")),
        "lifestyleDrivers": cj(row.get("lifestyle_drivers")),
        "specialNeeds": cj(row.get("special_needs")),
        "inferredTags": cj(row.get("inferred_tags")),
        "createdAt": row.get("created_at"),
    }
    return result


@router.get("/buyer-profiles/{profile_id}/quick-suggestions")
def quick_suggestions(profile_id: int):
    # Minimal heuristics-based suggestions
    suggestions = [
        "Increase search radius by 5 miles",
        "Allow 1 fewer bathroom for better inventory",
        "Consider townhouses to expand options",
        "Raise budget by $25K to access higher quality listings",
    ]
    return {"suggestions": suggestions}
