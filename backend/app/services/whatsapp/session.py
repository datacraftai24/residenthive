"""
Redis-based Session Manager for WhatsApp Conversations

Manages agent conversation state including:
- Current mode (inbox vs buyer context)
- Active buyer selection
- Pending actions awaiting confirmation
- Search context for reports

Sessions expire after 15 minutes of inactivity but can be refreshed.
Falls back to in-memory storage if Redis is unavailable.
"""

import os
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from enum import Enum

logger = logging.getLogger(__name__)

# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SESSION_TTL_MINUTES = 15
SESSION_PREFIX = "wa:session:"

# Redis client (initialized lazily)
_redis_client = None
_redis_available = None

# In-memory fallback
_memory_store: Dict[str, Dict[str, Any]] = {}


class SessionState(str, Enum):
    """Possible session states"""
    IDLE = "idle"
    BUYER_LIST = "buyer_list"
    BUYER_CONTEXT = "buyer_context"
    CREATING_BUYER = "creating_buyer"
    EDITING_BUYER = "editing_buyer"
    CONFIRMING = "confirming"
    SEARCHING = "searching"


@dataclass
class AgentSession:
    """Agent's WhatsApp session state"""
    agent_id: int
    phone: str
    state: SessionState = SessionState.IDLE
    active_buyer_id: Optional[int] = None
    active_buyer_code: Optional[str] = None
    active_buyer_name: Optional[str] = None
    sub_state: Optional[str] = None
    last_search_id: Optional[str] = None
    pending_action: Optional[Dict[str, Any]] = None
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
            "sub_state": self.sub_state,
            "last_search_id": self.last_search_id,
            "pending_action": self.pending_action,
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
            sub_state=data.get("sub_state"),
            last_search_id=data.get("last_search_id"),
            pending_action=data.get("pending_action"),
            last_activity_at=data.get("last_activity_at", datetime.utcnow().isoformat()),
            created_at=data.get("created_at", datetime.utcnow().isoformat()),
        )
    
    def is_in_buyer_context(self) -> bool:
        """Check if currently focused on a specific buyer"""
        return self.state == SessionState.BUYER_CONTEXT and self.active_buyer_id is not None
    
    def clear_buyer_context(self):
        """Exit buyer context, return to idle"""
        self.state = SessionState.IDLE
        self.active_buyer_id = None
        self.active_buyer_code = None
        self.active_buyer_name = None
        self.sub_state = None
        self.last_search_id = None
        self.pending_action = None
    
    def set_buyer_context(self, buyer_id: int, buyer_code: str, buyer_name: str):
        """Enter buyer context"""
        self.state = SessionState.BUYER_CONTEXT
        self.active_buyer_id = buyer_id
        self.active_buyer_code = buyer_code
        self.active_buyer_name = buyer_name
        self.sub_state = None
        self.pending_action = None
    
    def touch(self):
        """Update last activity timestamp"""
        self.last_activity_at = datetime.utcnow().isoformat()


async def _get_redis():
    """Get or create Redis connection"""
    global _redis_client, _redis_available
    
    if _redis_available is False:
        return None
    
    if _redis_client is not None:
        return _redis_client
    
    try:
        import redis.asyncio as redis
        _redis_client = redis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5
        )
        await _redis_client.ping()
        _redis_available = True
        logger.info(f"Connected to Redis at {REDIS_URL}")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis unavailable, using in-memory fallback: {e}")
        _redis_available = False
        return None


def _get_cache_key(phone: str) -> str:
    """Generate cache key from phone number"""
    # Normalize phone number
    phone = phone.replace("+", "").replace("-", "").replace(" ", "")
    return f"{SESSION_PREFIX}{phone}"


