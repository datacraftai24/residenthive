"""
Gemini-Powered Coordinator Agent for WhatsApp Messages

Architecture:
  Layer 1: Pattern matching (buttons, codes, "help") -> instant response (no LLM)
  Layer 2: Coordinator Agent (Gemini 3 Flash) with vertical tool loop

The coordinator agent:
- Receives conversation history + session state + available entities
- Calls vertical tools (resolve_entity, search, report, outreach, etc.)
- Runs up to 5 iterations of the tool loop
- Returns a natural language response with optional action buttons

Safety guardrails:
- READ freely (resolve, get_details, search)
- PROPOSE edits (returns preview -> agent confirms via button)
- CANNOT send emails or modify data without explicit agent approval
- All mutations go through pending_action -> confirm/cancel flow
"""

import os
import json
import re
import asyncio
import logging
from decimal import Decimal
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from enum import Enum
from dataclasses import dataclass, field

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Gemini configuration — upgraded to Gemini 3 Flash for agentic workflows
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info(f"Initialized Gemini client for WhatsApp coordinator agent: model={GEMINI_MODEL}")
else:
    logger.warning("GEMINI_API_KEY not set — coordinator agent will use pattern matching only")


# ============================================================================
# INTENT TYPES (kept for Layer 1 pattern matching + backward compat)
# ============================================================================

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

    # Report approval
    APPROVE_REPORT = "approve_report"
    REJECT_REPORT = "reject_report"

    # Lead outreach
    SEND_OUTREACH = "send_outreach"
    APPROVE_OUTREACH = "approve_outreach"
    REJECT_OUTREACH = "reject_outreach"
    PROCESS_LEAD = "process_lead"

    # Confirmations
    CONFIRM = "confirm"
    CANCEL = "cancel"

    # Session
    RESET = "reset"

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


@dataclass
class ActionStep:
    """A single step in a multi-action sequence"""
    intent: Intent
    step_number: int
    depends_on_previous: bool = True


# ============================================================================
# AGENT TOOL RESULT
# ============================================================================

@dataclass
class ToolResult:
    """Result from a tool execution that Gemini can reason about."""
    success: bool
    data: Dict[str, Any]
    message: str
    error: Optional[str] = None
    needs_confirmation: bool = False
    pending_action: Optional[Dict[str, Any]] = None
    actions: Optional[List[Dict[str, str]]] = None

    @staticmethod
    def _sanitize(obj):
        """Recursively convert Decimal/datetime to JSON-safe types."""
        if isinstance(obj, dict):
            return {k: ToolResult._sanitize(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [ToolResult._sanitize(v) for v in obj]
        if isinstance(obj, Decimal):
            return int(obj) if obj == int(obj) else float(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return obj

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "success": self.success,
            "data": self._sanitize(self.data),
            "message": self.message,
        }
        if self.error:
            d["error"] = self.error
        return d


@dataclass
class AgentResult:
    """Final result from the coordinator agent."""
    text: str
    actions: Optional[List[Dict[str, str]]] = None
    pending_action: Optional[Dict[str, Any]] = None


# ============================================================================
# AGENT TOOL DECLARATIONS (for Gemini function calling)
# ============================================================================

AGENT_TOOLS = types.Tool(function_declarations=[
    # READ tools (no confirmation needed)
    types.FunctionDeclaration(
        name="resolve_entity",
        description=(
            "Find a lead or buyer by name, code, or description. "
            "Use when the agent mentions someone by name or code."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "reference": types.Schema(
                    type=types.Type.STRING,
                    description="Name, code (e.g. SC1), or description of the person to find.",
                ),
            },
            required=["reference"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_entity_details",
        description="Get full profile details for a lead or buyer.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "entity_id": types.Schema(type=types.Type.INTEGER, description="The entity's database ID."),
                "entity_type": types.Schema(type=types.Type.STRING, description="'buyer' or 'lead'."),
            },
            required=["entity_id", "entity_type"],
        ),
    ),
    types.FunctionDeclaration(
        name="list_all_entities",
        description="List all leads and buyers for this agent with their codes.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={},
        ),
    ),

    # ACTION tools (may need confirmation)
    types.FunctionDeclaration(
        name="process_new_lead",
        description=(
            "Extract and save a new lead from pasted text (Zillow, email, open house notes). "
            "Call this when the agent sends raw text containing a person's name AND (email OR phone) AND property preferences."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "raw_text": types.Schema(type=types.Type.STRING, description="The full raw text containing lead information."),
                "source": types.Schema(
                    type=types.Type.STRING,
                    description="Detected source of the lead.",
                    enum=["zillow", "redfin", "google", "referral", "open_house", "email", "unknown"],
                ),
            },
            required=["raw_text"],
        ),
    ),
    types.FunctionDeclaration(
        name="update_entity",
        description=(
            "Propose changes to a lead or buyer profile. "
            "Returns a preview for agent confirmation. Do NOT call this without first resolving the entity."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "entity_id": types.Schema(type=types.Type.INTEGER, description="The entity's database ID."),
                "entity_type": types.Schema(type=types.Type.STRING, description="'buyer' or 'lead'."),
                "changes_description": types.Schema(
                    type=types.Type.STRING,
                    description="Natural language description of the changes (e.g. 'increase budget to $800K').",
                ),
            },
            required=["entity_id", "entity_type", "changes_description"],
        ),
    ),
    types.FunctionDeclaration(
        name="search_properties",
        description="Search for properties matching a buyer or lead's criteria.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "entity_id": types.Schema(type=types.Type.INTEGER, description="The entity's database ID."),
                "entity_type": types.Schema(type=types.Type.STRING, description="'buyer' or 'lead'."),
            },
            required=["entity_id", "entity_type"],
        ),
    ),
    types.FunctionDeclaration(
        name="generate_report",
        description="Generate a buyer report from latest search results.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "entity_id": types.Schema(type=types.Type.INTEGER, description="The entity's database ID."),
                "entity_type": types.Schema(type=types.Type.STRING, description="'buyer' or 'lead'."),
            },
            required=["entity_id", "entity_type"],
        ),
    ),
    types.FunctionDeclaration(
        name="send_outreach",
        description=(
            "Generate and prepare an outreach report for a lead. "
            "Requires agent approval before email is sent."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "lead_id": types.Schema(type=types.Type.INTEGER, description="The lead's database ID."),
            },
            required=["lead_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="select_entity",
        description=(
            "Lock in which entity (buyer or lead) the conversation is about. "
            "Call this after disambiguation (e.g., agent picked option 2 from a list) "
            "or whenever you know which specific entity to work with. "
            "This sets the active entity for subsequent tools like update_entity or search_properties."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "entity_id": types.Schema(type=types.Type.INTEGER, description="The entity's database ID."),
                "entity_type": types.Schema(type=types.Type.STRING, description="'buyer' or 'lead'."),
                "name": types.Schema(type=types.Type.STRING, description="The entity's name for display."),
                "code": types.Schema(type=types.Type.STRING, description="The entity's code (e.g. MA1)."),
            },
            required=["entity_id", "entity_type"],
        ),
    ),
    types.FunctionDeclaration(
        name="respond_to_agent",
        description=(
            "Send a conversational response when no tool action is needed. "
            "Use for greetings, clarifications, or when you have enough info to answer."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "message": types.Schema(type=types.Type.STRING, description="The response message to send."),
            },
            required=["message"],
        ),
    ),
])


