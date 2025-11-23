"""
Listing Persistence Service
Persists raw property listings from Repliers API to database for chatbot access
"""
from typing import List, Dict, Any, Optional
from ..db import get_conn
from datetime import datetime, timezone
import json


class ListingPersister:
    """Persists raw listings, AI analysis, and images to database"""

    @staticmethod
    def _extract_quality_fields(item: Dict[str, Any], listing: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract quality-related fields from raw Repliers API response.

        Args:
            item: Raw item from Repliers API (before normalization)
            listing: Normalized listing data

        Returns:
            Dict with quality fields: list_date, original_price, last_status_date, days_on_market,
            plus canonical price history fields
        """
        quality_fields = {
            "list_date": None,
            "original_price": None,
            "last_status_date": None,
            "days_on_market": None,
            # Canonical price history fields
            "price_cuts_count": 0,
            "total_price_reduction": 0,
            "last_price_change_date": None,
            "price_trend_direction": None,
            "lot_acres": None,
            "special_flags": []
        }

        # Extract listDate and parse it
        list_date_str = item.get("listDate") or item.get("listingDate") or item.get("datePosted")
        if list_date_str:
            try:
                # Parse ISO format date
                list_dt = datetime.fromisoformat(list_date_str.replace('Z', '+00:00'))
                quality_fields["list_date"] = list_dt

                # Calculate days on market
                now = datetime.now(timezone.utc)
                quality_fields["days_on_market"] = (now - list_dt).days
            except Exception as e:
                print(f"[LISTING PERSISTER] Error parsing list_date '{list_date_str}': {e}")

        # Extract original price
        original_price = item.get("originalPrice") or item.get("originalListPrice")
        if original_price:
            try:
                quality_fields["original_price"] = int(original_price)
            except (ValueError, TypeError):
                pass

        # Extract last status date
        last_status_date = item.get("lastStatusDate") or item.get("statusChangeTimestamp")
        if last_status_date:
            try:
                quality_fields["last_status_date"] = datetime.fromisoformat(last_status_date.replace('Z', '+00:00'))
            except Exception:
                pass

        # ============================================================================
        # CANONICAL PRICE HISTORY FIELDS - Stable facts for market intelligence
        # ============================================================================

        # Price cuts count from listPriceLog
        price_log = item.get("listPriceLog") or []
        if isinstance(price_log, list):
            quality_fields["price_cuts_count"] = len(price_log)

        # Total price reduction (original - current)
        list_price = item.get("listPrice") or item.get("price") or 0
        if quality_fields["original_price"] and list_price:
            try:
                reduction = int(quality_fields["original_price"]) - int(list_price)
                quality_fields["total_price_reduction"] = max(0, reduction)  # Never negative
            except (ValueError, TypeError):
                pass

        # Last price change date from timestamps
        timestamps = item.get("timestamps", {}) or {}
        last_price_changed = timestamps.get("lastPriceChanged")
        if last_price_changed:
            try:
                quality_fields["last_price_change_date"] = datetime.fromisoformat(
                    last_price_changed.replace('Z', '+00:00')
                )
            except Exception:
                pass

        # Price trend direction
        if quality_fields["original_price"] and list_price:
            try:
                orig = int(quality_fields["original_price"])
                curr = int(list_price)
                if curr < orig:
                    quality_fields["price_trend_direction"] = "down"
                elif curr > orig:
                    quality_fields["price_trend_direction"] = "up"
                else:
                    quality_fields["price_trend_direction"] = "flat"
            except (ValueError, TypeError):
                pass

        # Lot acres
        lot_obj = item.get("lot", {}) or {}
        lot_acres = lot_obj.get("acres")
        if lot_acres:
            try:
                quality_fields["lot_acres"] = float(lot_acres)
            except (ValueError, TypeError):
                pass

        # Special flags from description parsing
        description = (item.get("details", {}) or {}).get("description") or item.get("description") or ""
        desc_lower = description.lower()
        special_flags = []

        if "cash only" in desc_lower:
            special_flags.append("Cash Only")
        if "as-is" in desc_lower or "as is" in desc_lower:
            special_flags.append("As-Is")
        if "investor" in desc_lower or "investment" in desc_lower:
            special_flags.append("Investor Special")
        if "tear down" in desc_lower or "teardown" in desc_lower:
            special_flags.append("Tear Down")
        if any(phrase in desc_lower for phrase in ["complete renovation", "total renovation", "gut reno"]):
            special_flags.append("Complete Renovation")

        quality_fields["special_flags"] = special_flags

        return quality_fields

    @staticmethod
    def persist_search_results(
        listings: List[Dict[str, Any]],
        analyzed_listings: List[Dict[str, Any]],
        profile_id: int,
        agent_id: Optional[int] = None
    ) -> Dict[str, int]:
        """
        Persist raw Repliers listings and AI analysis to database.

        Args:
            listings: Raw listings from Repliers API (ALL listings returned)
            analyzed_listings: Top listings with AI analysis (top 20)
            profile_id: Buyer profile ID
            agent_id: Agent ID (if available)

        Returns:
            Dictionary with counts of persisted records:
            {
                "listings_persisted": 50,
                "images_persisted": 127,
                "insights_calculated": 50
            }
        """
        counts = {
            "listings_persisted": 0,
            "images_persisted": 0,
            "insights_calculated": 0
        }

        with get_conn() as conn:
            with conn.cursor() as cur:
                # Step 1: Persist ALL raw listings from Repliers
                for listing in listings:
                    try:
                        listing_id = listing.get("id") or listing.get("mls_number")
                        if not listing_id:
                            continue

                        # Parse images field (could be string or list)
                        images = listing.get("images", "")
                        if isinstance(images, list):
                            images = ",".join(images)

                        # Parse features if it's a list
                        features = listing.get("features", "")
                        if isinstance(features, list):
                            features = json.dumps(features)

                        # Extract raw JSON and quality fields
                        raw_json = listing.get("_raw")
                        quality_fields = ListingPersister._extract_quality_fields(raw_json or {}, listing)

                        cur.execute("""
                            INSERT INTO repliers_listings (
                                id, address, price, bedrooms, bathrooms, square_feet,
                                property_type, city, state, zip_code, description,
                                features, images, listing_date, status, mls_number,
                                lot_size, year_built, garage_spaces,
                                agent_id, profile_id,
                                raw_json, list_date, original_price, last_status_date, days_on_market,
                                price_cuts_count, total_price_reduction, last_price_change_date,
                                price_trend_direction, lot_acres, special_flags,
                                created_at, updated_at
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s,
                                NOW(), NOW()
                            )
                            ON CONFLICT (id) DO UPDATE SET
                                price = EXCLUDED.price,
                                status = EXCLUDED.status,
                                description = EXCLUDED.description,
                                agent_id = EXCLUDED.agent_id,
                                profile_id = EXCLUDED.profile_id,
                                raw_json = EXCLUDED.raw_json,
                                list_date = EXCLUDED.list_date,
                                original_price = EXCLUDED.original_price,
                                last_status_date = EXCLUDED.last_status_date,
                                days_on_market = EXCLUDED.days_on_market,
                                price_cuts_count = EXCLUDED.price_cuts_count,
                                total_price_reduction = EXCLUDED.total_price_reduction,
                                last_price_change_date = EXCLUDED.last_price_change_date,
                                price_trend_direction = EXCLUDED.price_trend_direction,
                                lot_acres = EXCLUDED.lot_acres,
                                special_flags = EXCLUDED.special_flags,
                                updated_at = NOW()
                        """, (
                            listing_id,
                            listing.get("address", ""),
                            listing.get("price", 0),
                            listing.get("bedrooms", 0),
                            listing.get("bathrooms", 0),
                            listing.get("square_feet"),
                            listing.get("property_type", ""),
                            listing.get("city", ""),
                            listing.get("state", ""),
                            listing.get("zip_code", ""),
                            listing.get("description", ""),
                            features,
                            images,
                            listing.get("listing_date", ""),
                            listing.get("status", "active"),
                            listing.get("mls_number", ""),
                            listing.get("lot_size"),
                            listing.get("year_built"),
                            listing.get("garage_spaces"),
                            agent_id,
                            profile_id,
                            json.dumps(raw_json) if raw_json else None,
                            quality_fields["list_date"],
                            quality_fields["original_price"],
                            quality_fields["last_status_date"],
                            quality_fields["days_on_market"],
                            quality_fields["price_cuts_count"],
                            quality_fields["total_price_reduction"],
                            quality_fields["last_price_change_date"],
                            quality_fields["price_trend_direction"],
                            quality_fields["lot_acres"],
                            json.dumps(quality_fields["special_flags"])
                        ))
                        counts["listings_persisted"] += 1

                        # Step 2: Persist images for this listing
                        if images:
                            image_urls = images.split(",") if isinstance(images, str) else images
                            for idx, img_url in enumerate(image_urls):
                                img_url = img_url.strip()
                                if img_url:
                                    try:
                                        cur.execute("""
                                            INSERT INTO property_images (
                                                property_id, image_url, image_order, agent_id, created_at
                                            ) VALUES (
                                                %s, %s, %s, %s, NOW()
                                            )
                                            ON CONFLICT (property_id, image_url) DO NOTHING
                                        """, (listing_id, img_url, idx, agent_id))
                                        counts["images_persisted"] += 1
                                    except Exception as e:
                                        print(f"[LISTING PERSISTER] Error persisting image: {e}")

                        # Step 3: Calculate basic property insights
                        try:
                            cur.execute("SELECT calculate_property_insights(%s)", (listing_id,))
                            counts["insights_calculated"] += 1
                        except Exception as e:
                            print(f"[LISTING PERSISTER] Error calculating insights for {listing_id}: {e}")

                    except Exception as e:
                        print(f"[LISTING PERSISTER] Error persisting listing {listing_id}: {e}")
                        import traceback
                        traceback.print_exc()
                        continue

                # Step 4: Enhanced insights for analyzed listings (top 20 with AI)
                ListingPersister._persist_ai_insights(cur, analyzed_listings, agent_id)

                conn.commit()

        print(f"[LISTING PERSISTER] Persisted {counts['listings_persisted']} listings, {counts['images_persisted']} images, {counts['insights_calculated']} insights")
        return counts

    @staticmethod
    def _persist_ai_insights(
        cur,
        analyzed_listings: List[Dict[str, Any]],
        agent_id: Optional[int]
    ) -> None:
        """
        Persist additional AI-generated insights for top analyzed listings.
        Extracts investment data from AI analysis and stores in property_insights.
        """
        for item in analyzed_listings:
            try:
                listing = item.get("listing", {})
                listing_id = listing.get("id") or listing.get("mls_number")
                if not listing_id:
                    continue

                # Extract investment-related data from AI analysis
                match_reasoning = item.get("match_reasoning", {})
                considerations = item.get("considerations", [])

                # Build investment summary from AI insights
                investment_summary_parts = []

                if item.get("agent_insight"):
                    investment_summary_parts.append(item["agent_insight"])

                why_it_works = item.get("why_it_works", {})
                if why_it_works.get("investment_fit"):
                    investment_summary_parts.append(f"Investment fit: {why_it_works['investment_fit']}")

                investment_summary = "\n\n".join(investment_summary_parts) if investment_summary_parts else None

                # Extract risk factors from considerations
                risk_factors = json.dumps(considerations) if considerations else '[]'

                # Update property_insights with AI-derived data
                if investment_summary or considerations:
                    cur.execute("""
                        UPDATE property_insights
                        SET
                            investment_summary = COALESCE(%s, investment_summary),
                            risk_factors = COALESCE(%s::jsonb, risk_factors),
                            agent_id = COALESCE(%s, agent_id),
                            updated_at = NOW()
                        WHERE property_id = %s
                    """, (investment_summary, risk_factors, agent_id, listing_id))

            except Exception as e:
                print(f"[LISTING PERSISTER] Error persisting AI insights: {e}")
                continue
