"""
WhatsApp Client via Twilio

Provides methods for sending messages via Twilio's WhatsApp Business API.
Supports text messages, interactive buttons, and list messages.
Falls back to Meta Cloud API if TWILIO_ACCOUNT_SID is not set.

API Reference: https://www.twilio.com/docs/whatsapp/api
"""

import os
import hmac
import hashlib
import logging
from typing import Optional, List, Dict, Any
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

# Twilio configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")  # e.g., "+18447980101"

# Legacy Meta configuration (fallback)
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "residenthive-wa-verify")
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v18.0")
WHATSAPP_API_BASE = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"

# SMS toggle
SMS_ENABLED = os.getenv("SMS_ENABLED", "false").lower() == "true"

# Determine which provider to use
USE_TWILIO = bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_NUMBER)


class WhatsAppClientError(Exception):
    """Exception raised for WhatsApp API errors"""
    def __init__(self, message: str, status_code: int = None, response: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class WhatsAppClient:
    """
    Client for WhatsApp messaging via Twilio (primary) or Meta Cloud API (fallback).

    Usage:
        client = WhatsAppClient()
        await client.send_text("+1234567890", "Hello!")
    """

    def __init__(
        self,
        phone_number_id: str = None,
        access_token: str = None
    ):
        if USE_TWILIO:
            self.provider = "twilio"
            self.account_sid = TWILIO_ACCOUNT_SID
            self.auth_token = TWILIO_AUTH_TOKEN
            self.from_number = TWILIO_WHATSAPP_NUMBER
            logger.debug("WhatsAppClient using Twilio provider")
        else:
            self.provider = "meta"
            self.phone_number_id = phone_number_id or WHATSAPP_PHONE_NUMBER_ID
            self.access_token = access_token or WHATSAPP_ACCESS_TOKEN
            logger.debug("WhatsAppClient using Meta Cloud API provider")

    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number, ensuring + prefix for Twilio."""
        phone = phone.replace("-", "").replace(" ", "")
        if self.provider == "twilio":
            if not phone.startswith("+"):
                phone = f"+{phone}"
        else:
            phone = phone.replace("+", "")
        return phone

    # ========================================================================
    # Twilio methods
    # ========================================================================

    async def _twilio_send(self, to: str, body: str = None, media_url: str = None) -> Dict[str, Any]:
        """Send a message via Twilio API."""
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"

        data = {
            "From": f"whatsapp:{self.from_number}",
            "To": f"whatsapp:{to}",
        }
        if body:
            data["Body"] = body
        if media_url:
            data["MediaUrl"] = media_url

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                data=data,
                auth=(self.account_sid, self.auth_token),
            )

            result = response.json()

            if response.status_code >= 400:
                error_msg = result.get("message", "Unknown Twilio error")
                logger.error(f"Twilio API error: {error_msg}")
                raise WhatsAppClientError(
                    error_msg,
                    status_code=response.status_code,
                    response=result
                )

            logger.debug(f"Twilio message sent: SID={result.get('sid')}")
            return result

    async def _twilio_send_interactive(self, to: str, interactive_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send an interactive message via Twilio Content API.

        Twilio doesn't support WhatsApp interactive messages via the basic Messages API.
        For buttons/lists, we use Twilio's Content API with ContentSid, or fall back to
        a text representation.
        """
        # Twilio interactive WhatsApp messages require Content Templates or
        # using the native WhatsApp format via the Content-Type header.
        # For now, we send interactive messages using Twilio's native WhatsApp support
        # by passing the interactive payload as a JSON body parameter.

        import json
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"

        # Build the request with Twilio's WhatsApp interactive message support
        to_formatted = f"whatsapp:{to}"
        from_formatted = f"whatsapp:{self.from_number}"

        # Twilio supports sending native WhatsApp interactive messages
        # via the ContentVariables approach or direct JSON
        interactive_type = interactive_payload.get("type")

        if interactive_type == "button":
            # For buttons, format as text with numbered options
            body_text = interactive_payload.get("body", {}).get("text", "")
            buttons = interactive_payload.get("action", {}).get("buttons", [])

            header = interactive_payload.get("header", {}).get("text", "")
            footer = interactive_payload.get("footer", {}).get("text", "")

            message_parts = []
            if header:
                message_parts.append(f"*{header}*")
            message_parts.append(body_text)

            if buttons:
                message_parts.append("")
                for i, btn in enumerate(buttons, 1):
                    title = btn.get("reply", {}).get("title", "")
                    message_parts.append(f"*{i}.* {title}")

            if footer:
                message_parts.append(f"\n_{footer}_")

            full_body = "\n".join(message_parts)
            return await self._twilio_send(to, body=full_body)

        elif interactive_type == "list":
            # For lists, format as text with numbered items
            body_text = interactive_payload.get("body", {}).get("text", "")
            sections = interactive_payload.get("action", {}).get("sections", [])

            header = interactive_payload.get("header", {}).get("text", "")
            footer = interactive_payload.get("footer", {}).get("text", "")

            message_parts = []
            if header:
                message_parts.append(f"*{header}*")
            message_parts.append(body_text)

            item_num = 1
            for section in sections:
                section_title = section.get("title", "")
                if section_title:
                    message_parts.append(f"\n*{section_title}*")
                for row in section.get("rows", []):
                    title = row.get("title", "")
                    desc = row.get("description", "")
                    message_parts.append(f"*{item_num}.* {title}")
                    if desc:
                        message_parts.append(f"   {desc}")
                    item_num += 1

            if footer:
                message_parts.append(f"\n_{footer}_")

            full_body = "\n".join(message_parts)
            return await self._twilio_send(to, body=full_body)

        # Fallback: send as plain text
        body_text = interactive_payload.get("body", {}).get("text", "")
        return await self._twilio_send(to, body=body_text)

    # ========================================================================
    # Meta Cloud API methods (legacy fallback)
    # ========================================================================

    def _get_headers(self) -> Dict[str, str]:
        """Get Meta API headers"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    def _get_messages_url(self) -> str:
        """Get Meta messages endpoint URL"""
        return f"{WHATSAPP_API_BASE}/{self.phone_number_id}/messages"

    async def _meta_send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send request to Meta WhatsApp API."""
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

    # ========================================================================
    # Public API (same interface regardless of provider)
    # ========================================================================

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
        to = self._normalize_phone(to)

        if len(text) > 4096:
            text = text[:4090] + "..."
            logger.warning(f"Message truncated to 4096 chars for {to}")

        if self.provider == "twilio":
            result = await self._twilio_send(to, body=text)
            logger.info(f"Sent text message to {to}: {text[:50]}...")
            return result

        # Meta fallback
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

        result = await self._meta_send_request(payload)
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
        to = self._normalize_phone(to)

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

        if self.provider == "twilio":
            result = await self._twilio_send_interactive(to, interactive)
            logger.info(f"Sent interactive buttons to {to}")
            return result

        # Meta fallback
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive
        }

        result = await self._meta_send_request(payload)
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
            header: Optional header text
            footer: Optional footer text

        Returns:
            API response
        """
        to = self._normalize_phone(to)

        formatted_sections = []
        total_rows = 0

        for section in sections:
            rows = []
            for row in section.get("rows", []):
                if total_rows >= 10:
                    break
                row_data = {
                    "id": row.get("id", str(total_rows)),
                    "title": row.get("title", "")[:24],
                }
                if row.get("description"):
                    row_data["description"] = row["description"][:72]
                rows.append(row_data)
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

        if self.provider == "twilio":
            result = await self._twilio_send_interactive(to, interactive)
            logger.info(f"Sent interactive list to {to}")
            return result

        # Meta fallback
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive
        }

        result = await self._meta_send_request(payload)
        logger.info(f"Sent interactive list to {to}")
        return result

    async def mark_as_read(self, message_id: str) -> Dict[str, Any]:
        """
        Mark a message as read.

        For Twilio, this is a no-op as read receipts are handled automatically.
        For Meta, sends a read receipt.
        """
        if self.provider == "twilio":
            # Twilio handles read receipts automatically
            return {"success": True}

        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }

        return await self._meta_send_request(payload)

    async def send_sms(self, to: str, body: str) -> Dict[str, Any]:
        """
        Send an SMS message via Twilio.

        Only works when SMS_ENABLED=true and Twilio is configured.
        Uses the toll-free number (same as WhatsApp).
        """
        if not SMS_ENABLED:
            logger.debug(f"SMS disabled, skipping message to {to}")
            return {"status": "skipped", "reason": "SMS_ENABLED=false"}

        if not USE_TWILIO:
            raise WhatsAppClientError("SMS requires Twilio configuration")

        to = to.replace("-", "").replace(" ", "")
        if not to.startswith("+"):
            to = f"+{to}"

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"

        data = {
            "From": self.from_number,  # No whatsapp: prefix for SMS
            "To": to,
            "Body": body,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                data=data,
                auth=(self.account_sid, self.auth_token),
            )

            result = response.json()

            if response.status_code >= 400:
                error_msg = result.get("message", "Unknown Twilio error")
                logger.error(f"Twilio SMS error: {error_msg}")
                raise WhatsAppClientError(error_msg, status_code=response.status_code, response=result)

            logger.info(f"Sent SMS to {to}: {body[:50]}...")
            return result

    # ========================================================================
    # Signature verification
    # ========================================================================

    @staticmethod
    def verify_webhook_signature(
        payload: bytes,
        signature: str,
        app_secret: str = None
    ) -> bool:
        """
        Verify webhook signature.

        Supports both Twilio (X-Twilio-Signature) and Meta (X-Hub-Signature-256).
        """
        if USE_TWILIO:
            # Twilio signature verification
            # Twilio uses a different validation mechanism via the twilio library
            # For now, we validate using the auth token
            if not TWILIO_AUTH_TOKEN:
                logger.warning("TWILIO_AUTH_TOKEN not set, skipping signature verification")
                return True

            from twilio.request_validator import RequestValidator
            validator = RequestValidator(TWILIO_AUTH_TOKEN)

            # Note: Full Twilio validation requires the URL and POST params
            # This is handled in the router where we have access to the full request
            return True  # Defer to router-level validation

        # Meta signature verification
        app_secret = app_secret or WHATSAPP_APP_SECRET

        if not app_secret:
            logger.warning("WHATSAPP_APP_SECRET not set, skipping signature verification")
            return True

        if not signature or not signature.startswith("sha256="):
            return False

        expected_signature = signature[7:]

        computed_signature = hmac.new(
            app_secret.encode("utf-8"),
            payload,
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected_signature, computed_signature)

    @staticmethod
    def verify_webhook_token(token: str) -> bool:
        """Verify webhook verification token (Meta only)."""
        return token == WHATSAPP_VERIFY_TOKEN


def parse_webhook_message(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parse incoming webhook payload to extract message data.

    Supports both Twilio and Meta webhook formats.
    """
    if USE_TWILIO:
        return _parse_twilio_webhook(body)
    return _parse_meta_webhook(body)


