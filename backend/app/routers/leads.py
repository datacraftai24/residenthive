"""
Lead Intake Router

This router handles lead processing for quick agent responses.
Key principle: Unknown-safe extraction - return null for missing fields, never hallucinate.

RESPONSIBILITY BOUNDARY:
============================================================
DETERMINISTIC LAYER - Source of truth for:
  - role (buyer_lead, investor, agent, unknown)
  - leadType (property_specific, area_search, general)
  - intentScore (0-100)
  - intentReasons
  - source (auto-detected)

LLM output MUST NOT override these values.
============================================================
LLM LAYER - Source of truth for:
  - extracted fields (name, email, budget, etc.)
  - hints (soft signals)
  - suggestedMessage
  - clarifyingQuestion (0-1 only)

LLM must return null for missing fields, never guess.
============================================================
"""

import re
import json
import logging
from typing import Optional, List, Tuple
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from openai import OpenAI

from ..models import (
    Lead, LeadCreate, LeadUpdate, LeadExtractionRequest,
    LeadExtractionResponse, LeadCard, LeadClassification, LeadExtracted
)
from ..db import get_conn, fetchone_dict, fetchall_dicts
from ..auth import get_current_agent_id

router = APIRouter(prefix="/api", tags=["leads"])
logger = logging.getLogger(__name__)

# OpenAI client
client = OpenAI()

# Constants
MAX_MESSAGE_LENGTH = 400
DEDUPE_WINDOW_MINUTES = 5
DEDUPE_CONTACT_DAYS = 7


# ============================================================
# DETERMINISTIC CLASSIFICATION
# ============================================================

def normalize_for_dedupe(text: str) -> str:
    """Normalize whitespace for comparison - trim + collapse spaces."""
    return re.sub(r'\s+', ' ', text.strip())


def detect_source(text: str) -> str:
    """Auto-detect lead source from text content."""
    text_lower = text.lower()
    patterns = {
        "zillow": ["zillow", "zestimate"],
        "redfin": ["redfin"],
        "google": ["google", "found you online", "searched online"],
        "referral": ["referred", "friend told", "colleague recommended", "my agent"]
    }
    for source, keywords in patterns.items():
        if any(kw in text_lower for kw in keywords):
            return source
    return "unknown"


def detect_property_address_in_text(text: str) -> bool:
    """Detect if text contains a property address pattern."""
    # Common address patterns:
    # "123 Main St", "15 Beacon St", "456 Oak Avenue", etc.
    address_pattern = r'\d+\s+[A-Za-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle)\b'
    return bool(re.search(address_pattern, text, re.IGNORECASE))


def parse_address_from_text(text: str) -> Optional[dict]:
    """
    Extract address components from lead text.
    Returns: {"streetNumber": "15", "streetName": "Beacon St", "city": "Worcester", "state": "MA"} or None
    """
    # Pattern: street address followed by city, state
    # Examples:
    # - "15 Beacon St, Worcester MA"
    # - "15 Beacon St, Worcester, MA"
    # - "123 Main Street Worcester Massachusetts"

    # State abbreviations and full names
    states = {
        "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
        "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
        "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
        "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
        "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
        "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
        "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
        "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
        "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
        "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
        "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
        "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
        "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia"
    }

    # Build state pattern (abbrev or full name)
    state_abbrevs = "|".join(states.keys())
    state_names = "|".join(states.values())
    state_pattern = f"({state_abbrevs}|{state_names})"

    # Street suffix pattern
    street_suffixes = r"(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle)"

    # Full pattern: "123 Street Name Suffix, City, ST" - capture number and street name separately
    full_pattern = (
        r'(\d+)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?\s+' + street_suffixes + r')'  # Street number + name
        r'[,\s]+([A-Za-z]+(?:\s+[A-Za-z]+)?)'  # City
        r'[,\s]+' + state_pattern  # State
    )

    match = re.search(full_pattern, text, re.IGNORECASE)
    if match:
        street_number = match.group(1).strip()
        street_name = match.group(2).strip()
        city = match.group(4).strip()
        state_raw = match.group(5).strip()

        # Normalize state to abbreviation
        state = state_raw.upper() if len(state_raw) == 2 else None
        if not state:
            for abbrev, name in states.items():
                if name.lower() == state_raw.lower():
                    state = abbrev
                    break

        return {
            "streetNumber": street_number,
            "streetName": street_name,
            "city": city,
            "state": state
        }

    # Simpler pattern: just extract street address (number + name)
    simple_pattern = r'(\d+)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?\s+' + street_suffixes + r')'
    match = re.search(simple_pattern, text, re.IGNORECASE)
    if match:
        return {
            "streetNumber": match.group(1).strip(),
            "streetName": match.group(2).strip(),
            "city": None,
            "state": None
        }

    return None


def lookup_property_details(text: str, property_address: Optional[str] = None) -> Optional[dict]:
    """
    Look up property details from Repliers API.
    Returns normalized property data or None if not found.
    """
    # Try to parse address from explicit property_address first, then from text
    address_parts = None

    if property_address:
        address_parts = parse_address_from_text(property_address)

    if not address_parts:
        address_parts = parse_address_from_text(text)

    if not address_parts or not address_parts.get("streetName"):
        print("[PROPERTY] No address found to look up")
        return None

    print(f"[PROPERTY] Looking up: {address_parts}")

    try:
        from ..services.repliers import RepliersClient
        client = RepliersClient()

        result = client.lookup_address(
            street_number=address_parts.get("streetNumber"),
            street_name=address_parts["streetName"],
            city=address_parts.get("city"),
            state=address_parts.get("state")
        )

        if result:
            print(f"[PROPERTY] Found: {result.get('address')}, ${result.get('listPrice')}")
        else:
            print("[PROPERTY] No property found")

        return result
    except Exception as e:
        print(f"[PROPERTY] Lookup failed: {e}")
        return None


def classify_lead_deterministic(
    text: str,
    source: str,
    property_url: Optional[str]
) -> dict:
    """
    Deterministic lead classification. No LLM involved.
    Returns role, leadType, and reasons for each.
    """
    text_lower = text.lower()

    # Check for property address in text
    has_address_in_text = detect_property_address_in_text(text)

    # === ROLE CLASSIFICATION ===
    role = "unknown"
    role_reason = "No buyer signals detected"

    # Investor keywords
    investor_keywords = ["cap rate", "roi", "cash flow", "rent", "investment", "returns", "rental income"]
    for kw in investor_keywords:
        if kw in text_lower:
            role = "investor"
            role_reason = f"Contains '{kw}'"
            break

    # Agent keywords (only if not already investor)
    if role == "unknown":
        agent_keywords = ["i'm an agent", "i'm a realtor", "fellow agent", "broker here", "i represent"]
        for kw in agent_keywords:
            if kw in text_lower:
                role = "agent"
                role_reason = "Self-identified as agent"
                break

    # Buyer signals (only if not investor or agent)
    if role == "unknown":
        buyer_keywords = ["tour", "showing", "schedule", "available", "interested", "looking for"]
        buyer_sources = ["zillow", "redfin", "google", "referral"]

        if source in buyer_sources:
            role = "buyer_lead"
            role_reason = f"Lead from {source.title()}"
        elif property_url or has_address_in_text:
            role = "buyer_lead"
            role_reason = "Property address mentioned" if has_address_in_text else "Property URL provided"
        else:
            for kw in buyer_keywords:
                if kw in text_lower:
                    role = "buyer_lead"
                    role_reason = f"Contains '{kw}'"
                    break

    # === LEAD TYPE CLASSIFICATION ===
    lead_type = "general"
    lead_type_reason = "No specific property or requirements"

    if property_url or has_address_in_text:
        lead_type = "property_specific"
        lead_type_reason = "Property address mentioned" if has_address_in_text else "Property URL provided"
    elif re.search(r'\d+\s*(bed|br|bedroom)', text_lower):
        lead_type = "area_search"
        lead_type_reason = "Bedroom requirements mentioned"
    elif re.search(r'\$[\d,]+|budget|price range', text_lower):
        lead_type = "area_search"
        lead_type_reason = "Budget mentioned"

    return {
        "role": role,
        "roleReason": role_reason,
        "leadType": lead_type,
        "leadTypeReason": lead_type_reason
    }


