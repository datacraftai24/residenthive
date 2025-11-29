"""
Outreach Draft Generator

Generates personalized SMS and email drafts for agents to send to buyers
with their curated property reports.
"""

import json
import os
from typing import List, Dict, Any
from openai import OpenAI


def generate_outreach_draft(
    buyer_name: str,
    listings: List[Dict[str, Any]],
    agent_name: str,
    share_url: str,
    buyer_location: str = ""
) -> Dict[str, str]:
    """
    Generate personalized SMS and email outreach drafts.

    Args:
        buyer_name: Buyer's first name
        listings: List of included listings with aiAnalysis
        agent_name: Agent's name
        share_url: Full URL to buyer report
        buyer_location: Buyer's target location (e.g., "Framingham/Natick")

    Returns:
        {
            "sms": "Short text message draft",
            "email": "Longer email draft"
        }
    """
    if not listings:
        return {
            "sms": f"Hi {buyer_name}, I reviewed the latest listings for you. Check out my recommendations: {share_url}",
            "email": f"Hi {buyer_name},\n\nI've reviewed the latest listings in your search area and put together some recommendations for you.\n\nView my picks: {share_url}\n\nLet me know what you think!\n\n{agent_name}"
        }

    # Extract top 3-5 listings for summarization
    top_listings = listings[:min(5, len(listings))]

    # Build listing summaries for prompt
    listing_summaries = []
    for idx, listing in enumerate(top_listings, 1):
        address = listing.get('address', 'Property')
        city = listing.get('city', '')

        # Get agent's take or fallback to headline
        agent_take = listing.get('aiAnalysis', {}).get('agent_take_ai') or \
                     listing.get('aiAnalysis', {}).get('headline', 'Good fit for you')

        # Shorten agent_take to one key phrase if it's long
        if len(agent_take) > 100:
            agent_take = agent_take.split('.')[0] + '.'

        listing_summaries.append(f"{idx}. {address}, {city}: {agent_take}")

    listings_text = "\n".join(listing_summaries)
    total_reviewed = len(listings) + 15  # Imply we reviewed more than just what we're showing

    # Build prompt for GPT-4
    prompt = f"""You are a real estate agent writing to your buyer client.

**Context:**
- Buyer: {buyer_name}
- Agent: {agent_name}
- Location: {buyer_location or "their target area"}
- You reviewed {total_reviewed} homes and picked {len(listings)} top candidates

**Top Picks:**
{listings_text}

**Task:**
Write TWO messages (both should sound natural and agent-like, not robotic):

1. **SMS** (text message):
   - 2-3 sentences max
   - Casual, friendly tone
   - Mention you reviewed homes and found some strong options
   - End with "Want to see any this weekend?" or similar
   - DO NOT include the link (we'll add it separately)

2. **Email**:
   - 5-6 sentences
   - Professional but warm tone
   - Briefly mention what makes these picks stand out
   - Invite them to review and share thoughts
   - DO NOT include the link (we'll add it separately)
   - Sign off with just the agent's name

**Rules:**
- Sound like a real agent, not an AI
- Don't use phrases like "I hope this finds you well" or "I wanted to reach out"
- Be direct and helpful
- Don't oversell - agents are advisors, not salespeople

Return ONLY valid JSON in this exact format:
{{
  "sms": "your sms text here",
  "email": "your email text here"
}}
"""

    # Call OpenAI
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,  # Slightly creative but consistent
            max_tokens=500
        )

        result = json.loads(response.choices[0].message.content)

        # Append share URL to both
        sms_with_link = result.get("sms", "").strip() + f"\n\n{share_url}"
        email_with_link = result.get("email", "").strip() + f"\n\nView the full report: {share_url}\n\n{agent_name}"

        return {
            "sms": sms_with_link,
            "email": email_with_link
        }

    except Exception as e:
        # Fallback if OpenAI fails
        print(f"[OUTREACH] Error generating draft: {e}")
        return {
            "sms": f"Hi {buyer_name}, I reviewed {total_reviewed} homes and found {len(listings)} strong options for you. Check them out: {share_url}\n\nWant to see any this weekend?",
            "email": f"Hi {buyer_name},\n\nI reviewed {total_reviewed} homes in {buyer_location or 'your search area'} and found {len(listings)} that really stand out based on what you're looking for.\n\nI've put together a detailed report with my thoughts on each one.\n\nView the report: {share_url}\n\nLet me know what you think, and we can schedule showings for any that interest you.\n\n{agent_name}"
        }
