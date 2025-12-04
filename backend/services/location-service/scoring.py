"""
Location Match Scoring and Flag Generation
Pure Python logic for buyer-centric location analysis
"""

import logging
from typing import List, Dict, Any
from models import (
    LocationAnalysis,
    BuyerLocationPrefs,
    LocationFlag,
    FlagLevel,
    FlagCategory,
    TrafficLevel,
    NoiseRisk,
    WalkabilityLabel
)

logger = logging.getLogger(__name__)


def calculate_location_match_score(
    analysis: LocationAnalysis,
    buyer_prefs: BuyerLocationPrefs
) -> int:
    """
    Calculate a 0-100 location match score based on buyer preferences

    Args:
        analysis: Location analysis data
        buyer_prefs: Buyer location preferences

    Returns:
        Integer score from 0-100
    """
    score = 100  # Start with perfect score, deduct for issues
    deductions = []

    # 1. Commute scoring (max -40 points)
    if analysis.commute and analysis.commute.drive_peak_mins:
        peak_mins = analysis.commute.drive_peak_mins
        max_mins = buyer_prefs.max_commute_mins

        if peak_mins > max_mins * 1.5:
            # Severely over max
            deduction = 40
            score -= deduction
            deductions.append(f"Commute {peak_mins}min >> max {max_mins}min (-{deduction})")
        elif peak_mins > max_mins * 1.2:
            # Moderately over max
            deduction = 25
            score -= deduction
            deductions.append(f"Commute {peak_mins}min > max {max_mins}min (-{deduction})")
        elif peak_mins > max_mins:
            # Slightly over max
            deduction = 10
            score -= deduction
            deductions.append(f"Commute {peak_mins}min slightly over {max_mins}min (-{deduction})")

    # 2. Quiet street preference (max -25 points)
    if buyer_prefs.prioritize_quiet_street:
        if analysis.street_context.traffic_level == TrafficLevel.HIGH:
            deduction = 25
            score -= deduction
            deductions.append(f"High traffic street (-{deduction})")
        elif analysis.street_context.traffic_level == TrafficLevel.MODERATE:
            deduction = 10
            score -= deduction
            deductions.append(f"Moderate traffic street (-{deduction})")

        if analysis.street_context.noise_risk == NoiseRisk.HIGH:
            deduction = 20
            score -= deduction
            deductions.append(f"High noise risk (-{deduction})")
        elif analysis.street_context.noise_risk == NoiseRisk.MODERATE:
            deduction = 8
            score -= deduction
            deductions.append(f"Moderate noise risk (-{deduction})")

    # 3. Walkability preference (max -20 points)
    if buyer_prefs.prioritize_walkability:
        if analysis.walkability.overall_walkability_label == WalkabilityLabel.LOW:
            deduction = 20
            score -= deduction
            deductions.append(f"Low walkability (-{deduction})")
        elif analysis.walkability.overall_walkability_label == WalkabilityLabel.MODERATE:
            deduction = 8
            score -= deduction
            deductions.append(f"Moderate walkability (-{deduction})")

        if not analysis.walkability.sidewalks_present:
            deduction = 10
            score -= deduction
            deductions.append(f"No sidewalks (-{deduction})")

    # 4. Family-friendly (max -15 points)
    if buyer_prefs.has_kids:
        if analysis.family_indicators.nearby_playgrounds_count == 0:
            deduction = 8
            score -= deduction
            deductions.append(f"No playgrounds nearby (-{deduction})")

        if analysis.family_indicators.nearby_parks_count == 0:
            deduction = 7
            score -= deduction
            deductions.append(f"No parks nearby (-{deduction})")

        if analysis.walkability.closest_playground_walk_mins and analysis.walkability.closest_playground_walk_mins > 20:
            deduction = 5
            score -= deduction
            deductions.append(f"Playground {analysis.walkability.closest_playground_walk_mins}min walk (-{deduction})")

    # Ensure score stays in 0-100 range
    score = max(0, min(100, score))

    logger.info(f"Location match score: {score}/100")
    if deductions:
        logger.info(f"Deductions: {', '.join(deductions)}")

    return score


