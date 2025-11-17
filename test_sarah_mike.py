#!/usr/bin/env python3
"""
Test script for Sarah & Mike buyer profile extraction.
Tests all prompt improvements and vision checklist generation.
"""

import requests
import json
from datetime import datetime

# Test profile from original specification
TEST_PROFILE = """Sarah & Mike are a young couple looking for their first home in Austin.
They're expecting a baby in 6 months and have a dog.
Budget is around 700K but they can stretch to 735K for the right property.
Need at least 4 bedrooms (one for baby, one for office, one for guests).
Would love an updated kitchen and yard for the dog.
Must have off-street parking.
Want a quiet, family-friendly neighborhood with good schools nearby.
Can't be on a busy road.
They're hoping to move before the baby arrives."""

BASE_URL = "http://localhost:8001"

def test_extraction():
    """Test NLP extraction with Sarah & Mike profile."""

    print("=" * 80)
    print("TESTING SARAH & MIKE PROFILE EXTRACTION")
    print("=" * 80)
    print(f"\nTimestamp: {datetime.now().isoformat()}")
    print(f"\nInput Text:\n{TEST_PROFILE}\n")

    # Call extraction endpoint
    response = requests.post(
        f"{BASE_URL}/api/nlp/extract",
        json={"rawInput": TEST_PROFILE}
    )

    if response.status_code != 200:
        print(f"❌ ERROR: {response.status_code}")
        print(response.text)
        return None

    result = response.json()

    print("=" * 80)
    print("EXTRACTION RESULTS")
    print("=" * 80)

    # Basic Info
    print(f"\n📋 BASIC INFO:")
    print(f"  Name: {result.get('name')}")
    print(f"  Email: {result.get('email')}")
    print(f"  Phone: {result.get('phone')}")
    print(f"  Location: {result.get('location')}")

    # Budget
    print(f"\n💰 BUDGET:")
    print(f"  Budget: {result.get('budget')}")
    print(f"  Budget Min: ${result.get('budgetMin'):,}")
    print(f"  Budget Max: ${result.get('budgetMax'):,}")

    # Requirements
    print(f"\n🏠 REQUIREMENTS:")
    print(f"  Home Type: {result.get('homeType')}")
    print(f"  Bedrooms: {result.get('bedrooms')}")
    print(f"  Max Bedrooms: {result.get('maxBedrooms')}")
    print(f"  Bathrooms: {result.get('bathrooms')}")

    # Must-Haves
    print(f"\n⭐ MUST-HAVES ({len(result.get('mustHaveFeatures', []))}):")
    for feature in result.get('mustHaveFeatures', []):
        print(f"  • {feature}")

    # Nice-to-Haves
    print(f"\n✨ NICE-TO-HAVES ({len(result.get('niceToHaves', []))}):")
    for feature in result.get('niceToHaves', []):
        print(f"  • {feature}")

    # Lifestyle Drivers
    print(f"\n🌳 LIFESTYLE PRIORITIES ({len(result.get('lifestyleDrivers', []))}):")
    for driver in result.get('lifestyleDrivers', []):
        print(f"  • {driver}")

    # Dealbreakers
    print(f"\n🚫 DEALBREAKERS ({len(result.get('dealbreakers', []))}):")
    for dealbreaker in result.get('dealbreakers', []):
        print(f"  • {dealbreaker}")

    # AI Summary
    print(f"\n🤖 AI SUMMARY:")
    print(f"  {result.get('aiSummary')}")

    # Decision Drivers
    print(f"\n🎯 DECISION DRIVERS ({len(result.get('decisionDrivers', []))}):")
    for driver in result.get('decisionDrivers', []):
        print(f"  • {driver}")

    # Constraints
    print(f"\n⚠️ CONSTRAINTS ({len(result.get('constraints', []))}):")
    for constraint in result.get('constraints', []):
        print(f"  • {constraint}")

    # Flexibility
    print(f"\n🔄 FLEXIBILITY:")
    print(f"  Budget: {result.get('budgetFlexibility')}%")
    print(f"  Location: {result.get('locationFlexibility')}%")
    print(f"  Timing: {result.get('timingFlexibility')}%")

    if result.get('flexibilityExplanations'):
        print(f"\n  Explanations:")
        for key, value in result.get('flexibilityExplanations', {}).items():
            print(f"    {key}: {value}")

    # Vision Checklist
    print(f"\n📷 VISION CHECKLIST:")
    vision = result.get('visionChecklist', {})

    if vision.get('structural'):
        print(f"\n  🏠 Structural ({len(vision.get('structural', []))}):")
        for item in vision.get('structural', []):
            print(f"    • {item}")

    if vision.get('lifestyle'):
        print(f"\n  🌳 Lifestyle ({len(vision.get('lifestyle', []))}):")
        for item in vision.get('lifestyle', []):
            print(f"    • {item}")

    if vision.get('dealbreakers'):
        print(f"\n  🚫 Dealbreakers ({len(vision.get('dealbreakers', []))}):")
        for item in vision.get('dealbreakers', []):
            print(f"    ! {item}")

    if vision.get('optional'):
        print(f"\n  ✨ Optional ({len(vision.get('optional', []))}):")
        for item in vision.get('optional', []):
            print(f"    + {item}")

    # Metadata
    print(f"\n📊 METADATA:")
    print(f"  Input Method: {result.get('inputMethod')}")
    print(f"  NLP Confidence: {result.get('nlpConfidence')}%")
    print(f"  Priority Score: {result.get('priorityScore')}")

    print("\n" + "=" * 80)
    print("VALIDATION CHECKS")
    print("=" * 80)

    # Check for duplicates
    all_features = []
    all_features.extend(result.get('mustHaveFeatures', []))
    all_features.extend(result.get('niceToHaves', []))
    all_features.extend(result.get('lifestyleDrivers', []))

    # Normalize for comparison
    normalized = [f.lower().strip() for f in all_features]
    duplicates = len(normalized) - len(set(normalized))

    if duplicates == 0:
        print("✅ No duplicates found across categories")
    else:
        print(f"❌ Found {duplicates} duplicate(s)")

    # Check lifestyle doesn't contain structural features
    lifestyle_structural_keywords = ['bedroom', 'bathroom', 'kitchen', 'garage', 'parking', 'yard', 'room']
    lifestyle_issues = []
    for driver in result.get('lifestyleDrivers', []):
        for keyword in lifestyle_structural_keywords:
            if keyword in driver.lower():
                lifestyle_issues.append(f"'{driver}' contains structural keyword '{keyword}'")

    if not lifestyle_issues:
        print("✅ Lifestyle priorities contain no structural features")
    else:
        print(f"❌ Lifestyle contains structural features:")
        for issue in lifestyle_issues:
            print(f"   {issue}")

    # Check decision drivers are motivations not features
    decision_feature_keywords = ['bedroom', 'bathroom', 'kitchen', 'garage', 'parking']
    decision_issues = []
    for driver in result.get('decisionDrivers', []):
        for keyword in decision_feature_keywords:
            if keyword in driver.lower():
                decision_issues.append(f"'{driver}' mentions feature '{keyword}'")

    if not decision_issues:
        print("✅ Decision drivers are motivations (not features)")
    else:
        print(f"⚠️ Some decision drivers mention specific features:")
        for issue in decision_issues:
            print(f"   {issue}")

    # Check AI summary mentions key context
    summary = result.get('aiSummary', '').lower()
    context_checks = {
        'baby/expecting': any(word in summary for word in ['baby', 'expecting', 'pregnant']),
        'dog': 'dog' in summary,
        'timeline': any(word in summary for word in ['6 months', 'timeline', 'move', 'urgency']),
        'budget stretch': any(word in summary for word in ['stretch', 'flexible', 'can go up'])
    }

    print("\n✅ AI Summary context checks:")
    for key, found in context_checks.items():
        status = "✓" if found else "✗"
        print(f"   {status} {key}")

    # Check vision checklist is populated
    total_vision_items = sum(len(vision.get(cat, [])) for cat in ['structural', 'lifestyle', 'dealbreakers', 'optional'])
    if total_vision_items > 0:
        print(f"✅ Vision checklist generated ({total_vision_items} total items)")
    else:
        print("❌ Vision checklist is empty")

    # Save full JSON
    output_file = f"/Users/piyushtiwari/residenthive/sarah_mike_result_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\n💾 Full JSON saved to: {output_file}")
    print("=" * 80)

    return result

if __name__ == "__main__":
    try:
        result = test_extraction()
        if result:
            print("\n✅ Test completed successfully!")
        else:
            print("\n❌ Test failed!")
    except Exception as e:
        print(f"\n❌ Exception: {e}")
        import traceback
        traceback.print_exc()
