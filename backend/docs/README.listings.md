Listings Router (Basic/Enhanced/Hybrid, Cache, Share, Helpers)

Overview
Provides three search variants plus supporting endpoints used by the UI (cache status, share links, copy helpers, placeholder images). Data is realistic demo output.

Endpoints
1) POST /api/listings/search
   - Body
     { "profileId": 1 }
   - Response 200: grouped results with scores
     {
       "top_picks": [ { "listing": {...}, "match_score": 0.82, "label": "Strong match", ... } ],
       "other_matches": [ ... ],
       "chat_blocks": ["Top pick: 12 Oak St..."],
       "search_summary": { "total_found": 2, "top_picks_count": 1, "other_matches_count": 1, "search_criteria": {...} }
     }

2) POST /api/listings/search-enhanced
   - Adds visual analysis and enhanced reasoning fields.
   - Body
     { "profileId": 1, "forceRefresh": false }
   - Response 200: similar to `/api/listings/search` plus `visualAnalysis` blocks and `cache_status`.

3) POST /api/listings/search-hybrid
   - Hybrid between basic and enhanced, including a progress section.
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

Notes
- These endpoints return demo data to keep the UI functional; integrate your data sources and scoring logic to replace them.

