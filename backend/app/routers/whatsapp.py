"""
WhatsApp Webhook Router

Handles incoming webhooks from Meta's WhatsApp Cloud API:
- GET /api/whatsapp/webhook - Verification endpoint
- POST /api/whatsapp/webhook - Message reception endpoint

Also provides agent registration endpoint:
- POST /api/whatsapp/connect - Connect agent's WhatsApp number
"""

import logging
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query, Depends
from pydantic import BaseModel

from ..db import get_conn, fetchone_dict
from ..auth import get_current_agent_id
from ..services.whatsapp.client import (
    WhatsAppClient,
    parse_webhook_message,
    get_status_update,
)
from ..services.whatsapp.session import SessionManager, SessionState
from ..services.whatsapp.buyer_codes import backfill_buyer_codes
from ..services.whatsapp.handlers import WhatsAppHandlers

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/whatsapp")


# ============================================================================
# Request/Response Models
# ============================================================================

class ConnectWhatsAppRequest(BaseModel):
    """Request to connect agent's WhatsApp"""
    phone: str  # E.164 format, e.g., "+16175551234"


class ConnectWhatsAppResponse(BaseModel):
    """Response after connecting WhatsApp"""
    success: bool
    phone: str
    buyers_with_codes: int
    message: str


# ============================================================================
# Agent Registration Endpoints
# ============================================================================

@router.post("/connect", response_model=ConnectWhatsAppResponse)
async def connect_whatsapp(
    request: ConnectWhatsAppRequest,
    agent_id: int = Depends(get_current_agent_id)
):
    """
    Connect an agent's WhatsApp number.
    
    This registers the phone number for receiving WhatsApp messages
    and backfills buyer codes for all existing buyers.
    """
    # Normalize phone number to E.164
    phone = request.phone.strip()
    if not phone.startswith("+"):
        phone = f"+{phone}"
    
    # Remove any spaces or dashes
    phone = phone.replace(" ", "").replace("-", "")
    
    # Validate format (basic check)
    if len(phone) < 10 or len(phone) > 16:
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Check if phone is already registered to another agent
                cur.execute(
                    "SELECT id FROM agents WHERE whatsapp_phone = %s AND id != %s",
                    (phone, agent_id)
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=400,
                        detail="This phone number is already connected to another account"
                    )
                
                # Update agent's WhatsApp phone
                cur.execute(
                    """
                    UPDATE agents 
                    SET whatsapp_phone = %s, whatsapp_connected_at = NOW()
                    WHERE id = %s
                    RETURNING id
                    """,
                    (phone, agent_id)
                )
                
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Agent not found")
        
        # Backfill buyer codes for existing buyers
        code_assignments = backfill_buyer_codes(agent_id)
        
        logger.info(f"Agent {agent_id} connected WhatsApp: {phone}, assigned {len(code_assignments)} buyer codes")
        
        return ConnectWhatsAppResponse(
            success=True,
            phone=phone,
            buyers_with_codes=len(code_assignments),
            message=f"WhatsApp connected! {len(code_assignments)} buyers assigned codes."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error connecting WhatsApp for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect WhatsApp")


@router.delete("/disconnect")
async def disconnect_whatsapp(agent_id: int = Depends(get_current_agent_id)):
    """
    Disconnect an agent's WhatsApp number.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE agents 
                    SET whatsapp_phone = NULL, whatsapp_connected_at = NULL
                    WHERE id = %s
                    RETURNING id
                    """,
                    (agent_id,)
                )
                
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Agent not found")
        
        logger.info(f"Agent {agent_id} disconnected WhatsApp")
        return {"success": True, "message": "WhatsApp disconnected"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting WhatsApp for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect WhatsApp")


@router.get("/status")
async def get_whatsapp_status(agent_id: int = Depends(get_current_agent_id)):
    """
    Get agent's WhatsApp connection status.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT whatsapp_phone, whatsapp_connected_at
                    FROM agents WHERE id = %s
                    """,
                    (agent_id,)
                )
                row = fetchone_dict(cur)
                
                if not row:
                    raise HTTPException(status_code=404, detail="Agent not found")
                
                # Count buyers with codes
                cur.execute(
                    """
                    SELECT COUNT(*) as count FROM buyer_profiles 
                    WHERE agent_id = %s AND whatsapp_code IS NOT NULL
                    """,
                    (agent_id,)
                )
                count_row = fetchone_dict(cur)
        
        return {
            "connected": row.get("whatsapp_phone") is not None,
            "phone": row.get("whatsapp_phone"),
            "connected_at": row.get("whatsapp_connected_at").isoformat() if row.get("whatsapp_connected_at") else None,
            "buyers_with_codes": count_row.get("count", 0) if count_row else 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting WhatsApp status for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get status")


# ============================================================================
# Webhook Endpoints
# ============================================================================

@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge")
):
    """
    Webhook verification endpoint for Meta.
    
    Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
    We verify the token and return the challenge to confirm ownership.
    """
    logger.info(f"Webhook verification: mode={hub_mode}, token={hub_token[:10] if hub_token else None}...")
    
    if hub_mode != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid mode")
    
    if not WhatsAppClient.verify_webhook_token(hub_token):
        logger.warning("Webhook verification failed: invalid token")
        raise HTTPException(status_code=403, detail="Invalid verify token")
    
    logger.info("Webhook verification successful")
    return int(hub_challenge)


