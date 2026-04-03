"""
Onboarding business logic service.

Handles brokerage creation, agent invitations, MLS verification,
compliance acknowledgment, and onboarding status checks.
"""

import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from ..db import get_conn, fetchone_dict, fetchall_dicts
from ..logging_config import get_logger
from .repliers_directory import RepliersDirectoryClient
from .email_service import send_email
from .email_templates import broker_welcome_email, agent_invitation_email

logger = get_logger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", os.getenv("FRONTEND_BASE_URL", os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:5173")))
INVITATION_EXPIRY_DAYS = 7


def _generate_token(length: int = 32) -> str:
    """Generate a URL-safe token."""
    return secrets.token_urlsafe(length)


def _generate_invite_code() -> str:
    """Generate an 8-character alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))


# ============================================================================
# Brokerage Operations
# ============================================================================

def create_brokerage(
    name: str,
    broker_of_record_name: str,
    jurisdiction: str,
    email: str = None,
    phone: str = None,
    license_number: str = None,
) -> Dict:
    """
    Create a brokerage record and run MLS verification silently.
    Called by admin during pre-pilot setup.
    Sends welcome email to the broker of record if email is provided.
    """
    # Run Repliers verification (non-blocking)
    directory_client = RepliersDirectoryClient()
    mls_match = directory_client.verify_brokerage(name, jurisdiction)

    verification_status = "verified" if mls_match else "unverified"
    mls_pin_brokerage_id = mls_match["id"] if mls_match else None

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO brokerages (
                    name, broker_of_record_name, email, phone, license_number,
                    jurisdiction, mls_pin_brokerage_id, verification_status,
                    payment_status, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', NOW(), NOW())
                RETURNING *
            """, (
                name, broker_of_record_name, email, phone, license_number,
                jurisdiction, mls_pin_brokerage_id, verification_status,
            ))
            brokerage = fetchone_dict(cur)

    logger.info("Brokerage created", extra={
        "action": "brokerage_created",
        "extra_data": {
            "brokerage_id": brokerage["id"],
            "name": name,
            "jurisdiction": jurisdiction,
            "verification_status": verification_status,
        }
    })

    # Send welcome email to broker of record
    if email:
        signup_url = f"{FRONTEND_URL}/sign-up"
        html = broker_welcome_email(
            broker_name=broker_of_record_name,
            brokerage_name=name,
            signup_url=signup_url,
        )
        plain_text = f"""Hi {broker_of_record_name},

Your ResidenceHive pilot for {name} is live.

Every day, leads come in and go cold. ResidenceHive changes that — your agents get AI-powered buyer briefs, personalized to each buyer, backed by live MLS data.

Activate your account: {signup_url}

Setup takes three steps:
1. Create your account
2. Add your agents
3. They're live on the next lead

Text or call me at (860) 796-9167 — I want to make sure your team gets value from day one.

Piyush
Founder, ResidenceHive"""

        send_email(
            to_email=email,
            subject=f"Your pilot is live — let's turn more leads into clients",
            body=plain_text,
            html_body=html,
            from_name="Piyush from ResidenceHive",
            reply_to="piyush@residencehive.com",
        )

    return {
        "brokerage": brokerage,
        "mls_match": mls_match,
        "verification_status": verification_status,
    }


def get_brokerage(brokerage_id: int) -> Optional[Dict]:
    """Get brokerage by ID."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM brokerages WHERE id = %s", (brokerage_id,))
            return fetchone_dict(cur)


def get_brokerage_by_clerk_user(clerk_user_id: str) -> Optional[Dict]:
    """Get brokerage by Clerk user ID (for brokerage admins)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM brokerages WHERE clerk_user_id = %s", (clerk_user_id,))
            return fetchone_dict(cur)


