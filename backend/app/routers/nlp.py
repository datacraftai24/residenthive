from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
import re


router = APIRouter(prefix="/api")


class ExtractRequest(BaseModel):
    input: str


class EnhanceRequest(BaseModel):
    formData: Dict[str, Any]


def _infer_budget(text: str):
    # crude budget parser: find numbers with k or $ and build range
    m = re.findall(r"\$?([0-9]{2,3})\s*[kK]", text)
    if m:
        nums = sorted(int(x) * 1000 for x in m)
        lo = nums[0]
        hi = nums[-1]
        return f"${lo//1000}K - ${hi//1000}K", lo, hi
    m2 = re.findall(r"\$([0-9]{3,7})", text)
    if m2:
        nums = sorted(int(x) for x in m2)
        lo = nums[0]
        hi = nums[-1]
        return f"${lo} - ${hi}", lo, hi
    return "TBD", None, None


def _infer_location(text: str):
    for city in ["Worcester", "Springfield", "Boston", "Cambridge", "Somerville", "Massachusetts"]:
        if city.lower() in text.lower():
            return city
    return "Massachusetts"


def _infer_bedrooms(text: str):
    """
    Extract bedroom range from text.
    Handles:
    - "3 bed" -> (3, None)
    - "3-4 bed" -> (3, 4)
    - "3 to 5 bedrooms" -> (3, 5)
    - "3 or 4 bed" -> (3, 4)
    """
    # Try range patterns first: "3-4 bed", "3 to 5 bed", "3 or 4 bed"
    range_match = re.search(r"(\d+)\s*(?:-|to|or)\s*(\d+)\s*bed", text.lower())
    if range_match:
        min_bed = int(range_match.group(1))
        max_bed = int(range_match.group(2))
        return min_bed, max_bed

    # Try single number: "3 bed"
    single_match = re.search(r"(\d+)\s*-?\s*bed", text.lower())
    if single_match:
        bedrooms = int(single_match.group(1))
        return bedrooms, None

    # Default
    return 2, None


@router.post("/extract-profile")
def extract_profile(req: ExtractRequest):
    text = req.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Input text is required")
    budget, bmin, bmax = _infer_budget(text)
    location = _infer_location(text)

    # Extract bedroom range
    bedrooms, max_bedrooms = _infer_bedrooms(text)

    # Extract bathrooms
    baths_match = re.search(r"(\d+(?:\.\d+)?)\s*-?\s*bath", text.lower())
    bathrooms = baths_match.group(1) if baths_match else "2"

    return {
        "name": "Buyer",
        "email": None,
        "location": location,
        "budget": budget,
        "budgetMin": bmin,
        "budgetMax": bmax,
        "homeType": "single-family",
        "bedrooms": bedrooms,
        "maxBedrooms": max_bedrooms,
        "bathrooms": bathrooms,
        "mustHaveFeatures": [],
        "dealbreakers": [],
        "preferredAreas": [location],
        "lifestyleDrivers": [],
        "specialNeeds": [],
        "budgetFlexibility": 50,
        "locationFlexibility": 50,
        "timingFlexibility": 50,
        "emotionalContext": None,
        "inferredTags": [],
        "emotionalTone": None,
        "priorityScore": 50,
    }


@router.post("/enhance-profile")
def enhance_profile(req: EnhanceRequest):
    data = req.formData
    # pass-through with minor enrichment
    budget = data.get("budget") or "TBD"
    # try to parse numbers from budget string
    bmin = data.get("budgetMin")
    bmax = data.get("budgetMax")
    if not (bmin and bmax):
        parsed, lo, hi = _infer_budget(budget)
        budget = budget if budget != "TBD" else parsed
        bmin = bmin or lo
        bmax = bmax or hi
    return {
        "name": data.get("name", "Buyer"),
        "email": data.get("email"),
        "location": data.get("location", "Massachusetts"),
        "budget": budget,
        "budgetMin": bmin,
        "budgetMax": bmax,
        "homeType": data.get("homeType", "single-family"),
        "bedrooms": data.get("bedrooms", 2),
        "maxBedrooms": data.get("maxBedrooms"),
        "bathrooms": data.get("bathrooms", "2"),
        "mustHaveFeatures": data.get("mustHaveFeatures", []),
        "dealbreakers": data.get("dealbreakers", []),
        "preferredAreas": data.get("preferredAreas", []),
        "lifestyleDrivers": data.get("lifestyleDrivers", []),
        "specialNeeds": data.get("specialNeeds", []),
        "budgetFlexibility": data.get("budgetFlexibility", 50),
        "locationFlexibility": data.get("locationFlexibility", 50),
        "timingFlexibility": data.get("timingFlexibility", 50),
        "emotionalContext": data.get("emotionalContext"),
        "inferredTags": [],
        "emotionalTone": None,
        "priorityScore": 50,
    }

