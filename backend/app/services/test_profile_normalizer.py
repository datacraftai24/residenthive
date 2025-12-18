"""
Acceptance tests for profile_normalizer.py

Run with: python -m app.services.test_profile_normalizer
"""

from profile_normalizer import normalize_location_signals


def test_orientation_explicit_want():
    """Explicit east-facing should have high confidence"""
    profile = {"mustHaveFeatures": ["east-facing house"]}
    signals = normalize_location_signals(profile)
    orientation = next((s for s in signals["signals"] if s["code"] == "orientation"), None)

    assert orientation is not None, "Should extract orientation signal"
    assert orientation["want"] == "east", f"Should want east, got {orientation['want']}"
    assert orientation["confidence"] >= 0.9, f"Should have high confidence, got {orientation['confidence']}"
    assert orientation["avoid"] is None, f"Should NOT have avoid, got {orientation['avoid']}"
    print("PASS: test_orientation_explicit_want")


def test_orientation_explicit_avoid():
    """Explicit avoid should have high confidence"""
    profile = {"mustHaveFeatures": ["avoid west-facing"]}
    signals = normalize_location_signals(profile)
    orientation = next((s for s in signals["signals"] if s["code"] == "orientation"), None)

    assert orientation is not None, "Should extract orientation signal"
    assert orientation["avoid"] == "west", f"Should avoid west, got {orientation['avoid']}"
    assert orientation["confidence"] >= 0.9, f"Should have high confidence, got {orientation['confidence']}"
    print("PASS: test_orientation_explicit_avoid")


def test_orientation_ambiguous():
    """'prefer east, west ok' should NOT create avoid=west"""
    profile = {"mustHaveFeatures": ["prefer east-facing, west is ok"]}
    signals = normalize_location_signals(profile)
    orientation = next((s for s in signals["signals"] if s["code"] == "orientation"), None)

    assert orientation is not None, "Should extract orientation signal"
    assert orientation["want"] == "east", f"Should want east, got {orientation['want']}"
    assert orientation["avoid"] is None, f"Should NOT have avoid (west is ok), got {orientation['avoid']}"
    print("PASS: test_orientation_ambiguous")


def test_orientation_implied():
    """'morning sun' implies east but lower confidence"""
    profile = {"mustHaveFeatures": ["lots of morning sun"]}
    signals = normalize_location_signals(profile)
    orientation = next((s for s in signals["signals"] if s["code"] == "orientation"), None)

    assert orientation is not None, "Should extract orientation signal"
    assert orientation["want"] == "east", f"Should want east, got {orientation['want']}"
    assert 0.5 <= orientation["confidence"] < 0.9, f"Should have medium confidence, got {orientation['confidence']}"
    print("PASS: test_orientation_implied")


def test_orientation_combined_want_and_avoid():
    """'east-facing house, avoid west-facing' should extract both"""
    profile = {"mustHaveFeatures": ["east-facing house, avoid west-facing"]}
    signals = normalize_location_signals(profile)
    orientation = next((s for s in signals["signals"] if s["code"] == "orientation"), None)

    assert orientation is not None, "Should extract orientation signal"
    assert orientation["want"] == "east", f"Should want east, got {orientation['want']}"
    assert orientation["avoid"] == "west", f"Should avoid west, got {orientation['avoid']}"
    print("PASS: test_orientation_combined_want_and_avoid")


def test_commute_basic():
    """Basic commute extraction"""
    profile = {"lifestyleDrivers": ["reasonable drive to UMass Memorial"]}
    signals = normalize_location_signals(profile)
    commute = next((s for s in signals["signals"] if s["code"] == "commute"), None)

    assert commute is not None, "Should extract commute signal"
    assert "umass memorial" in commute["work_text"].lower(), f"Should extract work location, got {commute['work_text']}"
    assert commute["max_mins"] == 30, f"Should default to 30 min, got {commute['max_mins']}"
    print("PASS: test_commute_basic")


def test_commute_with_time():
    """Commute with explicit time limit"""
    profile = {"lifestyleDrivers": ["within 20 minutes to downtown Worcester"]}
    signals = normalize_location_signals(profile)
    commute = next((s for s in signals["signals"] if s["code"] == "commute"), None)

    assert commute is not None, "Should extract commute signal"
    assert commute["max_mins"] == 20, f"Should extract 20 min limit, got {commute['max_mins']}"
    print("PASS: test_commute_with_time")


