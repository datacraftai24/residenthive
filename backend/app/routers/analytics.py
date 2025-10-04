from fastapi import APIRouter
from ..db import get_conn, fetchall_dicts, fetchone_dict


router = APIRouter(prefix="/api")


@router.get("/profiles/{profile_id}/transactions")
def profile_transactions(profile_id: int):
    # Return an empty list if no transactions are present
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT transaction_id, profile_id, search_method, search_trigger,
                       raw_listings_count, scored_listings_count, top_picks_count, other_matches_count,
                       visual_analysis_count, total_execution_time, api_calls_count, average_score,
                       dealbreaker_properties_count, created_at
                FROM search_transactions
                WHERE profile_id = %s
                ORDER BY created_at DESC
                """,
                (profile_id,),
            )
            rows = fetchall_dicts(cur)
    # Map to UI-friendly keys
    return [
        {
            "transactionId": r.get("transaction_id"),
            "profileId": r.get("profile_id"),
            "searchMethod": r.get("search_method"),
            "searchTrigger": r.get("search_trigger"),
            "rawListingsCount": r.get("raw_listings_count"),
            "scoredListingsCount": r.get("scored_listings_count"),
            "topPicksCount": r.get("top_picks_count"),
            "otherMatchesCount": r.get("other_matches_count"),
            "visualAnalysisCount": r.get("visual_analysis_count"),
            "totalExecutionTime": r.get("total_execution_time"),
            "apiCallsCount": r.get("api_calls_count"),
            "averageScore": r.get("average_score"),
            "dealbreakerPropertiesCount": r.get("dealbreaker_properties_count"),
            "createdAt": r.get("created_at"),
        }
        for r in rows
    ]


@router.get("/transactions/{transaction_id}")
def transaction_details(transaction_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM search_transactions WHERE transaction_id = %s",
                (transaction_id,),
            )
            tx = fetchone_dict(cur)
            cur.execute(
                "SELECT * FROM search_transaction_results WHERE transaction_id = %s",
                (transaction_id,),
            )
            results = fetchall_dicts(cur)
    if not tx:
        return None
    # Minimal shaping for UI; many fields optional
    return {
        "transaction": {
            "searchMethod": tx.get("search_method"),
            "totalExecutionTime": tx.get("total_execution_time"),
            "apiCallsCount": tx.get("api_calls_count"),
        },
        "results": {
            "topResults": [],
            "topPicksData": [],
            "otherMatchesData": [],
            "visualAnalysisData": [],
        },
        "interactions": [],
        "outcomes": {},
    }