def calculate_intent_score(text: str, lead_type: str) -> Tuple[int, List[str]]:
    """
    Deterministic intent scoring. Higher score = higher buying intent.
    Returns (score, reasons).
    """
    score = 0
    reasons = []
    text_lower = text.lower()

    # +30 tour/showing/schedule (expanded list)
    action_words = [
        "schedule a tour", "schedule a showing", "schedule showing",
        "see the house", "see the property", "see this home",
        "visit the property", "can i see", "when can i",
        "book a showing", "tour it", "viewing",
        "is it still available", "still available",
        "can we come by", "come see it",
        "open house", "walk through"
    ]
    if any(w in text_lower for w in action_words):
        score += 30
        reasons.append("Requested showing (+30)")

    # +20 property-specific
    if lead_type == "property_specific":
        score += 20
        reasons.append("Property-specific inquiry (+20)")

    # +10 budget mentioned (requires number)
    if re.search(r'\$[\d,]+|\d+k|\d+ ?thousand', text_lower):
        score += 10
        reasons.append("Budget mentioned (+10)")

    # +10 bedrooms mentioned (requires number)
    if re.search(r'\d+\s*(bed|br|bedroom)', text_lower):
        score += 10
        reasons.append("Bedrooms mentioned (+10)")

    # +10 timeline mentioned
    timeline_words = ["asap", "this week", "next month", "moving soon", "urgent", "quickly"]
    if any(w in text_lower for w in timeline_words):
        score += 10
        reasons.append("Timeline mentioned (+10)")

    # -20 just browsing
    browsing_words = ["just browsing", "just looking", "not ready", "maybe later", "just curious"]
    if any(w in text_lower for w in browsing_words):
        score -= 20
        reasons.append("Just browsing (-20)")

    return max(0, min(100, score)), reasons


# ============================================================
# LLM EXTRACTION
# ============================================================

LEAD_EXTRACTION_PROMPT = """You are extracting explicit facts from a real estate lead message.

CRITICAL RULES:
1. Only extract what is EXPLICITLY stated in the text
2. Return null for anything not clearly mentioned
3. Never infer, assume, or guess values
4. Extract hints as soft signals (phrases, not facts)

INPUT:
{raw_text}

EXTRACT (return null if not stated):
- name: Buyer's name if given
- email: Email if given
- phone: Phone if given
- location: City/neighborhood if named
- budget: Budget string like "$500K-$600K" if stated
- budgetMin: Number if explicitly mentioned
- budgetMax: Number if explicitly mentioned
- bedrooms: Number ONLY if stated with a digit (e.g., "3 bed")
- bathrooms: Number ONLY if stated with a digit
- homeType: Property type if mentioned (condo, townhouse, etc.)
- timeline: Timeline if mentioned ("this weekend", "ASAP", "next month")
- hints: Soft signals like ["good schools", "quiet area", "close to transit"]

FORBIDDEN (never generate):
- School ratings or assignments
- Commute times
- Neighborhood safety scores
- Cap rate or rent estimates
- Any value not explicitly stated

THEN GENERATE:

1. suggestedMessage (max 400 characters):
   - Acknowledge their interest warmly
   - Explain briefly why you can help
   - One clear next step / call to action
   - Sound like a senior agent, not a chatbot

2. clarifyingQuestion (ONE question or null):
   - Ask about the most important missing info
   - ONLY return ONE question, never multiple
   - If everything seems covered, return null

OUTPUT JSON ONLY (no markdown, no explanation):
{{
  "extracted": {{
    "name": "string or null",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "budget": "string or null",
    "budgetMin": "number or null",
    "budgetMax": "number or null",
    "bedrooms": "number or null",
    "bathrooms": "string or null",
    "homeType": "string or null",
    "timeline": "string or null",
    "hints": ["array of strings"]
  }},
  "suggestedMessage": "Your response here...",
  "clarifyingQuestion": "One question or null"
}}"""

# Property-aware extraction prompt (when we have property details from Repliers)
LEAD_EXTRACTION_PROMPT_WITH_PROPERTY = """You are extracting explicit facts from a real estate lead message.

CRITICAL RULES:
1. Only extract what is EXPLICITLY stated in the text
2. Return null for anything not clearly mentioned
3. Never infer, assume, or guess values
4. Extract hints as soft signals (phrases, not facts)

INPUT:
{raw_text}

PROPERTY DETAILS (from MLS - use in response):
- Address: {property_address}
- List Price: ${property_price:,}
- Bedrooms: {property_beds}
- Bathrooms: {property_baths}
- Sqft: {property_sqft}
- Status: {property_status}
- Days on Market: {property_dom}

EXTRACT (return null if not stated):
- name: Buyer's name if given
- email: Email if given
- phone: Phone if given
- location: City/neighborhood if named (use "{property_city}" if they mentioned this property)
- budget: Budget string like "$500K-$600K" if stated
- budgetMin: Number if explicitly mentioned
- budgetMax: Number if explicitly mentioned
- bedrooms: Number ONLY if stated with a digit (e.g., "3 bed")
- bathrooms: Number ONLY if stated with a digit
- homeType: Property type if mentioned (condo, townhouse, etc.)
- timeline: Timeline if mentioned ("this weekend", "ASAP", "next month")
- hints: Soft signals like ["good schools", "quiet area", "close to transit"]

FORBIDDEN (never generate):
- School ratings or assignments
- Commute times
- Neighborhood safety scores
- Cap rate or rent estimates
- Any value not explicitly stated

THEN GENERATE:

1. suggestedMessage (max 400 characters):
   - Acknowledge their interest in THIS SPECIFIC property
   - Reference key property details (price, beds, etc.) naturally
   - Sound knowledgeable about this listing
   - One clear next step (schedule showing is ideal for property-specific leads)
   - Sound like a senior agent who knows this property, not a chatbot

2. clarifyingQuestion (ONE question or null):
   - For property-specific leads, focus on scheduling: "Would you like to see it this week?"
   - Or ask about financing if relevant
   - ONLY return ONE question, never multiple
   - If everything seems covered, return null

OUTPUT JSON ONLY (no markdown, no explanation):
{{
  "extracted": {{
    "name": "string or null",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "budget": "string or null",
    "budgetMin": "number or null",
    "budgetMax": "number or null",
    "bedrooms": "number or null",
    "bathrooms": "string or null",
    "homeType": "string or null",
    "timeline": "string or null",
    "hints": ["array of strings"]
  }},
  "suggestedMessage": "Your response here...",
  "clarifyingQuestion": "One question or null"
}}"""


