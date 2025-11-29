"""
AI-powered property analysis service using OpenAI.
Generates agent-quality insights and explanations for property listings.
"""
from typing import Dict, Any, Optional, List
import os
import json
from openai import OpenAI
from ..db import get_conn, fetchone_dict
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed


class PropertyAnalyzer:
    """Generates AI-powered property analysis and recommendations"""

    def __init__(self):
        """Initialize OpenAI client"""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")

        self.client = OpenAI(api_key=api_key)
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.cache_ttl_hours = 24  # Cache analysis for 24 hours

    def analyze_listing(
        self,
        listing: Dict[str, Any],
        profile: Dict[str, Any],
        score_data: Optional[Dict[str, Any]] = None,
        quality_data: Optional[Dict[str, Any]] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Analyze a property listing against buyer profile using AI.

        Args:
            listing: Property data from Repliers
            profile: Buyer profile data
            score_data: Pre-calculated score breakdown from PropertyScorer
            quality_data: Quality metrics from ListingQualityAnalyzer
            use_cache: Whether to use cached analysis

        Returns:
            {
                "headline": "Perfect Family Home on Quiet Street",
                "agent_insight": "I love this one...",
                "why_picked": "...",
                "must_have_checklist": [...],
                "red_flags": [...],
                "why_it_works": {...},
                "considerations": [...]
            }
        """
        listing_id = listing.get("id") or listing.get("mls_number")
        profile_id = profile.get("profileId") or profile.get("id")

        # Check cache first
        if use_cache and listing_id and profile_id:
            cached = self._get_cached_analysis(listing_id, profile_id)
            if cached:
                return cached

        # Generate AI analysis
        try:
            prompt = self._build_prompt(listing, profile, score_data, quality_data)
            analysis = self._call_openai(prompt)

            # Cache the result
            if use_cache and listing_id and profile_id:
                self._cache_analysis(listing_id, profile_id, analysis)

            return analysis

        except Exception as e:
            print(f"[PROPERTY ANALYZER] Error analyzing listing {listing_id}: {e}")
            # Return fallback response
            return self._get_fallback_analysis(listing, profile, score_data, quality_data)

    def analyze_batch(
        self,
        items: List[Dict[str, Any]],
        profile: Dict[str, Any],
        batch_size: int = 4,
        use_cache: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Analyze multiple listings in parallel mini-batches.

        Args:
            items: List of {"listing": {...}, "score_data": {...}} dicts
            profile: Buyer profile data
            batch_size: Number of concurrent API calls (default: 4)
            use_cache: Whether to use cached analysis

        Returns:
            List of analysis results in the same order as input
        """
        results = [None] * len(items)  # Preserve order

        def analyze_single(index: int, item: Dict[str, Any]) -> tuple:
            """Helper to analyze single item and track its index"""
            try:
                analysis = self.analyze_listing(
                    listing=item["listing"],
                    profile=profile,
                    score_data=item.get("score_data"),
                    quality_data=item.get("quality_data"),
                    use_cache=use_cache
                )
                return (index, analysis, None)
            except Exception as e:
                listing_id = item["listing"].get("id", "unknown")
                print(f"[PROPERTY ANALYZER] Batch error for listing {listing_id}: {e}")
                return (index, None, e)

        # Process in mini-batches
        with ThreadPoolExecutor(max_workers=batch_size) as executor:
            futures = {
                executor.submit(analyze_single, i, item): i
                for i, item in enumerate(items)
            }

            for future in as_completed(futures):
                index, analysis, error = future.result()
                if analysis:
                    results[index] = analysis
                elif error:
                    # Use fallback for failed items
                    item = items[index]
                    results[index] = self._get_fallback_analysis(
                        item["listing"],
                        profile,
                        item.get("score_data")
                    )

        return results

    def _build_prompt(
        self,
        listing: Dict[str, Any],
        profile: Dict[str, Any],
        score_data: Optional[Dict[str, Any]] = None,
        quality_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the AI prompt for property analysis with quality metrics and scoring context"""

        # Extract profile data
        buyer_name = profile.get("name", "the buyer")
        budget_min = profile.get("budgetMin", 0)
        budget_max = profile.get("budgetMax", 0)
        location = profile.get("location", "")
        bedrooms = profile.get("bedrooms", "")
        max_bedrooms = profile.get("maxBedrooms")
        bathrooms = profile.get("bathrooms", "")
        home_type = profile.get("homeType", "")
        must_haves = profile.get("mustHaveFeatures", [])
        dealbreakers = profile.get("dealbreakers", [])
        lifestyle_drivers = profile.get("lifestyleDrivers", [])
        special_needs = profile.get("specialNeeds", [])
        emotional_context = profile.get("emotionalContext", "")
        buyer_type = profile.get("buyerType", "traditional")

        # Format bedroom range
        max_bedrooms_text = f"-{max_bedrooms}" if max_bedrooms else " or more"

        # Format lists for prompt
        must_haves_text = "\n".join(f"- {item}" for item in must_haves) if must_haves else "None specified"
        dealbreakers_text = "\n".join(f"- {item}" for item in dealbreakers) if dealbreakers else "None specified"
        lifestyle_text = "\n".join(f"- {item}" for item in lifestyle_drivers) if lifestyle_drivers else "None specified"
        special_needs_text = "\n".join(f"- {item}" for item in special_needs) if special_needs else "None specified"

        # Extract property data
        address = listing.get("address", "Property address not available")
        price = listing.get("price", 0)
        property_bedrooms = listing.get("bedrooms", "N/A")
        property_bathrooms = listing.get("bathrooms", "N/A")
        sqft = listing.get("square_feet", "N/A")
        property_type = listing.get("property_type", "N/A")
        description = listing.get("description", "No description available")
        city = listing.get("city", "")
        state = listing.get("state", "")

        # Build scoring context if available
        scoring_context = ""
        if score_data:
            total_score = score_data.get("total", 0)
            breakdown = score_data.get("breakdown", {})
            matched_features = score_data.get("matched_features", [])
            missing_features = score_data.get("missing_features", [])

            scoring_context = f"""
PROPERTY SCORE ANALYSIS:
Overall Match Score: {total_score}/100

Score Breakdown:
- Budget Match: {breakdown.get('budget_match', {}).get('score', 0)}/30 - {breakdown.get('budget_match', {}).get('details', '')}
- Bedroom Match: {breakdown.get('bedroom_match', {}).get('score', 0)}/20 - {breakdown.get('bedroom_match', {}).get('details', '')}
- Bathroom Match: {breakdown.get('bathroom_match', {}).get('score', 0)}/15 - {breakdown.get('bathroom_match', {}).get('details', '')}
- Features Match: {breakdown.get('must_have_features', {}).get('score', 0)}/20 - {breakdown.get('must_have_features', {}).get('details', '')}
- Location Match: {breakdown.get('location_match', {}).get('score', 0)}/10 - {breakdown.get('location_match', {}).get('details', '')}

Matched Must-Have Features: {', '.join(matched_features) if matched_features else 'None'}
Missing Must-Have Features: {', '.join(missing_features) if missing_features else 'None'}
"""

        # Build quality context if available
        quality_context = ""
        if quality_data:
            quality_score = quality_data.get("quality_score", 0)
            photo_quality = quality_data.get("photo_quality", {})
            desc_quality = quality_data.get("description_quality", {})
            freshness = quality_data.get("freshness", {})
            price_signals = quality_data.get("price_signals", {})

            quality_context = f"""
LISTING QUALITY SIGNALS:
Overall Quality Score: {quality_score}/10

Photos: {photo_quality.get('count', 0)} photos ({photo_quality.get('quality', 'unknown')})
Description: {desc_quality.get('length', 0)} characters ({desc_quality.get('quality', 'unknown')})
Days on Market: {freshness.get('days_on_market', 'Unknown')} ({freshness.get('freshness', 'unknown')})
"""

            if price_signals.get('has_price_change'):
                change_type = price_signals.get('change_type')
                change_pct = price_signals.get('price_change_pct', 0)
                quality_context += f"Price Change: {change_type.capitalize()} by {abs(change_pct):.1f}%\n"

        # Determine tone based on score
        tone_guidance = ""
        if score_data:
            score = score_data.get("total", 0)
            if score >= 85:
                tone_guidance = "This is a STRONG match. Be enthusiastic and confident in your recommendation."
            elif score >= 70:
                tone_guidance = "This is a GOOD match with some compromises. Be positive but mention tradeoffs honestly."
            else:
                tone_guidance = "This is an OK match with notable tradeoffs. Be balanced and help them understand the compromises."

        prompt = f"""You are an experienced real estate agent helping {buyer_name} find their perfect home.
This property scored {score_data.get('total', 0) if score_data else '?'}/100 based on their criteria. Your job is to provide professional due diligence.

BUYER PROFILE:
Name: {buyer_name}
Buyer Type: {buyer_type}
Budget: ${budget_min:,} - ${budget_max:,}
Location: {location}
Bedrooms needed: {bedrooms}{max_bedrooms_text}
Bathrooms needed: {bathrooms}
Home type preference: {home_type}

Must-Have Features:
{must_haves_text}

Dealbreakers:
{dealbreakers_text}

Lifestyle Priorities:
{lifestyle_text}

Special Needs/Context:
{special_needs_text}

Emotional Context: {emotional_context if emotional_context else "Not specified"}

PROPERTY DETAILS:
Address: {address}
City: {city}, {state}
Price: ${price:,}
Bedrooms: {property_bedrooms}
Bathrooms: {property_bathrooms}
Square Feet: {sqft}
Property Type: {property_type}
Description: {description}
{scoring_context}{quality_context}

YOUR TASK:
Provide professional due diligence analysis demonstrating you've thoroughly vetted this property for {buyer_name}.

{tone_guidance}

1. **headline** (5-8 words): Specific headline capturing what makes this property notable for {buyer_name}. Reference their actual situation.

2. **agent_insight** (2-3 sentences): You're a real estate agent presenting THIS property to {buyer_name}:
   - Sentence 1: "I found this [SPECIFIC DETAILS: address/price/beds/key feature from description]"
   - Sentence 2: "You were looking for [THEIR SPECIFIC REQUIREMENT], and this property [HOW IT DELIVERS]"
   - Sentence 3: "It might also interest you because [BONUS or HIDDEN GEM from description]"

   Use conversational tone. Reference ACTUAL property data and buyer requirements.

3. **why_picked** (1-2 sentences): The specific reason YOU selected this property for {buyer_name}. What made you say "I should show them this one"? Reference the match score or a standout feature.

4. **must_have_checklist** (array of objects): For EACH must-have feature {buyer_name} requested, return:
   {{"feature": "feature name", "status": "present"|"missing"|"unclear", "notes": "brief context from description"}}

5. **hidden_gems** (array of strings): Extract 2-4 positive details buried in the description that could resonate with {buyer_name}:
   - Recent updates/renovations not in main features (e.g., "new roof 2023", "HVAC replaced")
   - Lot characteristics (e.g., "corner lot", "mature trees", "private backyard")
   - Neighborhood benefits (e.g., "walk to elementary school", "near bike path")
   - Seller motivations (e.g., "pre-inspected", "motivated seller")
   - Unique property features (e.g., "oversized garage", "south-facing deck")

   Only include if genuinely found in description. Empty array if none.

6. **red_flags** (array of strings): Analyze the description for potential concerns:
   - Vague language suggesting hidden issues
   - Missing information that should be disclosed
   - Wording that raises questions
   - Quality concerns from the listing data
   Only include genuine concerns. Empty array if none.

7. **why_it_works** (object): Explain the fit:
   - budget: Price alignment with their budget
   - location: Why this location works for them
   - lifestyle_fit/family_fit/investment_fit: Based on buyer_type and priorities

8. **considerations** (array): 1-3 honest tradeoffs or things to investigate. Not dealbreakers, but worth discussing.

TONE GUIDELINES:
- Sound like a real agent who did their homework
- Be honest about concerns - your credibility matters
- Use the scoring breakdown - don't recalculate, use what's provided
- Reference quality signals (photos, days on market, price changes) when relevant
- Avoid generic phrases - be specific to {buyer_name}'s situation

Return ONLY valid JSON:
{{
  "headline": "...",
  "agent_insight": "...",
  "why_picked": "...",
  "must_have_checklist": [...],
  "hidden_gems": [...],
  "red_flags": [...],
  "why_it_works": {{...}},
  "considerations": [...]
}}
"""

        return prompt

    def _call_openai(self, prompt: str) -> Dict[str, Any]:
        """Make OpenAI API call and parse response"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an experienced real estate agent who provides personalized, honest property recommendations. You read listing descriptions carefully to find hidden details that buyers might love."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                response_format={"type": "json_object"}
            )

            content = response.choices[0].message.content
            analysis = json.loads(content)

            # Validate response structure
            required_fields = ["headline", "agent_insight", "why_picked", "must_have_checklist", "why_it_works"]
            for field in required_fields:
                if field not in analysis:
                    raise ValueError(f"Missing required field: {field}")

            # Ensure optional array fields exist (can be empty)
            if "hidden_gems" not in analysis:
                analysis["hidden_gems"] = []
            if "red_flags" not in analysis:
                analysis["red_flags"] = []

            return analysis

        except json.JSONDecodeError as e:
            print(f"[PROPERTY ANALYZER] JSON parse error: {e}")
            raise
        except Exception as e:
            print(f"[PROPERTY ANALYZER] OpenAI API error: {e}")
            raise

    def _get_cached_analysis(self, listing_id: str, profile_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve cached analysis from database"""
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cutoff_time = datetime.now() - timedelta(hours=self.cache_ttl_hours)

                    cur.execute(
                        """
                        SELECT analysis_json, created_at
                        FROM property_analysis_cache
                        WHERE listing_id = %s AND profile_id = %s
                        AND created_at > %s
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        (listing_id, profile_id, cutoff_time.isoformat())
                    )

                    row = fetchone_dict(cur)
                    if row and row.get("analysis_json"):
                        analysis = row["analysis_json"]
                        if isinstance(analysis, str):
                            return json.loads(analysis)
                        return analysis

        except Exception as e:
            print(f"[PROPERTY ANALYZER] Cache retrieval error: {e}")

        return None

    def _cache_analysis(self, listing_id: str, profile_id: int, analysis: Dict[str, Any]) -> None:
        """Store analysis in database cache"""
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    analysis_json = json.dumps(analysis)

                    cur.execute(
                        """
                        INSERT INTO property_analysis_cache (
                            listing_id, profile_id, analysis_json, created_at
                        ) VALUES (%s, %s, %s, %s)
                        ON CONFLICT (listing_id, profile_id)
                        DO UPDATE SET
                            analysis_json = EXCLUDED.analysis_json,
                            created_at = EXCLUDED.created_at
                        """,
                        (listing_id, profile_id, analysis_json, datetime.now().isoformat())
                    )
                    conn.commit()

        except Exception as e:
            print(f"[PROPERTY ANALYZER] Cache storage error: {e}")

    def _get_fallback_analysis(
        self,
        listing: Dict[str, Any],
        profile: Dict[str, Any],
        score_data: Optional[Dict[str, Any]] = None,
        quality_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Return basic analysis when AI fails"""
        price = listing.get("price", 0)
        bedrooms = listing.get("bedrooms", 0)
        city = listing.get("city", "this area")
        buyer_name = profile.get("name", "the buyer")
        must_haves = profile.get("mustHaveFeatures", [])

        # Build basic must-have checklist
        must_have_checklist = [
            {"feature": feature, "status": "unclear", "notes": "Analysis unavailable"}
            for feature in must_haves
        ]

        return {
            "headline": f"{bedrooms}-Bedroom Home in {city}",
            "agent_insight": f"I found this property at ${price:,} with {bedrooms} bedrooms that could be a good fit for you.",
            "why_picked": "This property met your basic criteria.",
            "must_have_checklist": must_have_checklist,
            "red_flags": [],
            "why_it_works": {
                "budget": f"Listed at ${price:,}",
                "location": f"Located in {city}",
            },
            "considerations": ["Full analysis unavailable - please review details carefully"]
        }


# =============================================================================
# Layer 1: Text + Profile Deep Match (v2)
# =============================================================================

def _build_buyer_context(profile: Dict[str, Any]) -> str:
    """
    Build a rich buyer context block from the full profile.
    Uses ALL available profile fields for maximum personalization.
    """
    # Core identity
    name = profile.get("name", "the buyer")
    ai_summary = profile.get("aiSummary", "")
    emotional_tone = profile.get("emotionalTone", "")

    # Decision drivers (WHY they're buying)
    decision_drivers = profile.get("decisionDrivers", [])
    if isinstance(decision_drivers, str):
        decision_drivers = [decision_drivers] if decision_drivers else []

    # Constraints (hard limits)
    constraints = profile.get("constraints", [])
    if isinstance(constraints, str):
        constraints = [constraints] if constraints else []

    # Requirements hierarchy
    must_haves = profile.get("mustHaveFeatures", [])
    if isinstance(must_haves, str):
        must_haves = [must_haves] if must_haves else []

    nice_to_haves = profile.get("niceToHaves", [])
    if isinstance(nice_to_haves, str):
        nice_to_haves = [nice_to_haves] if nice_to_haves else []

    dealbreakers = profile.get("dealbreakers", [])
    if isinstance(dealbreakers, str):
        dealbreakers = [dealbreakers] if dealbreakers else []

    lifestyle_drivers = profile.get("lifestyleDrivers", [])
    if isinstance(lifestyle_drivers, str):
        lifestyle_drivers = [lifestyle_drivers] if lifestyle_drivers else []

    # Budget
    budget_min = profile.get("budgetMin", 0)
    budget_max = profile.get("budgetMax", 0)

    # Flexibility scores (0-100)
    budget_flex = profile.get("budgetFlexibility", 50)
    location_flex = profile.get("locationFlexibility", 50)
    timing_flex = profile.get("timingFlexibility", 50)

    # Build context string
    context_parts = []

    context_parts.append(f"BUYER: {name}")

    if ai_summary:
        context_parts.append(f"\nWHO THEY ARE:\n{ai_summary}")

    if emotional_tone:
        context_parts.append(f"\nEMOTIONAL STATE: {emotional_tone}")

    if decision_drivers:
        context_parts.append(f"\nWHY THEY'RE BUYING (shape your headline/summary around these):")
        for driver in decision_drivers:
            context_parts.append(f"  - {driver}")

    context_parts.append(f"\nBUDGET: ${budget_min:,} - ${budget_max:,}")
    context_parts.append(f"  Flexibility: {budget_flex}/100 (higher = more willing to stretch)")

    if constraints:
        context_parts.append(f"\nHARD CONSTRAINTS (non-negotiable):")
        for c in constraints:
            context_parts.append(f"  - {c}")

    if must_haves:
        context_parts.append(f"\nMUST-HAVE FEATURES (check each against MLS):")
        for mh in must_haves:
            context_parts.append(f"  - {mh}")

    if nice_to_haves:
        context_parts.append(f"\nNICE-TO-HAVES (lower priority than must-haves):")
        for nth in nice_to_haves:
            context_parts.append(f"  - {nth}")

    if dealbreakers:
        context_parts.append(f"\nDEALBREAKERS (if present, flag as red_flag):")
        for db in dealbreakers:
            context_parts.append(f"  - {db}")

    if lifestyle_drivers:
        context_parts.append(f"\nLIFESTYLE PRIORITIES:")
        for ld in lifestyle_drivers:
            context_parts.append(f"  - {ld}")

    context_parts.append(f"\nFLEXIBILITY SCORES (0-100):")
    context_parts.append(f"  - Budget: {budget_flex}/100")
    context_parts.append(f"  - Location: {location_flex}/100")
    context_parts.append(f"  - Timing: {timing_flex}/100")

    return "\n".join(context_parts)


def _build_analysis_prompt_v2(
    profile: Dict[str, Any],
    listing: Dict[str, Any],
    ranking_context: Dict[str, Any]
) -> str:
    """
    Build the new lean prompt for Layer 1 text + profile deep match.
    Instructs LLM to quote MLS text as evidence.
    """
    buyer_context = _build_buyer_context(profile)
    buyer_name = profile.get("name", "the buyer")

    # Extract listing data
    address = listing.get("address", "Address not available")
    city = listing.get("city", "")
    state = listing.get("state", "")
    price = listing.get("price", 0)
    bedrooms = listing.get("bedrooms", "N/A")
    bathrooms = listing.get("bathrooms", "N/A")
    sqft = listing.get("square_feet", "N/A")
    property_type = listing.get("property_type", "N/A")
    year_built = listing.get("year_built", "N/A")
    days_on_market = listing.get("days_on_market", "N/A")
    description = listing.get("description", "")

    # Get details dict (Repliers nests structured fields in details object)
    details = listing.get("details", {}) or {}
    if not details:
        raw = listing.get("_raw", {}) or {}
        details = raw.get("details", {}) or {}

    # Extract structured MLS fields (handle 0 values correctly - don't use `or` for numerics)
    # Garage - Repliers uses numGarageSpaces in details
    garage_spaces = listing.get("garageSpaces")
    if garage_spaces is None:
        garage_spaces = listing.get("garage_spaces")
    if garage_spaces is None:
        garage_spaces = details.get("numGarageSpaces")

    # Parking - Repliers uses numParkingSpaces in details
    parking_spaces = listing.get("parkingSpaces")
    if parking_spaces is None:
        parking_spaces = listing.get("parking_spaces")
    if parking_spaces is None:
        parking_spaces = details.get("numParkingSpaces")

    # Flooring - Repliers sends comma-separated string in flooringType
    flooring_raw = (
        listing.get("flooring")
        or listing.get("flooring_type")
        or details.get("flooringType")
        or ""
    )
    if isinstance(flooring_raw, str):
        flooring = [f.strip() for f in flooring_raw.split(",") if f.strip()]
    elif isinstance(flooring_raw, list):
        flooring = flooring_raw
    else:
        flooring = []

    # Heating - check details
    heating = (
        listing.get("heatingType")
        or listing.get("heating_type")
        or details.get("heating")
        or details.get("heatingType")
    )

    # Cooling - Repliers uses airConditioning in details
    cooling = (
        listing.get("coolingType")
        or listing.get("cooling_type")
        or details.get("airConditioning")
    )

    # Basement - Repliers uses basement1, basement2 in details
    basement = (
        listing.get("basementType")
        or listing.get("basement_type")
        or details.get("basement1")
    )
    basement2 = details.get("basement2")

    # Basement finished
    basement_finished = listing.get("basementFinished")
    if basement_finished is None:
        basement_finished = listing.get("basement_finished")

    # Finished area - Repliers may use livingAreaMeasurement
    finished_area = (
        listing.get("finishedArea")
        or listing.get("finished_area")
        or details.get("livingAreaMeasurement")
    )

    # Exterior features - check details
    exterior_features = (
        listing.get("exteriorFeatures")
        or listing.get("exterior_features")
        or details.get("exteriorFeatures")
        or []
    )
    if isinstance(exterior_features, str):
        exterior_features = [f.strip() for f in exterior_features.split(",") if f.strip()]

    # Interior features - check details
    interior_features = (
        listing.get("interiorFeatures")
        or listing.get("interior_features")
        or details.get("interiorFeatures")
        or []
    )
    if isinstance(interior_features, str):
        interior_features = [f.strip() for f in interior_features.split(",") if f.strip()]

    # Appliances - check details
    appliances = listing.get("appliances") or details.get("appliances") or []
    if isinstance(appliances, str):
        appliances = [a.strip() for a in appliances.split(",") if a.strip()]

    # Build structured MLS fields block
    basement_display = basement or 'Not specified'
    if basement2:
        basement_display = f"{basement}, {basement2}" if basement else basement2

    structured_block = f"""
STRUCTURED MLS FIELDS (use these alongside description – do NOT ignore):
- Garage Spaces: {garage_spaces if garage_spaces is not None else 'Not specified'}
- Parking Spaces: {parking_spaces if parking_spaces is not None else 'Not specified'}
- Flooring: {', '.join(flooring) if flooring else 'Not specified'}
- Heating: {heating or 'Not specified'}
- Cooling: {cooling or 'Not specified'}
- Basement: {basement_display}
- Basement Finished: {basement_finished if basement_finished is not None else 'Not specified'}
- Finished Area: {finished_area if finished_area else 'Not specified'}
- Exterior Features: {', '.join(str(f) for f in exterior_features[:5]) if exterior_features else 'None listed'}
- Interior Features: {', '.join(str(f) for f in interior_features[:5]) if interior_features else 'None listed'}
- Appliances: {', '.join(str(a) for a in appliances[:5]) if appliances else 'None listed'}
""".strip()

    # Handle empty/missing description
    if not description or description.strip() == "":
        description_block = """MLS DESCRIPTION:
No description available for this listing.

IMPORTANT: Since no MLS description is provided, you MUST NOT invent or assume any property features.
- Treat ALL must-have features as "missing" with assessment "Not mentioned in listing"
- Do not populate whats_matching with inferred features
- Add a red_flag: {"concern": "No listing description", "quote": "N/A", "risk_level": "medium", "follow_up": "Request full property details from listing agent"}
"""
    else:
        description_block = f"""MLS DESCRIPTION:
\"\"\"{description}\"\"\"
"""

    # Build ranking context
    fit_score = ranking_context.get("fit_score", 0)
    priority_tag = ranking_context.get("priority_tag", "REVIEW")
    below_market_pct = ranking_context.get("below_market_pct")
    market_strength = ranking_context.get("market_strength_score", 0)
    final_score = ranking_context.get("final_score", 0)
    rank = ranking_context.get("rank", "N/A")
    fit_chips = ranking_context.get("fit_chips", [])
    status_lines = ranking_context.get("status_lines", [])

    # Format fit chips
    chips_text = ""
    if fit_chips:
        chips_text = "\nFit Chips: " + ", ".join([
            f"{c.get('icon', '')} {c.get('label', '')}" for c in fit_chips
        ])

    # Format status lines
    status_text = ""
    if status_lines:
        status_text = "\nMarket Status: " + " | ".join(status_lines)

    below_market_text = ""
    if below_market_pct is not None:
        below_market_text = f"\nBelow Market: {below_market_pct:.1%}"

    prompt = f"""You are an expert real estate analyst performing due diligence on a property for a specific buyer.
Your job is to deeply analyze the MLS listing against the buyer's requirements.

{buyer_context}

---
PROPERTY:
Address: {address}, {city}, {state}
Price: ${price:,}
Beds: {bedrooms} | Baths: {bathrooms} | SqFt: {sqft}
Type: {property_type}
Year Built: {year_built}
Days on Market: {days_on_market}

{description_block}

{structured_block}

---
EXISTING RANKING (for context, do not recalculate):
Fit Score: {fit_score}/100
Priority Tag: {priority_tag}
Market Strength: {market_strength}{below_market_text}
Final Score: {final_score}
Rank: #{rank}{chips_text}{status_text}

---
YOUR TASK:

You must output exactly the JSON schema provided (headline, summary_for_buyer, whats_matching, whats_missing, red_flags).

Analyze this property for {buyer_name}. You must:

1. CHECK EACH BUYER REQUIREMENT against BOTH:
   a) the STRUCTURED MLS FIELDS block above
   b) the MLS DESCRIPTION text

   - If clearly present in structured fields → source = "explicit" and include a short quote/paraphrase
   - If clearly present only in description → source = "explicit" and include exact MLS phrase as evidence
   - If not clearly stated anywhere but reasonably deduced → source = "inferred" and explain why
   - If it does NOT appear in structured fields AND NOT in description → put it in whats_missing

