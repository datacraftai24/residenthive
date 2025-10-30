"""
Property management endpoints for buyer profiles
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from ..auth import get_current_agent_id
from ..db import get_conn, fetchall_dicts, fetchone_dict

router = APIRouter(prefix="/api")


class SavePropertyRequest(BaseModel):
    listing_id: str
    interaction_type: str = "saved"  # saved, interested, shortlisted, rejected
    rating: Optional[int] = None
    reason: Optional[str] = None


class UpdatePropertyRequest(BaseModel):
    interaction_type: Optional[str] = None
    rating: Optional[int] = None
    reason: Optional[str] = None


@router.post("/buyer-profiles/{profile_id}/properties")
async def save_property_to_profile(
    profile_id: int,
    request: SavePropertyRequest,
    agent_id: int = Depends(get_current_agent_id)
):
    """Save a property to a buyer's profile"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            session_id = f"profile_{profile_id}"
            
            # Ensure chat session exists for this profile
            cur.execute(
                """
                INSERT INTO chat_sessions (
                    id, profile_id, agent_id, session_start,
                    last_activity, created_at
                )
                VALUES (
                    %s, %s, %s, NOW()::text, NOW()::text, NOW()::text
                )
                ON CONFLICT (id) DO NOTHING
                """,
                (session_id, profile_id, agent_id)
            )
            
            # Check if already saved
            cur.execute(
                """
                SELECT id FROM property_interactions 
                WHERE session_id = %s AND listing_id = %s
                """,
                (session_id, request.listing_id)
            )
            existing = cur.fetchone()
            
            if existing:
                # Update existing
                cur.execute(
                    """
                    UPDATE property_interactions
                    SET interaction_type = %s, rating = %s, reason = %s
                    WHERE session_id = %s AND listing_id = %s
                    RETURNING id
                    """,
                    (request.interaction_type, request.rating, request.reason,
                     session_id, request.listing_id)
                )
            else:
                # Insert new
                cur.execute(
                    """
                    INSERT INTO property_interactions 
                    (id, session_id, listing_id, interaction_type, rating, reason, emotional_response, created_at)
                    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, NULL, NOW()::text)
                    RETURNING id
                    """,
                    (session_id, request.listing_id, 
                     request.interaction_type, request.rating, request.reason)
                )
            
            conn.commit()
            result = fetchone_dict(cur)
            
            return {
                "success": True,
                "id": result["id"],
                "message": "Property saved successfully"
            }


@router.get("/buyer-profiles/{profile_id}/properties")
async def get_saved_properties(
    profile_id: int,
    interaction_type: Optional[str] = None,
    agent_id: int = Depends(get_current_agent_id)
):
    """Get all saved properties for a buyer profile"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if interaction_type:
                query = """
                    SELECT 
                        pi.id,
                        pi.listing_id,
                        pi.interaction_type,
                        pi.rating,
                        pi.reason,
                        pi.created_at,
                        rl.address,
                        rl.price,
                        rl.bedrooms,
                        rl.bathrooms,
                        rl.square_feet,
                        rl.property_type,
                        rl.city,
                        rl.state,
                        rl.zip_code,
                        rl.description,
                        rl.images,
                        rl.mls_number
                    FROM property_interactions pi
                    LEFT JOIN repliers_listings rl ON pi.listing_id = rl.id
                    WHERE pi.session_id = %s AND pi.interaction_type = %s
                    ORDER BY pi.created_at DESC
                """
                cur.execute(query, (f"profile_{profile_id}", interaction_type))
            else:
                query = """
                    SELECT 
                        pi.id,
                        pi.listing_id,
                        pi.interaction_type,
                        pi.rating,
                        pi.reason,
                        pi.created_at,
                        rl.address,
                        rl.price,
                        rl.bedrooms,
                        rl.bathrooms,
                        rl.square_feet,
                        rl.property_type,
                        rl.city,
                        rl.state,
                        rl.zip_code,
                        rl.description,
                        rl.images,
                        rl.mls_number
                    FROM property_interactions pi
                    LEFT JOIN repliers_listings rl ON pi.listing_id = rl.id
                    WHERE pi.session_id = %s
                    ORDER BY pi.created_at DESC
                """
                cur.execute(query, (f"profile_{profile_id}",))
            
            properties = fetchall_dicts(cur)
            
            return {
                "profile_id": profile_id,
                "count": len(properties),
                "properties": properties
            }


@router.patch("/buyer-profiles/{profile_id}/properties/{listing_id}")
async def update_property_interaction(
    profile_id: int,
    listing_id: str,
    request: UpdatePropertyRequest,
    agent_id: int = Depends(get_current_agent_id)
):
    """Update a saved property's interaction details"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            updates = []
            params = []
            
            if request.interaction_type is not None:
                updates.append("interaction_type = %s")
                params.append(request.interaction_type)
            if request.rating is not None:
                updates.append("rating = %s")
                params.append(request.rating)
            if request.reason is not None:
                updates.append("reason = %s")
                params.append(request.reason)
            
            if not updates:
                raise HTTPException(status_code=400, detail="No fields to update")
            
            params.extend([f"profile_{profile_id}", listing_id])
            
            cur.execute(
                f"""
                UPDATE property_interactions
                SET {', '.join(updates)}
                WHERE session_id = %s AND listing_id = %s
                RETURNING id
                """,
                params
            )
            
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="Property interaction not found")
            
            conn.commit()
            
            return {
                "success": True,
                "message": "Property interaction updated"
            }


