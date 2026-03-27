"""
Buyer Report LLM Synthesis Service

Architecture: Three layers
1. Deterministic ranking via fit_score (done upstream in buyer_ranking.py)
2. Per-property LLM call → Agent's Take (parallel via ThreadPoolExecutor)
3. One framing LLM call → intro_paragraph + next_steps
4. Assemble synthesis dict with deterministic labels
"""

import json
import os
import re
from typing import Dict, Any, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
from google.genai import types
from .requirements_analyzer import (
    compute_requirements_checklist,
    compute_category_winners,
    compute_display_requirements,
    compute_rich_comparison,
)


def safe_int(value, default=0):
    """Safely convert a value to int."""
    try:
        return int(value) if value else default
    except (ValueError, TypeError):
        return default


# =============================================================================
# JSON PARSING — 3-tier fallback (proven pattern from gemini_client.py)
# =============================================================================

def _parse_gemini_json(text: str) -> Optional[Dict]:
    """Parse JSON from Gemini response with 3-tier fallback."""
    text = text.strip()
    # Clean trailing commas
    text_clean = re.sub(r',\s*}', '}', text)
    text_clean = re.sub(r',\s*]', ']', text_clean)

    # Tier 1: Direct parse
    try:
        return json.loads(text_clean)
    except json.JSONDecodeError as e:
        print(f"[REPORT SYNTHESIS] JSON tier-1 failed: {e} | text start: {text_clean[:300]}")

    # Tier 2: Extract from markdown code block
    md_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if md_match:
        try:
            return json.loads(md_match.group(1))
        except json.JSONDecodeError as e:
            print(f"[REPORT SYNTHESIS] JSON tier-2 failed: {e}")

    # Tier 3: Find any JSON object in text
    json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError as e:
            print(f"[REPORT SYNTHESIS] JSON tier-3 failed: {e}")

    print(f"[REPORT SYNTHESIS] All JSON parsing tiers failed. Full text: {text[:500]}")
    return None


# =============================================================================
# RICH CONTEXT BUILDER — full analysis for one property
# =============================================================================