def generate_location_flags(
    analysis: LocationAnalysis,
    buyer_prefs: BuyerLocationPrefs,
    match_score: int
) -> List[Dict[str, str]]:
    """
    Generate buyer-centric location flags (bullets for UI)

    Args:
        analysis: Location analysis data
        buyer_prefs: Buyer location preferences
        match_score: Calculated match score

    Returns:
        List of flag dictionaries with level, message, category
    """
    flags = []

    # Overall match summary flag
    if match_score >= 85:
        flags.append({
            "level": "green",
            "message": f"Excellent location match ({match_score}/100)",
            "category": "overall"
        })
    elif match_score >= 70:
        flags.append({
            "level": "green",
            "message": f"Good location match ({match_score}/100)",
            "category": "overall"
        })
    elif match_score >= 50:
        flags.append({
            "level": "yellow",
            "message": f"Fair location match ({match_score}/100)",
            "category": "overall"
        })
    else:
        flags.append({
            "level": "red",
            "message": f"Below requirements ({match_score}/100)",
            "category": "overall"
        })

    # Commute flags
    if analysis.commute and analysis.commute.drive_peak_mins:
        peak_mins = analysis.commute.drive_peak_mins
        max_mins = buyer_prefs.max_commute_mins

        if peak_mins > max_mins * 1.2:
            flags.append({
                "level": "red",
                "message": f"⚠️ Commute {peak_mins}min significantly exceeds your {max_mins}min max",
                "category": "commute"
            })
        elif peak_mins > max_mins:
            flags.append({
                "level": "yellow",
                "message": f"Commute {peak_mins}min slightly over your {max_mins}min max",
                "category": "commute"
            })
        else:
            flags.append({
                "level": "green",
                "message": f"✓ Commute {peak_mins}min within your {max_mins}min max",
                "category": "commute"
            })

        # Show off-peak comparison
        if analysis.commute.drive_offpeak_mins:
            diff = peak_mins - analysis.commute.drive_offpeak_mins
            if diff >= 10:
                flags.append({
                    "level": "yellow",
                    "message": f"Traffic adds {diff} minutes during peak hours",
                    "category": "commute"
                })

    # Street context flags
    if buyer_prefs.prioritize_quiet_street:
        if analysis.street_context.traffic_level == TrafficLevel.LOW and analysis.street_context.noise_risk == NoiseRisk.LOW:
            flags.append({
                "level": "green",
                "message": "✓ Quiet residential street (low traffic, low noise)",
                "category": "noise"
            })
        elif analysis.street_context.traffic_level == TrafficLevel.HIGH:
            flags.append({
                "level": "red",
                "message": "⚠️ High-traffic street (not aligned with quiet preference)",
                "category": "noise"
            })
        elif analysis.street_context.noise_risk == NoiseRisk.HIGH:
            flags.append({
                "level": "yellow",
                "message": "Moderate noise risk from nearby roads",
                "category": "noise"
            })

    if analysis.street_context.is_cul_de_sac:
        flags.append({
            "level": "green",
            "message": "✓ Cul-de-sac location (minimal through traffic)",
            "category": "noise"
        })

    # Walkability flags
    if buyer_prefs.prioritize_walkability:
        if analysis.walkability.overall_walkability_label == WalkabilityLabel.HIGH:
            flags.append({
                "level": "green",
                "message": "✓ Highly walkable area",
                "category": "walkability"
            })
        elif analysis.walkability.overall_walkability_label == WalkabilityLabel.LOW:
            flags.append({
                "level": "yellow",
                "message": "⚠️ Low walkability (car-dependent area)",
                "category": "walkability"
            })

        if not analysis.walkability.sidewalks_present:
            flags.append({
                "level": "yellow",
                "message": "No sidewalks on immediate street",
                "category": "walkability"
            })

    # Family-friendly flags
    if buyer_prefs.has_kids:
        playground_count = analysis.family_indicators.nearby_playgrounds_count
        park_count = analysis.family_indicators.nearby_parks_count

        if playground_count >= 3 and park_count >= 2:
            flags.append({
                "level": "green",
                "message": f"✓ Family-friendly area ({playground_count} playgrounds, {park_count} parks within 1 mile)",
                "category": "family_friendly"
            })
        elif playground_count == 0:
            flags.append({
                "level": "yellow",
                "message": "⚠️ No playgrounds within 1 mile",
                "category": "family_friendly"
            })

        # School proximity
        if analysis.family_indicators.nearby_schools_count >= 3:
            flags.append({
                "level": "green",
                "message": f"✓ {analysis.family_indicators.nearby_schools_count} schools within 1 mile",
                "category": "family_friendly"
            })

    # Amenity flags
    grocery_mins = analysis.amenities.grocery_drive_mins
    pharmacy_mins = analysis.amenities.pharmacy_drive_mins

    if grocery_mins and grocery_mins <= 5:
        flags.append({
            "level": "green",
            "message": f"✓ Grocery store {grocery_mins}min drive",
            "category": "amenities"
        })
    elif grocery_mins and grocery_mins > 15:
        flags.append({
            "level": "yellow",
            "message": f"Grocery store {grocery_mins}min drive (far)",
            "category": "amenities"
        })

    if pharmacy_mins and pharmacy_mins <= 5:
        flags.append({
            "level": "green",
            "message": f"✓ Pharmacy {pharmacy_mins}min drive",
            "category": "amenities"
        })

    return flags


def enhance_analysis_with_scoring(
    analysis: LocationAnalysis,
    buyer_prefs: BuyerLocationPrefs
) -> Dict[str, Any]:
    """
    Enhance location analysis with match score and buyer-centric flags

    Args:
        analysis: Raw location analysis from Gemini + Maps
        buyer_prefs: Buyer location preferences

    Returns:
        Enhanced analysis dict with location_match_score and location_flags
    """
    # Calculate match score
    match_score = calculate_location_match_score(analysis, buyer_prefs)

    # Generate buyer-centric flags
    flags = generate_location_flags(analysis, buyer_prefs, match_score)

    # Return enhanced structure
    return {
        "location_summary": analysis.model_dump(mode="json"),  # Full structured data (JSON-serializable)
        "location_match_score": match_score,  # 0-100 score
        "location_flags": flags  # Buyer-centric bullets
    }
