"""
PostgreSQL-backed Session Manager for WhatsApp Conversations

Manages agent conversation state including:
- Current mode (inbox vs buyer/lead context)
- Active entity selection (buyer or lead)
- Pending actions awaiting confirmation
- Search context for reports
- Message history for coordinator agent

Sessions expire after 15 minutes of inactivity.
Uses PostgreSQL (whatsapp_sessions table) for persistence across Cloud Run instances.
"""

import json
import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

# Configuration
SESSION_TTL_MINUTES = 15


class SessionState(str, Enum):
    """Possible session states"""
    IDLE = "idle"
    BUYER_LIST = "buyer_list"
    BUYER_CONTEXT = "buyer_context"
    CREATING_BUYER = "creating_buyer"
    EDITING_BUYER = "editing_buyer"
    CONFIRMING = "confirming"
    SEARCHING = "searching"
    LEAD_CONTEXT = "lead_context"


@dataclass
class AgentSession:
    """Agent's WhatsApp session state"""
    agent_id: int
    phone: str
    state: SessionState = SessionState.IDLE

    # Buyer context
    active_buyer_id: Optional[int] = None
    active_buyer_code: Optional[str] = None
    active_buyer_name: Optional[str] = None

    # Lead context
    active_lead_id: Optional[int] = None
    active_lead_code: Optional[str] = None
    active_lead_name: Optional[str] = None

    # Generic entity type for the active context ("buyer" or "lead")
    active_entity_type: Optional[str] = None

    sub_state: Optional[str] = None
    last_search_id: Optional[str] = None
    pending_action: Optional[Dict[str, Any]] = None

    # Disambiguation state: stores matches from resolve_entity when ambiguous
    # Each match: {"entity_id": int, "entity_type": str, "name": str, "code": str, ...}
    pending_disambiguation: Optional[List[Dict[str, Any]]] = None

    # Conversation history for coordinator agent (last 10 messages)
    message_history: List[Dict[str, str]] = field(default_factory=list)

    last_activity_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "agent_id": self.agent_id,
            "phone": self.phone,
            "state": self.state.value if isinstance(self.state, SessionState) else self.state,
            "active_buyer_id": self.active_buyer_id,
            "active_buyer_code": self.active_buyer_code,
            "active_buyer_name": self.active_buyer_name,
            "active_lead_id": self.active_lead_id,
            "active_lead_code": self.active_lead_code,
            "active_lead_name": self.active_lead_name,
            "active_entity_type": self.active_entity_type,
            "sub_state": self.sub_state,
            "last_search_id": self.last_search_id,
            "pending_action": self.pending_action,
            "pending_disambiguation": self.pending_disambiguation,
            "message_history": self.message_history,
            "last_activity_at": self.last_activity_at,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentSession":
        """Create from dictionary"""
        state = data.get("state", "idle")
        if isinstance(state, str):
            try:
                state = SessionState(state)
            except ValueError:
                state = SessionState.IDLE

        return cls(
            agent_id=data["agent_id"],
            phone=data["phone"],
            state=state,
            active_buyer_id=data.get("active_buyer_id"),
            active_buyer_code=data.get("active_buyer_code"),
            active_buyer_name=data.get("active_buyer_name"),
            active_lead_id=data.get("active_lead_id"),
            active_lead_code=data.get("active_lead_code"),
            active_lead_name=data.get("active_lead_name"),
            active_entity_type=data.get("active_entity_type"),
            sub_state=data.get("sub_state"),
            last_search_id=data.get("last_search_id"),
            pending_action=data.get("pending_action"),
            pending_disambiguation=data.get("pending_disambiguation"),
            message_history=data.get("message_history", []),
            last_activity_at=data.get("last_activity_at", datetime.utcnow().isoformat()),
            created_at=data.get("created_at", datetime.utcnow().isoformat()),
        )

    def is_in_buyer_context(self) -> bool:
        """Check if currently focused on a specific buyer"""
        return self.state == SessionState.BUYER_CONTEXT and self.active_buyer_id is not None

    def is_in_lead_context(self) -> bool:
        """Check if currently focused on a specific lead"""
        return self.state == SessionState.LEAD_CONTEXT and self.active_lead_id is not None

    def is_in_entity_context(self) -> bool:
        """Check if currently focused on any entity (buyer or lead)"""
        return self.is_in_buyer_context() or self.is_in_lead_context()

    def clear_buyer_context(self):
        """Exit buyer context, return to idle"""
        self.state = SessionState.IDLE
        self.active_buyer_id = None
        self.active_buyer_code = None
        self.active_buyer_name = None
        self.active_entity_type = None
        self.sub_state = None
        self.last_search_id = None
        self.pending_action = None
        self.pending_disambiguation = None

    def set_buyer_context(self, buyer_id: int, buyer_code: str, buyer_name: str):
        """Enter buyer context"""
        self.state = SessionState.BUYER_CONTEXT
        self.active_buyer_id = buyer_id
        self.active_buyer_code = buyer_code
        self.active_buyer_name = buyer_name
        self.active_entity_type = "buyer"
        # Clear lead context
        self.active_lead_id = None
        self.active_lead_code = None
        self.active_lead_name = None
        self.sub_state = None
        self.pending_action = None

    def set_lead_context(self, lead_id: int, lead_code: str, lead_name: str):
        """Enter lead context"""
        self.state = SessionState.LEAD_CONTEXT
        self.active_lead_id = lead_id
        self.active_lead_code = lead_code
        self.active_lead_name = lead_name
        self.active_entity_type = "lead"
        # Clear buyer context
        self.active_buyer_id = None
        self.active_buyer_code = None
        self.active_buyer_name = None
        self.sub_state = None
        self.pending_action = None

    def clear_all_context(self):
        """Exit all entity context, return to idle"""
        self.state = SessionState.IDLE
        self.active_buyer_id = None
        self.active_buyer_code = None
        self.active_buyer_name = None
        self.active_lead_id = None
        self.active_lead_code = None
        self.active_lead_name = None
        self.active_entity_type = None
        self.sub_state = None
        self.last_search_id = None
        self.pending_action = None
        self.pending_disambiguation = None

    def add_message(self, role: str, content: str):
        """Add a message to conversation history (keep last 10)."""
        self.message_history.append({"role": role, "content": content})
        self.message_history = self.message_history[-10:]

    def touch(self):
        """Update last activity timestamp"""
        self.last_activity_at = datetime.utcnow().isoformat()