# ============================================================================
# SYSTEM PROMPT (for coordinator agent)
# ============================================================================

COORDINATOR_SYSTEM_PROMPT = """You are a WhatsApp assistant for a real estate agent. Short replies only — 1-3 lines max.

CONTEXT:
History: {history}
State: {state} | Active: {active_entity} | Pending: {pending_action}
Entities: {entities}

CONVERSATION CONTINUITY:
- Read the History carefully. It shows the last few messages between you and the agent.
- If the agent is replying to YOUR question (e.g., you asked "which Mark?" and they said "2"), use the history to understand what they mean.
- If Active entity is set (not "None"), you already resolved someone — use that entity_id and entity_type directly with update_entity, search_properties, etc. Do NOT call resolve_entity again.
- If you asked "what's the new budget?" and the agent replies with a number, call update_entity immediately with the active entity.

TOOL TRIGGERS (when to call each tool):
- resolve_entity → agent mentions a person by name/code AND no active entity is set
- select_entity → ALWAYS call this after disambiguation. When agent picks from a list (e.g., "2" or "the lead one"), call select_entity with that entity's id/type/name/code. This locks in the active entity for the rest of the conversation. Then ask your follow-up question.
- process_new_lead → message contains a name AND (email OR phone) AND property preferences
- update_entity → agent asks to change/update/add something, OR provides a value you asked for (budget, email, location). Use the active entity.
- search_properties → agent says search/find/look. MUST have an active entity.
- generate_report → agent says report/generate. Requires a prior search.
- send_outreach → agent says outreach/send to a lead. Uses lead_id.
- list_all_entities → agent says "all", "list", "everyone", "show me my pipeline"
- get_entity_details → need full profile info for the active entity
- respond_to_agent → greetings, "thanks", clarifications, or when you already have enough info to answer

FAILURE STATES (handle these, don't retry silently):
- resolve_entity returns 0 matches → tell agent: "No one named X found. Want to see the full list?"
- resolve_entity returns 2+ matches → list ALL matches with codes. Ask which one. Do NOT guess.
- search returns 0 properties → tell agent: "No matches. Suggest widening budget or location."
- entity missing email → tell agent: "[Name] has no email. Add one first."
- entity missing budget/location → tell agent what's missing, suggest adding it
- tool error → explain plainly: "Search is down right now" or "I couldn't generate that report"

STRICT CONSTRAINTS:
- NEVER invent contact info (email, phone, address)
- NEVER call search_properties or generate_report without resolving an entity first
- NEVER call resolve_entity if Active entity is already set and matches the person being discussed
- NEVER loop calling the same tool with the same args — if you already got a result, use it
- Max 2 tool calls per turn for simple requests. Only chain 3+ for explicit multi-step asks.

TONE: You are texting on WhatsApp. Be conversational, brief, no bullet lists unless showing matches. Use plain language, not corporate speak."""


# ============================================================================
# INTENT PARSER CLASS (Layer 1 — pattern matching, unchanged)
# ============================================================================

