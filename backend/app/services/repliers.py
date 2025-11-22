import os
import re
import math
from typing import Any, Dict, List
from datetime import datetime, timezone
import httpx
from dotenv import load_dotenv
from pathlib import Path

# Load .env files before reading environment variables
try:
    repo_root_env = Path(__file__).resolve().parents[3] / ".env"
    backend_env = Path(__file__).resolve().parents[2] / ".env"
    if repo_root_env.exists():
        load_dotenv(dotenv_path=repo_root_env, override=False)
    if backend_env.exists():
        load_dotenv(dotenv_path=backend_env, override=False)
except Exception:
    pass

REPLIERS_BASE_URL = os.getenv("REPLIERS_BASE_URL", "https://api.repliers.io")
REPLIERS_SEARCH_PATH = os.getenv("REPLIERS_SEARCH_PATH", "/listings")
REPLIERS_API_KEY = os.getenv("REPLIERS_API_KEY", "")
REPLIERS_TIMEOUT = float(os.getenv("REPLIERS_TIMEOUT_SECONDS", "15"))


class RepliersError(Exception):
    pass


class RepliersClient:
    def __init__(self,
                 base_url: str = REPLIERS_BASE_URL,
                 search_path: str = REPLIERS_SEARCH_PATH,
                 api_key: str = REPLIERS_API_KEY,
                 timeout: float = REPLIERS_TIMEOUT) -> None:
        self.base_url = base_url.rstrip("/")
        self.search_path = search_path
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise RepliersError("REPLIERS_API_KEY is not set")
        return {
            "REPLIERS-API-KEY": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _build_search_query(self, profile: Dict[str, Any], results_per_page: int = 100, page_num: int = 1) -> Dict[str, Any]:
        q: Dict[str, Any] = {
            "resultsPerPage": results_per_page,
            "pageNum": page_num,
            "class": "residential",  # API accepts lowercase: 'residential', 'commercial', 'condo'
            "standardStatus": "Active",  # RESO-compliant status filter (replaces deprecated status="A")
            "type": "Sale"  # Filter out rentals - only show properties for sale
        }
        # Budget - Repliers uses minPrice/maxPrice (not minListPrice/maxListPrice)
        if profile.get("budgetMin"):
            q["minPrice"] = int(profile["budgetMin"])
        if profile.get("budgetMax"):
            q["maxPrice"] = int(profile["budgetMax"])
        # Bedrooms
        if profile.get("bedrooms") is not None:
            q["minBedrooms"] = int(profile["bedrooms"])
        if profile.get("maxBedrooms") is not None:
            q["maxBedrooms"] = int(profile["maxBedrooms"])
        # Bathrooms - Repliers uses minBaths/maxBaths (not minBathrooms/maxBathrooms)
        baths = profile.get("bathrooms")
        if baths is not None:
            if isinstance(baths, str):
                try:
                    val = re.sub(r"[^0-9\.]", "", baths)
                    if val:
                        # Round up to nearest int - Repliers API requires integers for bath filter
                        q["minBaths"] = math.ceil(float(val))
                except Exception:
                    pass
            else:
                # Round up to nearest int - Repliers API requires integers for bath filter
                q["minBaths"] = math.ceil(float(baths))
        # Support max bathrooms filter
        max_baths = profile.get("maxBathrooms")
        if max_baths is not None:
            # Round up to nearest int - Repliers API requires integers for bath filter
            q["maxBaths"] = math.ceil(float(max_baths))
        # Property type - map user-friendly values to Repliers API style field
        # Note: Use 'style' parameter (not 'propertyType') for specific property types
        # propertyType is high-level (Residential, Commercial), style is specific (Single Family Residence, Condominium)
        if profile.get("homeType"):
            home_type = profile["homeType"]
            # Map common values to Repliers API style values (from aggregates data)
            style_map = {
                "single-family": "Single Family Residence",
                "single family": "Single Family Residence",
                "singlefamily": "Single Family Residence",
                "condo": "Condominium",
                "condominium": "Condominium",
                "townhouse": "Attached (Townhouse/Rowhouse/Duplex)",
                "multi-family": "Multi Family",
                "multi family": "Multi Family",
                "multifamily": "Multi Family",
                "apartment": "Apartment"
            }
            # Use mapped value, or pass through as-is if not in map
            api_value = style_map.get(home_type.lower(), home_type)
            q["style"] = api_value
        # Location - Repliers API uses 'city' parameter for city filtering
        # NOTE: The API doesn't support state/stateOrProvince parameters
        # Extract just the city name from various formats
        if profile.get("location"):
            loc = str(profile["location"]).strip()
            city_name = loc

            # Format 1: Comma-separated (e.g., "Worcester, MA" or "Boston, Massachusetts")
            if "," in loc:
                city_name = loc.split(",")[0].strip()
            # Format 2: Space + 2-letter state code (e.g., "Boston MA")
            elif " " in loc:
                parts = loc.split()
                # Check if last part is a 2-letter state code
                if len(parts) >= 2 and len(parts[-1]) == 2 and parts[-1].isalpha():
                    city_name = " ".join(parts[:-1]).strip()
                # Otherwise use the full string (might be multi-word city like "New York")
            # Format 3: Single word city (e.g., "Boston") - use as-is

            q["city"] = city_name
        # Note: preferredAreas is NOT used for Repliers search - only location field matters
        return q

    def search(self, profile: Dict[str, Any], results_per_page: int = 100, page_num: int = 1) -> List[Dict[str, Any]]:
        """Search listings using GET request with query parameters.

        Note: Repliers API uses GET with query params, not POST with JSON body.
        Uses RESO-compliant parameters: city, standardStatus, resultsPerPage, pageNum.
        Location filtering works with city names (extracts city from "City, State" format).

        Returns:
            List of normalized listings, each containing a '_raw' key with the original API response
        """
        params = self._build_search_query(profile, results_per_page, page_num)
        url = f"{self.base_url}{self.search_path}"

        # Debug logging - see exactly what we're sending to Repliers
        import json
        print(f"[REPLIERS] Full URL: {url}")
        print(f"[REPLIERS] Query params: {json.dumps(params, indent=2)}")
        print(f"[REPLIERS] Profile data: {json.dumps({k: v for k, v in profile.items() if k in ['location', 'budgetMin', 'budgetMax', 'bedrooms', 'maxBedrooms', 'bathrooms', 'homeType']}, indent=2)}")

        with httpx.Client(timeout=self.timeout) as client:
            r = client.get(url, params=params, headers=self._headers())
            print(f"[REPLIERS] Response status: {r.status_code}")
            if r.status_code >= 400:
                print(f"[REPLIERS ERROR] API request failed with status {r.status_code}: {r.text}")
                raise RepliersError(f"Repliers search failed: {r.status_code} {r.text}")
            data = r.json()
            print(f"[REPLIERS] Response data keys: {list(data.keys())}")
            print(f"[REPLIERS] Number of listings returned: {len(data.get('listings', data)) if isinstance(data.get('listings', data), list) else 'N/A'}")
        items = data.get("listings", data)
        if not isinstance(items, list):
            raise RepliersError("Unexpected Repliers response shape")

        # Normalize listings and attach raw data for quality analysis
        return [self._normalize_listing(item) for item in items]

    def _normalize_listing(self, item: Dict[str, Any]) -> Dict[str, Any]:
        # Address (handle both flat and nested address objects)
        address_obj = item.get("address", {})
        if isinstance(address_obj, dict):
            street_num = address_obj.get("streetNumber") or address_obj.get("streetNo") or address_obj.get("houseNumber") or address_obj.get("number")
            street_name = address_obj.get("streetName") or address_obj.get("street") or address_obj.get("address1") or address_obj.get("streetAddress")
            unit = address_obj.get("unitNumber") or address_obj.get("unit") or address_obj.get("apt")
            parts = []
            if street_num or street_name:
                parts.append(" ".join([str(street_num) if street_num else "", str(street_name) if street_name else ""]).strip())
            if unit:
                parts.append(unit)
            address = " ".join(parts).strip()
            city = address_obj.get("city") or address_obj.get("locality") or ""
            state = address_obj.get("state") or address_obj.get("region") or ""
            zip_code = address_obj.get("zip") or address_obj.get("postalCode") or ""
        else:
            # Fallback for flat address structure
            address = item.get("address") or item.get("address1") or item.get("street") or item.get("streetName") or ""
            city = item.get("city") or item.get("locality") or ""
            state = item.get("state") or item.get("region") or ""
            zip_code = item.get("zip") or item.get("postalCode") or ""
        
        # Images
        images: List[str] = []
        imgs = item.get("images") or item.get("photos") or []
        if isinstance(imgs, list):
            for im in imgs:
                if isinstance(im, str):
                    if not im.startswith("http"):
                        images.append(f"https://cdn.repliers.io/{im.lstrip('/')}?class=medium")
                    else:
                        images.append(im)
                elif isinstance(im, dict):
                    url = im.get("url") or im.get("src")
                    if url:
                        if isinstance(url, str) and not url.startswith("http"):
                            url = f"https://cdn.repliers.io/{url.lstrip('/')}?class=medium"
                        images.append(url)
        
        # Extract details object
        details = item.get("details", {}) or {}
        
        # Bedrooms/Bathrooms from details or top-level
        bedrooms = (
            details.get("numBedrooms")
            or details.get("numBedroomsPlus")
            or item.get("bedrooms")
            or item.get("beds")
            or item.get("bedroomsTotal")
            or item.get("bedsTotal")
        )
        bathrooms = (
            details.get("numBathrooms")
            or details.get("numBathroomsPlus")
            or item.get("bathrooms")
            or item.get("baths")
            or item.get("bathroomsTotal")
            or item.get("bathsTotal")
        )
        
        # Square feet
        square_feet = (
            details.get("sqft")
            or item.get("sqft")
            or item.get("squareFeet")
            or item.get("livingArea")
        )
        
        # Description
        description = details.get("description") or item.get("description") or item.get("remarks")
        
        # Property type
        property_type = details.get("propertyType") or item.get("propertyType") or item.get("type")

        # Year built
        year_built = details.get("yearBuilt") or item.get("yearBuilt")

        # Lot size
        lot_size = details.get("lotSize") or item.get("lotSize") or item.get("lotSizeArea")

        # Days on market - calculate from list date if available
        days_on_market = None
        list_date = item.get("listDate") or item.get("listingDate") or item.get("datePosted") or details.get("listDate")
        if list_date:
            try:
                # Parse ISO format date
                list_dt = datetime.fromisoformat(list_date.replace('Z', '+00:00'))
                now = datetime.now(timezone.utc)
                days_on_market = (now - list_dt).days
            except Exception:
                # If parsing fails, check if there's a days_on_market field already
                days_on_market = item.get("daysOnMarket") or details.get("daysOnMarket")
        else:
            # Fallback to existing daysOnMarket field if available
            days_on_market = item.get("daysOnMarket") or details.get("daysOnMarket")

        # Price history extraction
        original_price = item.get("originalPrice") or item.get("originalListPrice")
        list_price = item.get("listPrice") or item.get("price") or 0
        price_log = item.get("listPriceLog") or []
        timestamps = item.get("timestamps", {}) or {}

        # Calculate price cuts count and total reduction
        price_cuts_count = len(price_log) if isinstance(price_log, list) else 0

        # Calculate total price reduction
        total_price_reduction = 0
        if original_price and list_price:
            try:
                reduction = int(original_price) - int(list_price)
                total_price_reduction = max(0, reduction)  # Never negative
            except (ValueError, TypeError):
                pass

        # Determine price trend direction
        price_trend_direction = None
        if original_price and list_price:
            try:
                orig = int(original_price)
                curr = int(list_price)
                if curr < orig:
                    price_trend_direction = "down"
                elif curr > orig:
                    price_trend_direction = "up"
                else:
                    price_trend_direction = "flat"
            except (ValueError, TypeError):
                pass

        # Last price change date
        last_price_change_date = timestamps.get("lastPriceChanged")

        # Lot acres
        lot_obj = item.get("lot", {}) or {}
        lot_acres = lot_obj.get("acres")

        # Parse special flags from description
        special_flags = []
        desc_lower = (description or "").lower()

        # Keyword matching for special conditions
        if "cash only" in desc_lower:
            special_flags.append("Cash Only")
        if "as-is" in desc_lower or "as is" in desc_lower:
            special_flags.append("As-Is")
        if "investor" in desc_lower or "investment" in desc_lower:
            special_flags.append("Investor Special")
        if "tear down" in desc_lower or "teardown" in desc_lower:
            special_flags.append("Tear Down / Builder Opportunity")
        if any(phrase in desc_lower for phrase in ["complete renovation", "total renovation", "gut reno", "needs complete reno", "complete reno"]):
            special_flags.append("Complete Renovation")
        if "builder" in desc_lower or "contractor special" in desc_lower:
            if "Tear Down / Builder Opportunity" not in special_flags:
                special_flags.append("Builder / Contractor Special")

        # Remove duplicates while preserving order
        seen = set()
        special_flags = [f for f in special_flags if not (f in seen or seen.add(f))]

        return {
            "id": item.get("id") or item.get("mlsNumber") or item.get("listingId") or item.get("_id"),
            "mls_number": item.get("mlsNumber") or item.get("mls_id"),
            "price": item.get("listPrice") or item.get("price"),
            "bedrooms": bedrooms,
            "bathrooms": bathrooms,
            "property_type": property_type,
            "address": address,
            "city": city,
            "state": state,
            "zip_code": zip_code,
            "square_feet": square_feet,
            "description": description,
            "images": images,
            "status": item.get("status"),
            "year_built": year_built,
            "lot_size": lot_size,
            "days_on_market": days_on_market,
            "list_date": list_date,
            # Price history fields for market recommendations
            "original_price": original_price,
            "price_cuts_count": price_cuts_count,
            "total_price_reduction": total_price_reduction,
            "last_price_change_date": last_price_change_date,
            "price_trend_direction": price_trend_direction,
            # Additional context
            "lot_acres": lot_acres,
            "special_flags": special_flags,
            "_raw": item,  # Preserve raw API response for quality analysis
        }
