"""
Buyer Code Generator for WhatsApp Identification

Generates unique short codes (e.g., SC1, MJ1) for each buyer profile
to enable unambiguous identification in WhatsApp conversations.

Code format: {First Initial}{Last Initial}{Number}
Examples: SC1 (Sarah Chen #1), SM1 (Sarah Miller #1), SC2 (Sam Carter #2)
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
    
    # Clean the name
    name = name.strip()
    
    # Split into parts
    parts = name.split()
    
    if len(parts) == 0:
        return "XX"
    elif len(parts) == 1:
        # Single name - use first two letters or duplicate first
        single = parts[0].upper()
        if len(single) >= 2:
            return single[0] + single[1]
        return single[0] + single[0]
    else:
        # Multiple parts - use first and last
        first_initial = parts[0][0].upper() if parts[0] else "X"
        last_initial = parts[-1][0].upper() if parts[-1] else "X"
        return first_initial + last_initial


def generate_buyer_code(agent_id: int, buyer_name: str) -> str:
    """
    Generate a unique buyer code for a buyer profile.
    
    Args:
        agent_id: The agent's ID (codes are unique per agent)
        buyer_name: The buyer's full name
        
    Returns:
        Unique code like "SC1", "SC2", "MJ1"
    """
    base = _extract_initials(buyer_name)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Find existing codes with the same base for this agent
            cur.execute(
                """
                SELECT whatsapp_code FROM buyer_profiles 
                WHERE agent_id = %s 
                AND whatsapp_code LIKE %s
                ORDER BY whatsapp_code
                """,
                (agent_id, f"{base}%")
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
                (agent_id, code)
            )
            row = fetchone_dict(cur)
            return row


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
            # Case-insensitive search on name
            cur.execute(
                """
                SELECT * FROM buyer_profiles 
                WHERE agent_id = %s 
                AND LOWER(name) LIKE %s
                ORDER BY name
                """,
                (agent_id, f"%{name_query}%")
            )
            rows = fetchall_dicts(cur)
            return rows


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
    code = generate_buyer_code(agent_id, buyer_name)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE buyer_profiles 
                SET whatsapp_code = %s 
                WHERE id = %s AND agent_id = %s
                RETURNING whatsapp_code
                """,
                (code, buyer_id, agent_id)
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
            # Get all buyers without codes
            cur.execute(
                """
                SELECT id, name FROM buyer_profiles 
                WHERE agent_id = %s AND whatsapp_code IS NULL
                ORDER BY created_at
                """,
                (agent_id,)
            )
            buyers = fetchall_dicts(cur)
    
    for buyer in buyers:
        code = assign_code_to_buyer(buyer['id'], agent_id, buyer['name'])
        if code:
            assignments[str(buyer['id'])] = code
    
    return assignments


def resolve_buyer_reference(agent_id: int, reference: str) -> List[Dict[str, Any]]:
    """
    Resolve a buyer reference which could be a code or a name.
    
    Args:
        agent_id: The agent's ID
        reference: Could be "SC1" (code) or "Sarah" (name)
        
    Returns:
        List of matching buyers (empty if none, multiple if ambiguous)
    """
    reference = reference.strip()
    
    # Check if it looks like a code (2 letters + numbers)
    if re.match(r'^[A-Za-z]{2}\d+$', reference):
        buyer = get_buyer_by_code(agent_id, reference.upper())
        return [buyer] if buyer else []
    
    # Otherwise treat as name search
    return get_buyers_by_name(agent_id, reference)


def format_buyer_code_display(buyer: Dict[str, Any]) -> str:
    """
    Format a buyer's display name with code.
    
    Args:
        buyer: Buyer profile dict
        
    Returns:
        Formatted string like "Sarah Chen (SC1)"
    """
    name = buyer.get('name', 'Unknown')
    code = buyer.get('whatsapp_code', '')
    
    if code:
        return f"{name} ({code})"
    return name