class IntentParser:
    """
    Parse WhatsApp messages into structured intents.

    Layer 1: Pattern matching for explicit commands and codes (no LLM)
    Layer 2: Now handled by run_agent() coordinator
    """

    def __init__(self):
        self.gemini_client = gemini_client

    def parse(
        self,
        message: str,
        input_type: str,
        session_state: str,
        active_buyer: Optional[Dict[str, Any]] = None,
        buyers: Optional[List[Dict[str, Any]]] = None,
    ) -> Intent:
        """Parse a message into a single intent."""
        result = self.parse_multi(message, input_type, session_state, active_buyer, buyers)
        return result[0]

    def parse_multi(
        self,
        message: str,
        input_type: str,
        session_state: str,
        active_buyer: Optional[Dict[str, Any]] = None,
        buyers: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Intent]:
        """
        Parse a message into one or more intents.

        Layer 1 (pattern matching) handles buttons, codes, obvious commands.
        Returns UNKNOWN if no pattern matches — caller should use run_agent().
        """
        message = message.strip()

        # ── Layer 1: Interactive replies (buttons/lists) ──
        if input_type in ("button", "list"):
            return [self._parse_interactive_reply(message)]

        # ── Layer 1: Pattern matching ──
        pattern_intent = self._parse_patterns(message, session_state, active_buyer)
        if pattern_intent.type != IntentType.UNKNOWN:
            return [pattern_intent]

        # ── Layer 1: Buyer/entity code shortcuts ──
        code_match = re.match(r'^([A-Za-z]{2}\d+)\s*(.*)?$', message)
        if code_match:
            code = code_match.group(1).upper()
            rest = code_match.group(2) or ""
            if rest.strip():
                shortcut_intent = self._parse_shortcut(code, rest.strip())
                if shortcut_intent:
                    return [shortcut_intent]
            return [Intent(
                type=IntentType.SELECT_BUYER,
                buyer_reference=code,
                raw_text=message,
            )]

        # ── No pattern match — return UNKNOWN for coordinator agent ──
        return [Intent(type=IntentType.UNKNOWN, raw_text=message)]

    # =========================================================================
    # Layer 1: Pattern Matching (no LLM)
    # =========================================================================

    def _parse_interactive_reply(self, reply_id: str) -> Intent:
        """Parse button or list reply by ID."""
        reply_id = reply_id.lower()

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
            "btn_approve_report": IntentType.APPROVE_REPORT,
            "approve_report": IntentType.APPROVE_REPORT,
            "btn_reject_report": IntentType.REJECT_REPORT,
            "reject_report": IntentType.REJECT_REPORT,
            "btn_send_outreach": IntentType.SEND_OUTREACH,
            "btn_approve_outreach": IntentType.APPROVE_OUTREACH,
            "btn_reject_outreach": IntentType.REJECT_OUTREACH,
            "confirm": IntentType.CONFIRM,
            "yes": IntentType.CONFIRM,
            "cancel": IntentType.CANCEL,
            "no": IntentType.CANCEL,
            "help": IntentType.HELP,
        }

        if reply_id in button_mapping:
            return Intent(type=button_mapping[reply_id], raw_text=reply_id)

        # Buyer selection (format: select_buyer_SC1 or select_buyer_123)
        if reply_id.startswith("select_buyer_"):
            ref = reply_id.replace("select_buyer_", "")
            if ref.isdigit():
                return Intent(
                    type=IntentType.SELECT_BUYER,
                    buyer_id=int(ref),
                    raw_text=reply_id,
                )
            return Intent(
                type=IntentType.SELECT_BUYER,
                buyer_reference=ref.upper(),
                raw_text=reply_id,
            )

        # Direct buyer code
        if re.match(r'^[a-z]{2}\d+$', reply_id):
            return Intent(
                type=IntentType.SELECT_BUYER,
                buyer_reference=reply_id.upper(),
                raw_text=reply_id,
            )

        return Intent(type=IntentType.UNKNOWN, raw_text=reply_id)

    def _parse_patterns(
        self,
        message: str,
        session_state: str,
        active_buyer: Optional[Dict[str, Any]],
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

        # Reset session
        if msg_lower in ("reset", "start over", "clear", "restart"):
            return Intent(type=IntentType.RESET, raw_text=message)

        # Exit context
        if msg_lower in ("done", "back", "exit", "next", "finish", "thanks", "thank you"):
            return Intent(type=IntentType.EXIT_CONTEXT, raw_text=message)

        # Create buyer (short command only — no details)
        if msg_lower in ("new", "new buyer", "add buyer", "create", "add"):
            return Intent(type=IntentType.CREATE_BUYER, raw_text=message)

        # Confirmations
        if msg_lower in ("yes", "confirm", "ok", "okay", "yep", "sure", "do it"):
            return Intent(type=IntentType.CONFIRM, raw_text=message)
        if msg_lower in ("no", "cancel", "nevermind", "stop", "abort"):
            return Intent(type=IntentType.CANCEL, raw_text=message)

        # In buyer context — context-specific commands
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
                raw_text=f"{buyer_code} {command}",
            )

        # Compound shortcuts
        if cmd in ("r send", "report send", "rs"):
            return Intent(
                type=IntentType.SEND_REPORT,
                buyer_reference=buyer_code,
                params={"generate_first": True},
                raw_text=f"{buyer_code} {command}",
            )

        return None


# ============================================================================
# COORDINATOR AGENT (Layer 2)
# ============================================================================

