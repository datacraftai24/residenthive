"""
Entity Code Generator for WhatsApp Identification

Generates unique short codes (e.g., SC1, MJ1) for each buyer profile and lead
to enable unambiguous identification in WhatsApp conversations.

Code format: {First Initial}{Last Initial}{Number}
Examples: SC1 (Sarah Chen #1), SM1 (Sarah Miller #1), SC2 (Sam Carter #2)

Unified namespace: codes are unique across BOTH buyers and leads for an agent.
"""

import re
from typing import Optional, List, Dict, Any
from ...db import get_conn, fetchone_dict, fetchall_dicts


def _extract_initials(name: str) -> str:
    """
    Extract first and last initials from a name.

    Args:
        name: Full name (e.g., "Sarah Chen", "John Paul Smith")

    Returns:
        Two-letter initials (e.g., "SC", "JS")
    """
    if not name or not name.strip():
        return "XX"

    name = name.strip()
    parts = name.split()

    if len(parts) == 0:
        return "XX"
    elif len(parts) == 1:
        single = parts[0].upper()
        if len(single) >= 2:
            return single[0] + single[1]
        return single[0] + single[0]
    else:
        first_initial = parts[0][0].upper() if parts[0] else "X"
        last_initial = parts[-1][0].upper() if parts[-1] else "X"
        return first_initial + last_initial


def generate_entity_code(agent_id: int, name: str) -> str:
    """
    Generate a unique entity code across both buyers and leads.

    UNION query ensures codes are unique in the combined namespace.

    Args:
        agent_id: The agent's ID (codes are unique per agent)
        name: The entity's full name

    Returns:
        Unique code like "SC1", "SC2", "MJ1"
    """
    base = _extract_initials(name)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Find existing codes with the same base across BOTH tables
            cur.execute(
                """
                SELECT whatsapp_code FROM buyer_profiles
                WHERE agent_id = %s AND whatsapp_code LIKE %s
                UNION ALL
                SELECT whatsapp_code FROM leads
                WHERE agent_id = %s AND whatsapp_code LIKE %s
                """,
                (agent_id, f"{base}%", agent_id, f"{base}%"),
            )
            existing = [row[0] for row in cur.fetchall() if row[0]]

    if not existing:
        return f"{base}1"

    # Extract numbers from existing codes and find next available
    numbers = []
    pattern = re.compile(rf"^{re.escape(base)}(\d+)$")
    for code in existing:
        match = pattern.match(code)
        if match:
            numbers.append(int(match.group(1)))

    if not numbers:
        return f"{base}1"

    next_num = max(numbers) + 1
    return f"{base}{next_num}"


# Backward-compatible alias
def generate_buyer_code(agent_id: int, buyer_name: str) -> str:
    """Generate a unique buyer code. Alias for generate_entity_code."""
    return generate_entity_code(agent_id, buyer_name)


def get_buyer_by_code(agent_id: int, code: str) -> Optional[Dict[str, Any]]:
    """
    Look up a buyer profile by WhatsApp code.

    Args:
        agent_id: The agent's ID
        code: The WhatsApp code (e.g., "SC1")

    Returns:
        Buyer profile dict or None if not found
    """
    code = code.upper().strip()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM buyer_profiles
                WHERE agent_id = %s AND whatsapp_code = %s
                """,
                (agent_id, code),
            )
            return fetchone_dict(cur)


def get_lead_by_code(agent_id: int, code: str) -> Optional[Dict[str, Any]]:
    """
    Look up a lead by WhatsApp code.

    Args:
        agent_id: The agent's ID
        code: The WhatsApp code (e.g., "SC1")

    Returns:
        Lead dict or None if not found
    """
    code = code.upper().strip()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM leads
                WHERE agent_id = %s AND whatsapp_code = %s
                """,
                (agent_id, code),
            )
            return fetchone_dict(cur)


