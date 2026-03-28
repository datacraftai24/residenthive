"""
Onboarding router — agent onboarding, compliance acknowledgment, status checks.

Customer-facing endpoints for the onboarding flow.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional, List
import re

from ..auth import get_current_agent_id, get_current_agent, get_clerk_user_id
from ..services.onboarding_service import (
    complete_agent_onboarding,
    acknowledge_compliance,
    get_onboarding_status,
    validate_invitation_token,
)

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


# ============================================================================
# Request/Response Models
# ============================================================================

class AgentOnboardingRequest(BaseModel):
    invitation_token: str
    first_name: str
    last_name: str
    phone: str  # E.164 format
    license_number: Optional[str] = None
    designation: Optional[str] = None  # salesperson, broker, associate_broker
    coverage_areas: Optional[List[str]] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if not re.match(r'^\+[1-9]\d{1,14}$', v):
            raise ValueError("Phone must be in E.164 format (e.g., +16175551234)")
        return v

    @field_validator("designation")
    @classmethod
    def validate_designation(cls, v):
        if v and v not in ("salesperson", "broker", "associate_broker"):
            raise ValueError("Designation must be salesperson, broker, or associate_broker")
        return v


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/status")
async def onboarding_status(clerk_user_id: str = Depends(get_clerk_user_id)):
    """
    Routing oracle — returns the user's onboarding state.
    Frontend calls this on every protected page load to determine routing.
    """
    return get_onboarding_status(clerk_user_id)


@router.post("/agent")
async def onboard_agent(
    data: AgentOnboardingRequest,
    clerk_user_id: str = Depends(get_clerk_user_id),
):
    """
    Complete agent onboarding from invitation.
    Agent clicks invitation link → signs up via Clerk → submits this form.
    """
    try:
        result = complete_agent_onboarding(
            clerk_user_id=clerk_user_id,
            invitation_token=data.invitation_token,
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            license_number=data.license_number,
            designation=data.designation,
            coverage_areas=data.coverage_areas,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/compliance")
async def compliance_acknowledgment(agent_id: int = Depends(get_current_agent_id)):
    """
    Store compliance acknowledgment timestamp.
    Four items: Fair Housing, Agency Disclosure, Buyer Rep Agreement, AI Disclosure.
    All acknowledged with a single timestamp — the frontend gates all 4 checkboxes.
    """
    result = acknowledge_compliance(agent_id)
    if not result:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"acknowledged": True, "timestamp": result.get("compliance_acknowledged_at")}


@router.get("/invitations/{token}")
async def get_invitation(token: str):
    """
    Validate an invitation token. Public — no auth required.
    Returns brokerage name and pre-filled agent info for the signup form.
    """
    invitation = validate_invitation_token(token)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    return {
        "valid": True,
        "brokerage_name": invitation.get("brokerage_name"),
        "jurisdiction": invitation.get("jurisdiction"),
        "email": invitation.get("email"),
        "name": invitation.get("name"),
        "phone": invitation.get("phone"),
        "expires_at": invitation.get("expires_at"),
    }
