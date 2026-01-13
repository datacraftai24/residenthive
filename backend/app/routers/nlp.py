from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Set
import os
import json
import re
import time
from openai import OpenAI


router = APIRouter(prefix="/api")


# ===== MODEL ROUTING CONFIGURATION =====
# Route different tasks to different GPT-4o models for optimal performance
MODEL_CONFIG = {
    "extraction": {
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "description": "Profile parsing and structured data extraction"
    },
    "insights": {
        "model": "gpt-4o",
        "temperature": 0.3,
        "description": "AI summary, decision drivers, constraints, flexibility"
    },
    "vision_checklist": {
        "model": "gpt-4o",
        "temperature": 0.2,
        "description": "Photo requirements checklist generation"
    },
    "chat": {
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "description": "General chat and Q&A"
    }
}

# ===== LLM RETRY CONFIGURATION =====
LLM_MAX_RETRIES = 1
LLM_RETRY_DELAY_SECONDS = 2

# ===== VALIDATION CONSTANTS =====
MIN_BEDROOMS = 1
MAX_BEDROOMS = 10
MIN_BATHROOMS = 0.5
MAX_BATHROOMS = 10
MAX_BUDGET_LIMIT = 100_000_000  # $100M
BUDGET_FLEXIBILITY_PERCENT = 0.20  # ±20% for "around X" budgets


def _get_model_config(task: str) -> dict:
    """Get model configuration for specific task."""
    config = MODEL_CONFIG.get(task, MODEL_CONFIG["chat"])
    print(f"[MODEL ROUTER] Using {config['model']} (temp={config['temperature']}) for {task}")
    return config


class ValidationError(BaseModel):
    field: str
    message: str


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
            if data["budgetMin"] < 0 or data["budgetMin"] > MAX_BUDGET_LIMIT:
                print(f"[NLP VALIDATION] budgetMin out of range: {data['budgetMin']}")
                return False

        if data.get("budgetMax") is not None:
            if not isinstance(data["budgetMax"], (int, float)):
                print(f"[NLP VALIDATION] budgetMax is not a number: {data['budgetMax']}")
                return False
            if data["budgetMax"] < 0 or data["budgetMax"] > MAX_BUDGET_LIMIT:
                print(f"[NLP VALIDATION] budgetMax out of range: {data['budgetMax']}")
                return False

        # Validate bedrooms is a number
        if not isinstance(data["bedrooms"], (int, float)):
            print(f"[NLP VALIDATION] bedrooms is not a number: {data['bedrooms']}")
            return False

        # Validate arrays are actually arrays
        array_fields = ["mustHaveFeatures", "niceToHaves", "dealbreakers", "lifestyleDrivers", "specialNeeds"]
        for field in array_fields:
            if field in data and not isinstance(data[field], list):
                print(f"[NLP VALIDATION] {field} is not an array: {data[field]}")
                return False

        return True

    except Exception as e:
        print(f"[NLP VALIDATION] Validation error: {e}")
        return False


def validate_profile(data: Dict[str, Any]) -> tuple[bool, list[Dict[str, str]]]:
    """
    Comprehensive validation for buyer profiles before saving to database.
    Returns (is_valid, errors) tuple.

    Validation Rules:
    1. Budget: Must have budgetMin OR budgetMax OR parseable budget string
    2. Bedrooms: Must be 1-10
    3. Bathrooms: Must be parseable as 0.5-10
    4. Location: Cannot be empty
    5. Email: Must be provided (database constraint)
    6. Name: Cannot be empty
    """
    errors = []

    # Rule 1: Budget validation
    budget_min = data.get("budgetMin")
    budget_max = data.get("budgetMax")
    budget_str = data.get("budget", "")

    if budget_min is None and budget_max is None:
        # Try to parse budget string
        if budget_str and budget_str != "TBD":
            parsed_min, parsed_max = _parse_budget_string(budget_str)
            if parsed_min is None and parsed_max is None:
                errors.append({
                    "field": "budget",
                    "message": f"Cannot parse budget string '{budget_str}'. Please use format like '$400K-$550K', 'Around $500K', or 'Under $600K'"
                })
        else:
            errors.append({
                "field": "budget",
                "message": "Budget is required. Please provide budgetMin, budgetMax, or a budget string like 'Around $500K'"
            })

    # Validate budget ranges
    if budget_min is not None:
        if not isinstance(budget_min, (int, float)) or budget_min < 0:
            errors.append({
                "field": "budgetMin",
                "message": "budgetMin must be a positive number"
            })
        elif budget_min > MAX_BUDGET_LIMIT:
            errors.append({
                "field": "budgetMin",
                "message": "budgetMin seems unrealistically high (max $100M)"
            })

    if budget_max is not None:
        if not isinstance(budget_max, (int, float)) or budget_max < 0:
            errors.append({
                "field": "budgetMax",
                "message": "budgetMax must be a positive number"
            })
        elif budget_max > MAX_BUDGET_LIMIT:
            errors.append({
                "field": "budgetMax",
                "message": "budgetMax seems unrealistically high (max $100M)"
            })

    if budget_min is not None and budget_max is not None and budget_min > budget_max:
        errors.append({
            "field": "budget",
            "message": f"budgetMin (${budget_min:,}) cannot be greater than budgetMax (${budget_max:,})"
        })

    # Rule 2: Bedrooms validation
    bedrooms = data.get("bedrooms")
    if bedrooms is None:
        errors.append({
            "field": "bedrooms",
            "message": "Bedrooms is required"
        })
    elif not isinstance(bedrooms, (int, float)):
        errors.append({
            "field": "bedrooms",
            "message": "Bedrooms must be a number"
        })
    elif bedrooms < MIN_BEDROOMS or bedrooms > MAX_BEDROOMS:
        errors.append({
            "field": "bedrooms",
            "message": f"Bedrooms must be between {MIN_BEDROOMS} and {MAX_BEDROOMS}"
        })

    # Rule 3: Bathrooms validation
    bathrooms = data.get("bathrooms")
    if not bathrooms:
        errors.append({
            "field": "bathrooms",
            "message": "Bathrooms is required"
        })
    else:
        # Try to parse bathrooms (can be "2" or "2.5")
        try:
            bath_num = float(str(bathrooms))
            if bath_num < MIN_BATHROOMS or bath_num > MAX_BATHROOMS:
                errors.append({
                    "field": "bathrooms",
                    "message": f"Bathrooms must be between {MIN_BATHROOMS} and {MAX_BATHROOMS}"
                })
        except:
            errors.append({
                "field": "bathrooms",
                "message": f"Cannot parse bathrooms value '{bathrooms}'"
            })

    # Rule 4: Location validation
    location = data.get("location", "").strip()
    if not location:
        errors.append({
            "field": "location",
            "message": "Location is required"
        })

    # Rule 5: Email validation
    email = data.get("email", "").strip()
    if not email:
        errors.append({
            "field": "email",
            "message": "Email is required (database constraint)"
        })
    elif "@" not in email or "." not in email:
        errors.append({
            "field": "email",
            "message": "Email format is invalid"
        })

    # Rule 6: Name validation
    name = data.get("name", "").strip()
    if not name or name == "Buyer":
        errors.append({
            "field": "name",
            "message": "Name is required (cannot be empty or generic 'Buyer')"
        })

    is_valid = len(errors) == 0

    if not is_valid:
        print(f"[PROFILE VALIDATION] Failed with {len(errors)} errors: {errors}")

    return (is_valid, errors)


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