def extract_lead_with_llm(raw_text: str, property_details: Optional[dict] = None) -> dict:
    """Extract lead data using LLM. Returns extracted fields + response.

    Args:
        raw_text: The lead message text
        property_details: Optional property data from Repliers API lookup
    """
    content = None
    try:
        print(f"[LLM] Starting extraction for: {raw_text[:100]}...", flush=True)

        # Choose prompt based on whether we have property details
        if property_details and property_details.get("listPrice"):
            print(f"[LLM] Using property-aware prompt with: {property_details.get('address')}", flush=True)

            # Format the property-aware prompt
            full_address = property_details.get("address", "")
            if property_details.get("city"):
                full_address += f", {property_details['city']}"
            if property_details.get("state"):
                full_address += f", {property_details['state']}"

            prompt = LEAD_EXTRACTION_PROMPT_WITH_PROPERTY.format(
                raw_text=raw_text,
                property_address=full_address,
                property_price=property_details.get("listPrice") or 0,
                property_beds=property_details.get("bedrooms") or "N/A",
                property_baths=property_details.get("bathrooms") or "N/A",
                property_sqft=property_details.get("sqft") or "N/A",
                property_status=property_details.get("status") or "Unknown",
                property_dom=property_details.get("daysOnMarket") or "N/A",
                property_city=property_details.get("city") or ""
            )
        else:
            print("[LLM] Using standard extraction prompt", flush=True)
            prompt = LEAD_EXTRACTION_PROMPT.format(raw_text=raw_text)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a real estate lead extraction assistant. Output valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=1000
        )

        content = response.choices[0].message.content.strip()
        print(f"[LLM] Raw response length: {len(content)}", flush=True)
        print(f"[LLM] Raw response: {content}", flush=True)

        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = re.sub(r'^```(?:json)?\n?', '', content)
            content = re.sub(r'\n?```$', '', content)
            print(f"[LLM] After removing markdown: {content}", flush=True)

        result = json.loads(content)
        print(f"[LLM] Parsed successfully, keys: {list(result.keys())}", flush=True)
        return result
    except json.JSONDecodeError as e:
        print(f"[LLM] JSON parse error: {e}", flush=True)
        print(f"[LLM] Content that failed to parse: {content}", flush=True)
        raise
    except Exception as e:
        print(f"[LLM] Extraction failed: {type(e).__name__}: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise


def generate_template_response(role: str) -> str:
    """Generate fallback response when LLM fails."""
    templates = {
        "buyer_lead": "Thanks for reaching out! I'd love to learn more about what you're looking for. When would be a good time to chat?",
        "investor": "Thanks for your interest. I work with investors regularly. What type of returns are you targeting?",
        "agent": "Hi! Thanks for connecting. How can I help you today?",
        "unknown": "Thanks for reaching out. Could you tell me a bit more about what you're looking for?"
    }
    return templates.get(role, templates["unknown"])


def get_clarifying_question_for_missing(
    missing_field: str,
    role: str,
    lead_type: str
) -> str:
    """Generate role-aware clarifying question for the most important missing field."""
    # Property-specific buyer gets action-oriented questions
    if role == "buyer_lead" and lead_type == "property_specific":
        questions = {
            "Budget range": "What's your budget for this property?",
            "Timeline": "Would you like to see it in person, and what times work this week?",
            "Preferred area": "Are you specifically interested in this area?",
            "Bedroom requirements": "How many bedrooms do you need?"
        }
    # Area search buyer gets discovery questions
    elif role == "buyer_lead":
        questions = {
            "Budget range": "What budget range are you aiming for?",
            "Preferred area": "What neighborhoods or areas are you focusing on?",
            "Timeline": "What's your timeline for moving?",
            "Bedroom requirements": "How many bedrooms are you looking for?"
        }
    # Investor
    elif role == "investor":
        questions = {
            "Budget range": "What's your investment budget?",
            "Preferred area": "Which areas are you targeting for investment?",
            "Timeline": "Are you targeting cash flow, appreciation, or a mix?",
            "Bedroom requirements": "What property size are you looking for?"
        }
    # Unknown
    else:
        questions = {
            "Budget range": "What's your budget?",
            "Preferred area": "What area are you interested in?",
            "Timeline": "Are you looking to buy, sell, or rent?",
            "Bedroom requirements": "What size property are you looking for?"
        }

    return questions.get(missing_field, "What else can I help you with?")


def calculate_extraction_confidence(extracted: dict) -> int:
    """Calculate extraction quality heuristic (0-100)."""
    score = 0

    # +20 for contact info (high value)
    if extracted.get("email") or extracted.get("phone"):
        score += 20

    # +15 for each core field
    if extracted.get("budgetMin") or extracted.get("budgetMax"):
        score += 15
    if extracted.get("location"):
        score += 15
    if extracted.get("bedrooms"):
        score += 15
    if extracted.get("homeType"):
        score += 10

    # +10 for name
    if extracted.get("name"):
        score += 10

    # +5 for timeline
    if extracted.get("timeline"):
        score += 5

    # +5 for hints
    if extracted.get("hints") and len(extracted["hints"]) > 0:
        score += 5

    return min(100, score)


# ============================================================
# LEAD ANALYSIS HELPERS
# ============================================================

def _convert_lead_analysis_to_ai_format(lead_analysis: dict) -> dict:
    """
    Convert property-centric lead analysis to aiAnalysis format for report_synthesizer.

    Lead analysis has: property_highlights, things_to_consider, market_position, photo_insights
    AI analysis expects: whats_matching, whats_missing, red_flags, agent_take_ai

    Frontend expects objects with specific fields:
    - whats_matching: [{requirement, evidence, source}]
    - whats_missing: [{concern, severity, workaround}]
    - red_flags: [{concern, quote, risk_level, follow_up}]
    """
    if not lead_analysis:
        return {}

    # Map property highlights to "whats_matching" (as objects)
    whats_matching = []
    for highlight in lead_analysis.get("property_highlights", [])[:3]:
        if isinstance(highlight, dict):
            feature = highlight.get("feature", "")
            evidence = highlight.get("evidence", "")
            why_notable = highlight.get("why_notable", "")
            if feature:
                whats_matching.append({
                    "requirement": feature,
                    "evidence": evidence or why_notable or "From listing",
                    "source": "description"
                })

    # Map things_to_consider to red_flags (as objects)
    red_flags = []
    for concern in lead_analysis.get("things_to_consider", [])[:3]:
        if isinstance(concern, dict):
            concern_text = concern.get("concern", "")
            risk = concern.get("risk_level", "medium")
            evidence = concern.get("evidence", "")
            follow_up = concern.get("follow_up", "")
            if concern_text:
                red_flags.append({
                    "concern": concern_text,
                    "quote": evidence,
                    "risk_level": risk,
                    "follow_up": follow_up
                })

    # NOTE: Photo insights are handled via photo_red_flags array (not duplicated in red_flags)
    # The frontend's getConcerns() merges both red_flags and photo_red_flags

    # Build market position summary for whats_missing (as objects)
    whats_missing = []
    market = lead_analysis.get("market_position", {})
    if market.get("days_on_market_insight"):
        whats_missing.append({
            "concern": market["days_on_market_insight"],
            "severity": "low",
            "workaround": None
        })
    if market.get("price_history") and "reduction" in market["price_history"].lower():
        whats_missing.append({
            "concern": market["price_history"],
            "severity": "low",
            "workaround": "May indicate negotiation room"
        })

    # Check if photo insights exist (vision analysis completed)
    photo_insights = lead_analysis.get("photo_insights", [])
    has_photo_insights = len(photo_insights) > 0

    # Generate photo headline and summary for Visual Highlights section
    photo_headline = None
    photo_summary = None
    if has_photo_insights:
        highlights = [i for i in photo_insights if i.get("type") == "highlight"]
        concerns = [i for i in photo_insights if i.get("type") in ["concern", "red_flag"]]

        # Build headline
        parts = []
        if highlights:
            parts.append(f"{len(highlights)} visual highlight{'s' if len(highlights) > 1 else ''}")
        if concerns:
            parts.append(f"{len(concerns)} item{'s' if len(concerns) > 1 else ''} to verify")
        if parts:
            photo_headline = "Photo review: " + ", ".join(parts)

        # Build summary from top highlight
        if highlights:
            top_highlight = highlights[0]
            photo_summary = top_highlight.get("observation", "")
            if top_highlight.get("implication"):
                photo_summary += f" — {top_highlight['implication']}"

    return {
        "whats_matching": whats_matching,
        "whats_missing": whats_missing,
        "red_flags": red_flags,
        "agent_take_ai": lead_analysis.get("agent_summary", ""),
        # Vision complete flag - True when we have photo insights OR tried and got none
        "vision_complete": True,  # Lead analysis always includes vision attempt
        # Photo headline/summary for Visual Highlights section
        "photo_headline": photo_headline,
        "photo_summary": photo_summary,
        # Photo matches for "Why This Could Be a Good Match" section (highlights)
        "photo_matches": [
            {
                "requirement": insight.get("observation", ""),
                "status": "present",
                "evidence": insight.get("implication", ""),
                "confidence": insight.get("confidence", "high")
            }
            for insight in photo_insights
            if insight.get("type") == "highlight"
        ],
        # Photo red flags for "What You Should Know" section (concerns only)
        "photo_red_flags": [
            {
                "concern": insight.get("observation", ""),
                "evidence": insight.get("implication", ""),
                "severity": "medium" if insight.get("type") == "red_flag" else "low",
                "follow_up": "Verify during showing"
            }
            for insight in photo_insights
            if insight.get("type") in ["concern", "red_flag"]
        ],
        # Preserve original lead analysis for frontend
        "_lead_analysis": lead_analysis
    }


# ============================================================
# LEAD PROCESSING
# ============================================================

def process_lead(
    request: LeadExtractionRequest,
    agent_id: int
) -> LeadExtractionResponse:
    """
    Main lead processing function.
    1. Normalize input
    2. Check for duplicates
    3. Deterministic classification
    4. LLM extraction
    5. Post-processing
    6. Store and return
    """
    # Normalize input
    normalized_input = normalize_for_dedupe(request.rawText)

    # Auto-detect source if not provided
    source = request.source or "unknown"
    if source == "unknown":
        source = detect_source(request.rawText)

    # Parse property URL if provided
    property_url = None
    property_address = None
    if request.propertyUrlOrAddress:
        if request.propertyUrlOrAddress.startswith("http"):
            property_url = request.propertyUrlOrAddress
        else:
            property_address = request.propertyUrlOrAddress

    # Check for duplicate by text
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM leads
                WHERE agent_id = %s
                  AND raw_input_normalized = %s
                  AND created_at > NOW() - (%s * INTERVAL '1 minute')
                ORDER BY created_at DESC
                LIMIT 1
            """, (agent_id, normalized_input, DEDUPE_WINDOW_MINUTES))
            existing = fetchone_dict(cur)

            if existing:
                # Return existing lead
                return _build_response_from_row(existing)

    # === STEP 1: Deterministic Classification ===
    classification = classify_lead_deterministic(
        request.rawText,
        source,
        property_url
    )
    intent_score, intent_reasons = calculate_intent_score(
        request.rawText,
        classification["leadType"]
    )

    # === STEP 1.5: Property Lookup (for property-specific leads) ===
    property_details = None
    if classification["leadType"] == "property_specific":
        print("[LEAD] Property-specific lead detected, looking up property details...")
        property_details = lookup_property_details(request.rawText, property_address)
        if property_details:
            print(f"[LEAD] Found property: {property_details.get('address')}, ${property_details.get('listPrice')}")
            # Set property address from API response if not already set
            if not property_address and property_details.get("address"):
                full_addr = property_details.get("address", "")
                if property_details.get("city"):
                    full_addr += f", {property_details['city']}"
                if property_details.get("state"):
                    full_addr += f", {property_details['state']}"
                property_address = full_addr
        else:
            print("[LEAD] Property not found in MLS database")

    # === STEP 2: LLM Extraction (with property context if available) ===
    try:
        extraction = extract_lead_with_llm(request.rawText, property_details)
    except Exception as e:
        logger.error(f"LLM extraction failed, using fallback: {e}")
        extraction = {
            "extracted": {
                "name": None, "email": None, "phone": None,
                "location": None, "budget": None, "budgetMin": None,
                "budgetMax": None, "bedrooms": None, "bathrooms": None,
                "homeType": None, "timeline": None, "hints": []
            },
            "suggestedMessage": generate_template_response(classification["role"]),
            "clarifyingQuestion": get_clarifying_question_for_missing(
                "Budget range",  # Default to asking about budget
                classification["role"],
                classification["leadType"]
            )
        }

    extracted = extraction.get("extracted", {})

    # Check for duplicate by contact (after LLM extraction)
    with get_conn() as conn:
        with conn.cursor() as cur:
            if extracted.get("email") or extracted.get("phone"):
                conditions = []
                params = [agent_id]  # Start with agent_id only

                if extracted.get("email"):
                    conditions.append("extracted_email = %s")
                    params.append(extracted["email"].lower().strip())

                if extracted.get("phone"):
                    normalized_phone = re.sub(r'\D', '', extracted["phone"])
                    conditions.append("regexp_replace(extracted_phone, '\\D', '', 'g') = %s")
                    params.append(normalized_phone)

                if conditions:
                    # Add DEDUPE_CONTACT_DAYS at the end (for the interval)
                    params.append(DEDUPE_CONTACT_DAYS)
                    cur.execute(f"""
                        SELECT * FROM leads
                        WHERE agent_id = %s
                          AND ({' OR '.join(conditions)})
                          AND created_at > NOW() - (%s * INTERVAL '1 day')
                        ORDER BY created_at DESC
                        LIMIT 1
                    """, tuple(params))
                    existing = fetchone_dict(cur)

                    if existing:
                        return _build_response_from_row(existing)

    # === STEP 3: Post-Processing ===

    # Enforce message length cap
    suggested_message = extraction.get("suggestedMessage", "")
    if len(suggested_message) > MAX_MESSAGE_LENGTH:
        truncated = suggested_message[:MAX_MESSAGE_LENGTH]
        last_period = truncated.rfind(".")
        if last_period > MAX_MESSAGE_LENGTH // 2:
            suggested_message = truncated[:last_period + 1]
        else:
            suggested_message = truncated.rstrip() + "..."

    # Validate one-question limit
    clarifying_question = extraction.get("clarifyingQuestion")
    if clarifying_question and "?" in clarifying_question:
        clarifying_question = clarifying_question.split("?")[0] + "?"

    # Build what_to_clarify (prioritized order)
    what_to_clarify = []
    if not extracted.get("budgetMin") and not extracted.get("budgetMax"):
        what_to_clarify.append("Budget range")
    if not extracted.get("location"):
        what_to_clarify.append("Preferred area")
    if not extracted.get("timeline"):
        what_to_clarify.append("Timeline")
    if not extracted.get("bedrooms"):
        what_to_clarify.append("Bedroom requirements")

    # Generate clarifying question if LLM didn't provide one
    if not clarifying_question and what_to_clarify:
        clarifying_question = get_clarifying_question_for_missing(
            what_to_clarify[0],
            classification["role"],
            classification["leadType"]
        )

    # Calculate extraction confidence
    extraction_confidence = calculate_extraction_confidence(extracted)

    # MLS search would go here (placeholder for now)
    mls_search_status = None
    mls_matches = None

    # === STEP 4: Store Lead ===
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO leads (
                    agent_id, status,
                    role, role_reason, lead_type, lead_type_reason,
                    source, property_url, property_address,
                    intent_score, intent_reasons,
                    extracted_name, extracted_email, extracted_phone,
                    extracted_location, extracted_budget,
                    extracted_budget_min, extracted_budget_max,
                    extracted_bedrooms, extracted_bathrooms,
                    extracted_home_type, extracted_timeline,
                    hints,
                    suggested_message, clarifying_question, what_to_clarify,
                    mls_search_status, mls_matches,
                    extraction_confidence,
                    property_listing_id, property_list_price,
                    property_bedrooms, property_bathrooms,
                    property_sqft, property_image_url, property_raw,
                    raw_input, raw_input_normalized
                ) VALUES (
                    %s, 'classified',
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s,
                    %s, %s, %s,
                    %s, %s,
                    %s, %s,
                    %s, %s,
                    %s, %s,
                    %s,
                    %s, %s, %s,
                    %s, %s,
                    %s,
                    %s, %s,
                    %s, %s,
                    %s, %s, %s,
                    %s, %s
                )
                RETURNING *
            """, (
                agent_id,
                classification["role"], classification["roleReason"],
                classification["leadType"], classification["leadTypeReason"],
                source, property_url, property_address,
                intent_score, json.dumps(intent_reasons),
                extracted.get("name"), extracted.get("email"), extracted.get("phone"),
                extracted.get("location"), extracted.get("budget"),
                extracted.get("budgetMin"), extracted.get("budgetMax"),
                extracted.get("bedrooms"), extracted.get("bathrooms"),
                extracted.get("homeType"), extracted.get("timeline"),
                json.dumps(extracted.get("hints", [])),
                suggested_message, clarifying_question, json.dumps(what_to_clarify),
                mls_search_status, json.dumps(mls_matches) if mls_matches else None,
                extraction_confidence,
                # Property details from Repliers API
                property_details.get("listingId") if property_details else None,
                property_details.get("listPrice") if property_details else None,
                property_details.get("bedrooms") if property_details else None,
                str(property_details.get("bathrooms")) if property_details and property_details.get("bathrooms") else None,
                property_details.get("sqft") if property_details else None,
                property_details.get("primaryImage") if property_details else None,
                json.dumps(property_details) if property_details else None,
                request.rawText, normalized_input
            ))
            row = fetchone_dict(cur)

    return _build_response_from_row(row)