@router.post("/webhook")
async def receive_webhook(request: Request):
    """
    Webhook endpoint for receiving WhatsApp messages.
    
    Processes incoming messages, status updates, and other events from Meta.
    """
    # Get raw body for signature verification
    body_bytes = await request.body()
    
    # Verify signature
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not WhatsAppClient.verify_webhook_signature(body_bytes, signature):
        logger.warning("Invalid webhook signature")
        raise HTTPException(status_code=403, detail="Invalid signature")
    
    # Parse body
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse webhook body: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    # Log webhook type
    logger.debug(f"Received webhook: {body}")
    
    # Check for message
    message_data = parse_webhook_message(body)
    if message_data:
        await _handle_incoming_message(message_data)
        return {"status": "ok"}
    
    # Check for status update
    status_data = get_status_update(body)
    if status_data:
        await _handle_status_update(status_data)
        return {"status": "ok"}
    
    # Unknown event type - acknowledge anyway
    logger.debug("Webhook received but no actionable content")
    return {"status": "ok"}


# ============================================================================
# Internal Message Processing
# ============================================================================

async def _handle_incoming_message(message_data: dict):
    """
    Process an incoming WhatsApp message.
    
    1. Look up agent by phone number
    2. Get or create session
    3. Parse intent
    4. Execute action
    5. Send response
    """
    sender_phone = message_data.get("sender")
    message_id = message_data.get("message_id")
    message_text = message_data.get("text") or ""
    
    logger.info(f"Processing message from {sender_phone}: {message_text[:50]}...")
    
    # Check for duplicate (in database)
    if await _is_duplicate_message(message_id):
        logger.debug(f"Skipping duplicate message: {message_id}")
        return
    
    # Look up agent by phone
    agent = await _get_agent_by_phone(sender_phone)
    if not agent:
        logger.warning(f"Unregistered phone: {sender_phone}")
        await _send_unregistered_response(sender_phone)
        return
    
    agent_id = agent["id"]
    
    # Get or create session
    session = await SessionManager.get_or_create(agent_id, sender_phone)
    
    # Log incoming message
    await _log_message(
        agent_id=agent_id,
        direction="inbound",
        wa_message_id=message_id,
        message_type=message_data.get("message_type", "text"),
        sender_phone=sender_phone,
        content={
            "text": message_text,
            "button_reply": message_data.get("button_reply"),
            "list_reply": message_data.get("list_reply"),
            "audio": message_data.get("audio"),
        },
        session_state=session.state.value
    )
    
    # Determine input type
    if message_data.get("button_reply"):
        input_text = message_data["button_reply"]["id"]
        input_type = "button"
    elif message_data.get("list_reply"):
        input_text = message_data["list_reply"]["id"]
        input_type = "list"
    elif message_data.get("audio"):
        # Voice note - transcribe first
        from ..services.whatsapp.voice import handle_voice_message
        audio_data = message_data["audio"]
        voice_result = await handle_voice_message(
            audio_id=audio_data.get("id"),
            mime_type=audio_data.get("mime_type", "audio/ogg"),
            agent_id=agent_id,
            phone=sender_phone
        )
        
        if voice_result.get("type") == "transcribed":
            input_text = voice_result["transcript"]
            input_type = "text"
            # Send acknowledgment
            client = WhatsAppClient()
            await client.send_text(
                sender_phone,
                f"🎤 I heard: \"{input_text[:100]}{'...' if len(input_text) > 100 else ''}\""
            )
        else:
            # Voice transcription failed, send error response
            client = WhatsAppClient()
            await client.send_text(sender_phone, voice_result.get("body", "Voice transcription failed"))
            return
    else:
        input_text = message_text
        input_type = "text"
    
    # Process through handlers
    try:
        handlers = WhatsAppHandlers(agent_id, sender_phone, session)
        response = await handlers.handle_message(input_text, input_type)
        
        # Send response
        client = WhatsAppClient()
        
        if response.get("type") == "text":
            await client.send_text(sender_phone, response["body"])
        elif response.get("type") == "buttons":
            await client.send_interactive_buttons(
                sender_phone,
                response["body"],
                response["buttons"],
                header=response.get("header"),
                footer=response.get("footer")
            )
        elif response.get("type") == "list":
            await client.send_interactive_list(
                sender_phone,
                response["body"],
                response["button_text"],
                response["sections"],
                header=response.get("header"),
                footer=response.get("footer")
            )
        
        # Log outgoing message
        await _log_message(
            agent_id=agent_id,
            direction="outbound",
            wa_message_id=None,
            message_type=response.get("type", "text"),
            sender_phone=sender_phone,
            content=response,
            intent_detected=response.get("intent"),
            session_state=session.state.value
        )
        
        # Mark as read
        await client.mark_as_read(message_id)
        
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        
        # Send error response
        try:
            client = WhatsAppClient()
            await client.send_text(
                sender_phone,
                "Sorry, something went wrong. Please try again or type 'help' for assistance."
            )
        except Exception:
            pass


