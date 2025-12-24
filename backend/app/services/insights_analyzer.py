"""
Buyer Insights Analyzer Service - PRD Aligned

Generates agent-focused reports following the "Chat → Agent Report" PRD.
Purpose: Answer "Based on what the client actually said and reacted to, what should I do next?"

Data Sources:
- ai.agno_sessions (chat conversations in runs JSON)
- ai.agno_memories (user memory summaries)
- profile_chat_links (profile_id -> client_identifier)
- property_interactions (saved properties)
- repliers_listings (property details)
- buyer_profiles (buyer preferences)
"""

import os
import json
from typing import Dict, Any, List, Optional
from openai import OpenAI
from ..db import get_conn, fetchall_dicts, fetchone_dict


def fetch_report_data(profile_id: int) -> Dict[str, Any]:
    """
    Fetch all data needed for the agent report.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Get buyer profile
            cur.execute(
                """
                SELECT id, name, email, phone, location, buyer_type, budget, budget_min, budget_max,
                       home_type, bedrooms, bathrooms, must_have_features, dealbreakers,
                       preferred_areas, budget_flexibility, location_flexibility, timing_flexibility,
                       ai_summary, decision_drivers, constraints, nice_to_haves
                FROM buyer_profiles
                WHERE id = %s
                """,
                (profile_id,)
            )
            buyer_profile = fetchone_dict(cur)
            
            # 2. Get client_identifier from profile_chat_links
            cur.execute(
                """
                SELECT client_identifier, buyer_name, buyer_email
                FROM profile_chat_links
                WHERE profile_id = %s
                """,
                (profile_id,)
            )
            chat_link = fetchone_dict(cur)
            client_identifier = chat_link.get("client_identifier") if chat_link else None
            
            # 3. Get saved properties with details (top 5)
            cur.execute(
                """
                SELECT id as session_id FROM chat_sessions
                WHERE profile_id = %s
                """,
                (profile_id,)
            )
            chat_session = fetchone_dict(cur)
            
            saved_properties = []
            if chat_session:
                session_id = chat_session.get("session_id")
                cur.execute(
                    """
                    SELECT pi.listing_id, pi.interaction_type, pi.created_at,
                           rl.address, rl.city, rl.price, rl.bedrooms, rl.bathrooms,
                           rl.square_feet, rl.property_type, rl.description
                    FROM property_interactions pi
                    LEFT JOIN repliers_listings rl ON pi.listing_id = rl.id
                    WHERE pi.session_id = %s
                    ORDER BY pi.created_at DESC
                    LIMIT 5
                    """,
                    (session_id,)
                )
                saved_properties = fetchall_dicts(cur)
            
            # 4. Get chat history from agno_sessions
            messages = []
            if client_identifier:
                cur.execute(
                    """
                    SELECT session_id, runs, created_at
                    FROM ai.agno_sessions
                    ORDER BY created_at DESC
                    """
                )
                raw_sessions = fetchall_dicts(cur)
                
                for session in raw_sessions:
                    runs_data = session.get("runs")
                    if runs_data:
                        if isinstance(runs_data, str):
                            try:
                                runs_data = json.loads(runs_data)
                            except:
                                runs_data = []
                        
                        runs_str = json.dumps(runs_data) if runs_data else ""
                        if client_identifier in runs_str:
                            if isinstance(runs_data, list):
                                for run in runs_data:
                                    run_messages = run.get("messages", [])
                                    for msg in run_messages:
                                        if msg.get("role") in ["user", "assistant"]:
                                            content = msg.get("content", "")
                                            if content and len(content) > 10:
                                                messages.append({
                                                    "role": msg.get("role"),
                                                    "content": content[:1500],
                                                    "created_at": msg.get("created_at")
                                                })
            
            # 5. Get memories
            memories = []
            if client_identifier:
                cur.execute(
                    """
                    SELECT memory, topics FROM ai.agno_memories
                    ORDER BY created_at DESC LIMIT 5
                    """
                )
                raw_memories = fetchall_dicts(cur)
                for mem in raw_memories:
                    mem_content = mem.get("memory", "")
                    if isinstance(mem_content, str):
                        try:
                            mem_content = json.loads(mem_content)
                        except:
                            pass
                    memories.append(mem_content)
    
    return {
        "buyer_profile": buyer_profile,
        "client_identifier": client_identifier,
        "saved_properties": saved_properties,
        "messages": messages,
        "memories": memories
    }


def build_conversation_text(messages: List[Dict], max_messages: int = 40) -> str:
    """Build conversation text for LLM analysis."""
    recent = messages[-max_messages:] if len(messages) > max_messages else messages
    parts = []
    for msg in recent:
        role = "BUYER" if msg.get("role") == "user" else "ASSISTANT"
        content = msg.get("content", "")[:600]
        if content:
            parts.append(f"{role}: {content}")
    return "\n\n".join(parts) if parts else "No conversation history."


def build_properties_text(properties: List[Dict]) -> str:
    """Build property list for LLM analysis."""
    if not properties:
        return "No properties saved yet."
    
    parts = []
    for i, prop in enumerate(properties, 1):
        address = prop.get("address", "Unknown")
        city = prop.get("city", "")
        price = prop.get("price", 0)
        beds = prop.get("bedrooms", "?")
        baths = prop.get("bathrooms", "?")
        sqft = prop.get("square_feet", "?")
        
        parts.append(f"""Property {i}: {address}, {city}
  - Price: ${price:,} | Beds: {beds} | Baths: {baths} | Sqft: {sqft}
  - Listing ID: {prop.get('listing_id', 'N/A')}""")
    
    return "\n".join(parts)


def generate_prd_report(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate PRD-aligned agent report using LLM.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[INSIGHTS] OpenAI API key not configured")
        return _generate_fallback_report(data)
    
    messages = data.get("messages", [])
    properties = data.get("saved_properties", [])
    buyer_profile = data.get("buyer_profile", {})
    memories = data.get("memories", [])
    
    if not messages and not memories:
        return _generate_empty_report()
    
    conversation_text = build_conversation_text(messages)
    properties_text = build_properties_text(properties)
    
    # Build buyer context from profile
    buyer_context = ""
    if buyer_profile:
        buyer_context = f"""
