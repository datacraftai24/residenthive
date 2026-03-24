"""
WhatsApp Integration Services

This package provides WhatsApp Business API integration for ResidentHive,
enabling agents to manage their buyer and lead pipeline via WhatsApp.

Architecture:
  Layer 1: Pattern matching (buttons, codes, commands) — instant response
  Layer 2: Coordinator Agent (Gemini 3 Flash) — agentic tool loop

Modules:
- buyer_codes: Generate unique entity codes (SC1, MJ1) for buyers and leads
- session: Redis-based session state management
- client: WhatsApp Cloud API client for sending messages
- intent: Coordinator agent with Gemini tool loop + pattern matching
- handlers: Action handlers for each intent
- messages: WhatsApp message formatters
- notifications: Proactive notifications (report viewed, price drops)
- voice: Voice note transcription with OpenAI Whisper
"""

from .buyer_codes import (
    generate_buyer_code,
    generate_entity_code,
    get_buyer_by_code,
    get_lead_by_code,
    backfill_buyer_codes,
    backfill_lead_codes,
    resolve_entity_reference,
    resolve_buyer_reference,
    get_all_entities,
)
from .session import SessionManager, AgentSession, SessionState
from .client import WhatsAppClient, parse_webhook_message
from .intent import IntentParser, Intent, IntentType, ActionStep, run_agent, AgentResult
from .handlers import WhatsAppHandlers
from .messages import MessageBuilder
from .notifications import WhatsAppNotifications, on_report_viewed, on_buyer_notes_updated
from .voice import VoiceTranscriber, handle_voice_message

__all__ = [
    # Entity codes (unified namespace)
    "generate_buyer_code",
    "generate_entity_code",
    "get_buyer_by_code",
    "get_lead_by_code",
    "backfill_buyer_codes",
    "backfill_lead_codes",
    "resolve_entity_reference",
    "resolve_buyer_reference",
    "get_all_entities",
    # Session
    "SessionManager",
    "AgentSession",
    "SessionState",
    # Client
    "WhatsAppClient",
    "parse_webhook_message",
    # Intent + Agent
    "IntentParser",
    "Intent",
    "IntentType",
    "ActionStep",
    "run_agent",
    "AgentResult",
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