def _parse_json_field(value):
    """Parse JSON field - handles both string and already-parsed values."""
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value  # Already parsed by psycopg
    if isinstance(value, str):
        return json.loads(value)
    return value


def _build_response_from_row(row) -> LeadExtractionResponse:
    """Build LeadExtractionResponse from database row."""
    # Parse JSON fields (psycopg may auto-parse JSONB columns)
    intent_reasons = _parse_json_field(row["intent_reasons"]) or []
    hints = _parse_json_field(row["hints"]) or []
    what_to_clarify = _parse_json_field(row["what_to_clarify"]) or []
    mls_matches = _parse_json_field(row["mls_matches"])
    property_raw = _parse_json_field(row.get("property_raw"))

    lead = Lead(
        id=row["id"],
        agentId=row["agent_id"],
        status=row["status"],
        role=row["role"],
        roleReason=row["role_reason"],
        leadType=row["lead_type"],
        leadTypeReason=row["lead_type_reason"],
        source=row["source"],
        propertyUrl=row["property_url"],
        propertyAddress=row["property_address"],
        intentScore=row["intent_score"],
        intentReasons=intent_reasons,
        extractedName=row["extracted_name"],
        extractedEmail=row["extracted_email"],
        extractedPhone=row["extracted_phone"],
        extractedLocation=row["extracted_location"],
        extractedBudget=row["extracted_budget"],
        extractedBudgetMin=row["extracted_budget_min"],
        extractedBudgetMax=row["extracted_budget_max"],
        extractedBedrooms=row["extracted_bedrooms"],
        extractedBathrooms=row["extracted_bathrooms"],
        extractedHomeType=row["extracted_home_type"],
        extractedTimeline=row["extracted_timeline"],
        hints=hints,
        suggestedMessage=row["suggested_message"],
        clarifyingQuestion=row["clarifying_question"],
        whatToClarify=what_to_clarify,
        mlsSearchStatus=row["mls_search_status"],
        mlsMatches=mls_matches,
        extractionConfidence=row["extraction_confidence"],
        # Property details from Repliers API
        propertyListingId=row.get("property_listing_id"),
        propertyListPrice=row.get("property_list_price"),
        propertyBedrooms=row.get("property_bedrooms"),
        propertyBathrooms=row.get("property_bathrooms"),
        propertySqft=row.get("property_sqft"),
        propertyImageUrl=row.get("property_image_url"),
        propertyRaw=property_raw,
        rawInput=row["raw_input"],
        rawInputNormalized=row["raw_input_normalized"],
        createdAt=row["created_at"].isoformat() if row["created_at"] else None,
        engagedAt=row["engaged_at"].isoformat() if row["engaged_at"] else None,
        convertedAt=row["converted_at"].isoformat() if row["converted_at"] else None,
        convertedProfileId=row["converted_profile_id"],
        # Report tracking (migration 017)
        reportSentAt=row["report_sent_at"].isoformat() if row.get("report_sent_at") else None,
        reportShareId=row.get("report_share_id")
    )

    card = LeadCard(
        classification=LeadClassification(
            role=row["role"],
            roleReason=row["role_reason"],
            leadType=row["lead_type"],
            leadTypeReason=row["lead_type_reason"]
        ),
        intentScore=row["intent_score"],
        intentReasons=intent_reasons,
        whatToClarify=what_to_clarify,
        suggestedMessage=row["suggested_message"] or "",
        clarifyingQuestion=row["clarifying_question"],
        mlsSearchStatus=row["mls_search_status"],
        mlsMatches=mls_matches,
        extractionConfidence=row["extraction_confidence"] or 0
    )

    return LeadExtractionResponse(lead=lead, card=card)