Buyers speak casually, use slang, and describe things emotionally.
Interpret INTENT — not literal phrasing.

---------------------------------------------------
BUDGET PARSING RULES
---------------------------------------------------
Interpret all natural-language expressions:

"high 400s" → budgetMin: 460000, budgetMax: 499000
"mid 500s" → budgetMin: 530000, budgetMax: 570000
"low 600s" → budgetMin: 600000, budgetMax: 630000
"high 600s" → budgetMin: 675000, budgetMax: 699000
"around 650" → budgetMin: 630000, budgetMax: 670000
"450–650ish" → budgetMin: 450000, budgetMax: 650000
"can stretch to 700" → budgetMax: 700000

CRITICAL: Always return integers for budgetMin and budgetMax.

BUDGET FIELD NORMALIZATION:
For the "budget" field, convert casual language to clean format:
• "mid 500s to high 600s" → "$530K - $699K"
• "around 650" → "$630K - $670K"
• "high 400s" → "$460K - $499K"

Format: "$XK - $YK" where X = budgetMin/1000, Y = budgetMax/1000

---------------------------------------------------
PHONE EXTRACTION
---------------------------------------------------
Extract any phone number format (xxx-xxx-xxxx, (xxx) xxx-xxxx, xxx.xxx.xxxx, etc.)
If none, return null.

---------------------------------------------------
LOCATION EXTRACTION
---------------------------------------------------
The buyer is searching in Massachusetts. Use your knowledge of MA cities,
towns, and real estate regions to extract locations.

Extract ALL locations/cities mentioned by the buyer.
Return as comma-separated string: "Melrose, Wakefield, Stoneham"

IMPORTANT:
• Correct common misspellings using MA city knowledge (e.g., "Melorse" → "Melrose")
• Preserve region names if mentioned: "South Shore", "North Shore", "Greater Boston", "Cape Cod", "Metro West"
• If buyer says "X area" or "X areas", keep as region format

Examples:
• "looking in Melrose, Wakefield, and Stoneham" → "Melrose, Wakefield, Stoneham"
• "South Shore area" → "South Shore"
• "Boston or Quincy" → "Boston, Quincy"
• "Greater Boston" → "Greater Boston"
• "Melorse and Wakfeild" → "Melrose, Wakefield" (corrected spellings)

If state not mentioned, infer from context (assume MA for Boston-area cities).

---------------------------------------------------
HOME TYPE INFERENCE
---------------------------------------------------
If not explicitly stated:
• yard/driveway/garage/kids/dog mentioned → "Single Family"
• HOA/elevator/concierge/amenities → "Condo"
Else → "Not Specified"

---------------------------------------------------
KIDS & PET LOGIC
---------------------------------------------------
Kids → yard, safety, family-friendly, schools
Dog → fenced yard, usable outdoor space

---------------------------------------------------
MUST-HAVE FEATURES (Non-negotiable)
---------------------------------------------------
Trigger on: "need", "must", "have to", "required",
"minimum", "at least", "dealbreaker if missing", "def need".

Typical must-haves:
• minimum beds/baths
• off-street parking
• usable yard / fenced yard
• move-in-ready
• safe neighborhood
• quiet street (strong phrasing)

