"""
Unified property search service with smart strategies.

This service provides a single entry point for all property searches,
automatically selecting the best strategy based on available data:

1. Similar Listings API - When lead has MLS number (property-specific)
2. Criteria Search with Inference - When we have profile data but need to infer missing fields
3. Basic Criteria Search - When profile data is complete

Usage:
    from services.search_service import SearchService

    service = SearchService()

    # Auto-detect best strategy
    result = service.search(profile, lead)

    # Force specific strategy
    result = service.search(profile, lead, search_type="similar")
"""

from dataclasses import dataclass
from typing import Dict, List, Any, Optional, Tuple
import logging

from .repliers import RepliersClient, RepliersError
from .regional_config import get_regional_config

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Result from any search strategy."""
    listings: List[Dict[str, Any]]
    strategy: str  # "similar", "criteria_enhanced", "criteria_basic"
    total_count: int
    inferences: List[Dict[str, Any]]  # What was inferred and why
    reference_property: Optional[Dict[str, Any]] = None  # For similar searches


class SearchService:
    """
    Unified property search service.

    Provides a single entry point for all property searches, automatically
    selecting the best strategy based on available data.
    """

    def __init__(self, repliers_client: RepliersClient = None):
        """
        Initialize SearchService.

        Args:
            repliers_client: Optional RepliersClient instance (for testing/injection)
        """
        self.repliers = repliers_client or RepliersClient()

    def search(
        self,
        profile: dict,
        lead: dict = None,
        search_type: str = "auto"
    ) -> SearchResult:
        """
        Main entry point for property searches.

        Args:
            profile: Buyer profile dict with keys like:
                - location: "Worcester, MA"
                - budgetMin, budgetMax: price range
                - bedrooms, maxBedrooms: bedroom range
                - homeType: property type preference
            lead: Optional lead data dict with keys like:
                - property_listing_id: MLS number (triggers Similar search)
                - property_address: Full address
                - property_list_price: List price from MLS
                - property_bedrooms, property_bathrooms: Property specs
                - extracted_location: Location extracted from lead text
            search_type: "auto" (detect best), "similar", or "criteria"

        Returns:
            SearchResult with listings, strategy used, and inference metadata
        """
        # Auto-detect strategy if not specified
        if search_type == "auto":
            strategy = self._detect_strategy(profile, lead)
        else:
            strategy = search_type

        logger.info(f"[SEARCH_SERVICE] Using strategy: {strategy}")

        # Execute the selected strategy
        if strategy == "similar":
            return self._search_similar(lead)
        else:
            return self._search_criteria(profile, lead)

    def _detect_strategy(self, profile: dict, lead: dict = None) -> str:
        """
        Detect the best search strategy based on available data.

        Priority:
        1. If lead has property_listing_id (MLS number) → Similar Listings API
        2. Otherwise → Criteria search with inference
        """
        if lead and lead.get("property_listing_id"):
            logger.info(f"[SEARCH_SERVICE] Lead has MLS number, using similar strategy")
            return "similar"

        logger.info(f"[SEARCH_SERVICE] No MLS number, using criteria strategy")
        return "criteria"

    def _search_similar(self, lead: dict) -> SearchResult:
        """
        Strategy 1: Similar Listings API.

        Uses Repliers /listings/{mls}/similar endpoint to find
        properties similar to the one the lead inquired about.

        Args:
            lead: Lead data with property_listing_id required

        Returns:
            SearchResult with similar listings
        """
        mls_number = lead.get("property_listing_id")
        if not mls_number:
            raise ValueError("Similar search requires property_listing_id (MLS number)")

        logger.info(f"[SEARCH_SERVICE] Searching similar listings for MLS# {mls_number}")

        try:
            listings = self.repliers.get_similar_listings(mls_number)

            # Build reference property from lead data for context
            ref_price = lead.get("property_list_price")
            reference = {
                "mls_number": mls_number,
                "address": lead.get("property_address"),
                "list_price": ref_price,
                "bedrooms": lead.get("property_bedrooms"),
                "bathrooms": lead.get("property_bathrooms"),
            }

            logger.info(f"[SEARCH_SERVICE] Similar search returned {len(listings)} listings (before budget filter)")

            # Post-filter by budget: Similar API doesn't filter by price.
            # Use lead's extracted budget if available, otherwise ±50% of reference price.
            budget_min = lead.get("extracted_budget_min")
            budget_max = lead.get("extracted_budget_max")
            if not budget_min and not budget_max and ref_price:
                try:
                    price_f = float(ref_price)
                    budget_min = int(price_f * 0.5)
                    budget_max = int(price_f * 1.5)
                except (ValueError, TypeError):
                    pass

            if budget_min or budget_max:
                filtered = []
                for l in listings:
                    lp = l.get("listPrice") or l.get("list_price")
                    if lp is None:
                        filtered.append(l)  # keep listings without price data
                        continue
                    try:
                        lp_val = float(lp)
                    except (ValueError, TypeError):
                        filtered.append(l)
                        continue
                    if budget_min and lp_val < float(budget_min):
                        continue
                    if budget_max and lp_val > float(budget_max):
                        continue
                    filtered.append(l)
                logger.info(f"[SEARCH_SERVICE] Budget filter: {len(listings)} -> {len(filtered)} (${budget_min}-${budget_max})")
                listings = filtered

            return SearchResult(
                listings=listings,
                strategy="similar",
                total_count=len(listings),
                inferences=[],  # No inference needed - using Similar API
                reference_property=reference
            )

        except RepliersError as e:
            logger.warning(f"[SEARCH_SERVICE] Similar listings API failed: {e}")

            # Try geo-radius fallback first if we have coordinates
            fallback_profile = self._build_profile_from_lead(lead)
            property_raw = lead.get("property_raw")
            if isinstance(property_raw, str):
                try:
                    import json
                    property_raw = json.loads(property_raw)
                except Exception:
                    property_raw = None

            lat = None
            lng = None
            if isinstance(property_raw, dict):
                # Coordinates from Repliers: map.latitude/longitude or address.latitude/longitude
                map_obj = property_raw.get("map") or {}
                lat = map_obj.get("latitude") or (property_raw.get("address") or {}).get("latitude")
                lng = map_obj.get("longitude") or (property_raw.get("address") or {}).get("longitude")

            if lat and lng:
                logger.info(f"[SEARCH_SERVICE] Falling back to geo-radius search at ({lat}, {lng})")
                fallback_profile["lat"] = lat
                fallback_profile["long"] = lng
                fallback_profile["radius"] = 15  # 15km radius around reference property
                # Remove city filter since we're using coordinates
                fallback_profile.pop("location", None)
            else:
                logger.info(f"[SEARCH_SERVICE] Falling back to criteria search (no coordinates available)")

            return self._search_criteria(fallback_profile, lead)

    def _search_criteria(self, profile: dict, lead: dict = None) -> SearchResult:
        """
        Strategy 2/3: Criteria-based search with smart inference.

        Enhances profile with inferred values before searching.

        Args:
            profile: Buyer profile data
            lead: Optional lead data for additional context

        Returns:
            SearchResult with matching listings
        """
        # Apply inference to fill missing fields
        enhanced, inferences = self._enhance_profile(profile, lead)

        strategy_name = "criteria_enhanced" if inferences else "criteria_basic"
        logger.info(f"[SEARCH_SERVICE] Criteria search ({strategy_name}), inferences: {len(inferences)}")

        try:
            listings = self.repliers.search(enhanced)

            logger.info(f"[SEARCH_SERVICE] Criteria search returned {len(listings)} listings")

            return SearchResult(
                listings=listings,
                strategy=strategy_name,
                total_count=len(listings),
                inferences=inferences,
                reference_property=None
            )

        except RepliersError as e:
            logger.error(f"[SEARCH_SERVICE] Criteria search failed: {e}")
            return SearchResult(
                listings=[],
                strategy=strategy_name,
                total_count=0,
                inferences=inferences,
                reference_property=None
            )

    def _enhance_profile(self, profile: dict, lead: dict = None) -> Tuple[dict, list]:
        """
        Apply smart inference to enhance profile with missing fields.

        Inference strategies:
        - Budget without bedrooms → Infer bedroom range from regional price-per-bedroom
        - Location without budget → Infer budget range from regional percentiles

        Args:
            profile: Original profile data
            lead: Optional lead data for additional context

        Returns:
            Tuple of (enhanced_profile, list of inferences made)
        """
        enhanced = dict(profile)
        inferences = []

        # Extract key fields (handle both camelCase and snake_case)
        location = profile.get("location")
        budget_min = profile.get("budgetMin") or profile.get("budget_min")
        budget_max = profile.get("budgetMax") or profile.get("budget_max")
        bedrooms = profile.get("bedrooms")

        # Extract state from location string (e.g., "Newton, MA" → "MA")
        if location and not enhanced.get("state"):
            state = self._extract_state_from_address(location)
            if state:
                enhanced["state"] = state

        # Get regional config for inference
        regional = get_regional_config(location) if location else get_regional_config("")

        # Strategy 2: Budget → Bedroom inference
        if (budget_min or budget_max) and not bedrooms:
            budget = budget_max or budget_min
            inferred = self._infer_bedrooms_from_budget(budget, regional)
            if inferred:
                enhanced["bedrooms"] = inferred["min"]
                enhanced["maxBedrooms"] = inferred["max"]
                inferences.append({
                    "field": "bedrooms",
                    "inferred_value": inferred,
                    "reason": f"Budget ${budget:,} → {inferred['min']}-{inferred['max']} beds (regional data)",
                    "confidence": 0.75
                })
                logger.info(f"[SEARCH_SERVICE] Inferred bedrooms: {inferred['min']}-{inferred['max']} from budget ${budget:,}")

        # Strategy 3: Location → Budget inference
        if location and not budget_min and not budget_max:
            inferred = self._infer_budget_from_location(regional)
            enhanced["budgetMin"] = inferred["min"]
            enhanced["budgetMax"] = inferred["max"]
            inferences.append({
                "field": "budget",
                "inferred_value": inferred,
                "reason": f"Regional p25-p75 for {location}",
                "confidence": 0.6
            })
            logger.info(f"[SEARCH_SERVICE] Inferred budget: ${inferred['min']:,} - ${inferred['max']:,} for {location}")

        return enhanced, inferences

    def _build_profile_from_lead(self, lead: dict) -> dict:
        """
        Build a search profile from lead property data.

        Used as fallback when Similar Listings API fails.

        Args:
            lead: Lead data with property information

        Returns:
            Profile dict suitable for criteria search
        """
        price = lead.get("property_list_price")
        address = lead.get("property_address")
        price_float = float(price) if price else None

        profile = {
            "location": lead.get("extracted_location") or self._extract_city_from_address(address),
            "budgetMin": int(price_float * 0.8) if price_float else None,
            "budgetMax": int(price_float * 1.2) if price_float else None,
            "bedrooms": lead.get("property_bedrooms"),
            "bathrooms": lead.get("property_bathrooms"),
        }
        # Extract state from address (e.g., "123 Main St, Newton, MA 01609")
        state = self._extract_state_from_address(address)
        if state:
            profile["state"] = state
        return profile

    def _extract_state_from_address(self, address: str) -> Optional[str]:
        """Extract 2-letter state code from address like '123 Main St, Newton, MA 01609'."""
        if not address:
            return None
        import re
        # Match 2-letter state code (optionally followed by zip)
        match = re.search(r'\b([A-Z]{2})\b(?:\s+\d{5})?', address)
        if match:
            return match.group(1)
        return None

    def _extract_city_from_address(self, address: str) -> Optional[str]:
        """
        Extract city from full address string.

        Args:
            address: Full address like "123 Main St, Worcester, MA 01609"

        Returns:
            City name or None
        """
        if not address:
            return None

        # Split by comma and try to find city
        parts = [p.strip() for p in address.split(",")]
        if len(parts) >= 2:
            # Typically: "123 Main St", "Worcester", "MA 01609"
            return parts[1]
        elif parts:
            return parts[0]
        return None

    def _infer_bedrooms_from_budget(self, budget: int, regional: dict) -> Optional[dict]:
        """
        Infer bedroom range from budget using regional price-per-bedroom data.

        Args:
            budget: Budget amount
            regional: Regional config with price_per_bedroom

        Returns:
            Dict with min/max bedrooms or None
        """
        price_per_bed = regional.get("price_per_bedroom", {})
        if not price_per_bed:
            return None

        # Find bedroom counts where budget fits (with 20% variance)
        matching = []
        for beds, typical_price in price_per_bed.items():
            if typical_price * 0.8 <= budget <= typical_price * 1.3:
                matching.append(beds)

        if matching:
            return {"min": min(matching), "max": max(matching)}

        # Fallback: find closest match and create range around it
        closest = min(price_per_bed.keys(), key=lambda b: abs(price_per_bed[b] - budget))
        return {"min": max(1, closest - 1), "max": closest + 1}

    def _infer_budget_from_location(self, regional: dict) -> dict:
        """
        Infer budget range from regional percentiles.

        Uses p25-p75 range to cover the "middle market" for the area.

        Args:
            regional: Regional config with price_percentiles

        Returns:
            Dict with min/max budget
        """
        percentiles = regional.get("price_percentiles", {})
        return {
            "min": percentiles.get("p25", 300000),
            "max": percentiles.get("p75", 600000)
        }
