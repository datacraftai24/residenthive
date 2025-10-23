"""
Property scoring engine using config-based rules.
Scores properties against buyer profiles for intelligent matching.
"""
from typing import Dict, Any, List, Optional
import re


class PropertyScorer:
    """Scores properties against buyer profiles using configurable rules"""

    def __init__(self, rules: Dict[str, Any]):
        """
        Initialize scorer with scoring rules.

        Args:
            rules: Scoring configuration from ScoringConfig
        """
        self.rules = rules

    def score_listing(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate total score and breakdown for a listing.

        Args:
            listing: Property data from Repliers API
            profile: Buyer profile data

        Returns:
            {
                "total": 85,  # Total score 0-100
                "breakdown": {
                    "budget_match": {"score": 30, "details": "..."},
                    "bedroom_match": {"score": 20, "details": "..."},
                    ...
                },
                "matched_features": ["updated kitchen", "large yard"],
                "missing_features": ["garage"],
            }
        """
        breakdown = {}
        total_score = 0
        matched_features = []
        missing_features = []

        # Budget scoring
        if self.rules.get("budget_match", {}).get("enabled", True):
            budget_result = self._score_budget(listing, profile)
            breakdown["budget_match"] = budget_result
            total_score += budget_result["score"]

        # Bedroom scoring
        if self.rules.get("bedroom_match", {}).get("enabled", True):
            bedroom_result = self._score_bedrooms(listing, profile)
            breakdown["bedroom_match"] = bedroom_result
            total_score += bedroom_result["score"]

        # Bathroom scoring
        if self.rules.get("bathroom_match", {}).get("enabled", True):
            bathroom_result = self._score_bathrooms(listing, profile)
            breakdown["bathroom_match"] = bathroom_result
            total_score += bathroom_result["score"]

        # Must-have features scoring
        if self.rules.get("must_have_features", {}).get("enabled", True):
            features_result = self._score_must_haves(listing, profile)
            breakdown["must_have_features"] = features_result
            total_score += features_result["score"]
            matched_features = features_result.get("matched", [])
            missing_features = features_result.get("missing", [])

        # Location scoring
        if self.rules.get("location_match", {}).get("enabled", True):
            location_result = self._score_location(listing, profile)
            breakdown["location_match"] = location_result
            total_score += location_result["score"]

        return {
            "total": min(100, round(total_score)),
            "breakdown": breakdown,
            "matched_features": matched_features,
            "missing_features": missing_features,
        }

    def check_dealbreakers(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> bool:
        """
        Check if listing has any dealbreakers.

        Args:
            listing: Property data
            profile: Buyer profile

        Returns:
            True if property should be rejected, False otherwise
        """
        dealbreaker_config = self.rules.get("dealbreakers", {})
        if not dealbreaker_config.get("enabled", True):
            return False

        description = str(listing.get("description", "")).lower()
        dealbreakers_list = profile.get("dealbreakers", [])

        # Check configured dealbreaker keywords
        for dealbreaker_type, keywords in dealbreaker_config.get("keywords", {}).items():
            for keyword in keywords:
                if keyword.lower() in description:
                    return True

        # Check profile-specific dealbreakers
        for dealbreaker in dealbreakers_list:
            dealbreaker_text = str(dealbreaker).lower()
            if dealbreaker_text in description:
                return True

        return False

    def _score_budget(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
        """Score based on budget match"""
        price = listing.get("price", 0) or 0
        budget_min = profile.get("budgetMin", 0) or 0
        budget_max = profile.get("budgetMax", 0) or 0

        if not budget_min or not budget_max or not price:
            return {"score": 0, "details": "Missing budget or price data"}

        weight = self.rules["budget_match"]["weight"]
        rules = self.rules["budget_match"]["rules"]

        # Within range
        if budget_min <= price <= budget_max:
            points = next((r["points"] for r in rules if r["condition"] == "within_range"), weight)
            return {
                "score": points,
                "details": f"${price:,} is within your ${budget_min:,}-${budget_max:,} budget"
            }

        # Within 10% under
        if price >= budget_min * 0.9 and price < budget_min:
            points = next((r["points"] for r in rules if r["condition"] == "within_10_percent_under"), int(weight * 0.8))
            return {
                "score": points,
                "details": f"${price:,} is just under your budget minimum"
            }

        # Within 10% over
        if price <= budget_max * 1.1:
            points = next((r["points"] for r in rules if r["condition"] == "within_10_percent_over"), int(weight * 0.7))
            return {
                "score": points,
                "details": f"${price:,} is within 10% of your maximum budget"
            }

        # Within 20% over
        if price <= budget_max * 1.2:
            points = next((r["points"] for r in rules if r["condition"] == "within_20_percent_over"), int(weight * 0.3))
            return {
                "score": points,
                "details": f"${price:,} is within 20% of your maximum budget"
            }

        # Outside range
        return {
            "score": 0,
            "details": f"${price:,} is outside your budget range"
        }

    def _score_bedrooms(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
        """Score based on bedroom match"""
        property_bedrooms = listing.get("bedrooms")
        min_bedrooms = profile.get("bedrooms")
        max_bedrooms = profile.get("maxBedrooms")

        if property_bedrooms is None or min_bedrooms is None:
            return {"score": 0, "details": "Missing bedroom data"}

        try:
            property_bedrooms = int(property_bedrooms)
            min_bedrooms = int(min_bedrooms)
            max_bedrooms = int(max_bedrooms) if max_bedrooms else None
        except (ValueError, TypeError):
            return {"score": 0, "details": "Invalid bedroom data"}

        weight = self.rules["bedroom_match"]["weight"]
        rules = self.rules["bedroom_match"]["rules"]

        # Within range (if max specified)
        if max_bedrooms and min_bedrooms <= property_bedrooms <= max_bedrooms:
            points = next((r["points"] for r in rules if r["condition"] == "within_range"), weight)
            return {
                "score": points,
                "details": f"{property_bedrooms} bedrooms (within your {min_bedrooms}-{max_bedrooms} range)"
            }

        # Exact match
        if property_bedrooms == min_bedrooms:
            points = next((r["points"] for r in rules if r["condition"] == "exact_match"), weight)
            return {
                "score": points,
                "details": f"{property_bedrooms} bedrooms (exactly what you requested)"
            }

        # One more than requested
        if property_bedrooms == min_bedrooms + 1:
            points = next((r["points"] for r in rules if r["condition"] == "one_more"), int(weight * 0.75))
            return {
                "score": points,
                "details": f"{property_bedrooms} bedrooms (one more than minimum)"
            }

        # One less than requested
        if property_bedrooms == min_bedrooms - 1:
            points = next((r["points"] for r in rules if r["condition"] == "one_less"), int(weight * 0.5))
            return {
                "score": points,
                "details": f"{property_bedrooms} bedrooms (one less than requested)"
            }

        # More than requested (but outside range if max specified)
        if property_bedrooms > min_bedrooms:
            return {
                "score": int(weight * 0.6),
                "details": f"{property_bedrooms} bedrooms (more than requested)"
            }

        # Less than minimum
        return {
            "score": 0,
            "details": f"{property_bedrooms} bedrooms (below minimum)"
        }

    def _score_bathrooms(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
        """Score based on bathroom match"""
        property_bathrooms = listing.get("bathrooms")
        required_bathrooms = profile.get("bathrooms")

        if property_bathrooms is None or required_bathrooms is None:
            return {"score": 0, "details": "Missing bathroom data"}

        try:
            property_bathrooms = float(property_bathrooms)
            # Handle string bathroom requirements like "2" or "2.5"
            if isinstance(required_bathrooms, str):
                required_bathrooms = float(re.sub(r"[^\d\.]", "", required_bathrooms))
            else:
                required_bathrooms = float(required_bathrooms)
        except (ValueError, TypeError):
            return {"score": 0, "details": "Invalid bathroom data"}

        weight = self.rules["bathroom_match"]["weight"]
        rules = self.rules["bathroom_match"]["rules"]

        # Meets or exceeds
        if property_bathrooms >= required_bathrooms:
            points = next((r["points"] for r in rules if r["condition"] == "meets_or_exceeds"), weight)
            return {
                "score": points,
                "details": f"{property_bathrooms} bathrooms (meets your requirement)"
            }

        # One less (0.5 tolerance)
        if property_bathrooms >= required_bathrooms - 1:
            points = next((r["points"] for r in rules if r["condition"] == "one_less"), int(weight * 0.5))
            return {
                "score": points,
                "details": f"{property_bathrooms} bathrooms (slightly below requirement)"
            }

        # Significantly below
        return {
            "score": 0,
            "details": f"{property_bathrooms} bathrooms (below minimum)"
        }

    def _score_must_haves(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
        """Score based on must-have features"""
        description = str(listing.get("description", "")).lower()
        must_haves = profile.get("mustHaveFeatures", [])

        if not must_haves:
            return {"score": 0, "details": "No must-have features specified", "matched": [], "missing": []}

        weight = self.rules["must_have_features"]["weight"]
        keywords_config = self.rules["must_have_features"].get("keywords", {})

        matched_features = []
        missing_features = []

        # Check each must-have feature
        for feature in must_haves:
            feature_text = str(feature).lower().strip()
            feature_found = False

            # Check if feature text directly in description
            if feature_text in description:
                matched_features.append(feature)
                feature_found = True
            else:
                # Check against configured keywords
                for feature_key, keywords in keywords_config.items():
                    if feature_text in feature_key or feature_key in feature_text:
                        # Check if any keyword matches
                        if any(keyword.lower() in description for keyword in keywords):
                            matched_features.append(feature)
                            feature_found = True
                            break

            if not feature_found:
                missing_features.append(feature)

        # Calculate score based on percentage of must-haves met
        if not must_haves:
            score = 0
        else:
            percentage_matched = len(matched_features) / len(must_haves)
            score = int(weight * percentage_matched)

        return {
            "score": score,
            "details": f"{len(matched_features)} of {len(must_haves)} must-haves found",
            "matched": matched_features,
            "missing": missing_features,
        }

    def _score_location(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
        """Score based on location match"""
        property_city = str(listing.get("city", "")).lower().strip()
        property_state = str(listing.get("state", "")).lower().strip()

        profile_location = profile.get("location", "")
        preferred_areas = profile.get("preferredAreas", [])

        if not property_city:
            return {"score": 0, "details": "Missing location data"}

        weight = self.rules["location_match"]["weight"]
        rules = self.rules["location_match"]["rules"]

        # Extract city from profile location (format: "City, State")
        requested_city = ""
        requested_state = ""
        if profile_location and "," in profile_location:
            parts = profile_location.split(",")
            requested_city = parts[0].strip().lower()
            if len(parts) > 1:
                requested_state = parts[1].strip().lower()

        # Exact city match
        if property_city == requested_city:
            points = next((r["points"] for r in rules if r["condition"] == "city_match"), weight)
            return {
                "score": points,
                "details": f"{listing.get('city')} (your preferred city)"
            }

        # Check preferred areas
        if preferred_areas:
            for area in preferred_areas:
                area_text = str(area).lower().strip()
                if area_text in property_city or property_city in area_text:
                    points = next((r["points"] for r in rules if r["condition"] == "city_match"), weight)
                    return {
                        "score": points,
                        "details": f"{listing.get('city')} (one of your preferred areas)"
                    }

        # State match (nearby)
        if property_state == requested_state:
            points = next((r["points"] for r in rules if r["condition"] == "nearby_city"), int(weight * 0.5))
            return {
                "score": points,
                "details": f"{listing.get('city')}, {listing.get('state')} (same state)"
            }

        # No match
        return {
            "score": 0,
            "details": f"{listing.get('city')}, {listing.get('state')} (different location)"
        }

    def get_rejection_reasons(self, listing: Dict[str, Any], profile: Dict[str, Any]) -> List[str]:
        """
        Get list of reasons why a property was rejected.

        Returns:
            List of human-readable rejection reasons
        """
        reasons = []
        description = str(listing.get("description", "")).lower()
        dealbreaker_config = self.rules.get("dealbreakers", {})

        # Check configured dealbreakers
        for dealbreaker_type, keywords in dealbreaker_config.get("keywords", {}).items():
            for keyword in keywords:
                if keyword.lower() in description:
                    reasons.append(f"Dealbreaker: {dealbreaker_type.replace('_', ' ').title()}")
                    break

        # Check profile dealbreakers
        dealbreakers_list = profile.get("dealbreakers", [])
        for dealbreaker in dealbreakers_list:
            dealbreaker_text = str(dealbreaker).lower()
            if dealbreaker_text in description:
                reasons.append(f"Dealbreaker: {dealbreaker}")

        return reasons