---------------------------------------------------
NICE-TO-HAVES (Flexible)
---------------------------------------------------
Trigger on: "prefer", "would like", "nice to have", "love",
"not required", "optional but good".

---------------------------------------------------
LIFESTYLE PRIORITIES
---------------------------------------------------
Extract anything about:
• schools / family-friendly
• safety / quiet vibe
• commute
• walkability / parks
• community feel

---------------------------------------------------
DEALBREAKERS (Hard NOs)
---------------------------------------------------
Normalize slang:
"sketchy" → unsafe neighborhood
"freaks me out" → strong dealbreaker

Examples:
• busy roads
• visible power lines
• unsafe neighborhoods
• major structural issues
• flood zones
• heavy renovations

---------------------------------------------------
TIMELINE EXTRACTION
---------------------------------------------------
Extract:
• timeline: natural language (e.g. "3–6 months")
• timelineFlexibility: 0–100 (0 = fixed, 100 = very flexible)

---------------------------------------------------
FLEXIBILITY SCORING (0-100 scale)
---------------------------------------------------
Extract 3 flexibility scores based on buyer's language:

BUDGET FLEXIBILITY (budgetFlexibility):
• 0-20: "firm budget", "can't stretch", "max is X", "that's my absolute limit"
• 21-40: "prefer to stay around X", "would rather not go higher"
• 41-60: "some room to move", "could stretch a bit"
• 61-80: "flexible if it's worth it", "open to going higher for the right place"
• 81-100: "very flexible", "budget is just a guide", "can adjust significantly"

LOCATION FLEXIBILITY (locationFlexibility):
• 0-20: "must be in [city]", "only [city]", "won't consider other towns"
• 21-40: "prefer [city] but maybe [adjacent town]"
• 41-60: "open to nearby towns", "[city] or surrounding areas"
• 61-80: "flexible on location", "open to alternatives within the region"
• 81-100: "very flexible", "anywhere in [county/state]", "location not critical"

TIMING FLEXIBILITY (timingFlexibility):
• 0-20: "must close by [date]", "hard deadline", "lease ends [date]"
• 21-40: "prefer [timeline] but could adjust slightly"
• 41-60: "roughly [timeline]", "around [X] months"
• 61-80: "flexible timeline", "can move faster or slower"
• 81-100: "very flexible", "whenever the right place comes up", "no rush"

Default to 50 if not explicitly stated.

---------------------------------------------------
EMOTIONAL CONTEXT
---------------------------------------------------
Summarize the buyer's emotional state in ONE sentence:
• urgency (rushed / relaxed)
• key fears (busy roads, safety, renovations)
• key excitement (yard, schools, dream kitchen)

Example: "Excited about finding a yard for kids but nervous about busy streets and major renovation projects."

---------------------------------------------------
ORDERING OF FEATURES
---------------------------------------------------
• mustHaveFeatures: order strongest → weakest
• niceToHaves: order most → least important
• dealbreakers: order most → least critical

---------------------------------------------------
OUTPUT FORMAT — RETURN ONLY JSON
---------------------------------------------------
{{
  "name": "...",
  "email": "...",
  "phone": "...",
  "location": "...",
  "budget": "...",
  "budgetMin": ...,
  "budgetMax": ...,
  "homeType": "...",
  "bedrooms": ...,
  "bathrooms": ...,
  "timeline": "...",
  "budgetFlexibility": ...,
  "locationFlexibility": ...,
  "timelineFlexibility": ...,
  "mustHaveFeatures": [...],
  "niceToHaves": [...],
  "lifestyleDrivers": [...],
  "dealbreakers": [...],
  "emotionalContext": "..."
}}

