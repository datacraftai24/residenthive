"""
Profile Normalizer - Extract structured location signals from buyer profile text.

Extracts signals from mustHaveFeatures, lifestyleDrivers, dealbreakers arrays
and stores them in location_preferences JSONB column (no schema migration needed).

Trust Contract:
- Confidence >= 0.9: Explicit, unambiguous phrase ("east-facing house")
- Confidence 0.7-0.89: Implied but clear ("morning sun" -> east)
- Confidence 0.5-0.69: Weak inference
- Confidence < 0.5: Don't extract - too ambiguous
"""

import re
from datetime import datetime
from typing import Optional, List


DIRECTIONS = ["east", "west", "south", "north"]


def normalize_location_signals(profile: dict) -> dict:
    """
    Parse mustHaveFeatures, lifestyleDrivers, dealbreakers into structured signals.
    Returns versioned JSONB to store in location_preferences column.

    Args:
        profile: Dict with mustHaveFeatures, lifestyleDrivers, dealbreakers arrays

    Returns:
        Dict with version=2, signals array, and extracted_at timestamp
    """
    must_haves = profile.get("mustHaveFeatures") or []
    nice_to_haves = profile.get("niceToHaves") or []
    lifestyle = profile.get("lifestyleDrivers") or []
    dealbreakers = profile.get("dealbreakers") or []

    signals = []

    # 1. Quiet street signal
    quiet_signal = extract_quiet_street_signal(must_haves, dealbreakers)
    if quiet_signal:
        signals.append(quiet_signal)

    # 2. Orientation signal - check must_haves, nice_to_haves, and dealbreakers
    orientation_signal = extract_orientation_signal(must_haves, nice_to_haves, dealbreakers)
    if orientation_signal:
        signals.append(orientation_signal)

    # 3. Commute/work signal
    commute_signal = extract_commute_signal(lifestyle)
    if commute_signal:
        signals.append(commute_signal)

    # 4. Kids/family signal
    kids_signal = extract_kids_signal(must_haves, lifestyle)
    if kids_signal:
        signals.append(kids_signal)

    # 5. Walkability signal
    walk_signal = extract_walkability_signal(must_haves, lifestyle)
    if walk_signal:
        signals.append(walk_signal)

    return {
        "version": 2,
        "signals": signals,
        "extracted_at": datetime.utcnow().isoformat()
    }


def extract_quiet_street_signal(must_haves: List[str], dealbreakers: List[str]) -> Optional[dict]:
    """
    Extract quiet street preference signal.

    "quiet residential street" -> {code: "quiet_street", strength: "must", confidence: 0.9, evidence: [...]}
    "busy roads" dealbreaker -> {code: "quiet_street", strength: "must", confidence: 0.95, evidence: [...]}
    """
    quiet_patterns = [
        ("quiet", 0.9),
        ("not busy", 0.85),
        ("residential street", 0.8),
        ("cul-de-sac", 0.95),
        ("low traffic", 0.9),
        ("dead end", 0.9),
    ]

    busy_patterns = [
        ("busy road", 0.95),
        ("heavy traffic", 0.95),
        ("main road", 0.85),
        ("highway", 0.9),
        ("high traffic", 0.95),
    ]

    evidence = []
    max_confidence = 0.0

    # Check must-haves for quiet indicators
    for item in must_haves:
        item_lower = item.lower()
        for pattern, confidence in quiet_patterns:
            if pattern in item_lower:
                evidence.append(item)
                max_confidence = max(max_confidence, confidence)
                break

    # Check dealbreakers for busy road indicators
    for item in dealbreakers:
        item_lower = item.lower()
        for pattern, confidence in busy_patterns:
            if pattern in item_lower:
                evidence.append(f"Dealbreaker: {item}")
                max_confidence = max(max_confidence, confidence)
                break

    if evidence and max_confidence >= 0.5:
        return {
            "code": "quiet_street",
            "strength": "must",
            "confidence": max_confidence,
            "evidence": evidence
        }

    return None