2. If structured fields and description CONTRADICT each other (e.g., basementFinished=True but description says "unfinished basement"), treat this as a red_flag with risk_level="medium" and a follow_up telling the agent what to verify.

3. FLAG VAGUE/HEDGING LANGUAGE as red_flags
   - Phrases like: "some TLC", "needs updating", "handyman special", "cozy", "as-is", "great potential", "investor special"
   - Include the exact quote, assess risk level, suggest follow-up question

4. WRITE HONESTLY
   - summary_for_buyer MUST include at least one caveat if there are whats_missing items or red_flags
   - Do NOT guess or hallucinate. If unsure → whats_missing with assessment="not mentioned, needs confirmation"
   - Use the buyer's decision_drivers to shape headline and summary tone

Return ONLY this JSON (no other text):
{{
  "headline": "5-8 word hook specific to this buyer's priorities",

  "summary_for_buyer": "2-3 sentences. Sentence 1: What you found. Sentence 2: Why it matters for THIS buyer. Sentence 3: One honest caveat if any gaps exist.",

  "whats_matching": [
    {{
      "requirement": "the buyer requirement being matched",
      "evidence": "exact MLS quote or short paraphrase proving it",
      "source": "explicit or inferred"
    }}
  ],

  "whats_missing": [
    {{
      "requirement": "the buyer requirement that's missing/unclear",
      "assessment": "why it's missing or unclear",
      "workaround": "realistic alternative or null"
    }}
  ],

  "red_flags": [
    {{
      "concern": "what might be wrong",
      "quote": "exact MLS phrase if available",
      "risk_level": "low or medium or high",
      "follow_up": "question or action for the agent"
    }}
  ]
}}

