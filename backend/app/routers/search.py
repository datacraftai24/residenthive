from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


router = APIRouter(prefix="/api")


class AgentSearchRequest(BaseModel):
    profileId: int
    useReactive: Optional[bool] = False
    forceEnhanced: Optional[bool] = False


def _map_to_agent_listing(search_results: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert listing search results to agent dashboard format"""
    return [
        {
            "mlsNumber": x["listing"].get("mls_number") or x["listing"].get("id"),
            "address": x["listing"].get("address"),
            "city": x["listing"].get("city"),
            "state": x["listing"].get("state"),
            "zip": x["listing"].get("zip_code"),
            "listPrice": x["listing"].get("price"),
            "bedrooms": x["listing"].get("bedrooms"),
            "bathrooms": x["listing"].get("bathrooms"),
            "sqft": x["listing"].get("square_feet"),
            "propertyType": x["listing"].get("property_type"),
            "status": x["listing"].get("status"),
            "images": x["listing"].get("images", []),
            "photoCount": len(x["listing"].get("images", [])),
            "description": x["listing"].get("description"),
            "matchScore": int((x.get("match_score", 0) or 0) * 100),
            "matchLabel": x.get("label", "Match"),
            "matchReasons": x.get("matched_features", []),
            "dealbreakers": x.get("dealbreaker_flags", []),
            "aiInsights": {
                "agentSummary": x.get("agent_insight", ""),
                "headline": x.get("headline", ""),
                "whyItWorks": x.get("why_it_works", {}),
                "considerations": x.get("considerations", []),
                "matchReasoning": x.get("match_reasoning", {})
            },
            "scoreBreakdown": {
                "featureMatch": x.get("score_breakdown", {}).get("must_have_features", {}).get("score", 0),
                "budgetMatch": x.get("score_breakdown", {}).get("budget_match", {}).get("score", 0),
                "bedroomMatch": x.get("score_breakdown", {}).get("bedroom_match", {}).get("score", 0),
                "bathroomMatch": x.get("score_breakdown", {}).get("bathroom_match", {}).get("score", 0),
                "locationMatch": x.get("score_breakdown", {}).get("location_match", {}).get("score", 0),
                "overallScore": x.get("score", 0),
            },
        }
        for x in (search_results.get("top_picks", []) + search_results.get("other_matches", []))
    ]


@router.post("/agent-search")
def agent_search(req: AgentSearchRequest):
    # Reuse /api/listings/search to obtain normalized and scored listings
    from .listings import listings_search
    base = listings_search({"profileId": req.profileId, "profile": {}})

    # Market Overview: Show ALL scored properties (not just top 20)
    all_listings = _map_to_agent_listing({"top_picks": base.get("all_scored_matches", []), "other_matches": []})

    # AI Recommendations: Show only top 20 with AI analysis
    ai_listings = _map_to_agent_listing(base)

    view1 = {
        "viewType": "broad",
        "searchCriteria": {"budgetRange": "", "bedrooms": "", "location": "", "propertyType": ""},
        "totalFound": len(all_listings),  # Total ALL scored properties
        "listings": all_listings,  # ALL properties for Market Overview
        "executionTime": 0,
    }
    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": view1["searchCriteria"],
        "totalFound": len(ai_listings),  # Only analyzed properties
        "listings": ai_listings,  # Top 20 with AI for Recommendations
        "executionTime": 0,
        "aiAnalysis": {"topMatches": len([x for x in ai_listings if x.get('matchScore',0) >= 80]), "visualAnalysis": False, "scoringFactors": ["budget","beds","location"]},
    }
    response = {
        "searchType": "agent_dual_view" if not req.useReactive else "agent_dual_view_reactive",
        "profileData": {"id": req.profileId, "name": "Client", "location": ""},
        "initialSearch": {"view1": view1, "view2": view2, "totalFound": len(all_listings), "sufficientResults": True},
        "totalExecutionTime": 0,
        "timestamp": datetime.utcnow().isoformat(),
    }
    if req.useReactive and req.forceEnhanced:
        response["enhancedSearch"] = {"triggered": True, "reason": "Requested enhanced search", "view1": view1, "adjustments": [], "adjustmentSummary": "", "clientSummary": ""}
    return response


@router.post("/agent-search/enhanced-only")
def agent_search_enhanced_only(req: AgentSearchRequest):
    from .listings import listings_search
    base = listings_search({"profileId": req.profileId, "profile": {}})

    # AI Recommendations: Show only top 20 with AI analysis
    ai_listings = _map_to_agent_listing(base)

    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": {"budgetRange": "", "bedrooms": "", "location": "", "propertyType": ""},
        "totalFound": len(ai_listings),
        "listings": ai_listings,
        "executionTime": 0,
        "aiAnalysis": {"topMatches": len([x for x in ai_listings if x.get('matchScore',0) >= 80]), "visualAnalysis": False, "scoringFactors": ["budget","beds","location"]},
    }
    return {"searchType": "agent_dual_view", "view2": view2, "totalExecutionTime": 0, "timestamp": datetime.utcnow().isoformat()}
