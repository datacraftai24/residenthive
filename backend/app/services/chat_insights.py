"""
Chat Insights Service
Extracts actionable insights from chatbot sessions for agents.
Works for both Leads pathway (lead_id/share_id) and Buyer Profiles pathway (profile_id).
"""

import json
import logging
from typing import Dict, Any, List, Optional
from ..db import get_conn, fetchone_dict, fetchall_dicts

logger = logging.getLogger(__name__)

# Risk topics that require agent verification
RISK_TOPICS = [
    "school", "hoa", "flood", "permit", "zoning", "tax", "taxes",
    "assessment", "lien", "septic", "well", "easement", "deed",
    "title", "survey", "environmental", "asbestos", "lead", "radon"
]


def get_chat_insights(
    lead_id: int = None,
    profile_id: int = None,
    share_id: str = None,
    buyer_name: str = None,
    buyer_email: str = None
) -> Dict[str, Any]:
    """
    Get actionable chat insights for an agent.

    Can query by:
    - lead_id: For leads pathway
    - profile_id: For buyer profiles pathway
    - share_id: For buyer report sessions

    Returns structured insights including:
    - Session summary (messages, engagement level, readiness)
    - Captured preferences
    - Properties discussed
    - Risk topics flagged
    - Top questions asked
    - Suggested action
    - Follow-up message template
    """
    # Get session data
    session = _get_session(lead_id=lead_id, profile_id=profile_id, share_id=share_id)

    if not session:
        return {
            "hasSession": False,
            "summary": None,
            "insights": None
        }

    # Get messages for the session
    messages = _get_session_messages(session["session_id"])

    # Extract insights
    preferences = _parse_preferences(session.get("preferences"))
    properties_discussed = session.get("properties_discussed") or []
    risk_topics = _extract_risk_topics(messages)
    top_questions = _extract_top_questions(messages)
    objections = _extract_objections(messages)

    # Calculate engagement metrics
    message_count = session.get("message_count") or len(messages)
    engagement_level = _calculate_engagement_level(message_count)
    readiness = _calculate_readiness(
        message_count=message_count,
        cta_clicked=session.get("cta_clicked", False),
        preferences_count=len(preferences),
        contact_captured=session.get("contact_captured", False)
    )

    # Generate actionable recommendations
    suggested_action = _generate_suggested_action(
        engagement_level=engagement_level,
        readiness=readiness,
        risk_topics=risk_topics,
        cta_clicked=session.get("cta_clicked", False),
        properties_discussed=properties_discussed
    )

    follow_up_message = _generate_follow_up_message(
        buyer_name=buyer_name,
        preferences=preferences,
        risk_topics=risk_topics,
        top_questions=top_questions,
        properties_discussed=properties_discussed
    )

    return {
        "hasSession": True,
        "summary": {
            "sessionId": session["session_id"],
            "totalMessages": message_count,
            "engagementLevel": engagement_level,
            "readiness": readiness,
            "ctaShown": session.get("cta_shown", False),
            "ctaClicked": session.get("cta_clicked", False),
            "contactCaptured": session.get("contact_captured", False),
            "preferences": preferences,
            "propertiesDiscussed": properties_discussed,
            "lastActivity": session.get("last_activity").isoformat() if session.get("last_activity") else None
        },
        "insights": {
            "riskTopicsDiscussed": risk_topics,
            "topQuestions": top_questions,
            "objections": objections,
            "suggestedAction": suggested_action,
            "followUpMessage": follow_up_message
        }
    }