def _build_rich_context(listing: Dict[str, Any], profile: Dict[str, Any]) -> str:
    """Build full-context prompt section for a single property."""
    ai_analysis = listing.get("aiAnalysis") or {}
    lead_analysis = listing.get("leadAnalysis") or {}

    # Structured fields
    address = listing.get("address", "?")
    city = listing.get("city", "?")
    price = safe_int(listing.get("listPrice"))
    beds = listing.get("bedrooms", "?")
    baths = listing.get("bathrooms", "?")
    sqft = safe_int(listing.get("sqft"))
    year_built = listing.get("yearBuilt", "?")
    dom = listing.get("daysOnMarket") or listing.get("days_on_market", "?")

    # Full remarks — NO truncation (Gemini handles it)
    remarks = listing.get("description") or listing.get("remarks") or ""

    # All fit chips
    fit_chips = listing.get("fit_chips") or []
    chip_lines = []
    for chip in fit_chips:
        chip_type = chip.get("type", "")
        label = chip.get("label", "")
        if chip_type == "hard":
            chip_lines.append(f"  [MISMATCH] {label}")
        elif chip_type == "soft":
            chip_lines.append(f"  [CAUTION] {label}")
        elif chip_type == "positive":
            chip_lines.append(f"  [MATCH] {label}")
    fit_score = listing.get("fit_score", "?")

    # All analysis items — no caps
    def _extract_items(items, key="requirement"):
        results = []
        for item in (items or []):
            if isinstance(item, dict):
                text = item.get(key) or item.get("feature") or item.get("concern") or str(item)
                evidence = item.get("evidence") or item.get("quote") or ""
                results.append(f"  - {text}" + (f" ({evidence})" if evidence else ""))
            else:
                results.append(f"  - {item}")
        return results

    whats_matching = _extract_items(ai_analysis.get("whats_matching", []))
    things_to_consider = _extract_items(
        ai_analysis.get("red_flags", []) + (lead_analysis.get("things_to_consider") or []),
        key="concern"
    )

    # Headline and agent summary from lead analysis
    headline = lead_analysis.get("headline") or ai_analysis.get("headline", "")
    agent_summary = lead_analysis.get("agent_summary") or ai_analysis.get("agent_take_ai", "")

    # Photo insights
    photo_insights = lead_analysis.get("photo_insights") or []
    photo_lines = []
    for pi in photo_insights:
        if isinstance(pi, dict):
            obs = pi.get("observation", "")
            pi_type = pi.get("type", "highlight")
            photo_lines.append(f"  [{pi_type.upper()}] {obs}")

    # Location data
    location_data = listing.get("locationAnalysis") or {}
    location_score = location_data.get("location_match_score", "?")
    location_flags = location_data.get("flags") or []
    location_flag_lines = [f"  - {f.get('flag', f) if isinstance(f, dict) else f}" for f in location_flags[:5]]

    # Comparison to original
    comparison = lead_analysis.get("comparison_to_original") or ai_analysis.get("comparison_to_original")
    comparison_line = ""
    if comparison and isinstance(comparison, dict):
        price_diff = comparison.get("price_diff", "?")
        key_diffs = comparison.get("key_differences", [])
        comparison_line = f"\nComparison to original: Price diff: {price_diff}"
        if key_diffs:
            comparison_line += f", Key differences: {', '.join(key_diffs[:3])}"

    # Is nearby flag
    nearby_tag = " [NEARBY]" if listing.get("isNearby") else ""

    context = f"""Property: {address}, {city}{nearby_tag}
Price: ${price:,} | {beds} beds, {baths} baths, {sqft:,} sqft | Built {year_built} | {dom} DOM
MLS: {listing.get('mlsNumber', '?')}
Fit Score: {fit_score}/100

Fit Signals:
{chr(10).join(chip_lines) if chip_lines else '  (none)'}
"""

    if headline:
        context += f"\nHeadline: {headline}"
    if agent_summary:
        context += f"\nAnalyst Summary: {agent_summary}"

    if remarks:
        context += f"\n\nFull Listing Description:\n{remarks}"

    if whats_matching:
        context += f"\n\nWhat's Matching:\n" + chr(10).join(whats_matching)

    if things_to_consider:
        context += f"\n\nThings to Consider:\n" + chr(10).join(things_to_consider)

    if photo_lines:
        context += f"\n\nPhoto Insights:\n" + chr(10).join(photo_lines)

    if location_flag_lines:
        context += f"\n\nLocation (score: {location_score}):\n" + chr(10).join(location_flag_lines)

    if comparison_line:
        context += comparison_line

    return context


# =============================================================================
# PER-PROPERTY: generate_agents_take
# =============================================================================

def _generate_agents_take(
    listing: Dict[str, Any],
    profile: Dict[str, Any],
    lead_context: Optional[Dict[str, Any]],
    gemini_client,
    model: str,
) -> Dict[str, Any]:
    """
    Generate Agent's Take for a single property via Gemini.

    Returns: {"mlsNumber": str, "agents_take": str}
    On failure: returns deterministic fallback from chips.
    """
    mls_number = listing.get("mlsNumber", "?")

    # Build buyer context summary
    buyer_summary = profile.get("aiSummary", "")
    if not buyer_summary:
        location = profile.get("location", "")
        beds = profile.get("bedrooms", "any")
        budget_max = safe_int(profile.get("budgetMax"))
        buyer_summary = f"Looking for {beds}+ beds in {location}, budget up to ${budget_max:,}."

    # Build buyer hard requirements
    req_parts = []
    if profile.get("minSqft"):
        req_parts.append(f"min {profile['minSqft']:,} sqft")
    if profile.get("minGarageSpaces"):
        req_parts.append(f"{profile['minGarageSpaces']}-car garage")
    if profile.get("maxMaintenanceFee") is not None and profile.get("maxMaintenanceFee") != "":
        fee = int(profile["maxMaintenanceFee"])
        req_parts.append("no HOA" if fee == 0 else f"HOA under ${fee:,}/mo")
    buyer_reqs = f"\nBuyer requirements: {'; '.join(req_parts)}" if req_parts else ""

    # Build rich property context
    property_context = _build_rich_context(listing, profile)

    # Comparison note for property-specific leads
    comparison_note = ""
    if lead_context and lead_context.get("propertyAddress"):
        comparison_note = f"\nThe buyer originally inquired about: {lead_context['propertyAddress']}"

    prompt = f"""Write the "Agent's Take" for this property — 2-3 sentences a senior agent would text their client.

RULES:
- Reference specific features by name ("the waterfront lot", "the updated kitchen")
- Be honest about tradeoffs — name them upfront
- If remarks say "AS IS" or "cash only" or photos show concerns, LEAD with that
- Sound warm but direct, not salesy
- Do NOT use: "stunning", "gorgeous", "perfect", "dream"
- If the property has [MISMATCH] fit signals, acknowledge what doesn't fit

Buyer: {buyer_summary}{buyer_reqs}{comparison_note}

---
{property_context}
---

Return JSON: {{"agents_take": "2-3 sentences..."}}"""

    try:
        response = gemini_client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.4,
                max_output_tokens=8192,
                response_mime_type="application/json",
            )
        )

        finish_reason = response.candidates[0].finish_reason if response.candidates else "no_candidates"
        print(f"[REPORT SYNTHESIS] agents_take response for {mls_number}: finish_reason={finish_reason}, len={len(response.text or '')}")

        if not response.text:
            raise ValueError(f"Empty response, finish_reason={finish_reason}")

        parsed = _parse_gemini_json(response.text)
        if parsed and parsed.get("agents_take"):
            print(f"[REPORT SYNTHESIS] agents_take generated for {mls_number}")
            return {"mlsNumber": mls_number, "agents_take": parsed["agents_take"]}

        raise ValueError(f"Missing agents_take in response: {response.text[:200]}")

    except Exception as e:
        print(f"[REPORT SYNTHESIS] agents_take failed for {mls_number}: {e}")
        return {"mlsNumber": mls_number, "agents_take": _fallback_agents_take(listing)}


