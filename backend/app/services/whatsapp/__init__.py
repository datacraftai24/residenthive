"""
WhatsApp Integration Services

This package provides WhatsApp Business API integration for ResidentHive,
enabling agents to manage their buyer pipeline via WhatsApp.

Modules:
- buyer_codes: Generate unique buyer codes (SC1, MJ1) for identification
- session: Redis-based session state management
- client: WhatsApp Cloud API client for sending messages
- intent: OpenAI-powered intent parsing
- handlers: Action handlers for each intent
- messages: WhatsApp message formatters
- notifications: Proactive notifications (report viewed, price drops)
- voice: Voice note transcription with OpenAI Whisper
"""

from .buyer_codes import generate_buyer_code, get_buyer_by_code, backfill_buyer_codes
from .session import SessionManager, AgentSession, SessionState
from .client import WhatsAppClient, parse_webhook_message
from .intent import IntentParser, Intent, IntentType
from .handlers import WhatsAppHandlers
from .messages import MessageBuilder
from .notifications import WhatsAppNotifications, on_report_viewed, on_buyer_notes_updated
from .voice import VoiceTranscriber, handle_voice_message

__all__ = [
    # Buyer codes
    "generate_buyer_code",
    "get_buyer_by_code", 
    "backfill_buyer_codes",
    # Session
    "SessionManager",
    "AgentSession",
    "SessionState",
    # Client
    "WhatsAppClient",
    "parse_webhook_message",
    # Intent
    "IntentParser",
    "Intent",
    "IntentType",
    # Handlers
    "WhatsAppHandlers",
    # Messages
    "MessageBuilder",
    # Notifications
    "WhatsAppNotifications",
    "on_report_viewed",
    "on_buyer_notes_updated",
    # Voice
    "VoiceTranscriber",
    "handle_voice_message",
]
