"""
Listing Quality Analyzer Service

Pure Python service that calculates objective quality metrics for property listings.
NO text interpretation or regex patterns - AI handles description analysis.

Quality Signals:
- Photo completeness (count, presence)
- Description completeness (length, key details)
- Data freshness (days on market)
- Price transparency (changes detected)
- Data completeness (missing critical fields)
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class ListingQualityAnalyzer:
    """Analyzes objective quality metrics for property listings"""

    # Quality thresholds
    MIN_PHOTOS_GOOD = 10
    MIN_PHOTOS_ACCEPTABLE = 5
    MIN_DESCRIPTION_LENGTH = 200
    GOOD_DESCRIPTION_LENGTH = 500
    STALE_LISTING_DAYS = 90
    VERY_STALE_DAYS = 180

    # Critical fields that should be present
    CRITICAL_FIELDS = [
        'bedrooms', 'bathrooms', 'square_feet', 'property_type',
        'city', 'state', 'price', 'address'
    ]

    # Important fields that enhance quality
    IMPORTANT_FIELDS = [
        'year_built', 'lot_size', 'garage_spaces', 'mls_number'
    ]

    def analyze_listing(self, listing: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze objective quality metrics for a listing.

        Args:
            listing: Normalized listing dict with all fields

        Returns:
            Quality analysis with score and breakdown
        """
        try:
            photo_quality = self._analyze_photos(listing)
            description_quality = self._analyze_description(listing)
            freshness = self._analyze_freshness(listing)
            price_signals = self._analyze_price(listing)
            completeness = self._analyze_completeness(listing)

            # Calculate overall quality score (0-10)
            quality_score = self._calculate_quality_score(
                photo_quality,
                description_quality,
                freshness,
                completeness
            )

            return {
                "quality_score": quality_score,
                "photo_quality": photo_quality,
                "description_quality": description_quality,
                "freshness": freshness,
                "price_signals": price_signals,
                "completeness": completeness,
                "summary": self._generate_summary(
                    quality_score,
                    photo_quality,
                    description_quality,
                    freshness,
                    price_signals
                )
            }

        except Exception as e:
            logger.error(f"Error analyzing listing quality: {str(e)}")
            return self._get_default_quality_data()

    def _analyze_photos(self, listing: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze photo completeness - pure objective metrics"""
        images = listing.get('images', [])

        # Handle string format (comma-separated URLs)
        if isinstance(images, str):
            images = [img.strip() for img in images.split(',') if img.strip()]

        photo_count = len(images)

        if photo_count >= self.MIN_PHOTOS_GOOD:
            quality = "excellent"
            score = 10
        elif photo_count >= self.MIN_PHOTOS_ACCEPTABLE:
            quality = "good"
            score = 7
        elif photo_count > 0:
            quality = "minimal"
            score = 4
        else:
            quality = "missing"
            score = 0

        return {
            "count": photo_count,
            "quality": quality,
            "score": score,
            "has_photos": photo_count > 0
        }

    def _analyze_description(self, listing: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze description completeness - length and presence only"""
        description = listing.get('description', '') or ''
        length = len(description.strip())

        if length >= self.GOOD_DESCRIPTION_LENGTH:
            quality = "detailed"
            score = 10
        elif length >= self.MIN_DESCRIPTION_LENGTH:
            quality = "adequate"
            score = 7
        elif length > 0:
            quality = "minimal"
            score = 4
        else:
            quality = "missing"
            score = 0

        return {
            "length": length,
            "quality": quality,
            "score": score,
            "has_description": length > 0
        }

    def _analyze_freshness(self, listing: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze listing freshness based on days on market"""
        days_on_market = listing.get('days_on_market')
        list_date = listing.get('list_date')

        # If days_on_market not pre-calculated, try to calculate from list_date
        if days_on_market is None and list_date:
            try:
                if isinstance(list_date, str):
                    # Parse ISO format date
                    list_dt = datetime.fromisoformat(list_date.replace('Z', '+00:00'))
                else:
                    list_dt = list_date

                now = datetime.now(timezone.utc)
                days_on_market = (now - list_dt).days
            except Exception as e:
                logger.warning(f"Could not parse list_date: {e}")
                days_on_market = None

        if days_on_market is None:
            return {
                "days_on_market": None,
                "freshness": "unknown",
                "score": 5,  # Neutral score
                "is_stale": False
            }

        if days_on_market <= 30:
            freshness = "new"
            score = 10
            is_stale = False
        elif days_on_market <= self.STALE_LISTING_DAYS:
            freshness = "recent"
            score = 8
            is_stale = False
        elif days_on_market <= self.VERY_STALE_DAYS:
            freshness = "aging"
            score = 5
            is_stale = True
        else:
            freshness = "stale"
            score = 3
            is_stale = True

        return {
            "days_on_market": days_on_market,
            "freshness": freshness,
            "score": score,
            "is_stale": is_stale
        }

    def _analyze_price(self, listing: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze price signals - changes and transparency"""
        current_price = listing.get('price', 0)
        original_price = listing.get('original_price')

        if original_price and original_price != current_price:
            price_change = current_price - original_price
            price_change_pct = (price_change / original_price) * 100 if original_price > 0 else 0

            if price_change < 0:
                change_type = "reduced"
            else:
                change_type = "increased"

            return {
                "has_price_change": True,
                "original_price": original_price,
                "current_price": current_price,
                "price_change": price_change,
                "price_change_pct": round(price_change_pct, 2),
                "change_type": change_type
            }

        return {
            "has_price_change": False,
            "original_price": original_price,
            "current_price": current_price,
            "price_change": 0,
            "price_change_pct": 0,
            "change_type": None
        }

    def _analyze_completeness(self, listing: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze data completeness - missing critical fields"""
        missing_critical = []
        missing_important = []

        for field in self.CRITICAL_FIELDS:
            value = listing.get(field)
            if value is None or value == '' or value == 0:
                missing_critical.append(field)

        for field in self.IMPORTANT_FIELDS:
            value = listing.get(field)
            if value is None or value == '' or value == 0:
                missing_important.append(field)

        # Calculate completeness score
        total_fields = len(self.CRITICAL_FIELDS) + len(self.IMPORTANT_FIELDS)
        missing_count = len(missing_critical) + len(missing_important)
        completeness_pct = ((total_fields - missing_count) / total_fields) * 100

        # Critical fields missing = major penalty
        if missing_critical:
            score = max(0, 10 - (len(missing_critical) * 3))
        else:
            score = 10 - (len(missing_important) * 0.5)

        return {
            "completeness_pct": round(completeness_pct, 1),
            "score": round(score, 1),
            "missing_critical": missing_critical,
            "missing_important": missing_important,
            "is_complete": len(missing_critical) == 0
        }

    def _calculate_quality_score(
        self,
        photo_quality: Dict[str, Any],
        description_quality: Dict[str, Any],
        freshness: Dict[str, Any],
        completeness: Dict[str, Any]
    ) -> float:
        """
        Calculate overall quality score (0-10) with weighted components

        Weights:
        - Photos: 25% (visual appeal critical)
        - Description: 20% (helps buyers understand property)
        - Freshness: 15% (stale listings may have issues)
        - Completeness: 40% (data accuracy most important)
        """
        score = (
            photo_quality['score'] * 0.25 +
            description_quality['score'] * 0.20 +
            freshness['score'] * 0.15 +
            completeness['score'] * 0.40
        )

        return round(score, 1)

    def _generate_summary(
        self,
        quality_score: float,
        photo_quality: Dict[str, Any],
        description_quality: Dict[str, Any],
        freshness: Dict[str, Any],
        price_signals: Dict[str, Any]
    ) -> str:
        """Generate human-readable summary of quality issues"""
        issues = []

        if photo_quality['count'] == 0:
            issues.append("No photos available")
        elif photo_quality['count'] < self.MIN_PHOTOS_ACCEPTABLE:
            issues.append(f"Only {photo_quality['count']} photos")

        if not description_quality['has_description']:
            issues.append("No description")
        elif description_quality['length'] < self.MIN_DESCRIPTION_LENGTH:
            issues.append("Minimal description")

        if freshness['is_stale']:
            issues.append(f"{freshness['days_on_market']} days on market")

        if price_signals['has_price_change']:
            change = price_signals['change_type']
            pct = abs(price_signals['price_change_pct'])
            issues.append(f"Price {change} by {pct:.1f}%")

        if issues:
            return "Quality concerns: " + ", ".join(issues)

        return "High quality listing"

    def _get_default_quality_data(self) -> Dict[str, Any]:
        """Return default quality data when analysis fails"""
        return {
            "quality_score": 5.0,
            "photo_quality": {"count": 0, "quality": "unknown", "score": 5, "has_photos": False},
            "description_quality": {"length": 0, "quality": "unknown", "score": 5, "has_description": False},
            "freshness": {"days_on_market": None, "freshness": "unknown", "score": 5, "is_stale": False},
            "price_signals": {
                "has_price_change": False,
                "original_price": None,
                "current_price": 0,
                "price_change": 0,
                "price_change_pct": 0,
                "change_type": None
            },
            "completeness": {
                "completeness_pct": 50.0,
                "score": 5.0,
                "missing_critical": [],
                "missing_important": [],
                "is_complete": False
            },
            "summary": "Quality analysis unavailable"
        }