def _fallback_agents_take(listing: Dict[str, Any]) -> str:
    """Deterministic fallback Agent's Take from chips."""
    chips = listing.get("fit_chips") or []
    city = listing.get("city", "this area")
    price = safe_int(listing.get("listPrice"))
    price_str = f"${price:,}" if price else "this home"

    hard_labels = [c["label"] for c in chips if c.get("type") == "hard"]
    positive_labels = [c["label"] for c in chips if c.get("type") == "positive"]

    if hard_labels:
        gaps = ", ".join(hard_labels[:2])
        positives = f" On the plus side: {', '.join(positive_labels[:2])}." if positive_labels else ""
        return f"This {city} home at {price_str} has some gaps vs your needs: {gaps}.{positives}"
    elif positive_labels:
        checks = ", ".join(positive_labels[:3])
        return f"This {city} home at {price_str} checks your key boxes: {checks}."
    else:
        return f"This {city} home at {price_str} is worth a closer look."


# =============================================================================
# RANKING + FRAMING: LLM decides final order with fit_scores as guardrails
# =============================================================================

def _generate_ranking_and_framing(
    profile: Dict[str, Any],
    listing_summaries: List[Dict[str, Any]],
    lead_context: Optional[Dict[str, Any]],
    gemini_client,
    model: str,
) -> Dict[str, Any]:
    """
    LLM ranks properties and writes intro/next_steps.

    Receives fit_scores + agents_takes as strong input.
    Can reorder among similar-scoring properties using qualitative judgment.
    Hard constraint: properties with fit_score < 20 cannot be "Top Match".

    Args:
        listing_summaries: [{mlsNumber, address, city, fit_score, hard_count, agents_take, is_nearby}]

    Returns: {"ranked_picks": [...], "intro_paragraph": str, "next_steps": str}
    """
    # Build lead-aware framing instructions
    framing_instruction = ""
    lead_section = ""

    if lead_context:
        source = lead_context.get("source", "online")
        has_property = lead_context.get("propertyAddress")
        has_budget = profile.get("budgetMax") or profile.get("budgetMin")
        location = profile.get("location", "the area")
        timeline = lead_context.get("timeline", "")

        if has_property:
            orig_addr = lead_context.get("propertyAddress")
            framing_instruction = f"Reference the property they were looking at: {orig_addr}"
            lead_section = f"Context: Lead from {source}, inquired about {orig_addr}."
            if timeline:
                lead_section += f" Timeline: {timeline}."
        elif has_budget:
            framing_instruction = "Reference 'the price range you mentioned' - do NOT say 'your budget'"
            lead_section = f"Context: Lead from {source}, interested in {location}."
        else:
            framing_instruction = f"Keep it general - reference 'homes in {location}'"
            lead_section = f"Context: Lead from {source}, interested in {location}."

        framing_instruction += "\n- This is FIRST CONTACT — be warm and invitational, not salesy"
        framing_instruction += "\n- NEVER say 'your budget', 'your criteria', or 'matches your requirements'"

    # Expansion context
    expansion_note = ""
    if lead_context and lead_context.get("expansionUsed"):
        center_city = lead_context.get("expansionCenterCity", "the area")
        city_breakdown = lead_context.get("cityBreakdown", {})
        city_parts = [f"{count} in {city}" for city, count in city_breakdown.items()]
        expansion_note = f"\nInventory in {center_city} is limited — search expanded to: {', '.join(city_parts)}. Mention this naturally in the intro."

    # Build property list with scores + takes
    property_lines = []
    for ls in listing_summaries:
        nearby = " [NEARBY]" if ls.get("is_nearby") else ""
        score = ls.get("fit_score", "?")
        hard = ls.get("hard_count", 0)
        hard_note = f" ({hard} hard mismatches)" if hard > 0 else ""
        property_lines.append(
            f"- MLS {ls['mlsNumber']}: {ls['address']}, {ls['city']}{nearby} | Fit Score: {score}/100{hard_note}\n"
            f"  Agent's Take: {ls['agents_take']}"
        )

    prompt = f"""You are an experienced real estate agent. Rank these properties and write the report intro.

{lead_section}
{framing_instruction}
{expansion_note}

Properties (pre-sorted by fit score, you may reorder with good reason):
{chr(10).join(property_lines)}

RANKING RULES:
- The fit score (0-100) reflects how well each property matches the buyer's requirements. Use it as your starting point.
- You MAY reorder properties with similar scores based on qualitative factors (livability, remarks quality, location appeal).
- HARD RULE: A property with fit_score below 20 or multiple hard mismatches must NEVER be ranked #1.
- Use these labels in order: "Top Match", "Strong Alternative", "Worth Considering", "Good Backup". If #1 has hard mismatches, use "Best Available" instead of "Top Match".

Return JSON:
{{
  "intro_paragraph": "2-3 sentences. Set context, be warm. {framing_instruction}",
  "ranked_picks": [
    {{
      "mlsNumber": "exact MLS from input",
      "label": "one of the labels above",
      "why": "the Agent's Take text provided above — you may lightly edit for flow but keep the substance"
    }}
  ],
  "next_steps": "1-2 sentences. Warm CTA."
}}

IMPORTANT:
- Include ALL {len(listing_summaries)} properties in ranked_picks
- Use the EXACT mlsNumber from the input
- The "why" field should be the Agent's Take — do not rewrite it substantially
- Do NOT use "stunning", "gorgeous", "perfect", "dream"
"""

    try:
        response = gemini_client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=4096,
                response_mime_type="application/json",
            )
        )

        finish_reason = response.candidates[0].finish_reason if response.candidates else "no_candidates"
        print(f"[REPORT SYNTHESIS] Ranking+framing response: finish_reason={finish_reason}, len={len(response.text or '')}")

        if not response.text:
            raise ValueError(f"Empty response, finish_reason={finish_reason}")

        parsed = _parse_gemini_json(response.text)
        if parsed and parsed.get("ranked_picks") and parsed.get("intro_paragraph"):
            # Validate MLS numbers
            input_mls = {ls["mlsNumber"] for ls in listing_summaries}
            output_mls = {p["mlsNumber"] for p in parsed["ranked_picks"]}
            # Filter hallucinated MLS numbers
            parsed["ranked_picks"] = [p for p in parsed["ranked_picks"] if p["mlsNumber"] in input_mls]

            # Enforce hard rule: fit_score < 20 cannot be #1 "Top Match"
            if parsed["ranked_picks"]:
                first_mls = parsed["ranked_picks"][0]["mlsNumber"]
                first_summary = next((ls for ls in listing_summaries if ls["mlsNumber"] == first_mls), {})
                if first_summary.get("fit_score", 100) < 20 or first_summary.get("hard_count", 0) >= 3:
                    parsed["ranked_picks"][0]["label"] = "Best Available"
                    print(f"[REPORT SYNTHESIS] Enforced 'Best Available' for low-score #1: {first_mls}")

            print(f"[REPORT SYNTHESIS] Ranking+framing generated: {[p['mlsNumber'] for p in parsed['ranked_picks']]}")
            return {
                "intro_paragraph": parsed["intro_paragraph"],
                "ranked_picks": parsed["ranked_picks"],
                "next_steps": parsed.get("next_steps", "Let me know which properties you'd like to learn more about."),
            }

        raise ValueError(f"Missing required fields: {response.text[:300]}")

    except Exception as e:
        print(f"[REPORT SYNTHESIS] Ranking+framing failed: {e}, using deterministic fallback")
        # Deterministic fallback — use fit_score order as-is
        count = len(listing_summaries)
        if lead_context and lead_context.get("propertyAddress"):
            intro = f"I saw you were looking at {lead_context['propertyAddress']}. Here are {count} similar homes you might want to explore."
        else:
            location = profile.get("location", "the area")
            intro = f"I've reviewed the market and selected {count} homes in {location} that are worth a look."

        ranked_picks = []
        for idx, ls in enumerate(listing_summaries):
            hard = ls.get("hard_count", 0)
            ranked_picks.append({
                "mlsNumber": ls["mlsNumber"],
                "label": _get_rank_label(idx + 1, hard),
                "why": ls.get("agents_take") or _fallback_agents_take_from_summary(ls),
            })

        return {
            "intro_paragraph": intro,
            "ranked_picks": ranked_picks,
            "next_steps": "Let me know which properties you'd like to schedule showings for.",
        }


