"""
AI-powered conversational profile editing using Gemini Function Calling.

This ensures the AI can ONLY output valid field names and structured changes.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Any, Optional
from ..db import get_conn, fetchone_dict
from ..auth import get_current_agent_id
import json
import os
import logging

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Initialize Gemini client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info(f"Initialized Gemini client for conversational edits: model={GEMINI_MODEL}")
else:
    logger.warning("GEMINI_API_KEY not set - conversational edit will be limited")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _format_budget_display(min_val: int | None, max_val: int | None) -> str:
    """Format budget min/max as display string (e.g., '$500K - $700K')."""
    def format_amount(val: int) -> str:
        if val >= 1_000_000:
            if val % 1_000_000 == 0:
                return f"${val // 1_000_000}M"
            else:
                return f"${val / 1_000_000:.1f}M".rstrip('0').rstrip('.')
        elif val >= 1_000:
            if val % 1_000 == 0:
                return f"${val // 1_000}K"
            else:
                return f"${val / 1_000:.0f}K"
        else:
            return f"${val:,}"

    if min_val and max_val:
        return f"{format_amount(min_val)} - {format_amount(max_val)}"
    elif max_val:
        return f"Up to {format_amount(max_val)}"
    elif min_val:
        return f"From {format_amount(min_val)}"
    return "TBD"


# ============================================================================
# SCHEMA DEFINITIONS
# ============================================================================

class ParseChangesRequest(BaseModel):
    text: str
    currentProfile: dict


class ChangeItem(BaseModel):
    field: str
    oldValue: Any | None = None
    newValue: Any | None = None
    confidence: int = 80
    action: str  # "update", "add", "remove"


class ApplyChangesRequest(BaseModel):
    changes: List[ChangeItem]


# All valid profile fields with their types
PROFILE_FIELD_TYPES = {
    # Basic info
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "buyerType": "enum:traditional,investor,first_time,luxury",
    # Budget
    "budget": "string",
    "budgetMin": "number",
    "budgetMax": "number",
    # Property specs
    "homeType": "enum:condo,townhouse,single-family,duplex,apartment,other",
    "bedrooms": "number",
    "minBedrooms": "number",
    "maxBedrooms": "number",
    "bathrooms": "string",
    "minBathrooms": "number",
    # Arrays (support add/remove)
    "mustHaveFeatures": "array",
    "dealbreakers": "array",
    "preferredAreas": "array",
    "lifestyleDrivers": "array",
    "specialNeeds": "array",
    # Flexibility scores
    "budgetFlexibility": "number",
    "locationFlexibility": "number",
    "timingFlexibility": "number",
    # Context
    "emotionalContext": "string",
    # Investor fields
    "investorType": "enum:rental_income,flip,house_hack,multi_unit",
    "investmentCapital": "number",
    "targetMonthlyReturn": "number",
    "targetCapRate": "number",
    "investmentStrategy": "string",
    # Commute fields
    "workAddress": "string",
    "maxCommuteMins": "number",
}

# Fields that are arrays (support add/remove operations)
ARRAY_FIELDS = {"mustHaveFeatures", "dealbreakers", "preferredAreas", "lifestyleDrivers", "specialNeeds"}

# All valid field names for the enum
ALL_FIELD_NAMES = list(PROFILE_FIELD_TYPES.keys())


# ============================================================================
# GEMINI FUNCTION CALLING TOOL DEFINITION
# ============================================================================

# Define the function schema that constrains Gemini's output
EDIT_PROFILE_FUNCTION = types.FunctionDeclaration(
    name="edit_buyer_profile",
    description="Edit one or more fields on a buyer profile based on the user's request",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "changes": types.Schema(
                type=types.Type.ARRAY,
                description="List of changes to make to the profile",
                items=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "field": types.Schema(
                            type=types.Type.STRING,
                            description="The profile field to change",
                            enum=ALL_FIELD_NAMES  # AI can ONLY use these field names
                        ),
                        "action": types.Schema(
                            type=types.Type.STRING,
                            description="Type of change: 'update' for setting a value, 'add' for adding to arrays, 'remove' for removing from arrays",
                            enum=["update", "add", "remove"]
                        ),
                        "newValue": types.Schema(
                            type=types.Type.STRING,
                            description="The new value to set (for update/add). For numbers, provide as string like '200000'. For arrays with update action, provide comma-separated values."
                        ),
                        "oldValue": types.Schema(
                            type=types.Type.STRING,
                            description="The value to remove (for remove action) or current value being replaced (for update)"
                        ),
                        "confidence": types.Schema(
                            type=types.Type.INTEGER,
                            description="Confidence score 0-100 for this change"
                        )
                    },
                    required=["field", "action", "confidence"]
                )
            ),
            "overall_confidence": types.Schema(
                type=types.Type.INTEGER,
                description="Overall confidence score 0-100 for understanding the user's request"
            )
        },
        required=["changes", "overall_confidence"]
    )
)


def build_system_prompt(current_profile: dict) -> str:
    """Build the system prompt with current profile context."""

    # Format profile for display
    profile_display = {}
    for field, value in current_profile.items():
        if value is not None and field in PROFILE_FIELD_TYPES:
            profile_display[field] = value

    return f"""You are a real estate assistant helping agents edit buyer profiles through natural conversation.