def extract_orientation_signal(must_haves: List[str], nice_to_haves: List[str], dealbreakers: List[str]) -> Optional[dict]:
    """
    Extract orientation preference signal with proper confidence scoring.

    SIMPLE THREE-STEP PARSER:
    A) Extract "ok/fine/acceptable" directions first (negates avoid)
    B) Extract AVOID from explicit patterns only
    C) Extract WANT from explicit patterns

    CRITICAL: Don't hallucinate "avoid" from ambiguous phrases.
    "prefer east, west is ok" -> want=east, avoid=None (NOT avoid=west)
    """
    want = None
    avoid = None
    want_confidence = 0.0
    avoid_confidence = 0.0
    evidence = []
    ok_directions = set()  # Directions marked as "ok/fine/acceptable"

    all_items = (must_haves or []) + (nice_to_haves or []) + (dealbreakers or [])

    for item in all_items:
        item_lower = item.lower()

        # STEP A: Extract "ok/fine/acceptable" directions first (negates avoid)
        ok_match = re.search(r"(\w+)(?:-facing)?\s+(?:is\s+)?(?:ok|fine|acceptable|works)", item_lower)
        if ok_match:
            dir_match = ok_match.group(1)
            if dir_match in DIRECTIONS:
                ok_directions.add(dir_match)

        # STEP B: Extract AVOID from explicit patterns only
        avoid_patterns = [
            (r"avoid\s+(\w+)-facing", 0.95),
            (r"no\s+(\w+)-facing", 0.9),
            (r"not\s+(\w+)-facing", 0.85),
            (r"don't want\s+(\w+)-facing", 0.9),
            (r"avoid\s+(\w+)\s+facing", 0.95),
        ]
        for pattern, conf in avoid_patterns:
            match = re.search(pattern, item_lower)
            if match and match.group(1) in DIRECTIONS:
                candidate = match.group(1)
                if candidate not in ok_directions:  # Respect "X is ok"
                    avoid = candidate
                    avoid_confidence = max(avoid_confidence, conf)
                    if item not in evidence:
                        evidence.append(item)

        # STEP C: Extract WANT from explicit patterns
        # Only reject if THIS specific direction is in an avoid context
        want_patterns = [
            (r"(\w+)-facing\s+(?:house|home|property)", 0.95),  # "east-facing house"
            (r"faces?\s+(\w+)", 0.9),                           # "faces east"
            (r"prefer\s+(\w+)-facing", 0.9),                    # "prefer east-facing"
            (r"prefer\s+(\w+)\s+facing", 0.9),                  # "prefer east facing"
            (r"want\s+(\w+)-facing", 0.9),                      # "want east-facing"
            (r"(\w+)-facing", 0.85),                            # "east-facing" alone
        ]
        for pattern, conf in want_patterns:
            match = re.search(pattern, item_lower)
            if match and match.group(1) in DIRECTIONS:
                direction = match.group(1)
                # Only reject if THIS specific direction is in an avoid context
                # e.g., "avoid west-facing" should block west, not east
                avoid_this_direction = re.search(
                    rf"(?:avoid|don't want|no|not)\s+{direction}(?:-|\s)?facing",
                    item_lower
                )
                if not avoid_this_direction:
                    want = direction
                    want_confidence = max(want_confidence, conf)
                    if item not in evidence:
                        evidence.append(item)

        # Implied patterns (lower confidence)
        implied_patterns = [
            (r"morning\s+sun", "east", 0.7),
            (r"afternoon\s+sun", "west", 0.7),
            (r"lots of morning", "east", 0.65),
        ]
        for pattern, direction, conf in implied_patterns:
            if re.search(pattern, item_lower):
                if want is None:  # Don't override explicit
                    want = direction
                    want_confidence = max(want_confidence, conf)
                    if item not in evidence:
                        evidence.append(item)

    # CONFIDENCE GATE: <0.5 = don't extract
    final_confidence = max(want_confidence, avoid_confidence)
    if final_confidence < 0.5:
        return None

    if want or avoid:
        return {
            "code": "orientation",
            "want": want,
            "avoid": avoid,
            "confidence": final_confidence,
            "evidence": evidence
        }

    return None


