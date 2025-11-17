#!/usr/bin/env python3
"""
Test script to check what happens when we try to save an extracted profile.
This simulates what the UI does when the "Save Profile" button is clicked.
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8001"

# Profile data from successful extraction
EXTRACTED_PROFILE = {
    "name": "Test Buyer",
    "email": "test@example.com",
    "location": "Worcester, MA",
    "budget": "$450K - $650K",
    "budgetMin": 450000,
    "budgetMax": 700000,
    "homeType": "single-family",
    "bedrooms": 3,
    "maxBedrooms": None,
    "bathrooms": "2",
    "mustHaveFeatures": [
        "3+ bedrooms",
        "2+ full bathrooms",
        "off-street parking"
    ],
    "niceToHaves": [
        "updated kitchen",
        "hardwood floors"
    ],
    "dealbreakers": [
        "homes directly on very busy roads"
    ],
    "preferredAreas": ["Worcester, MA"],
    "lifestyleDrivers": [
        "great schools",
        "safe neighborhood"
    ],
    "specialNeeds": [],
    "budgetFlexibility": 50,
    "locationFlexibility": 50,
    "timingFlexibility": 50,
    "emotionalContext": "open to minor cosmetic updates",
    "voiceTranscript": None,
    "inferredTags": [],
    "emotionalTone": None,
    "priorityScore": 50,
    "aiSummary": "Test buyer looking for a family-friendly home in Worcester, MA.",
    "decisionDrivers": [
        "Safe neighborhood",
        "Good schools",
        "Outdoor space"
    ],
    "constraints": [
        "Homes not on very busy roads",
        "No visible power lines",
        "No major structural issues"
    ],
    "flexibilityExplanations": {
        "budget": "Their budget is somewhat flexible, with a maximum of $700,000.",
        "location": "They are somewhat flexible on location.",
        "timing": "Their timing is somewhat flexible."
    },
    "visionChecklist": {
        "structural": [
            "3+ bedrooms",
            "2+ full bathrooms",
            "off-street parking"
        ],
        "lifestyle": [
            "quiet street",
            "family-friendly neighborhood"
        ],
        "dealbreakers": [
            "homes directly on very busy roads",
            "visible power lines in the yard"
        ],
        "optional": [
            "natural light",
            "modern finishes"
        ]
    },
    "rawInput": "Budget: $450K - $650K, Home Type: single-family, 3 bedrooms, 2 bathrooms"
}

def test_save_profile():
    """Test saving a profile via the API"""

    print("=" * 80)
    print("TESTING PROFILE SAVE")
    print("=" * 80)
    print(f"\nTimestamp: {datetime.now().isoformat()}\n")

    # Call save endpoint
    print("Calling POST /api/buyer-profiles...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/buyer-profiles",
            json=EXTRACTED_PROFILE,
            timeout=10
        )

        print(f"Response status: {response.status_code}")

        if response.status_code != 200:
            print(f"\n❌ ERROR: HTTP {response.status_code}")
            print(f"Response text: {response.text}")

            try:
                error_data = response.json()
                print(f"\nError JSON:")
                print(json.dumps(error_data, indent=2))
            except:
                pass

            return None

        result = response.json()
        print(f"\n✅ SUCCESS: Profile saved with ID {result.get('id')}")
        print(f"\nSaved profile data:")
        print(json.dumps(result, indent=2))

        return result

    except Exception as e:
        print(f"❌ CONNECTION ERROR: {e}")
        print("\nMake sure the backend is running on http://localhost:8001")
        return None

if __name__ == "__main__":
    result = test_save_profile()

    if result:
        print("\n" + "=" * 80)
        print("✅ Test completed successfully!")
        print("=" * 80)
    else:
        print("\n" + "=" * 80)
        print("❌ Test failed!")
        print("=" * 80)