async def run_agent(message: str, session) -> AgentResult:
    """
    Run the coordinator agent with a tool loop (max 5 iterations).

    This is the core agentic function that replaces the old Gemini classifier.
    Gemini sees conversation history, session state, and available entities,
    then calls tools to resolve entities, search, edit, etc.

    Args:
        message: The agent's WhatsApp message text
        session: AgentSession object

    Returns:
        AgentResult with text response and optional actions/pending_action
    """
    if not gemini_client:
        return AgentResult(
            text="I couldn't process that. Try using specific commands like 'search', 'all', or type 'help'."
        )

    from .buyer_codes import get_all_entities, resolve_entity_reference
    from .session import SessionManager

    # ── Auto-resolve disambiguation (deterministic, no LLM) ──
    # If the previous turn listed numbered matches and the user replied with a number,
    # resolve it immediately and set session context before Gemini sees the message.
    if session.pending_disambiguation:
        matches = session.pending_disambiguation
        choice = message.strip().rstrip(".")

        selected = None
        # Check for numeric choice: "1", "2", etc.
        if choice.isdigit():
            idx = int(choice) - 1  # 1-indexed
            if 0 <= idx < len(matches):
                selected = matches[idx]
        # Check for code match: "MA1"
        if not selected:
            for m in matches:
                if m.get("code", "").upper() == choice.upper():
                    selected = m
                    break

        if selected:
            entity_id = selected["entity_id"]
            entity_type = selected.get("entity_type", "buyer")
            name = selected.get("name", "Unknown")
            code = selected.get("code", "")

            if entity_type == "buyer":
                session.set_buyer_context(entity_id, code, name)
            else:
                session.set_lead_context(entity_id, code, name)
            session.pending_disambiguation = None
            await SessionManager.save(session)
            logger.info(f"[AGENT] Auto-resolved disambiguation: {name} ({code}) — {entity_type}")

            # Rewrite the message so Gemini sees the resolved entity + original intent.
            # History already contains the current "1"/"2" message (added by handler),
            # so find the previous user message — that's the original request.
            original_request = ""
            user_msgs_seen = 0
            for msg in reversed(session.message_history):
                if msg.get("role") == "user":
                    user_msgs_seen += 1
                    if user_msgs_seen == 2:  # skip current, get the one before
                        original_request = msg["content"]
                        break
            if original_request:
                message = f"Selected {name} ({code}), a {entity_type}. Original request was: \"{original_request}\""
            else:
                message = f"Selected {name} ({code}), a {entity_type}."

        # If not a clear choice, let Gemini handle it (maybe "the lead one")
        # But clear disambiguation after one turn regardless
        else:
            session.pending_disambiguation = None
            await SessionManager.save(session)

    # Build context
    history_text = _format_history(session.message_history)
    entities = get_all_entities(session.agent_id)
    entities_text = _format_entities(entities)

    # Active entity display
    active_entity = "None"
    if session.active_buyer_name:
        active_entity = f"{session.active_buyer_name} ({session.active_buyer_code}) — buyer"
    elif session.active_lead_name:
        active_entity = f"{session.active_lead_name} ({session.active_lead_code}) — lead"

    pending_text = "None"
    if session.pending_action:
        pending_text = f"{session.pending_action.get('type')}"

    # Build system prompt with context
    system_prompt = COORDINATOR_SYSTEM_PROMPT.format(
        history=history_text or "(no prior messages)",
        state=session.state.value,
        active_entity=active_entity,
        pending_action=pending_text,
        entities=entities_text or "(no entities yet)",
    )

    # Build conversation for Gemini
    gemini_contents = [
        types.Content(
            role="user",
            parts=[types.Part(text=f"{system_prompt}\n\nAgent message: \"{message}\"")],
        )
    ]

    logger.info(f"[AGENT] ── Request ──")
    logger.info(f"[AGENT] Model: {GEMINI_MODEL}")
    logger.info(f"[AGENT] Message: {message[:200]}")
    logger.info(f"[AGENT] State: {session.state.value}, Active: {active_entity}")

    try:
        for iteration in range(5):
            logger.info(f"[AGENT] ── Iteration {iteration + 1} ──")

            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=gemini_contents,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    tools=[AGENT_TOOLS],
                ),
            )

            if not response or not response.candidates:
                logger.warning("[AGENT] Empty response (no candidates)")
                return AgentResult(text="I had trouble understanding that. Could you rephrase?")

            candidate = response.candidates[0]
            if not candidate.content or not candidate.content.parts:
                logger.warning("[AGENT] No content parts")
                return AgentResult(text="I had trouble understanding that. Could you rephrase?")

            # Check for function call
            function_call = None
            text_response = None
            for part in candidate.content.parts:
                if hasattr(part, "function_call") and part.function_call:
                    function_call = part.function_call
                    break
                if hasattr(part, "text") and part.text:
                    text_response = part.text.strip()

            # If Gemini responded with text (no tool call), return it
            if not function_call:
                if text_response:
                    logger.info(f"[AGENT] Text response: {text_response[:200]}")
                    return AgentResult(text=text_response)
                return AgentResult(text="I had trouble processing that. Try being more specific.")

            tool_name = function_call.name
            tool_args = dict(function_call.args) if function_call.args else {}
            logger.info(f"[AGENT] Tool call: {tool_name}({json.dumps(tool_args, default=str)[:200]})")

            # Handle respond_to_agent specially — it's the agent's final answer
            if tool_name == "respond_to_agent":
                msg = tool_args.get("message", "")
                logger.info(f"[AGENT] Final response via respond_to_agent: {msg[:200]}")
                return AgentResult(text=msg)

            # Execute tool
            tool_result = await _execute_tool(tool_name, tool_args, session)
            logger.info(f"[AGENT] Tool result: success={tool_result.success}, msg={tool_result.message[:100]}")

            # If tool requires user confirmation, break loop
            if tool_result.needs_confirmation:
                return AgentResult(
                    text=tool_result.message,
                    actions=tool_result.actions,
                    pending_action=tool_result.pending_action,
                )

            # Feed result back to Gemini for next iteration
            # IMPORTANT: Use the original candidate.content to preserve thought_signature
            # (required by Gemini 3 Flash for multi-turn tool loops)
            gemini_contents.append(candidate.content)
            gemini_contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part(function_response=types.FunctionResponse(
                        name=tool_name,
                        response=tool_result.to_dict(),
                    ))],
                )
            )

        # Exhausted iterations
        logger.warning("[AGENT] Exhausted 5 iterations")
        return AgentResult(text="I had trouble processing that. Try being more specific.")

    except Exception as e:
        logger.error(f"[AGENT] Error: {e}", exc_info=True)
        return AgentResult(
            text="Something went wrong. Please try again or type 'help' for commands."
        )


