"""
Lead Property Analyzer - Property-centric analysis for lead outreach.

Unlike buyer profile analysis which matches against requirements,
lead analysis provides objective property insights for first contact.

Three layers:
1. MLS Text Analysis - highlights, market position, concerns (OpenAI)
2. Vision Analysis - photo-based observations (Gemini)
3. Comparison - to original property they inquired about
"""

import os
import json
from typing import Dict, Any, List, Optional
from openai import OpenAI
from google import genai
from google.genai import types
from concurrent.futures import ThreadPoolExecutor, as_completed


class LeadPropertyAnalyzer:
    """
    Property-centric analysis for lead outreach.

    Designed for first contact - no assumptions about buyer preferences.
    Uses same quality guardrails as buyer analyzer (evidence, sources, no hallucination).
    """

    def __init__(self):
        # OpenAI for text analysis
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise ValueError("OPENAI_API_KEY not set")
        self.openai_client = OpenAI(api_key=openai_key)
        self.text_model = os.getenv("OPENAI_MODEL", "gpt-4o")

        # Gemini for vision analysis
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            print("[LEAD ANALYZER] Warning: GEMINI_API_KEY not set, vision disabled")
            self.gemini_client = None
        else:
            self.gemini_client = genai.Client(api_key=gemini_key)
        self.vision_model = os.getenv("GEMINI_MODEL_VISION", "gemini-2.0-flash")

    def analyze_listing(
        self,
        listing: Dict[str, Any],
        lead_context: Dict[str, Any] = None,
        include_vision: bool = True,
        max_photos: int = 5
    ) -> Dict[str, Any]:
        """
        Analyze a property listing for lead outreach.

        Args:
            listing: Normalized listing from SearchService/Repliers
            lead_context: Original property the lead inquired about
            include_vision: Whether to analyze photos
            max_photos: Max photos to analyze (cost control)

        Returns:
            {
                "headline": str,
                "property_highlights": [...],
                "market_position": {...},
                "things_to_consider": [...],
                "photo_insights": [...],
                "comparison_to_original": {...} or None,
                "agent_summary": str
            }
        """
        try:
            # Layer 1: Text analysis (MLS description + structured fields)
            text_analysis = self._analyze_text(listing, lead_context)

            # Layer 2: Vision analysis (photos via Gemini)
            photo_insights = []
            if include_vision and self.gemini_client:
                images = listing.get("images", [])[:max_photos]
                if images:
                    photo_insights = self._analyze_photos_gemini(images, listing)

            # Merge results
            analysis = {
                **text_analysis,
                "photo_insights": photo_insights
            }

            return analysis

        except Exception as e:
            print(f"[LEAD ANALYZER] Error: {e}")
            return self._get_fallback_analysis(listing, lead_context)

    def analyze_batch(
        self,
        listings: List[Dict[str, Any]],
        lead_context: Dict[str, Any] = None,
        include_vision: bool = True,
        max_workers: int = 3
    ) -> Dict[str, Dict[str, Any]]:
        """
        Analyze multiple listings in parallel.

        Returns:
            Dict mapping listing_id -> analysis
        """
        results = {}

        def analyze_single(listing: Dict[str, Any]) -> tuple:
            listing_id = listing.get("mls_number") or listing.get("id")
            try:
                analysis = self.analyze_listing(listing, lead_context, include_vision)
                return (listing_id, analysis, None)
            except Exception as e:
                return (listing_id, None, e)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(analyze_single, l): l for l in listings}

            for future in as_completed(futures):
                listing_id, analysis, error = future.result()
                if analysis:
                    results[listing_id] = analysis
                elif error:
                    print(f"[LEAD ANALYZER] Batch error for {listing_id}: {error}")
                    listing = futures[future]
                    results[listing_id] = self._get_fallback_analysis(listing, lead_context)

        return results

    def _analyze_text(
        self,
        listing: Dict[str, Any],
        lead_context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Layer 1: Analyze MLS text and structured fields via OpenAI."""

        prompt = self._build_text_prompt(listing, lead_context)

        response = self.openai_client.chat.completions.create(
            model=self.text_model,
            messages=[
                {"role": "system", "content": self._get_system_prompt()},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=1500
        )

        content = response.choices[0].message.content.strip()
        analysis = json.loads(content)

        # Validate structure
        required_keys = ["headline", "property_highlights", "market_position",
                        "things_to_consider", "agent_summary"]
        for key in required_keys:
            if key not in analysis:
                analysis[key] = [] if key in ["property_highlights", "things_to_consider"] else {}

        return analysis

    def _analyze_photos_gemini(
        self,
        image_urls: List[str],
        listing: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Layer 2: Analyze property photos using Gemini Vision."""

        if not image_urls or not self.gemini_client:
            return []

        address = listing.get("address", "this property")
        price = listing.get("price", 0)
        year_built = listing.get("year_built", "unknown")

        prompt = f"""Analyze these property listing photos for {address} (${price:,}, built {year_built}).

This is for FIRST CONTACT with a lead - focus on what demonstrates agent value and builds trust.

PRIORITIZE HIGHLIGHTS (show property value):
- Quality finishes: hardwood floors, granite/quartz counters, stainless appliances
- Recent updates: new kitchen, renovated bathrooms, fresh paint
- Standout features: natural light, open layout, outdoor space, views
- Move-in ready indicators: well-maintained, clean, staged nicely

ONLY FLAG SERIOUS CONCERNS (not nitpicks):
- Water damage: stains on ceilings/walls, warped flooring
- Structural: visible cracks, uneven floors, foundation issues
- Major deferred maintenance: roof damage, siding issues, broken windows
- Safety: outdated electrical panels, missing railings

DO NOT FLAG (too nitpicky for first contact):
- Popcorn ceilings (cosmetic, common in older homes)
- Older but functional appliances
- Minor wear (scuffs, small chips, worn carpet)
- Dated light fixtures or hardware
- Paint colors or decor choices
- Landscaping style

RULES:
- Aim for 2-3 highlights (show value first)
- Max 1-2 concerns (only if serious)
- If nothing serious, return only highlights or empty array
- Empty array is fine if property looks standard

Return ONLY a JSON array (max 4 items):
[
  {{
    "observation": "specific factual observation",
    "photo_index": 0,
    "implication": "what it means for buyer",
    "type": "highlight|concern|red_flag",
    "confidence": "high|medium"
  }}
]"""

        try:
            # Build content with images
            content_parts = [prompt]

            for idx, url in enumerate(image_urls):
                # Gemini accepts image URLs directly
                content_parts.append(types.Part.from_uri(file_uri=url, mime_type="image/jpeg"))

            response = self.gemini_client.models.generate_content(
                model=self.vision_model,
                contents=content_parts,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=4000,  # Increased from 1000 - accuracy over cost
                    response_mime_type="application/json",  # Forces valid JSON output
                )
            )

            if not response.text:
                print("[LEAD ANALYZER] Gemini vision returned empty response")
                return []

            result_text = response.text.strip()
            print(f"[LEAD ANALYZER] Gemini vision response: {result_text[:500]}")

            # With response_mime_type="application/json", response should be valid JSON
            try:
                insights = json.loads(result_text)
            except json.JSONDecodeError as je:
                print(f"[LEAD ANALYZER] JSON parse error: {je}")
                # Fallback: try to extract JSON if wrapped in markdown (shouldn't happen)
                if "```json" in result_text:
                    result_text = result_text.split("```json")[1].split("```")[0].strip()
                elif "```" in result_text:
                    result_text = result_text.split("```")[1].split("```")[0].strip()
                try:
                    insights = json.loads(result_text)
                except:
                    print(f"[LEAD ANALYZER] Failed to parse after cleanup: {result_text[:200]}")
                    return []

            # Validate and filter
            if isinstance(insights, list):
                valid_insights = [i for i in insights[:5] if self._is_valid_photo_insight(i)]
                print(f"[LEAD ANALYZER] Found {len(valid_insights)} valid photo insights")
                return valid_insights
            return []

        except Exception as e:
            print(f"[LEAD ANALYZER] Gemini vision error: {e}")
            return []

    def _get_system_prompt(self) -> str:
        """System prompt for text analysis."""
        return """You are an expert real estate analyst providing property insights for a potential buyer.

CRITICAL - FIRST CONTACT RULES:
- This person clicked on ONE property online. You know NOTHING about their preferences.
- Do NOT say "matches your criteria" - you don't know their criteria
- Do NOT assume their budget, timeline, or must-haves
- DO provide objective property insights that ANY buyer would value

QUALITY GUARDRAILS:
1. Every claim needs evidence (MLS quote or structured field)
2. Flag vague language: "TLC", "as-is", "potential", "cozy", "handyman special"
3. Include honest caveats - do not oversell
4. If unsure, say "needs verification" - never hallucinate
5. Less is better than junk data

OUTPUT: Valid JSON only, no commentary."""

    def _build_text_prompt(
        self,
        listing: Dict[str, Any],
        lead_context: Dict[str, Any] = None
    ) -> str:
        """Build prompt for text analysis."""

        # Extract listing data
        address = listing.get("address", "Address not available")
        city = listing.get("city", "")
        state = listing.get("state", "")
        price = listing.get("price", 0)
        bedrooms = listing.get("bedrooms", "N/A")
        bathrooms = listing.get("bathrooms", "N/A")
        sqft = listing.get("square_feet", "N/A")
        year_built = listing.get("year_built", "N/A")
        days_on_market = listing.get("days_on_market", "N/A")
        description = listing.get("description", "")
        property_type = listing.get("property_type", "N/A")

        # Price history
        price_cuts = listing.get("price_cuts_count", 0)
        total_reduction = listing.get("total_price_reduction", 0)

        # Build comparison section if original property exists
        comparison_section = ""
        if lead_context and lead_context.get("propertyAddress"):
            orig_price = lead_context.get("propertyListPrice", 0)
            orig_beds = lead_context.get("propertyBedrooms", "?")
            orig_baths = lead_context.get("propertyBathrooms", "?")
            orig_sqft = lead_context.get("propertySqft", "?")
            orig_addr = lead_context.get("propertyAddress", "")

            comparison_section = f"""
---
ORIGINAL PROPERTY (what they inquired about):
Address: {orig_addr}
Price: ${orig_price:,} | Beds: {orig_beds} | Baths: {orig_baths} | SqFt: {orig_sqft}

Compare THIS property to the original. Calculate:
- Price difference ($ and %)
- Size difference if sqft available
- Key advantages/disadvantages
"""

        # Handle empty description
        if not description or description.strip() == "":
            description_block = """MLS DESCRIPTION:
No description available.

IMPORTANT: With no description, be conservative. Only report what's in structured fields.
Add a concern: "No listing description available - request details from listing agent"
"""
        else:
            description_block = f'''MLS DESCRIPTION:
"""{description[:2000]}"""'''

        # Build comparison JSON line based on whether we have original property context
        if comparison_section:
            comparison_json = '"comparison_to_original": {"price_diff": "+/-$X (+/-Y%)", "size_diff": "+/-X sqft", "key_differences": ["..."]}'
        else:
            comparison_json = '"comparison_to_original": null'

        prompt = f"""Analyze this property for a potential buyer who found it online.

---
PROPERTY:
Address: {address}, {city}, {state}
Price: ${price:,}
Beds: {bedrooms} | Baths: {bathrooms} | SqFt: {sqft}
Type: {property_type}
Year Built: {year_built}
Days on Market: {days_on_market}
Price Reductions: {price_cuts} (total ${total_reduction:,} off)

{description_block}
{comparison_section}

---
YOUR TASK:

Return this JSON structure:

{{
  "headline": "5-8 word hook about this property (what makes it notable)",

  "property_highlights": [
    {{
      "feature": "what stands out",
      "evidence": "exact MLS quote or field proving it",
      "why_notable": "why a buyer would care"
    }}
  ],

  "market_position": {{
    "price_assessment": "how it's priced for the area/type",
    "days_on_market_insight": "what {days_on_market} days means (fresh=competition, 60+=negotiate)",
    "price_history": "what {price_cuts} reduction(s) totaling ${total_reduction:,} signals",
    "value_indicators": ["specific value points"]
  }},

  "things_to_consider": [
    {{
      "concern": "what any buyer should know",
      "evidence": "MLS quote or field",
      "risk_level": "low|medium|high",
      "follow_up": "question to ask or verify"
    }}
  ],

  {comparison_json},

  "agent_summary": "2-3 sentences. What stands out, one honest caveat, warm invitation to discuss."
}}

LIMITS:
- property_highlights: max 5 (most notable first)
- things_to_consider: max 5 (most important first)
- value_indicators: max 3
"""

        return prompt

    def _is_valid_photo_insight(self, insight: Dict[str, Any]) -> bool:
        """Validate a photo insight has required fields."""
        required = ["observation", "implication", "type", "confidence"]
        return all(key in insight for key in required)

    def _get_fallback_analysis(
        self,
        listing: Dict[str, Any],
        lead_context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Fallback if AI analysis fails."""

        address = listing.get("address", "Property")
        price = listing.get("price", 0)
        beds = listing.get("bedrooms", "?")
        baths = listing.get("bathrooms", "?")
        days = listing.get("days_on_market")

        # Basic market insight
        if days is not None:
            if days <= 7:
                dom_insight = "New listing - may have competition"
            elif days >= 60:
                dom_insight = "On market 60+ days - may have room to negotiate"
            else:
                dom_insight = f"Listed {days} days"
        else:
            dom_insight = "Days on market not available"

        # Build comparison if available
        comparison = None
        if lead_context and lead_context.get("propertyListPrice"):
            orig_price = lead_context.get("propertyListPrice", 0)
            if orig_price and price:
                diff = price - orig_price
                pct = (diff / orig_price) * 100 if orig_price else 0
                comparison = {
                    "price_diff": f"{'+'if diff >= 0 else ''}{diff:,.0f} ({pct:+.1f}%)",
                    "size_diff": None,
                    "key_differences": []
                }

        return {
            "headline": f"{beds} Bed Home in {listing.get('city', 'Area')}",
            "property_highlights": [
                {
                    "feature": f"{beds} bedrooms, {baths} bathrooms",
                    "evidence": "Listing data",
                    "why_notable": "Core property specs"
                }
            ],
            "market_position": {
                "price_assessment": f"Listed at ${price:,}",
                "days_on_market_insight": dom_insight,
                "price_history": "Check with agent",
                "value_indicators": []
            },
            "things_to_consider": [],
            "photo_insights": [],
            "comparison_to_original": comparison,
            "agent_summary": f"This {beds}-bedroom home is listed at ${price:,}. I'd be happy to provide more details or schedule a showing."
        }