LIMITS (most important items first):
- whats_matching: max 10 items
- whats_missing: max 10 items
- red_flags: max 8 items

All 5 top-level keys must be present. Arrays may be empty but never omitted.
"""

    return prompt


def _generate_agent_take(
    client: OpenAI,
    model: str,
    profile: Dict[str, Any],
    listing: Dict[str, Any],
    ranking_context: Dict[str, Any],
    analysis: Dict[str, Any]
) -> str:
    """
    Generate "My Take" - AI agent's trade-off analysis and recommendation.

    Args:
        client: OpenAI client
        model: Model name (use gpt-4o-mini for cost efficiency)
        profile: Buyer profile with aiSummary
        listing: Property data
        ranking_context: Scoring context
        analysis: The main AI analysis result (for extracting top matches/concerns)

    Returns:
        One sentence recommendation (under 40 words)
    """
    buyer_summary = profile.get("aiSummary", "")
    address = listing.get("address", "")
    fit_score = ranking_context.get("fit_score", 0)

    # Extract top 3 matches
    matches = analysis.get("whats_matching", [])[:3]
    top_matches = ", ".join([m.get("requirement", "") for m in matches]) if matches else "matches your criteria"

    # Extract top 3 concerns
    missing = analysis.get("whats_missing", [])[:2]
    red_flags = analysis.get("red_flags", [])[:2]
    concerns = missing + red_flags
    top_concerns = ", ".join([
        c.get("concern", "") or c.get("requirement", "")
        for c in concerns[:3]
    ]) if concerns else "no major concerns"

    prompt = f"""You are a real estate agent writing a recommendation to your client.

