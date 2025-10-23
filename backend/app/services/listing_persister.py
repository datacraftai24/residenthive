"""
Listing Persistence Service
Persists raw property listings from Repliers API to database for chatbot access
"""
from typing import List, Dict, Any, Optional
from ..db import get_conn
import json


class ListingPersister:
    """Persists raw listings, AI analysis, and images to database"""

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

                        cur.execute("""
                            INSERT INTO repliers_listings (
                                id, address, price, bedrooms, bathrooms, square_feet,
                                property_type, city, state, zip_code, description,
                                features, images, listing_date, status, mls_number,
                                lot_size, year_built, garage_spaces,
                                agent_id, profile_id, created_at, updated_at
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
                            )
                            ON CONFLICT (id) DO UPDATE SET
                                price = EXCLUDED.price,
                                status = EXCLUDED.status,
                                description = EXCLUDED.description,
                                agent_id = EXCLUDED.agent_id,
                                profile_id = EXCLUDED.profile_id,
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
                            profile_id
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
