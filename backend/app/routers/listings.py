from fastapi import APIRouter, Query, HTTPException
from typing import List, Dict, Any
from uuid import uuid4
from datetime import datetime
from fastapi.responses import Response
from ..services.repliers import RepliersClient, RepliersError
from ..db import get_conn, fetchone_dict


router = APIRouter(prefix="/api")


def _score_breakdown(base=75):
    return {
        "feature_match": 20,
        "budget_match": 25,
        "bedroom_match": 15,
        "location_match": 22,
        "visual_tag_match": 0,
        "behavioral_tag_match": 0,
        "listing_quality_score": 5,
        "dealbreaker_penalty": 0,
        "missing_data_penalty": 0,
        "visual_boost": 0,
        "raw_total": base,
        "final_score": base,
    }



@router.post("/listings/search")
def listings_search(payload: Dict[str, Any]):
    profile_id = payload.get("profileId")
    if not profile_id:
        raise HTTPException(status_code=400, detail="profileId is required")
    # Load profile from DB to build filters; allow override via payload.profile for testing
    profile = payload.get("profile") or {}
    if not profile:
        profile = _load_profile(profile_id)
    
    client = RepliersClient()
    try:
        listings = client.search(profile)
    except RepliersError as e:
        print(f"[LISTINGS SEARCH ERROR] RepliersError for profile {profile_id}: {e}")
        return {
            "top_picks": [],
            "other_matches": [],
            "chat_blocks": [],
            "search_summary": {
                "total_found": 0,
                "top_picks_count": 0,
                "other_matches_count": 0,
                "search_criteria": profile,
                "error": str(e),
            },
        }
    except Exception as e:
        print(f"[LISTINGS SEARCH ERROR] Unexpected error for profile {profile_id}: {e}")
        import traceback
        traceback.print_exc()
        return {
            "top_picks": [],
            "other_matches": [],
            "chat_blocks": [],
            "search_summary": {
                "total_found": 0,
                "top_picks_count": 0,
                "other_matches_count": 0,
                "search_criteria": profile,
                "error": str(e),
            },
        }
    # Simple scoring based on budget and bedrooms match
    def score(l: Dict[str, Any]) -> float:
        s = 50.0
        try:
            price = l.get("price") or 0
            bmin = profile.get("budgetMin") or 0
            bmax = profile.get("budgetMax") or 0
            if bmin and bmax and bmin <= price <= bmax:
                s += 25
            elif bmin and price >= bmin:
                s += 10
            elif bmax and price <= bmax:
                s += 10
            beds_req = profile.get("bedrooms")
            if beds_req is not None and l.get("bedrooms") is not None:
                s += 15 if int(l["bedrooms"]) >= int(beds_req) else 5
        except Exception:
            pass
        return min(100.0, s)
    scored = [
        {
            "listing": l,
            "match_score": score(l) / 100.0,
            "label": "Match",
            "matched_features": [],
            "dealbreaker_flags": [],
            "reason": "",
            "score_breakdown": _score_breakdown(int(score(l))),
        }
        for l in listings
    ]
    top = [x for x in scored if x["match_score"] >= 0.8]
    others = [x for x in scored if x["match_score"] < 0.8]
    
    # Check if we got results from the requested location
    requested_location = profile.get("location", "")
    location_match = False
    if listings and requested_location:
        # Extract requested city/state
        requested_parts = requested_location.split(",")
        if len(requested_parts) >= 2:
            req_city = requested_parts[0].strip().lower()
            req_state = requested_parts[1].strip().lower()
            # Check if any listing matches the requested location
            location_match = any(
                l.get("city", "").lower() == req_city or 
                l.get("state", "").lower() == req_state
                for l in listings
            )
    
    return {
        "top_picks": top,
        "other_matches": others,
        "chat_blocks": [],
        "search_summary": {
            "total_found": len(listings),
            "top_picks_count": len(top),
            "other_matches_count": len(others),
            "search_criteria": profile,
            "location_mismatch": not location_match if requested_location else False,
            "warning": f"No properties found in {requested_location}. Showing properties from available regions." if not location_match and requested_location and listings else None,
        },
    }