def confirm_brokerage(brokerage_id: int) -> Dict:
    """Brokerage admin confirms their office details (one-time)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE brokerages SET confirmed_at = NOW(), updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (brokerage_id,))
            return fetchone_dict(cur)


def update_brokerage(brokerage_id: int, **kwargs) -> Optional[Dict]:
    """Update brokerage fields. Used by admin."""
    allowed_fields = {
        "name", "broker_of_record_name", "phone", "license_number",
        "jurisdiction", "verification_status", "payment_status",
        "clerk_user_id", "mls_pin_brokerage_id",
    }
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields and v is not None}
    if not updates:
        return get_brokerage(brokerage_id)

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values())

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE brokerages SET {set_clause}, updated_at = NOW() WHERE id = %s RETURNING *",
                values + [brokerage_id]
            )
            return fetchone_dict(cur)


def verify_brokerage_mls(brokerage_id: int) -> Dict:
    """Manually trigger MLS verification for a brokerage. Admin use."""
    brokerage = get_brokerage(brokerage_id)
    if not brokerage:
        raise ValueError("Brokerage not found")

    directory_client = RepliersDirectoryClient()
    mls_match = directory_client.verify_brokerage(brokerage["name"], brokerage["jurisdiction"])

    with get_conn() as conn:
        with conn.cursor() as cur:
            if mls_match:
                cur.execute("""
                    UPDATE brokerages SET
                        verification_status = 'verified',
                        mls_pin_brokerage_id = %s,
                        updated_at = NOW()
                    WHERE id = %s RETURNING *
                """, (mls_match["id"], brokerage_id))
            else:
                cur.execute("SELECT * FROM brokerages WHERE id = %s", (brokerage_id,))
            brokerage = fetchone_dict(cur)

    return {"brokerage": brokerage, "mls_match": mls_match}


def list_brokerages() -> list:
    """List all brokerages with agent counts."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT b.*,
                    (SELECT COUNT(*) FROM agents a WHERE a.brokerage_id = b.id) as agent_count
                FROM brokerages b
                ORDER BY b.created_at DESC
            """)
            return fetchall_dicts(cur)


# ============================================================================
# Invite Code Operations
# ============================================================================

def generate_invite_code(
    brokerage_name: str = None,
    jurisdiction: str = None,
    expires_in_days: int = None,
) -> Dict:
    """Generate an admin invite code."""
    code = _generate_invite_code()
    expires_at = None
    if expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO invite_codes (code, brokerage_name, jurisdiction, expires_at, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                RETURNING *
            """, (code, brokerage_name, jurisdiction, expires_at))
            invite_code = fetchone_dict(cur)

    logger.info("Invite code generated", extra={
        "action": "invite_code_generated",
        "extra_data": {"code": code, "brokerage_name": brokerage_name}
    })

    return invite_code


def list_invite_codes() -> list:
    """List all invite codes."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM invite_codes ORDER BY created_at DESC")
            return fetchall_dicts(cur)


def revoke_invite_code(code_id: int) -> Optional[Dict]:
    """Revoke an invite code."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE invite_codes SET revoked_at = NOW()
                WHERE id = %s RETURNING *
            """, (code_id,))
            return fetchone_dict(cur)


def redeem_invite_code(code: str, brokerage_id: int) -> Optional[Dict]:
    """Redeem an invite code for a brokerage."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM invite_codes
                WHERE code = %s AND is_used = FALSE AND revoked_at IS NULL
            """, (code,))
            invite = fetchone_dict(cur)

            if not invite:
                return None

            # Check expiry
            if invite.get("expires_at") and invite["expires_at"] < datetime.now(timezone.utc):
                return None

            # Mark code as used
            cur.execute("""
                UPDATE invite_codes SET is_used = TRUE, used_by_brokerage_id = %s
                WHERE id = %s
            """, (brokerage_id, invite["id"]))

            # Update brokerage verification status
            cur.execute("""
                UPDATE brokerages SET verification_status = 'invite_code', updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (brokerage_id,))
            brokerage = fetchone_dict(cur)

            return brokerage


# ============================================================================
# Agent Invitation Operations
# ============================================================================

