from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Dict, Any
from uuid import uuid4
from datetime import datetime
from fastapi.responses import Response


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


def _basic_listings(city: str) -> List[Dict[str, Any]]:
    return [
        {
            "id": "mls-101",
            "price": 425000,
            "bedrooms": 3,
            "bathrooms": 2,
            "property_type": "single-family",
            "address": "12 Oak St",
            "city": city,
            "state": "MA",
            "square_feet": 1550,
            "description": "Charming home with updated kitchen and fenced yard.",
        },
        {
            "id": "mls-102",
            "price": 505000,
            "bedrooms": 4,
            "bathrooms": 3,
            "property_type": "single-family",
            "address": "98 Pine Ave",
            "city": city,
            "state": "MA",
            "square_feet": 1900,
            "description": "Spacious home close to downtown.",
        },
    ]


@router.post("/listings/search")
def listings_search(payload: Dict[str, Any]):
    city = "Worcester"
    basic = _basic_listings(city)
    top = {
        "listing": basic[0],
        "match_score": 0.82,
        "label": "Strong match",
        "matched_features": ["budget fit", "3 beds"],
        "dealbreaker_flags": [],
        "reason": "Great value in desired city with right bedrooms.",
        "score_breakdown": _score_breakdown(82),
    }
    other = {
        "listing": basic[1],
        "match_score": 0.74,
        "label": "Good match",
        "matched_features": ["near amenities"],
        "dealbreaker_flags": [],
        "reason": "Slightly above budget but strong fit otherwise.",
        "score_breakdown": _score_breakdown(74),
    }
    return {
        "top_picks": [top],
        "other_matches": [other],
        "chat_blocks": [
            "Top pick: 12 Oak St — budget fit, 3BR, great value.",
            "Consider 98 Pine Ave — slightly above budget but compelling."
        ],
        "search_summary": {
            "total_found": 2,
            "top_picks_count": 1,
            "other_matches_count": 1,
            "search_criteria": {
                "budget": "$400K - $550K",
                "bedrooms": 3,
                "property_type": "single-family",
                "location": city,
            },
        },
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
    city = "Worcester"
    basic = _basic_listings(city)
    def to_enh(l, score, label, reason):
        return {
            "listing": {
                **l,
                "images": [
                    f"/api/placeholder/400/300",
                    f"/api/placeholder/400/300",
                ],
                "features": ["modern_kitchen", "fenced_yard"],
            },
            "match_score": score / 100.0,
            "label": label,
            "matched_features": ["budget fit", "location fit"],
            "visualTagMatches": ["bright_kitchen"],
            "visualFlags": [],
            "enhancedReason": reason,
            "score_breakdown": _score_breakdown(score),
            "visualAnalysis": {
                "analyses": [
                    {
                        "imageUrl": f"/api/placeholder/400/300",
                        "imageType": "kitchen",
                        "visualTags": ["modern", "bright"],
                        "summary": "Bright modern kitchen with good finishes.",
                        "flags": [],
                        "confidence": 90,
                    }
                ],
                "overallTags": ["move_in_ready"],
                "overallFlags": [],
            },
        }
    top = to_enh(basic[0], 84, "Top match", "Great kitchen and budget fit, strong rental comps.")
    other = to_enh(basic[1], 72, "Good match", "Slightly above budget but compelling neighborhood.")
    return {
        "top_picks": [top],
        "other_matches": [other],
        "properties_without_images": [],
        "chat_blocks": [
            "Top pick with visual confirmation: 12 Oak St.",
            "Also consider 98 Pine Ave."
        ],
        "search_summary": {
            "total_found": 2,
            "top_picks_count": 1,
            "other_matches_count": 1,
            "visual_analysis_count": 1,
            "search_criteria": {"city": city},
        },
        "cache_status": {"from_cache": False},
    }


@router.post("/listings/search-hybrid")
def listings_search_hybrid(payload: Dict[str, Any]):
    city = "Worcester"
    basic = _basic_listings(city)
    def to_h(l, score, label, reason):
        return {
            "listing": l,
            "match_score": score / 100.0,
            "label": label,
            "matched_features": ["budget fit"],
            "reason": reason,
            "score_breakdown": _score_breakdown(score),
        }
    top = to_h(basic[0], 80, "Top match", "Great balance of price and features.")
    other = to_h(basic[1], 69, "Decent match", "Slight stretch but worth a look.")
    return {
        "top_picks": [top],
        "other_matches": [other],
        "chat_blocks": ["Hybrid search found strong options."]
        ,
        "search_summary": {
            "total_found": 2,
            "top_picks_count": 1,
            "other_matches_count": 1,
            "search_criteria": {"city": city},
        },
        "search_type": "hybrid",
        "analysis_in_progress": False,
        "analysis_progress": {"total": 2, "completed": 2, "currentProperty": None},
        "cache_status": {"from_cache": False},
    }


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