async def get_session(phone: str) -> Optional[AgentSession]:
    """
    Retrieve session for a phone number.
    
    Args:
        phone: WhatsApp phone number
        
    Returns:
        AgentSession if exists and not expired, None otherwise
    """
    cache_key = _get_cache_key(phone)
    
    # Try Redis first
    redis = await _get_redis()
    if redis:
        try:
            data = await redis.get(cache_key)
            if data:
                session_dict = json.loads(data)
                session = AgentSession.from_dict(session_dict)
                logger.debug(f"Session retrieved from Redis for {phone}")
                return session
        except Exception as e:
            logger.error(f"Error retrieving session from Redis: {e}")
    
    # Fallback to memory
    if cache_key in _memory_store:
        session_data = _memory_store[cache_key]
        # Check TTL
        last_activity = datetime.fromisoformat(session_data.get("last_activity_at", datetime.utcnow().isoformat()))
        if datetime.utcnow() - last_activity > timedelta(minutes=SESSION_TTL_MINUTES):
            del _memory_store[cache_key]
            return None
        return AgentSession.from_dict(session_data)
    
    return None


async def save_session(session: AgentSession) -> bool:
    """
    Save session state.
    
    Args:
        session: AgentSession to save
        
    Returns:
        True if saved successfully
    """
    session.touch()
    cache_key = _get_cache_key(session.phone)
    session_dict = session.to_dict()
    
    # Try Redis first
    redis = await _get_redis()
    if redis:
        try:
            await redis.setex(
                cache_key,
                SESSION_TTL_MINUTES * 60,
                json.dumps(session_dict)
            )
            logger.debug(f"Session saved to Redis for {session.phone}")
            return True
        except Exception as e:
            logger.error(f"Error saving session to Redis: {e}")
    
    # Fallback to memory
    _memory_store[cache_key] = session_dict
    logger.debug(f"Session saved to memory for {session.phone}")
    return True


async def create_session(agent_id: int, phone: str) -> AgentSession:
    """
    Create a new session for an agent.
    
    Args:
        agent_id: Agent's database ID
        phone: WhatsApp phone number
        
    Returns:
        New AgentSession
    """
    session = AgentSession(
        agent_id=agent_id,
        phone=phone,
        state=SessionState.IDLE
    )
    await save_session(session)
    logger.info(f"Created new session for agent {agent_id} at {phone}")
    return session


async def get_or_create_session(agent_id: int, phone: str) -> AgentSession:
    """
    Get existing session or create new one.
    
    Args:
        agent_id: Agent's database ID
        phone: WhatsApp phone number
        
    Returns:
        AgentSession (existing or new)
    """
    session = await get_session(phone)
    if session:
        # Verify agent_id matches (security check)
        if session.agent_id != agent_id:
            logger.warning(f"Session agent_id mismatch for {phone}: {session.agent_id} != {agent_id}")
            session = await create_session(agent_id, phone)
        return session
    return await create_session(agent_id, phone)


async def delete_session(phone: str) -> bool:
    """
    Delete a session.
    
    Args:
        phone: WhatsApp phone number
        
    Returns:
        True if deleted
    """
    cache_key = _get_cache_key(phone)
    
    # Try Redis
    redis = await _get_redis()
    if redis:
        try:
            await redis.delete(cache_key)
        except Exception as e:
            logger.error(f"Error deleting session from Redis: {e}")
    
    # Also clear from memory
    if cache_key in _memory_store:
        del _memory_store[cache_key]
    
    logger.info(f"Deleted session for {phone}")
    return True


async def update_session_state(
    phone: str,
    state: SessionState,
    **kwargs
) -> Optional[AgentSession]:
    """
    Update session state with additional fields.
    
    Args:
        phone: WhatsApp phone number
        state: New session state
        **kwargs: Additional fields to update
        
    Returns:
        Updated session or None if not found
    """
    session = await get_session(phone)
    if not session:
        return None
    
    session.state = state
    
    # Update any additional fields
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
        
        session.clear_buyer_context()
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
        # Return to previous state (buyer context if active, else idle)
        if session.active_buyer_id:
            session.state = SessionState.BUYER_CONTEXT
        else:
            session.state = SessionState.IDLE
        
        await save_session(session)
        return session
    
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