BUYER PROFILE DATA:
- Name: {buyer_profile.get('name', 'Unknown')}
- Location: {buyer_profile.get('location', 'Not specified')}
- Budget: ${buyer_profile.get('budget_min', 0):,} - ${buyer_profile.get('budget_max', 0):,}
- Bedrooms: {buyer_profile.get('bedrooms', '?')}
- Home Type: {buyer_profile.get('home_type', 'Not specified')}
- Must-Haves: {buyer_profile.get('must_have_features', '[]')}
- Dealbreakers: {buyer_profile.get('dealbreakers', '[]')}
"""
    
    client = OpenAI(api_key=api_key)
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-2025-04-14")
    
    system_prompt = """You are a real estate analyst creating a report for an agent about their buyer client.

Your report must help the agent answer: "What should I do next for this client?"

RULES:
- Be specific and actionable
- No AI buzzwords or vague language
- Every insight must be traceable to something the buyer said or did
- Use plain English the agent can act on immediately
- If uncertain, say "Likely" or "Assumed" - never pretend to be certain

Return a JSON object with this EXACT structure:

{
  "clientSnapshot": {
    "buyerType": "Family buyer",
    "priceSensitivity": "Medium",
    "urgencySignal": "Shortlisting",
    "decisionDrivers": ["Space", "Location", "Schools"]
  },
  "mustHaves": [
    {"item": "At least 3 bedrooms", "confidence": "Confirmed", "sourceQuote": "We need at least 3 bedrooms for the kids"}
  ],
  "dealbreakers": [
    {"item": "Busy roads", "confidence": "Likely", "sourceQuote": "I'm worried about traffic noise"}
  ],
  "propertyInterest": [
    {
      "listingId": "12345",
      "address": "123 Main St",
      "interestLevel": "Hot",
      "positiveSignals": ["Asked about showing times"],
      "negativeSignals": ["Concerned about price"],
      "questionsAsked": ["What are the HOA fees?"],
      "agentRecommendation": "Book showing"
    }
  ],
  "crossPropertyInsights": [
    "Client prefers larger yards across all properties viewed"
  ],
  "suggestedActions": [
    "Schedule showing for 123 Main St",
    "Send price comps for the area"
  ]
}

FIELD GUIDELINES:
- buyerType: "Family buyer" | "Investor" | "First-time buyer" | "Downsizer" | "Unknown"
- priceSensitivity: "Low" | "Medium" | "High"
- urgencySignal: "Browsing" | "Shortlisting" | "Ready to act"
- confidence: "Confirmed" | "Likely" | "Assumed"
- interestLevel: "Hot" | "Warm" | "Cold"
- agentRecommendation: "Book showing" | "Send comps" | "Clarify concern" | "Replace with similar" | "Follow up"

Keep mustHaves to max 5, dealbreakers to max 3, suggestedActions to max 4."""

    user_prompt = f"""Analyze this buyer's chat history and saved properties to create an agent report.

{buyer_context}

SAVED PROPERTIES (Top 5):
{properties_text}

CONVERSATION HISTORY:
{conversation_text}

Generate the JSON report following the exact structure specified. Focus on actionable insights for the agent."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=2000
        )
        
        content = response.choices[0].message.content.strip()
        report = json.loads(content)
        
        # Validate and set defaults
        report = _validate_report(report, properties)
        
        print("[INSIGHTS] Generated PRD-aligned report successfully")
        return report
        
    except Exception as e:
        print(f"[INSIGHTS] LLM error: {e}")
        return _generate_fallback_report(data)


