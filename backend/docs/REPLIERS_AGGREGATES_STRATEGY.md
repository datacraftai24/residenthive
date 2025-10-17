# Repliers Aggregates API - Long-term Strategy

**Date**: 2025-10-15
**Account ID**: 3359
**Status**: Documentation for future implementation

## Overview

Repliers Aggregates API provides real-time distribution counts across all listings without fetching individual records. This enables advanced filtering, market intelligence, and better UX.

## Available Aggregate Fields

Tested and confirmed working:

| Field | Description | Use Case |
|-------|-------------|----------|
| `details.numBedrooms` | Bedroom distribution (1-60) | Filter counts, market analysis |
| `details.numBathrooms` | Bathroom distribution (1-198) | Filter counts, market analysis |
| `listPrice` | Price ranges (sale/lease) | Histogram sliders, pricing insights |
| `address.state` | State distribution | Geographic filtering |
| `details.yearBuilt` | Year built distribution | Age-based filtering |
| `details.propertyType` | High-level types (Residential, Commercial, etc.) | Category filtering |
| `details.style` | Specific styles (Single Family, Condo, etc.) | Property type filtering |

**Not Supported**: `city` (returns error)

## Sample Data (Account 3359 - MLS_PIN)

### Bedroom Distribution
```json
{
  "1": 2078,
  "2": 5592,
  "3": 6210,  // Most common
  "4": 3814,
  "5": 1372,
  "6": 700
}
```

### Bathroom Distribution
```json
{
  "1": 6835,
  "2": 7169,  // Most common
  "3": 4449,
  "4": 1760,
  "5": 718
}
```

### Property Styles
```json
{
  "Single Family Residence": 8363,  // Most common
  "Condominium": 5761,
  "Apartment": 3770,
  "Other": 3164,
  "Attached (Townhouse/Rowhouse/Duplex)": 609,
  "Multi Family": 362
}
```

### Price Distribution (Sale)
```json
{
  "400000-500000": 1760,
  "500000-600000": 1836,  // Peak range
  "600000-700000": 1738,
  "700000-800000": 1478
}
```

### Geographic Distribution
```json
{
  "ma": 25005,  // Massachusetts (primary)
  "ri": 233,    // Rhode Island
  "nh": 188,    // New Hampshire
  "ct": 33      // Connecticut
}
```

## Strategic Use Cases

### 1. Dynamic Filter UI (High Priority)
**Goal**: Show counts next to filter options (like Zillow)

**Implementation**:
```javascript
// Example: Bedroom filter dropdown
<select>
  <option>1 BR (2,078 available)</option>
  <option>2 BR (5,592 available)</option>
  <option>3 BR (6,210 available)</option> ← Most options
  <option>4 BR (3,814 available)</option>
</select>
```

**Benefits**:
- Users see availability before filtering
- Reduce "0 results" frustration
- Guide users to populated searches

### 2. Market Intelligence Dashboard (Medium Priority)
**Goal**: Provide agents with real-time market insights

**Features**:
- Price distribution charts
- Inventory heatmaps (state-level)
- Property type trends
- "Hot market" indicators

**Example Metrics**:
- "8,363 Single Family homes available"
- "Peak price range: $500-600k (1,836 listings)"
- "Most common: 3BR/2BA configuration"

### 3. Smart Search Suggestions (Medium Priority)
**Goal**: Guide users when searches return few results

**Logic**:
```python
# User searches: "5BR under $300k"
# Aggregates show: Only 87 such listings

# Suggest alternatives:
# - "Expand to 4BR? (1,448 more options)"
# - "Increase budget to $400k? (200 more 5BR homes)"
```

### 4. Price Range Slider with Histogram (Low Priority)
**Goal**: Visual price distribution on slider

**Implementation**: Show bars indicating listing density at each price range

### 5. Homepage Statistics (Low Priority)
**Goal**: Build trust with real-time data

```html
<h1>25,487 Active Listings</h1>
<p>Across Massachusetts, Rhode Island, and New Hampshire</p>
```

### 6. Saved Search Alerts Optimization (Future)
**Goal**: Notify users of new inventory

**Implementation**: Track aggregate counts over time, alert on increases

### 7. "Similar Homes" Recommendations (Future)
**Goal**: Cross-sell related properties

**Logic**: Use aggregates to find properties with similar characteristics

## Technical Implementation Plan

### Phase 1: Basic Filters (2-3 hours)
- [ ] Create `app/services/repliers_aggregates.py` client
- [ ] Add caching (15 min TTL)
- [ ] Create `/api/listings/filter-options` endpoint
- [ ] Update frontend dropdowns to show counts

