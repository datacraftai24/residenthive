"""
Buyer Report LLM Synthesis Service

Generates cross-property narrative for buyer reports:
- Intro paragraph (search summary)
- Ranked picks (all 5 properties with labels)
- Next steps (call to action)
- Requirements table (deterministic checklist)
- Category winners (best in each category)
"""

import json
import os
from typing import Dict, Any, List
from openai import OpenAI
from .requirements_analyzer import compute_requirements_checklist, compute_category_winners, compute_display_requirements


def generate_report_synthesis(
    profile: Dict[str, Any],
    listings: List[Dict[str, Any]],
    lead_context: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate LLM synthesis for buyer report.

    Args:
        profile: Buyer profile with aiSummary, must-haves, etc.
        listings: List of 3-5 listing dicts with full aiAnalysis
        lead_context: Optional context from parent lead (for lead-based reports)
            {
                "leadId": int,
                "source": str,  # zillow, redfin, etc.
                "leadType": str,  # property_specific, area_search, general
                "propertyAddress": str,
                "propertyListPrice": int,
                "propertyBedrooms": int,
                "propertyBathrooms": str,
                "propertySqft": int,
                "propertyImageUrl": str,
                "originalMessage": str,
                "timeline": str
            }

    Returns:
        {
            "intro_paragraph": str,
            "ranked_picks": [
                {
                    "mlsNumber": str,
                    "label": str,  # e.g., "Top pick", "Strong backup"
                    "why": str     # 1-2 sentences explaining ranking
                }
            ],
            "next_steps": str,
            "lead_context": dict (if lead_context was provided)
        }
    """
    if not listings:
        return {
            "intro_paragraph": "No properties matched your search criteria at this time.",
            "ranked_picks": [],
            "next_steps": "I'll continue monitoring new listings and reach out when strong matches appear."
        }

    # Build condensed DTO for each listing (for LLM prompt)
    listing_dtos = []
    for idx, listing in enumerate(listings, 1):
        # Handle None explicitly - aiAnalysis can be None for similar listings
        ai_analysis = listing.get("aiAnalysis") or {}

        # Extract top matches/concerns (limit to top 2-3 each)
        whats_matching = ai_analysis.get("whats_matching", [])[:3]
        whats_missing = ai_analysis.get("whats_missing", [])[:2]
        red_flags = ai_analysis.get("red_flags", [])[:2]
        agent_take = ai_analysis.get("agent_take_ai", "")

        dto = {
            "number": idx,
            "mlsNumber": listing.get("mlsNumber"),
            "address": listing.get("address"),
            "city": listing.get("city"),
            "price": listing.get("listPrice"),
            "beds": listing.get("bedrooms"),
            "baths": listing.get("bathrooms"),
            "sqft": listing.get("sqft"),
            "why_match": whats_matching,
            "what_missing": whats_missing,
            "concerns": red_flags,
            "my_take": agent_take[:200] if agent_take else ""  # Truncate to 200 chars
        }
        listing_dtos.append(dto)

    # Build buyer summary for prompt
    buyer_summary = profile.get("aiSummary", "")
    if not buyer_summary:
        # Fallback: build from profile fields
        location = profile.get("location", "")

        # Safely convert budget to integers with comprehensive error handling
        try:
            budget_min_raw = profile.get('budgetMin', 0)
            if budget_min_raw:
                budget_min = int(float(budget_min_raw))  # Handle string numbers
            else:
                budget_min = 0
        except (ValueError, TypeError) as e:
            print(f"[REPORT SYNTHESIS] Invalid budgetMin value: {profile.get('budgetMin')} - {e}")
            budget_min = 0

        try:
            budget_max_raw = profile.get('budgetMax', 0)
            if budget_max_raw:
                budget_max = int(float(budget_max_raw))  # Handle string numbers
            else:
                budget_max = 0
        except (ValueError, TypeError) as e:
            print(f"[REPORT SYNTHESIS] Invalid budgetMax value: {profile.get('budgetMax')} - {e}")
            budget_max = 0

        budget = f"${budget_min:,} - ${budget_max:,}"
        beds = profile.get("bedrooms", "any")
        buyer_summary = f"Buyer is looking for {beds}+ bedrooms in {location}, budget {budget}."

    # Call OpenAI for synthesis
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")

    # Use lead-aware prompts if lead_context is provided (any lead type)
    if lead_context:
        # Determine lead scenario
        has_property = lead_context.get("propertyAddress")
        has_budget = profile.get("budgetMax") or profile.get("budgetMin")
        location = profile.get("location", "the area")
        source = lead_context.get("source", "online")
        timeline = lead_context.get("timeline", "")

        # Build scenario-specific framing
        if has_property:
            # Scenario 1: Property-specific lead
            orig_addr = lead_context.get("propertyAddress")
            orig_price = lead_context.get("propertyListPrice", 0)
            orig_beds = lead_context.get("propertyBedrooms", "?")
            orig_baths = lead_context.get("propertyBathrooms", "?")
            orig_sqft = lead_context.get("propertySqft", "?")

            framing_instruction = f"Reference the property they were looking at: {orig_addr}"
            intro_example = f"I saw you were looking at {orig_addr}. Here are a few similar homes you might want to explore..."

            lead_section = f"""
## Context (from {source.title()} inquiry)
The person was looking at:
- Property: {orig_addr}
- Listed at: ${orig_price:,}
- {orig_beds} beds, {orig_baths} baths{f", {orig_sqft:,} sqft" if orig_sqft and orig_sqft != "?" else ""}
{f"- Timeline mentioned: {timeline}" if timeline else ""}

You've found similar properties they might want to explore.

"""
            print(f"[REPORT SYNTHESIS] Lead scenario: PROPERTY-SPECIFIC from {source}")

        elif has_budget:
            # Scenario 2: Budget mentioned but no property
            framing_instruction = f"Reference 'the price range you mentioned' - do NOT say 'your budget'"
            intro_example = f"Based on the price range you mentioned, here are some homes in {location} worth exploring..."

            lead_section = f"""
## Context (from {source.title()} inquiry)
The person is interested in:
- Location: {location}
- Price range mentioned: up to ${profile.get('budgetMax', 0):,}
{f"- Timeline mentioned: {timeline}" if timeline else ""}

You've found properties in the price range they mentioned.

"""
            print(f"[REPORT SYNTHESIS] Lead scenario: BUDGET-MENTIONED from {source}")

        else:
            # Scenario 3: General inquiry - no property, no budget
            framing_instruction = f"Keep it general - reference 'homes in {location}' or 'what's currently on the market'"
            intro_example = f"Here are some homes currently on the market in {location} that you might find interesting..."

            lead_section = f"""
## Context (from {source.title()} inquiry)
The person is interested in:
- Location: {location}
{f"- Timeline mentioned: {timeline}" if timeline else ""}

You've found some options based on current market availability.

"""
            print(f"[REPORT SYNTHESIS] Lead scenario: GENERAL-INQUIRY from {source}")

        # Lead-based report: softer tone for first contact
        system_prompt = f"""You are an experienced real estate agent writing a property report for someone who recently reached out.

CRITICAL - FIRST CONTACT RULES:
- This is your FIRST interaction - be helpful, not presumptuous
- NEVER say "your budget" - say "the price range you mentioned" or omit price framing entirely
- NEVER say "your criteria" or "matches your requirements"
- NEVER assume what they're looking for beyond what they explicitly mentioned
- Be warm and invitational, not salesy

FRAMING FOR THIS LEAD:
{framing_instruction}

EXAMPLE INTRO:
"{intro_example}"

Return JSON with:
{{
  "intro_paragraph": "2-3 sentences. Follow the framing above. Be invitational, not presumptuous.",
  "ranked_picks": [
    {{
      "mlsNumber": "exact MLS number from input",
      "label": "use one of: 'Top Match', 'Strong Alternative', 'Comparable Option', 'Worth Considering', 'Good Backup'",
      "why": "1-2 sentences about what makes this property stand out (objective features, not matching to assumed preferences)"
    }},
    ... (include ALL properties, ranked by overall appeal)
  ],
  "next_steps": "Warm, invitational CTA. Example: 'If any of these catch your eye, I'd be happy to answer questions.'"
}}"""

    else:
        # Regular report: no lead context (buyer profile report)
        system_prompt = """You are an experienced buyer's agent writing a concise property report summary.

Guidelines:
- Compare ONLY the properties provided (do not invent facts or mention other properties)
- Rank all properties from best to least suitable based on the buyer's needs
- Be specific about trade-offs (e.g., "this one has the best yard but longer commute")
- Use natural, conversational language (as if writing to a real client)
- Do not mention "AI", "model", "fitScore", or technical terms
- Focus on actionable recommendations

Return JSON with:
{
  "intro_paragraph": "2-3 sentences summarizing the search and why you selected these homes",
  "ranked_picks": [
    {
      "mlsNumber": "exact MLS number from input",
      "label": "use one of: 'Top Match', 'Strong Alternative', 'Comparable Option', 'Worth Considering', 'Good Backup'",
      "why": "1-2 sentences explaining why this ranking vs the others"
    },
    ... (include ALL properties, ranked best to least suitable)
  ],
  "next_steps": "1-2 sentences with call to action (e.g., 'Reply with which homes you'd like to see this weekend')"
}"""
        lead_section = ""

    user_prompt = f"""{lead_section}Buyer Profile:
{buyer_summary}

Properties I've selected (in order shown):

"""

    for dto in listing_dtos:
        # Convert price and sqft to int for formatting with thousand separators
        try:
            price_int = int(float(dto['price'])) if dto['price'] else 0
        except (ValueError, TypeError) as e:
            print(f"[REPORT SYNTHESIS] Invalid price for {dto.get('mlsNumber')}: {dto.get('price')} - {e}")
            price_int = 0

        try:
            sqft_int = int(float(dto['sqft'])) if dto['sqft'] else 0
        except (ValueError, TypeError) as e:
            print(f"[REPORT SYNTHESIS] Invalid sqft for {dto.get('mlsNumber')}: {dto.get('sqft')} - {e}")
            sqft_int = 0

        # Ensure beds/baths are safe to interpolate
        beds = dto.get('beds', 0)
        baths = dto.get('baths', 0)

        user_prompt += f"""
#{dto['number']}: {dto['address']}, {dto['city']}
Price: ${price_int:,} | {beds} beds, {baths} baths, {sqft_int:,} sqft
MLS: {dto['mlsNumber']}

Why it matches:
{chr(10).join(f"• {m}" for m in dto['why_match'])}

What you should know:
{chr(10).join(f"• {c}" for c in (dto['what_missing'] + dto['concerns']))}

{f"My take: {dto['my_take']}" if dto['my_take'] else ""}

---
"""

    user_prompt += f"""
Now, synthesize a report that:
1. Introduces the search (intro_paragraph)
2. Ranks all {len(listing_dtos)} properties from best to least suitable (ranked_picks)
3. Suggests next steps (next_steps)

Return JSON only, no extra commentary.
"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=1500
        )

        content = response.choices[0].message.content.strip()
        synthesis = json.loads(content)

        # Validate structure
        if not all(key in synthesis for key in ["intro_paragraph", "ranked_picks", "next_steps"]):
            raise ValueError("LLM response missing required fields")

        if not isinstance(synthesis["ranked_picks"], list):
            raise ValueError("ranked_picks must be a list")

        # Ensure all MLSNumbers match input
        input_mls = {l["mlsNumber"] for l in listings}
        output_mls = {p["mlsNumber"] for p in synthesis["ranked_picks"]}
        if output_mls - input_mls:
            # LLM hallucinated MLS numbers - filter them out
            synthesis["ranked_picks"] = [
                p for p in synthesis["ranked_picks"]
                if p["mlsNumber"] in input_mls
            ]

        # Add buyer-aware display requirements (dynamic criteria, labels, table)
        display_requirements = compute_display_requirements(profile, listings)
        synthesis["display_requirements"] = display_requirements

        # Keep legacy requirements_table for backwards compatibility
        synthesis["requirements_table"] = display_requirements["table"]

        # Add category winners (pass ranked_picks to align Best Overall with #1 rank)
        category_winners = compute_category_winners(
            profile,
            listings,
            ranked_picks=synthesis.get("ranked_picks", [])
        )
        synthesis["category_winners"] = category_winners

        # Include lead_context in synthesis for frontend rendering
        if lead_context:
            synthesis["lead_context"] = lead_context

        print(f"[REPORT SYNTHESIS] Generated synthesis for {len(listings)} properties")
        print(f"[REPORT SYNTHESIS] Category winners: {category_winners}")
        if lead_context:
            print(f"[REPORT SYNTHESIS] Lead context included from {lead_context.get('source', 'unknown')} lead")
        return synthesis

    except json.JSONDecodeError as e:
        print(f"[REPORT SYNTHESIS] JSON parse error: {e}")
        # Fallback to simple ranking
        return _generate_fallback_synthesis(listings, profile)
    except Exception as e:
        print(f"[REPORT SYNTHESIS] Error: {e}")
        return _generate_fallback_synthesis(listings, profile)