async def _handle_status_update(status_data: dict):
    """Handle message status updates (delivered, read, etc.)"""
    logger.debug(f"Message status update: {status_data}")
    # For now, just log - could be used for delivery tracking


async def _get_agent_by_phone(phone: str) -> Optional[dict]:
    """Look up agent by WhatsApp phone number."""
    # Normalize phone
    phone_normalized = phone.replace("+", "").replace("-", "").replace(" ", "")
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Try with and without + prefix
            cur.execute(
                """
                SELECT id, email, first_name, last_name, whatsapp_phone
                FROM agents 
                WHERE whatsapp_phone = %s OR whatsapp_phone = %s
                """,
                (phone, f"+{phone_normalized}")
            )
            return fetchone_dict(cur)


async def _send_unregistered_response(phone: str):
    """Send response to unregistered phone number."""
    try:
        client = WhatsAppClient()
        await client.send_text(
            phone,
            "This number isn't connected to a ResidentHive account.\n\n"
            "To connect your WhatsApp:\n"
            "1. Log in to app.residenthive.com\n"
            "2. Go to Settings → WhatsApp\n"
            "3. Enter this phone number\n\n"
            "Need help? Contact support@residenthive.com"
        )
    except Exception as e:
        logger.error(f"Failed to send unregistered response: {e}")


async def _is_duplicate_message(message_id: str) -> bool:
    """Check if message has already been processed."""
    if not message_id:
        return False
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM whatsapp_messages WHERE wa_message_id = %s",
                (message_id,)
            )
            return cur.fetchone() is not None


async def _log_message(
    agent_id: int,
    direction: str,
    wa_message_id: Optional[str],
    message_type: str,
    sender_phone: str,
    content: dict,
    intent_detected: str = None,
    session_state: str = None,
    error_message: str = None
):
    """Log WhatsApp message to database."""
    try:
        import json
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO whatsapp_messages 
                    (agent_id, direction, wa_message_id, message_type, sender_phone, 
                     content, intent_detected, session_state, error_message)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (wa_message_id) DO NOTHING
                    """,
                    (
                        agent_id, direction, wa_message_id, message_type, sender_phone,
                        json.dumps(content), intent_detected, session_state, error_message
                    )
                )
    except Exception as e:
        logger.error(f"Failed to log message: {e}")
