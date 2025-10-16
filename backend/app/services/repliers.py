import os
import re
from typing import Any, Dict, List
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

    def _build_search_query(self, profile: Dict[str, Any], limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        q: Dict[str, Any] = {
            "limit": limit,
            "offset": offset,
            "class": "residential",  # API accepts lowercase: 'residential', 'commercial', 'condo'
            "status": "A",  # Must be simple string 'A' (Active) or 'U', not an array
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
        # Bathrooms
        baths = profile.get("bathrooms")
        if baths is not None:
            if isinstance(baths, str):
                try:
                    val = re.sub(r"[^0-9\.]", "", baths)
                    if val:
                        q["minBathrooms"] = float(val)
                except Exception:
                    pass
            else:
                q["minBathrooms"] = float(baths)
        # Property type - map user-friendly values to Repliers API style field
        # Note: Use 'style' parameter (not 'propertyType') for specific property types
        # propertyType is high-level (Residential, Commercial), style is specific (Single Family Residence, Condominium)
        if profile.get("homeType"):
            home_type = profile["homeType"]
            # Map common values to Repliers API style values (from aggregates data)
            style_map = {
                "single-family": "Single Family Residence",
                "condo": "Condominium",
                "condominium": "Condominium",
                "townhouse": "Attached (Townhouse/Rowhouse/Duplex)",
                "multi-family": "Multi Family",
                "apartment": "Apartment"
            }
            # Use mapped value, or pass through as-is if not in map
            api_value = style_map.get(home_type.lower(), home_type)
            q["style"] = api_value
        # Location - Repliers API only supports: city, area, areaOrCity, neighborhood
        # NOTE: The API doesn't support state/stateOrProvince parameters
        # If location contains both city and state (e.g., "Austin, TX"), extract just the city
        if profile.get("location"):
            loc = str(profile["location"]).strip()
            # If comma-separated, extract just the city part (before the comma)
            if "," in loc:
                city = loc.split(",")[0].strip()
                q["areaOrCity"] = city
            else:
                q["areaOrCity"] = loc
        if profile.get("preferredAreas"):
            # Join areas as comma-separated string if Repliers expects it that way
            areas = profile["preferredAreas"]
            if isinstance(areas, list):
                q["areaOrCity"] = ", ".join(areas) if len(areas) > 1 else areas[0]
            else:
                q["areaOrCity"] = areas
        return q

    def search(self, profile: Dict[str, Any], limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Search listings using GET request with query parameters.
        
        Note: Repliers API uses GET with query params, not POST with JSON body.
        Location filtering only works with city names (not "City, State" format).
        """
        params = self._build_search_query(profile, limit, offset)
        url = f"{self.base_url}{self.search_path}"
        
        with httpx.Client(timeout=self.timeout) as client:
            r = client.get(url, params=params, headers=self._headers())
            if r.status_code >= 400:
                print(f"[REPLIERS ERROR] API request failed with status {r.status_code}: {r.text}")
                raise RepliersError(f"Repliers search failed: {r.status_code} {r.text}")
            data = r.json()
        items = data.get("listings", data)
        if not isinstance(items, list):
            raise RepliersError("Unexpected Repliers response shape")
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
        }