class _SessionEncoder(json.JSONEncoder):
    """Handle PostgreSQL types (Decimal, datetime) in session data."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj == int(obj) else float(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)


def _normalize_phone(phone: str) -> str:
    """Normalize phone number for consistent DB keys."""
    return phone.replace("+", "").replace("-", "").replace(" ", "")


async def get_session(phone: str) -> Optional[AgentSession]:
    """Retrieve session from PostgreSQL."""
    from ...db import get_conn, fetchone_dict

    phone_key = _normalize_phone(phone)
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT data, updated_at FROM whatsapp_sessions
                       WHERE phone = %s""",
                    (phone_key,),
                )
                row = fetchone_dict(cur)

        if not row:
            return None

        # Check TTL
        updated_at = row["updated_at"]
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        if datetime.utcnow().replace(tzinfo=updated_at.tzinfo) - updated_at > timedelta(minutes=SESSION_TTL_MINUTES):
            await delete_session(phone)
            return None

        data = row["data"]
        if isinstance(data, str):
            data = json.loads(data)
        return AgentSession.from_dict(data)

    except Exception as e:
        logger.error(f"Error getting session for {phone}: {e}")
        return None


async def save_session(session: AgentSession) -> bool:
    """Save session to PostgreSQL (upsert)."""
    from ...db import get_conn

    session.touch()
    phone_key = _normalize_phone(session.phone)
    session_dict = session.to_dict()

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO whatsapp_sessions (phone, agent_id, data, updated_at)
                       VALUES (%s, %s, %s, NOW())
                       ON CONFLICT (phone)
                       DO UPDATE SET data = EXCLUDED.data,
                                     agent_id = EXCLUDED.agent_id,
                                     updated_at = NOW()""",
                    (phone_key, session.agent_id, json.dumps(session_dict, cls=_SessionEncoder)),
                )
        logger.debug(f"Session saved to PostgreSQL for {session.phone}")
        return True
    except Exception as e:
        logger.error(f"Error saving session for {session.phone}: {e}")
        return False


async def create_session(agent_id: int, phone: str) -> AgentSession:
    """Create a new session."""
    session = AgentSession(agent_id=agent_id, phone=phone, state=SessionState.IDLE)
    await save_session(session)
    logger.info(f"Created new session for agent {agent_id} at {phone}")
    return session


async def get_or_create_session(agent_id: int, phone: str) -> AgentSession:
    """Get existing session or create new one."""
    session = await get_session(phone)
    if session:
        if session.agent_id != agent_id:
            logger.warning(f"Session agent_id mismatch for {phone}: {session.agent_id} != {agent_id}")
            session = await create_session(agent_id, phone)
        return session
    return await create_session(agent_id, phone)


async def delete_session(phone: str) -> bool:
    """Delete a session from PostgreSQL."""
    from ...db import get_conn

    phone_key = _normalize_phone(phone)
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM whatsapp_sessions WHERE phone = %s", (phone_key,))
        logger.info(f"Deleted session for {phone}")
        return True
    except Exception as e:
        logger.error(f"Error deleting session for {phone}: {e}")
        return False


async def update_session_state(
    phone: str,
    state: SessionState,
    **kwargs
) -> Optional[AgentSession]:
    """Update session state with additional fields."""
    session = await get_session(phone)
    if not session:
        return None

    session.state = state
    for key, value in kwargs.items():
        if hasattr(session, key):
            setattr(session, key, value)

    await save_session(session)
    return session


class SessionManager:
    """
    High-level session management interface.
    Provides convenient methods for common session operations.
    """

    @staticmethod
    async def get(phone: str) -> Optional[AgentSession]:
        """Get session by phone"""
        return await get_session(phone)

    @staticmethod
    async def get_or_create(agent_id: int, phone: str) -> AgentSession:
        """Get or create session"""
        return await get_or_create_session(agent_id, phone)

    @staticmethod
    async def save(session: AgentSession) -> bool:
        """Save session"""
        return await save_session(session)

    @staticmethod
    async def delete(phone: str) -> bool:
        """Delete session"""
        return await delete_session(phone)

    @staticmethod
    async def enter_buyer_context(
        phone: str,
        buyer_id: int,
        buyer_code: str,
        buyer_name: str
    ) -> Optional[AgentSession]:
        """
        Enter buyer context mode.

        Args:
            phone: WhatsApp phone
            buyer_id: Buyer profile ID
            buyer_code: Buyer's WhatsApp code
            buyer_name: Buyer's name

        Returns:
            Updated session
        """
        session = await get_session(phone)
        if not session:
            return None

        session.set_buyer_context(buyer_id, buyer_code, buyer_name)
        await save_session(session)
        return session

    @staticmethod
    async def enter_lead_context(
        phone: str,
        lead_id: int,
        lead_code: str,
        lead_name: str
    ) -> Optional[AgentSession]:
        """
        Enter lead context mode.

        Args:
            phone: WhatsApp phone
            lead_id: Lead ID
            lead_code: Lead's WhatsApp code
            lead_name: Lead's name

        Returns:
            Updated session
        """
        session = await get_session(phone)
        if not session:
            return None

        session.set_lead_context(lead_id, lead_code, lead_name)
        await save_session(session)
        return session

    @staticmethod
    async def exit_buyer_context(phone: str) -> Optional[AgentSession]:
        """
        Exit buyer context, return to idle.

        Args:
            phone: WhatsApp phone

        Returns:
            Updated session
        """
        session = await get_session(phone)
        if not session:
            return None

        session.clear_all_context()
        await save_session(session)
        return session

    @staticmethod
    async def set_pending_action(
        phone: str,
        action_type: str,
        action_data: Dict[str, Any]
    ) -> Optional[AgentSession]:
        """
        Set a pending action awaiting confirmation.

        Args:
            phone: WhatsApp phone
            action_type: Type of action (e.g., "send_report", "create_buyer")
            action_data: Data needed to execute the action

        Returns:
            Updated session
        """
        session = await get_session(phone)
        if not session:
            return None

        session.pending_action = {
            "type": action_type,
            "data": action_data,
            "created_at": datetime.utcnow().isoformat()
        }
        session.state = SessionState.CONFIRMING
        await save_session(session)
        return session

    @staticmethod
    async def clear_pending_action(phone: str) -> Optional[AgentSession]:
        """
        Clear pending action (after confirm or cancel).

        Args:
            phone: WhatsApp phone

        Returns:
            Updated session
        """
        session = await get_session(phone)
        if not session:
            return None

        session.pending_action = None
        # Return to previous state (entity context if active, else idle)
        if session.active_buyer_id:
            session.state = SessionState.BUYER_CONTEXT
        elif session.active_lead_id:
            session.state = SessionState.LEAD_CONTEXT
        else:
            session.state = SessionState.IDLE

        await save_session(session)
        return session

    @staticmethod
    async def get_by_agent(agent_id: int) -> Optional[AgentSession]:
        """
        Find a session by agent_id. Looks up the agent's WhatsApp phone
        from the database, then retrieves the session.

        Returns:
            AgentSession if found, None otherwise
        """
        from ...db import get_conn, fetchone_dict
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT whatsapp_phone FROM agents WHERE id = %s",
                        (agent_id,)
                    )
                    row = fetchone_dict(cur)
                    if row and row.get("whatsapp_phone"):
                        return await get_session(row["whatsapp_phone"])
        except Exception as e:
            logger.error(f"Error looking up session for agent {agent_id}: {e}")
        return None

    @staticmethod
    async def set_search_id(phone: str, search_id: str) -> Optional[AgentSession]:
        """
        Store search ID for report generation.

        Args:
            phone: WhatsApp phone
            search_id: Search transaction ID

        Returns:
            Updated session
        """
        session = await get_session(phone)
        if not session:
            return None

        session.last_search_id = search_id
        await save_session(session)
        return session