# ============================================================================
# TOOL EXECUTORS
# ============================================================================

async def _execute_tool(name: str, args: Dict[str, Any], session) -> ToolResult:
    """Dispatch tool call to the appropriate executor."""
    try:
        if name == "resolve_entity":
            return await _tool_resolve_entity(args, session)
        elif name == "get_entity_details":
            return await _tool_get_entity_details(args, session)
        elif name == "list_all_entities":
            return await _tool_list_all_entities(args, session)
        elif name == "process_new_lead":
            return await _tool_process_lead(args, session)
        elif name == "update_entity":
            return await _tool_update_entity(args, session)
        elif name == "search_properties":
            return await _tool_search(args, session)
        elif name == "generate_report":
            return await _tool_generate_report(args, session)
        elif name == "send_outreach":
            return await _tool_send_outreach(args, session)
        elif name == "select_entity":
            return await _tool_select_entity(args, session)
        else:
            return ToolResult(
                success=False, data={}, message=f"Unknown tool: {name}",
                error=f"No tool named '{name}' is available.",
            )
    except Exception as e:
        logger.error(f"[AGENT] Tool {name} failed: {e}", exc_info=True)
        return ToolResult(
            success=False, data={}, message=f"Tool failed: {name}",
            error=str(e),
        )


async def _tool_resolve_entity(args: Dict, session) -> ToolResult:
    """Find a lead or buyer by name, code, or description."""
    from .buyer_codes import resolve_entity_reference
    from .session import SessionManager

    reference = args.get("reference", "")
    if not reference:
        return ToolResult(
            success=False, data={}, message="No reference provided.",
            error="Please specify a name or code to look up.",
        )

    matches = resolve_entity_reference(session.agent_id, reference)

    if len(matches) == 0:
        return ToolResult(
            success=True,
            data={"found": False, "reference": reference},
            message=f"No lead or buyer matching '{reference}'",
        )

    if len(matches) == 1:
        entity = matches[0]
        entity_type = entity.get("entity_type", "buyer")

        # Set session context
        if entity_type == "buyer":
            session.set_buyer_context(
                entity["id"],
                entity.get("whatsapp_code", ""),
                entity.get("name", "Unknown"),
            )
        else:
            session.set_lead_context(
                entity["id"],
                entity.get("whatsapp_code", ""),
                entity.get("name") or entity.get("extracted_name", "Unknown"),
            )
        await SessionManager.save(session)

        return ToolResult(
            success=True,
            data={
                "found": True,
                "entity_id": entity["id"],
                "entity_type": entity_type,
                "name": entity.get("name") or entity.get("extracted_name", "Unknown"),
                "code": entity.get("whatsapp_code", ""),
                "email": entity.get("email") or entity.get("extracted_email"),
                "location": entity.get("location") or entity.get("extracted_location"),
                "budget_min": entity.get("budget_min") or entity.get("extracted_budget_min"),
                "budget_max": entity.get("budget_max") or entity.get("extracted_budget_max"),
            },
            message=f"Found {entity.get('name') or entity.get('extracted_name')} ({entity.get('whatsapp_code', '')}) — {entity_type}",
        )

    # Build rich match data for Gemini to show (budget/location for display)
    display_matches = []
    # Build minimal match data for session persistence (only what auto-resolution needs)
    disambiguation_matches = []
    for m in matches:
        name = m.get("name") or m.get("extracted_name", "Unknown")
        code = m.get("whatsapp_code", "")
        entity_type = m.get("entity_type", "buyer")
        entity_id = m.get("id")

        display_matches.append({
            "entity_id": entity_id,
            "name": name,
            "code": code,
            "entity_type": entity_type,
            "location": m.get("location") or m.get("extracted_location"),
            "budget_min": m.get("budget_min") or m.get("extracted_budget_min"),
            "budget_max": m.get("budget_max") or m.get("extracted_budget_max"),
        })
        disambiguation_matches.append({
            "entity_id": entity_id,
            "name": name,
            "code": code,
            "entity_type": entity_type,
        })

    # Persist minimal matches so numeric replies ("2") can be auto-resolved
    session.pending_disambiguation = disambiguation_matches
    await SessionManager.save(session)

    return ToolResult(
        success=True,
        data={"found": True, "ambiguous": True, "matches": display_matches},
        message=f"Found {len(matches)} matches for '{reference}'",
    )


async def _tool_select_entity(args: Dict, session) -> ToolResult:
    """Lock in which entity the conversation is about (sets session context)."""
    from .session import SessionManager

    entity_id = args.get("entity_id")
    entity_type = args.get("entity_type", "buyer")
    name = args.get("name", "Unknown")
    code = args.get("code", "")

    if not entity_id:
        return ToolResult(
            success=False, data={}, message="No entity_id provided.",
            error="entity_id is required.",
        )

    if entity_type == "buyer":
        session.set_buyer_context(entity_id, code, name)
    else:
        session.set_lead_context(entity_id, code, name)
    session.pending_disambiguation = None
    await SessionManager.save(session)

    logger.info(f"[AGENT] Selected entity: {name} ({code}) — {entity_type}, id={entity_id}")

    return ToolResult(
        success=True,
        data={
            "entity_id": entity_id,
            "entity_type": entity_type,
            "name": name,
            "code": code,
            "active": True,
        },
        message=f"Now working with {name} ({code}) — {entity_type}",
    )