Extract from this text:
{text}"""

    try:
        model_config = _get_model_config("extraction")
        response = client.chat.completions.create(
            model=model_config["model"],
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
            temperature=model_config["temperature"],
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
        profile = {
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
            "niceToHaves": extracted.get("niceToHaves", []),
            "dealbreakers": extracted.get("dealbreakers", []),
            "preferredAreas": [extracted.get("location", "Massachusetts")],
            "lifestyleDrivers": extracted.get("lifestyleDrivers", []),
            "specialNeeds": extracted.get("specialNeeds", []),
            "budgetFlexibility": extracted.get("budgetFlexibility", 50),
            "locationFlexibility": extracted.get("locationFlexibility", 50),
            "timingFlexibility": extracted.get("timelineFlexibility", 50),
            "emotionalContext": extracted.get("emotionalContext"),
            "inferredTags": [],
            "emotionalTone": None,
            "priorityScore": 50,
        }

        # Generate AI insights using the extracted profile
        print(f"[NLP EXTRACTION] Generating AI insights...")
        try:
            insights = _generate_complete_insights(profile)
            profile.update(insights)
            print(f"[NLP EXTRACTION] AI insights generated successfully")
        except Exception as e:
            print(f"[NLP EXTRACTION] Failed to generate insights: {e}")
            # Continue without insights - they're optional

        # Deduplicate profile
        print(f"[NLP EXTRACTION] Deduplicating features...")
        profile = _deduplicate_profile(profile)

        # Generate vision checklist using gpt-5o
        print(f"[NLP EXTRACTION] Generating vision checklist...")
        try:
            vision_checklist = _generate_vision_checklist(profile)
            profile["visionChecklist"] = vision_checklist
            print(f"[NLP EXTRACTION] Vision checklist generated successfully")
        except Exception as e:
            print(f"[NLP EXTRACTION] Failed to generate vision checklist: {e}")
            profile["visionChecklist"] = {"structural": [], "lifestyle": [], "dealbreakers": [], "optional": []}

        return profile

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


def _parse_budget_string(budget_str: str) -> tuple[int | None, int | None]:
    """
    Parse budget string into budgetMin and budgetMax.

    Examples:
    - "Around 700K" -> (560000, 840000)  # ±20%
    - "$400K - $550K" -> (400000, 550000)
    - "Under $500K" -> (None, 500000)
    - "At least $300K" -> (300000, None)
    - "700000" -> (560000, 840000)  # ±20% if no range
    """
    import re

    if not budget_str or not isinstance(budget_str, str):
        return (None, None)

    budget_str = budget_str.strip()

    # Helper to convert various budget formats to integer
    # Handles: 700K, $700,000, 1.5M, 1.5 mil, 1.5 million, 1.5MM, etc.
    def parse_amount(s: str) -> int | None:
        if not s:
            return None

        import re

        # Clean up: remove $, commas, extra spaces
        s = s.replace("$", "").replace(",", "").strip()
        s_lower = s.lower()

        # Extract number and multiplier using regex
        # Matches: "1.5", "1.5 million", "1.5mil", "1.5m", "700k", "1.5MM", etc.
        match = re.match(r'^([\d.]+)\s*(million|mil|mm|m|thousand|k)?$', s_lower, re.IGNORECASE)

        if match:
            try:
                num = float(match.group(1))
                suffix = (match.group(2) or "").lower()

                # Determine multiplier based on suffix
                if suffix in ("million", "mil", "mm", "m"):
                    return int(num * 1_000_000)
                elif suffix in ("thousand", "k"):
                    return int(num * 1_000)
                else:
                    # No suffix - if number is small (< 10), assume millions for real estate
                    # e.g., "1.5" in real estate context likely means $1.5M
                    if num < 10:
                        return int(num * 1_000_000)
                    # If number is reasonable as-is (e.g., 500000), use it
                    return int(num)
            except:
                return None

        # Fallback: try to parse as plain number
        try:
            num = float(s.replace(" ", ""))
            return int(num)
        except:
            return None

    # Budget amount pattern - matches: $1.5M, 1.5 mil, 1.5 million, 700K, 500000, etc.
    amount_pattern = r'[\$]?[\d,.]+\s*(?:million|mil|mm|m|thousand|k)?'

    # Pattern 1: Range with dash: "$400K - $550K", "1 mil - 1.5 mil", "1-1.5 million"
    range_match = re.search(
        rf'({amount_pattern})\s*[-–—to]+\s*({amount_pattern})',
        budget_str, re.IGNORECASE
    )
    if range_match:
        min_val = parse_amount(range_match.group(1))
        max_val = parse_amount(range_match.group(2))
        if min_val or max_val:
            return (min_val, max_val)

    # Pattern 2: "Under $500K" or "Below 1.5 mil" - min is 50% of max
    under_match = re.search(
        rf'(under|below|less than|max|maximum|up to)\s*({amount_pattern})',
        budget_str, re.IGNORECASE
    )
    if under_match:
        max_val = parse_amount(under_match.group(2))
        if max_val:
            # Min is 50% of max to avoid showing properties too cheap
            min_val = int(max_val * 0.5)
            return (min_val, max_val)

    # Pattern 3: "At least $300K" or "Minimum 1 mil" or "Above 500K"
    above_match = re.search(
        rf'(at least|minimum|min|above|over|more than|starting at)\s*({amount_pattern})',
        budget_str, re.IGNORECASE
    )
    if above_match:
        min_val = parse_amount(above_match.group(2))
        if min_val:
            return (min_val, None)

    # Pattern 4: "Around $700K" or "About 1.5 mil" - use ±20% range
    around_match = re.search(
        rf'(around|about|approximately|roughly|near|circa)\s*({amount_pattern})',
        budget_str, re.IGNORECASE
    )
    if around_match:
        center = parse_amount(around_match.group(2))
        if center:
            # ±20% range for "around" statements
            min_val = int(center * (1 - BUDGET_FLEXIBILITY_PERCENT))
            max_val = int(center * (1 + BUDGET_FLEXIBILITY_PERCENT))
            return (min_val, max_val)

    # Pattern 5: Single amount - treat as MAX budget, min is 50% to catch deals
    # Real estate context: "1.5 mil" means they can afford UP TO 1.5M
    single_match = re.search(rf'({amount_pattern})', budget_str, re.IGNORECASE)
    if single_match:
        max_val = parse_amount(single_match.group(1))
        if max_val:
            # Min is 50% of max to catch hidden gems and deals
            min_val = int(max_val * 0.5)
            return (min_val, max_val)

    return (None, None)


def _deduplicate_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Remove duplicate concepts across categories. Priority: Must-Haves > Nice-to-Haves > Lifestyle."""

    def normalize_feature(feature: str) -> str:
        """Normalize feature for comparison."""
        normalized = re.sub(r'\b(updated|modern|renovated|new|nice|good|large|spacious)\b', '', feature.lower())
        normalized = re.sub(r'[^\w\s]', '', normalized).strip()
        return ' '.join(normalized.split())

    seen: Set[str] = set()

    # Must-Haves first (highest priority)
    must_haves = profile.get("mustHaveFeatures", [])
    for feature in must_haves:
        seen.add(normalize_feature(feature))

    # Nice-to-Haves, remove duplicates
    nice_to_haves = []
    for feature in profile.get("niceToHaves", []):
        normalized = normalize_feature(feature)
        if normalized not in seen and normalized:
            nice_to_haves.append(feature)
            seen.add(normalized)
    profile["niceToHaves"] = nice_to_haves

    # Lifestyle Priorities, remove duplicates
    lifestyle = []
    for feature in profile.get("lifestyleDrivers", []):
        normalized = normalize_feature(feature)
        if normalized not in seen and normalized:
            lifestyle.append(feature)
            seen.add(normalized)
    profile["lifestyleDrivers"] = lifestyle

    removed_count = (len(profile.get("niceToHaves", [])) + len(profile.get("lifestyleDrivers", [])) - len(nice_to_haves) - len(lifestyle))
    if removed_count > 0:
        print(f"[DEDUPLICATION] Removed {removed_count} duplicate features")

    return profile


