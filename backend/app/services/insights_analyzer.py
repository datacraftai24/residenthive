"""
Buyer Insights Analyzer Service

Analyzes chat history data using LLMs to generate insights about buyer
preferences, interests, and behavior.

IMPORTANT: Chat data is stored in:
- ai.agno_sessions (runs JSON field contains conversations)
- ai.agno_memories (summarized user memories)
- profile_chat_links (links profile_id -> client_identifier used in chat)
- property_interactions (property saves/likes)
"""

import os
import json
from typing import Dict, Any, List, Optional
from openai import OpenAI
from ..db import get_conn, fetchall_dicts, fetchone_dict


def fetch_chat_data(profile_id: int) -> Dict[str, Any]:
    """
    Fetch all chat-related data for a buyer profile.
    
    Data sources:
    - profile_chat_links: Get client_identifier for this profile
    - ai.agno_sessions: Chat conversations (runs JSON)
    - ai.agno_memories: User memories/summaries
    - property_interactions: Saved/liked properties
    
    Returns:
        Dictionary containing sessions, messages, interactions, and memories
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Step 1: Get client_identifier from profile_chat_links
            cur.execute(
                """
                SELECT client_identifier, buyer_name, buyer_email
                FROM profile_chat_links
                WHERE profile_id = %s
                """,
                (profile_id,)
            )
            chat_link = fetchone_dict(cur)
            
            client_identifier = None
            if chat_link:
                client_identifier = chat_link.get("client_identifier")
            
            # Step 2: Fetch agno_sessions that contain this client_identifier in their runs
            # The client_identifier appears in the message context
            sessions = []
            all_messages = []
            
            if client_identifier:
                # Query all sessions and filter by client_identifier in runs JSON
                cur.execute(
                    """
                    SELECT session_id, user_id, session_type, runs, summary, 
                           metadata, created_at, updated_at
                    FROM ai.agno_sessions
                    ORDER BY created_at DESC
                    """
                )
                raw_sessions = fetchall_dicts(cur)
                
                # Filter sessions that contain this client_identifier
                for session in raw_sessions:
                    runs_data = session.get("runs")
                    if runs_data:
                        # Parse runs JSON if it's a string
                        if isinstance(runs_data, str):
                            try:
                                runs_data = json.loads(runs_data)
                            except:
                                runs_data = []
                        
                        # Check if any run contains our client_identifier
                        runs_str = json.dumps(runs_data) if runs_data else ""
                        if client_identifier in runs_str:
                            sessions.append({
                                "session_id": session["session_id"],
                                "user_id": session.get("user_id"),
                                "session_type": session.get("session_type"),
                                "created_at": session.get("created_at"),
                                "updated_at": session.get("updated_at"),
                                "summary": session.get("summary"),
                                "runs": runs_data
                            })
                            
                            # Extract messages from runs
                            if isinstance(runs_data, list):
                                for run in runs_data:
                                    run_messages = run.get("messages", [])
                                    for msg in run_messages:
                                        if msg.get("role") in ["user", "assistant"]:
                                            all_messages.append({
                                                "session_id": session["session_id"],
                                                "role": msg.get("role"),
                                                "content": msg.get("content", "")[:2000],  # Truncate long content
                                                "created_at": msg.get("created_at")
                                            })
            
            # Step 3: Fetch agno_memories for this user
            memories = []
            cur.execute(
                """
                SELECT memory_id, memory, input, topics, created_at, updated_at
                FROM ai.agno_memories
                ORDER BY created_at DESC
                LIMIT 10
                """
            )
            raw_memories = fetchall_dicts(cur)
            for mem in raw_memories:
                mem_input = mem.get("input", "")
                # Filter memories relevant to this client_identifier
                if client_identifier and client_identifier in str(mem_input):
                    memory_content = mem.get("memory")
                    if isinstance(memory_content, str):
                        try:
                            memory_content = json.loads(memory_content)
                        except:
                            pass
                    memories.append({
                        "memory_id": mem.get("memory_id"),
                        "memory": memory_content,
                        "topics": mem.get("topics"),
                        "created_at": mem.get("created_at")
                    })
            
            # Step 4: Fetch property_interactions via chat_sessions
            # First get session_id from chat_sessions for this profile
            cur.execute(
                """
                SELECT id as session_id FROM chat_sessions
                WHERE profile_id = %s
                """,
                (profile_id,)
            )
            chat_session = fetchone_dict(cur)
            
            interactions = []
            if chat_session:
                session_id = chat_session.get("session_id")
                cur.execute(
                    """
                    SELECT id, listing_id, interaction_type, rating, reason, 
                           emotional_response, created_at
                    FROM property_interactions
                    WHERE session_id = %s
                    ORDER BY created_at DESC
                    """,
                    (session_id,)
                )
                interactions = fetchall_dicts(cur)
    
    return {
        "client_identifier": client_identifier,
        "sessions": sessions,
        "messages": all_messages,
        "memories": memories,
        "interactions": interactions
    }


def compute_statistics(chat_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute aggregate statistics from chat data.
    """
    sessions = chat_data.get("sessions", [])
    messages = chat_data.get("messages", [])
    interactions = chat_data.get("interactions", [])
    memories = chat_data.get("memories", [])
    
    # Session-level stats
    total_sessions = len(sessions)
    total_messages = len(messages)
    total_interactions = len(interactions)
    total_memories = len(memories)
    
    # Message breakdown by role
    user_messages = [m for m in messages if m.get("role") == "user"]
    assistant_messages = [m for m in messages if m.get("role") == "assistant"]
    
    # Property interaction stats
    saved = [i for i in interactions if i.get("interaction_type") == "saved"]
    liked = [i for i in interactions if i.get("interaction_type") == "like"]
    disliked = [i for i in interactions if i.get("interaction_type") == "dislike"]
    favorited = [i for i in interactions if i.get("interaction_type") == "favorite"]
    
    # Extract topics from memories
    all_topics = []
    for mem in memories:
        topics = mem.get("topics")
        if topics:
            if isinstance(topics, str):
                try:
                    topics = json.loads(topics)
                except:
                    topics = []
            if isinstance(topics, list):
                all_topics.extend(topics)
    
    # Count topic occurrences
    topic_counts = {}
    for topic in all_topics:
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
    
    return {
        "totalSessions": total_sessions,
        "totalMessages": total_messages,
        "totalUserMessages": len(user_messages),
        "totalAssistantMessages": len(assistant_messages),
        "totalInteractions": total_interactions,
        "totalMemories": total_memories,
        "savedCount": len(saved),
        "likesCount": len(liked),
        "dislikesCount": len(disliked),
        "favoritesCount": len(favorited),
        "topicBreakdown": topic_counts,
        # Placeholder values since we don't have these in agno_sessions
        "avgEngagementScore": min(total_messages * 0.5, 10),
        "latestDecisionStage": "exploring" if total_sessions > 0 else "unknown",
        "sentimentTrend": "neutral",
        "avgSentiment": 0.0,
        "totalReturnVisits": max(0, total_sessions - 1)
    }