CURRENT BUYER PROFILE:
{json.dumps(profile_display, indent=2)}

FIELD TYPES AND VALID VALUES:
- Scalar fields (use action="update"): name, email, phone, location, budget, budgetMin, budgetMax, bedrooms, minBedrooms, maxBedrooms, bathrooms, minBathrooms, budgetFlexibility, locationFlexibility, timingFlexibility, emotionalContext, investmentCapital, targetMonthlyReturn, targetCapRate, investmentStrategy, workAddress, maxCommuteMins
- Array fields (use action="add" or "remove"): mustHaveFeatures, dealbreakers, preferredAreas, lifestyleDrivers, specialNeeds
- Enum fields:
  - buyerType: traditional, investor, first_time, luxury
  - homeType: condo, townhouse, single-family, duplex, apartment, other
  - investorType: rental_income, flip, house_hack, multi_unit
- Commute fields:
  - workAddress: The buyer's work/office address for commute calculations
  - maxCommuteMins: Maximum acceptable commute time in minutes (number)

RULES:
1. For budget values: Convert "$200K" or "200k" to "200000" (full number as string)
2. For array fields: Use "add" to add items, "remove" to remove items
3. For scalar/enum fields: Use "update" action
4. Include oldValue when updating (from current profile) or removing
5. Set confidence based on clarity: 90-100 for clear requests, 70-89 for inferred, below 70 for uncertain
6. If user says "min" or "minimum", use the min field (budgetMin, minBedrooms)
7. If user says "max" or "maximum", use the max field (budgetMax, maxBedrooms)
8. Multiple changes in one request are fine - parse all of them
9. COMMUTE: If user mentions "work", "office", "commute from", "my work is at", or similar - set the workAddress field with the address they provide
10. If user mentions commute time like "30 minute commute" or "max commute 45 mins" - set maxCommuteMins

