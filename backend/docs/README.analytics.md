Analytics Router (Transactions)

Overview
Exposes search transaction history and details for analytics views. The current implementation returns data from existing tables if present, or empty structures.

Endpoints
1) GET /api/profiles/{profileId}/transactions
   - Lists transactions for a profile.
   - Response 200: array of
     {
       "transactionId": "uuid",
       "profileId": 1,
       "searchMethod": "enhanced" | "basic" | "hybrid",
       "searchTrigger": "agent_initiated" | "profile_update" | "refinement",
       "rawListingsCount": 100,
       "scoredListingsCount": 50,
       "topPicksCount": 10,
       "otherMatchesCount": 40,
       "visualAnalysisCount": 5,
       "totalExecutionTime": 1200,
       "apiCallsCount": 3,
       "averageScore": "78.4",
       "dealbreakerPropertiesCount": 2,
       "createdAt": "..."
     }

2) GET /api/transactions/{transactionId}
   - Returns a combined view of a transaction and its captured result slices.
   - Response 200
     {
       "transaction": { "searchMethod": "enhanced", "totalExecutionTime": 1200, "apiCallsCount": 3 },
       "results": { "topResults": [], "topPicksData": [], "otherMatchesData": [], "visualAnalysisData": [] },
       "interactions": [],
       "outcomes": {}
     }
   - Response 200 (not found): null

Notes
- Tables referenced: search_transactions, search_transaction_results.
- Extend this router to include agent interactions and outcomes once captured during user sessions.

