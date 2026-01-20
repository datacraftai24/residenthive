"""
OpenAI-Powered Intent Parser for WhatsApp Messages

Uses GPT-4o-mini to parse natural language messages and extract:
- Intent (what the user wants to do)
- Buyer reference (if any)
- Action parameters

Supports both explicit commands and natural language.
"""

import os
import json
import re
import logging
from typing import Optional, List, Dict, Any
from enum import Enum
from dataclasses import dataclass, field
from openai import OpenAI

logger = logging.getLogger(__name__)

# OpenAI configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
INTENT_MODEL = os.getenv("WHATSAPP_INTENT_MODEL", "gpt-4o-mini")


class IntentType(str, Enum):
    """Possible user intents"""
    # Navigation
    VIEW_BUYERS = "view_buyers"
    SELECT_BUYER = "select_buyer"
    EXIT_CONTEXT = "exit_context"
    HELP = "help"
    
    # Read operations
    VIEW_PROFILE = "view_profile"
    VIEW_SAVED = "view_saved"
    VIEW_NOTES = "view_notes"
    
    # Search & Reports
    SEARCH = "search"
    VIEW_RESULTS = "view_results"
    GENERATE_REPORT = "generate_report"
    SEND_REPORT = "send_report"
    
    # Write operations
    CREATE_BUYER = "create_buyer"
    EDIT_BUYER = "edit_buyer"
    
    # Confirmations
    CONFIRM = "confirm"
    CANCEL = "cancel"
    
    # Unknown
    UNKNOWN = "unknown"
    GREETING = "greeting"


@dataclass
class Intent:
    """Parsed intent from user message"""
    type: IntentType
    buyer_reference: Optional[str] = None  # Code like "SC1" or name like "Sarah"
    buyer_id: Optional[int] = None  # Resolved buyer ID
    params: Dict[str, Any] = field(default_factory=dict)
    raw_text: str = ""
    confidence: float = 1.0