def _validate_report(report: Dict[str, Any], properties: List[Dict]) -> Dict[str, Any]:
    """Validate and fill missing fields in report."""
    
    # Ensure clientSnapshot exists
    if "clientSnapshot" not in report:
        report["clientSnapshot"] = {
            "buyerType": "Unknown",
            "priceSensitivity": "Medium",
            "urgencySignal": "Browsing",
            "decisionDrivers": []
        }
    
    # Ensure arrays exist
    for field in ["mustHaves", "dealbreakers", "propertyInterest", "crossPropertyInsights", "suggestedActions"]:
        if field not in report or not isinstance(report[field], list):
            report[field] = []
    
    # Limit arrays per PRD
    report["mustHaves"] = report["mustHaves"][:5]
    report["dealbreakers"] = report["dealbreakers"][:3]
    report["suggestedActions"] = report["suggestedActions"][:4]
    
    # Ensure decision drivers is max 3
    if "decisionDrivers" in report["clientSnapshot"]:
        report["clientSnapshot"]["decisionDrivers"] = report["clientSnapshot"]["decisionDrivers"][:3]
    
    return report


def _generate_empty_report() -> Dict[str, Any]:
    """Return empty report when no data exists."""
    return {
        "clientSnapshot": {
            "buyerType": "Unknown",
            "priceSensitivity": "Unknown",
            "urgencySignal": "Browsing",
            "decisionDrivers": []
        },
        "mustHaves": [],
        "dealbreakers": [],
        "propertyInterest": [],
        "crossPropertyInsights": [],
        "suggestedActions": [
            "Encourage the buyer to start chatting with the AI assistant"
        ]
    }


def _generate_fallback_report(data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate basic report when LLM is unavailable."""
    buyer_profile = data.get("buyer_profile", {})
    properties = data.get("saved_properties", [])
    
    # Extract what we can from profile
    must_haves = []
    if buyer_profile:
        mh_raw = buyer_profile.get("must_have_features", "[]")
        if isinstance(mh_raw, str):
            try:
                mh_list = json.loads(mh_raw)
                must_haves = [{"item": item, "confidence": "Confirmed", "sourceQuote": "From profile"} for item in mh_list[:5]]
            except:
                pass
    
    dealbreakers = []
    if buyer_profile:
        db_raw = buyer_profile.get("dealbreakers", "[]")
        if isinstance(db_raw, str):
            try:
                db_list = json.loads(db_raw)
                dealbreakers = [{"item": item, "confidence": "Confirmed", "sourceQuote": "From profile"} for item in db_list[:3]]
            except:
                pass
    
    # Build property interest from saved properties
    property_interest = []
    for prop in properties[:5]:
        property_interest.append({
            "listingId": prop.get("listing_id", ""),
            "address": f"{prop.get('address', 'Unknown')}, {prop.get('city', '')}",
            "interestLevel": "Warm",
            "positiveSignals": ["Saved by buyer"],
            "negativeSignals": [],
            "questionsAsked": [],
            "agentRecommendation": "Follow up on interest"
        })
    
    return {
        "clientSnapshot": {
            "buyerType": buyer_profile.get("buyer_type", "Unknown") if buyer_profile else "Unknown",
            "priceSensitivity": "Medium",
            "urgencySignal": "Browsing",
            "decisionDrivers": []
        },
        "mustHaves": must_haves,
        "dealbreakers": dealbreakers,
        "propertyInterest": property_interest,
        "crossPropertyInsights": ["Analysis requires LLM - please try again later"],
        "suggestedActions": [
            "Review saved properties with buyer",
            "Confirm must-haves and dealbreakers"
        ]
    }


def generate_buyer_insights(profile_id: int) -> Dict[str, Any]:
    """
    Main entry point: Generate PRD-aligned buyer insights report.
    
    Args:
        profile_id: The buyer profile ID
        
    Returns:
        Complete PRD-aligned report for the agent
    """
    print(f"[INSIGHTS] Generating PRD report for profile {profile_id}")
    
    # Fetch all data
    data = fetch_report_data(profile_id)
    
    # Check if we have any data
    has_data = (
        len(data.get("messages", [])) > 0 or 
        len(data.get("memories", [])) > 0 or
        len(data.get("saved_properties", [])) > 0
    )
    
    # Generate report
    if has_data:
        report = generate_prd_report(data)
    else:
        report = _generate_empty_report()
    
    # Build final response
    result = {
        "profileId": profile_id,
        "hasData": has_data,
        "report": report,
        # Include raw counts for header
        "stats": {
            "messagesAnalyzed": len(data.get("messages", [])),
            "propertiesSaved": len(data.get("saved_properties", []))
        }
    }
    
    print(f"[INSIGHTS] Report generated: {result['stats']['messagesAnalyzed']} messages, {result['stats']['propertiesSaved']} properties")
    return result