def create_agent_invitation(
    brokerage_id: int,
    email: str,
    name: str = None,
    phone: str = None,
) -> Dict:
    """
    Create an agent invitation and send email.
    Token expires in 7 days.
    """
    token = _generate_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=INVITATION_EXPIRY_DAYS)

    # Get brokerage name for the email
    brokerage = get_brokerage(brokerage_id)
    brokerage_name = brokerage["name"] if brokerage else "your brokerage"

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO agent_invitations (
                    brokerage_id, email, name, phone, token, expires_at, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING *
            """, (brokerage_id, email, name, phone, token, expires_at))
            invitation = fetchone_dict(cur)

    # Send invitation email
    invite_url = f"{FRONTEND_URL}/sign-up?invitation_token={token}"

    # Get broker of record name for the email
    broker_of_record = brokerage.get("broker_of_record_name", "Your broker") if brokerage else "Your broker"

    html = agent_invitation_email(
        agent_name=name or "",
        broker_name=broker_of_record,
        brokerage_name=brokerage_name,
        invitation_url=invite_url,
    )
    plain_text = f"""{broker_of_record} added you to {brokerage_name} on ResidenceHive.

{brokerage_name} is using ResidenceHive to turn leads into clients faster. Once you join, every new lead gets an AI-powered buyer brief — personalized, MLS-backed, and ready to send.

Join your team: {invite_url}

Setup takes 2 minutes. This invitation expires in {INVITATION_EXPIRY_DAYS} days.

If you didn't expect this email, you can safely ignore it."""

    send_email(
        to_email=email,
        subject=f"{broker_of_record} set you up on ResidenceHive — you're one step away",
        body=plain_text,
        html_body=html,
        from_name="ResidenceHive",
        reply_to="piyush@residencehive.com",
    )

    logger.info("Agent invitation sent", extra={
        "action": "agent_invitation_sent",
        "extra_data": {
            "brokerage_id": brokerage_id,
            "email": email,
            "token": token[:8] + "...",
        }
    })

    return invitation


def validate_invitation_token(token: str) -> Optional[Dict]:
    """
    Validate an invitation token. Public endpoint — no auth.
    Returns invitation details + brokerage name if valid.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ai.*, b.name as brokerage_name, b.jurisdiction
                FROM agent_invitations ai
                JOIN brokerages b ON b.id = ai.brokerage_id
                WHERE ai.token = %s AND ai.accepted_at IS NULL
            """, (token,))
            invitation = fetchone_dict(cur)

            if not invitation:
                return None

            # Check expiry
            if invitation["expires_at"] < datetime.now(timezone.utc):
                return None

            return invitation


def list_invitations(brokerage_id: int) -> list:
    """List invitations for a brokerage."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM agent_invitations
                WHERE brokerage_id = %s
                ORDER BY created_at DESC
            """, (brokerage_id,))
            return fetchall_dicts(cur)


def revoke_invitation(invitation_id: int, brokerage_id: int) -> bool:
    """Revoke an invitation (delete it)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM agent_invitations
                WHERE id = %s AND brokerage_id = %s AND accepted_at IS NULL
            """, (invitation_id, brokerage_id))
            return cur.rowcount > 0


# ============================================================================
# Agent Onboarding Operations
# ============================================================================

def complete_agent_onboarding(
    clerk_user_id: str,
    invitation_token: str,
    first_name: str,
    last_name: str,
    phone: str,
    license_number: str = None,
    designation: str = None,
    coverage_areas: list = None,
) -> Dict:
    """
    Complete agent onboarding from invitation.
    Creates/updates agent record, links to brokerage, runs MLS verification silently.
    """
    # Validate invitation
    invitation = validate_invitation_token(invitation_token)
    if not invitation:
        raise ValueError("Invalid or expired invitation token")

    brokerage_id = invitation["brokerage_id"]
    brokerage = get_brokerage(brokerage_id)

    # Run MLS verification silently (MA only)
    directory_client = RepliersDirectoryClient()
    mls_match = None
    verification_status = "unverified"

    if brokerage and brokerage["jurisdiction"] == "MA" and brokerage.get("mls_pin_brokerage_id"):
        full_name = f"{first_name} {last_name}"
        mls_match = directory_client.verify_agent(full_name, brokerage["mls_pin_brokerage_id"])
        if mls_match:
            verification_status = "verified"

    mls_member_id = mls_match["id"] if mls_match else None

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if agent already exists (by clerk_user_id)
            cur.execute("SELECT * FROM agents WHERE clerk_user_id = %s", (clerk_user_id,))
            existing = fetchone_dict(cur)

            if existing:
                # Update existing agent with onboarding data
                cur.execute("""
                    UPDATE agents SET
                        first_name = %s, last_name = %s, phone = %s,
                        license_number = %s, designation = %s, coverage_areas = %s,
                        brokerage_id = %s, mls_member_id = %s,
                        verification_status = %s, role = 'agent'
                    WHERE clerk_user_id = %s
                    RETURNING *
                """, (
                    first_name, last_name, phone,
                    license_number, designation, coverage_areas,
                    brokerage_id, mls_member_id,
                    verification_status, clerk_user_id,
                ))
            else:
                # Create new agent
                email = invitation["email"]
                cur.execute("""
                    INSERT INTO agents (
                        clerk_user_id, email, first_name, last_name, phone,
                        license_number, designation, coverage_areas,
                        brokerage_id, brokerage_name, mls_member_id,
                        verification_status, role, is_activated, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'agent', TRUE, NOW())
                    RETURNING *
                """, (
                    clerk_user_id, email, first_name, last_name, phone,
                    license_number, designation, coverage_areas,
                    brokerage_id, brokerage["name"] if brokerage else None, mls_member_id,
                    verification_status,
                ))

            agent = fetchone_dict(cur)

            # Mark invitation as accepted
            cur.execute("""
                UPDATE agent_invitations SET accepted_at = NOW()
                WHERE token = %s
            """, (invitation_token,))

    logger.info("Agent onboarding completed", extra={
        "action": "agent_onboarded",
        "extra_data": {
            "agent_id": agent["id"],
            "brokerage_id": brokerage_id,
            "verification_status": verification_status,
        }
    })

    # Send WhatsApp welcome message (async, non-blocking)
    if phone:
        try:
            import asyncio
            asyncio.create_task(_send_welcome_whatsapp(phone, first_name, agent["id"]))
        except RuntimeError:
            # No event loop running (e.g., in sync context) — skip silently
            logger.debug("Skipping WhatsApp welcome: no event loop")

    return {"agent": agent, "mls_match": mls_match, "verification_status": verification_status}


