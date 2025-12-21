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
    defaultEmailSubject: Optional[str] = None  # Pre-built email subject for outreach
    defaultEmailBody: Optional[str] = None  # Pre-built email body for outreach
    profileId: Optional[int] = None  # For chatbot integration
    agentId: Optional[int] = None  # For chatbot integration


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
            # Get report metadata including buyer prefs for email
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

    # Add propertyUrl to each listing for "View Details" links
    for listing in ordered_listings:
        mls = listing.get('mlsNumber')
        if mls:
            listing['propertyUrl'] = f"/shared/reports/{share_id}/property/{mls}"

    # Parse synthesis_data from JSON
    synthesis = None
    if report_row.get('synthesis_data'):
        try:
            synthesis = report_row['synthesis_data']
            if isinstance(synthesis, str):
                synthesis = json.loads(synthesis)
        except (json.JSONDecodeError, TypeError):
            synthesis = None

    # Build default email for outreach modal (single source of truth)
    import os as _os
    frontend_url = _os.getenv("FRONTEND_BASE_URL", "https://app.residencehive.com")
    report_url = f"{frontend_url}/buyer-report/{share_id}"

    buyer_prefs = {
        "location": report_row.get("location"),
        "budget": report_row.get("budget"),
        "budget_min": report_row.get("budget_min"),
        "budget_max": report_row.get("budget_max"),
        "bedrooms": report_row.get("bedrooms"),
    }
    top_properties = build_top_properties_for_email(ordered_listings)

    # total_reviewed = all listings from search context (already loaded above)
    total_reviewed = len(all_listings) if all_listings else None

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
        agentId=report_row.get('agent_id')
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
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residencehive.com")
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

    # 5. Build email content
    buyer_name = report_row.get('buyer_name', '')
    subject = payload.subject or f"Homes I'd recommend for {buyer_name or 'you'}"
    body = payload.body or build_default_email_body(
        buyer_name=buyer_name,
        agent_name=agent_name,
        report_url=report_url,
        top_properties=top_properties,
        buyer_prefs=buyer_prefs,
        total_reviewed=total_reviewed,
        total_narrowed=len(listings)
    )

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
            reply_to=agent_email
        )
        if not success:
            raise HTTPException(status_code=502, detail="Failed to send email")
    except ValueError as e:
        logger.error(f"[REPORT_EMAIL_FAILED] share_id={share_id} to={payload.to_email} error={e}")
        raise HTTPException(status_code=502, detail="Email service not configured")
    except Exception as e:
        logger.error(f"[REPORT_EMAIL_FAILED] share_id={share_id} to={payload.to_email} error={e}")
        raise HTTPException(status_code=502, detail="Failed to send email")

    # 7. Log for analytics
    logger.info(f"[REPORT_EMAIL_SENT] share_id={share_id} to={payload.to_email} agent_id={agent_id}")

    return {"status": "sent", "to": payload.to_email}