def _get_session(
    lead_id: int = None,
    profile_id: int = None,
    share_id: str = None
) -> Optional[Dict[str, Any]]:
    """Get the most recent chatbot session by any of the linking fields."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Build query based on available identifiers
            conditions = []
            params = []

            if lead_id:
                conditions.append("lead_id = %s")
                params.append(lead_id)
            if profile_id:
                conditions.append("profile_id = %s")
                params.append(profile_id)
            if share_id:
                conditions.append("share_id = %s")
                params.append(share_id)

            if not conditions:
                return None

            query = f"""
                SELECT
                    session_id, share_id, profile_id, lead_id,
                    buyer_identity_state, contact_captured, contact_id,
                    preferences, properties_discussed,
                    cta_shown, cta_clicked, message_count,
                    created_at, last_activity
                FROM chatbot_sessions
                WHERE {' OR '.join(conditions)}
                ORDER BY last_activity DESC
                LIMIT 1
            """

            cur.execute(query, params)
            return fetchone_dict(cur)


def _get_session_messages(session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Get messages for a session."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id, session_id, role, content,
                    intent, intent_confidence, claims,
                    created_at
                FROM chatbot_messages
                WHERE session_id = %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (session_id, limit))

            return fetchall_dicts(cur)


def _parse_preferences(preferences_data) -> Dict[str, Any]:
    """Parse preferences from JSONB field."""
    if not preferences_data:
        return {}

    if isinstance(preferences_data, str):
        try:
            return json.loads(preferences_data)
        except:
            return {}

    return preferences_data if isinstance(preferences_data, dict) else {}


def _extract_risk_topics(messages: List[Dict[str, Any]]) -> List[str]:
    """Extract risk topics discussed from messages."""
    risk_topics_found = set()

    for msg in messages:
        # Check intent
        intent = msg.get("intent", "")
        if intent and "RISK" in intent.upper():
            # Extract specific topic from message content
            content_lower = (msg.get("content") or "").lower()
            for topic in RISK_TOPICS:
                if topic in content_lower:
                    risk_topics_found.add(topic)

        # Also check message content directly
        content_lower = (msg.get("content") or "").lower()
        for topic in RISK_TOPICS:
            if topic in content_lower and msg.get("role") == "user":
                risk_topics_found.add(topic)

    return list(risk_topics_found)


def _extract_top_questions(messages: List[Dict[str, Any]], max_count: int = 5) -> List[str]:
    """Extract top questions from user messages."""
    questions = []

    for msg in messages:
        if msg.get("role") != "user":
            continue

        content = msg.get("content", "").strip()

        # Check if message is a question
        if "?" in content:
            # Clean up and truncate
            question = content[:200] + "..." if len(content) > 200 else content
            questions.append(question)

        if len(questions) >= max_count:
            break

    return questions


def _extract_objections(messages: List[Dict[str, Any]]) -> List[str]:
    """Extract objections/concerns from user messages."""
    objections = []
    concern_keywords = [
        "concern", "worry", "worried", "problem", "issue",
        "don't like", "not sure", "hesitant", "expensive",
        "too much", "too far", "too small", "too old"
    ]

    for msg in messages:
        if msg.get("role") != "user":
            continue

        content_lower = (msg.get("content") or "").lower()

        for keyword in concern_keywords:
            if keyword in content_lower:
                # Extract the sentence containing the concern
                content = msg.get("content", "").strip()
                objection = content[:150] + "..." if len(content) > 150 else content
                if objection not in objections:
                    objections.append(objection)
                break

    return objections[:5]  # Max 5 objections


def _calculate_engagement_level(message_count: int) -> str:
    """Calculate engagement level based on message count."""
    if message_count >= 10:
        return "HIGH"
    elif message_count >= 5:
        return "MEDIUM"
    else:
        return "LOW"


def _calculate_readiness(
    message_count: int,
    cta_clicked: bool,
    preferences_count: int,
    contact_captured: bool
) -> str:
    """Calculate buyer readiness score."""
    score = 0

    if cta_clicked:
        score += 3
    if message_count >= 5:
        score += 1
    if preferences_count >= 2:
        score += 1
    if contact_captured:
        score += 2

    if score >= 5:
        return "HIGH"
    elif score >= 2:
        return "MEDIUM"
    else:
        return "LOW"


def _generate_suggested_action(
    engagement_level: str,
    readiness: str,
    risk_topics: List[str],
    cta_clicked: bool,
    properties_discussed: List[str]
) -> str:
    """Generate a suggested next action for the agent."""
    actions = []

    # High priority: CTA clicked
    if cta_clicked:
        actions.append("Follow up immediately - buyer clicked CTA and is ready to engage")

    # Risk topics need verification
    if risk_topics:
        topics_str = ", ".join(risk_topics)
        actions.append(f"Verify {topics_str} details before next conversation")

    # Properties discussed
    if properties_discussed:
        if len(properties_discussed) == 1:
            actions.append(f"Prepare detailed info on property {properties_discussed[0]}")
        else:
            actions.append(f"Prepare comparison of {len(properties_discussed)} properties discussed")

    # Engagement-based suggestions
    if readiness == "HIGH" and not cta_clicked:
        actions.append("Buyer is highly engaged - proactively reach out to schedule showing")
    elif engagement_level == "LOW":
        actions.append("Send personalized follow-up to re-engage buyer")

    if not actions:
        actions.append("Review conversation and prepare personalized follow-up")

    return " | ".join(actions)


def sync_chat_preferences_to_profile(profile_id: int) -> bool:
    """
    Sync preferences captured in chatbot session to buyer profile.
    Called when generating buyer report to ensure profile reflects chat preferences.

    Returns True if preferences were synced, False otherwise.
    """
    # Get session for this profile
    session = _get_session(profile_id=profile_id)

    if not session or not session.get("preferences"):
        return False

    chat_prefs = _parse_preferences(session.get("preferences"))
    if not chat_prefs:
        return False

    # Build update fields from chat preferences
    updates = {}

    if chat_prefs.get("bedrooms"):
        updates["bedrooms"] = chat_prefs["bedrooms"]

    if chat_prefs.get("budget_min"):
        updates["budget_min"] = chat_prefs["budget_min"]

    if chat_prefs.get("budget_max"):
        updates["budget_max"] = chat_prefs["budget_max"]

    if chat_prefs.get("home_type"):
        updates["home_type"] = chat_prefs["home_type"]

    if chat_prefs.get("priority"):
        updates["priority"] = chat_prefs["priority"]

    if chat_prefs.get("preferred_locations"):
        # Store as JSONB array
        updates["preferred_locations"] = chat_prefs["preferred_locations"]

    if not updates:
        return False

    # Update buyer profile with chat preferences
    # Only update fields that are currently NULL to avoid overwriting agent edits
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Build dynamic update query for NULL fields only
                set_clauses = []
                params = []

                for field, value in updates.items():
                    set_clauses.append(f"{field} = COALESCE({field}, %s)")
                    params.append(value)

                params.append(profile_id)

                query = f"""
                    UPDATE buyer_profiles
                    SET {', '.join(set_clauses)},
                        updated_at = NOW()
                    WHERE id = %s
                """

                cur.execute(query, params)

                logger.info(f"[SYNC_PREFS] Synced {len(updates)} preferences to profile {profile_id}")
                return True

    except Exception as e:
        logger.error(f"[SYNC_PREFS] Failed to sync preferences to profile {profile_id}: {e}")
        return False


def _generate_follow_up_message(
    buyer_name: str = None,
    preferences: Dict[str, Any] = None,
    risk_topics: List[str] = None,
    top_questions: List[str] = None,
    properties_discussed: List[str] = None
) -> str:
    """Generate a ready-to-use follow-up message."""
    name = buyer_name or "there"

    # Start with greeting
    message = f"Hi {name}!\n\n"

    # Reference their preferences if captured
    if preferences:
        pref_parts = []
        if preferences.get("bedrooms"):
            pref_parts.append(f"{preferences['bedrooms']}+ bedrooms")
        if preferences.get("budget_max"):
            pref_parts.append(f"budget around ${preferences['budget_max']:,}")

        if pref_parts:
            message += f"Thanks for sharing what you're looking for - {', '.join(pref_parts)}. "

    # Address risk topics
    if risk_topics:
        topics_str = " and ".join(risk_topics[:2])
        message += f"I've looked into the {topics_str} details you asked about. "

    # Reference questions
    if top_questions and len(top_questions) > 0:
        message += "I have answers to your questions and would love to discuss them. "

    # Properties discussed
    if properties_discussed and len(properties_discussed) > 0:
        if len(properties_discussed) == 1:
            message += f"\n\nWould you like to schedule a showing for the property we discussed? "
        else:
            message += f"\n\nI can arrange showings for the {len(properties_discussed)} properties you liked. "

    message += "\n\nLet me know what works best for you!"

    return message
