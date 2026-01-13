"""
Unit tests for repliers_lookup.py location parsing functions.
"""
import pytest
import sys
import os

# Add app directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.repliers_lookup import (
    parse_multi_city_location,
    format_location_display,
    MA_REGIONS,
)


class TestParseMultiCityLocation:
    """Test parse_multi_city_location() function."""

    # Single city tests
    def test_single_city(self):
        assert parse_multi_city_location("Boston") == ["Boston"]

    def test_city_with_state_comma(self):
        assert parse_multi_city_location("Worcester, MA") == ["Worcester"]

    def test_city_with_state_no_comma(self):
        assert parse_multi_city_location("Boston MA") == ["Boston"]

    def test_city_lowercase(self):
        assert parse_multi_city_location("boston") == ["Boston"]

    # Multi-city with "or" connector
    def test_or_connector(self):
        result = parse_multi_city_location("Boston or Quincy")
        assert set(result) == {"Boston", "Quincy"}

    def test_or_connector_case_insensitive(self):
        result = parse_multi_city_location("Boston OR Quincy")
        assert set(result) == {"Boston", "Quincy"}

    # Multi-city with "and" connector
    def test_and_connector(self):
        result = parse_multi_city_location("Boston and Quincy")
        assert set(result) == {"Boston", "Quincy"}

    def test_and_connector_three_cities(self):
        result = parse_multi_city_location("Melrose and Wakefield and Stoneham")
        assert set(result) == {"Melrose", "Wakefield", "Stoneham"}

    # Multi-city with comma separator
    def test_comma_separated(self):
        result = parse_multi_city_location("Boston, Quincy, Brookline")
        assert set(result) == {"Boston", "Quincy", "Brookline"}

    def test_comma_with_states(self):
        result = parse_multi_city_location("Boston MA, Quincy MA")
        assert set(result) == {"Boston", "Quincy"}

    def test_comma_three_cities_with_states(self):
        result = parse_multi_city_location("Melrose MA, Wakefield MA, Stoneham MA")
        assert set(result) == {"Melrose", "Wakefield", "Stoneham"}

    # Region tests
    def test_south_shore_region(self):
        result = parse_multi_city_location("South Shore")
        assert "Quincy" in result
        assert "Braintree" in result
        assert len(result) >= 10

    def test_south_shore_ma_region(self):
        result = parse_multi_city_location("South Shore MA")
        assert "Quincy" in result
        assert "Weymouth" in result

    def test_greater_boston_region(self):
        result = parse_multi_city_location("Greater Boston")
        assert "Boston" in result
        assert "Cambridge" in result
        assert len(result) >= 5

    def test_cape_cod_region(self):
        result = parse_multi_city_location("Cape Cod")
        assert "Barnstable" in result
        assert "Falmouth" in result

    def test_north_shore_region(self):
        result = parse_multi_city_location("North Shore")
        assert "Salem" in result
        assert "Melrose" in result

    def test_metro_west_region(self):
        result = parse_multi_city_location("Metro West")
        assert "Framingham" in result
        assert "Natick" in result

    # Areas suffix handling
    def test_areas_suffix_stripped(self):
        # With region match
        result = parse_multi_city_location("Boston area")
        assert "Boston" in result

    # Edge cases
    def test_empty_string(self):
        assert parse_multi_city_location("") == []

    def test_none_input(self):
        assert parse_multi_city_location(None) == []

    def test_whitespace_only(self):
        assert parse_multi_city_location("   ") == []

    def test_whitespace_around_city(self):
        assert parse_multi_city_location("  Boston  ") == ["Boston"]

    def test_multiple_spaces(self):
        result = parse_multi_city_location("Boston   or   Quincy")
        # Should still work despite extra spaces
        assert "Boston" in result or "Quincy" in result


class TestFormatLocationDisplay:
    """Test format_location_display() function."""

    def test_empty_list(self):
        assert format_location_display([]) == ""

    def test_single_city(self):
        assert format_location_display(["Boston"]) == "Boston"

    def test_two_cities(self):
        assert format_location_display(["Boston", "Quincy"]) == "Boston & Quincy"

    def test_three_cities(self):
        result = format_location_display(["Boston", "Quincy", "Brookline"])
        assert result == "Boston, Quincy & Brookline"

    def test_four_cities(self):
        result = format_location_display(["Boston", "Quincy", "Brookline", "Newton"])
        assert result == "Boston, Quincy, Brookline & Newton"

    def test_five_plus_cities(self):
        cities = ["Boston", "Quincy", "Brookline", "Newton", "Cambridge"]
        result = format_location_display(cities)
        assert result == "Boston, Quincy + 3 more"

    def test_many_cities(self):
        cities = ["A", "B", "C", "D", "E", "F", "G"]
        result = format_location_display(cities)
        assert result == "A, B + 5 more"


class TestMARegions:
    """Test that MA_REGIONS dictionary is properly defined."""

    def test_south_shore_exists(self):
        assert "south shore" in MA_REGIONS
        assert len(MA_REGIONS["south shore"]) >= 10

    def test_north_shore_exists(self):
        assert "north shore" in MA_REGIONS
        assert len(MA_REGIONS["north shore"]) >= 10

    def test_greater_boston_exists(self):
        assert "greater boston" in MA_REGIONS
        assert "Boston" in MA_REGIONS["greater boston"]

    def test_cape_cod_exists(self):
        assert "cape cod" in MA_REGIONS
        assert "Barnstable" in MA_REGIONS["cape cod"]

    def test_metro_west_exists(self):
        assert "metro west" in MA_REGIONS
        assert "Framingham" in MA_REGIONS["metro west"]

    def test_greater_worcester_exists(self):
        assert "greater worcester" in MA_REGIONS
        assert "Worcester" in MA_REGIONS["greater worcester"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