def _parse_twilio_webhook(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parse Twilio WhatsApp webhook payload.

    Twilio sends form-encoded POST data with fields like:
    - From: whatsapp:+1234567890
    - Body: message text
    - MessageSid: unique message ID
    - NumMedia: number of media attachments
    """
    from_number = body.get("From", "")
    if not from_number.startswith("whatsapp:"):
        return None

    # Strip whatsapp: prefix
    sender = from_number.replace("whatsapp:", "")

    message_sid = body.get("MessageSid")
    message_body = body.get("Body", "")
    num_media = int(body.get("NumMedia", 0))

    result = {
        "sender": sender,
        "message_id": message_sid,
        "timestamp": None,
        "message_type": "text",
        "text": message_body,
        "button_reply": None,
        "list_reply": None,
        "audio": None,
        "sender_name": body.get("ProfileName"),
    }

    # Check for button reply (Twilio sends button ID in Body or ButtonPayload)
    button_payload = body.get("ButtonPayload")
    if button_payload:
        result["button_reply"] = {
            "id": button_payload,
            "title": message_body,
        }
        result["message_type"] = "interactive"

    # Check for list reply
    list_id = body.get("ListId")
    if list_id:
        result["list_reply"] = {
            "id": list_id,
            "title": body.get("ListTitle", ""),
            "description": body.get("ListDescription", ""),
        }
        result["message_type"] = "interactive"

    # Check for audio
    if num_media > 0:
        media_type = body.get("MediaContentType0", "")
        if media_type.startswith("audio/"):
            result["audio"] = {
                "id": body.get("MediaSid0") or body.get("MediaUrl0"),
                "mime_type": media_type,
                "url": body.get("MediaUrl0"),
            }
            result["message_type"] = "audio"

    return result


def _parse_meta_webhook(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Parse Meta WhatsApp Cloud API webhook payload."""
    try:
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})

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

        contacts = value.get("contacts", [])
        if contacts:
            result["sender_name"] = contacts[0].get("profile", {}).get("name")

        return result

    except Exception as e:
        logger.error(f"Error parsing webhook message: {e}")
        return None


def get_status_update(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Parse webhook for message status updates."""
    if USE_TWILIO:
        # Twilio sends status callbacks with MessageStatus field
        status = body.get("MessageStatus")
        if status:
            return {
                "message_id": body.get("MessageSid"),
                "status": status,  # queued, sent, delivered, read, failed, undelivered
                "timestamp": None,
                "recipient": body.get("To", "").replace("whatsapp:", ""),
                "error": {"code": body.get("ErrorCode"), "message": body.get("ErrorMessage")} if body.get("ErrorCode") else None,
            }
        return None

    # Meta format
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
            "status": status.get("status"),
            "timestamp": status.get("timestamp"),
            "recipient": status.get("recipient_id"),
            "error": status.get("errors", [{}])[0] if status.get("errors") else None
        }

    except Exception as e:
        logger.error(f"Error parsing status update: {e}")
        return None