async def _tool_get_entity_details(args: Dict, session) -> ToolResult:
    """Get full profile details for a lead or buyer."""
    from ...db import get_conn, fetchone_dict

    entity_id = args.get("entity_id")
    entity_type = args.get("entity_type", "buyer")

    if not entity_id:
        return ToolResult(success=False, data={}, message="No entity_id provided.", error="entity_id is required.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            if entity_type == "buyer":
                cur.execute(
                    "SELECT * FROM buyer_profiles WHERE id = %s AND agent_id = %s",
                    (entity_id, session.agent_id),
                )
            else:
                cur.execute(
                    "SELECT * FROM leads WHERE id = %s AND agent_id = %s",
                    (entity_id, session.agent_id),
                )
            row = fetchone_dict(cur)

    if not row:
        return ToolResult(
            success=False, data={}, message=f"{entity_type.title()} not found.",
            error=f"No {entity_type} with id={entity_id} found for this agent.",
        )

    # Serialize datetime fields
    data = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            data[k] = v.isoformat()
        elif isinstance(v, (dict, list)):
            data[k] = v
        else:
            data[k] = v

    name = row.get("name") or row.get("extracted_name", "Unknown")
    return ToolResult(
        success=True,
        data=data,
        message=f"Details for {name} ({row.get('whatsapp_code', '')})",
    )


async def _tool_list_all_entities(args: Dict, session) -> ToolResult:
    """List all leads and buyers for this agent."""
    from .buyer_codes import get_all_entities

    entities = get_all_entities(session.agent_id)

    if not entities:
        return ToolResult(
            success=True,
            data={"count": 0, "entities": []},
            message="No leads or buyers found. The agent hasn't added any yet.",
        )

    entity_list = []
    for e in entities:
        entity_list.append({
            "name": e.get("name", "Unknown"),
            "code": e.get("code", ""),
            "entity_type": e.get("entity_type", "buyer"),
            "email": e.get("email"),
            "location": e.get("location"),
            "budget_display": e.get("budget_display", ""),
        })

    return ToolResult(
        success=True,
        data={"count": len(entity_list), "entities": entity_list},
        message=f"Found {len(entity_list)} entities ({sum(1 for e in entity_list if e['entity_type'] == 'buyer')} buyers, {sum(1 for e in entity_list if e['entity_type'] == 'lead')} leads)",
    )


async def _tool_process_lead(args: Dict, session) -> ToolResult:
    """Extract and save a new lead from pasted text."""
    from .agent import process_lead_from_text
    from .buyer_codes import assign_code_to_lead

    raw_text = args.get("raw_text", "")
    source = args.get("source", "unknown")

    if not raw_text:
        return ToolResult(
            success=False, data={}, message="No text provided.",
            error="raw_text is required to process a lead.",
        )

    try:
        lead_data = process_lead_from_text(raw_text, source, session.agent_id)
        if not lead_data:
            return ToolResult(
                success=False, data={}, message="Could not extract lead information.",
                error="The text didn't contain enough information to create a lead.",
            )

        lead_id = lead_data["lead_id"]
        lead_name = lead_data.get("name") or "Lead"

        # Assign code to the new lead
        code = assign_code_to_lead(lead_id, session.agent_id, lead_name)

        # Fire outreach generation as background task
        asyncio.create_task(
            _background_generate_outreach(lead_id, lead_name, lead_data.get("email"), session)
        )

        return ToolResult(
            success=True,
            data={
                "lead_id": lead_id,
                "name": lead_name,
                "code": code,
                "email": lead_data.get("email"),
                "phone": lead_data.get("phone"),
                "location": lead_data.get("location"),
                "budget_min": lead_data.get("budget_min"),
                "budget_max": lead_data.get("budget_max"),
                "bedrooms": lead_data.get("bedrooms"),
                "source": lead_data.get("source"),
                "intent_score": lead_data.get("intent_score"),
            },
            message=f"Lead processed: {lead_name} ({code or 'no code'}). Outreach report is being generated in background — you'll be notified when ready.",
        )
    except Exception as e:
        return ToolResult(
            success=False, data={}, message="Failed to process lead.",
            error=str(e),
        )


async def _background_generate_outreach(lead_id: int, lead_name: str, lead_email: str, session):
    """Background task: generate outreach report and notify agent when ready."""
    try:
        from ...routers.leads import generate_lead_outreach
        from .notifications import on_lead_outreach_ready

        result = await generate_lead_outreach(
            lead_id=lead_id,
            send_email=False,
            agent_id=session.agent_id,
            _notify_whatsapp=False,
        )

        share_id = result.get("reportShareId")
        report_url = result.get("fullReportUrl", "")
        listing_count = result.get("propertiesIncluded", 0)

        if share_id:
            await on_lead_outreach_ready(
                session.agent_id, lead_name, lead_email, lead_id, share_id
            )
            logger.info(f"[AGENT] Background outreach ready for lead {lead_id}: {share_id}")
        else:
            logger.warning(f"[AGENT] Background outreach generation returned no share_id for lead {lead_id}")

    except Exception as e:
        logger.error(f"[AGENT] Background outreach failed for lead {lead_id}: {e}", exc_info=True)


async def _tool_update_entity(args: Dict, session) -> ToolResult:
    """Propose changes to a lead or buyer profile — returns preview for confirmation."""
    from .session import SessionManager

    entity_id = args.get("entity_id")
    entity_type = args.get("entity_type", "buyer")
    changes_description = args.get("changes_description", "")

    if not entity_id or not changes_description:
        return ToolResult(
            success=False, data={}, message="Missing required fields.",
            error="entity_id and changes_description are required.",
        )

    # Return pending_action — handler will save it to session
    # (don't save here to avoid double-save race with handler's final save)
    return ToolResult(
        success=True,
        data={"entity_id": entity_id, "entity_type": entity_type, "changes": changes_description},
        message=f"Proposed changes to {entity_type} #{entity_id}: {changes_description}",
        needs_confirmation=True,
        pending_action={"type": "edit_entity", "data": {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "changes_description": changes_description,
        }},
        actions=[
            {"id": "confirm", "title": "Confirm"},
            {"id": "cancel", "title": "Cancel"},
        ],
    )


async def _tool_search(args: Dict, session) -> ToolResult:
    """Search for properties matching a buyer/lead's criteria."""
    from ..search_context_store import generate_search_id, store_search_context
    from .session import SessionManager, SessionState

    entity_id = args.get("entity_id")
    entity_type = args.get("entity_type", "buyer")

    if not entity_id:
        return ToolResult(
            success=False, data={}, message="No entity specified.",
            error="entity_id is required to search.",
        )

    try:
        from ...routers.listings import listings_search, _load_profile
        from ...routers.search import _map_to_agent_listing

        # For buyers, load profile directly. For leads, we need to map to buyer profile ID.
        if entity_type == "buyer":
            profile_id = entity_id
        else:
            # Check if lead has been converted to a buyer profile
            from ...db import get_conn, fetchone_dict
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id FROM buyer_profiles WHERE parent_lead_id = %s AND agent_id = %s",
                        (entity_id, session.agent_id),
                    )
                    row = fetchone_dict(cur)
                    if row:
                        profile_id = row["id"]
                    else:
                        return ToolResult(
                            success=False, data={},
                            message="This lead hasn't been converted to a buyer profile yet.",
                            error="Convert the lead to a buyer profile first, or add search criteria.",
                        )

        profile = _load_profile(profile_id)
        result = listings_search({"profileId": profile_id, "profile": {}})

        # Use the same mapping as the normal search pipeline so that
        # create_buyer_report can find finalScore, isTop20, rank, etc.
        listings = _map_to_agent_listing(result)

        search_id = generate_search_id()
        store_search_context(search_id, profile, listings)

        session.last_search_id = search_id
        session.state = SessionState.BUYER_CONTEXT if entity_type == "buyer" else SessionState.LEAD_CONTEXT
        session.sub_state = "results"
        await SessionManager.save(session)

        total_found = result.get("search_summary", {}).get("total_found", len(listings))

        # Return top 5 as summary for Gemini
        top5_summary = []
        for l in listings[:5]:
            top5_summary.append({
                "address": l.get("address", "Unknown"),
                "city": l.get("city", ""),
                "price": l.get("listPrice", 0),
                "bedrooms": l.get("bedrooms"),
                "bathrooms": l.get("bathrooms"),
                "match_score": l.get("fitScore", 0),
            })

        return ToolResult(
            success=True,
            data={"total_found": total_found, "count": len(listings), "top_5": top5_summary, "search_id": search_id},
            message=f"Found {total_found} properties. Top {min(5, len(listings))} selected.",
        )

    except Exception as e:
        error_msg = str(e)
        if "MLS" in error_msg or "Repliers" in error_msg:
            return ToolResult(
                success=False, data={}, message="Property search failed.",
                error="The MLS database is temporarily unavailable. Try again in a few minutes.",
            )
        if "No listings" in error_msg or "budget" in error_msg.lower():
            return ToolResult(
                success=False, data={}, message="No properties found.",
                error="No properties match the current criteria. Consider adjusting budget or location.",
            )
        raise