async def _send_welcome_whatsapp(phone: str, first_name: str, agent_id: int):
    """Send WhatsApp welcome message to newly onboarded agent via template."""
    try:
        from .whatsapp.client import WhatsAppClient, USE_TWILIO, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
        import httpx

        if not USE_TWILIO:
            logger.debug("Twilio not configured, skipping WhatsApp welcome")
            return

        # Use Twilio Content API to send approved template
        WELCOME_TEMPLATE_SID = os.getenv("TWILIO_WELCOME_TEMPLATE_SID", "HXf89e00b29ab47bb8544b6549ee553400")

        # Normalize phone
        if not phone.startswith("+"):
            phone = f"+{phone}"

        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        data = {
            "From": f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
            "To": f"whatsapp:{phone}",
            "ContentSid": WELCOME_TEMPLATE_SID,
            "ContentVariables": f'{{"1": "{first_name}"}}',
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                url,
                data=data,
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            )

            if response.status_code >= 400:
                result = response.json()
                logger.warning(f"WhatsApp welcome failed for agent {agent_id}: {result.get('message', 'unknown')}")
            else:
                logger.info(f"WhatsApp welcome sent to agent {agent_id} at {phone}")

    except Exception as e:
        # Never fail onboarding because of a welcome message
        logger.warning(f"WhatsApp welcome error for agent {agent_id}: {e}")


def acknowledge_compliance(agent_id: int) -> Dict:
    """Store compliance acknowledgment timestamp."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE agents SET compliance_acknowledged_at = NOW()
                WHERE id = %s RETURNING *
            """, (agent_id,))
            return fetchone_dict(cur)


def approve_agent(agent_id: int, brokerage_id: int) -> Optional[Dict]:
    """Brokerage admin manually approves an unverified agent."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE agents SET verification_status = 'verified'
                WHERE id = %s AND brokerage_id = %s
                RETURNING *
            """, (agent_id, brokerage_id))
            return fetchone_dict(cur)


def list_brokerage_agents(brokerage_id: int) -> list:
    """List agents for a brokerage."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, clerk_user_id, email, first_name, last_name, phone,
                       license_number, designation, coverage_areas,
                       verification_status, compliance_acknowledged_at,
                       is_activated, created_at
                FROM agents
                WHERE brokerage_id = %s
                ORDER BY created_at DESC
            """, (brokerage_id,))
            return fetchall_dicts(cur)


def list_all_agents() -> list:
    """List all agents across brokerages. Admin use."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT a.id, a.clerk_user_id, a.email, a.first_name, a.last_name,
                       a.phone, a.brokerage_id, a.verification_status,
                       a.compliance_acknowledged_at, a.role, a.created_at,
                       b.name as brokerage_name
                FROM agents a
                LEFT JOIN brokerages b ON b.id = a.brokerage_id
                ORDER BY a.created_at DESC
            """)
            return fetchall_dicts(cur)


# ============================================================================
# Onboarding Status
# ============================================================================

