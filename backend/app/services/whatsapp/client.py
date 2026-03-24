"""
WhatsApp Cloud API Client

Provides methods for sending messages via Meta's WhatsApp Business Cloud API.
Supports text messages, interactive buttons, and list messages.

API Reference: https://developers.facebook.com/docs/whatsapp/cloud-api
"""

import os
import hmac
import hashlib
import logging
from typing import Optional, List, Dict, Any
import httpx

logger = logging.getLogger(__name__)

# Configuration from environment
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "residenthive-wa-verify")
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v18.0")
WHATSAPP_API_BASE = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"


class WhatsAppClientError(Exception):
    """Exception raised for WhatsApp API errors"""
    def __init__(self, message: str, status_code: int = None, response: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class WhatsAppClient:
    """
    Client for WhatsApp Cloud API.
    
    Usage:
        client = WhatsAppClient()
        await client.send_text("+1234567890", "Hello!")
    """
    
    def __init__(
        self,
        phone_number_id: str = None,
        access_token: str = None
    ):
        self.phone_number_id = phone_number_id or WHATSAPP_PHONE_NUMBER_ID
        self.access_token = access_token or WHATSAPP_ACCESS_TOKEN
        
        if not self.phone_number_id or not self.access_token:
            logger.warning("WhatsApp credentials not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get API headers"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
    
    def _get_messages_url(self) -> str:
        """Get messages endpoint URL"""
        return f"{WHATSAPP_API_BASE}/{self.phone_number_id}/messages"
    
    async def _send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send request to WhatsApp API.
        
        Args:
            payload: Message payload
            
        Returns:
            API response
            
        Raises:
            WhatsAppClientError: If API returns error
        """
        if not self.phone_number_id or not self.access_token:
            raise WhatsAppClientError("WhatsApp credentials not configured")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self._get_messages_url(),
                headers=self._get_headers(),
                json=payload
            )
            
            result = response.json()
            
            if response.status_code >= 400:
                error_msg = result.get("error", {}).get("message", "Unknown error")
                logger.error(f"WhatsApp API error: {error_msg}")
                raise WhatsAppClientError(
                    error_msg,
                    status_code=response.status_code,
                    response=result
                )
            
            return result
    
    async def send_text(
        self,
        to: str,
        text: str,
        preview_url: bool = False
    ) -> Dict[str, Any]:
        """
        Send a text message.
        
        Args:
            to: Recipient phone number (E.164 format)
            text: Message text (max 4096 chars)
            preview_url: Whether to show URL previews
            
        Returns:
            API response with message ID
        """
        # Normalize phone number
        to = to.replace("+", "").replace("-", "").replace(" ", "")
        
        # Truncate if too long
        if len(text) > 4096:
            text = text[:4090] + "..."
            logger.warning(f"Message truncated to 4096 chars for {to}")
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {
                "preview_url": preview_url,
                "body": text
            }
        }
        
        result = await self._send_request(payload)
        logger.info(f"Sent text message to {to}: {text[:50]}...")
        return result
    
    async def send_interactive_buttons(
        self,
        to: str,
        body: str,
        buttons: List[Dict[str, str]],
        header: str = None,
        footer: str = None
    ) -> Dict[str, Any]:
        """
        Send an interactive message with buttons.
        
        Args:
            to: Recipient phone number
            body: Message body text
            buttons: List of buttons, each with "id" and "title" (max 3 buttons, 20 chars each)
            header: Optional header text
            footer: Optional footer text
            
        Returns:
            API response
        """
        to = to.replace("+", "").replace("-", "").replace(" ", "")
        
        # Validate buttons (max 3, titles max 20 chars)
        if len(buttons) > 3:
            buttons = buttons[:3]
            logger.warning(f"Truncated to 3 buttons for {to}")
        
        button_list = []
        for btn in buttons:
            title = btn.get("title", "")[:20]
            button_list.append({
                "type": "reply",
                "reply": {
                    "id": btn.get("id", title.lower().replace(" ", "_")),
                    "title": title
                }
            })
        
        interactive = {
            "type": "button",
            "body": {"text": body[:1024]},
            "action": {"buttons": button_list}
        }
        
        if header:
            interactive["header"] = {"type": "text", "text": header[:60]}
        if footer:
            interactive["footer"] = {"text": footer[:60]}
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive
        }
        
        result = await self._send_request(payload)
        logger.info(f"Sent interactive buttons to {to}")
        return result
    
    async def send_interactive_list(
        self,
        to: str,
        body: str,
        button_text: str,
        sections: List[Dict[str, Any]],
        header: str = None,
        footer: str = None
    ) -> Dict[str, Any]:
        """
        Send an interactive list message.
        
        Args:
            to: Recipient phone number
            body: Message body text
            button_text: Text on the list button (max 20 chars)
            sections: List of sections, each with "title" and "rows"
                     Each row has "id", "title" (max 24 chars), and optional "description" (max 72 chars)
            header: Optional header text
            footer: Optional footer text
            
        Returns:
            API response
        """
        to = to.replace("+", "").replace("-", "").replace(" ", "")
        
        # Validate and format sections
        formatted_sections = []
        total_rows = 0
        
        for section in sections:
            rows = []
            for row in section.get("rows", []):
                if total_rows >= 10:  # Max 10 rows total
                    break
                rows.append({
                    "id": row.get("id", str(total_rows)),
                    "title": row.get("title", "")[:24],
                    "description": row.get("description", "")[:72] if row.get("description") else None
                })
                # Remove None description
                if rows[-1]["description"] is None:
                    del rows[-1]["description"]
                total_rows += 1
            
            if rows:
                formatted_sections.append({
                    "title": section.get("title", "Options")[:24],
                    "rows": rows
                })
        
        interactive = {
            "type": "list",
            "body": {"text": body[:1024]},
            "action": {
                "button": button_text[:20],
                "sections": formatted_sections
            }
        }
        
        if header:
            interactive["header"] = {"type": "text", "text": header[:60]}
        if footer:
            interactive["footer"] = {"text": footer[:60]}
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive
        }
        
        result = await self._send_request(payload)
        logger.info(f"Sent interactive list to {to}")
        return result
    
    async def mark_as_read(self, message_id: str) -> Dict[str, Any]:
        """
        Mark a message as read.
        
        Args:
            message_id: WhatsApp message ID
            
        Returns:
            API response
        """
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }
        
        return await self._send_request(payload)
    
    @staticmethod
    def verify_webhook_signature(
        payload: bytes,
        signature: str,
        app_secret: str = None
    ) -> bool:
        """
        Verify webhook signature from Meta.
        
        Args:
            payload: Raw request body bytes
            signature: X-Hub-Signature-256 header value
            app_secret: WhatsApp app secret
            
        Returns:
            True if signature is valid
        """
        app_secret = app_secret or WHATSAPP_APP_SECRET
        
        if not app_secret:
            logger.warning("WHATSAPP_APP_SECRET not set, skipping signature verification")
            return True
        
        if not signature or not signature.startswith("sha256="):
            return False
        
        expected_signature = signature[7:]  # Remove "sha256=" prefix
        
        computed_signature = hmac.new(
            app_secret.encode("utf-8"),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, computed_signature)
    
    @staticmethod
    def verify_webhook_token(token: str) -> bool:
        """
        Verify webhook verification token.
        
        Args:
            token: hub.verify_token from Meta
            
        Returns:
            True if token matches
        """
        return token == WHATSAPP_VERIFY_TOKEN


def parse_webhook_message(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parse incoming webhook payload to extract message data.
    
    Args:
        body: Webhook request body
        
    Returns:
        Parsed message dict with: sender, message_id, message_type, text, button_reply, list_reply
        None if no message found
    """
    try:
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        
        # Check for messages
        messages = value.get("messages", [])
        if not messages:
            return None
        
        msg = messages[0]
        
        result = {
            "sender": msg.get("from"),
            "message_id": msg.get("id"),
            "timestamp": msg.get("timestamp"),
            "message_type": msg.get("type"),
            "text": None,
            "button_reply": None,
            "list_reply": None,
            "audio": None,
        }
        
        # Extract content based on type
        if msg.get("type") == "text":
            result["text"] = msg.get("text", {}).get("body")
        
        elif msg.get("type") == "interactive":
            interactive = msg.get("interactive", {})
            if interactive.get("type") == "button_reply":
                result["button_reply"] = {
                    "id": interactive.get("button_reply", {}).get("id"),
                    "title": interactive.get("button_reply", {}).get("title")
                }
            elif interactive.get("type") == "list_reply":
                result["list_reply"] = {
                    "id": interactive.get("list_reply", {}).get("id"),
                    "title": interactive.get("list_reply", {}).get("title"),
                    "description": interactive.get("list_reply", {}).get("description")
                }
        
        elif msg.get("type") == "audio":
            result["audio"] = {
                "id": msg.get("audio", {}).get("id"),
                "mime_type": msg.get("audio", {}).get("mime_type")
            }
        
        # Get contact info if available
        contacts = value.get("contacts", [])
        if contacts:
            result["sender_name"] = contacts[0].get("profile", {}).get("name")
        
        return result
        
    except Exception as e:
        logger.error(f"Error parsing webhook message: {e}")
        return None


def get_status_update(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parse webhook for message status updates.
    
    Args:
        body: Webhook request body
        
    Returns:
        Status update dict or None
    """
    try:
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        
        statuses = value.get("statuses", [])
        if not statuses:
            return None
        
        status = statuses[0]
        return {
            "message_id": status.get("id"),
            "status": status.get("status"),  # sent, delivered, read, failed
            "timestamp": status.get("timestamp"),
            "recipient": status.get("recipient_id"),
            "error": status.get("errors", [{}])[0] if status.get("errors") else None
        }
        
    except Exception as e:
        logger.error(f"Error parsing status update: {e}")
        return None
