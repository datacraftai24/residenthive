from fastapi import APIRouter, Query, HTTPException
from typing import List, Dict, Any
from uuid import uuid4
from datetime import datetime
from fastapi.responses import Response
from ..services.repliers import RepliersClient, RepliersError
from ..services.scoring_config import ScoringConfig
from ..services.property_scorer import PropertyScorer
from ..services.property_analyzer import PropertyAnalyzer
from ..services.listing_quality import ListingQualityAnalyzer
from ..services.listing_persister import ListingPersister
from ..db import get_conn, fetchone_dict


router = APIRouter(prefix="/api")


def calculate_market_metrics(listing: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate market intelligence metrics for a listing"""
    price = listing.get("price", 0) or 0
    sqft = listing.get("square_feet", 0) or 0
    dom = listing.get("days_on_market", 0) or 0

    # Calculate price per square foot
    price_per_sqft = round(price / sqft) if sqft > 0 else None

    # Determine status indicators
    status_indicators = []

    if dom < 7:
        status_indicators.append({"type": "hot", "label": "New", "color": "red"})
    elif dom > 60:
        status_indicators.append({"type": "stale", "label": f"{dom} DOM", "color": "yellow"})

    # Check for potential deal (below average $/sqft would require market data)
    # For now, just flag properties with good $/sqft if available

    return {
        "price_per_sqft": price_per_sqft,
        "days_on_market": dom,
        "status_indicators": status_indicators,
    }


@router.post("/listings/search")
def listings_search(payload: Dict[str, Any]):
    """
    Intelligent property search with config-based scoring and AI analysis.

    Flow:
    1. Get ALL listings from Repliers API
    2. Score ALL listings with intelligent config-based rules
    3. Filter dealbreakers
    4. Pick top 20 best matches
    5. Run AI analysis ONLY on top 20 (cost-efficient)
    """
    profile_id = payload.get("profileId")
    if not profile_id:
        raise HTTPException(status_code=400, detail="profileId is required")

    # Load profile from DB
    profile = payload.get("profile") or {}
    if not profile:
        profile = _load_profile(profile_id)

    # Add profileId to profile dict for AI analyzer
    profile["profileId"] = profile_id

    # Get listings from Repliers API
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

    print(f"[LISTINGS SEARCH] Got {len(listings)} listings from Repliers for profile {profile_id}")

    # Load scoring rules (default + any agent customizations)
    agent_id = profile.get("agentId")
    scoring_rules = ScoringConfig.get_rules(agent_id)
    scorer = PropertyScorer(scoring_rules)

    # Stage 1: Score ALL listings (fast, no AI)
    scored_listings = []
    rejected_listings = []

    for listing in listings:
        # Check HARD filters first (objective criteria only)
        if scorer.check_hard_filters(listing, profile):
            # Get clear, objective filter reasons
            filter_reasons = scorer.get_filter_reasons(listing, profile)
            rejected_listings.append({
                "listing": listing,
                "filter_reasons": filter_reasons,
            })
            continue

        # Score the listing
        score_data = scorer.score_listing(listing, profile)

        scored_listings.append({
            "listing": listing,
            "score": score_data["total"],
            "score_data": score_data,
        })

    print(f"[LISTINGS SEARCH] Scored {len(scored_listings)} listings, rejected {len(rejected_listings)} dealbreakers")

    # Stage 2: Sort and pick top 20
    scored_listings.sort(key=lambda x: x["score"], reverse=True)
    top_20 = scored_listings[:20]

    print(f"[LISTINGS SEARCH] Selected top {len(top_20)} for quality analysis and AI")

    # Stage 2.5: Quality analysis on top 20 (fast, Python-only)
    quality_analyzer = ListingQualityAnalyzer()

    for item in top_20:
        try:
            quality_data = quality_analyzer.analyze_listing(item["listing"])
            item["quality_data"] = quality_data
        except Exception as e:
            print(f"[LISTINGS SEARCH] Quality analysis error: {e}")
            item["quality_data"] = None

    # Stage 3: AI analysis ONLY on top 20 (in parallel mini-batches of 4)
    analyzer = PropertyAnalyzer()

    # Run batch analysis with 4 concurrent API calls
    # Now includes quality_data for each item
    ai_analyses = analyzer.analyze_batch(
        items=top_20,
        profile=profile,
        batch_size=4,  # Process 4 properties in parallel
        use_cache=True
    )

    # Merge AI analysis with score data and quality metrics
    analyzed_listings = []
    for item, ai_analysis in zip(top_20, ai_analyses):
        listing = item["listing"]
        score_data = item["score_data"]
        quality_data = item.get("quality_data")

        analyzed_listings.append({
            "listing": listing,
            "match_score": item["score"] / 100.0,  # Normalize to 0-1
            "score": item["score"],
            "headline": ai_analysis.get("headline", ""),
            "agent_insight": ai_analysis.get("agent_insight", ""),
            "why_picked": ai_analysis.get("why_picked", ""),
            "must_have_checklist": ai_analysis.get("must_have_checklist", []),
            "hidden_gems": ai_analysis.get("hidden_gems", []),
            "red_flags": ai_analysis.get("red_flags", []),
            "matched_features": score_data.get("matched_features", []),
            "why_it_works": ai_analysis.get("why_it_works", {}),
            "considerations": ai_analysis.get("considerations", []),
            "score_breakdown": score_data.get("breakdown", {}),
            "quality_score": quality_data.get("quality_score") if quality_data else None,
            "quality_summary": quality_data.get("summary") if quality_data else None,
            "label": "Top Pick" if item["score"] >= 80 else "Match",
        })

    # Split into top picks and other matches
    top_picks = [x for x in analyzed_listings if x["score"] >= 80]
    other_matches = [x for x in analyzed_listings if x["score"] < 80]

    # Create lightweight listings for Market Overview (ALL scored properties, not just top 20)
    all_scored_for_overview = []
    for item in scored_listings:
        listing = item["listing"]
        score_data = item["score_data"]

        # Calculate market intelligence metrics
        market_metrics = calculate_market_metrics(listing)

        all_scored_for_overview.append({
            "listing": listing,
            "match_score": item["score"] / 100.0,
            "score": item["score"],
            "headline": "",  # No AI analysis for properties outside top 20
            "agent_insight": "",
            "matched_features": score_data.get("matched_features", []),
            "dealbreaker_flags": [],
            "why_it_works": {},
            "considerations": [],
            "match_reasoning": {},
            "score_breakdown": score_data.get("breakdown", {}),
            "label": "Top Pick" if item["score"] >= 80 else "Match",
            # Market intelligence metrics for Market Overview
            "price_per_sqft": market_metrics["price_per_sqft"],
            "days_on_market": market_metrics["days_on_market"],
            "status_indicators": market_metrics["status_indicators"],
        })

    print(f"[LISTINGS SEARCH] Returning {len(top_picks)} top picks, {len(other_matches)} other matches, {len(all_scored_for_overview)} total scored")

    # PERSIST: Save raw Repliers listings + AI analysis to database for chatbot access
    try:
        persist_counts = ListingPersister.persist_search_results(
            listings=listings,  # ALL raw listings from Repliers
            analyzed_listings=analyzed_listings,  # Top 20 with AI analysis
            profile_id=profile_id,
            agent_id=agent_id
        )
        print(f"[LISTINGS SEARCH] Persisted to DB: {persist_counts}")
    except Exception as e:
        print(f"[LISTINGS SEARCH] Error persisting to database: {e}")
        import traceback
        traceback.print_exc()
        # Continue anyway - don't fail the search if persistence fails

    # Check location match for warning
    requested_location = profile.get("location", "")
    location_match = False
    if listings and requested_location:
        requested_parts = requested_location.split(",")
        if len(requested_parts) >= 2:
            req_city = requested_parts[0].strip().lower()
            req_state = requested_parts[1].strip().lower()
            location_match = any(
                l.get("city", "").lower() == req_city or
                l.get("state", "").lower() == req_state
                for l in listings
            )

    # Create lightweight rejected listings for Market Overview
    rejected_for_overview = []
    for item in rejected_listings:
        listing = item["listing"]
        rejected_for_overview.append({
            "listing": listing,
            "filter_reasons": item["filter_reasons"],  # Clear, objective reasons
            "match_score": 0,  # Rejected properties have 0 score
            "score": 0,
            "headline": "",
            "agent_insight": "",
            "matched_features": [],
            "red_flags": item["filter_reasons"],  # Show filter reasons as flags
            "score_breakdown": {},
            "label": "Filtered Out",
        })

    return {
        "top_picks": top_picks,
        "other_matches": other_matches,
        "all_scored_matches": all_scored_for_overview,  # NEW: All scored properties for Market Overview
        "rejected_matches": rejected_for_overview,  # NEW: Rejected properties with reasons
        "chat_blocks": [],
        "search_summary": {
            "total_found": len(listings),
            "total_scored": len(scored_listings),
            "rejected_count": len(rejected_listings),
            "analyzed_count": len(analyzed_listings),
            "top_picks_count": len(top_picks),
            "other_matches_count": len(other_matches),
            "all_scored_count": len(all_scored_for_overview),  # Track total for Market Overview
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
                       bedrooms, max_bedrooms, bathrooms, must_have_features, dealbreakers, preferred_areas,
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
        "maxBedrooms": row.get("max_bedrooms"),
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