def _validate_flexibility_tone(value: int, explanation: str, dimension: str) -> None:
    """Validate that flexibility % matches tone of explanation."""
    if not explanation:
        return

    explanation_lower = explanation.lower()

    if value <= 20:  # Rigid
        rigid_keywords = ['firm', 'strict', 'must', 'fixed', 'cannot', 'need to', 'required']
        if not any(word in explanation_lower for word in rigid_keywords):
            print(f"[FLEXIBILITY WARNING] {dimension}: {value}% is rigid but explanation lacks rigid tone: '{explanation}'")

    elif value >= 70:  # Flexible
        flexible_keywords = ['open', 'flexible', 'willing', 'consider', 'stretch', 'patient']
        if not any(word in explanation_lower for word in flexible_keywords):
            print(f"[FLEXIBILITY WARNING] {dimension}: {value}% is flexible but explanation lacks flexible tone: '{explanation}'")


def _call_llm_with_retry(func, max_retries=1, delay=2):
    """
    Retry wrapper for LLM calls with exponential backoff.

    Args:
        func: Function to call (should return a value)
        max_retries: Maximum number of retries (default 1)
        delay: Delay in seconds between retries (default 2)

    Returns:
        Result from successful function call

    Raises:
        Last exception if all retries fail
    """
    import time

    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            if attempt == max_retries:
                print(f"[LLM RETRY] All retries exhausted. Last error: {e}")
                raise
            print(f"[LLM RETRY] Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
            time.sleep(delay)


def _generate_complete_insights(profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate complete AI insights for a buyer profile using a single LLM call.

    Generates:
    - aiSummary: 2-3 sentence summary of the buyer
    - decisionDrivers: Top 3 decision drivers (list)
    - constraints: Top 3 key constraints (list)
    - flexibilityExplanations: Plain-language explanations for budget/location/timing flexibility

    Args:
        profile: Dictionary containing buyer profile data

    Returns:
        Dictionary with ai_summary, decision_drivers, constraints, flexibility_explanations
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[INSIGHTS] OpenAI API key not configured, returning empty insights")
        return {
            "aiSummary": "AI summary not available yet.",
            "decisionDrivers": [],
            "constraints": [],
            "flexibilityExplanations": {"budget": "", "location": "", "timing": ""}
        }

    client = OpenAI(api_key=api_key)

    # Build context from profile
    name = profile.get("name", "The buyer")
    location = profile.get("location", "Massachusetts")
    budget = profile.get("budget", "TBD")
    budget_min = profile.get("budgetMin")
    budget_max = profile.get("budgetMax")
    bedrooms = profile.get("bedrooms", "unknown")
    bathrooms = profile.get("bathrooms", "unknown")
    must_haves = profile.get("mustHaveFeatures", [])
    nice_to_haves = profile.get("niceToHaves", [])
    dealbreakers = profile.get("dealbreakers", [])
    lifestyle = profile.get("lifestyleDrivers", [])

    # Flexibility scores
    budget_flex = profile.get("budgetFlexibility", 50)
    location_flex = profile.get("locationFlexibility", 50)
    timing_flex = profile.get("timingFlexibility", 50)

    # Get timeline and areas
    timeline = profile.get("timeline", "Not specified")
    areas = profile.get("preferredAreas", [location]) if profile.get("preferredAreas") else [location]
    areas_str = ', '.join(areas)

    # Build string variables for prompt
    must_haves_str = ", ".join(must_haves) if must_haves else "None"
    nice_to_haves_str = ", ".join(nice_to_haves) if nice_to_haves else "None"
    dealbreakers_str = ", ".join(dealbreakers) if dealbreakers else "None"
    lifestyle_str = ", ".join(lifestyle) if lifestyle else "None"

    prompt = f"""You are a real estate agent generating high-level insights for a buyer profile.
Use ONLY the provided fields. Do not invent new information.

---------------------------------------------------
BUYER PROFILE:
- Name: {name}
- Areas: {areas_str}
- Budget: {budget} (min: ${budget_min:,}, max: ${budget_max:,})
- Bedrooms: {bedrooms}
- Bathrooms: {bathrooms}
- Timeline: {timeline}
- Must-Haves: {must_haves_str}
- Nice-to-Haves: {nice_to_haves_str}
- Dealbreakers: {dealbreakers_str}
- Lifestyle Priorities: {lifestyle_str}
- Budget Flexibility: {budget_flex}%
- Location Flexibility: {location_flex}%
- Timing Flexibility: {timing_flex}%
---------------------------------------------------

Generate JSON with:

1. aiSummary
   Write 2–3 sentences explaining:
   • who they are
   • their core needs (beds, baths, yard, parking, condition)
   • their budget range
   • their areas of interest (if multiple areas are provided, mention at least the top 2–3 by name)
   • their timeline and how flexible they are
   • their primary motivations (schools, safety, yard, move-in-ready, commute, etc.)

2. decisionDrivers (exactly 3)
   The 3 biggest factors that will determine what they buy.
   These should be specific and high-impact (e.g. "living on a quiet, family-friendly street" not "location").

3. constraints (exactly 3)
   The 3 non-negotiable boundaries of their search (e.g. "no homes on busy roads", "must have at least 3 bedrooms").

4. flexibilityExplanations
   One sentence each for:
   • budget
   • location
   • timing

   FLEXIBILITY SCORING GUIDE:
   • 0–30%  → describe as "not flexible", "very fixed", or "pretty firm"
   • 31–70% → describe as "somewhat flexible" or "open with conditions"
   • 71–100% → describe as "very flexible" or "open to alternatives"

Return ONLY valid JSON, no markdown:

{{
  "aiSummary": "...",
  "decisionDrivers": ["...", "...", "..."],
  "constraints": ["...", "...", "..."],
  "flexibilityExplanations": {{
    "budget": "...",
    "location": "...",
    "timing": "..."
  }}
}}"""

    model_config = _get_model_config("insights")

    def call_llm():
        response = client.chat.completions.create(
            model=model_config["model"],
            messages=[
                {
                    "role": "system",
                    "content": "You are a real estate agent creating buyer insights. Return ONLY valid JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=model_config["temperature"],
            response_format={"type": "json_object"}
        )
        return response.choices[0].message.content

    try:
        # Call LLM with retry logic
        content = _call_llm_with_retry(call_llm, max_retries=1, delay=2)
        print(f"[INSIGHTS] Raw AI response: {content[:150]}...")

        # Parse JSON response
        insights = json.loads(content)

        # Validate and extract fields
        ai_summary = insights.get("aiSummary", "AI summary not available yet.")
        decision_drivers = insights.get("decisionDrivers", [])[:3]  # Limit to 3
        constraints = insights.get("constraints", [])[:3]  # Limit to 3
        flexibility_explanations = insights.get("flexibilityExplanations", {})

        # Ensure flexibility explanations has all keys
        if not isinstance(flexibility_explanations, dict):
            flexibility_explanations = {}

        flexibility_explanations = {
            "budget": flexibility_explanations.get("budget", ""),
            "location": flexibility_explanations.get("location", ""),
            "timing": flexibility_explanations.get("timing", "")
        }

        # Validate flexibility tone
        if flexibility_explanations:
            _validate_flexibility_tone(budget_flex, flexibility_explanations.get("budget", ""), "Budget")
            _validate_flexibility_tone(location_flex, flexibility_explanations.get("location", ""), "Location")
            _validate_flexibility_tone(timing_flex, flexibility_explanations.get("timing", ""), "Timing")

        print(f"[INSIGHTS] Generated: summary={len(ai_summary)} chars, drivers={len(decision_drivers)}, constraints={len(constraints)}")

        return {
            "aiSummary": ai_summary,
            "decisionDrivers": decision_drivers,
            "constraints": constraints,
            "flexibilityExplanations": flexibility_explanations
        }

    except Exception as e:
        print(f"[INSIGHTS] Failed to generate insights: {e}")
        import traceback
        traceback.print_exc()

        # Return empty insights on failure
        return {
            "aiSummary": "AI summary not available yet.",
            "decisionDrivers": [],
            "constraints": [],
            "flexibilityExplanations": {"budget": "", "location": "", "timing": ""}
        }


def _generate_vision_checklist(profile: Dict[str, Any]) -> Dict[str, list[str]]:
    """Generate vision checklist for photo analysis using gpt-5o."""

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return {"structural": [], "lifestyle": [], "dealbreakers": [], "optional": []}

    client = OpenAI(api_key=api_key)
    model_config = _get_model_config("vision_checklist")

    # Extract profile data
    name = profile.get("name", "Buyer")
    location = profile.get("location", "Unknown")
    budget_min = profile.get("budgetMin", 0)
    budget_max = profile.get("budgetMax", 0)
    bedrooms = profile.get("bedrooms", "Unknown")
    bathrooms = profile.get("bathrooms", "Unknown")
    must_haves = profile.get("mustHaveFeatures", [])
    nice_to_haves = profile.get("niceToHaves", [])
    lifestyle = profile.get("lifestyleDrivers", [])
    dealbreakers = profile.get("dealbreakers", [])

    # Build string variables for prompt
    must_haves_str = ", ".join(must_haves) if must_haves else "None"
    nice_to_haves_str = ", ".join(nice_to_haves) if nice_to_haves else "None"
    lifestyle_str = ", ".join(lifestyle) if lifestyle else "None"
    dealbreakers_str = ", ".join(dealbreakers) if dealbreakers else "None"

    prompt = f"""You are an AI real estate assistant generating a Vision Checklist for automated photo and street-level analysis.

Your job is to translate the buyer profile into specific, MLS-missing signals that:
• can be detected from listing photos
• can be inferred from street-view / neighborhood context

DO NOT include basic MLS fields (beds, baths, square footage, year built, garage count, lot size numbers).

---------------------------------------------------
CHECKLIST CATEGORIES:
- structural
- lifestyle
- dealbreakers
- optional
---------------------------------------------------

PERSONALIZATION RULES (CRITICAL)
---------------------------------------------------
• START from the buyer's must-haves, lifestyle priorities, and dealbreakers.
• For each category, include ONLY items that directly help check those preferences or risks.
• General safety / condition red flags (mold, foundation, neglect) may be included, but AFTER buyer-specific items.
• DO NOT blindly include every example from this prompt.
• LIMIT each list to the 6–10 most relevant items.
• ALWAYS put buyer-specific concerns BEFORE generic safety checks.

ORDERING WITHIN EACH CATEGORY:
• The FIRST 3 items in each category MUST be directly tied to the buyer's must-haves, lifestyle priorities, or dealbreakers.
• Only after those buyer-specific items, add general condition/safety checks.
• Agents skim the top 3 items in each list – make them count.

Guidance:
• If the buyer mentions kids or a dog → prioritize yard safety, flatness, fencing in STRUCTURAL and family-friendly feel in LIFESTYLE.
• If the buyer mentions quiet street → prioritize traffic/noise signals and road type in LIFESTYLE/DEALBREAKERS.
• If the buyer wants move-in-ready → prioritize visible condition (exterior, roof, siding, major interior surfaces) in STRUCTURAL.

---------------------------------------------------
STRUCTURAL (photo-detectable interior/exterior features)
Examples (use only those relevant to this buyer):
• natural light levels in main living areas
• modern cabinet style, upgraded counters, stainless appliances
• open or functional kitchen layout
• updated bathrooms (clean tile, modern fixtures)
• flooring condition (scratches, wear)
• usable backyard (flat, fenced, safe for kids/dog)
• siding/roof condition (visible damage, age signals)
• driveway usability (width, slope, cracks)
• basement finish quality and signs of moisture
• safe staircase / railings

---------------------------------------------------
LIFESTYLE (neighborhood vibe from photos / street view)
Includes micro-location context:
• quiet street indicators (low car density, no lane markings)
• sidewalks present (walkability, kids)
• family-friendly curb appeal
• well-maintained neighboring homes
• greenery / nearby park or playground visible
• street lighting quality
• street appears residential (not an arterial/major road)
• safe-feeling surroundings

---------------------------------------------------
DEALBREAKERS (visual red flags)
Buyer-specific dealbreakers should appear FIRST, followed by generic safety issues.
Examples to choose from based on the profile:
• homes directly on busy or high-traffic roads (double-yellow lines, multi-lane traffic)
• visible power lines close to the yard or house
• heavy traffic directly in front of driveway
• proximity to commercial or industrial buildings
• ceiling stains or visible mold
• foundation cracks or severe exterior damage
• unsafe exterior condition
• severely neglected neighboring homes

---------------------------------------------------
OPTIONAL (aesthetic preferences)
Use for nice-to-have visual preferences:
• modern finishes
• designer lighting
• fireplace condition
• curb appeal (landscaping, entryway)
• large windows or expansive glass
• upgraded fixtures
• other visually obvious style upgrades mentioned by the buyer

---------------------------------------------------
BUYER PROFILE:
- Name: {name}
- Location: {location}
- Budget: ${budget_min:,} – ${budget_max:,}
- Bedrooms: {bedrooms}
- Bathrooms: {bathrooms}
- Must-Haves: {must_haves_str}
- Nice-to-Haves: {nice_to_haves_str}
- Lifestyle Priorities: {lifestyle_str}
- Dealbreakers: {dealbreakers_str}

---------------------------------------------------
OUTPUT FORMAT:
Return ONLY valid JSON:

{{
  "structural": ["..."],
  "lifestyle": ["..."],
  "dealbreakers": ["..."],
  "optional": ["..."]
}}"""

    def call_llm():
        response = client.chat.completions.create(
            model=model_config["model"],
            messages=[
                {"role": "system", "content": "You are a real estate assistant generating photo analysis checklists."},
                {"role": "user", "content": prompt}
            ],
            temperature=model_config["temperature"],
            response_format={"type": "json_object"}
        )
        return response.choices[0].message.content

    try:
        content = _call_llm_with_retry(call_llm, max_retries=1, delay=2)
        checklist = json.loads(content)
        return {
            "structural": checklist.get("structural", []),
            "lifestyle": checklist.get("lifestyle", []),
            "dealbreakers": checklist.get("dealbreakers", []),
            "optional": checklist.get("optional", [])
        }
    except Exception as e:
        print(f"[VISION CHECKLIST] Failed: {e}")
        return {"structural": [], "lifestyle": [], "dealbreakers": [], "optional": []}


class ParseBudgetRequest(BaseModel):
    budget: str


@router.post("/parse-budget")
def parse_budget(req: ParseBudgetRequest):
    """
    Parse budget string into budgetMin and budgetMax.
    Useful for profile edit and form validation.

    Examples:
    - "Around 700K" -> {"budgetMin": 560000, "budgetMax": 840000}
    - "$400K - $550K" -> {"budgetMin": 400000, "budgetMax": 550000}
    - "Under $500K" -> {"budgetMin": null, "budgetMax": 500000}
    """
    budget_min, budget_max = _parse_budget_string(req.budget)
    print(f"[PARSE BUDGET] Input: '{req.budget}' -> min={budget_min}, max={budget_max}")

    return {
        "budget": req.budget,
        "budgetMin": budget_min,
        "budgetMax": budget_max
    }


@router.post("/enhance-profile")
def enhance_profile(req: EnhanceRequest):
    """Enhance profile with budget parsing, voice transcript analysis, and structure validation"""
    data = req.formData

    # STEP 1: Analyze voice transcript if provided
    voice_extracted = None
    if data.get("voiceTranscript"):
        voice_text = data["voiceTranscript"].strip()
        if voice_text:
            print(f"[ENHANCE PROFILE] Processing voice transcript: {voice_text[:100]}...")
            try:
                voice_extracted = _extract_profile_with_ai(voice_text)
                print(f"[ENHANCE PROFILE] Voice analysis complete: budget={voice_extracted.get('budget')}, bedrooms={voice_extracted.get('bedrooms')}")
            except Exception as e:
                print(f"[ENHANCE PROFILE] Voice analysis failed: {e}")
                # Continue without voice data

    # STEP 2: Parse budget if budgetMin/Max not already set
    budget_min = data.get("budgetMin")
    budget_max = data.get("budgetMax")

    if (budget_min is None or budget_max is None) and data.get("budget"):
        parsed_min, parsed_max = _parse_budget_string(data.get("budget", ""))
        if budget_min is None:
            budget_min = parsed_min
        if budget_max is None:
            budget_max = parsed_max
        print(f"[ENHANCE PROFILE] Parsed budget '{data.get('budget')}' -> min={budget_min}, max={budget_max}")

    # STEP 3: If voice analysis succeeded, use it to fill missing fields
    # Voice data takes precedence for specific fields like budget, bedrooms, location
    if voice_extracted:
        # Use voice budget if form budget is not provided
        if not data.get("budget") or data.get("budget") == "TBD":
            if voice_extracted.get("budgetMin"):
                budget_min = voice_extracted["budgetMin"]
            if voice_extracted.get("budgetMax"):
                budget_max = voice_extracted["budgetMax"]
            print(f"[ENHANCE PROFILE] Using voice budget: min={budget_min}, max={budget_max}")

        # Use voice location if form location is generic
        if not data.get("location") or data.get("location") == "Massachusetts":
            if voice_extracted.get("location") and voice_extracted["location"] != "Massachusetts":
                data["location"] = voice_extracted["location"]
                print(f"[ENHANCE PROFILE] Using voice location: {data['location']}")

        # Merge arrays (voice data adds to form data, doesn't replace)
        for field in ["mustHaveFeatures", "dealbreakers", "lifestyleDrivers", "specialNeeds"]:
            form_items = data.get(field, [])
            voice_items = voice_extracted.get(field, [])
            if voice_items:
                # Combine and deduplicate
                combined = list(set(form_items + voice_items))
                data[field] = combined
                print(f"[ENHANCE PROFILE] Merged {field}: {len(combined)} items")

    # STEP 4: Build enhanced profile with all merged and parsed data
    enhanced_profile = {
        "name": data.get("name", "Buyer"),
        "email": data.get("email"),
        "location": data.get("location", "Massachusetts"),
        "budget": data.get("budget", "TBD"),
        "budgetMin": budget_min,
        "budgetMax": budget_max,
        "homeType": data.get("homeType", "single-family"),
        "bedrooms": data.get("bedrooms", 2),
        "maxBedrooms": data.get("maxBedrooms"),
        "bathrooms": data.get("bathrooms", "2"),
        "mustHaveFeatures": data.get("mustHaveFeatures", []),
        "niceToHaves": data.get("niceToHaves", []),
        "dealbreakers": data.get("dealbreakers", []),
        "preferredAreas": data.get("preferredAreas", []),
        "lifestyleDrivers": data.get("lifestyleDrivers", []),
        "specialNeeds": data.get("specialNeeds", []),
        "budgetFlexibility": data.get("budgetFlexibility", 50),
        "locationFlexibility": data.get("locationFlexibility", 50),
        "timingFlexibility": data.get("timingFlexibility", 50),
        "emotionalContext": data.get("emotionalContext") or (voice_extracted.get("emotionalContext") if voice_extracted else None),
        "inferredTags": [],
        "emotionalTone": voice_extracted.get("emotionalTone") if voice_extracted else None,
        "priorityScore": 50,
    }

    # STEP 5: Generate AI insights if we have sufficient data
    # Only generate insights if budget data is available
    if budget_min is not None or budget_max is not None:
        print(f"[ENHANCE PROFILE] Generating AI insights...")
        try:
            insights = _generate_complete_insights(enhanced_profile)
            enhanced_profile.update(insights)
            print(f"[ENHANCE PROFILE] AI insights generated successfully")
        except Exception as e:
            print(f"[ENHANCE PROFILE] Failed to generate insights: {e}")
            # Continue without insights - they're optional

    return enhanced_profile