def generate_llm_insights(chat_data: Dict[str, Any], statistics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Use OpenAI to generate insights from chat history.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[INSIGHTS ANALYZER] OpenAI API key not configured")
        return _generate_fallback_insights(chat_data, statistics)
    
    messages = chat_data.get("messages", [])
    interactions = chat_data.get("interactions", [])
    memories = chat_data.get("memories", [])
    
    # If no chat data, return empty insights
    if not messages and not memories:
        return _generate_empty_insights()
    
    # Build conversation summary for LLM (limit to recent 30 messages)
    recent_messages = messages[-30:] if len(messages) > 30 else messages
    conversation_parts = []
    for msg in recent_messages:
        role = "Buyer" if msg.get("role") == "user" else "Assistant"
        content = msg.get("content", "")[:500]  # Truncate long messages
        if content:
            conversation_parts.append(f"{role}: {content}")
    
    conversation_text = "\n".join(conversation_parts) if conversation_parts else "No conversation history available."
    
    # Build memory summary
    memory_summary = ""
    if memories:
        memory_texts = []
        for mem in memories[:5]:  # Limit to 5 memories
            mem_content = mem.get("memory", "")
            if isinstance(mem_content, dict):
                mem_content = json.dumps(mem_content)
            if mem_content:
                memory_texts.append(str(mem_content)[:200])
        if memory_texts:
            memory_summary = f"\nUser Memories:\n" + "\n".join(memory_texts)
    
    # Build interaction summary
    interaction_summary = ""
    if interactions:
        saved_ids = [i.get("listing_id") for i in interactions if i.get("interaction_type") == "saved"][:5]
        if saved_ids:
            interaction_summary = f"\nSaved Properties: {len(interactions)} properties saved (IDs: {', '.join(saved_ids[:5])}...)"
    
    client = OpenAI(api_key=api_key)
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-2025-04-14")
    
    system_prompt = """You are an expert real estate analyst reviewing a buyer's chat history with an AI property assistant.

Your job is to extract actionable insights for the real estate agent about this buyer's preferences, behavior, and readiness to purchase.

Analyze the conversation and return a JSON object with these exact fields:

{
  "topPreferences": ["array of 3-5 features/things the buyer wants most"],
  "dealbreakers": ["array of 2-3 things the buyer wants to avoid"],
  "emotionalState": "one of: excited, cautious, urgent, analytical, undecided",
  "readinessScore": 7,
  "readinessReasoning": "Brief explanation of why this score",
  "keyQuotes": ["1-2 direct quotes from the buyer that reveal priorities"],
  "recommendedActions": ["2-3 suggested actions for the agent"],
  "buyerPersona": "A 1-2 sentence description of this buyer type"
}

Be specific and actionable. Base everything on the actual conversation content. If limited data, make reasonable inferences."""

    user_prompt = f"""Analyze this buyer's chat history:

CONVERSATION:
{conversation_text}
{memory_summary}
{interaction_summary}

STATISTICS:
- Chat sessions: {statistics['totalSessions']}
- Total messages: {statistics['totalMessages']}
- Properties saved: {statistics['savedCount']}
- Properties liked: {statistics['likesCount']}

Return JSON only, no markdown or extra text."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1000
        )
        
        content = response.choices[0].message.content.strip()
        insights = json.loads(content)
        
        # Validate required fields
        required_fields = ["topPreferences", "dealbreakers", "emotionalState", 
                         "readinessScore", "keyQuotes", "recommendedActions"]
        for field in required_fields:
            if field not in insights:
                if field in ["topPreferences", "dealbreakers", "keyQuotes", "recommendedActions"]:
                    insights[field] = []
                else:
                    insights[field] = "unknown"
        
        # Ensure readinessScore is a number
        if not isinstance(insights.get("readinessScore"), (int, float)):
            insights["readinessScore"] = 5
        
        print(f"[INSIGHTS ANALYZER] Generated LLM insights successfully")
        return insights
        
    except json.JSONDecodeError as e:
        print(f"[INSIGHTS ANALYZER] JSON parse error: {e}")
        return _generate_fallback_insights(chat_data, statistics)
    except Exception as e:
        print(f"[INSIGHTS ANALYZER] LLM error: {e}")
        return _generate_fallback_insights(chat_data, statistics)


def _generate_empty_insights() -> Dict[str, Any]:
    """Return empty insights when no chat data exists."""
    return {
        "topPreferences": [],
        "dealbreakers": [],
        "emotionalState": "unknown",
        "readinessScore": 0,
        "readinessReasoning": "No chat history available yet",
        "keyQuotes": [],
        "recommendedActions": ["Encourage the buyer to start chatting with the AI assistant"],
        "buyerPersona": "New buyer - no conversation data yet"
    }


def _generate_fallback_insights(chat_data: Dict[str, Any], statistics: Dict[str, Any]) -> Dict[str, Any]:
    """Generate basic insights from statistics when LLM is unavailable."""
    saved_count = statistics.get("savedCount", 0)
    message_count = statistics.get("totalMessages", 0)
    
    # Estimate readiness based on engagement
    readiness = 3
    if message_count > 20:
        readiness = 7
    elif message_count > 10:
        readiness = 5
    elif message_count > 5:
        readiness = 4
    
    if saved_count > 10:
        readiness = min(readiness + 2, 10)
    elif saved_count > 5:
        readiness = min(readiness + 1, 10)
    
    # Extract preferences from memories if available
    preferences = []
    memories = chat_data.get("memories", [])
    for mem in memories:
        memory_content = mem.get("memory", "")
        if memory_content:
            preferences.append(str(memory_content)[:100])
    
    return {
        "topPreferences": preferences[:3] if preferences else ["Unable to analyze - LLM unavailable"],
        "dealbreakers": ["Unable to analyze - LLM unavailable"],
        "emotionalState": "analytical",
        "readinessScore": readiness,
        "readinessReasoning": f"Based on {message_count} messages and {saved_count} saved properties",
        "keyQuotes": [],
        "recommendedActions": ["Review chat history manually", "Follow up on saved properties"],
        "buyerPersona": "Analysis pending - please try again later"
    }


def generate_buyer_insights(profile_id: int) -> Dict[str, Any]:
    """
    Main entry point: Generate comprehensive buyer insights for a profile.
    
    Args:
        profile_id: The buyer profile ID
        
    Returns:
        Complete insights object with statistics and LLM analysis
    """
    print(f"[INSIGHTS ANALYZER] Generating insights for profile {profile_id}")
    
    # Step 1: Fetch all chat data from correct tables
    chat_data = fetch_chat_data(profile_id)
    
    # Step 2: Compute statistics
    statistics = compute_statistics(chat_data)
    
    # Step 3: Generate LLM insights (only if there's chat data)
    has_data = len(chat_data.get("messages", [])) > 0 or len(chat_data.get("memories", [])) > 0
    if has_data:
        llm_insights = generate_llm_insights(chat_data, statistics)
    else:
        llm_insights = _generate_empty_insights()
    
    # Step 4: Combine into final response
    result = {
        "profileId": profile_id,
        "hasData": has_data,
        "statistics": statistics,
        "insights": llm_insights,
        "recentInteractions": [
            {
                "listingId": i.get("listing_id"),
                "type": i.get("interaction_type"),
                "reason": i.get("reason"),
                "emotionalResponse": i.get("emotional_response"),
                "createdAt": i.get("created_at")
            }
            for i in chat_data.get("interactions", [])[:10]  # Last 10 interactions
        ],
        # Sentiment history placeholder (not available in agno_sessions)
        "sentimentHistory": []
    }
    
    print(f"[INSIGHTS ANALYZER] Generated insights: {statistics['totalMessages']} messages, {statistics['savedCount']} saved properties")
    return result