# ============================================================
# API ENDPOINTS
# ============================================================

@router.post("/process-lead", response_model=LeadExtractionResponse)
def process_lead_endpoint(
    request: LeadExtractionRequest,
    agent_id: int = Depends(get_current_agent_id)
):
    """Process a lead from raw text input."""
    return process_lead(request, agent_id)


@router.get("/leads", response_model=List[Lead])
def list_leads(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    agent_id: int = Depends(get_current_agent_id)
):
    """List leads for the current agent."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if status:
                cur.execute("""
                    SELECT * FROM leads
                    WHERE agent_id = %s AND status = %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (agent_id, status, limit, offset))
            else:
                cur.execute("""
                    SELECT * FROM leads
                    WHERE agent_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (agent_id, limit, offset))
            rows = fetchall_dicts(cur)

    leads = []
    for row in rows:
        intent_reasons = _parse_json_field(row["intent_reasons"]) or []
        hints = _parse_json_field(row["hints"]) or []
        what_to_clarify = _parse_json_field(row["what_to_clarify"]) or []
        mls_matches = _parse_json_field(row["mls_matches"])
        property_raw = _parse_json_field(row.get("property_raw"))

        leads.append(Lead(
            id=row["id"],
            agentId=row["agent_id"],
            status=row["status"],
            role=row["role"],
            roleReason=row["role_reason"],
            leadType=row["lead_type"],
            leadTypeReason=row["lead_type_reason"],
            source=row["source"],
            propertyUrl=row["property_url"],
            propertyAddress=row["property_address"],
            intentScore=row["intent_score"],
            intentReasons=intent_reasons,
            extractedName=row["extracted_name"],
            extractedEmail=row["extracted_email"],
            extractedPhone=row["extracted_phone"],
            extractedLocation=row["extracted_location"],
            extractedBudget=row["extracted_budget"],
            extractedBudgetMin=row["extracted_budget_min"],
            extractedBudgetMax=row["extracted_budget_max"],
            extractedBedrooms=row["extracted_bedrooms"],
            extractedBathrooms=row["extracted_bathrooms"],
            extractedHomeType=row["extracted_home_type"],
            extractedTimeline=row["extracted_timeline"],
            hints=hints,
            suggestedMessage=row["suggested_message"],
            clarifyingQuestion=row["clarifying_question"],
            whatToClarify=what_to_clarify,
            mlsSearchStatus=row["mls_search_status"],
            mlsMatches=mls_matches,
            extractionConfidence=row["extraction_confidence"],
            propertyListingId=row.get("property_listing_id"),
            propertyListPrice=row.get("property_list_price"),
            propertyBedrooms=row.get("property_bedrooms"),
            propertyBathrooms=row.get("property_bathrooms"),
            propertySqft=row.get("property_sqft"),
            propertyImageUrl=row.get("property_image_url"),
            propertyRaw=property_raw,
            rawInput=row["raw_input"],
            rawInputNormalized=row["raw_input_normalized"],
            createdAt=row["created_at"].isoformat() if row["created_at"] else None,
            engagedAt=row["engaged_at"].isoformat() if row["engaged_at"] else None,
            convertedAt=row["converted_at"].isoformat() if row["converted_at"] else None,
            convertedProfileId=row["converted_profile_id"],
            reportSentAt=row["report_sent_at"].isoformat() if row.get("report_sent_at") else None,
            reportShareId=row.get("report_share_id")
        ))

    return leads


@router.get("/leads/{lead_id}", response_model=Lead)
def get_lead(
    lead_id: int,
    agent_id: int = Depends(get_current_agent_id)
):
    """Get a specific lead by ID."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM leads
                WHERE id = %s AND agent_id = %s
            """, (lead_id, agent_id))
            row = fetchone_dict(cur)

    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")

    intent_reasons = _parse_json_field(row["intent_reasons"]) or []
    hints = _parse_json_field(row["hints"]) or []
    what_to_clarify = _parse_json_field(row["what_to_clarify"]) or []
    mls_matches = _parse_json_field(row["mls_matches"])
    property_raw = _parse_json_field(row.get("property_raw"))

    return Lead(
        id=row["id"],
        agentId=row["agent_id"],
        status=row["status"],
        role=row["role"],
        roleReason=row["role_reason"],
        leadType=row["lead_type"],
        leadTypeReason=row["lead_type_reason"],
        source=row["source"],
        propertyUrl=row["property_url"],
        propertyAddress=row["property_address"],
        intentScore=row["intent_score"],
        intentReasons=intent_reasons,
        extractedName=row["extracted_name"],
        extractedEmail=row["extracted_email"],
        extractedPhone=row["extracted_phone"],
        extractedLocation=row["extracted_location"],
        extractedBudget=row["extracted_budget"],
        extractedBudgetMin=row["extracted_budget_min"],
        extractedBudgetMax=row["extracted_budget_max"],
        extractedBedrooms=row["extracted_bedrooms"],
        extractedBathrooms=row["extracted_bathrooms"],
        extractedHomeType=row["extracted_home_type"],
        extractedTimeline=row["extracted_timeline"],
        hints=hints,
        suggestedMessage=row["suggested_message"],
        clarifyingQuestion=row["clarifying_question"],
        whatToClarify=what_to_clarify,
        mlsSearchStatus=row["mls_search_status"],
        mlsMatches=mls_matches,
        extractionConfidence=row["extraction_confidence"],
        propertyListingId=row.get("property_listing_id"),
        propertyListPrice=row.get("property_list_price"),
        propertyBedrooms=row.get("property_bedrooms"),
        propertyBathrooms=row.get("property_bathrooms"),
        propertySqft=row.get("property_sqft"),
        propertyImageUrl=row.get("property_image_url"),
        propertyRaw=property_raw,
        rawInput=row["raw_input"],
        rawInputNormalized=row["raw_input_normalized"],
        createdAt=row["created_at"].isoformat() if row["created_at"] else None,
        engagedAt=row["engaged_at"].isoformat() if row["engaged_at"] else None,
        convertedAt=row["converted_at"].isoformat() if row["converted_at"] else None,
        convertedProfileId=row["converted_profile_id"],
        reportSentAt=row["report_sent_at"].isoformat() if row.get("report_sent_at") else None,
        reportShareId=row.get("report_share_id")
    )


@router.patch("/leads/{lead_id}/status")
def update_lead_status(
    lead_id: int,
    update: LeadUpdate,
    agent_id: int = Depends(get_current_agent_id)
):
    """Update lead status (engaged, converted, archived)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify ownership
            cur.execute("""
                SELECT id FROM leads WHERE id = %s AND agent_id = %s
            """, (lead_id, agent_id))
            existing = fetchone_dict(cur)

            if not existing:
                raise HTTPException(status_code=404, detail="Lead not found")

            # Build update query
            updates = []
            params = []

            if update.status:
                updates.append("status = %s")
                params.append(update.status)

                # Set timestamp based on status
                if update.status == "engaged":
                    updates.append("engaged_at = NOW()")
                elif update.status == "converted":
                    updates.append("converted_at = NOW()")

            if update.convertedProfileId:
                updates.append("converted_profile_id = %s")
                params.append(update.convertedProfileId)

            if not updates:
                raise HTTPException(status_code=400, detail="No updates provided")

            params.append(lead_id)
            cur.execute(f"""
                UPDATE leads
                SET {', '.join(updates)}
                WHERE id = %s
            """, tuple(params))

    return {"status": "updated"}


@router.post("/leads/{lead_id}/generate-outreach")
async def generate_lead_outreach(
    lead_id: int,
    send_email: bool = Query(False, description="Whether to send email after generating report"),
    agent_id: int = Depends(get_current_agent_id)
):
    """
    One-click lead outreach:
    1. Convert lead to profile (if needed)
    2. Search for matching properties
    3. Generate buyer report with top 5 properties
    4. Optionally send outreach email (if send_email=true)
    5. Update lead status to 'engaged'

    Returns share_id for the generated report.
    """
    from .listings import _load_profile
    from .search import generate_search_id, store_search_context, _map_to_agent_listing
    from .buyer_reports import (
        build_top_properties_for_email,
        build_lead_email_body,
    )
    from ..services.report_synthesizer import generate_report_synthesis
    from ..services.email_service import send_email, DEFAULT_FROM_EMAIL
    from ..services.search_service import SearchService
    from ..services.lead_property_analyzer import LeadPropertyAnalyzer
    import uuid

    # 1. Get lead data
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM leads WHERE id = %s AND agent_id = %s
            """, (lead_id, agent_id))
            lead_row = fetchone_dict(cur)

    if not lead_row:
        raise HTTPException(status_code=404, detail="Lead not found")

    # 2. Validate minimum required info
    # Email is optional - agent can share the report link manually
    lead_email = lead_row.get("extracted_email")

    # Check for budget info (extracted or from property)
    has_budget = (
        lead_row.get("extracted_budget_min") or
        lead_row.get("extracted_budget_max") or
        lead_row.get("property_list_price")
    )
    if not has_budget:
        raise HTTPException(
            status_code=400,
            detail="Lead has no budget info - cannot search properties"
        )

    # Check for location
    has_location = (
        lead_row.get("extracted_location") or
        lead_row.get("property_address")
    )
    if not has_location:
        raise HTTPException(
            status_code=400,
            detail="Lead has no location info - cannot search properties"
        )

    # 3. Create or get profile
    profile_id = lead_row.get("converted_profile_id")
    if not profile_id:
        # Convert lead to profile (reuse logic from convert_lead_to_profile)
        convert_result = _convert_lead_to_profile_internal(lead_id, agent_id, lead_row)
        profile_id = convert_result["profileId"]

    # 4. Execute property search using SearchService
    # Build lead data for SearchService (enables Similar Listings API when MLS number available)
    lead_data = {
        "property_listing_id": lead_row.get("property_listing_id"),
        "property_address": lead_row.get("property_address"),
        "property_list_price": lead_row.get("property_list_price"),
        "property_bedrooms": lead_row.get("property_bedrooms"),
        "property_bathrooms": lead_row.get("property_bathrooms"),
        "extracted_location": lead_row.get("extracted_location"),
    }
    profile_data = _load_profile(profile_id)

    try:
        search_service = SearchService()
        search_result = search_service.search(profile_data, lead_data)

        # Log search strategy and any inferences made
        logger.info(f"[OUTREACH] Search strategy: {search_result.strategy}, found {search_result.total_count} listings")
        for inf in search_result.inferences:
            logger.info(f"[OUTREACH] Inferred {inf['field']}: {inf['reason']}")

        # Get listings from SearchResult
        all_picks = search_result.listings

        # Use same persistence as agent search - populates property_images table
        # This enables chatbot DB queries and property detail page images
        from ..services.listing_persister import ListingPersister
        persist_counts = ListingPersister.persist_search_results(
            listings=all_picks,  # Normalized listings from SearchService (compatible format)
            analyzed_listings=[],  # Lead analysis uses different format, skip AI insights
            profile_id=profile_id,
            agent_id=agent_id
        )
        logger.info(f"[OUTREACH] Persisted {persist_counts['listings_persisted']} listings, {persist_counts['images_persisted']} images to database")
    except Exception as e:
        logger.error(f"[OUTREACH] Property search failed for profile {profile_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Property search failed: {str(e)}"
        )

    if not all_picks:
        raise HTTPException(
            status_code=400,
            detail="No matching properties found for this lead's criteria"
        )

    # 4.5. Run property-centric analysis for lead outreach
    # This is different from buyer profile analysis - no requirements to match against
    lead_analyzer_context = {
        "propertyAddress": lead_row.get("property_address"),
        "propertyListPrice": lead_row.get("property_list_price"),
        "propertyBedrooms": lead_row.get("property_bedrooms"),
        "propertyBathrooms": lead_row.get("property_bathrooms"),
        "propertySqft": lead_row.get("property_sqft"),
    }

    # Note: We'll run vision analysis AFTER selecting top 5 to save time
    # First, build the listing structure and select top 5

    # 5. Generate buyer report with top 5
    # Map listings to agent listing format
    # For SearchService results (raw listings), we convert them directly
    ai_listings = []
    for listing in all_picks:
        # Handle both normalized listings (from SearchService) and scored listings (legacy)
        if "listing" in listing:
            # Legacy format from listings_search() - extract nested listing
            l = listing["listing"]
            ai_listings.append({
                "mlsNumber": l.get("mls_number") or l.get("id"),
                "address": l.get("address"),
                "city": l.get("city"),
                "state": l.get("state"),
                "zip": l.get("zip_code"),
                "listPrice": l.get("price"),
                "bedrooms": l.get("bedrooms"),
                "bathrooms": l.get("bathrooms"),
                "sqft": l.get("square_feet"),
                "propertyType": l.get("property_type"),
                "status": l.get("status"),
                "images": l.get("images", []),
                "photoCount": len(l.get("images", [])),
                "description": l.get("description"),
                "yearBuilt": l.get("year_built"),
                "daysOnMarket": l.get("days_on_market"),
                "matchLabel": listing.get("label", "Match"),
                "aiAnalysis": listing.get("ai_analysis"),
                "pricePerSqft": listing.get("pricePerSqft"),
                "fitScore": listing.get("fitScore"),
                "finalScore": listing.get("finalScore"),
            })
        else:
            # Normalized listing from SearchService (Similar Listings API)
            listing_id = listing.get("mls_number") or listing.get("id")

            # Build listing structure WITHOUT analysis (analysis added after top 5 selection)
            ai_listings.append({
                "mlsNumber": listing_id,
                "address": listing.get("address"),
                "city": listing.get("city"),
                "state": listing.get("state"),
                "zip": listing.get("zip_code"),
                "listPrice": listing.get("price"),
                "bedrooms": listing.get("bedrooms"),
                "bathrooms": listing.get("bathrooms"),
                "sqft": listing.get("square_feet"),
                "propertyType": listing.get("property_type"),
                "status": listing.get("status"),
                "images": listing.get("images", []),
                "photoCount": len(listing.get("images", [])),
                "description": listing.get("description"),
                "yearBuilt": listing.get("year_built"),
                "daysOnMarket": listing.get("days_on_market"),
                "matchLabel": "Similar" if search_result.strategy == "similar" else "Match",
                # Lead analysis will be added AFTER top 5 selection (vision analysis is slow)
                "leadAnalysis": None,
                "aiAnalysis": None,
                "pricePerSqft": listing.get("price_per_sqft"),
                # For similar listings, use price as score proxy (higher price = more similar budget)
                "fitScore": 80,  # Default for similar listings
                "finalScore": 80,  # Default for similar listings
            })

    # Select top 5 by finalScore
    sorted_listings = sorted(
        [l for l in ai_listings if l.get('finalScore') is not None],
        key=lambda x: x.get('finalScore', 0),
        reverse=True
    )
    top_5_listings = sorted_listings[:5]
    top_5_ids = [l['mlsNumber'] for l in top_5_listings]

    if len(top_5_listings) == 0:
        raise HTTPException(status_code=400, detail="No scorable listings found")

    # NOW run vision analysis on ONLY the top 5 (much faster than analyzing all)
    logger.info(f"[OUTREACH] Running vision analysis on top {len(top_5_listings)} listings only")
    try:
        lead_analyzer = LeadPropertyAnalyzer()
        # Convert top 5 back to raw listing format for analyzer
        top_5_raw = [l for l in all_picks if l.get('mls_number') in top_5_ids or l.get('mlsNumber') in top_5_ids]
        lead_analyses = lead_analyzer.analyze_batch(
            top_5_raw,
            lead_context=lead_analyzer_context,
            include_vision=True,
            max_workers=3
        )
        logger.info(f"[OUTREACH] LeadPropertyAnalyzer completed for {len(lead_analyses)} listings")
    except Exception as e:
        logger.warning(f"[OUTREACH] LeadPropertyAnalyzer failed, continuing without analysis: {e}")
        lead_analyses = {}

    # Update top 5 listings with their lead analyses (now that vision analysis is complete)
    for listing in top_5_listings:
        listing_id = listing.get("mlsNumber")
        lead_analysis = lead_analyses.get(listing_id, {})
        if lead_analysis:
            listing["leadAnalysis"] = lead_analysis
            listing["aiAnalysis"] = _convert_lead_analysis_to_ai_format(lead_analysis)

    # Generate search_id and store context
    from ..services.search_context_store import generate_search_id, store_search_context
    search_id = generate_search_id()
    # profile_data already loaded above (line 1284)
    store_search_context(search_id, profile_data, ai_listings)

    # Build lead context for synthesis
    lead_context = {
        "leadId": lead_row["id"],
        "source": lead_row.get("source"),
        "leadType": lead_row.get("lead_type"),
        "propertyAddress": lead_row.get("property_address"),
        "propertyListPrice": lead_row.get("property_list_price"),
        "propertyBedrooms": lead_row.get("property_bedrooms"),
        "propertyBathrooms": lead_row.get("property_bathrooms"),
        "propertySqft": lead_row.get("property_sqft"),
        "propertyImageUrl": lead_row.get("property_image_url"),
        "propertyListingId": lead_row.get("property_listing_id"),
        "originalMessage": (lead_row.get("raw_input") or "")[:300],
        "timeline": lead_row.get("extracted_timeline"),
    }

    # Generate synthesis
    try:
        synthesis = generate_report_synthesis(profile_data, top_5_listings, lead_context=lead_context)
    except Exception as e:
        logger.error(f"[OUTREACH] Synthesis generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report synthesis: {str(e)}")

    # Persist listing snapshots for database fallback
    listing_snapshots = []
    for listing in top_5_listings:
        snapshot = {
            "mlsNumber": listing.get("mlsNumber"),
            "address": listing.get("address"),
            "city": listing.get("city"),
            "state": listing.get("state"),
            "zip": listing.get("zip"),
            "listPrice": listing.get("listPrice"),
            "bedrooms": listing.get("bedrooms"),
            "bathrooms": listing.get("bathrooms"),
            "sqft": listing.get("sqft"),
            "propertyType": listing.get("propertyType"),
            "images": listing.get("images", [])[:10],
            "finalScore": listing.get("finalScore"),
            "fitScore": listing.get("fitScore"),
            "aiAnalysis": listing.get("aiAnalysis", {}),
            # Include original lead analysis for rich frontend rendering
            "leadAnalysis": listing.get("leadAnalysis"),
        }
        listing_snapshots.append(snapshot)
    synthesis["listing_snapshots"] = listing_snapshots
    synthesis["lead_context"] = lead_context  # Persist for email template

    # Get agent info
    agent_name = None
    agent_email = None
    agent_phone = None  # Not in agents table yet
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT first_name || ' ' || last_name AS name, email
                FROM agents WHERE id = %s
            """, (agent_id,))
            agent_row = cur.fetchone()
            if agent_row:
                agent_name = agent_row[0]
                agent_email = agent_row[1]

    # Create buyer report in database
    share_id = str(uuid.uuid4())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO buyer_reports
                (share_id, profile_id, agent_id, search_id, agent_name, agent_email, agent_phone,
                 included_listing_ids, synthesis_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING share_id
            """, (
                share_id, profile_id, agent_id, search_id,
                agent_name, agent_email, agent_phone,
                top_5_ids, json.dumps(synthesis)
            ))

    logger.info(f"[OUTREACH] Created report with shareId={share_id}, {len(top_5_ids)} listings")

    # 6. Build report URL
    import os
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residencehive.com")
    report_url = f"{frontend_url}/buyer-report/{share_id}"

    # 7. Send outreach email (only if send_email=true AND email is available)
    email_sent = False
    if send_email and lead_email:
        buyer_name = lead_row.get("extracted_name") or ""
        top_properties = build_top_properties_for_email(top_5_listings)

        email_body = build_lead_email_body(
            buyer_name=buyer_name,
            agent_name=agent_name or "Your Agent",
            report_url=report_url,
            top_properties=top_properties,
            lead_context=lead_context,
            synthesis_data=synthesis,
        )
        email_subject = f"Homes I found for you near {lead_row.get('extracted_location') or lead_row.get('property_address', 'your area')}"

        try:
            success = send_email(
                to_email=lead_email,
                from_email=DEFAULT_FROM_EMAIL,
                subject=email_subject,
                body=email_body,
                reply_to=agent_email
            )
            if success:
                email_sent = True
            else:
                logger.error(f"[OUTREACH] Email send returned False for lead {lead_id}")
        except Exception as e:
            logger.error(f"[OUTREACH] Email send failed for lead {lead_id}: {e}")
            # Don't fail the whole request - report was created
    else:
        if not send_email:
            logger.info(f"[OUTREACH] Email skipped for lead {lead_id} (send_email=false)")
        else:
            logger.info(f"[OUTREACH] No email address for lead {lead_id} - report generated without sending")

    # 8. Update lead status to engaged
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE leads
                SET status = CASE WHEN status = 'classified' THEN 'engaged' ELSE status END,
                    engaged_at = CASE WHEN engaged_at IS NULL THEN NOW() ELSE engaged_at END,
                    report_sent_at = NOW(),
                    report_share_id = %s
                WHERE id = %s
            """, (share_id, lead_id))

    if email_sent:
        logger.info(f"[OUTREACH] Complete for lead {lead_id}: report={share_id}, email sent to {lead_email}")
    else:
        logger.info(f"[OUTREACH] Complete for lead {lead_id}: report={share_id}, no email sent")

    return {
        "success": True,
        "profileId": profile_id,
        "reportShareId": share_id,
        "reportUrl": f"/buyer-report/{share_id}",
        "fullReportUrl": report_url,  # Full URL for easy copying
        "propertiesFound": len(all_picks),
        "propertiesIncluded": len(top_5_listings),
        "emailSent": email_sent,
        "emailSentTo": lead_email if email_sent else None
    }


