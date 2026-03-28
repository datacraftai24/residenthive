"""
Admin router — internal tools for platform management.

Used by Piyush for pre-pilot setup, invite code management, and brokerage oversight.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
import re

from ..auth import require_role
from ..services.onboarding_service import (
    create_brokerage,
    list_brokerages,
    update_brokerage,
    verify_brokerage_mls,
    get_brokerage,
    list_all_agents,
    generate_invite_code,
    list_invite_codes,
    revoke_invite_code,
    list_pending_reviews,
    approve_review,
    reject_review,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================================================
# Request Models
# ============================================================================

class CreateBrokerageRequest(BaseModel):
    name: str
    broker_of_record_name: str
    email: str  # Broker of record's email — used for auto-linking on first sign-in
    jurisdiction: str  # MA or ON
    phone: Optional[str] = None
    license_number: Optional[str] = None

    @field_validator("jurisdiction")
    @classmethod
    def validate_jurisdiction(cls, v):
        if v not in ("MA", "ON"):
            raise ValueError("Jurisdiction must be MA or ON")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        # Brokerage phone is just a contact number, no strict format needed
        return v


class UpdateBrokerageRequest(BaseModel):
    name: Optional[str] = None
    broker_of_record_name: Optional[str] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    jurisdiction: Optional[str] = None
    verification_status: Optional[str] = None
    payment_status: Optional[str] = None
    clerk_user_id: Optional[str] = None


class GenerateInviteCodeRequest(BaseModel):
    brokerage_name: Optional[str] = None
    jurisdiction: Optional[str] = None
    expires_in_days: Optional[int] = None


class RejectReviewRequest(BaseModel):
    admin_notes: Optional[str] = None


# ============================================================================
# Brokerage Endpoints
# ============================================================================

@router.post("/brokerages")
async def admin_create_brokerage(
    data: CreateBrokerageRequest,
    agent: dict = Depends(require_role("admin")),
):
    """
    Create a brokerage (pre-pilot setup).
    Automatically runs Repliers MLS verification.
    """
    result = create_brokerage(
        name=data.name,
        broker_of_record_name=data.broker_of_record_name,
        jurisdiction=data.jurisdiction,
        email=data.email,
        phone=data.phone,
        license_number=data.license_number,
    )
    return result


@router.get("/brokerages")
async def admin_list_brokerages(
    agent: dict = Depends(require_role("admin")),
):
    """List all brokerages with agent counts."""
    return list_brokerages()


@router.patch("/brokerages/{brokerage_id}")
async def admin_update_brokerage(
    brokerage_id: int,
    data: UpdateBrokerageRequest,
    agent: dict = Depends(require_role("admin")),
):
    """Update brokerage fields."""
    result = update_brokerage(brokerage_id, **data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Brokerage not found")
    return result


@router.post("/brokerages/{brokerage_id}/verify")
async def admin_verify_brokerage(
    brokerage_id: int,
    agent: dict = Depends(require_role("admin")),
):
    """Manually trigger MLS verification for a brokerage."""
    try:
        return verify_brokerage_mls(brokerage_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============================================================================
# Agent Endpoints
# ============================================================================

@router.get("/agents")
async def admin_list_agents(
    agent: dict = Depends(require_role("admin")),
):
    """List all agents across all brokerages."""
    return list_all_agents()


# ============================================================================
# Invite Code Endpoints
# ============================================================================

@router.post("/invite-codes")
async def admin_generate_invite_code(
    data: GenerateInviteCodeRequest,
    agent: dict = Depends(require_role("admin")),
):
    """Generate an invite code."""
    return generate_invite_code(
        brokerage_name=data.brokerage_name,
        jurisdiction=data.jurisdiction,
        expires_in_days=data.expires_in_days,
    )


@router.get("/invite-codes")
async def admin_list_invite_codes(
    agent: dict = Depends(require_role("admin")),
):
    """List all invite codes."""
    return list_invite_codes()


@router.delete("/invite-codes/{code_id}")
async def admin_revoke_invite_code(
    code_id: int,
    agent: dict = Depends(require_role("admin")),
):
    """Revoke an invite code."""
    result = revoke_invite_code(code_id)
    if not result:
        raise HTTPException(status_code=404, detail="Invite code not found")
    return {"revoked": True}


# ============================================================================
# Manual Review Endpoints
# ============================================================================

@router.get("/reviews")
async def admin_list_reviews(
    agent: dict = Depends(require_role("admin")),
):
    """List pending brokerage review requests."""
    return list_pending_reviews()


@router.post("/reviews/{review_id}/approve")
async def admin_approve_review(
    review_id: int,
    agent: dict = Depends(require_role("admin")),
):
    """Approve a pending brokerage review."""
    result = approve_review(review_id)
    if not result:
        raise HTTPException(status_code=404, detail="Review not found")
    return result


@router.post("/reviews/{review_id}/reject")
async def admin_reject_review(
    review_id: int,
    data: RejectReviewRequest,
    agent: dict = Depends(require_role("admin")),
):
    """Reject a pending brokerage review."""
    result = reject_review(review_id, admin_notes=data.admin_notes)
    if not result:
        raise HTTPException(status_code=404, detail="Review not found")
    return result
