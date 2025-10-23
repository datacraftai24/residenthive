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
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Analyze a property listing against buyer profile using AI.

        Args:
            listing: Property data from Repliers
            profile: Buyer profile data
            score_data: Pre-calculated score breakdown (optional)
            use_cache: Whether to use cached analysis

        Returns:
            {
                "headline": "Perfect Family Home on Quiet Street",
                "agent_insight": "I love this one...",
                "matched_features": [...],
                "dealbreaker_flags": [...],
                "why_it_works": {...},
                "considerations": [...],
                "match_reasoning": {...}
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
            prompt = self._build_prompt(listing, profile, score_data)
            analysis = self._call_openai(prompt)

            # Cache the result
            if use_cache and listing_id and profile_id:
                self._cache_analysis(listing_id, profile_id, analysis)

            return analysis

        except Exception as e:
            print(f"[PROPERTY ANALYZER] Error analyzing listing {listing_id}: {e}")
            # Return fallback response
            return self._get_fallback_analysis(listing, profile, score_data)

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
        score_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the AI prompt for property analysis"""

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

        prompt = f"""You are an experienced real estate agent helping a buyer find their perfect home.
Analyze this property against the buyer's specific needs and preferences.

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

YOUR TASK:
As their trusted agent, analyze this property and provide:

1. **headline** (5-8 words): A compelling, specific headline that captures what makes this property special for THIS buyer. Not generic - make it personal.

2. **agent_insight** (2-3 sentences): Write as if you're texting or emailing this buyer directly. Use "I" and "you". Explain why YOU picked this property for THEM specifically. Be conversational and warm. Reference their actual needs/situation.

3. **matched_features** (array): List 3-5 specific features from the property that match their must-haves, lifestyle priorities, or special needs. Format: "Feature name (why it matters to them)"

4. **dealbreaker_flags** (array): Honestly note any dealbreakers or concerns. If none, return empty array. Be transparent but tactful.

5. **why_it_works** (object with 2-4 keys): Explain the fit in specific categories:
   - budget: How the price aligns with their budget
   - location: Why the location works for them
   - lifestyle_fit or family_fit or investment_fit: Based on their buyer type/priorities

6. **considerations** (array): 1-2 honest notes about tradeoffs or things to think about. Not dealbreakers, but worth mentioning.

7. **match_reasoning** (object): Calculate these scores and explain each:
   - budget_score (0-100): How well price fits their budget
   - feature_score (0-100): % of must-haves this property has
   - location_score (0-100): Location alignment
   - lifestyle_score (0-100): How well it fits their lifestyle/priorities
   - overall_score (0-100): Weighted average

   For each score, provide: {{"score": 85, "explanation": "Brief reason"}}

TONE GUIDELINES:
- Sound like a real person, not a corporate brochure
- Be enthusiastic but honest
- Use contractions (I'm, you'll, it's)
- Reference their specific situation
- If it's not a good fit, be honest but constructive
- Avoid clichés like "dream home" or "don't miss out"

Return ONLY valid JSON with this structure:
{{
  "headline": "...",
  "agent_insight": "...",
  "matched_features": [...],
  "dealbreaker_flags": [...],
  "why_it_works": {{...}},
  "considerations": [...],
  "match_reasoning": {{...}}
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
                        "content": "You are an experienced real estate agent who provides personalized, honest property recommendations."
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
            required_fields = ["headline", "agent_insight", "matched_features", "why_it_works", "match_reasoning"]
            for field in required_fields:
                if field not in analysis:
                    raise ValueError(f"Missing required field: {field}")

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
        score_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Return basic analysis when AI fails"""
        price = listing.get("price", 0)
        bedrooms = listing.get("bedrooms", 0)
        city = listing.get("city", "this area")

        return {
            "headline": f"{bedrooms}-Bedroom Home in {city}",
            "agent_insight": f"This property at ${price:,} has {bedrooms} bedrooms and could be a good fit for your search.",
            "matched_features": score_data.get("matched_features", []) if score_data else [],
            "dealbreaker_flags": [],
            "why_it_works": {
                "budget": f"Listed at ${price:,}",
                "location": f"Located in {city}",
            },
            "considerations": [],
            "match_reasoning": {
                "budget_score": {"score": 70, "explanation": "Within general market range"},
                "feature_score": {"score": 60, "explanation": "Basic feature match"},
                "location_score": {"score": 70, "explanation": "Location assessment"},
                "lifestyle_score": {"score": 65, "explanation": "General lifestyle fit"},
                "overall_score": {"score": 66, "explanation": "Average match"}
            }
        }