def _load_profile(profile_id: int) -> Dict[str, Any]:
    """Fetch and normalize minimal profile fields used to build a Repliers query."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT name, email, phone, location, agent_id,
                       buyer_type, budget, budget_min, budget_max, home_type,
                       bedrooms, bathrooms, must_have_features, dealbreakers, preferred_areas,
                       lifestyle_drivers, special_needs, budget_flexibility, location_flexibility,
                       timing_flexibility, emotional_context, voice_transcript, inferred_tags,
                       emotional_tone, priority_score, raw_input, input_method, nlp_confidence,
                       version, parent_profile_id
                FROM buyer_profiles WHERE id = %s
                """,
                (profile_id,),
            )
            row = fetchone_dict(cur)
    if not row:
        return {}
    def cj(v):
        if isinstance(v, str):
            try:
                import json
                return json.loads(v)
            except Exception:
                return []
        return v or []
    
    # Parse budget - handle both budget string and budgetMin/budgetMax fields
    budget_min = row.get("budget_min")
    budget_max = row.get("budget_max")
    budget_str = row.get("budget")
    
    # If budgetMin/Max not set but budget string exists, parse it
    if not budget_min and not budget_max and budget_str:
        try:
            # Try to parse budget string as a number
            budget_val = int(str(budget_str).replace(",", "").replace("$", "").strip())
            # Set a reasonable range (e.g., ±10% or use the exact value)
            budget_min = int(budget_val * 0.8)  # 80% of budget as min
            budget_max = int(budget_val * 1.2)  # 120% of budget as max
        except (ValueError, AttributeError):
            pass
    
    return {
        "name": row.get("name"),
        "email": row.get("email"),
        "phone": row.get("phone"),
        "location": row.get("location"),
        "agentId": row.get("agent_id"),
        "buyerType": row.get("buyer_type"),
        "budget": row.get("budget"),
        "budgetMin": budget_min,
        "budgetMax": budget_max,
        "homeType": row.get("home_type"),
        "bedrooms": row.get("bedrooms"),
        "bathrooms": row.get("bathrooms"),
        "mustHaveFeatures": cj(row.get("must_have_features")),
        "dealbreakers": cj(row.get("dealbreakers")),
        "preferredAreas": cj(row.get("preferred_areas")),
        "lifestyleDrivers": cj(row.get("lifestyle_drivers")),
        "specialNeeds": cj(row.get("special_needs")),
        "budgetFlexibility": row.get("budget_flexibility"),
        "locationFlexibility": row.get("location_flexibility"),
        "timingFlexibility": row.get("timing_flexibility"),
        "priorityScore": row.get("priority_score"),
        "inputMethod": row.get("input_method"),
    }


@router.get("/cache/status/{profile_id}")
def cache_status(profile_id: int, searchMethod: str = Query("enhanced")):
    return {
        "isCached": False,
        "isExpired": True,
        "lastUpdated": None,
        "expiresAt": None,
        "cacheAge": 0,
    }


@router.post("/listings/search-enhanced")
def listings_search_enhanced(payload: Dict[str, Any]):
    # Same as basic search but returns the enhanced envelope without faked visual data
    res = listings_search(payload)
    # Ensure enhanced fields exist
    res["properties_without_images"] = []
    res.setdefault("search_summary", {})
    res.setdefault("cache_status", {"from_cache": False})
    return res


@router.post("/listings/search-hybrid")
def listings_search_hybrid(payload: Dict[str, Any]):
    res = listings_search(payload)
    res["search_type"] = "hybrid"
    res["analysis_in_progress"] = False
    res["analysis_progress"] = {"total": res["search_summary"]["total_found"], "completed": res["search_summary"]["total_found"], "currentProperty": None}
    res["cache_status"] = {"from_cache": False}
    return res


@router.post("/listings/share")
def listings_share(payload: Dict[str, Any]):
    share_id = str(uuid4())
    listing_id = payload.get("listingId")
    return {
        "shareId": share_id,
        "shareUrl": f"/client/{share_id}?listingId={listing_id}",
    }


@router.post("/listings/copy-text")
def listings_copy_text(payload: Dict[str, Any]):
    listing_id = payload.get("listingId")
    text = f"Check out this property {listing_id} — looks like a great fit!"
    return {"copyText": text}


@router.post("/listings/generate-personal-message")
def listings_generate_personal_message(payload: Dict[str, Any]):
    listing_id = payload.get("listingId")
    msg = (
        f"Hi! I found a property (ID {listing_id}) that matches your criteria — great kitchen, within budget, and in a solid area."
    )
    return {"personalMessage": msg}


@router.get("/placeholder/{w}/{h}")
def placeholder(w: int, h: int):
    svg = f"""
    <svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}'>
      <rect width='100%' height='100%' fill='#e5e7eb'/>
      <text x='50%' y='50%' font-family='Arial' font-size='14' fill='#6b7280' text-anchor='middle' dominant-baseline='middle'>
        {w} x {h}
      </text>
    </svg>
    """.strip()
    return Response(content=svg, media_type="image/svg+xml")
