from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
import os
import json
from openai import OpenAI


router = APIRouter(prefix="/api")


class ExtractRequest(BaseModel):
    input: str


class EnhanceRequest(BaseModel):
    formData: Dict[str, Any]


def _validate_extracted_profile(data: Dict[str, Any]) -> bool:
    """
    Validate that extracted profile has required fields and correct types.
    Returns True if valid, False otherwise.
    """
    try:
        # Check required fields exist
        required_fields = ["name", "location", "budget", "bedrooms", "bathrooms"]
        for field in required_fields:
            if field not in data:
                print(f"[NLP VALIDATION] Missing required field: {field}")
                return False

        # Validate budgetMin/Max are numbers if provided
        if data.get("budgetMin") is not None:
            if not isinstance(data["budgetMin"], (int, float)):
                print(f"[NLP VALIDATION] budgetMin is not a number: {data['budgetMin']}")
                return False
            if data["budgetMin"] < 0 or data["budgetMin"] > 100000000:
                print(f"[NLP VALIDATION] budgetMin out of range: {data['budgetMin']}")
                return False

        if data.get("budgetMax") is not None:
            if not isinstance(data["budgetMax"], (int, float)):
                print(f"[NLP VALIDATION] budgetMax is not a number: {data['budgetMax']}")
                return False
            if data["budgetMax"] < 0 or data["budgetMax"] > 100000000:
                print(f"[NLP VALIDATION] budgetMax out of range: {data['budgetMax']}")
                return False

        # Validate bedrooms is a number
        if not isinstance(data["bedrooms"], (int, float)):
            print(f"[NLP VALIDATION] bedrooms is not a number: {data['bedrooms']}")
            return False

        # Validate arrays are actually arrays
        array_fields = ["mustHaveFeatures", "dealbreakers", "lifestyleDrivers", "specialNeeds"]
        for field in array_fields:
            if field in data and not isinstance(data[field], list):
                print(f"[NLP VALIDATION] {field} is not an array: {data[field]}")
                return False

        return True

    except Exception as e:
        print(f"[NLP VALIDATION] Validation error: {e}")
        return False


def _extract_profile_with_ai(text: str, retry_count: int = 0) -> Dict[str, Any]:
    """
    Use OpenAI to extract buyer profile from natural language text.
    Positions AI as real estate agent with proper categorization.
    Includes validation and retry logic.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    client = OpenAI(api_key=api_key)

    prompt = f"""You are an experienced real estate agent taking notes during a client consultation.
Extract and organize the buyer's requirements into a structured profile.

CATEGORIZATION GUIDELINES:

**Must-Have Features** - Physical property features that are non-negotiable:
- Kitchen features (updated kitchen, granite counters, island, etc.)
- Flooring (hardwood, carpet, tile)
- HVAC (central air, heating type)
- Garage/parking (2-car garage, covered parking)
- Rooms (finished basement, bonus room, office)
- Appliances (stainless steel, washer/dryer included)
- Outdoor (deck, patio, fenced yard, pool)

**Dealbreakers** - Absolute no-gos that would disqualify a property:
- Structural issues (foundation problems, major repairs needed)
- Location issues (flood zone, airport noise, busy highway)
- Property condition (foreclosure, needs major renovation)
- Safety concerns (high crime area, unstable neighborhood)

**Lifestyle Drivers** - Quality of life priorities and preferences:
- Schools (good school district, near specific schools)
- Commute (close to work, easy highway access, public transit)
- Neighborhood (walkable, quiet, family-friendly, urban/suburban)
- Amenities (near parks, shopping, restaurants, gyms)
- Community (HOA, gated community, tight-knit neighborhood)

**Special Needs** - Unique requirements or accommodations:
- Accessibility (wheelchair accessible, single-story, wide doorways)
- Work requirements (home office space, workshop, studio)
- Family needs (nursery, playroom, multiple living areas)
- Pets (fenced yard for dog, pet-friendly building)
- Hobbies (home gym space, large garage for projects)
- Timeline (move-in ready, willing to renovate, urgent move)

Return ONLY valid JSON with this exact structure (no markdown, no extra text):

{{
  "name": "buyer's full name or 'Buyer' if not provided",
  "email": "email address or null",
  "location": "city, state format (e.g., 'Worcester, MA')",
  "budget": "human-readable budget string (e.g., '$400K - $550K')",
  "budgetMin": 400000,
  "budgetMax": 550000,
  "homeType": "single-family",
  "bedrooms": 3,
  "maxBedrooms": 4,
  "bathrooms": "2",
  "mustHaveFeatures": ["updated kitchen", "garage"],
  "dealbreakers": ["flood zone"],
  "lifestyleDrivers": ["good school district"],
  "specialNeeds": ["home office space"],
  "emotionalContext": "brief summary or null"
}}

CRITICAL VALIDATION RULES:
1. budgetMin and budgetMax MUST be numbers (integers), not strings
2. bedrooms MUST be a number (integer), not a string
3. bathrooms can be a string (e.g., "2.5")
4. All arrays (mustHaveFeatures, dealbreakers, etc.) MUST be arrays, not strings
5. Budget numbers must be realistic (between 0 and 100,000,000)
6. If budget range like "$400,000 to $550,000", extract 400000 and 550000 as numbers

EXTRACTION RULES:
1. Budget: Handle all formats correctly ($400,000, $400K, 400k, four hundred thousand) → convert to numbers
2. Location: Always include city AND state if mentioned (e.g., "Worcester, MA" not just "Worcester")
3. Must-Haves: Only include PHYSICAL features (not schools, commute, etc.)
4. Dealbreakers: Only hard requirements that would disqualify a property
5. Lifestyle: Include schools, commute, neighborhood preferences, community aspects
6. Special Needs: Include accessibility, work-from-home, family-specific, pet needs, timeline
7. Emotional Context: Capture urgency, anxiety, budget concerns