def _generate_fallback_synthesis(
    listings: List[Dict[str, Any]],
    profile: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Fallback synthesis if LLM fails."""
    # Sort by fitScore (if available)
    sorted_listings = sorted(
        listings,
        key=lambda x: x.get("fitScore", 0),
        reverse=True
    )

    ranked_picks = []
    labels = ["Top Match", "Strong Alternative", "Comparable Option", "Worth Considering", "Good Backup"]

    for idx, listing in enumerate(sorted_listings):
        ranked_picks.append({
            "mlsNumber": listing.get("mlsNumber"),
            "label": labels[idx] if idx < len(labels) else f"Option #{idx + 1}",
            "why": f"Based on overall fit to your requirements."
        })

    synthesis = {
        "intro_paragraph": f"I've reviewed the market and selected {len(listings)} homes that match your search criteria.",
        "ranked_picks": ranked_picks,
        "next_steps": "Let me know which properties you'd like to schedule showings for."
    }

    # Add requirements table and category winners if profile is provided
    if profile:
        display_requirements = compute_display_requirements(profile, listings)
        synthesis["display_requirements"] = display_requirements
        synthesis["requirements_table"] = display_requirements["table"]
        synthesis["category_winners"] = compute_category_winners(
            profile,
            listings,
            ranked_picks=synthesis.get("ranked_picks", [])
        )

    return synthesis