def _fallback_agents_take_from_summary(ls: Dict[str, Any]) -> str:
    """Minimal fallback when we only have listing summary."""
    return f"This {ls.get('city', '')} property is worth a closer look."


# =============================================================================
# DETERMINISTIC RANK LABELS
# =============================================================================

_RANK_LABELS = {
    1: "Top Match",
    2: "Strong Alternative",
    3: "Worth Considering",
    4: "Worth Considering",
    5: "Good Backup",
}


def _get_rank_label(rank: int, hard_count: int) -> str:
    """Get deterministic label. If #1 has hard mismatches, use 'Best Available'."""
    if rank == 1 and hard_count > 0:
        return "Best Available"
    return _RANK_LABELS.get(rank, f"Option #{rank}")


# =============================================================================
# ORCHESTRATOR: generate_report_synthesis
# =============================================================================

def generate_report_synthesis(
    profile: Dict[str, Any],
    listings: List[Dict[str, Any]],
    lead_context: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate LLM synthesis for buyer report.

    Architecture:
    1. Listings arrive pre-sorted by fit_score (deterministic ranking)
    2. N parallel Gemini calls → per-property Agent's Take
    3. 1 Gemini call → intro_paragraph + next_steps (framing)
    4. Assemble synthesis dict with deterministic labels
    """
    if not listings:
        return {
            "intro_paragraph": "No properties matched your search criteria at this time.",
            "ranked_picks": [],
            "next_steps": "I'll continue monitoring new listings and reach out when strong matches appear."
        }

    # Gemini client
    gemini_key = os.environ.get("GEMINI_API_KEY")
    gemini_client = genai.Client(api_key=gemini_key)
    model = os.environ.get("GEMINI_MODEL_SYNTHESIS", "gemini-2.5-flash")

    # =========================================================================
    # Step 1: Per-property Agent's Take (parallel)
    # =========================================================================
    agents_takes = {}  # mlsNumber -> agents_take string

    def _gen_take(listing):
        return _generate_agents_take(listing, profile, lead_context, gemini_client, model)

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(_gen_take, l): l for l in listings}
        for future in as_completed(futures):
            try:
                result = future.result()
                agents_takes[result["mlsNumber"]] = result["agents_take"]
            except Exception as e:
                listing = futures[future]
                mls = listing.get("mlsNumber", "?")
                print(f"[REPORT SYNTHESIS] ThreadPool error for {mls}: {e}")
                agents_takes[mls] = _fallback_agents_take(listing)

    print(f"[REPORT SYNTHESIS] Per-property agents_take generated for {len(agents_takes)} listings")

    # =========================================================================
    # Step 2: Ranking + Framing (LLM sees fit_scores + agents_takes, decides order)
    # =========================================================================
    listing_summaries = []
    for listing in listings:
        mls = listing.get("mlsNumber", "?")
        hard_count = sum(1 for c in (listing.get("fit_chips") or []) if c.get("type") == "hard")
        listing_summaries.append({
            "mlsNumber": mls,
            "address": listing.get("address", "?"),
            "city": listing.get("city", "?"),
            "fit_score": listing.get("fit_score", 0),
            "hard_count": hard_count,
            "agents_take": agents_takes.get(mls, _fallback_agents_take(listing)),
            "is_nearby": listing.get("isNearby", False),
        })

    result = _generate_ranking_and_framing(profile, listing_summaries, lead_context, gemini_client, model)

    synthesis = {
        "intro_paragraph": result["intro_paragraph"],
        "ranked_picks": result["ranked_picks"],
        "next_steps": result["next_steps"],
    }

    # Add buyer-aware display requirements
    display_requirements = compute_display_requirements(profile, listings)
    synthesis["display_requirements"] = display_requirements
    synthesis["requirements_table"] = display_requirements["table"]

    # Add category winners
    category_winners = compute_category_winners(
        profile,
        listings,
        ranked_picks=synthesis.get("ranked_picks", [])
    )
    synthesis["category_winners"] = category_winners

    # Add rich comparison data
    is_lead = lead_context is not None
    buyer_hints = (lead_context or {}).get("allHints", [])
    rich_comparison = compute_rich_comparison(profile, listings, is_lead_report=is_lead, buyer_hints=buyer_hints)
    synthesis["rich_comparison"] = rich_comparison

    # Include lead_context in synthesis for frontend rendering
    if lead_context:
        synthesis["lead_context"] = lead_context

    # Lead paint alert for MA Lead Law compliance
    if profile.get("has_kids"):
        pre_1978 = [l for l in listings if l.get("yearBuilt") and safe_int(l.get("yearBuilt"), 2000) < 1978]
        if pre_1978:
            addrs = ", ".join(l.get("address", "?") for l in pre_1978)
            synthesis["lead_paint_alert"] = f"Properties built before 1978 ({addrs}) are subject to MA Lead Law. Ask about lead paint disclosure."

    print(f"[REPORT SYNTHESIS] Generated synthesis for {len(listings)} properties")
    print(f"[REPORT SYNTHESIS] Category winners: {category_winners}")
    if lead_context:
        print(f"[REPORT SYNTHESIS] Lead context included from {lead_context.get('source', 'unknown')} lead")
    return synthesis


# =============================================================================
# FALLBACK (if entire synthesis pipeline fails — called from routers)
# =============================================================================

def _generate_fallback_synthesis(
    listings: List[Dict[str, Any]],
    profile: Dict[str, Any] = None,
    lead_context: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Fallback synthesis if LLM fails entirely."""
    sorted_listings = sorted(
        listings,
        key=lambda x: x.get("fit_score") or x.get("fitScore") or 0,
        reverse=True
    )

    ranked_picks = []
    for idx, listing in enumerate(sorted_listings):
        hard_count = sum(1 for c in (listing.get("fit_chips") or []) if c.get("type") == "hard")
        ranked_picks.append({
            "mlsNumber": listing.get("mlsNumber"),
            "label": _get_rank_label(idx + 1, hard_count),
            "why": _fallback_agents_take(listing),
        })

    synthesis = {
        "intro_paragraph": f"I've reviewed the market and selected {len(listings)} homes that match your search criteria.",
        "ranked_picks": ranked_picks,
        "next_steps": "Let me know which properties you'd like to schedule showings for."
    }

    if profile:
        display_requirements = compute_display_requirements(profile, listings)
        synthesis["display_requirements"] = display_requirements
        synthesis["requirements_table"] = display_requirements["table"]
        synthesis["category_winners"] = compute_category_winners(
            profile,
            listings,
            ranked_picks=synthesis.get("ranked_picks", [])
        )
        is_lead = lead_context is not None
        buyer_hints = (lead_context or {}).get("allHints", [])
        synthesis["rich_comparison"] = compute_rich_comparison(profile, listings, is_lead_report=is_lead, buyer_hints=buyer_hints)

    return synthesis
