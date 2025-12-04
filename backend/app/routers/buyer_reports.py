"""
Buyer Reports API

Handles auto-generated shareable buyer reports.
Every search creates a report; agents customize which listings to include.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import json
import uuid

from ..db import get_conn, fetchone_dict, fetchall_dicts
from ..auth import get_current_agent_id
from .search import get_search_context  # To retrieve full listing data
from ..services.search_context_store import (
    get_photo_analysis_results,
    get_location_analysis_results
)
from ..services.outreach_generator import generate_outreach_draft
from ..services.report_synthesizer import generate_report_synthesis


router = APIRouter(prefix="/api/buyer-reports")


# Request/Response models
class CreateBuyerReportRequest(BaseModel):
    searchId: str
    profileId: int


class BuyerReportResponse(BaseModel):
    shareId: str
    buyerName: str
    agentName: Optional[str] = "Your Agent"
    agentEmail: Optional[str] = None
    agentPhone: Optional[str] = None
    location: str
    createdAt: str
    listings: List[Dict[str, Any]]
    synthesis: Optional[Dict[str, Any]] = None  # LLM-generated intro, ranked_picks, next_steps


class OutreachDraftResponse(BaseModel):
    sms: str
    email: str
    shareUrl: str


@router.get("/{share_id}", response_model=BuyerReportResponse)
def get_buyer_report(share_id: str):
    """
    PUBLIC endpoint - Get buyer report data for shareable link.
    No authentication required (buyers access this).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get report metadata
            cur.execute(
                """
                SELECT br.*, bp.name as buyer_name, bp.location
                FROM buyer_reports br
                JOIN buyer_profiles bp ON br.profile_id = bp.id
                WHERE br.share_id = %s
                """,
                (share_id,)
            )
            report_row = fetchone_dict(cur)

            if not report_row:
                raise HTTPException(status_code=404, detail="Report not found")

    # Get full listing data from search context
    search_id = report_row['search_id']
    search_context = get_search_context(search_id)

    if not search_context:
        raise HTTPException(status_code=404, detail="Search context not found or expired")

    # Filter to included listings only
    included_ids = report_row.get('included_listing_ids', [])
    all_listings = search_context.get('ranked_listings', [])

    # Match by mlsNumber
    included_listings = [
        listing for listing in all_listings
        if listing.get('mlsNumber') in included_ids
    ]

    # Preserve order from included_ids
    listings_by_id = {l['mlsNumber']: l for l in included_listings}
    ordered_listings = [listings_by_id[lid] for lid in included_ids if lid in listings_by_id]

    # Merge photo analysis if available
    photo_analysis = get_photo_analysis_results(search_id)
    if photo_analysis:
        for listing in ordered_listings:
            mls = listing.get('mlsNumber')
            if mls in photo_analysis:
                if 'aiAnalysis' not in listing:
                    listing['aiAnalysis'] = {}
                # Merge photo fields into aiAnalysis
                listing['aiAnalysis'].update(photo_analysis[mls])
        print(f"[BUYER REPORT] Merged photo analysis for {len(photo_analysis)} listings")
    else:
        print(f"[BUYER REPORT] No photo analysis available for searchId={search_id}")

    # Merge location analysis if available
    location_analysis = get_location_analysis_results(search_id)
    if location_analysis:
        for listing in ordered_listings:
            mls = listing.get('mlsNumber')
            if mls in location_analysis:
                if 'aiAnalysis' not in listing:
                    listing['aiAnalysis'] = {}
                # Merge location fields into aiAnalysis
                listing['aiAnalysis']['location_match_score'] = location_analysis[mls].get('location_match_score')
                listing['aiAnalysis']['location_flags'] = location_analysis[mls].get('location_flags')
                listing['aiAnalysis']['location_summary'] = location_analysis[mls].get('location_summary')
        print(f"[BUYER REPORT] Merged location analysis for {len(location_analysis)} listings")
    else:
        print(f"[BUYER REPORT] No location analysis available for searchId={search_id}")

    # Parse synthesis_data from JSON
    synthesis = None
    if report_row.get('synthesis_data'):
        try:
            synthesis = report_row['synthesis_data']
            if isinstance(synthesis, str):
                synthesis = json.loads(synthesis)
        except (json.JSONDecodeError, TypeError):
            synthesis = None

    return BuyerReportResponse(
        shareId=share_id,
        buyerName=report_row['buyer_name'],
        agentName=report_row.get('agent_name', 'Your Agent'),
        agentEmail=report_row.get('agent_email'),
        agentPhone=report_row.get('agent_phone'),
        location=report_row.get('location', ''),
        createdAt=report_row['created_at'].isoformat() if report_row.get('created_at') else '',
        listings=ordered_listings,
        synthesis=synthesis
    )