### Phase 2: Market Dashboard (1 day)
- [ ] Create agent analytics page
- [ ] Add price distribution charts
- [ ] Add geographic heatmap
- [ ] Track trends over time

### Phase 3: Advanced Features (1 week)
- [ ] Smart search suggestions
- [ ] Price slider with histogram
- [ ] Similar homes recommendations
- [ ] Inventory alerts

## Backend Service Template

```python
# app/services/repliers_aggregates.py

from typing import Dict, Optional
import httpx
from functools import lru_cache

class RepliersAggregatesClient:
    CACHE_TTL = 900  # 15 minutes

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key

    def _headers(self) -> Dict[str, str]:
        return {
            "REPLIERS-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }

    @lru_cache(maxsize=50)
    def get_aggregate(self, field: str, filters: Optional[Dict] = None) -> Dict:
        """Fetch aggregate with caching"""
        url = f"{self.base_url}/listings"
        params = {"aggregates": field, "limit": 1}

        if filters:
            params.update(filters)

        with httpx.Client() as client:
            r = client.get(url, params=params, headers=self._headers())
            r.raise_for_status()
            return r.json().get("aggregates", {})

    def get_filter_options(self, profile: Optional[Dict] = None) -> Dict:
        """Get all filter options with counts for UI"""
        filters = {}
        if profile:
            # Apply user's search context
            if profile.get("location"):
                filters["city"] = profile["location"]
            if profile.get("budgetMin"):
                filters["minPrice"] = profile["budgetMin"]
            if profile.get("budgetMax"):
                filters["maxPrice"] = profile["budgetMax"]

        return {
            "bedrooms": self.get_aggregate("details.numBedrooms", filters),
            "bathrooms": self.get_aggregate("details.numBathrooms", filters),
            "propertyStyles": self.get_aggregate("details.style", filters),
            "priceRanges": self.get_aggregate("listPrice", filters)
        }
```

## API Endpoint Template

```python
# app/routers/listings.py

@router.get("/api/listings/filter-options")
def get_filter_options(
    location: Optional[str] = None,
    minPrice: Optional[int] = None,
    maxPrice: Optional[int] = None
):
    """
    Return available filter options with real-time counts

    Example Response:
    {
      "bedrooms": {"1": 2078, "2": 5592, "3": 6210},
      "bathrooms": {"1": 6835, "2": 7169, "3": 4449},
      "propertyStyles": {"Single Family Residence": 8363, "Condominium": 5761},
      "priceRanges": {"400000-500000": 1760, "500000-600000": 1836}
    }
    """
    from app.services.repliers_aggregates import RepliersAggregatesClient

    client = RepliersAggregatesClient(REPLIERS_BASE_URL, REPLIERS_API_KEY)

    filters = {}
    if location:
        filters["city"] = location
    if minPrice:
        filters["minPrice"] = minPrice
    if maxPrice:
        filters["maxPrice"] = maxPrice

    return client.get_filter_options(filters)
```

## Business Value

1. **Reduce API Costs**: 1 aggregate call replaces 100+ listing fetches
2. **Faster UX**: Pre-computed data = instant filter updates
3. **Better Conversions**: Guided search reduces dead-ends
4. **Agent Retention**: Market intelligence dashboard
5. **Competitive Advantage**: Most competitors don't leverage aggregates

## Performance Considerations

- **Caching**: Aggregate data changes slowly, safe to cache 15+ minutes
- **Parallel Requests**: Can query multiple aggregates in parallel
- **Rate Limits**: Aggregates count against same API limits as searches
- **Response Size**: Aggregates are small (~5-10KB), very fast

## Next Steps

When ready to implement:
1. Start with Phase 1 (filter counts) - highest ROI
2. Measure user engagement with new filters
3. Use analytics to decide on Phase 2/3 priorities

## Reference Links

- Repliers API Docs: https://docs.repliers.io/reference/why-use-this-api
- Account ID: 3359
- Board: MLS_PIN (Massachusetts)

## Testing Commands

```bash
# Test bedroom aggregates
curl -s "https://api.repliers.io/listings?aggregates=details.numBedrooms&limit=1" \
  -H "REPLIERS-API-KEY: $REPLIERS_API_KEY" | jq '.aggregates'

# Test price distribution
curl -s "https://api.repliers.io/listings?aggregates=listPrice&limit=1" \
  -H "REPLIERS-API-KEY: $REPLIERS_API_KEY" | jq '.aggregates'

# Test with filters (e.g., Boston only)
curl -s "https://api.repliers.io/listings?aggregates=details.style&city=Boston&limit=1" \
  -H "REPLIERS-API-KEY: $REPLIERS_API_KEY" | jq '.aggregates'
```

---

**Status**: Ready for implementation when prioritized. Continue with Phase 1A core fixes first.
