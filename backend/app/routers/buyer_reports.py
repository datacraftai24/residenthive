"""
Buyer Reports API

Handles auto-generated shareable buyer reports.
Every search creates a report; agents customize which listings to include.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, EmailStr
import os
import json
import uuid
import logging

logger = logging.getLogger(__name__)

from ..db import get_conn, fetchone_dict, fetchall_dicts
from ..auth import get_current_agent_id
from .search import get_search_context  # To retrieve full listing data
from ..services.search_context_store import (
    get_photo_analysis_results,
    get_location_analysis_results
)
from ..services.outreach_generator import generate_outreach_draft
from ..services.report_synthesizer import generate_report_synthesis
from ..services.chat_insights import sync_chat_preferences_to_profile


router = APIRouter(prefix="/api/buyer-reports")


# Request/Response models
class CreateBuyerReportRequest(BaseModel):
    searchId: str
    profileId: int
    allowPartial: bool = False  # Allow report generation even if analysis incomplete


class LeadContextResponse(BaseModel):
    """Lead context for chatbot - tells it this is from a lead, not buyer profile"""
    leadId: Optional[int] = None
    leadType: Optional[str] = None  # property_specific | area_search
    propertyAddress: Optional[str] = None
    propertyListPrice: Optional[int] = None
    source: Optional[str] = None  # zillow, redfin, google


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
    defaultEmailSubject: Optional[str] = None  # Pre-built email subject for outreach
    defaultEmailBody: Optional[str] = None  # Pre-built email body for outreach
    profileId: Optional[int] = None  # For chatbot integration
    agentId: Optional[int] = None  # For chatbot integration
    leadContext: Optional[LeadContextResponse] = None  # For chatbot lead awareness
    buyerNotes: Optional[str] = None  # Notes from buyer, synced to agent dashboard
    buyerNotesUpdatedAt: Optional[str] = None  # When buyer notes were last updated


class UpdateBuyerNotesRequest(BaseModel):
    notes: str


class OutreachDraftResponse(BaseModel):
    sms: str
    email: str
    shareUrl: str


class SharedPropertyDetailResponse(BaseModel):
    """Response for public property detail page"""
    property: Dict[str, Any]
    aiAnalysis: Optional[Dict[str, Any]] = None
    agent: Dict[str, Any]
    reportUrl: str


class SendReportEmailRequest(BaseModel):
    """Request to send buyer report via email"""
    to_email: EmailStr
    subject: Optional[str] = None
    body: Optional[str] = None


@router.get("/{share_id}", response_model=BuyerReportResponse)
def get_buyer_report(share_id: str):
    """
    PUBLIC endpoint - Get buyer report data for shareable link.
    No authentication required (buyers access this).
    """
    logger.info(f"[REPORT_VIEW] share_id={share_id}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get report metadata including buyer prefs for email and buyer notes
            cur.execute(
                """
                SELECT br.*, bp.name as buyer_name, bp.location, bp.budget, bp.budget_min, bp.budget_max, bp.bedrooms,
                       br.buyer_notes, br.buyer_notes_updated_at
                FROM buyer_reports br
                JOIN buyer_profiles bp ON br.profile_id = bp.id
                WHERE br.share_id = %s
                """,
                (share_id,)
            )
            report_row = fetchone_dict(cur)

            if not report_row:
                raise HTTPException(status_code=404, detail="Report not found")

    # Parse synthesis_data first (needed for fallback)
    synthesis = None
    synthesis_data_raw = report_row.get('synthesis_data')
    if synthesis_data_raw:
        try:
            synthesis = synthesis_data_raw
            if isinstance(synthesis, str):
                synthesis = json.loads(synthesis)
        except (json.JSONDecodeError, TypeError):
            synthesis = None

    # Get full listing data from search context (or fallback to database)
    search_id = report_row['search_id']
    search_context = get_search_context(search_id)
    included_ids = report_row.get('included_listing_ids', [])

    if search_context:
        # Fresh search context available - use it
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

        # Merge remarks from snapshots if missing from search context
        # (Search context may not have description, but snapshots do)
        if synthesis and synthesis.get('listing_snapshots'):
            snapshots_by_mls = {str(s.get('mlsNumber')): s for s in synthesis.get('listing_snapshots', [])}
            for listing in ordered_listings:
                mls = str(listing.get('mlsNumber', ''))
                if mls in snapshots_by_mls:
                    snapshot = snapshots_by_mls[mls]
                    # Fill in remarks if missing
                    if not listing.get('remarks') and snapshot.get('remarks'):
                        listing['remarks'] = snapshot['remarks']
                    # Fill in other MLS fields if missing
                    if not listing.get('yearBuilt') and snapshot.get('yearBuilt'):
                        listing['yearBuilt'] = snapshot['yearBuilt']
                    if not listing.get('lotSize') and snapshot.get('lotSize'):
                        listing['lotSize'] = snapshot['lotSize']
                    if not listing.get('garageSpaces') and snapshot.get('garageSpaces'):
                        listing['garageSpaces'] = snapshot['garageSpaces']
                    if not listing.get('daysOnMarket') and snapshot.get('daysOnMarket'):
                        listing['daysOnMarket'] = snapshot['daysOnMarket']

    else:
        # DATABASE FALLBACK: Search context expired, use persisted snapshots
        logger.info(f"[BUYER REPORT] Search context expired for {search_id}, using database fallback")

        if synthesis and synthesis.get('listing_snapshots'):
            # Use persisted listing snapshots from synthesis_data
            ordered_listings = synthesis.get('listing_snapshots', [])
            listing_analysis = synthesis.get('listing_analysis', {})

            # Merge persisted analysis back into listings
            for listing in ordered_listings:
                mls = str(listing.get('mlsNumber', ''))
                if mls in listing_analysis:
                    analysis = listing_analysis[mls]
                    if 'aiAnalysis' not in listing:
                        listing['aiAnalysis'] = {}
                    # Merge text analysis
                    if analysis.get('text'):
                        listing['aiAnalysis'].update(analysis['text'])
                    # Merge photo analysis
                    if analysis.get('photos'):
                        listing['aiAnalysis'].update(analysis['photos'])
                    # Merge location analysis
                    if analysis.get('location'):
                        listing['aiAnalysis']['location_match_score'] = analysis['location'].get('location_match_score')
                        listing['aiAnalysis']['location_flags'] = analysis['location'].get('location_flags')
                        listing['aiAnalysis']['location_summary'] = analysis['location'].get('location_summary')

            logger.info(f"[BUYER REPORT] Restored {len(ordered_listings)} listings from database")
        else:
            # No snapshots available (old report) - return error
            logger.error(f"[BUYER REPORT] No listing snapshots available for report {share_id}")
            raise HTTPException(status_code=404, detail="Report data expired. Please generate a new report.")

    # Add propertyUrl to each listing for "View Details" links
    for listing in ordered_listings:
        mls = listing.get('mlsNumber')
        if mls:
            listing['propertyUrl'] = f"/shared/reports/{share_id}/property/{mls}"

    # Build default email for outreach modal (single source of truth)
    import os as _os
    frontend_url = _os.getenv("FRONTEND_BASE_URL", "https://residencehive.com")
    report_url = f"{frontend_url}/buyer-report/{share_id}"

    buyer_prefs = {
        "location": report_row.get("location"),
        "budget": report_row.get("budget"),
        "budget_min": report_row.get("budget_min"),
        "budget_max": report_row.get("budget_max"),
        "bedrooms": report_row.get("bedrooms"),
    }
    top_properties = build_top_properties_for_email(ordered_listings)

    # total_reviewed = all listings from search context if available
    total_reviewed = len(search_context.get('ranked_listings', [])) if search_context else None

    # Check if this report was created from a lead - use lead-specific email template
    lead_context_data = synthesis.get('lead_context') if synthesis else None

    if lead_context_data:
        # Lead-specific email template
        default_email_body = build_lead_email_body(
            buyer_name=report_row['buyer_name'],
            agent_name=report_row.get('agent_name', 'Your Agent'),
            report_url=report_url,
            top_properties=top_properties,
            lead_context=lead_context_data,
            synthesis_data=synthesis,
        )
        default_email_subject = f"Properties for your home search - {report_row['buyer_name'] or 'you'}"
    else:
        # Generic buyer profile email template
        default_email_body = build_default_email_body(
            buyer_name=report_row['buyer_name'],
            agent_name=report_row.get('agent_name', 'Your Agent'),
            report_url=report_url,
            top_properties=top_properties,
            buyer_prefs=buyer_prefs,
            total_reviewed=total_reviewed,
            total_narrowed=len(ordered_listings)
        )
        default_email_subject = f"Homes I'd recommend for {report_row['buyer_name'] or 'you'}"

    # Extract lead context from synthesis if this report was created from a lead
    lead_context = None
    if synthesis and synthesis.get('lead_context'):
        lc = synthesis['lead_context']
        lead_context = LeadContextResponse(
            leadId=lc.get('leadId') or lc.get('lead_id'),
            leadType=lc.get('leadType') or lc.get('lead_type'),
            propertyAddress=lc.get('propertyAddress') or lc.get('property_address'),
            propertyListPrice=lc.get('propertyListPrice') or lc.get('property_list_price'),
            source=lc.get('source')
        )

    return BuyerReportResponse(
        shareId=share_id,
        buyerName=report_row['buyer_name'],
        agentName=report_row.get('agent_name', 'Your Agent'),
        agentEmail=report_row.get('agent_email'),
        agentPhone=report_row.get('agent_phone'),
        location=report_row.get('location', ''),
        createdAt=report_row['created_at'].isoformat() if report_row.get('created_at') else '',
        listings=ordered_listings,
        synthesis=synthesis,
        defaultEmailSubject=default_email_subject,
        defaultEmailBody=default_email_body,
        profileId=report_row.get('profile_id'),
        agentId=report_row.get('agent_id'),
        leadContext=lead_context,
        buyerNotes=report_row.get('buyer_notes'),
        buyerNotesUpdatedAt=report_row['buyer_notes_updated_at'].isoformat() if report_row.get('buyer_notes_updated_at') else None
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

    # Check analysis status
    analysis_status = search_context.get("analysis_status", {})
    vision_complete = analysis_status.get("vision_complete_for_top5", False)
    location_complete = analysis_status.get("location_complete_for_top5", False)

    # If not allowing partial and vision isn't complete, fail
    if not request.allowPartial and not vision_complete:
        raise HTTPException(
            status_code=400,
            detail="Photo analysis not complete. Please wait for analysis to finish."
        )

    # Log partial report for monitoring
    if not vision_complete or not location_complete:
        print(f"[BUYER REPORT] Generating partial report: vision={vision_complete}, location={location_complete}")

    # Sync chat preferences to profile before generating report
    # This ensures the profile reflects any preferences captured during chat
    try:
        synced = sync_chat_preferences_to_profile(request.profileId)
        if synced:
            print(f"[BUYER REPORT] Synced chat preferences to profile {request.profileId}")
    except Exception as e:
        print(f"[BUYER REPORT] Chat preference sync failed (non-blocking): {e}")

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

    # Check if profile came from a lead and build lead_context
    lead_context = None
    parent_lead_id = profile.get("parent_lead_id")
    if parent_lead_id:
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, source, lead_type, property_address, property_list_price,
                               property_bedrooms, property_bathrooms, property_sqft,
                               property_image_url, property_listing_id, raw_input, extracted_timeline
                        FROM leads WHERE id = %s
                    """, (parent_lead_id,))
                    lead_row = fetchone_dict(cur)

                    if lead_row:
                        lead_context = {
                            "leadId": lead_row["id"],
                            "source": lead_row["source"],
                            "leadType": lead_row["lead_type"],
                            "propertyAddress": lead_row["property_address"],
                            "propertyListPrice": lead_row["property_list_price"],
                            "propertyBedrooms": lead_row["property_bedrooms"],
                            "propertyBathrooms": lead_row["property_bathrooms"],
                            "propertySqft": lead_row["property_sqft"],
                            "propertyImageUrl": lead_row["property_image_url"],
                            "propertyListingId": lead_row["property_listing_id"],
                            "originalMessage": (lead_row["raw_input"] or "")[:300],  # Truncate
                            "timeline": lead_row["extracted_timeline"],
                        }
                        print(f"[BUYER REPORT] Found lead context from {lead_row['source']} lead")
        except Exception as e:
            print(f"[BUYER REPORT] Could not load lead context: {e}")

    # Generate LLM synthesis (with lead context if available)
    try:
        synthesis = generate_report_synthesis(profile, top_5_listings, lead_context=lead_context)
    except Exception as e:
        print(f"[BUYER REPORT] Synthesis generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report synthesis: {str(e)}")

    # PERSIST ANALYSIS SNAPSHOT: Freeze all analysis into synthesis_data
    # This ensures property detail pages work even after search context expires
    photo_analysis = get_photo_analysis_results(request.searchId)
    location_analysis = get_location_analysis_results(request.searchId)

    listing_analysis = {}
    for listing in top_5_listings:
        mls = str(listing.get('mlsNumber', ''))
        if not mls:
            continue

        analysis_snapshot = {
            "text": {
                "headline": listing.get('aiAnalysis', {}).get('headline'),
                "whats_matching": listing.get('aiAnalysis', {}).get('whats_matching', []),
                "whats_missing": listing.get('aiAnalysis', {}).get('whats_missing', []),
                "red_flags": listing.get('aiAnalysis', {}).get('red_flags', []),
                "fit_score": listing.get('fitScore'),
                "agent_take": listing.get('aiAnalysis', {}).get('agent_take_ai')
            },
            "photos": {},
            "location": {}
        }

        # Add photo analysis if available
        if photo_analysis and mls in photo_analysis:
            pa = photo_analysis[mls]
            analysis_snapshot["photos"] = {
                "photo_headline": pa.get('photo_headline'),
                "photo_summary": pa.get('photo_summary'),
                "photo_matches": pa.get('photo_matches', []),
                "photo_red_flags": pa.get('photo_red_flags', [])
            }

        # Add location analysis if available
        if location_analysis and mls in location_analysis:
            la = location_analysis[mls]
            analysis_snapshot["location"] = {
                "location_match_score": la.get('location_match_score'),
                "location_summary": la.get('location_summary'),
                "location_flags": la.get('location_flags', [])
            }

        listing_analysis[mls] = analysis_snapshot

    # Add listing_analysis to synthesis
    synthesis["listing_analysis"] = listing_analysis
    logger.info(f"[BUYER REPORT] Persisted analysis snapshot for {len(listing_analysis)} listings")

    # PERSIST LISTING SNAPSHOTS: Store core listing data for database fallback
    # This allows reports to work even after search context expires
    listing_snapshots = []
    for listing in top_5_listings:
        snapshot = {
            "mlsNumber": listing.get("mlsNumber"),
            "address": listing.get("address"),
            "city": listing.get("city"),
            "state": listing.get("state"),
            "zip": listing.get("zip"),
            "listPrice": listing.get("listPrice"),
            "bedrooms": listing.get("bedrooms"),
            "bathrooms": listing.get("bathrooms"),
            "sqft": listing.get("sqft"),
            "propertyType": listing.get("propertyType"),
            "images": listing.get("images", [])[:10],  # Limit to 10 images
            "finalScore": listing.get("finalScore"),
            "fitScore": listing.get("fitScore"),
            "aiAnalysis": listing.get("aiAnalysis", {}),
            # MLS details for Property Details tab
            "remarks": listing.get("description") or listing.get("remarks"),
            "yearBuilt": listing.get("yearBuilt"),
            "lotSize": listing.get("lotSize"),
            "garageSpaces": listing.get("garageSpaces"),
            "daysOnMarket": listing.get("daysOnMarket"),
        }
        listing_snapshots.append(snapshot)
    synthesis["listing_snapshots"] = listing_snapshots
    logger.info(f"[BUYER REPORT] Persisted {len(listing_snapshots)} listing snapshots for database fallback")

    # Get agent info
    agent_name = None
    agent_email = None
    agent_phone = None
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT first_name || ' ' || last_name AS name, email FROM agents WHERE id = %s", (agent_id,))
                agent_row = cur.fetchone()
                if agent_row:
                    agent_name = agent_row[0]
                    agent_email = agent_row[1]
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


