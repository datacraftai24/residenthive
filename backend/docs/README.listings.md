Listings Router (Basic/Enhanced/Hybrid Search, Cache, Share, Helpers)

Overview
Provides three search variants plus supporting endpoints used by the UI (cache status, share links, copy helpers, placeholder images). The search endpoints are backed by the Repliers API and return normalized listing data used by the frontend.

## Repliers API Integration

### Connection Details
- Base URL: `https://api.repliers.io` (overridable via `REPLIERS_BASE_URL`)
- Endpoint path: `/listings` (overridable via `REPLIERS_SEARCH_PATH`)
- Auth header: `REPLIERS-API-KEY: <your_api_key>`
- Timeout: controlled by `REPLIERS_TIMEOUT_SECONDS` (default 15)
- Image URLs: relative paths are normalized to `https://cdn.repliers.io/<path>?class=medium`
- **Method**: GET with query parameters (not POST with JSON body)

### Important: API Coverage Limitations
- Current API key has **Massachusetts (MA) only** coverage
- Searches for other states (TX, CA, etc.) will return empty results
- This is a data access limitation, not a technical issue
- Contact Repliers to upgrade API key for national coverage

### Query Parameters Fixed (2024)
The following parameters were corrected based on actual API behavior:

| Parameter | Correct Value | Previous (Wrong) |
|-----------|--------------|------------------|
| Method | GET | POST |
| class | "residential" | "ResidentialProperty" |
| status | "A" | ["Active"] |
| minPrice | budgetMin | minListPrice |
| maxPrice | budgetMax | maxListPrice |
| areaOrCity | city name only | city + stateOrProvince |
| propertyType | (disabled) | homeType mapping |

**propertyType Filter**: Currently disabled because Repliers API rejects common values like "single-family". Enabling this filter causes 0 results even with valid data.

### Budget Parsing
Buyer profiles store budget as string field (e.g., "400000"). The search endpoint:
1. Parses string to integer: `int(profile['budget'])`
2. Calculates ±20% range:
   - `budgetMin = budget * 0.8`
   - `budgetMax = budget * 1.2`
3. Sends as integer query parameters to Repliers

### Query Mapping
Built from buyer profile, sent as GET query parameters:
- `limit`: 50
- `offset`: 0 (for pagination)
- `class`: `"residential"`
- `status`: `"A"` (Active listings)
- `minPrice` ← `budgetMin` (from budget ±20%)
- `maxPrice` ← `budgetMax` (from budget ±20%)
- `minBedrooms` ← `bedrooms`
- `minBathrooms` ← `bathrooms` (converted to float)
- `areaOrCity` ← city extracted from `location` field
- ~~`propertyType`~~ ← disabled (causes 0 results)

### Field Mapping
From Repliers response to normalized listing format:
- Bedrooms/bathrooms: `details.numBedrooms`, `details.numBathrooms`
- Address: nested `address` object components
- Images: prefixed with CDN URL if relative paths
- Description: `details.description`
- Square feet: `details.sqft`

### Rate Limiting
- Repliers enforces rate limits (exact limits unknown)
- Returns 429 status code when exceeded
- Add exponential backoff for production usage
- Current implementation logs errors but doesn't retry

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

## Troubleshooting

### Issue: Getting 0 results
**Common Causes**:
1. **Wrong location**: API key only has MA coverage. Searches for TX, CA, etc. return empty.
   - Solution: Use Massachusetts cities (Boston, Cambridge, Worcester, etc.)
   
2. **propertyType filter enabled**: Repliers rejects common values like "single-family"
   - Solution: Keep propertyType filter commented out in code
   
3. **Budget range too narrow**: No properties match price criteria
   - Solution: Widen budget range or use ±20% flexibility
   
4. **Wrong parameter format**: Old code used POST with JSON, API expects GET with query params
   - Solution: Already fixed in current version (2024)

### Issue: API returns 429 (Rate Limit)
**Symptoms**: 
```
httpx.HTTPStatusError: Client error '429 Too Many Requests'
```

**Solutions**:
1. Add delay between requests (avoid rapid testing loops)
2. Implement exponential backoff in production
3. Cache search results to reduce API calls
4. Contact Repliers to increase rate limits

### Issue: Environment variable not loaded
**Symptoms**:
```
ValueError: REPLIERS_API_KEY environment variable not set
```

**Solutions**:
1. Create `.env` file in project root with `REPLIERS_API_KEY=your_key`
2. Ensure `python-dotenv` is installed: `pip install python-dotenv`
3. Verify `.env` is loaded: `from dotenv import load_dotenv; load_dotenv()`
4. Check `backend/app/services/repliers.py` has dotenv loading at module level

### Issue: Budget not applied to search
**Symptoms**: Getting properties outside expected price range

**Root Cause**: Budget stored as string in database (`budget` column)

**Solution**: Already fixed in current version. The code now:
1. Parses string to integer: `int(profile['budget'])`
2. Calculates ±20% range for flexibility
3. Sends as `minPrice` and `maxPrice` query parameters

**Verify**:
```python
# Check database value format
SELECT id, name, budget, budget_min, budget_max FROM buyer_profiles WHERE id = 1;
# Should show: budget="400000" (string), budget_min=400000, budget_max=500000 (integers)
```

### Testing Tools

**Test Basic Search**:
```bash
python scripts/test_repliers_search.py --city "Boston" --state MA \
  --budget-min 400000 --budget-max 700000 --bedrooms 2
```

**Test Geographic Coverage**:
```bash
python scripts/test_city_coverage.py
# Tests multiple cities to identify API coverage limitations
```

**Test Exact Parameters**:
```bash
python scripts/test_exact_search.py
# Minimal test with known-good parameters
```

**Check Profile Data**:
```bash
python scripts/check_profile_data.py
# Inspects database to verify profile fields before search
```