Call the edit_buyer_profile function with the detected changes.
"""


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/buyer-profiles/{profile_id}/parse-changes")
async def parse_changes(
    profile_id: int,
    req: ParseChangesRequest,
    request: Request,
    agent_id: int = Depends(get_current_agent_id)
):
    """
    Parse natural language edit request using Gemini Function Calling.

    The AI can ONLY output valid field names due to the enum constraint.
    """

    # Verify agent owns this profile
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT agent_id FROM buyer_profiles WHERE id = %s", (profile_id,))
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            if row.get("agent_id") != agent_id:
                raise HTTPException(status_code=403, detail="Not authorized to modify this profile")

    if not gemini_client:
        raise HTTPException(status_code=500, detail="AI service not configured")

    try:
        system_prompt = build_system_prompt(req.currentProfile)
        user_message = f"User request: \"{req.text}\""

        logger.info(f"[PARSE] Processing: '{req.text}'")

        # Call Gemini with function calling
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Content(role="user", parts=[types.Part(text=system_prompt + "\n\n" + user_message)])
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,  # Low temperature for consistent parsing
                tools=[types.Tool(function_declarations=[EDIT_PROFILE_FUNCTION])],
            )
        )

        if not response or not response.candidates:
            logger.warning(f"Gemini returned empty response for: {req.text}")
            return {"changes": [], "confidence": 0}

        # Extract function call from response
        candidate = response.candidates[0]

        if not candidate.content or not candidate.content.parts:
            logger.warning(f"No content in Gemini response for: {req.text}")
            return {"changes": [], "confidence": 0}

        # Find the function call part
        function_call = None
        for part in candidate.content.parts:
            if hasattr(part, 'function_call') and part.function_call:
                function_call = part.function_call
                break

        if not function_call:
            # AI didn't call the function - might have responded with text instead
            logger.warning(f"Gemini did not call function for: {req.text}")
            # Try to extract text response for debugging
            for part in candidate.content.parts:
                if hasattr(part, 'text') and part.text:
                    logger.info(f"Gemini text response: {part.text[:200]}")
            return {"changes": [], "confidence": 0}

        # Parse function arguments
        args = dict(function_call.args)
        changes_raw = args.get("changes", [])
        overall_confidence = args.get("overall_confidence", 80)

        # Convert to our ChangeItem format with proper type conversion
        changes = []
        for ch in changes_raw:
            field = ch.get("field")
            action = ch.get("action", "update")
            new_value_str = ch.get("newValue")
            old_value_str = ch.get("oldValue")
            confidence = ch.get("confidence", 80)

            # Convert string values to appropriate types
            new_value = convert_value(field, new_value_str)
            old_value = convert_value(field, old_value_str)

            # Get old value from profile if not provided
            if old_value is None and action == "update" and field in req.currentProfile:
                old_value = req.currentProfile.get(field)

            changes.append({
                "field": field,
                "action": action,
                "newValue": new_value,
                "oldValue": old_value,
                "confidence": confidence
            })

        logger.info(f"[PARSE] Result: {len(changes)} changes, confidence={overall_confidence}")

        return {"changes": changes, "confidence": overall_confidence}

    except Exception as e:
        logger.error(f"Gemini parse error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")


def convert_value(field: str, value_str: Optional[str]) -> Any:
    """Convert string value to appropriate type based on field."""
    if value_str is None:
        return None

    field_type = PROFILE_FIELD_TYPES.get(field, "string")

    if field_type == "number":
        try:
            # Handle common formats like "200K", "$500,000"
            cleaned = value_str.replace("$", "").replace(",", "").strip()
            if cleaned.lower().endswith("k"):
                return int(float(cleaned[:-1]) * 1000)
            elif cleaned.lower().endswith("m"):
                return int(float(cleaned[:-1]) * 1000000)
            else:
                return int(float(cleaned))
        except:
            return value_str
    elif field_type == "array":
        # For arrays, return the single item (add/remove operate on single items)
        return value_str
    elif field_type.startswith("enum:"):
        # Validate enum value
        valid_values = field_type.split(":")[1].split(",")
        if value_str.lower().replace(" ", "_").replace("-", "_") in [v.lower() for v in valid_values]:
            return value_str.lower().replace(" ", "_").replace("-", "_")
        return value_str
    else:
        return value_str


# ============================================================================
# APPLY CHANGES ENDPOINT
# ============================================================================

# Map camelCase fields to snake_case DB columns
FIELD_TO_COLUMN = {
    "name": "name",
    "email": "email",
    "phone": "phone",
    "location": "location",
    "buyerType": "buyer_type",
    "budget": "budget",
    "budgetMin": "budget_min",
    "budgetMax": "budget_max",
    "homeType": "home_type",
    "bedrooms": "bedrooms",
    "minBedrooms": "min_bedrooms",
    "maxBedrooms": "max_bedrooms",
    "bathrooms": "bathrooms",
    "minBathrooms": "min_bathrooms",
    "mustHaveFeatures": "must_have_features",
    "dealbreakers": "dealbreakers",
    "preferredAreas": "preferred_areas",
    "lifestyleDrivers": "lifestyle_drivers",
    "specialNeeds": "special_needs",
    "budgetFlexibility": "budget_flexibility",
    "locationFlexibility": "location_flexibility",
    "timingFlexibility": "timing_flexibility",
    "emotionalContext": "emotional_context",
    "investorType": "investor_type",
    "investmentCapital": "investment_capital",
    "targetMonthlyReturn": "target_monthly_return",
    "targetCapRate": "target_cap_rate",
    "investmentStrategy": "investment_strategy",
    # Commute
    "workAddress": "work_address",
    "maxCommuteMins": "max_commute_mins",
}


@router.patch("/buyer-profiles/{profile_id}/apply-changes")
async def apply_changes(
    profile_id: int,
    req: ApplyChangesRequest,
    request: Request,
    agent_id: int = Depends(get_current_agent_id)
):
    """Apply parsed changes to buyer profile."""

    # Fetch current profile and verify ownership
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM buyer_profiles WHERE id = %s", (profile_id,))
            row = fetchone_dict(cur)
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            if row.get("agent_id") != agent_id:
                raise HTTPException(status_code=403, detail="Not authorized to modify this profile")

    # Build updates
    updates = {}

    for ch in req.changes:
        field = ch.field
        column = FIELD_TO_COLUMN.get(field)

        if not column:
            logger.warning(f"Unknown field: {field}")
            continue

        if field in ARRAY_FIELDS:
            # Handle array add/remove
            current_values = row.get(column) or []
            if isinstance(current_values, str):
                try:
                    current_values = json.loads(current_values)
                except:
                    current_values = []

            if ch.action == "add" and ch.newValue:
                # Add if not already present (case-insensitive check)
                if not any(v.lower() == str(ch.newValue).lower() for v in current_values):
                    current_values.append(str(ch.newValue))
            elif ch.action == "remove" and ch.oldValue:
                # Case-insensitive removal
                current_values = [v for v in current_values if v.lower() != str(ch.oldValue).lower()]
            elif ch.action == "update" and ch.newValue is not None:
                # Replace entire array
                if isinstance(ch.newValue, list):
                    current_values = ch.newValue
                else:
                    current_values = [str(ch.newValue)]

            updates[column] = json.dumps(current_values)
        else:
            # Scalar field update
            if ch.newValue is not None:
                updates[column] = ch.newValue

    if not updates:
        raise HTTPException(status_code=400, detail="No valid changes to apply")

    # Sync budget display string when budgetMin/budgetMax change
    if "budget_min" in updates or "budget_max" in updates:
        # Get final min/max values (from updates or existing row)
        final_min = updates.get("budget_min") or row.get("budget_min")
        final_max = updates.get("budget_max") or row.get("budget_max")

        # Format as display string
        if final_min and final_max:
            updates["budget"] = _format_budget_display(final_min, final_max)
        elif final_max:
            updates["budget"] = _format_budget_display(None, final_max)
        elif final_min:
            updates["budget"] = _format_budget_display(final_min, None)

    # Build and execute SQL
    sets = [f"{col} = %s" for col in updates.keys()]
    params = list(updates.values()) + [profile_id]

    logger.info(f"[APPLY] Updating profile {profile_id}: {list(updates.keys())}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE buyer_profiles SET {', '.join(sets)} WHERE id = %s RETURNING *",
                tuple(params),
            )
            row = fetchone_dict(cur)

    # Return updated profile in UI shape
    return format_profile_response(row)


def format_profile_response(row: dict) -> dict:
    """Format database row to frontend profile shape."""

    def parse_json(v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "email": row.get("email"),
        "phone": row.get("phone"),
        "location": row.get("location"),
        "agentId": row.get("agent_id"),
        "buyerType": row.get("buyer_type"),
        "budget": row.get("budget"),
        "budgetMin": row.get("budget_min"),
        "budgetMax": row.get("budget_max"),
        "homeType": row.get("home_type"),
        "bedrooms": row.get("bedrooms"),
        "minBedrooms": row.get("min_bedrooms"),
        "maxBedrooms": row.get("max_bedrooms"),
        "bathrooms": row.get("bathrooms"),
        "minBathrooms": row.get("min_bathrooms"),
        "investorType": row.get("investor_type"),
        "investmentCapital": row.get("investment_capital"),
        "targetMonthlyReturn": row.get("target_monthly_return"),
        "targetCapRate": float(row.get("target_cap_rate")) if row.get("target_cap_rate") is not None else None,
        "investmentStrategy": row.get("investment_strategy"),
        "budgetFlexibility": row.get("budget_flexibility"),
        "locationFlexibility": row.get("location_flexibility"),
        "timingFlexibility": row.get("timing_flexibility"),
        "emotionalContext": row.get("emotional_context"),
        "mustHaveFeatures": parse_json(row.get("must_have_features")),
        "dealbreakers": parse_json(row.get("dealbreakers")),
        "preferredAreas": parse_json(row.get("preferred_areas")),
        "lifestyleDrivers": parse_json(row.get("lifestyle_drivers")),
        "specialNeeds": parse_json(row.get("special_needs")),
        "inferredTags": parse_json(row.get("inferred_tags")),
        "aiSummary": row.get("ai_summary"),
        "createdAt": row.get("created_at"),
        # Commute
        "workAddress": row.get("work_address"),
        "maxCommuteMins": row.get("max_commute_mins"),
    }


# ============================================================================
# HELPER ENDPOINTS
# ============================================================================

@router.get("/buyer-profiles/{profile_id}/quick-suggestions")
def quick_suggestions(profile_id: int):
    """Get quick edit suggestions based on profile."""
    suggestions = [
        "Increase budget by $50K",
        "Add pool to must-haves",
        "Remove garage requirement",
        "Add 1 more bedroom",
        "Change location to downtown",
        "Add good schools to lifestyle drivers",
    ]
    return {"suggestions": suggestions}
