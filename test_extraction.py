#!/usr/bin/env python3
"""
Test script for profile extraction - shows complete output including vision checklist
"""

import requests
import json
import sys
from datetime import datetime

# Emily & Jason Carter profile
EMILY_JASON_PROFILE = """We are working with buyers Emily and Jason Carter. They are looking for a single-family home in Worcester, MA or nearby suburbs like Shrewsbury or Millbury. Their budget is $450,000–$650,000, but they can stretch up to $700,000 for a move-in-ready home with great schools and a safe neighborhood. They need at least 3 bedrooms and 2 full bathrooms. They have two young kids (ages 5 and 8) and a medium-sized dog, which makes outdoor space a priority.

Must-haves: 3+ bedrooms, 2+ full bathrooms, off-street parking (driveway or garage), outdoor space suitable for kids and the dog (yard or fenced area), and a safe, family-friendly neighborhood.

Nice-to-haves: an updated kitchen, hardwood floors, a finished basement or bonus room that can be used as a playroom/home office, a quiet street not on a busy road, and walking distance to a park or playground.

Dealbreakers: homes directly on very busy roads, homes with visible power lines in the yard, major structural issues (foundation, water damage), or properties requiring heavy renovation.

They are open to minor cosmetic updates such as paint or flooring, but not major repairs. Their ideal timeline to purchase is within the next 3–6 months."""

BASE_URL = "http://localhost:8001"

def print_section(title, char="="):
    """Print a section header"""
    print(f"\n{char * 80}")
    print(f"{title}")
    print(f"{char * 80}\n")