def _convert_lead_to_profile_internal(lead_id: int, agent_id: int, lead_row: dict) -> dict:
    """
    Internal helper to convert lead to profile.
    Extracted from convert_lead_to_profile endpoint for reuse.
    """
    # Infer buyer preferences from property data
    budget_min = lead_row.get("extracted_budget_min")
    budget_max = lead_row.get("extracted_budget_max")
    budget_str = lead_row.get("extracted_budget") or "TBD"

    property_price = lead_row.get("property_list_price")
    if property_price:
        # Budget range: -50% to +10% of property price
        inferred_min = int(property_price * 0.5)
        inferred_max = int(property_price * 1.1)

        if not budget_min:
            budget_min = inferred_min
        if not budget_max:
            budget_max = inferred_max
        if budget_str == "TBD":
            budget_str = f"${inferred_min:,} - ${inferred_max:,}"

    bedrooms = lead_row.get("extracted_bedrooms") or lead_row.get("property_bedrooms") or 0
    bathrooms = lead_row.get("extracted_bathrooms") or lead_row.get("property_bathrooms") or ""

    # Location: prefer extracted, fall back to property address
    location = lead_row.get("extracted_location")
    if not location and lead_row.get("property_address"):
        property_raw = _parse_json_field(lead_row.get("property_raw"))
        if property_raw and isinstance(property_raw, dict):
            addr_data = property_raw.get("address", {})
            if addr_data.get("city"):
                location = addr_data["city"]
                if addr_data.get("state"):
                    location += f", {addr_data['state']}"
        if not location:
            location = lead_row.get("property_address", "")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO buyer_profiles (
                    name, email, phone, location,
                    budget, budget_min, budget_max,
                    home_type, bedrooms, bathrooms,
                    raw_input, input_method,
                    agent_id, parent_lead_id, created_by_method,
                    created_at
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, 'lead',
                    %s, %s, 'lead',
                    NOW()
                )
                RETURNING id
            """, (
                lead_row.get("extracted_name") or "Unknown",
                lead_row.get("extracted_email") or "",
                lead_row.get("extracted_phone"),
                location or "",
                budget_str,
                budget_min,
                budget_max,
                lead_row.get("extracted_home_type") or "",
                bedrooms,
                bathrooms,
                lead_row.get("raw_input"),
                agent_id,
                lead_id
            ))
            profile_result = fetchone_dict(cur)
            profile_id = profile_result["id"]

            # Update lead status
            cur.execute("""
                UPDATE leads
                SET status = 'converted',
                    converted_at = NOW(),
                    converted_profile_id = %s
                WHERE id = %s
            """, (profile_id, lead_id))

    return {
        "status": "converted",
        "profileId": profile_id,
    }


@router.post("/leads/{lead_id}/convert")
def convert_lead_to_profile(
    lead_id: int,
    agent_id: int = Depends(get_current_agent_id)
):
    """Convert a lead to a buyer profile (atomic transaction)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get the lead
            cur.execute("""
                SELECT * FROM leads WHERE id = %s AND agent_id = %s
            """, (lead_id, agent_id))
            lead_row = fetchone_dict(cur)

            if not lead_row:
                raise HTTPException(status_code=404, detail="Lead not found")

            if lead_row["converted_profile_id"]:
                raise HTTPException(status_code=400, detail="Lead already converted")

            # === Infer buyer preferences from property data ===
            # If lead has property details, use them to set budget range for similar listings
            budget_min = lead_row["extracted_budget_min"]
            budget_max = lead_row["extracted_budget_max"]
            budget_str = lead_row["extracted_budget"] or "TBD"

            property_price = lead_row.get("property_list_price")
            if property_price:
                # Budget range: -50% to +10% of property price (for similar listings)
                inferred_min = int(property_price * 0.5)
                inferred_max = int(property_price * 1.1)

                # Only use inferred values if extracted values are missing
                if not budget_min:
                    budget_min = inferred_min
                if not budget_max:
                    budget_max = inferred_max
                if budget_str == "TBD":
                    budget_str = f"${inferred_min:,} - ${inferred_max:,}"

            # Use property details as fallback for missing extracted data
            bedrooms = lead_row["extracted_bedrooms"] or lead_row.get("property_bedrooms") or 0
            bathrooms = lead_row["extracted_bathrooms"] or lead_row.get("property_bathrooms") or ""

            # Location: prefer extracted, fall back to property address
            location = lead_row["extracted_location"]
            if not location and lead_row.get("property_address"):
                # Extract city from property address if available
                property_raw = _parse_json_field(lead_row.get("property_raw"))
                if property_raw and isinstance(property_raw, dict):
                    addr_data = property_raw.get("address", {})
                    if addr_data.get("city"):
                        location = addr_data["city"]
                        if addr_data.get("state"):
                            location += f", {addr_data['state']}"
                if not location:
                    location = lead_row.get("property_address", "")

            # Create buyer profile
            cur.execute("""
                INSERT INTO buyer_profiles (
                    name, email, phone, location,
                    budget, budget_min, budget_max,
                    home_type, bedrooms, bathrooms,
                    raw_input, input_method,
                    agent_id, parent_lead_id, created_by_method,
                    created_at
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, 'lead',
                    %s, %s, 'lead',
                    NOW()
                )
                RETURNING id
            """, (
                lead_row["extracted_name"] or "Unknown",
                lead_row["extracted_email"] or "",
                lead_row["extracted_phone"],
                location or "",
                budget_str,
                budget_min,
                budget_max,
                lead_row["extracted_home_type"] or "",
                bedrooms,
                bathrooms,
                lead_row["raw_input"],
                agent_id,
                lead_id
            ))
            profile_result = fetchone_dict(cur)
            profile_id = profile_result["id"]

            # Update lead status
            cur.execute("""
                UPDATE leads
                SET status = 'converted',
                    converted_at = NOW(),
                    converted_profile_id = %s
                WHERE id = %s
            """, (profile_id, lead_id))

    return {
        "status": "converted",
        "profileId": profile_id,
        "message": "Buyer profile created. You can refine it anytime."
    }


