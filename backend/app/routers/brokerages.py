"""
Brokerages router — brokerage admin endpoints for managing agents and invitations.

These are the endpoints the brokerage admin uses from their dashboard.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
import re

from ..auth import get_current_agent, require_role
from ..services.onboarding_service import (
    get_brokerage,
    get_brokerage_by_clerk_user,
    confirm_brokerage,
    create_agent_invitation,
    list_invitations,
    revoke_invitation,
    list_brokerage_agents,
    approve_agent,
    get_pilot_stats,
)

router = APIRouter(prefix="/api/brokerages", tags=["brokerages"])


# ============================================================================
# Request Models
# ============================================================================

class InviteAgentRequest(BaseModel):
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if v and not re.match(r'^\+[1-9]\d{1,14}$', v):
            raise ValueError("Phone must be in E.164 format")
        return v


# ============================================================================
# Helpers
# ============================================================================

def _get_admin_brokerage(agent: dict) -> dict:
    """Get brokerage for the current brokerage_admin user."""
    # First try brokerage_id on agent record
    if agent.get("brokerage_id"):
        brokerage = get_brokerage(agent["brokerage_id"])
        if brokerage:
            return brokerage

    # Fallback: look up by clerk_user_id
    clerk_user_id = agent.get("clerk_user_id") or agent.get("clerk_user_id_from_token")
    if clerk_user_id:
        brokerage = get_brokerage_by_clerk_user(clerk_user_id)
        if brokerage:
            return brokerage

    raise HTTPException(status_code=404, detail="No brokerage found for this user")


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/me")
async def get_my_brokerage(
    agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """Get the current user's brokerage details."""
    brokerage = _get_admin_brokerage(agent)
    return brokerage


@router.post("/me/confirm")
async def confirm_my_brokerage(
    agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """One-time confirmation of brokerage details by the admin."""
    brokerage = _get_admin_brokerage(agent)
    result = confirm_brokerage(brokerage["id"])
    if not result:
        raise HTTPException(status_code=500, detail="Failed to confirm brokerage")
    return result


@router.get("/{brokerage_id}/agents")
async def get_brokerage_agents(
    brokerage_id: int,
    agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """List agents in a brokerage."""
    # Verify access — brokerage_admin can only see their own brokerage
    if agent.get("role") == "brokerage_admin":
        brokerage = _get_admin_brokerage(agent)
        if brokerage["id"] != brokerage_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return list_brokerage_agents(brokerage_id)


@router.post("/{brokerage_id}/invitations")
async def invite_agent(
    brokerage_id: int,
    data: InviteAgentRequest,
    agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """Send an agent invitation email."""
    if agent.get("role") == "brokerage_admin":
        brokerage = _get_admin_brokerage(agent)
        if brokerage["id"] != brokerage_id:
            raise HTTPException(status_code=403, detail="Access denied")

    invitation = create_agent_invitation(
        brokerage_id=brokerage_id,
        email=data.email,
        name=data.name,
        phone=data.phone,
    )
    return invitation


@router.get("/{brokerage_id}/invitations")
async def get_invitations(
    brokerage_id: int,
    agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """List invitations for a brokerage."""
    if agent.get("role") == "brokerage_admin":
        brokerage = _get_admin_brokerage(agent)
        if brokerage["id"] != brokerage_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return list_invitations(brokerage_id)


@router.delete("/{brokerage_id}/invitations/{invitation_id}")
async def delete_invitation(
    brokerage_id: int,
    invitation_id: int,
    agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """Revoke a pending invitation."""
    if agent.get("role") == "brokerage_admin":
        brokerage = _get_admin_brokerage(agent)
        if brokerage["id"] != brokerage_id:
            raise HTTPException(status_code=403, detail="Access denied")

    success = revoke_invitation(invitation_id, brokerage_id)
    if not success:
        raise HTTPException(status_code=404, detail="Invitation not found or already accepted")
    return {"deleted": True}


@router.post("/{brokerage_id}/agents/{agent_id}/approve")
async def approve_brokerage_agent(
    brokerage_id: int,
    agent_id: int,
    admin_agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """Manually approve an unverified agent."""
    if admin_agent.get("role") == "brokerage_admin":
        brokerage = _get_admin_brokerage(admin_agent)
        if brokerage["id"] != brokerage_id:
            raise HTTPException(status_code=403, detail="Access denied")

    result = approve_agent(agent_id, brokerage_id)
    if not result:
        raise HTTPException(status_code=404, detail="Agent not found in this brokerage")
    return result


@router.get("/{brokerage_id}/pilot-stats")
async def get_brokerage_pilot_stats(
    brokerage_id: int,
    agent: dict = Depends(require_role("brokerage_admin", "admin")),
):
    """Get pilot metrics for a brokerage."""
    if agent.get("role") == "brokerage_admin":
        brokerage = _get_admin_brokerage(agent)
        if brokerage["id"] != brokerage_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return get_pilot_stats(brokerage_id)
