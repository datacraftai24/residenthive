Misc Router

Overview
Helper endpoints used by the frontend for validation and NLP search stubs.

Endpoints
1) POST /api/validate-context
   - Validates a chat/share context and returns a `chat_url` for convenience.
   - Headers: (optional) Authorization: Bearer <token>
   - Body
     { "buyer_id": 1, "agent_id": 28 }
   - Response 200
     { "success": true, "ready": true, "errors": [], "preview": "Context is valid.", "chat_url": "/client/1" }

2) GET /api/listings/nlp-history/{profileId}
   - Returns prior NLP searches for a profile (placeholder).
   - Response 200: []

3) POST /api/listings/search-nlp/{profileId}
   - Executes an NLP search (placeholder).
   - Body
     { "query": "3-bed in Cambridge under $600K" }
   - Response 200
     { "nlp_id": "demo-nlp", "search_url": "", "results": [], "execution_time": 0 }

4) GET /api/buyer-profiles/{id}/enhanced
   - Returns the tags and persona for a profile (placeholder).
   - Response 200
     { "profileId": 1, "tags": [], "persona": { "urgencyLevel": 50, "personalityTraits": [], "confidenceScore": 0 } }

Notes
- These helpers exist to keep UI flows complete; replace placeholders with real services when ready.

