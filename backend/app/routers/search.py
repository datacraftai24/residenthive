from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


router = APIRouter(prefix="/api")


class AgentSearchRequest(BaseModel):
    profileId: int
    useReactive: Optional[bool] = False
    forceEnhanced: Optional[bool] = False


def _fake_listings(city: str):
    base = [
        {
            "mlsNumber": "MLS-1001",
            "address": "12 Oak St",
            "city": city,
            "state": "MA",
            "zip": "01604",
            "listPrice": 425000,
            "bedrooms": 3,
            "bathrooms": 2,
            "sqft": 1550,
            "propertyType": "single-family",
            "status": "Active",
            "images": [],
            "photoCount": 0,
            "description": "Charming home with updated kitchen and fenced yard.",
            "matchScore": 82,
            "matchLabel": "Strong match",
            "matchReasons": ["budget fit", "3 beds", "desired city"],
            "dealbreakers": [],
            "aiInsights": {
                "agentSummary": "Great starter home; strong rental comps nearby.",
                "personalizedAnalysis": {"summary": "Solid value", "hiddenGems": [], "missingInfo": [], "agentTasks": []},
            },
            "scoreBreakdown": {"featureMatch": 20, "budgetMatch": 25, "bedroomMatch": 15, "locationMatch": 22, "overallScore": 82},
        },
        {
            "mlsNumber": "MLS-1002",
            "address": "98 Pine Ave",
            "city": city,
            "state": "MA",
            "zip": "01603",
            "listPrice": 505000,
            "bedrooms": 4,
            "bathrooms": 3,
            "sqft": 1900,
            "propertyType": "single-family",
            "status": "Active",
            "images": [],
            "photoCount": 0,
            "description": "Spacious home close to downtown.",
            "matchScore": 74,
            "matchLabel": "Good match",
            "matchReasons": ["4 beds", "near amenities"],
            "dealbreakers": [],
            "aiInsights": {
                "agentSummary": "Larger home; slightly above budget but worth a look.",
                "personalizedAnalysis": {"summary": "Slight stretch", "hiddenGems": [], "missingInfo": [], "agentTasks": []},
            },
            "scoreBreakdown": {"featureMatch": 18, "budgetMatch": 18, "bedroomMatch": 20, "locationMatch": 18, "overallScore": 74},
        },
    ]
    return base


@router.post("/agent-search")
def agent_search(req: AgentSearchRequest):
    city = "Worcester"
    listings = _fake_listings(city)
    view1 = {
        "viewType": "broad",
        "searchCriteria": {
            "budgetRange": "$400K - $550K",
            "bedrooms": "3+",
            "location": city,
            "propertyType": "single-family",
        },
        "totalFound": len(listings),
        "listings": listings,
        "executionTime": 150,
    }
    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": view1["searchCriteria"],
        "totalFound": len(listings),
        "listings": listings,
        "executionTime": 220,
        "aiAnalysis": {"topMatches": 1, "visualAnalysis": False, "scoringFactors": ["budget", "beds", "location"]},
    }
    response = {
        "searchType": "agent_dual_view_reactive" if req.useReactive else "agent_dual_view",
        "profileData": {"id": req.profileId, "name": "Client", "location": city},
        "initialSearch": {"view1": view1, "view2": view2, "totalFound": len(listings), "sufficientResults": True},
        "totalExecutionTime": 370,
        "timestamp": datetime.utcnow().isoformat(),
    }
    if req.useReactive and req.forceEnhanced:
        response["enhancedSearch"] = {
            "triggered": True,
            "reason": "Requested enhanced search",
            "view1": view1,
            "adjustments": [
                {"field": "budget", "originalValue": "$400K-$500K", "adjustedValue": "$400K-$550K", "description": "Expanded budget"}
            ],
            "adjustmentSummary": "Budget increased by $50K to widen results",
            "clientSummary": "Found additional options within slightly higher budget.",
        }
    return response


@router.post("/agent-search/enhanced-only")
def agent_search_enhanced_only(req: AgentSearchRequest):
    # Return only AI view with the same fake listings
    city = "Worcester"
    listings = _fake_listings(city)
    view2 = {
        "viewType": "ai_recommendations",
        "searchCriteria": {
            "budgetRange": "$400K - $550K",
            "bedrooms": "3+",
            "location": city,
            "propertyType": "single-family",
        },
        "totalFound": len(listings),
        "listings": listings,
        "executionTime": 210,
        "aiAnalysis": {"topMatches": 1, "visualAnalysis": False, "scoringFactors": ["budget", "beds", "location"]},
    }
    return {
        "searchType": "agent_dual_view",
        "view2": view2,
        "totalExecutionTime": 210,
        "timestamp": datetime.utcnow().isoformat(),
    }