@router.get("/leads/{lead_id}/chat-sessions")
def get_lead_chat_sessions(
    lead_id: int,
    agent_id: int = Depends(get_current_agent_id)
):
    """
    Get chatbot session data for a lead.
    Returns CTA engagement, message count, session details, and actionable insights.
    """
    from ..services.chat_insights import get_chat_insights

    # First verify the lead belongs to this agent and get lead details
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, report_share_id, extracted_name, extracted_email
                FROM leads WHERE id = %s AND agent_id = %s
            """, (lead_id, agent_id))
            lead_row = fetchone_dict(cur)

    if not lead_row:
        raise HTTPException(status_code=404, detail="Lead not found")

    share_id = lead_row.get("report_share_id")
    buyer_name = lead_row.get("extracted_name")
    buyer_email = lead_row.get("extracted_email")

    if not share_id:
        return {
            "sessions": [],
            "hasSession": False,
            "summary": None,
            "insights": None
        }

    # Get actionable insights using the chat_insights service
    chat_insights = get_chat_insights(
        lead_id=lead_id,
        share_id=share_id,
        buyer_name=buyer_name,
        buyer_email=buyer_email
    )

    # Query chatbot sessions for this lead (for backward compatibility)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    session_id,
                    share_id,
                    lead_id,
                    buyer_identity_state,
                    contact_captured,
                    contact_id,
                    cta_shown,
                    cta_clicked,
                    message_count,
                    created_at,
                    last_activity
                FROM chatbot_sessions
                WHERE lead_id = %s OR share_id = %s
                ORDER BY last_activity DESC
            """, (lead_id, share_id))
            rows = fetchall_dicts(cur)

    sessions = []
    for row in rows:
        sessions.append({
            "sessionId": row["session_id"],
            "shareId": row["share_id"],
            "leadId": row["lead_id"],
            "buyerIdentityState": row["buyer_identity_state"],
            "contactCaptured": row["contact_captured"],
            "contactId": row["contact_id"],
            "ctaShown": row["cta_shown"],
            "ctaClicked": row["cta_clicked"],
            "messageCount": row["message_count"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "lastActivity": row["last_activity"].isoformat() if row["last_activity"] else None
        })

    # Merge insights into response
    if chat_insights.get("hasSession") and chat_insights.get("summary"):
        summary = chat_insights["summary"]
        return {
            "sessions": sessions,
            "hasSession": True,
            "summary": {
                "sessionId": summary.get("sessionId"),
                "totalMessages": summary.get("totalMessages", 0),
                "engagementLevel": summary.get("engagementLevel", "LOW"),
                "readiness": summary.get("readiness", "LOW"),
                "ctaShown": summary.get("ctaShown", False),
                "ctaClicked": summary.get("ctaClicked", False),
                "contactCaptured": summary.get("contactCaptured", False),
                "preferences": summary.get("preferences", {}),
                "propertiesDiscussed": summary.get("propertiesDiscussed", []),
                "lastActivity": summary.get("lastActivity")
            },
            "insights": chat_insights.get("insights")
        }

    # Fallback to basic summary if no insights
    total_messages = sum(row["message_count"] or 0 for row in rows)
    has_session = len(sessions) > 0 and total_messages > 0
    return {
        "sessions": sessions,
        "hasSession": has_session,
        "summary": {
            "sessionId": sessions[0]["sessionId"] if sessions else None,
            "totalMessages": total_messages,
            "engagementLevel": "HIGH" if total_messages >= 10 else "MEDIUM" if total_messages >= 5 else "LOW",
            "readiness": "LOW",
            "ctaShown": any(row["cta_shown"] for row in rows),
            "ctaClicked": any(row["cta_clicked"] for row in rows),
            "contactCaptured": any(row["contact_captured"] for row in rows),
            "preferences": {},
            "propertiesDiscussed": [],
            "lastActivity": sessions[0]["lastActivity"] if sessions else None
        } if has_session else None,
        "insights": None
    }