def test_quiet_from_must_have():
    """Quiet street from must-have"""
    profile = {"mustHaveFeatures": ["quiet residential street"]}
    signals = normalize_location_signals(profile)
    quiet = next((s for s in signals["signals"] if s["code"] == "quiet_street"), None)

    assert quiet is not None, "Should extract quiet_street signal"
    assert quiet["strength"] == "must", f"Should have strength=must, got {quiet['strength']}"
    assert quiet["confidence"] >= 0.8, f"Should have high confidence, got {quiet['confidence']}"
    print("PASS: test_quiet_from_must_have")


def test_quiet_from_dealbreaker():
    """Busy roads dealbreaker implies quiet preference"""
    profile = {"dealbreakers": ["busy roads"]}
    signals = normalize_location_signals(profile)
    quiet = next((s for s in signals["signals"] if s["code"] == "quiet_street"), None)

    assert quiet is not None, "Should extract quiet_street signal from dealbreaker"
    assert quiet["strength"] == "must", f"Should have strength=must, got {quiet['strength']}"
    print("PASS: test_quiet_from_dealbreaker")


def test_has_kids():
    """School mention implies has_kids"""
    profile = {"lifestyleDrivers": ["good elementary schools nearby"]}
    signals = normalize_location_signals(profile)
    kids = next((s for s in signals["signals"] if s["code"] == "has_kids"), None)

    assert kids is not None, "Should extract has_kids signal"
    assert kids["confidence"] >= 0.9, f"Should have high confidence, got {kids['confidence']}"
    print("PASS: test_has_kids")


def test_walkability_must_have():
    """Walkability from must-have"""
    profile = {"mustHaveFeatures": ["walkable neighborhood"]}
    signals = normalize_location_signals(profile)
    walk = next((s for s in signals["signals"] if s["code"] == "walkability"), None)

    assert walk is not None, "Should extract walkability signal"
    assert walk["strength"] == "must", f"Should have strength=must, got {walk['strength']}"
    print("PASS: test_walkability_must_have")


def test_full_profile():
    """Test a realistic full profile"""
    profile = {
        "mustHaveFeatures": [
            "quiet residential street",
            "east-facing house, avoid west-facing",
            "off-street parking"
        ],
        "lifestyleDrivers": [
            "reasonable drive to UMass Memorial",
            "good elementary schools"
        ],
        "dealbreakers": [
            "busy roads",
            "power lines"
        ]
    }

    signals = normalize_location_signals(profile)

    # Should have all expected signals
    signal_codes = [s["code"] for s in signals["signals"]]
    assert "quiet_street" in signal_codes, "Should have quiet_street signal"
    assert "orientation" in signal_codes, "Should have orientation signal"
    assert "commute" in signal_codes, "Should have commute signal"
    assert "has_kids" in signal_codes, "Should have has_kids signal"

    # Check orientation details
    orientation = next(s for s in signals["signals"] if s["code"] == "orientation")
    assert orientation["want"] == "east", f"Should want east, got {orientation['want']}"
    assert orientation["avoid"] == "west", f"Should avoid west, got {orientation['avoid']}"

    print("PASS: test_full_profile")


def test_no_signals():
    """Empty profile should return no signals"""
    profile = {}
    signals = normalize_location_signals(profile)

    assert signals["version"] == 2, "Should have version 2"
    assert len(signals["signals"]) == 0, f"Should have no signals, got {len(signals['signals'])}"
    print("PASS: test_no_signals")


def test_low_confidence_not_extracted():
    """Ambiguous phrases below confidence threshold shouldn't be extracted"""
    profile = {"mustHaveFeatures": ["nice area"]}  # Too vague
    signals = normalize_location_signals(profile)

    assert len(signals["signals"]) == 0, f"Should have no signals for vague phrase, got {len(signals['signals'])}"
    print("PASS: test_low_confidence_not_extracted")


def run_all_tests():
    """Run all acceptance tests"""
    print("\n=== Running Profile Normalizer Acceptance Tests ===\n")

    tests = [
        test_orientation_explicit_want,
        test_orientation_explicit_avoid,
        test_orientation_ambiguous,
        test_orientation_implied,
        test_orientation_combined_want_and_avoid,
        test_commute_basic,
        test_commute_with_time,
        test_quiet_from_must_have,
        test_quiet_from_dealbreaker,
        test_has_kids,
        test_walkability_must_have,
        test_full_profile,
        test_no_signals,
        test_low_confidence_not_extracted,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"FAIL: {test.__name__} - {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR: {test.__name__} - {e}")
            failed += 1

    print(f"\n=== Results: {passed} passed, {failed} failed ===\n")
    return failed == 0


if __name__ == "__main__":
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)