@router.delete("/buyer-profiles/{profile_id}/properties/{listing_id}")
async def remove_property_from_profile(
    profile_id: int,
    listing_id: str,
    agent_id: int = Depends(get_current_agent_id)
):
    """Remove a property from buyer's saved list"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM property_interactions
                WHERE session_id = %s AND listing_id = %s
                RETURNING id
                """,
                (f"profile_{profile_id}", listing_id)
            )

            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="Property not found in saved list")

            conn.commit()

            return {
                "success": True,
                "message": "Property removed from profile"
            }


@router.get("/properties/{listing_id}")
async def get_property_details(
    listing_id: str,
    profile_id: Optional[int] = None,
    agent_id: int = Depends(get_current_agent_id)
):
    """Get detailed property information including images, insights, and AI analysis"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get main property details
            cur.execute(
                """
                SELECT
                    rl.*
                FROM repliers_listings rl
                WHERE rl.id = %s
                """,
                (listing_id,)
            )

            property_data = fetchone_dict(cur)
            if not property_data:
                raise HTTPException(status_code=404, detail="Property not found")

            # Get all property images
            cur.execute(
                """
                SELECT
                    id, image_url, image_order, ai_description, visual_tags, created_at
                FROM property_images
                WHERE property_id = %s
                ORDER BY image_order ASC
                """,
                (listing_id,)
            )
            images = fetchall_dicts(cur)

            # Get investment insights
            cur.execute(
                """
                SELECT
                    estimated_rental, price_per_sqft, investment_summary,
                    risk_factors, market_trends, cap_rate, roi_estimate,
                    created_at, updated_at
                FROM property_insights
                WHERE property_id = %s
                """,
                (listing_id,)
            )
            insights = fetchone_dict(cur)

            # Get AI analysis if profile_id is provided
            ai_analysis = None
            if profile_id:
                cur.execute(
                    """
                    SELECT
                        analysis_json, score, created_at
                    FROM property_analysis_cache
                    WHERE listing_id = %s AND profile_id = %s
                    """,
                    (listing_id, profile_id)
                )
                ai_analysis = fetchone_dict(cur)

            # Get interaction status if profile_id is provided
            interaction_status = None
            if profile_id:
                cur.execute(
                    """
                    SELECT
                        interaction_type, rating, reason, created_at
                    FROM property_interactions
                    WHERE listing_id = %s AND session_id = %s
                    """,
                    (listing_id, f"profile_{profile_id}")
                )
                interaction_status = fetchone_dict(cur)

            return {
                "property": property_data,
                "images": images,
                "insights": insights,
                "ai_analysis": ai_analysis,
                "interaction_status": interaction_status
            }