@router.get("/shared/reports/{share_id}/property/{listing_id}", response_model=SharedPropertyDetailResponse)
def get_shared_property_detail(share_id: str, listing_id: str):
    """
    PUBLIC endpoint - Get property detail for a specific listing in a buyer report.
    No authentication required (buyers access this via shared link).

    Security:
    - Only properties in the report's included_listing_ids are accessible
    - Returns only buyer-safe data (no buyer name/email/private notes)
    """
    logger.info(f"[PROPERTY_VIEW] share_id={share_id} listing_id={listing_id}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Fetch report by share_id
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

            # 2. TODO: If report.is_active == False → 404 (for future expiry feature)

            # 3. HARD RULE: if listing_id not in included_listing_ids → 404
            included_ids = report_row.get('included_listing_ids', [])
            if str(listing_id) not in [str(lid) for lid in included_ids]:
                raise HTTPException(status_code=404, detail="Property not found in this report")

            # 4. Get property from repliers_listings (404 if listing removed from feed)
            cur.execute(
                """
                SELECT id, address, city, state, zip_code, price, bedrooms, bathrooms,
                       square_feet, property_type, year_built, description, features,
                       lot_size, garage_spaces, status
                FROM repliers_listings
                WHERE id = %s OR mls_number = %s
                """,
                (listing_id, listing_id)
            )
            property_row = fetchone_dict(cur)

            if not property_row:
                raise HTTPException(status_code=404, detail="Property no longer available")

            # 5. Get images from property_images
            cur.execute(
                """
                SELECT image_url, image_order, ai_description
                FROM property_images
                WHERE property_id = %s
                ORDER BY image_order ASC
                """,
                (listing_id,)
            )
            images_rows = fetchall_dicts(cur)
            images = [row['image_url'] for row in images_rows] if images_rows else []

    # 6. Get analysis from synthesis_data.listing_analysis[listing_id] ONLY (never live cache)
    ai_analysis = None
    synthesis_data = report_row.get('synthesis_data')
    if synthesis_data:
        if isinstance(synthesis_data, str):
            try:
                synthesis_data = json.loads(synthesis_data)
            except json.JSONDecodeError:
                synthesis_data = {}

        listing_analysis = synthesis_data.get('listing_analysis', {})
        # Try both str and original key format
        ai_analysis = listing_analysis.get(str(listing_id)) or listing_analysis.get(listing_id)

    # Build property response (buyer-safe only)
    property_data = {
        "listingId": str(property_row.get('id', listing_id)),
        "mlsNumber": str(listing_id),
        "address": property_row.get('address', ''),
        "city": property_row.get('city', ''),
        "state": property_row.get('state', ''),
        "zipCode": property_row.get('zip_code', ''),
        "price": property_row.get('price'),
        "bedrooms": property_row.get('bedrooms'),
        "bathrooms": property_row.get('bathrooms'),
        "sqft": property_row.get('square_feet'),
        "propertyType": property_row.get('property_type'),
        "yearBuilt": property_row.get('year_built'),
        "description": property_row.get('description'),
        "features": property_row.get('features'),
        "lotSize": property_row.get('lot_size'),
        "garageSpaces": property_row.get('garage_spaces'),
        "status": property_row.get('status'),
        "images": images
    }

    # Agent info (buyer-safe only - no private notes)
    agent_data = {
        "name": report_row.get('agent_name', 'Your Agent'),
        "email": report_row.get('agent_email'),
        "phone": report_row.get('agent_phone')
    }

    return SharedPropertyDetailResponse(
        property=property_data,
        aiAnalysis=ai_analysis,
        agent=agent_data,
        reportUrl=f"/buyer-report/{share_id}"
    )


# --- Email Template Helpers (single source of truth) ---

def build_top_properties_for_email(listings: list) -> list:
    """Build enriched property list for email. Single source of truth."""
    enriched = []
    for listing in listings[:5]:
        # Handle both camelCase and snake_case keys
        enriched.append({
            "address": listing.get("address"),
            "city": listing.get("city"),
            "bedrooms": listing.get("bedrooms"),
            "bathrooms": listing.get("bathrooms"),
            "listPrice": listing.get("listPrice") or listing.get("list_price"),
            # Skip hooks for now - add proper highlight_tagline field later
        })
    return enriched


def build_buyer_prefs_for_email(profile: dict | None) -> dict:
    """Extract buyer prefs for email personalization. Single source of truth."""
    if not profile:
        return {}
    return {
        "location": profile.get("location"),
        "budget": profile.get("budget"),
        "budget_min": profile.get("budget_min"),
        "budget_max": profile.get("budget_max"),
        "bedrooms": profile.get("bedrooms"),
    }


def build_default_email_body(
    buyer_name: str,
    agent_name: str,
    report_url: str,
    top_properties: list,
    buyer_prefs: dict = None,
    total_reviewed: int = None,
    total_narrowed: int = None
) -> str:
    """Build email body with robust fallbacks for sparse data."""

    # 1. Greeting - safe fallback
    safe_name = (buyer_name or "").strip() or "there"

    # 2. Prefs summary - human fallback, never "your criteria"
    pref_parts = []
    if buyer_prefs:
        if buyer_prefs.get("bedrooms"):
            pref_parts.append(f"{buyer_prefs['bedrooms']}+ bedrooms")
        if buyer_prefs.get("location"):
            pref_parts.append(f"in {buyer_prefs['location']}")

        # Budget formatting - handle range, single value, or string
        budget_min = buyer_prefs.get("budget_min")
        budget_max = buyer_prefs.get("budget_max")
        budget = buyer_prefs.get("budget")

        if budget_min and budget_max:
            # Format as range: "$600K - $750K"
            min_k = f"${budget_min // 1000}K" if budget_min >= 1000 else f"${budget_min:,}"
            max_k = f"${budget_max // 1000}K" if budget_max >= 1000 else f"${budget_max:,}"
            pref_parts.append(f"{min_k} - {max_k}")
        elif isinstance(budget, (int, float)):
            pref_parts.append(f"around ${budget:,.0f}")
        elif isinstance(budget, str) and budget:
            pref_parts.append(f"around {budget}")

    pref_summary = ", ".join(pref_parts) if pref_parts else "homes that match what you're looking for"

    # 3. Volume line - ONLY if meaningful (reviewed > showing)
    volume_line = ""
    showing_count = len(top_properties)
    if (
        total_reviewed
        and total_reviewed > showing_count  # Don't flex if no real filtering
        and total_narrowed
        and total_narrowed > 0
    ):
        volume_line = f"I reviewed about {total_reviewed} active homes that matched your basic criteria, narrowed them down to {total_narrowed} solid options, and I'm sharing the top {showing_count} here."

    # 4. Property bullets - show top 3 as teaser (full list in report)
    prop_lines = []
    for p in top_properties[:3]:
        bits = []

        if p.get("address"):
            bits.append(p["address"])
        if p.get("city"):
            bits.append(p["city"])

        meta_parts = []
        if p.get("bedrooms"):
            meta_parts.append(f"{p['bedrooms']} bd")
        if p.get("bathrooms"):
            meta_parts.append(f"{p['bathrooms']} ba")
        if meta_parts:
            bits.append(" / ".join(meta_parts))

        # Proper price formatting
        if isinstance(p.get("listPrice"), (int, float)):
            bits.append(f"${p['listPrice']:,.0f}")

        # Skip hooks for now - add later with proper highlight_tagline field

        # Don't add broken lines
        if bits:
            prop_lines.append(f"- {' – '.join(bits)}")

    # 5. Assemble email
    lines = [
        f"Hi {safe_name},",
        "",
        f"Based on what you shared about wanting {pref_summary}, I pulled together a short list of homes I'd actually recommend – with notes on why they're a fit and what to watch out for.",
    ]

    if volume_line:
        lines.extend(["", volume_line])

    if prop_lines:
        lines.extend(["", "Here are a few of the standouts:"] + prop_lines)

    lines.extend([
        "",
        f"You can see the full list and details here: {report_url}",
        "Each home has a quick breakdown of why it could work for you and what I'd be paying attention to if we go see it in person.",
        "",
        "Take 5 minutes to skim this and reply with 2–3 homes you'd like to see, or any that are a hard no.",
        "If none of these feel right, hit reply and tell me what's missing and I'll adjust the search.",
        "",
        f"– {agent_name}",
    ])

    return "\n".join(lines)


def build_lead_email_body(
    buyer_name: str,
    agent_name: str,
    report_url: str,
    top_properties: list,
    lead_context: dict,
    synthesis_data: dict = None,
) -> str:
    """
    Email body for leads - demonstrates agent value through due diligence.

    Key elements:
    1. Introduction + context (how they found the property)
    2. Due diligence statement (what work the agent did)
    3. A specific insight/finding (proof of value)
    4. Property teasers with hooks
    5. Invitational CTA
    """

    safe_name = (buyer_name or "").strip() or "there"

    # Get values with proper None handling
    orig_address = lead_context.get("propertyAddress")  # Don't use default - check explicitly
    source = (lead_context.get("source") or "online").title()
    location = lead_context.get("location") or "your area"

    # Determine scenario and build intro/due_diligence based on what we know
    if orig_address:
        # Scenario 1: Property-specific lead
        orig_ref = orig_address
        if lead_context.get("propertyListPrice"):
            orig_ref += f" (${lead_context['propertyListPrice']:,})"
        intro = f"I noticed you were looking at {orig_ref} on {source}."
        due_diligence = "I took a closer look at that property and a few similar ones nearby - reviewed the listing photos, checked the locations, and put together some notes on what stands out and what to watch for."
    else:
        # Scenario 2/3: Area search (no specific property)
        intro = f"I noticed you're exploring homes in {location}."
        due_diligence = "I put together some options that might be worth considering - reviewed the listing photos, checked the locations, and added notes on what stands out and what to watch for."

    # Extract a specific insight from synthesis if available
    # This shows the agent actually analyzed the properties
    insight_line = ""
    if synthesis_data:
        ranked_picks = synthesis_data.get("ranked_picks", [])
        if ranked_picks and len(ranked_picks) > 0:
            top_pick = ranked_picks[0]
            if top_pick.get("why"):
                # Truncate to first sentence
                insight = top_pick["why"].split(".")[0] + "."
                insight_line = f"One standout: {insight}"

    lines = [
        f"Hi {safe_name},",
        "",
        f"I'm {agent_name}, a local agent in the area. {intro}",
        "",
        due_diligence,
        "",
    ]

    if insight_line:
        lines.append(insight_line)
        lines.append("")

    lines.append("Here are a few options worth considering:")
    lines.append("")

    # Property bullets with a hook/insight for each
    for p in top_properties[:3]:
        addr = p.get("address", "")
        price = p.get("listPrice")
        beds = p.get("bedrooms")

        # Try to get a short hook from aiAnalysis
        hook = ""
        ai = p.get("aiAnalysis", {})
        if ai:
            whats_matching = ai.get("whats_matching", [])
            if whats_matching and len(whats_matching) > 0:
                hook = f" - {whats_matching[0]}"

        line_parts = []
        if addr:
            line_parts.append(addr)
        if beds:
            line_parts.append(f"{beds} bd")
        if price and isinstance(price, (int, float)):
            line_parts.append(f"${price:,.0f}")

        if line_parts:
            lines.append(f"- {' / '.join(line_parts)}{hook}")

    lines.extend([
        "",
        f"Full breakdown with photos and notes here: {report_url}",
        "",
        "I'm here to help optimize your search - whether that's finding more options, answering questions about any of these, or just talking through what you're looking for.",
        "",
        "If any of these catch your eye, just hit reply. No pressure.",
        "",
        f"- {agent_name}",
    ])

    return "\n".join(lines)


def build_html_email(plain_text_body: str, report_url: str, agent_name: str) -> str:
    """
    Convert plain text email to HTML with a styled CTA button.
    Preserves the email content while adding professional styling.
    """
    # Escape HTML special characters in the plain text
    import html
    escaped_body = html.escape(plain_text_body)

    # Convert newlines to <br> for HTML display
    html_body = escaped_body.replace('\n', '<br>\n')

    # Replace the plain text URL with a styled button
    # The URL appears in formats like "here: {url}" or "here: {url}"
    url_patterns = [
        f"here: {report_url}",
        f"Full breakdown with photos and notes here: {report_url}",
        f"You can see the full list and details here: {report_url}",
    ]

    button_html = f'''
    <br><br>
    <a href="{report_url}"
       style="display: inline-block;
              background-color: #2563eb;
              color: #ffffff !important;
              padding: 14px 28px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;">
        View Your Property Report
    </a>
    <br><br>
    '''

    # Replace URL mention with button
    for pattern in url_patterns:
        escaped_pattern = html.escape(pattern)
        if escaped_pattern in html_body:
            html_body = html_body.replace(escaped_pattern, button_html)
            break

    # Wrap in full HTML email template
    return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
             line-height: 1.6;
             color: #333333;
             max-width: 600px;
             margin: 0 auto;
             padding: 20px;">
    <div style="background-color: #ffffff; padding: 30px; border-radius: 8px;">
        {html_body}
    </div>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;
                font-size: 12px; color: #6b7280; text-align: center;">
        Sent via ResidenceHive
    </div>
</body>
</html>'''


@router.post("/{share_id}/send-email")
def send_buyer_report_email(
    share_id: str,
    payload: SendReportEmailRequest,
    agent_id: int = Depends(get_current_agent_id)
):
    """
    AGENT-only endpoint - Send buyer report via email.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Load report + buyer profile, validate ownership
            cur.execute(
                """
                SELECT br.*, bp.name as buyer_name, bp.location, bp.budget, bp.budget_min, bp.budget_max, bp.bedrooms
                FROM buyer_reports br
                JOIN buyer_profiles bp ON br.profile_id = bp.id
                WHERE br.share_id = %s
                """,
                (share_id,)
            )
            report_row = fetchone_dict(cur)

            if not report_row:
                raise HTTPException(status_code=404, detail="Report not found")

            if report_row['agent_id'] != agent_id:
                raise HTTPException(status_code=404, detail="Report not found")

            # Get agent info
            cur.execute("SELECT first_name || ' ' || last_name AS name, email FROM agents WHERE id = %s", (agent_id,))
            agent_row = cur.fetchone()
            agent_name = agent_row[0] if agent_row else "Your Agent"
            agent_email = agent_row[1] if agent_row else None

    # 2. Build report URL
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://residencehive.com")
    report_url = f"{frontend_url}/buyer-report/{share_id}"

    # 3. Get listings from search context
    search_id = report_row['search_id']
    search_context = get_search_context(search_id)

    listings = []
    total_reviewed = None
    if search_context:
        all_listings = search_context.get('ranked_listings', [])
        included_ids = report_row.get('included_listing_ids', [])
        listings = [l for l in all_listings if l.get('mlsNumber') in included_ids]
        total_reviewed = len(all_listings)

    # 4. Use shared helpers - single source of truth
    top_properties = build_top_properties_for_email(listings)
    buyer_prefs = {
        "location": report_row.get("location"),
        "budget": report_row.get("budget"),
        "budget_min": report_row.get("budget_min"),
        "budget_max": report_row.get("budget_max"),
        "bedrooms": report_row.get("bedrooms"),
    }

    # 5. Build email content - check for lead context first
    buyer_name = report_row.get('buyer_name', '')
    subject = payload.subject or f"Homes I'd recommend for {buyer_name or 'you'}"

    # Parse synthesis_data to check for lead context
    synthesis_data = report_row.get('synthesis_data', {})
    if isinstance(synthesis_data, str):
        try:
            synthesis_data = json.loads(synthesis_data) if synthesis_data else {}
        except json.JSONDecodeError:
            synthesis_data = {}

    lead_context = synthesis_data.get('lead_context') if isinstance(synthesis_data, dict) else None

    # Use lead-aware email template if this is from a lead
    if payload.body:
        body = payload.body
    elif lead_context:
        body = build_lead_email_body(
            buyer_name=buyer_name,
            agent_name=agent_name,
            report_url=report_url,
            top_properties=top_properties,
            lead_context=lead_context,
            synthesis_data=synthesis_data,
        )
    else:
        body = build_default_email_body(
            buyer_name=buyer_name,
            agent_name=agent_name,
            report_url=report_url,
            top_properties=top_properties,
            buyer_prefs=buyer_prefs,
            total_reviewed=total_reviewed,
            total_narrowed=len(listings)
        )

    # Build HTML version with styled button
    html_body = build_html_email(body, report_url, agent_name)

    # 6. Send via configured provider
    # Always use DEFAULT_FROM_EMAIL (must be verified in Mailjet)
    # Agent's email goes in reply_to so replies go to them
    from ..services.email_service import send_email, DEFAULT_FROM_EMAIL
    try:
        success = send_email(
            to_email=payload.to_email,
            from_email=DEFAULT_FROM_EMAIL,
            subject=subject,
            body=body,
            reply_to=agent_email,
            html_body=html_body
        )
        if not success:
            raise HTTPException(status_code=502, detail="Failed to send email")
    except ValueError as e:
        logger.error(f"[REPORT_EMAIL_FAILED] share_id={share_id} to={payload.to_email} error={e}")
        raise HTTPException(status_code=502, detail="Email service not configured")
    except Exception as e:
        logger.error(f"[REPORT_EMAIL_FAILED] share_id={share_id} to={payload.to_email} error={e}")
        raise HTTPException(status_code=502, detail="Failed to send email")

    # 7. Track lead status if this report came from a lead
    # (lead_context was already parsed above in step 5)
    if lead_context and lead_context.get('leadId'):
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE leads
                        SET report_sent_at = NOW(),
                            report_share_id = %s,
                            status = CASE WHEN status = 'classified' THEN 'engaged' ELSE status END
                        WHERE id = %s
                    """, (share_id, lead_context['leadId']))
            logger.info(f"[REPORT_EMAIL] Updated lead {lead_context['leadId']} with report_sent_at")
        except Exception as e:
            logger.error(f"[REPORT_EMAIL] Failed to update lead status: {e}")

    # 8. Log for analytics
    logger.info(f"[REPORT_EMAIL_SENT] share_id={share_id} to={payload.to_email} agent_id={agent_id}")

    return {"status": "sent", "to": payload.to_email}


@router.put("/{share_id}/notes")
def update_buyer_notes(
    share_id: str,
    payload: UpdateBuyerNotesRequest
):
    """
    PUBLIC endpoint - Update buyer notes on a report.
    No authentication required (buyers access this via shared link).
    Notes are synced to agent dashboard for visibility.
    """
    logger.info(f"[BUYER_NOTES] Updating notes for share_id={share_id}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify report exists
            cur.execute(
                "SELECT share_id, agent_id, profile_id FROM buyer_reports WHERE share_id = %s",
                (share_id,)
            )
            report_row = fetchone_dict(cur)

            if not report_row:
                raise HTTPException(status_code=404, detail="Report not found")

            # Update notes with timestamp
            cur.execute(
                """
                UPDATE buyer_reports
                SET buyer_notes = %s,
                    buyer_notes_updated_at = NOW()
                WHERE share_id = %s
                RETURNING buyer_notes_updated_at
                """,
                (payload.notes, share_id)
            )
            result = cur.fetchone()

            if not result:
                raise HTTPException(status_code=500, detail="Failed to update notes")

            updated_at = result[0].isoformat() if result[0] else None

    logger.info(f"[BUYER_NOTES] Updated notes for share_id={share_id}, agent_id={report_row['agent_id']}")

    return {
        "success": True,
        "updatedAt": updated_at
    }


# --- Per-Property Notes (Hybrid Approach) ---

class PropertyNoteResponse(BaseModel):
    listingId: str
    noteText: Optional[str] = None
    updatedAt: Optional[str] = None


class UpdatePropertyNoteRequest(BaseModel):
    note: str


@router.get("/{share_id}/property-notes", response_model=List[PropertyNoteResponse])
def get_property_notes(share_id: str):
    """
    PUBLIC endpoint - Get all property notes for a buyer report.
    Returns notes for all listings in the report.
    """
    logger.info(f"[PROPERTY_NOTES] Getting notes for share_id={share_id}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify report exists
            cur.execute(
                "SELECT share_id FROM buyer_reports WHERE share_id = %s",
                (share_id,)
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Report not found")

            # Get all property notes for this report
            cur.execute(
                """
                SELECT listing_id, note_text, updated_at
                FROM buyer_report_property_notes
                WHERE report_share_id = %s
                ORDER BY updated_at DESC
                """,
                (share_id,)
            )
            notes_rows = fetchall_dicts(cur)

    return [
        PropertyNoteResponse(
            listingId=row['listing_id'],
            noteText=row.get('note_text'),
            updatedAt=row['updated_at'].isoformat() if row.get('updated_at') else None
        )
        for row in notes_rows
    ]


@router.put("/{share_id}/property-notes/{listing_id}")
def update_property_note(
    share_id: str,
    listing_id: str,
    payload: UpdatePropertyNoteRequest
):
    """
    PUBLIC endpoint - Update note for a specific property in a buyer report.
    Creates note if it doesn't exist (upsert).
    """
    logger.info(f"[PROPERTY_NOTES] Updating note for share_id={share_id}, listing_id={listing_id}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify report exists and listing is in report
            cur.execute(
                "SELECT share_id, included_listing_ids FROM buyer_reports WHERE share_id = %s",
                (share_id,)
            )
            report_row = fetchone_dict(cur)

            if not report_row:
                raise HTTPException(status_code=404, detail="Report not found")

            # Verify listing is in report's included listings
            included_ids = report_row.get('included_listing_ids', [])
            if str(listing_id) not in [str(lid) for lid in included_ids]:
                raise HTTPException(status_code=404, detail="Property not found in this report")

            # Upsert the property note
            cur.execute(
                """
                INSERT INTO buyer_report_property_notes (report_share_id, listing_id, note_text)
                VALUES (%s, %s, %s)
                ON CONFLICT (report_share_id, listing_id)
                DO UPDATE SET note_text = EXCLUDED.note_text, updated_at = NOW()
                RETURNING updated_at
                """,
                (share_id, listing_id, payload.note)
            )
            result = cur.fetchone()

            if not result:
                raise HTTPException(status_code=500, detail="Failed to update property note")

            updated_at = result[0].isoformat() if result[0] else None

    logger.info(f"[PROPERTY_NOTES] Updated note for listing_id={listing_id} in report {share_id}")

    return {
        "success": True,
        "listingId": listing_id,
        "updatedAt": updated_at
    }