@router.post("")
def create_buyer_report(
    request: CreateBuyerReportRequest,
    agent_id: int = Depends(get_current_agent_id)
):
    """
    AGENT-only endpoint - Create buyer report with LLM synthesis.
    Requires vision analysis to be complete.
    """
    # Get search context
    search_context = get_search_context(request.searchId)
    if not search_context:
        raise HTTPException(status_code=404, detail="Search context not found or expired")

    # Check if vision analysis is complete
    analysis_status = search_context.get("analysis_status", {})
    if not analysis_status.get("vision_complete_for_top5"):
        raise HTTPException(
            status_code=400,
            detail="Photo analysis not complete. Please wait for analysis to finish."
        )

    # Get profile and listings
    profile = search_context["profile"]
    all_listings = search_context["ranked_listings"]

    # Select top 5 by finalScore
    sorted_listings = sorted(
        [l for l in all_listings if l.get('finalScore') is not None],
        key=lambda x: x.get('finalScore', 0),
        reverse=True
    )
    top_5_listings = sorted_listings[:5]
    top_5_ids = [l['mlsNumber'] for l in top_5_listings]

    if len(top_5_listings) == 0:
        raise HTTPException(status_code=400, detail="No listings available for report")

    # Generate LLM synthesis
    try:
        synthesis = generate_report_synthesis(profile, top_5_listings)
    except Exception as e:
        print(f"[BUYER REPORT] Synthesis generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report synthesis: {str(e)}")

    # Get agent info
    agent_name = None
    agent_email = None
    agent_phone = None
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT name, email, phone FROM agents WHERE id = %s", (agent_id,))
                agent_row = cur.fetchone()
                if agent_row:
                    agent_name = agent_row[0]
                    agent_email = agent_row[1]
                    agent_phone = agent_row[2]
    except Exception as e:
        print(f"[BUYER REPORT] Could not load agent info: {e}")

    # Create buyer report in database
    share_id = str(uuid.uuid4())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO buyer_reports
                (share_id, profile_id, agent_id, search_id, agent_name, agent_email, agent_phone,
                 included_listing_ids, synthesis_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING share_id
                """,
                (share_id, request.profileId, agent_id, request.searchId, agent_name, agent_email,
                 agent_phone, top_5_ids, json.dumps(synthesis))
            )
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=500, detail="Failed to create buyer report")

            print(f"[BUYER REPORT] Created report with shareId={share_id}, {len(top_5_ids)} listings")

    # Return response with share link and preview
    return {
        "success": True,
        "shareId": share_id,
        "shareUrl": f"/buyer-report/{share_id}",
        "synthesis": synthesis,
        "includedCount": len(top_5_ids)
    }


@router.get("/{share_id}/outreach", response_model=OutreachDraftResponse)
def get_outreach_draft(
    share_id: str,
    agent_id: int = Depends(get_current_agent_id)
):
    """
    AGENT-only endpoint - Generate outreach draft (SMS + email).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get report metadata
            cur.execute(
                """
                SELECT br.*, bp.name as buyer_name, bp.location
                FROM buyer_reports br
                JOIN buyer_profiles bp ON br.profile_id = bp.id
                WHERE br.share_id = %s
                """,
                (share_id,)
            )
            report_row = fetchone_dict(cur)

            if not report_row:
                raise HTTPException(status_code=404, detail="Report not found")

            # Verify ownership
            if report_row['agent_id'] != agent_id:
                raise HTTPException(status_code=403, detail="Not authorized to access this report")

    # Get listings from search context
    search_id = report_row['search_id']
    search_context = get_search_context(search_id)

    if not search_context:
        raise HTTPException(status_code=404, detail="Search context not found or expired")

    # Filter to included listings
    included_ids = report_row.get('included_listing_ids', [])
    all_listings = search_context.get('listings', [])

    included_listings = [
        listing for listing in all_listings
        if listing.get('mlsNumber') in included_ids
    ]

    # Preserve order
    listings_by_id = {l['mlsNumber']: l for l in included_listings}
    ordered_listings = [listings_by_id[lid] for lid in included_ids if lid in listings_by_id]

    # Generate share URL
    # In production, use actual domain from config
    share_url = f"https://app.residenthive.com/buyer-report/{share_id}"
    # For development, could use request.base_url

    # Generate drafts
    drafts = generate_outreach_draft(
        buyer_name=report_row['buyer_name'],
        listings=ordered_listings,
        agent_name=report_row.get('agent_name', 'Your Agent'),
        share_url=share_url,
        buyer_location=report_row.get('location', '')
    )

    return OutreachDraftResponse(
        sms=drafts['sms'],
        email=drafts['email'],
        shareUrl=share_url
    )