def get_onboarding_status(clerk_user_id: str) -> Dict:
    """
    Return the user's onboarding state. This is the routing oracle —
    the frontend calls this to decide where to redirect.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if user is a brokerage admin
            cur.execute("SELECT * FROM brokerages WHERE clerk_user_id = %s", (clerk_user_id,))
            brokerage = fetchone_dict(cur)

            # Check if user is an agent
            cur.execute("SELECT * FROM agents WHERE clerk_user_id = %s", (clerk_user_id,))
            agent = fetchone_dict(cur)

    # Determine role
    role = "agent"
    if agent and agent.get("role"):
        role = agent["role"]
    elif brokerage and not agent:
        role = "brokerage_admin"

    # Legacy agent: has no brokerage_id, existed before onboarding system
    is_legacy = False
    if agent and agent.get("brokerage_id") is None and agent.get("role") == "agent":
        is_legacy = True

    # Build brokerage status
    brokerage_status = None
    if brokerage:
        brokerage_status = {
            "id": brokerage["id"],
            "name": brokerage["name"],
            "jurisdiction": brokerage["jurisdiction"],
            "verification_status": brokerage["verification_status"],
            "payment_status": brokerage["payment_status"],
            "confirmed": brokerage.get("confirmed_at") is not None,
        }
    elif agent and agent.get("brokerage_id"):
        # Agent's brokerage
        b = get_brokerage(agent["brokerage_id"])
        if b:
            brokerage_status = {
                "id": b["id"],
                "name": b["name"],
                "jurisdiction": b["jurisdiction"],
                "verification_status": b["verification_status"],
                "payment_status": b["payment_status"],
                "confirmed": b.get("confirmed_at") is not None,
            }

    compliance_acknowledged = False
    if agent and agent.get("compliance_acknowledged_at"):
        compliance_acknowledged = True

    # Determine if onboarding is complete
    onboarding_complete = False
    if is_legacy:
        onboarding_complete = True
    elif role == "brokerage_admin" and brokerage_status and brokerage_status["confirmed"]:
        onboarding_complete = True
    elif role == "agent" and compliance_acknowledged:
        onboarding_complete = True
    elif role == "admin":
        onboarding_complete = True

    return {
        "role": role,
        "onboarding_complete": onboarding_complete,
        "brokerage": brokerage_status,
        "compliance_acknowledged": compliance_acknowledged,
        "is_legacy_agent": is_legacy,
    }


# ============================================================================
# Manual Review Operations
# ============================================================================

def list_pending_reviews() -> list:
    """List pending manual review requests."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT mr.*, b.name as brokerage_name, b.jurisdiction,
                       b.broker_of_record_name, b.phone, b.license_number
                FROM manual_review_requests mr
                JOIN brokerages b ON b.id = mr.brokerage_id
                ORDER BY mr.created_at ASC
            """)
            return fetchall_dicts(cur)


def approve_review(review_id: int) -> Optional[Dict]:
    """Approve a manual review request."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE manual_review_requests
                SET status = 'approved', reviewed_at = NOW()
                WHERE id = %s RETURNING brokerage_id
            """, (review_id,))
            review = fetchone_dict(cur)
            if not review:
                return None

            # Activate the brokerage
            cur.execute("""
                UPDATE brokerages
                SET verification_status = 'verified', payment_status = 'active', updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (review["brokerage_id"],))
            return fetchone_dict(cur)


def reject_review(review_id: int, admin_notes: str = None) -> Optional[Dict]:
    """Reject a manual review request."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE manual_review_requests
                SET status = 'rejected', admin_notes = %s, reviewed_at = NOW()
                WHERE id = %s RETURNING *
            """, (admin_notes, review_id))
            return fetchone_dict(cur)


# ============================================================================
# Pilot Stats
# ============================================================================

def get_pilot_stats(brokerage_id: int) -> Dict:
    """Get pilot metrics for a brokerage."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Active agents
            cur.execute("""
                SELECT COUNT(*) as count FROM agents
                WHERE brokerage_id = %s AND compliance_acknowledged_at IS NOT NULL
            """, (brokerage_id,))
            active_agents = fetchone_dict(cur)["count"]

            # Total agents
            cur.execute("""
                SELECT COUNT(*) as count FROM agents WHERE brokerage_id = %s
            """, (brokerage_id,))
            total_agents = fetchone_dict(cur)["count"]

            # Pending invitations
            cur.execute("""
                SELECT COUNT(*) as count FROM agent_invitations
                WHERE brokerage_id = %s AND accepted_at IS NULL
                AND expires_at > NOW()
            """, (brokerage_id,))
            pending_invitations = fetchone_dict(cur)["count"]

            # Leads processed (by agents in this brokerage)
            cur.execute("""
                SELECT COUNT(*) as count FROM leads l
                JOIN agents a ON a.id = l.agent_id
                WHERE a.brokerage_id = %s
            """, (brokerage_id,))
            leads_processed = fetchone_dict(cur)["count"]

            # Buyer reports sent
            cur.execute("""
                SELECT COUNT(*) as count FROM buyer_reports br
                JOIN agents a ON a.id = br.agent_id
                WHERE a.brokerage_id = %s
            """, (brokerage_id,))
            reports_sent = fetchone_dict(cur)["count"]

    return {
        "active_agents": active_agents,
        "total_agents": total_agents,
        "pending_invitations": pending_invitations,
        "leads_processed": leads_processed,
        "reports_sent": reports_sent,
    }