async def _tool_generate_report(args: Dict, session) -> ToolResult:
    """Generate a buyer report from latest search results."""
    from .session import SessionManager
    import os

    entity_id = args.get("entity_id")
    entity_type = args.get("entity_type", "buyer")

    if not session.last_search_id:
        return ToolResult(
            success=False, data={}, message="No search results available.",
            error="Run a property search first, then generate the report.",
        )

    try:
        from ...routers.buyer_reports import create_buyer_report, CreateBuyerReportRequest
        from ...routers.search import agent_search_photos, agent_search_location

        # For leads, we need the buyer profile ID
        if entity_type == "buyer":
            profile_id = entity_id
        else:
            from ...db import get_conn, fetchone_dict
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id FROM buyer_profiles WHERE parent_lead_id = %s AND agent_id = %s",
                        (entity_id, session.agent_id),
                    )
                    row = fetchone_dict(cur)
                    if row:
                        profile_id = row["id"]
                    else:
                        return ToolResult(
                            success=False, data={},
                            message="No buyer profile found for this lead.",
                            error="Convert the lead first.",
                        )

        # Run photo + location analysis before generating report
        # (In the dashboard flow, the frontend polls these endpoints)
        search_id = session.last_search_id
        try:
            logger.info(f"[WA REPORT] Running photo analysis for searchId={search_id}")
            agent_search_photos(searchId=search_id)
        except Exception as e:
            logger.warning(f"[WA REPORT] Photo analysis failed (non-blocking): {e}")

        try:
            logger.info(f"[WA REPORT] Running location analysis for searchId={search_id}")
            await agent_search_location(searchId=search_id)
        except Exception as e:
            logger.warning(f"[WA REPORT] Location analysis failed (non-blocking): {e}")

        request = CreateBuyerReportRequest(
            searchId=search_id,
            profileId=profile_id,
            allowPartial=True,
        )
        result = create_buyer_report(request, agent_id=session.agent_id)

        share_id = result.get("shareId")
        share_url = result.get("shareUrl", f"/buyer-report/{share_id}")
        frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residenthive.com")
        full_url = f"{frontend_url}{share_url}"
        listing_count = result.get("includedCount", 5)

        # Get buyer email for the approval message
        from ...db import get_conn, fetchone_dict
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT name, email FROM buyer_profiles WHERE id = %s", (profile_id,))
                buyer = fetchone_dict(cur)

        buyer_name = buyer.get("name", "Buyer") if buyer else "Buyer"
        buyer_email = buyer.get("email") if buyer else None

        # Store pending approval
        await SessionManager.set_pending_action(
            session.phone,
            "approve_report",
            {
                "share_id": share_id,
                "share_url": full_url,
                "buyer_id": profile_id,
                "buyer_name": buyer_name,
                "buyer_email": buyer_email,
                "listing_count": listing_count,
            },
        )

        return ToolResult(
            success=True,
            data={"share_id": share_id, "share_url": full_url, "listing_count": listing_count},
            message=f"Report ready for {buyer_name} ({listing_count} properties). Review and approve to send: {full_url}",
            needs_confirmation=True,
            pending_action={"type": "approve_report", "data": {
                "share_id": share_id, "share_url": full_url,
                "buyer_id": profile_id, "buyer_name": buyer_name,
                "buyer_email": buyer_email, "listing_count": listing_count,
            }},
            actions=[
                {"id": "btn_approve_report", "title": "Approve & Send"},
                {"id": "btn_reject_report", "title": "Reject"},
            ],
        )

    except Exception as e:
        return ToolResult(
            success=False, data={}, message="Report generation failed.",
            error=str(e),
        )