class IntentParser:
    """
    Parse WhatsApp messages into structured intents.
    
    Uses a combination of:
    1. Pattern matching for explicit commands and codes
    2. OpenAI for natural language understanding
    """
    
    def __init__(self):
        if not OPENAI_API_KEY:
            logger.warning("OPENAI_API_KEY not set, using pattern matching only")
            self.client = None
        else:
            self.client = OpenAI(api_key=OPENAI_API_KEY)
    
    def parse(
        self,
        message: str,
        input_type: str,
        session_state: str,
        active_buyer: Optional[Dict[str, Any]] = None,
        buyers: Optional[List[Dict[str, Any]]] = None
    ) -> Intent:
        """
        Parse a message into an intent.
        
        Args:
            message: User's message text
            input_type: "text", "button", or "list"
            session_state: Current session state
            active_buyer: Currently selected buyer (if any)
            buyers: List of all agent's buyers (for name matching)
            
        Returns:
            Parsed Intent
        """
        message = message.strip()
        
        # Handle button/list replies first (these have explicit IDs)
        if input_type in ("button", "list"):
            return self._parse_interactive_reply(message)
        
        # Check for explicit commands/patterns
        pattern_intent = self._parse_patterns(message, session_state, active_buyer)
        if pattern_intent.type != IntentType.UNKNOWN:
            return pattern_intent
        
        # Check for buyer code
        code_match = re.match(r'^([A-Za-z]{2}\d+)\s*(.*)?$', message)
        if code_match:
            code = code_match.group(1).upper()
            rest = code_match.group(2) or ""
            
            # If there's additional text, it might be a shortcut command
            if rest.strip():
                shortcut_intent = self._parse_shortcut(code, rest.strip())
                if shortcut_intent:
                    return shortcut_intent
            
            # Just the code - select buyer
            return Intent(
                type=IntentType.SELECT_BUYER,
                buyer_reference=code,
                raw_text=message
            )
        
        # Use OpenAI for natural language understanding
        if self.client:
            return self._parse_with_llm(message, session_state, active_buyer, buyers)
        
        # Fallback - treat as unknown
        return Intent(type=IntentType.UNKNOWN, raw_text=message)
    
    def _parse_interactive_reply(self, reply_id: str) -> Intent:
        """Parse button or list reply by ID."""
        reply_id = reply_id.lower()
        
        # Common button IDs
        button_mapping = {
            "view_buyers": IntentType.VIEW_BUYERS,
            "all_buyers": IntentType.VIEW_BUYERS,
            "view_all": IntentType.VIEW_BUYERS,
            "search": IntentType.SEARCH,
            "search_now": IntentType.SEARCH,
            "run_search": IntentType.SEARCH,
            "report": IntentType.GENERATE_REPORT,
            "generate_report": IntentType.GENERATE_REPORT,
            "send": IntentType.SEND_REPORT,
            "send_report": IntentType.SEND_REPORT,
            "send_to_buyer": IntentType.SEND_REPORT,
            "edit": IntentType.EDIT_BUYER,
            "edit_profile": IntentType.EDIT_BUYER,
            "profile": IntentType.VIEW_PROFILE,
            "view_profile": IntentType.VIEW_PROFILE,
            "saved": IntentType.VIEW_SAVED,
            "view_saved": IntentType.VIEW_SAVED,
            "notes": IntentType.VIEW_NOTES,
            "view_notes": IntentType.VIEW_NOTES,
            "done": IntentType.EXIT_CONTEXT,
            "back": IntentType.EXIT_CONTEXT,
            "exit": IntentType.EXIT_CONTEXT,
            "next": IntentType.EXIT_CONTEXT,
            "new": IntentType.CREATE_BUYER,
            "new_buyer": IntentType.CREATE_BUYER,
            "create_buyer": IntentType.CREATE_BUYER,
            "confirm": IntentType.CONFIRM,
            "yes": IntentType.CONFIRM,
            "cancel": IntentType.CANCEL,
            "no": IntentType.CANCEL,
            "help": IntentType.HELP,
        }
        
        if reply_id in button_mapping:
            return Intent(type=button_mapping[reply_id], raw_text=reply_id)
        
        # Check if it's a buyer selection (format: select_buyer_SC1)
        if reply_id.startswith("select_buyer_"):
            code = reply_id.replace("select_buyer_", "").upper()
            return Intent(
                type=IntentType.SELECT_BUYER,
                buyer_reference=code,
                raw_text=reply_id
            )
        
        # Check if it's a buyer code directly
        if re.match(r'^[a-z]{2}\d+$', reply_id):
            return Intent(
                type=IntentType.SELECT_BUYER,
                buyer_reference=reply_id.upper(),
                raw_text=reply_id
            )
        
        return Intent(type=IntentType.UNKNOWN, raw_text=reply_id)
    
    def _parse_patterns(
        self,
        message: str,
        session_state: str,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Intent:
        """Parse explicit commands and common patterns."""
        msg_lower = message.lower().strip()
        
        # Help
        if msg_lower in ("help", "?", "commands"):
            return Intent(type=IntentType.HELP, raw_text=message)
        
        # Greetings
        if msg_lower in ("hi", "hello", "hey", "good morning", "good afternoon"):
            return Intent(type=IntentType.GREETING, raw_text=message)
        
        # View buyers
        if msg_lower in ("all", "list", "buyers", "my buyers", "show buyers", "view buyers", "show my buyers"):
            return Intent(type=IntentType.VIEW_BUYERS, raw_text=message)
        
        # Exit context
        if msg_lower in ("done", "back", "exit", "next", "finish", "thanks", "thank you"):
            return Intent(type=IntentType.EXIT_CONTEXT, raw_text=message)
        
        # Create buyer
        if msg_lower in ("new", "new buyer", "add buyer", "create", "add"):
            return Intent(type=IntentType.CREATE_BUYER, raw_text=message)
        
        # Confirmations
        if msg_lower in ("yes", "confirm", "ok", "okay", "yep", "sure", "do it"):
            return Intent(type=IntentType.CONFIRM, raw_text=message)
        if msg_lower in ("no", "cancel", "nevermind", "stop", "abort"):
            return Intent(type=IntentType.CANCEL, raw_text=message)
        
        # In buyer context - check for context-specific commands
        if active_buyer:
            if msg_lower in ("search", "find", "find properties", "search properties", "run search"):
                return Intent(type=IntentType.SEARCH, raw_text=message)
            if msg_lower in ("report", "generate report", "create report", "make report"):
                return Intent(type=IntentType.GENERATE_REPORT, raw_text=message)
            if msg_lower in ("send", "send report", "send email", "email", "email report"):
                return Intent(type=IntentType.SEND_REPORT, raw_text=message)
            if msg_lower in ("profile", "details", "view profile", "show profile"):
                return Intent(type=IntentType.VIEW_PROFILE, raw_text=message)
            if msg_lower in ("saved", "saved properties", "view saved"):
                return Intent(type=IntentType.VIEW_SAVED, raw_text=message)
            if msg_lower in ("notes", "view notes", "feedback"):
                return Intent(type=IntentType.VIEW_NOTES, raw_text=message)
            if msg_lower in ("edit", "update", "change", "modify"):
                return Intent(type=IntentType.EDIT_BUYER, raw_text=message)
        
        return Intent(type=IntentType.UNKNOWN, raw_text=message)
    
    def _parse_shortcut(self, buyer_code: str, command: str) -> Optional[Intent]:
        """Parse shortcut commands like 'SC1 s' or 'MJ1 report send'."""
        cmd = command.lower().strip()
        
        # Single letter shortcuts
        shortcuts = {
            "s": IntentType.SEARCH,
            "search": IntentType.SEARCH,
            "r": IntentType.GENERATE_REPORT,
            "report": IntentType.GENERATE_REPORT,
            "e": IntentType.EDIT_BUYER,
            "edit": IntentType.EDIT_BUYER,
            "p": IntentType.VIEW_PROFILE,
            "profile": IntentType.VIEW_PROFILE,
        }
        
        if cmd in shortcuts:
            return Intent(
                type=shortcuts[cmd],
                buyer_reference=buyer_code,
                raw_text=f"{buyer_code} {command}"
            )
        
        # Compound shortcuts like "r send" (report + send)
        if cmd in ("r send", "report send", "rs"):
            return Intent(
                type=IntentType.SEND_REPORT,
                buyer_reference=buyer_code,
                params={"generate_first": True},
                raw_text=f"{buyer_code} {command}"
            )
        
        return None
    
    def _parse_with_llm(
        self,
        message: str,
        session_state: str,
        active_buyer: Optional[Dict[str, Any]],
        buyers: Optional[List[Dict[str, Any]]]
    ) -> Intent:
        """Use OpenAI to parse natural language."""
        
        # Build context for the LLM
        context_parts = [f"Session state: {session_state}"]
        
        if active_buyer:
            context_parts.append(
                f"Currently focused on: {active_buyer.get('name')} ({active_buyer.get('whatsapp_code')})"
            )
        
        if buyers:
            buyer_list = ", ".join([
                f"{b.get('name')} ({b.get('whatsapp_code')})"
                for b in buyers[:10]  # Limit to 10
            ])
            context_parts.append(f"Available buyers: {buyer_list}")
        
        context = "\n".join(context_parts)
        
        prompt = f"""You are parsing a WhatsApp message from a real estate agent managing buyer profiles.

Context:
{context}

User message: "{message}"

Determine the intent. Return a JSON object with:
- "intent": one of [view_buyers, select_buyer, view_profile, search, generate_report, send_report, create_buyer, edit_buyer, exit_context, help, confirm, cancel, greeting, unknown]
- "buyer_reference": if the message mentions a buyer, extract their name or code (e.g., "SC1" or "Sarah")
- "edit_text": if intent is edit_buyer, include the natural language change request
- "confidence": 0.0-1.0 confidence score

Examples:
- "search for Sarah" -> {{"intent": "search", "buyer_reference": "Sarah", "confidence": 0.9}}
- "she wants a bigger budget" -> {{"intent": "edit_buyer", "buyer_reference": null, "edit_text": "increase budget", "confidence": 0.8}}
- "how's Mike doing" -> {{"intent": "view_profile", "buyer_reference": "Mike", "confidence": 0.7}}
- "show all" -> {{"intent": "view_buyers", "buyer_reference": null, "confidence": 0.95}}

Return only the JSON object, no other text."""

        try:
            response = self.client.chat.completions.create(
                model=INTENT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=200
            )
            
            content = response.choices[0].message.content.strip()
            
            # Parse JSON response
            # Handle potential markdown code blocks
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()
            
            result = json.loads(content)
            
            intent_str = result.get("intent", "unknown")
            try:
                intent_type = IntentType(intent_str)
            except ValueError:
                intent_type = IntentType.UNKNOWN
            
            return Intent(
                type=intent_type,
                buyer_reference=result.get("buyer_reference"),
                params={"edit_text": result.get("edit_text")} if result.get("edit_text") else {},
                raw_text=message,
                confidence=result.get("confidence", 0.5)
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            return Intent(type=IntentType.UNKNOWN, raw_text=message, confidence=0.0)
        except Exception as e:
            logger.error(f"LLM intent parsing failed: {e}")
            return Intent(type=IntentType.UNKNOWN, raw_text=message, confidence=0.0)


def resolve_buyer_from_intent(
    intent: Intent,
    agent_id: int,
    active_buyer: Optional[Dict[str, Any]] = None
) -> Intent:
    """
    Resolve buyer reference in intent to actual buyer ID.
    
    Args:
        intent: Parsed intent with potential buyer_reference
        agent_id: Agent's ID
        active_buyer: Currently selected buyer
        
    Returns:
        Intent with buyer_id populated if found
    """
    from .buyer_codes import resolve_buyer_reference, get_buyer_by_code
    
    # If no buyer reference but we have an active buyer, use that
    if not intent.buyer_reference and active_buyer:
        intent.buyer_id = active_buyer.get("id")
        return intent
    
    # If we have a reference, resolve it
    if intent.buyer_reference:
        matches = resolve_buyer_reference(agent_id, intent.buyer_reference)
        
        if len(matches) == 1:
            intent.buyer_id = matches[0].get("id")
            intent.buyer_reference = matches[0].get("whatsapp_code")
        elif len(matches) > 1:
            # Multiple matches - store them in params for disambiguation
            intent.params["ambiguous_matches"] = matches
        # If no matches, buyer_id stays None
    
    return intent
