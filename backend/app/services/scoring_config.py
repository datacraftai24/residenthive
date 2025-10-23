"""
Scoring configuration system for property matching.
Defines default rules and allows agent customization.
"""
from typing import Dict, Any, Optional
from ..db import get_conn, fetchone_dict
import json


# Default scoring rules - can be overridden per agent
DEFAULT_SCORING_RULES = {
    "budget_match": {
        "weight": 30,
        "enabled": True,
        "rules": [
            {"condition": "within_range", "points": 30, "description": "Price within budget range"},
            {"condition": "within_10_percent_over", "points": 20, "description": "Within 10% over budget"},
            {"condition": "within_20_percent_over", "points": 10, "description": "Within 20% over budget"},
            {"condition": "within_10_percent_under", "points": 25, "description": "Within 10% under budget"},
        ]
    },

    "bedroom_match": {
        "weight": 20,
        "enabled": True,
        "rules": [
            {"condition": "within_range", "points": 20, "description": "Bedrooms within requested range"},
            {"condition": "exact_match", "points": 20, "description": "Exact bedroom match"},
            {"condition": "one_more", "points": 15, "description": "One more bedroom than requested"},
            {"condition": "one_less", "points": 10, "description": "One less bedroom than requested"},
        ]
    },

    "bathroom_match": {
        "weight": 15,
        "enabled": True,
        "rules": [
            {"condition": "meets_or_exceeds", "points": 15, "description": "Meets or exceeds bathroom requirement"},
            {"condition": "one_less", "points": 8, "description": "One less bathroom than requested"},
        ]
    },

    "must_have_features": {
        "weight": 25,
        "enabled": True,
        "keywords": {
            "updated_kitchen": ["granite", "updated kitchen", "renovated kitchen", "new kitchen", "modern kitchen", "quartz counter"],
            "outdoor_space": ["yard", "patio", "deck", "garden", "outdoor space", "backyard", "fenced yard"],
            "garage": ["garage", "parking", "carport", "covered parking"],
            "good_schools": ["school district", "near schools", "school", "schools nearby"],
            "pool": ["pool", "swimming pool", "in-ground pool"],
            "fireplace": ["fireplace", "wood burning"],
            "hardwood_floors": ["hardwood", "wood floors", "hardwood floors"],
            "basement": ["basement", "finished basement", "walk-out basement"],
            "master_suite": ["master suite", "master bedroom", "en-suite"],
            "open_floor_plan": ["open floor", "open concept", "great room"],
        }
    },

    "location_match": {
        "weight": 10,
        "enabled": True,
        "rules": [
            {"condition": "city_match", "points": 10, "description": "Matches preferred city"},
            {"condition": "nearby_city", "points": 5, "description": "Nearby preferred area"},
        ]
    },

    "dealbreakers": {
        "enabled": True,
        "auto_reject": True,
        "keywords": {
            "busy_street": ["main road", "highway", "busy street", "arterial", "high traffic"],
            "major_repairs": ["needs work", "fixer upper", "as-is", "handyman special", "tlc needed"],
            "short_sale": ["short sale", "foreclosure"],
            "hoa_issues": ["pending litigation", "special assessment"],
        }
    },

    "property_age": {
        "weight": 5,
        "enabled": False,  # Optional scoring category
        "rules": [
            {"condition": "new_construction", "points": 5, "description": "New construction"},
            {"condition": "recently_updated", "points": 3, "description": "Recently renovated"},
        ]
    }
}


class ScoringConfig:
    """Manages scoring configuration with agent customization support"""

    @staticmethod
    def get_rules(agent_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get scoring rules for an agent.
        Returns default rules if no custom rules exist.

        Args:
            agent_id: Agent ID to get custom rules for (None = default)

        Returns:
            Dictionary of scoring rules
        """
        if not agent_id:
            return DEFAULT_SCORING_RULES.copy()

        # Check for custom agent rules in database
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT config_json FROM agent_scoring_rules
                        WHERE agent_id = %s AND is_active = TRUE
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        (agent_id,)
                    )
                    row = fetchone_dict(cur)

                    if row and row.get('config_json'):
                        # Merge custom rules with defaults
                        custom_rules = json.loads(row['config_json']) if isinstance(row['config_json'], str) else row['config_json']
                        return ScoringConfig._merge_rules(DEFAULT_SCORING_RULES, custom_rules)
        except Exception as e:
            print(f"[SCORING CONFIG] Error loading custom rules for agent {agent_id}: {e}")

        # Fallback to defaults
        return DEFAULT_SCORING_RULES.copy()

    @staticmethod
    def _merge_rules(default_rules: Dict, custom_rules: Dict) -> Dict:
        """
        Merge custom rules with defaults.
        Custom rules override defaults but don't remove them entirely.
        """
        merged = default_rules.copy()

        for category, custom_config in custom_rules.items():
            if category in merged:
                # Update existing category
                if isinstance(merged[category], dict) and isinstance(custom_config, dict):
                    merged[category].update(custom_config)
                else:
                    merged[category] = custom_config
            else:
                # Add new category
                merged[category] = custom_config

        return merged

    @staticmethod
    def validate_rules(rules: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate scoring rules structure.

        Returns:
            (is_valid, error_message)
        """
        required_categories = ["budget_match", "bedroom_match", "bathroom_match", "must_have_features"]

        for category in required_categories:
            if category not in rules:
                return False, f"Missing required category: {category}"

            if "weight" not in rules[category] and category != "must_have_features":
                return False, f"Category {category} missing weight"

            if not isinstance(rules[category].get("enabled"), bool):
                return False, f"Category {category} missing or invalid 'enabled' flag"

        # Validate total weight doesn't exceed 100
        total_weight = sum(
            rules[cat]["weight"]
            for cat in rules
            if isinstance(rules[cat], dict) and "weight" in rules[cat] and rules[cat].get("enabled", True)
        )

        if total_weight > 100:
            return False, f"Total weight ({total_weight}) exceeds 100"

        return True, None

    @staticmethod
    def get_category_weight(rules: Dict[str, Any], category: str) -> int:
        """Get weight for a specific category"""
        if category not in rules:
            return 0

        config = rules[category]
        if not config.get("enabled", True):
            return 0

        return config.get("weight", 0)

    @staticmethod
    def get_keywords(rules: Dict[str, Any], category: str, feature: str) -> list[str]:
        """Get keyword list for a feature within a category"""
        if category not in rules:
            return []

        keywords_dict = rules[category].get("keywords", {})
        return keywords_dict.get(feature, [])