def test_extraction(input_text=None):
    """Test profile extraction and display results"""

    if input_text is None:
        input_text = EMILY_JASON_PROFILE

    print_section("PROFILE EXTRACTION TEST", "=")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"\nInput Text (first 200 chars):\n{input_text[:200]}...\n")

    # Call extraction endpoint
    print("Calling extraction API...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/extract-profile",
            json={"input": input_text},
            timeout=60
        )

        if response.status_code != 200:
            print(f"❌ ERROR: HTTP {response.status_code}")
            print(response.text)
            return None

    except Exception as e:
        print(f"❌ CONNECTION ERROR: {e}")
        print("\nMake sure the backend is running on http://localhost:8001")
        return None

    result = response.json()

    # Save full JSON
    output_file = f"/Users/piyushtiwari/residenthive/extraction_result_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(result, f, indent=2)
    print(f"✅ Full JSON saved to: {output_file}\n")

    print_section("BASIC INFORMATION", "-")
    print(f"Name: {result.get('name')}")
    print(f"Email: {result.get('email')}")
    print(f"Phone: {result.get('phone')}")
    print(f"Location: {result.get('location')}")
    print(f"Budget: {result.get('budget')}")
    print(f"Budget Min: ${result.get('budgetMin'):,}" if result.get('budgetMin') else "Budget Min: None")
    print(f"Budget Max: ${result.get('budgetMax'):,}" if result.get('budgetMax') else "Budget Max: None")
    print(f"Home Type: {result.get('homeType')}")
    print(f"Bedrooms: {result.get('bedrooms')}")
    print(f"Max Bedrooms: {result.get('maxBedrooms')}")
    print(f"Bathrooms: {result.get('bathrooms')}")

    print_section("MUST-HAVES (Non-negotiable)", "-")
    must_haves = result.get('mustHaveFeatures', [])
    if must_haves:
        for i, feature in enumerate(must_haves, 1):
            print(f"  {i}. {feature}")
    else:
        print("  (none)")

    print_section("NICE-TO-HAVES (Preferred but flexible)", "-")
    nice_to_haves = result.get('niceToHaves', [])
    if nice_to_haves:
        for i, feature in enumerate(nice_to_haves, 1):
            print(f"  {i}. {feature}")
    else:
        print("  (none)")

    print_section("LIFESTYLE PRIORITIES (Neighborhood/Community/Family)", "-")
    lifestyle = result.get('lifestyleDrivers', [])
    if lifestyle:
        for i, driver in enumerate(lifestyle, 1):
            print(f"  {i}. {driver}")
    else:
        print("  (none)")

    print_section("DEALBREAKERS (Absolute no-gos)", "-")
    dealbreakers = result.get('dealbreakers', [])
    if dealbreakers:
        for i, dealbreaker in enumerate(dealbreakers, 1):
            print(f"  {i}. {dealbreaker}")
    else:
        print("  (none)")

    print_section("AI INSIGHTS", "-")

    ai_summary = result.get('aiSummary', 'Not available')
    print(f"AI Summary:\n  {ai_summary}\n")

    decision_drivers = result.get('decisionDrivers', [])
    print(f"Decision Drivers ({len(decision_drivers)}):")
    if decision_drivers:
        for i, driver in enumerate(decision_drivers, 1):
            print(f"  {i}. {driver}")
    else:
        print("  (none)")

    constraints = result.get('constraints', [])
    print(f"\nKey Constraints ({len(constraints)}):")
    if constraints:
        for i, constraint in enumerate(constraints, 1):
            print(f"  {i}. {constraint}")
    else:
        print("  (none)")

    print_section("FLEXIBILITY", "-")
    print(f"Budget Flexibility: {result.get('budgetFlexibility')}%")
    print(f"Location Flexibility: {result.get('locationFlexibility')}%")
    print(f"Timing Flexibility: {result.get('timingFlexibility')}%")

    flex_explanations = result.get('flexibilityExplanations', {})
    if flex_explanations and any(flex_explanations.values()):
        print("\nFlexibility Explanations:")
        if flex_explanations.get('budget'):
            print(f"  Budget: {flex_explanations['budget']}")
        if flex_explanations.get('location'):
            print(f"  Location: {flex_explanations['location']}")
        if flex_explanations.get('timing'):
            print(f"  Timing: {flex_explanations['timing']}")
    else:
        print("\n⚠️  Flexibility explanations NOT generated (empty or missing)")

    print_section("VISION CHECKLIST (AI Photo Requirements)", "-")
    vision = result.get('visionChecklist', {})

    if vision and any(vision.values()):
        structural = vision.get('structural', [])
        if structural:
            print(f"\n🏠 Structural ({len(structural)}):")
            for item in structural:
                print(f"  • {item}")

        lifestyle_v = vision.get('lifestyle', [])
        if lifestyle_v:
            print(f"\n🌳 Lifestyle ({len(lifestyle_v)}):")
            for item in lifestyle_v:
                print(f"  • {item}")

        dealbreakers_v = vision.get('dealbreakers', [])
        if dealbreakers_v:
            print(f"\n🚫 Dealbreakers ({len(dealbreakers_v)}):")
            for item in dealbreakers_v:
                print(f"  ! {item}")

        optional = vision.get('optional', [])
        if optional:
            print(f"\n✨ Optional ({len(optional)}):")
            for item in optional:
                print(f"  + {item}")
    else:
        print("⚠️  Vision checklist NOT generated (empty or missing)")

    print_section("METADATA", "-")
    print(f"Input Method: {result.get('inputMethod')}")
    print(f"NLP Confidence: {result.get('nlpConfidence')}%")
    print(f"Priority Score: {result.get('priorityScore')}")

    print_section("VALIDATION SUMMARY", "=")

    total_features = len(must_haves) + len(nice_to_haves) + len(lifestyle)
    print(f"✅ Total features extracted: {total_features}")
    print(f"   - Must-Haves: {len(must_haves)}")
    print(f"   - Nice-to-Haves: {len(nice_to_haves)}")
    print(f"   - Lifestyle: {len(lifestyle)}")
    print(f"   - Dealbreakers: {len(dealbreakers)}")

    # Check AI insights
    if ai_summary and ai_summary != "AI summary not available yet.":
        print(f"✅ AI Summary: Generated ({len(ai_summary)} chars)")
    else:
        print(f"❌ AI Summary: NOT generated")

    if decision_drivers:
        print(f"✅ Decision Drivers: {len(decision_drivers)} items")
    else:
        print(f"❌ Decision Drivers: NOT generated")

    if constraints:
        print(f"✅ Constraints: {len(constraints)} items")
    else:
        print(f"❌ Constraints: NOT generated")

    # Check flexibility explanations
    if flex_explanations and any(flex_explanations.values()):
        print(f"✅ Flexibility Explanations: Generated")
    else:
        print(f"❌ Flexibility Explanations: NOT generated")

    # Check vision checklist
    if vision and any(vision.values()):
        total_vision = sum(len(vision.get(k, [])) for k in ['structural', 'lifestyle', 'dealbreakers', 'optional'])
        print(f"✅ Vision Checklist: {total_vision} items across 4 categories")
    else:
        print(f"❌ Vision Checklist: NOT generated")

    print(f"\n{'=' * 80}\n")

    return result

if __name__ == "__main__":
    # Check if custom input provided
    if len(sys.argv) > 1:
        custom_input = " ".join(sys.argv[1:])
        print(f"Using custom input: {custom_input[:100]}...\n")
        result = test_extraction(custom_input)
    else:
        print("Using Emily & Jason Carter profile\n")
        result = test_extraction()

    if result:
        print("✅ Test completed successfully!")
        sys.exit(0)
    else:
        print("❌ Test failed!")
        sys.exit(1)
