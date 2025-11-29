"""
AI-powered photo analysis service using OpenAI Vision.
Analyzes property photos against buyer's visionChecklist requirements.
"""
from typing import Dict, Any, List
import os
import json
import base64
from openai import OpenAI


def analyze_property_photos(
    profile: Dict[str, Any],
    listing: Dict[str, Any],
    ranking_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Run GPT-4o Vision on listing photos + buyer's visionChecklist.

    Args:
        profile: Full buyer profile (must include visionChecklist)
        listing: Normalized listing dict with images array
        ranking_context: {fit_score, priority_tag, final_score, rank}

    Returns:
        {
            "photo_headline": str,
            "photo_summary": str,
            "photo_matches": [...],  # max 8
            "photo_red_flags": [...]  # max 5
        }
    """
    # Fallback response for errors
    fallback = {
        "photo_headline": "Photo analysis unavailable",
        "photo_summary": "We could not analyze photos for this property.",
        "photo_matches": [],
        "photo_red_flags": []
    }

    try:
        # Get all photos for analysis (demo mode - no limit)
        images = listing.get("images") or []
        selected_photos = images  # Send all photos for comprehensive analysis

        # No photos fallback
        if not selected_photos:
            return {
                "photo_headline": "No listing photos available",
                "photo_summary": "This listing did not provide any photos, so no visual analysis could be performed. Ask the listing agent for a video tour or more images.",
                "photo_matches": [],
                "photo_red_flags": []
            }

        # Get visionChecklist - first 8 items
        # Handle nested structure: {structural: [], lifestyle: [], dealbreakers: [], optional: []}
        vision_checklist_raw = profile.get("visionChecklist")
        vision_checklist = []

        if isinstance(vision_checklist_raw, list):
            vision_checklist = vision_checklist_raw
        elif isinstance(vision_checklist_raw, dict):
            # Flatten nested structure - prioritize structural and dealbreakers
            for key in ["structural", "dealbreakers", "lifestyle", "optional"]:
                items = vision_checklist_raw.get(key, [])
                if isinstance(items, list):
                    vision_checklist.extend(items)

        # Send all requirements - let the model prioritize
        requirements = vision_checklist

        if not requirements:
            return {
                "photo_headline": "No visual requirements defined",
                "photo_summary": "The buyer profile does not have a visionChecklist, so no targeted photo analysis could be performed.",
                "photo_matches": [],
                "photo_red_flags": []
            }

        # Build prompt
        prompt = _build_photo_prompt(profile, listing, ranking_context, requirements)

        # Call OpenAI Vision
        listing_id = listing.get("mlsNumber") or listing.get("mls_number") or listing.get("id") or "unknown"
        print(f"[PHOTO ANALYZER] Sending {len(selected_photos)} photos for listing {listing_id}")
        analysis = _call_vision_api(prompt, selected_photos)

        # Validate and truncate
        analysis = _validate_and_truncate(analysis)

        print(f"[PHOTO ANALYZER] Success for listing {listing_id}: {len(analysis['photo_matches'])} matches, {len(analysis['photo_red_flags'])} flags")

        return analysis

    except Exception as e:
        listing_id = listing.get("mlsNumber") or listing.get("id") or "unknown"
        print(f"[PHOTO ANALYZER] Error for listing {listing_id}: {e}")
        return fallback


def _build_photo_prompt(
    profile: Dict[str, Any],
    listing: Dict[str, Any],
    ranking_context: Dict[str, Any],
    requirements: List[str]
) -> str:
    """Build the vision prompt with buyer context and requirements."""
    buyer_name = profile.get("name", "the buyer")
    ai_summary = profile.get("aiSummary", "No buyer summary available.")

    # Listing context
    address = listing.get("address", "Unknown")
    city = listing.get("city", "")
    price = listing.get("price", 0)
    bedrooms = listing.get("bedrooms", "N/A")
    bathrooms = listing.get("bathrooms", "N/A")
    year_built = listing.get("year_built", "N/A")

    # Ranking context
    fit_score = ranking_context.get("fit_score", 0)
    priority_tag = ranking_context.get("priority_tag", "REVIEW")

    # Format requirements list
    requirements_text = "\n".join(f"  {i+1}. {req}" for i, req in enumerate(requirements))

    prompt = f"""You are an AI vision analyst trained specifically for residential real estate evaluation.
Your task is to analyze ALL listing photos to detect visual signals that matter to homebuyers and agents.

BUYER CONTEXT:
Name: {buyer_name}
Who they are: {ai_summary}

PROPERTY:
Address: {address}, {city}
Price: ${price:,}
Beds: {bedrooms} | Baths: {bathrooms}
Year Built: {year_built}
Current Fit Score: {fit_score}/100
Priority: {priority_tag}

BUYER'S VISUAL REQUIREMENTS (visionChecklist):
{requirements_text}

You MUST follow these rules:

=== STEP 1 — GLOBAL SCAN (MANDATORY) ===

Before checking ANY requirement, scan ALL photos and create an internal map of what you see:

For EACH photo, note internally (do not output yet):
- exterior front?
- driveway visible?
- garage visible?
- roof angle or shingles visible?
- siding close-up?
- backyard?
- fencing?
- landscaping condition?
- kitchen?
- bathroom(s)?
- flooring?
- staircase?
- basement?
- natural light level?
- traffic signs / road type?
- foundation visibility?

You must use this global understanding when answering requirements.

=== STEP 2 — DRIVEWAY IDENTIFICATION RULES ===

(Since agents care about this and models often misidentify)

A driveway is typically:
- paved asphalt OR concrete
- leads from the street to a garage or side parking pad
- wide enough for a vehicle
- often adjacent to the house
- may show cracks, slope, drainage

Do NOT confuse with:
- walkway to the front door
- backyard patio
- concrete slab behind the house
- stepping stones
- shared path or sidewalk

If ANY photo shows something that could reasonably be a driveway → treat as "visible" with an appropriate confidence level.

=== STEP 3 — VISUAL CHECKLIST EVALUATION ===

For EACH requirement in the visionChecklist:
1. Search ALL photos (not just the first match)
2. Determine status:
   - present → clearly visible in one or more photos
   - absent → visible but contradicts requirement
   - unclear → not visible or too ambiguous
3. Provide:
   - short evidence quote (e.g., "photo shows asphalt driveway with light cracks")
   - confidence = high / medium / low
4. If not visible:
   - evidence = "not visible in provided photos"
   - status = "unclear"

PRIORITIZATION:
- Check DEALBREAKER items first (critical for buyer)
- Return the 12 most relevant matches, prioritizing:
  1. High confidence findings (present or absent)
  2. Items with clear visual evidence

=== STEP 4 — RED FLAG RULES (CRITICAL) ===

Only generate a red flag if:
- Something visually concerning
- AND material to home value, safety, or buyer risk

Examples:
- missing railings
- unsafe stairs
- cracked foundation block
- roof curling / missing shingles
- siding rot
- flooding indicators
- busy road
- overhead power lines
- mold-like stains
- severe driveway cracks

Every red flag MUST include:
- severity: low / medium / high
- specific evidence from the photos
- clear follow_up question (what the agent should ask)

Do NOT make up issues.
If all photos look fine, return an empty list.

=== STEP 5 — OUTPUT FORMAT (STRICT) ===

Return JSON with EXACT structure:

{{
  "photo_headline": "string (5-12 words)",
  "photo_summary": "string (1-2 sentences)",
  "photo_matches": [
    {{
      "requirement": "string",
      "status": "present|absent|unclear",
      "evidence": "string",
      "confidence": "high|medium|low"
    }}
  ],
  "photo_red_flags": [
    {{
      "concern": "string",
      "evidence": "string",
      "severity": "low|medium|high",
      "follow_up": "string"
    }}
  ]
}}

Rules:
- photo_matches: max 12 items (prioritize high confidence)
- photo_red_flags: max 5 items (only genuine concerns)
- NEVER invent non-visible facts (bed count, sq ft, garage capacity, etc.)

=== STEP 6 — HEADLINE & SUMMARY ===

photo_headline:
- 1 short high-level statement (5-12 words)
- Example: "Updated home with strong natural light and usable yard"

photo_summary:
- 1-2 sentences describing what the photos reveal, what is unclear, any noteworthy positives or ambiguities
- Do not repeat the listing description
- Base ONLY on photos

All 4 top-level keys must be present. Arrays may be empty but never omitted.
"""
    return prompt


def _call_vision_api(prompt: str, photo_urls: List[str]) -> Dict[str, Any]:
    """Call OpenAI Vision API with photos."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=api_key)

    # Build message content with text + images
    content = [{"type": "text", "text": prompt}]

    for url in photo_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": url, "detail": "low"}  # low detail for speed/cost
        })

    response = client.chat.completions.create(
        model="gpt-4o",  # Full vision model for better quality
        messages=[
            {
                "role": "system",
                "content": "You are an expert real estate photo analyst. Return JSON only, no surrounding text. Be conservative - use 'unclear' when unsure. Never invent features not visible in photos."
            },
            {
                "role": "user",
                "content": content
            }
        ],
        temperature=0.4,  # Consistency over creativity
        max_tokens=2000,
        response_format={"type": "json_object"}
    )

    result = response.choices[0].message.content
    return json.loads(result)


def _validate_and_truncate(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Validate schema and enforce limits."""
    # Ensure required keys exist
    if "photo_headline" not in analysis:
        analysis["photo_headline"] = "Photo analysis complete"
    if "photo_summary" not in analysis:
        analysis["photo_summary"] = "See details below."
    if "photo_matches" not in analysis:
        analysis["photo_matches"] = []
    if "photo_red_flags" not in analysis:
        analysis["photo_red_flags"] = []

    # Ensure arrays are arrays
    if not isinstance(analysis["photo_matches"], list):
        analysis["photo_matches"] = []
    if not isinstance(analysis["photo_red_flags"], list):
        analysis["photo_red_flags"] = []

    # Truncate to limits (12 matches, 5 red flags)
    analysis["photo_matches"] = analysis["photo_matches"][:12]
    analysis["photo_red_flags"] = analysis["photo_red_flags"][:5]

    return analysis