def extract_commute_signal(lifestyle: List[str]) -> Optional[dict]:
    """
    Extract commute/work location preference signal.

    "reasonable drive to UMass Memorial" -> {code: "commute", work_text: "UMass Memorial", max_mins: 30, ...}
    "within 20 minutes to downtown" -> {code: "commute", work_text: "downtown", max_mins: 20, ...}
    """
    commute_patterns = [
        r"(?:reasonable |short |easy )?(?:drive|commute) to (.+?)(?:\s*,|\s*$)",
        r"work (?:at|near) (.+?)(?:\s*,|\s*$)",
        r"close to (.+?) (?:for work|office)",
        r"commute to (.+?)(?:\s*,|\s*$)",
        r"within \d+\s*(?:min|minute)s? (?:to|of) (.+?)(?:\s*,|\s*$)",
    ]

    for item in (lifestyle or []):
        item_lower = item.lower()
        for pattern in commute_patterns:
            match = re.search(pattern, item_lower)
            if match:
                work_text = match.group(1).strip()
                # Clean up work_text
                work_text = re.sub(r'\s+', ' ', work_text)

                # Extract max time if mentioned (e.g., "within 20 minutes")
                time_match = re.search(r"(\d+)\s*(?:min|minute)", item_lower)
                max_mins = int(time_match.group(1)) if time_match else 30  # Default 30 min

                return {
                    "code": "commute",
                    "work_text": work_text,
                    "max_mins": max_mins,
                    "confidence": 0.8,
                    "evidence": [item]
                }

    return None


def extract_kids_signal(must_haves: List[str], lifestyle: List[str]) -> Optional[dict]:
    """
    Extract has_kids signal from school/family related phrases.

    "good elementary schools" -> {code: "has_kids", confidence: 0.9, evidence: [...]}
    """
    kid_patterns = [
        ("elementary school", 0.95),
        ("school district", 0.9),
        ("schools", 0.85),
        ("kids", 0.95),
        ("children", 0.95),
        ("family", 0.7),
        ("playground", 0.9),
        ("daycare", 0.95),
    ]

    evidence = []
    max_confidence = 0.0

    for item in (must_haves or []) + (lifestyle or []):
        item_lower = item.lower()
        for pattern, confidence in kid_patterns:
            if pattern in item_lower:
                evidence.append(item)
                max_confidence = max(max_confidence, confidence)
                break

    if evidence and max_confidence >= 0.5:
        return {
            "code": "has_kids",
            "confidence": max_confidence,
            "evidence": evidence
        }

    return None


def extract_walkability_signal(must_haves: List[str], lifestyle: List[str]) -> Optional[dict]:
    """
    Extract walkability preference signal.

    "walkable neighborhood" in must_haves -> {code: "walkability", strength: "must", ...}
    "walking distance to shops" in lifestyle -> {code: "walkability", strength: "prefer", ...}
    """
    walk_patterns = [
        ("walkable", 0.95),
        ("walking distance", 0.9),
        ("sidewalk", 0.8),
        ("walk to", 0.85),
        ("pedestrian", 0.85),
    ]

    # Check must-haves first (stronger signal)
    for item in (must_haves or []):
        item_lower = item.lower()
        for pattern, confidence in walk_patterns:
            if pattern in item_lower:
                return {
                    "code": "walkability",
                    "strength": "must",
                    "confidence": confidence,
                    "evidence": [item]
                }

    # Check lifestyle (weaker signal)
    for item in (lifestyle or []):
        item_lower = item.lower()
        for pattern, confidence in walk_patterns:
            if pattern in item_lower:
                return {
                    "code": "walkability",
                    "strength": "prefer",
                    "confidence": confidence,
                    "evidence": [item]
                }

    return None
