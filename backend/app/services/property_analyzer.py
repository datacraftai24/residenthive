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