EXAMPLES:

Input: "I need 3-4 bedrooms, updated kitchen, good schools, under $500k"
Output:
{{
  "name": "Buyer",
  "email": null,
  "location": "Massachusetts",
  "budget": "Under $500K",
  "budgetMin": null,
  "budgetMax": 500000,
  "homeType": "single-family",
  "bedrooms": 3,
  "maxBedrooms": 4,
  "bathrooms": "2",
  "mustHaveFeatures": ["updated kitchen"],
  "dealbreakers": [],
  "lifestyleDrivers": ["good school district"],
  "specialNeeds": [],
  "emotionalContext": null
}}

Input: "Must have central air and garage, no flood zones, close to highway, budget $300k-$450k"
Output:
{{
  "name": "Buyer",
  "email": null,
  "location": "Massachusetts",
  "budget": "$300K - $450K",
  "budgetMin": 300000,
  "budgetMax": 450000,
  "homeType": "single-family",
  "bedrooms": 2,
  "maxBedrooms": null,
  "bathrooms": "2",
  "mustHaveFeatures": ["central air conditioning", "garage"],
  "dealbreakers": ["flood zone"],
  "lifestyleDrivers": ["easy highway access"],
  "specialNeeds": [],
  "emotionalContext": null
}}

Now extract from this buyer consultation:
{text}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an experienced real estate agent extracting buyer requirements. Return ONLY valid JSON. Numbers must be numbers, not strings."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        print(f"[NLP EXTRACTION] Raw AI response: {content[:200]}...")

        # Parse JSON
        extracted = json.loads(content)

        # Validate the extracted data
        if not _validate_extracted_profile(extracted):
            print(f"[NLP EXTRACTION] Validation failed, extracted data: {json.dumps(extracted, indent=2)}")

            # Retry once if validation fails
            if retry_count < 1:
                print(f"[NLP EXTRACTION] Retrying extraction (attempt {retry_count + 1})")
                return _extract_profile_with_ai(text, retry_count + 1)
            else:
                print(f"[NLP EXTRACTION] Max retries reached, using fallback")
                raise ValueError("AI extraction validation failed after retry")

        print(f"[NLP EXTRACTION] Successfully extracted and validated profile")

        # Ensure all required fields exist with defaults
        return {
            "name": extracted.get("name", "Buyer"),
            "email": extracted.get("email"),
            "location": extracted.get("location", "Massachusetts"),
            "budget": extracted.get("budget", "TBD"),
            "budgetMin": extracted.get("budgetMin"),
            "budgetMax": extracted.get("budgetMax"),
            "homeType": extracted.get("homeType", "single-family"),
            "bedrooms": int(extracted.get("bedrooms", 2)),
            "maxBedrooms": int(extracted["maxBedrooms"]) if extracted.get("maxBedrooms") else None,
            "bathrooms": str(extracted.get("bathrooms", "2")),
            "mustHaveFeatures": extracted.get("mustHaveFeatures", []),
            "dealbreakers": extracted.get("dealbreakers", []),
            "preferredAreas": [extracted.get("location", "Massachusetts")],
            "lifestyleDrivers": extracted.get("lifestyleDrivers", []),
            "specialNeeds": extracted.get("specialNeeds", []),
            "budgetFlexibility": 50,
            "locationFlexibility": 50,
            "timingFlexibility": 50,
            "emotionalContext": extracted.get("emotionalContext"),
            "inferredTags": [],
            "emotionalTone": None,
            "priorityScore": 50,
        }

    except json.JSONDecodeError as e:
        print(f"[NLP EXTRACTION] JSON parse error: {e}")
        print(f"[NLP EXTRACTION] Raw content: {content}")

        # Retry once on JSON parse error
        if retry_count < 1:
            print(f"[NLP EXTRACTION] Retrying due to JSON error (attempt {retry_count + 1})")
            return _extract_profile_with_ai(text, retry_count + 1)

        # Fall through to fallback
        raise

    except Exception as e:
        print(f"[NLP EXTRACTION] AI extraction error: {e}")
        import traceback
        traceback.print_exc()

        # Use fallback only if retries exhausted
        if retry_count >= 1:
            print(f"[NLP EXTRACTION] Using fallback profile after {retry_count + 1} attempts")
            return {
                "name": "Buyer",
                "email": None,
                "location": "Massachusetts",
                "budget": "TBD",
                "budgetMin": None,
                "budgetMax": None,
                "homeType": "single-family",
                "bedrooms": 2,
                "maxBedrooms": None,
                "bathrooms": "2",
                "mustHaveFeatures": [],
                "dealbreakers": [],
                "preferredAreas": ["Massachusetts"],
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
        else:
            # Retry once
            return _extract_profile_with_ai(text, retry_count + 1)


@router.post("/extract-profile")
def extract_profile(req: ExtractRequest):
    """Extract buyer profile using AI (GPT-4o-mini) with validation and retry logic"""
    text = req.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Input text is required")

    return _extract_profile_with_ai(text)


@router.post("/enhance-profile")
def enhance_profile(req: EnhanceRequest):
    """Enhance profile with additional processing (pass-through for now)"""
    data = req.formData

    # Pass through with structure validation
    return {
        "name": data.get("name", "Buyer"),
        "email": data.get("email"),
        "location": data.get("location", "Massachusetts"),
        "budget": data.get("budget", "TBD"),
        "budgetMin": data.get("budgetMin"),
        "budgetMax": data.get("budgetMax"),
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