BUYER: {buyer_summary}
PROPERTY: {address}, Fit Score {fit_score}/100

TOP 3 MATCHES: {top_matches}
TOP 3 CONCERNS: {top_concerns}

Write ONE sentence (under 40 words) starting with "If..." that acknowledges the key pros, the key trade-offs, and gives a recommendation.

Rules:
- Do NOT mention fit score
- Do NOT mention being an AI
- Do NOT use "pros/cons" literally
- End with exactly one of:
  * "this is a strong candidate to see in person."
  * "this is worth seeing if you stay flexible."
  * "this is probably one to pass on."

Example: "If extra space, a done kitchen, and real parking are high on your list and you're comfortable budgeting for some updates over time, this is a strong candidate to see in person."

Return ONLY the sentence.
"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You are a real estate agent. Write natural, conversational recommendations."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.7,
        max_tokens=100
    )

    agent_take = response.choices[0].message.content.strip()

    # Remove quotes if present
    if agent_take.startswith('"') and agent_take.endswith('"'):
        agent_take = agent_take[1:-1]

    return agent_take


def analyze_property_with_ai_v2(
    profile: Dict[str, Any],
    listing: Dict[str, Any],
    ranking_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Layer 1: Text + Profile Deep Match analysis.

    Single public function for AI analysis of Top 20 listings.
    Text-only (no photos/vision).

    Args:
        profile: Full buyer profile with all fields
        listing: Normalized listing data with MLS description
        ranking_context: {fit_score, fit_chips, priority_tag, below_market_pct,
                         status_lines, market_strength_score, final_score, rank}

    Returns:
        {
            "headline": str,
            "summary_for_buyer": str,
            "whats_matching": [...],
            "whats_missing": [...],
            "red_flags": [...]
        }
    """
    # Fallback response for any error
    fallback = {
        "headline": "Analysis unavailable",
        "summary_for_buyer": "We could not generate AI analysis for this property.",
        "whats_matching": [],
        "whats_missing": [],
        "red_flags": []
    }

    try:
        # Initialize OpenAI client
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("[AI V2] OPENAI_API_KEY not set")
            return fallback

        client = OpenAI(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        # Build prompt
        prompt = _build_analysis_prompt_v2(profile, listing, ranking_context)

        # Call OpenAI
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert real estate analyst. Return JSON only, no surrounding text. Quote MLS text as evidence. Never invent features."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        analysis = json.loads(content)

        # Validate: all 5 top-level keys must be present
        required_keys = ["headline", "summary_for_buyer", "whats_matching", "whats_missing", "red_flags"]
        for key in required_keys:
            if key not in analysis:
                print(f"[AI V2] Missing required key: {key}")
                return fallback

        # Validate: array fields must be arrays
        array_keys = ["whats_matching", "whats_missing", "red_flags"]
        for key in array_keys:
            if not isinstance(analysis[key], list):
                print(f"[AI V2] {key} is not an array")
                return fallback

        # Truncate arrays to limits (don't trust model to respect limits)
        analysis["whats_matching"] = analysis["whats_matching"][:10]
        analysis["whats_missing"] = analysis["whats_missing"][:10]
        analysis["red_flags"] = analysis["red_flags"][:8]

        listing_id = listing.get("id") or listing.get("mls_number") or "unknown"
        print(f"[AI V2] Success for listing {listing_id}: {len(analysis['whats_matching'])} matching, {len(analysis['whats_missing'])} missing, {len(analysis['red_flags'])} flags")

        # Generate text-only "My Take" (will be enhanced later with photo analysis)
        try:
            text_only_take = _generate_agent_take(
                client, model, profile, listing, ranking_context,
                {
                    "whats_matching": analysis["whats_matching"],
                    "whats_missing": analysis["whats_missing"],
                    "red_flags": analysis["red_flags"],
                    "photo_matches": [],
                    "photo_red_flags": []
                }
            )
            analysis["agent_take_ai"] = text_only_take
            analysis["vision_complete"] = False
        except Exception as e:
            print(f"[AI V2] Failed to generate My Take for {listing_id}: {e}")
            analysis["agent_take_ai"] = None
            analysis["vision_complete"] = False

        return analysis

    except json.JSONDecodeError as e:
        print(f"[AI V2] JSON parse error: {e}")
        return fallback
    except Exception as e:
        print(f"[AI V2] Error: {e}")
        return fallback
