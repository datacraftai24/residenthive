# Smart Rules Decision Document

**Date**: 2025-10-15
**Account ID**: 3359
**Decision**: Use client-side mapping for now, migrate to Smart Rules when scaling

## What are Smart Rules?

Smart Rules is a Repliers feature that handles synonym matching and response normalization at the API level.

**Example Configuration**:
```json
{
  "synonyms": [
    {
      "values": ["Single Family Residence", "Detached", "House"],
      "request": { "params": ["style"] },
      "response": {
        "fields": ["details.style"],
        "normalizedValue": "House"
      }
    }
  ]
}
```

**Benefits**:
- No client-side mapping code needed
- Centralized synonym management across all MLS boards
- Response normalization (consistent API responses)
- Reduces maintenance burden when adding new MLS boards

**Limitations**:
- One-time configuration effort
- Slight performance impact with many rules
- Less visibility/control in codebase
- Requires API PATCH request to configure

## Current Situation

**MLS Board**: MLS_PIN (Massachusetts only)

**Property Style Values** (from aggregates):
```json
{
  "Single Family Residence": 8363,
  "Condominium": 5761,
  "Apartment": 3770,
  "Attached (Townhouse/Rowhouse/Duplex)": 609,
  "Multi Family": 362
}
```

**Our User-Facing Values**:
- "single-family" → "Single Family Residence"
- "condo" → "Condominium"
- "apartment" → "Apartment"
- "townhouse" → "Attached (Townhouse/Rowhouse/Duplex)"
- "multi-family" → "Multi Family"

## Decision: Client-Side Mapping (For Now)

**Rationale**:
1. **Simple Use Case**: Only 6 property types to map
2. **Single MLS Board**: MLS_PIN only, normalization less critical
3. **Already Implemented**: Code written and working in `repliers.py`
4. **Full Control**: Easy to debug and modify
5. **No API Dependencies**: Works immediately without configuration

**Implementation** (in `app/services/repliers.py`):
```python
style_map = {
    "single-family": "Single Family Residence",
    "condo": "Condominium",
    "condominium": "Condominium",
    "townhouse": "Attached (Townhouse/Rowhouse/Duplex)",
    "multi-family": "Multi Family",
    "apartment": "Apartment"
}
api_value = style_map.get(home_type.lower(), home_type)
q["style"] = api_value
```

## Migration Path to Smart Rules

**Trigger Points for Migration**:
1. Adding 2+ additional MLS boards
2. Property type mappings become complex (10+ types)
3. Need for response normalization across boards
4. Frontend also needs mapping logic (DRY violation)

**When to Migrate**: When we expand beyond Massachusetts or add 3+ boards

### Migration Steps

#### 1. Define Smart Rules Configuration

```json
{
  "synonyms": [
    {
      "values": ["Single Family Residence", "Detached", "single-family"],
      "request": { "params": ["style"] },
      "response": {
        "fields": ["details.style"],
        "normalizedValue": "Single Family Residence"
      }
    },
    {
      "values": ["Condominium", "Condo", "condo"],
      "request": { "params": ["style"] },
      "response": {
        "fields": ["details.style"],
        "normalizedValue": "Condominium"
      }
    },
    {
      "values": ["Apartment", "apartment"],
      "request": { "params": ["style"] },
      "response": {
        "fields": ["details.style"],
        "normalizedValue": "Apartment"
      }
    },
    {
      "values": ["Attached (Townhouse/Rowhouse/Duplex)", "Townhouse", "townhouse"],
      "request": { "params": ["style"] },
      "response": {
        "fields": ["details.style"],
        "normalizedValue": "Townhouse"
      }
    },
    {
      "values": ["Multi Family", "multi-family", "MultiFamily"],
      "request": { "params": ["style"] },
      "response": {
        "fields": ["details.style"],
        "normalizedValue": "Multi Family"
      }
    }
  ]
}
```

#### 2. Configure Smart Rules via API

```bash
# Save rules to file
cat > smart_rules.json <<'EOF'
{
  "synonyms": [ ... ]
}
EOF

# Apply rules to account
curl -X PATCH "https://api.repliers.io/accounts/3359" \
  -H "REPLIERS-API-KEY: $REPLIERS_API_KEY" \
  -H "Content-Type: application/json" \
  -d @smart_rules.json
```

#### 3. Update Code to Remove Mapping

```python
# BEFORE (client-side mapping):
style_map = {...}
q["style"] = style_map.get(home_type.lower(), home_type)

# AFTER (Smart Rules):
# Just pass user value directly - API handles synonyms
q["style"] = home_type
```

#### 4. Test Thoroughly

```bash
# Test each property type
curl "https://api.repliers.io/listings?style=single-family&limit=1" \
  -H "REPLIERS-API-KEY: $REPLIERS_API_KEY"

curl "https://api.repliers.io/listings?style=condo&limit=1" \
  -H "REPLIERS-API-KEY: $REPLIERS_API_KEY"
```

#### 5. Verify Response Normalization

Check that all responses use normalized values:
```json
{
  "details": {
    "style": "Single Family Residence"  // Always normalized
  }
}
```

## Comparison Table

| Aspect | Client-Side Mapping | Smart Rules |
|--------|---------------------|-------------|
| **Setup Time** | 0 min (already done) | 30-60 min (config + testing) |
| **Maintenance** | Update code for changes | Update API config |
| **Multi-MLS** | Separate mappings per board | Unified across boards |
| **Performance** | No API overhead | Slight API overhead |
| **Response Normalization** | Manual in code | Automatic |
| **Visibility** | In codebase | API configuration |
| **Best For** | 1-2 boards, simple mappings | 3+ boards, complex mappings |

## Cost-Benefit Analysis

**Current Approach (Client-Side)**:
- Setup: 0 hours (already done)
- Maintenance: ~1-2 hours/year for updates
- Total Year 1: ~2 hours

**Smart Rules Approach**:
- Setup: ~2 hours (config + testing)
- Maintenance: ~0.5 hours/year
- Total Year 1: ~2.5 hours
- Total Year 2: ~0.5 hours

**Break-Even Point**: Year 2 (if single board) or immediately (if adding 2+ boards)

## Recommendation

**Current Decision**: Stick with client-side mapping

**Revisit When**:
- [ ] Adding 2nd MLS board
- [ ] Property types exceed 10 mappings
- [ ] Frontend needs same mapping logic
- [ ] Response normalization becomes requirement
- [ ] Q2 2026 review (6 months)

## Reference

- Smart Rules Guide: https://help.repliers.com/en/article/smart-rules-implementation-guide-cbmzaw/
- Account ID: 3359
- Current Code: `backend/app/services/repliers.py` lines 79-95

---

**Status**: Decision made - using client-side mapping for Phase 1A. Migration path documented.
