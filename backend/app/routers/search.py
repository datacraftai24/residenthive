from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


router = APIRouter(prefix="/api")


class AgentSearchRequest(BaseModel):
    profileId: int
    useReactive: Optional[bool] = False
    forceEnhanced: Optional[bool] = False


@router.post("/agent-search")
def agent_search(req: AgentSearchRequest):
    # Reuse /api/listings/search to obtain normalized and scored listings
    from .listings import listings_search
    base = listings_search({"profileId": req.profileId, "profile": {}})
    # Map to AgentDualViewSearch shape
    listings = [
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
            "aiInsights": {"agentSummary": x.get("reason", "")},
            "scoreBreakdown": {
                "featureMatch": x.get("score_breakdown", {}).get("feature_match", 0),
                "budgetMatch": x.get("score_breakdown", {}).get("budget_match", 0),
                "bedroomMatch": x.get("score_breakdown", {}).get("bedroom_match", 0),
                "locationMatch": x.get("score_breakdown", {}).get("location_match", 0),
                "overallScore": x.get("score_breakdown", {}).get("final_score", 0),
            },
        }
        for x in (base.get("top_picks", []) + base.get("other_matches", []))
    ]
    view1 = {
        "viewType": "broad",
        "searchCriteria": {"budgetRange": "", "bedrooms": "", "location": "", "propertyType": ""},
        "totalFound": len(listings),
        "listings": listings,
        "executionTime": 0,
    }
    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": view1["searchCriteria"],
        "totalFound": len(listings),
        "listings": listings,
        "executionTime": 0,
        "aiAnalysis": {"topMatches": len([x for x in listings if x.get('matchScore',0) >= 80]), "visualAnalysis": False, "scoringFactors": ["budget","beds","location"]},
    }
    response = {
        "searchType": "agent_dual_view" if not req.useReactive else "agent_dual_view_reactive",
        "profileData": {"id": req.profileId, "name": "Client", "location": ""},
        "initialSearch": {"view1": view1, "view2": view2, "totalFound": len(listings), "sufficientResults": True},
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
    listings = [
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
        }
        for x in (base.get("top_picks", []) + base.get("other_matches", []))
    ]
    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": {"budgetRange": "", "bedrooms": "", "location": "", "propertyType": ""},
        "totalFound": len(listings),
        "listings": listings,
        "executionTime": 0,
        "aiAnalysis": {"topMatches": len([x for x in listings if x.get('matchScore',0) >= 80]), "visualAnalysis": False, "scoringFactors": ["budget","beds","location"]},
    }
    return {"searchType": "agent_dual_view", "view2": view2, "totalExecutionTime": 0, "timestamp": datetime.utcnow().isoformat()}