def get_buyers_by_name(agent_id: int, name_query: str) -> List[Dict[str, Any]]:
    """
    Find buyers matching a name query (fuzzy matching).

    Args:
        agent_id: The agent's ID
        name_query: The name to search for

    Returns:
        List of matching buyer profiles
    """
    name_query = name_query.strip().lower()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM buyer_profiles
                WHERE agent_id = %s
                AND LOWER(name) LIKE %s
                ORDER BY name
                """,
                (agent_id, f"%{name_query}%"),
            )
            return fetchall_dicts(cur)


def get_leads_by_name(agent_id: int, name_query: str) -> List[Dict[str, Any]]:
    """
    Find leads matching a name query (fuzzy matching).

    Args:
        agent_id: The agent's ID
        name_query: The name to search for

    Returns:
        List of matching leads
    """
    name_query = name_query.strip().lower()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM leads
                WHERE agent_id = %s
                AND LOWER(extracted_name) LIKE %s
                ORDER BY extracted_name
                """,
                (agent_id, f"%{name_query}%"),
            )
            return fetchall_dicts(cur)


def assign_code_to_buyer(buyer_id: int, agent_id: int, buyer_name: str) -> str:
    """
    Generate and assign a WhatsApp code to a buyer.

    Args:
        buyer_id: The buyer profile ID
        agent_id: The agent's ID
        buyer_name: The buyer's name

    Returns:
        The assigned code
    """
    code = generate_entity_code(agent_id, buyer_name)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE buyer_profiles
                SET whatsapp_code = %s
                WHERE id = %s AND agent_id = %s
                RETURNING whatsapp_code
                """,
                (code, buyer_id, agent_id),
            )
            result = cur.fetchone()

    return code if result else None


def assign_code_to_lead(lead_id: int, agent_id: int, name: str) -> Optional[str]:
    """
    Generate and assign a WhatsApp code to a lead.

    Args:
        lead_id: The lead's ID
        agent_id: The agent's ID
        name: The lead's name

    Returns:
        The assigned code, or None on failure
    """
    code = generate_entity_code(agent_id, name)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE leads
                SET whatsapp_code = %s
                WHERE id = %s AND agent_id = %s
                RETURNING whatsapp_code
                """,
                (code, lead_id, agent_id),
            )
            result = cur.fetchone()

    return code if result else None


def backfill_buyer_codes(agent_id: int) -> Dict[str, str]:
    """
    Backfill WhatsApp codes for all buyers of an agent that don't have one.
    Called when an agent first connects their WhatsApp.

    Args:
        agent_id: The agent's ID

    Returns:
        Dict mapping buyer_id to assigned code
    """
    assignments = {}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name FROM buyer_profiles
                WHERE agent_id = %s AND whatsapp_code IS NULL
                ORDER BY created_at
                """,
                (agent_id,),
            )
            buyers = fetchall_dicts(cur)

    for buyer in buyers:
        code = assign_code_to_buyer(buyer["id"], agent_id, buyer["name"])
        if code:
            assignments[str(buyer["id"])] = code

    return assignments


def backfill_lead_codes(agent_id: int) -> Dict[str, str]:
    """
    Backfill WhatsApp codes for all leads of an agent that don't have one.
    Called when an agent connects their WhatsApp.

    Args:
        agent_id: The agent's ID

    Returns:
        Dict mapping lead_id to assigned code
    """
    assignments = {}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, extracted_name FROM leads
                WHERE agent_id = %s AND whatsapp_code IS NULL
                AND extracted_name IS NOT NULL
                ORDER BY created_at
                """,
                (agent_id,),
            )
            leads = fetchall_dicts(cur)

    for lead in leads:
        name = lead.get("extracted_name") or "Unknown"
        code = assign_code_to_lead(lead["id"], agent_id, name)
        if code:
            assignments[str(lead["id"])] = code

    return assignments


def resolve_entity_reference(agent_id: int, reference: str) -> List[Dict[str, Any]]:
    """
    Resolve an entity reference (code or name) across both buyers and leads.

    Each result includes an 'entity_type' field ("buyer" or "lead").

    Args:
        agent_id: The agent's ID
        reference: Could be "SC1" (code) or "Sarah" (name)

    Returns:
        List of matching entities (empty if none, multiple if ambiguous)
    """
    reference = reference.strip()

    # Check if it looks like a code (2 letters + numbers)
    if re.match(r"^[A-Za-z]{2}\d+$", reference):
        code = reference.upper()
        # Check buyers first
        buyer = get_buyer_by_code(agent_id, code)
        if buyer:
            buyer["entity_type"] = "buyer"
            return [buyer]
        # Check leads
        lead = get_lead_by_code(agent_id, code)
        if lead:
            lead["entity_type"] = "lead"
            return [lead]
        return []

    # Name search across both tables
    results = []
    buyers = get_buyers_by_name(agent_id, reference)
    for b in buyers:
        b["entity_type"] = "buyer"
        results.append(b)

    leads = get_leads_by_name(agent_id, reference)
    for l in leads:
        l["entity_type"] = "lead"
        # Normalize lead field names for display consistency
        l["name"] = l.get("extracted_name") or l.get("name") or "Unknown"
        l["code"] = l.get("whatsapp_code")
        results.append(l)

    return results


