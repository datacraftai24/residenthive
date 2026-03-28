"""
Repliers Directory API client for MLS verification.

Wraps GET /brokerages, GET /members, GET /offices endpoints.
Used by admin tools to verify brokerages and agents against MLS directory.
Results stored silently — never blocks the customer.
"""

import os
from typing import Dict, List, Optional
import httpx
from dotenv import load_dotenv
from pathlib import Path

# Load .env
try:
    repo_root_env = Path(__file__).resolve().parents[3] / ".env"
    backend_env = Path(__file__).resolve().parents[2] / ".env"
    if repo_root_env.exists():
        load_dotenv(dotenv_path=repo_root_env, override=False)
    if backend_env.exists():
        load_dotenv(dotenv_path=backend_env, override=False)
except Exception:
    pass

REPLIERS_BASE_URL = os.getenv("REPLIERS_BASE_URL", "https://api.repliers.io")
REPLIERS_API_KEY = os.getenv("REPLIERS_API_KEY", "")
REPLIERS_TIMEOUT = float(os.getenv("REPLIERS_TIMEOUT_SECONDS", "15"))


class RepliersDirectoryClient:
    """Client for Repliers Directory API (brokerages, members, offices)."""

    def __init__(self,
                 base_url: str = REPLIERS_BASE_URL,
                 api_key: str = REPLIERS_API_KEY,
                 timeout: float = REPLIERS_TIMEOUT) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise ValueError("REPLIERS_API_KEY is not set")
        return {
            "REPLIERS-API-KEY": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def verify_brokerage(self, name: str, jurisdiction: str = "MA") -> Optional[Dict]:
        """
        Verify a brokerage exists in the MLS directory.

        Calls GET /brokerages with search query, then fuzzy-matches
        the returned names against the input.

        Returns:
            Dict with brokerage details (id, name, office count) if found, None otherwise.
        """
        if jurisdiction != "MA":
            # Repliers directory only available for MA currently
            print(f"[REPLIERS_DIR] Skipping verification for jurisdiction: {jurisdiction}")
            return None

        url = f"{self.base_url}/brokerages"
        params = {"search": name}

        print(f"[REPLIERS_DIR] Verifying brokerage: {name}")

        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(url, params=params, headers=self._headers())
                print(f"[REPLIERS_DIR] Brokerage search status: {r.status_code}")

                if r.status_code >= 400:
                    print(f"[REPLIERS_DIR] Brokerage search failed: {r.status_code} {r.text[:200]}")
                    return None

                data = r.json()
                brokerages = data if isinstance(data, list) else data.get("brokerages", data.get("results", []))

                if not isinstance(brokerages, list) or not brokerages:
                    print(f"[REPLIERS_DIR] No brokerages found for: {name}")
                    return None

                # Fuzzy match: compare lowercased, stripped names
                name_lower = name.lower().strip()
                for b in brokerages:
                    b_name = (b.get("name") or b.get("brokerageName") or "").lower().strip()
                    if name_lower in b_name or b_name in name_lower:
                        brokerage_id = b.get("id") or b.get("brokerageId") or b.get("_id")
                        print(f"[REPLIERS_DIR] Brokerage matched: {b_name} (ID: {brokerage_id})")
                        return {
                            "id": brokerage_id,
                            "name": b.get("name") or b.get("brokerageName"),
                            "office_count": b.get("officeCount") or b.get("offices"),
                            "raw": b,
                        }

                # No fuzzy match found — return the closest result for admin review
                print(f"[REPLIERS_DIR] No exact match. Top result: {brokerages[0].get('name', 'unknown')}")
                return None

        except Exception as e:
            print(f"[REPLIERS_DIR] Brokerage verification error: {e}")
            return None

    def verify_agent(self, name: str, brokerage_id: str = None) -> Optional[Dict]:
        """
        Verify an agent exists in the MLS directory.

        Calls GET /members with search query and optional brokerage filter.

        Returns:
            Dict with member details (id, name, brokerage) if found, None otherwise.
        """
        url = f"{self.base_url}/members"
        params = {"search": name}
        if brokerage_id:
            params["brokerageId"] = brokerage_id

        print(f"[REPLIERS_DIR] Verifying agent: {name} (brokerage: {brokerage_id})")

        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(url, params=params, headers=self._headers())
                print(f"[REPLIERS_DIR] Member search status: {r.status_code}")

                if r.status_code >= 400:
                    print(f"[REPLIERS_DIR] Member search failed: {r.status_code} {r.text[:200]}")
                    return None

                data = r.json()
                members = data if isinstance(data, list) else data.get("members", data.get("results", []))

                if not isinstance(members, list) or not members:
                    print(f"[REPLIERS_DIR] No members found for: {name}")
                    return None

                # Fuzzy match on name
                name_lower = name.lower().strip()
                for m in members:
                    m_name = (m.get("name") or f"{m.get('firstName', '')} {m.get('lastName', '')}").lower().strip()
                    if name_lower in m_name or m_name in name_lower:
                        member_id = m.get("id") or m.get("memberId") or m.get("_id")
                        print(f"[REPLIERS_DIR] Agent matched: {m_name} (ID: {member_id})")
                        return {
                            "id": member_id,
                            "name": m.get("name") or f"{m.get('firstName', '')} {m.get('lastName', '')}",
                            "brokerage": m.get("brokerage") or m.get("brokerageName"),
                            "status": m.get("status"),
                            "raw": m,
                        }

                print(f"[REPLIERS_DIR] No exact match for agent: {name}")
                return None

        except Exception as e:
            print(f"[REPLIERS_DIR] Agent verification error: {e}")
            return None

    def search_brokerages(self, query: str) -> List[Dict]:
        """Search brokerages — returns multiple matches for autocomplete."""
        url = f"{self.base_url}/brokerages"
        params = {"search": query}

        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(url, params=params, headers=self._headers())
                if r.status_code >= 400:
                    return []

                data = r.json()
                brokerages = data if isinstance(data, list) else data.get("brokerages", data.get("results", []))

                if not isinstance(brokerages, list):
                    return []

                return [
                    {
                        "id": b.get("id") or b.get("brokerageId"),
                        "name": b.get("name") or b.get("brokerageName"),
                        "office_count": b.get("officeCount") or b.get("offices"),
                    }
                    for b in brokerages[:10]
                ]

        except Exception as e:
            print(f"[REPLIERS_DIR] Search brokerages error: {e}")
            return []
