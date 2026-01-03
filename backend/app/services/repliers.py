import os
import re
import math
from typing import Any, Dict, List
from datetime import datetime, timezone
import httpx
from dotenv import load_dotenv
from pathlib import Path

from .repliers_lookup import standardize_style, parse_multi_city_location

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
        # Property type - use lookup to standardize user input to valid API style
        # Uses repliers_lookup.standardize_style() for fuzzy matching
        if profile.get("homeType"):
            api_style = standardize_style(profile["homeType"])
            if api_style:
                q["style"] = api_style
            # If no match found, skip style filter (don't send invalid value)
        # Location - use lookup to parse multi-city patterns
        # Uses repliers_lookup.parse_multi_city_location() for "X or Y" patterns
        # Note: Store as list for multi-city support (API requires repeated params)
        if profile.get("location"):
            cities = parse_multi_city_location(profile["location"])
            if cities:
                q["_cities"] = cities  # Special key, handled in search()
        # Note: preferredAreas is NOT used for Repliers search - only location field matters
        return q

    def search(self, profile: Dict[str, Any], results_per_page: int = 100, page_num: int = 1) -> List[Dict[str, Any]]:
        """Search listings using GET request with query parameters.

        Note: Repliers API uses GET with query params, not POST with JSON body.
        Uses RESO-compliant parameters: city, standardStatus, resultsPerPage, pageNum.
        Location filtering works with city names (extracts city from "City, State" format).
        Multi-city searches use repeated city params (city=X&city=Y).

        Returns:
            List of normalized listings, each containing a '_raw' key with the original API response
        """
        params_dict = self._build_search_query(profile, results_per_page, page_num)
        url = f"{self.base_url}{self.search_path}"

        # Convert to list of tuples for httpx (required for multi-city support)
        # Repliers API requires repeated params: city=X&city=Y (not city=X,Y)
        cities = params_dict.pop("_cities", None)
        params = [(k, v) for k, v in params_dict.items()]
        if cities:
            for city in cities:
                params.append(("city", city))

        # Debug logging - see exactly what we're sending to Repliers
        import json
        print(f"[REPLIERS] Full URL: {url}")
        params_debug = {k: v for k, v in params_dict.items()}
        if cities:
            params_debug["city"] = cities
        print(f"[REPLIERS] Query params: {json.dumps(params_debug, indent=2)}")
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

    def lookup_address(self, street_name: str, street_number: str = None, city: str = None, state: str = None, zip_code: str = None) -> dict:
        """
        Look up property listing history by address using Repliers Address History API.

        Args:
            street_name: Street name with suffix (e.g., "Beacon St")
            street_number: Street number (e.g., "15")
            city: City name (optional)
            state: State code (optional)
            zip_code: Postal code (optional)

        Returns:
            Property details dict if found, None otherwise.
            Includes: listPrice, bedrooms, bathrooms, sqft, images, status, etc.
        """
        url = f"{self.base_url}/listings/history"
        # API requires 'streetName' parameter
        params = {"streetName": street_name}
        if street_number:
            params["streetNumber"] = street_number
        if city:
            params["city"] = city
        if state:
            params["state"] = state
        if zip_code:
            params["postalCode"] = zip_code

        print(f"[REPLIERS] Address lookup URL: {url}")
        print(f"[REPLIERS] Address lookup params: {params}")

        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(url, headers=self._headers(), params=params)
                print(f"[REPLIERS] Address lookup status: {r.status_code}")

                if r.status_code == 200:
                    data = r.json()
                    print(f"[REPLIERS] Address lookup response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")

                    # The history API returns:
                    # - Top level: address metadata (streetNumber, city, beds, baths, sqft, etc.)
                    # - history: array of listing records
                    history = data.get("history", [])

                    if history and len(history) > 0:
                        # Get the first (most recent) listing from history
                        listing = history[0]
                        print(f"[REPLIERS] Found listing: MLS# {listing.get('mlsNumber')}, ${listing.get('listPrice')}")

                        # Combine address metadata with listing data
                        return self._normalize_history_lookup(data, listing)

                    print("[REPLIERS] No listings found for address")
                    return None
                elif r.status_code == 404:
                    print("[REPLIERS] Address not found")
                    return None
                else:
                    print(f"[REPLIERS] Address lookup failed: {r.status_code} {r.text}")
                    return None
        except Exception as e:
            print(f"[REPLIERS] Address lookup error: {e}")
            return None

    def _normalize_history_lookup(self, address_data: dict, listing: dict) -> dict:
        """Normalize history API response combining address metadata with listing data."""
        # Build full address string
        street_parts = []
        if address_data.get("streetNumber"):
            street_parts.append(str(address_data["streetNumber"]))
        if address_data.get("streetName"):
            street_parts.append(address_data["streetName"])
        if address_data.get("streetSuffix"):
            street_parts.append(address_data["streetSuffix"])
        address = " ".join(street_parts)

        # Get primary image from listing if available
        images = []
        if listing.get("images"):
            for img in listing["images"]:
                url = None
                if isinstance(img, str):
                    url = img
                elif isinstance(img, dict) and img.get("url"):
                    url = img["url"]
                if url:
                    # Add CDN prefix if needed
                    if not url.startswith("http"):
                        url = f"https://cdn.repliers.io/{url.lstrip('/')}?class=medium"
                    images.append(url)

        return {
            "listingId": listing.get("mlsNumber"),
            "mlsNumber": listing.get("mlsNumber"),
            "listPrice": listing.get("listPrice"),
            "bedrooms": listing.get("beds") or address_data.get("beds"),
            "bathrooms": listing.get("baths") or address_data.get("baths"),
            "sqft": int(listing.get("sqft") or address_data.get("sqft") or 0) if (listing.get("sqft") or address_data.get("sqft")) else None,
            "address": address,
            "city": address_data.get("city"),
            "state": address_data.get("state"),
            "zipCode": address_data.get("zip"),
            "propertyType": listing.get("propertyType") or address_data.get("propertyType"),
            "style": listing.get("style") or address_data.get("style"),
            "status": listing.get("lastStatus"),
            "listDate": listing.get("listDate"),
            "daysOnMarket": None,  # Calculate if needed
            "images": images,
            "primaryImage": images[0] if images else None,
            "_raw": {"address": address_data, "listing": listing},
        }

    def _normalize_address_lookup(self, item: dict) -> dict:
        """Normalize address lookup response to standard property format (legacy)."""
        # Use the existing normalizer for consistency
        normalized = self._normalize_listing(item)

        # Add some address-lookup specific fields
        return {
            "listingId": normalized.get("id") or normalized.get("mls_number"),
            "mlsNumber": normalized.get("mls_number"),
            "listPrice": normalized.get("price"),
            "bedrooms": normalized.get("bedrooms"),
            "bathrooms": normalized.get("bathrooms"),
            "sqft": normalized.get("square_feet"),
            "address": normalized.get("address"),
            "city": normalized.get("city"),
            "state": normalized.get("state"),
            "zipCode": normalized.get("zip_code"),
            "propertyType": normalized.get("property_type"),
            "yearBuilt": normalized.get("year_built"),
            "status": item.get("standardStatus") or item.get("status") or normalized.get("status"),
            "daysOnMarket": normalized.get("days_on_market"),
            "description": normalized.get("description"),
            "images": normalized.get("images", []),
            "primaryImage": normalized.get("images", [None])[0] if normalized.get("images") else None,
            "_raw": item,
        }

    def get_similar_listings(self, mls_number: str, radius: int = None) -> List[Dict[str, Any]]:
        """
        Get similar listings using Repliers Similar Listings API.

        This endpoint finds properties similar to a reference property,
        matching on price range, bedrooms, location, and style.

        Args:
            mls_number: The MLS number of the reference property
            radius: Optional radius in km to expand search area
                   (overrides default neighborhood-based matching)

        Returns:
            List of normalized similar listings

        Raises:
            RepliersError: If API call fails
        """
        url = f"{self.base_url}/listings/{mls_number}/similar"
        params = {}
        if radius:
            params["radius"] = radius

        print(f"[REPLIERS] Similar listings request: {url}")
        if params:
            print(f"[REPLIERS] Similar listings params: {params}")

        with httpx.Client(timeout=self.timeout) as client:
            r = client.get(url, params=params, headers=self._headers())
            print(f"[REPLIERS] Similar listings status: {r.status_code}")

            if r.status_code >= 400:
                print(f"[REPLIERS ERROR] Similar listings failed: {r.status_code} {r.text}")
                raise RepliersError(f"Similar listings failed: {r.status_code} {r.text}")

            data = r.json()
            print(f"[REPLIERS] Similar listings response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")

        # Handle response - may be {"listings": [...]} or just [...]
        items = data.get("listings", data) if isinstance(data, dict) else data
        if not isinstance(items, list):
            raise RepliersError("Unexpected similar listings response shape")

        print(f"[REPLIERS] Similar listings found: {len(items)}")
        return [self._normalize_listing(item) for item in items]

    def persist_listing(self, listing: Dict[str, Any], agent_id: int = None, profile_id: int = None) -> bool:
        """
        Persist a normalized listing to repliers_listings table.
        Uses ON CONFLICT to upsert - updates if exists, inserts if new.

        Args:
            listing: Normalized listing from _normalize_listing()
            agent_id: Optional agent ID (for agent-synced listings)
            profile_id: Optional profile ID (for buyer profile listings)

        Returns:
            True if successful, False otherwise
        """
        from ..db import get_conn
        import json as json_mod

        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO repliers_listings (
                            id, mls_number, address, city, state, zip_code,
                            price, bedrooms, bathrooms, square_feet, property_type,
                            description, images, status, year_built, lot_size,
                            days_on_market, list_date, original_price,
                            price_cuts_count, total_price_reduction,
                            last_price_change_date, price_trend_direction,
                            lot_acres, special_flags, raw_json,
                            agent_id, profile_id, created_at, updated_at
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s,
                            %s, %s,
                            %s, %s, %s,
                            %s, %s, NOW(), NOW()
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            price = EXCLUDED.price,
                            status = EXCLUDED.status,
                            days_on_market = EXCLUDED.days_on_market,
                            price_cuts_count = EXCLUDED.price_cuts_count,
                            total_price_reduction = EXCLUDED.total_price_reduction,
                            price_trend_direction = EXCLUDED.price_trend_direction,
                            raw_json = EXCLUDED.raw_json,
                            updated_at = NOW()
                    """, (
                        listing.get("id"),
                        listing.get("mls_number"),
                        listing.get("address", ""),
                        listing.get("city", ""),
                        listing.get("state", ""),
                        listing.get("zip_code"),
                        listing.get("price", 0),
                        listing.get("bedrooms", 0),
                        listing.get("bathrooms", 0),
                        listing.get("square_feet"),
                        listing.get("property_type", ""),
                        listing.get("description"),
                        json_mod.dumps(listing.get("images", [])),
                        listing.get("status", "A"),
                        listing.get("year_built"),
                        listing.get("lot_size"),
                        listing.get("days_on_market"),
                        listing.get("list_date"),
                        listing.get("original_price"),
                        listing.get("price_cuts_count", 0),
                        listing.get("total_price_reduction", 0),
                        listing.get("last_price_change_date"),
                        listing.get("price_trend_direction"),
                        listing.get("lot_acres"),
                        json_mod.dumps(listing.get("special_flags", [])),
                        json_mod.dumps(listing.get("_raw", {})),
                        agent_id,
                        profile_id
                    ))
            return True
        except Exception as e:
            print(f"[REPLIERS] Failed to persist listing {listing.get('id')}: {e}")
            return False

    def persist_listings(self, listings: List[Dict[str, Any]], agent_id: int = None, profile_id: int = None) -> int:
        """
        Persist multiple listings to database.

        Args:
            listings: List of normalized listings from _normalize_listing()
            agent_id: Optional agent ID
            profile_id: Optional profile ID

        Returns:
            Number of successfully persisted listings
        """
        count = 0
        for listing in listings:
            if self.persist_listing(listing, agent_id, profile_id):
                count += 1
        return count