def resolve_buyer_reference(agent_id: int, reference: str) -> List[Dict[str, Any]]:
    """
    Resolve a buyer reference which could be a code or a name.
    Thin backward-compatible wrapper — only returns buyers.

    Args:
        agent_id: The agent's ID
        reference: Could be "SC1" (code) or "Sarah" (name)

    Returns:
        List of matching buyers (empty if none, multiple if ambiguous)
    """
    reference = reference.strip()

    # Check if it looks like a code (2 letters + numbers)
    if re.match(r"^[A-Za-z]{2}\d+$", reference):
        buyer = get_buyer_by_code(agent_id, reference.upper())
        return [buyer] if buyer else []

    # Otherwise treat as name search
    return get_buyers_by_name(agent_id, reference)


def get_all_entities(agent_id: int, limit: int = 15) -> List[Dict[str, Any]]:
    """
    Get combined list of buyers and leads with codes for an agent.

    Returns:
        List of entity dicts with 'entity_type', 'name', 'code', etc.
    """
    entities = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get buyers
            cur.execute(
                """
                SELECT id, name, email, phone, location, budget_min, budget_max,
                       whatsapp_code, created_at
                FROM buyer_profiles
                WHERE agent_id = %s AND whatsapp_code IS NOT NULL
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (agent_id, limit),
            )
            for row in fetchall_dicts(cur):
                row["entity_type"] = "buyer"
                row["code"] = row.get("whatsapp_code")
                budget_parts = []
                if row.get("budget_min"):
                    budget_parts.append(MessageBuilder_fmt_amount(row["budget_min"]))
                if row.get("budget_max"):
                    budget_parts.append(MessageBuilder_fmt_amount(row["budget_max"]))
                row["budget_display"] = "-".join(budget_parts) if budget_parts else ""
                entities.append(row)

            # Get leads
            cur.execute(
                """
                SELECT id, extracted_name, extracted_email, extracted_phone,
                       extracted_location, extracted_budget_min, extracted_budget_max,
                       whatsapp_code, created_at
                FROM leads
                WHERE agent_id = %s AND whatsapp_code IS NOT NULL
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (agent_id, limit),
            )
            for row in fetchall_dicts(cur):
                row["entity_type"] = "lead"
                row["name"] = row.get("extracted_name") or "Unknown"
                row["email"] = row.get("extracted_email")
                row["phone"] = row.get("extracted_phone")
                row["location"] = row.get("extracted_location")
                row["code"] = row.get("whatsapp_code")
                budget_parts = []
                if row.get("extracted_budget_min"):
                    budget_parts.append(MessageBuilder_fmt_amount(row["extracted_budget_min"]))
                if row.get("extracted_budget_max"):
                    budget_parts.append(MessageBuilder_fmt_amount(row["extracted_budget_max"]))
                row["budget_display"] = "-".join(budget_parts) if budget_parts else ""
                entities.append(row)

    # Sort by created_at desc
    entities.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    return entities[:limit]


def format_buyer_code_display(buyer: Dict[str, Any]) -> str:
    """
    Format a buyer's display name with code.

    Args:
        buyer: Buyer profile dict

    Returns:
        Formatted string like "Sarah Chen (SC1)"
    """
    name = buyer.get("name", "Unknown")
    code = buyer.get("whatsapp_code", "")

    if code:
        return f"{name} ({code})"
    return name


def _fmt_amount(val) -> str:
    """Format a dollar amount: 1000000->$1M, 640000->$640K."""
    if not val:
        return ""
    try:
        val = int(val)
    except (ValueError, TypeError):
        return str(val)
    if val >= 1_000_000:
        m = val / 1_000_000
        formatted = f"{m:.1f}".rstrip("0").rstrip(".")
        return f"${formatted}M"
    return f"${val // 1_000}K"


# Module-level alias to avoid circular import with MessageBuilder
MessageBuilder_fmt_amount = _fmt_amount