async def _tool_send_outreach(args: Dict, session) -> ToolResult:
    """Generate outreach report for a lead (without sending email yet)."""
    from .session import SessionManager

    lead_id = args.get("lead_id")
    if not lead_id:
        return ToolResult(
            success=False, data={}, message="No lead specified.",
            error="lead_id is required.",
        )

    try:
        from ...routers.leads import generate_lead_outreach

        result = await generate_lead_outreach(
            lead_id=lead_id,
            send_email=False,
            agent_id=session.agent_id,
            _notify_whatsapp=False,
        )

        share_id = result.get("reportShareId")
        report_url = result.get("fullReportUrl", "")
        listing_count = result.get("propertiesIncluded", 0)

        if not share_id:
            return ToolResult(
                success=False, data={}, message="Could not generate outreach report.",
                error="Report generation returned no share ID.",
            )

        # Get lead details for approval message
        from ...db import get_conn, fetchone_dict
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT extracted_name, extracted_email FROM leads WHERE id = %s AND agent_id = %s",
                    (lead_id, session.agent_id),
                )
                lead = fetchone_dict(cur)

        lead_name = lead.get("extracted_name", "Lead") if lead else "Lead"
        lead_email = lead.get("extracted_email") if lead else None

        await SessionManager.set_pending_action(
            session.phone,
            "approve_outreach",
            {
                "share_id": share_id,
                "share_url": report_url,
                "lead_id": lead_id,
                "lead_name": lead_name,
                "lead_email": lead_email,
                "listing_count": listing_count,
            },
        )

        return ToolResult(
            success=True,
            data={"share_id": share_id, "report_url": report_url, "listing_count": listing_count},
            message=f"Outreach report ready for {lead_name} ({listing_count} properties). Review: {report_url}",
            needs_confirmation=True,
            pending_action={"type": "approve_outreach", "data": {
                "share_id": share_id, "share_url": report_url,
                "lead_id": lead_id, "lead_name": lead_name,
                "lead_email": lead_email, "listing_count": listing_count,
            }},
            actions=[
                {"id": "btn_approve_outreach", "title": "Approve & Send"},
                {"id": "btn_reject_outreach", "title": "Reject"},
            ],
        )

    except Exception as e:
        return ToolResult(
            success=False, data={}, message="Outreach generation failed.",
            error=str(e),
        )


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _format_history(messages: List[Dict[str, str]]) -> str:
    """Format message history for the system prompt."""
    if not messages:
        return ""
    lines = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")[:200]
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _format_entities(entities: List[Dict[str, Any]]) -> str:
    """Format entity list for the system prompt."""
    if not entities:
        return ""
    lines = []
    for e in entities[:15]:
        name = e.get("name", "Unknown")
        code = e.get("code", "")
        etype = e.get("entity_type", "buyer")
        location = e.get("location", "")
        budget = e.get("budget_display", "")

        parts = [f"{name} ({code})" if code else name, etype]
        if location:
            parts.append(location)
        if budget:
            parts.append(budget)
        lines.append(" — ".join(parts))

    return "\n".join(lines)


# ============================================================================
# BUYER RESOLUTION (backward compat for handlers that still use it)
# ============================================================================

def resolve_buyer_from_intent(
    intent: Intent,
    agent_id: int,
    active_buyer: Optional[Dict[str, Any]] = None,
) -> Intent:
    """Resolve buyer reference in intent to actual buyer ID."""
    from .buyer_codes import resolve_buyer_reference

    if not intent.buyer_reference and active_buyer:
        intent.buyer_id = active_buyer.get("id")
        return intent

    if intent.buyer_reference:
        matches = resolve_buyer_reference(agent_id, intent.buyer_reference)
        if len(matches) == 1:
            intent.buyer_id = matches[0].get("id")
            intent.buyer_reference = matches[0].get("whatsapp_code")
        elif len(matches) > 1:
            intent.params["ambiguous_matches"] = matches

    return intent
