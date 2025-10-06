Listings Router (Basic/Enhanced/Hybr   - Behavior
     - Loads the buyer profile from the DB by `profileId` and builds Repliers query parameters (see mapping above)
     - Calls `POST {REPLIERS_BASE_URL}{REPLIERS_SEARCH_PATH}` with JSON body and `REPLIERS-API-KEY` header
     - Normalizes Repliers response to the app's listing shape and computes a simple match score (budget + bedrooms) used by the UICache, Share, Helpers)

Overview
Provides three search variants plus supporting endpoints used by the UI (cache status, share links, copy helpers, placeholder images). The search endpoints are backed by the Repliers API and return normalized listing data used by the frontend.

Repliers integration
- Base URL: `https://api.repliers.io` (overridable via `REPLIERS_BASE_URL`)
- Endpoint path: `/listings` (overridable via `REPLIERS_SEARCH_PATH`)
- Auth header: `REPLIERS-API-KEY: <your_api_key>`
- Timeout: controlled by `REPLIERS_TIMEOUT_SECONDS` (default 15)
- Image URLs: relative paths are normalized to `https://cdn.repliers.io/<path>?class=medium`
- **Method**: POST with JSON body (not GET with query parameters)

Query mapping (built from the buyer profile, sent as JSON body)
- `limit`: 50
- `offset`: 0 (for pagination)
- `class`: `"ResidentialProperty"`
- `status`: `["Active"]`
- `minListPrice` ← `budgetMin`
- `maxListPrice` ← `budgetMax`
- `minBedrooms` ← `bedrooms`
- `minBathrooms` ← `bathrooms` (converted to float)
- `propertyType` ← `homeType`
- Location: `city` and `stateOrProvince` are derived from `location`

Field mapping from Repliers response
- Bedrooms/bathrooms are extracted from the `details` object: `details.numBedrooms`, `details.numBathrooms`
- Address components are extracted from the nested `address` object
- Images are prefixed with CDN URL if they're relative paths
- Description comes from `details.description`
- Square feet comes from `details.sqft`

Endpoints
1) POST /api/listings/search
   - Body
     { "profileId": 1 }
   - Behavior
     - Loads the buyer profile from the DB by `profileId` and builds Repliers query parameters (see mapping above)
     - Calls `GET {REPLIERS_BASE_URL}{REPLIERS_SEARCH_PATH}` with query params and `REPLIERS-API-KEY`
     - Normalizes Repliers response to the app’s listing shape and computes a simple match score (budget + bedrooms) used by the UI
   - Response 200: grouped results with scores
     {
       "top_picks": [ { "listing": {...}, "match_score": 0.82, "label": "Strong match", ... } ],
       "other_matches": [ ... ],
       "chat_blocks": ["Top pick: 12 Oak St..."],
       "search_summary": { "total_found": 2, "top_picks_count": 1, "other_matches_count": 1, "search_criteria": {...} }
     }

2) POST /api/listings/search-enhanced
   - Same Repliers-backed data as `/api/listings/search`, returned in the enhanced envelope used by the UI. No fake visual analysis is injected.
   - Body
     { "profileId": 1, "forceRefresh": false }
   - Response 200: similar to `/api/listings/search` plus an empty `properties_without_images` and a `cache_status` placeholder.

3) POST /api/listings/search-hybrid
   - Same Repliers-backed data as `/api/listings/search`, wrapped in a hybrid envelope, including a progress section.
   - Body
     { "profileId": 1, "forceRefresh": false }
   - Response 200
     { "top_picks": [...], "other_matches": [...], "chat_blocks": [...], "search_summary": {...}, "search_type": "hybrid", "analysis_in_progress": false, "analysis_progress": {"total":2,"completed":2}, "cache_status": {"from_cache": false} }

4) GET /api/cache/status/{profileId}
   - Query: `searchMethod=enhanced|hybrid|basic` (optional)
   - Response 200
     { "isCached": false, "isExpired": true, "lastUpdated": null, "expiresAt": null, "cacheAge": 0 }

5) POST /api/listings/share
   - Creates a shareable link for a listing & profile.
   - Body
     { "profileId": 1, "listingId": "mls-101", "agentName":"...", "agentEmail":"...", "customMessage":"...", "expiresInDays":30 }
   - Response 200
     { "shareId": "uuid", "shareUrl": "/client/<uuid>?listingId=mls-101" }

6) POST /api/listings/copy-text
   - Generates a simple text summary for clipboard or messaging.
   - Body
     { "listingId": "mls-101", "shareId": "uuid", "format": "plain" }
   - Response 200
     { "copyText": "Check out this property ..." }

7) POST /api/listings/generate-personal-message
   - Generates an agent-facing personalized message for outreach.
   - Body
     { "listingId": "mls-101", "profileId": 1 }
   - Response 200
     { "personalMessage": "Hi! I found a property..." }

8) GET /api/placeholder/{w}/{h}
   - Returns a simple SVG placeholder of size w x h.
   - Response 200: image/svg+xml

Environment
- `REPLIERS_API_KEY` (required)
- `REPLIERS_BASE_URL` (default `https://api.repliers.io`)
- `REPLIERS_SEARCH_PATH` (default `/listings`)
- `REPLIERS_TIMEOUT_SECONDS` (default `15`)

Notes
- If your Repliers account expects different parameter names or endpoint paths, set `REPLIERS_BASE_URL`/`REPLIERS_SEARCH_PATH` accordingly and we can adjust the query builder if needed.

Local test script
- Ensure `REPLIERS_API_KEY` is set in your environment or in the project `.env` (repo root).
- Run: `python scripts/test_repliers_search.py --city "Boston" --state MA --budget-min 400000 --budget-max 700000 --bedrooms 2`
- Add `--verbose` to print the full normalized JSON payload returned by Repliers.
