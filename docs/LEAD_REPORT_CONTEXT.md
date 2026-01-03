# Lead Report Generation - Implementation Context

## Overview

This document captures the lead-to-report pipeline we built, including the LeadPropertyAnalyzer, photo insights via Gemini Vision, and report generation for leads.

---

## Lead Types

| Type | Has Property | Has Budget | Example |
|------|-------------|------------|---------|
| **property_specific** | Yes | Maybe | "I'm interested in 123 Main St" |
| **area_search** | No | Maybe | "Looking for 3 bed 2 bath in Worcester under $750k" |
| **general_inquiry** | No | No | "What's available in Boston?" |

---

## Key Services

### 1. LeadPropertyAnalyzer

**Location:** `backend/app/services/lead_property_analyzer.py`

**Purpose:** Property-centric analysis for leads (different from buyer profile matching)

**Three Layers:**
1. **MLS Text Analysis** (OpenAI) - Headlines, highlights, market position, concerns
2. **Vision Analysis** (Gemini) - Photo-based observations
3. **Comparison** - To original property they inquired about (if applicable)

**Output Schema:**
```python
{
    "headline": "5-8 word hook",
    "property_highlights": [
        {"feature": "...", "evidence": "MLS quote", "why_notable": "..."}
    ],
    "market_position": {
        "price_assessment": "...",
        "days_on_market_insight": "...",
        "price_history": "...",
        "value_indicators": [...]
    },
    "things_to_consider": [
        {"concern": "...", "evidence": "...", "risk_level": "low|medium|high", "follow_up": "..."}
    ],
    "photo_insights": [
        {"observation": "...", "photo_index": 0, "implication": "...", "type": "highlight|concern|red_flag", "confidence": "high|medium"}
    ],
    "comparison_to_original": {...} or null,
    "agent_summary": "2-3 sentences"
}
```

### 2. Vision Analysis (Gemini)

**Model:** `gemini-2.0-flash` (configurable via `GEMINI_MODEL_VISION`)

**Tuned Prompt Focus for Leads:**

**PRIORITIZE HIGHLIGHTS (show value):**
- Quality finishes: hardwood floors, granite/quartz, stainless appliances
- Recent updates: new kitchen, renovated bathrooms
- Standout features: natural light, open layout, views

**ONLY FLAG SERIOUS CONCERNS:**
- Water damage: stains on ceilings/walls
- Structural: visible cracks, foundation issues
- Major deferred maintenance: roof damage, siding issues

**DO NOT FLAG (too nitpicky for first contact):**
- Popcorn ceilings
- Older but functional appliances
- Minor wear (scuffs, worn carpet)
- Dated light fixtures
- Paint colors or decor

**Output:** Max 4 items (2-3 highlights, 1-2 serious concerns)

---

## Lead Outreach Flow

**Endpoint:** `POST /api/leads/{lead_id}/generate-outreach`

**Location:** `backend/app/routers/leads.py` (around line 1250)

### Flow:
1. Get lead from database
2. Get/create buyer profile from lead
3. Search for listings (Similar Listings API or criteria-based)
4. Select top 5 by finalScore
5. Run LeadPropertyAnalyzer on top 5 only (optimization)
6. Generate report synthesis
7. Persist to database (with listing_snapshots for fallback)
8. Send email if email available, otherwise return shareable link

### Key Optimization:
Vision analysis runs AFTER top 5 selection to save time (was analyzing all 15-20 listings before).

---

## Conversion Function

**Function:** `_convert_lead_analysis_to_ai_format()`

**Location:** `backend/app/routers/leads.py` (line 645)

Converts LeadPropertyAnalyzer output to frontend-expected format:

```python
{
    "whats_matching": [...],      # From property_highlights
    "whats_missing": [...],       # From market_position
    "red_flags": [...],           # From things_to_consider
    "agent_take_ai": "...",       # From agent_summary
    "vision_complete": True,
    "photo_headline": "...",      # Generated from photo_insights
    "photo_summary": "...",       # Top highlight observation
    "photo_matches": [...],       # Photo highlights for "Why This Could Be a Good Match"
    "photo_red_flags": [...],     # Photo concerns for "What You Should Know"
    "_lead_analysis": {...}       # Original analysis preserved
}
```

---

## Frontend Display

### BuyerReportPage.tsx

**Location:** `frontend/src/pages/BuyerReportPage.tsx`

**Displays:**
- Lead context card (if property-specific lead)
- Intro paragraph (lead-aware framing)
- Ranked picks with reasons
- Requirements comparison table
- Property cards with AI analysis

### ClientSummaryDeep.tsx

**Location:** `frontend/src/components/ClientSummaryDeep.tsx`

**Sections:**
1. **"Why This Could Be a Good Match"** - Merged text + photo matches
2. **"What You Should Know"** - Concerns (red_flags + photo_red_flags)
3. **"My Take"** - Agent summary

**Key Fix:** Increased concern limit from 3 to 5 (line 323) so photo insights aren't cut off.

---

## Three-Scenario Framing (Lead-Aware)

**Location:** `backend/app/services/report_synthesizer.py`

| Scenario | Condition | Intro Framing |
|----------|-----------|---------------|
| Property-specific | `lead_context.propertyAddress` exists | "Since you were looking at [address]..." |
| Budget mentioned | Has `budgetMax` but no property | "Based on the price range you mentioned..." |
| General inquiry | Only location | "Here are some popular homes in [location]..." |

**Key Rules:**
- Never say "your budget" → use "the price range you mentioned"
- Never say "your criteria" → use "what you're looking for"
- First contact = be helpful, not presumptuous

---

## Email Template (Lead-Aware)

**Location:** `backend/app/routers/buyer_reports.py` (function `build_lead_email_body`)

**Three scenarios:**
1. **Property-specific:** "I noticed you were looking at [address] on [source]..."
2. **Area search:** "I noticed you're exploring homes in [location]..."
3. **Fallback:** Generic intro

---

## Database Fallback

When search context expires (backend restart), reports use `listing_snapshots` from `synthesis_data` JSONB column.

**Table:** `buyer_reports`
**Column:** `synthesis_data` (JSONB)
**Contains:** `listing_snapshots`, `listing_analysis`, `ranked_picks`, etc.

---

## Key Files Modified

| File | Changes |
|------|---------|
| `backend/app/services/lead_property_analyzer.py` | Created - property-centric analysis |
| `backend/app/routers/leads.py` | Added outreach generation, conversion function |
| `backend/app/services/report_synthesizer.py` | Added lead-aware framing |
| `backend/app/routers/buyer_reports.py` | Email template for leads |
| `frontend/src/components/ClientSummaryDeep.tsx` | Increased limit to 5, photo handling |
| `frontend/src/components/lead-card.tsx` | Email optional for outreach |
| `frontend/src/components/lead-intel-tab.tsx` | Email optional for outreach |

---

## Environment Variables

```bash
# Required
OPENAI_API_KEY=...
GEMINI_API_KEY=...
REPLIERS_API_KEY=...

# Optional
GEMINI_MODEL_VISION=gemini-2.0-flash  # Default
OPENAI_MODEL=gpt-4o                    # Default
```

---

## Known Issues / Future Work

1. **Multi-family filtering:** Area search returns investment properties to residential buyers
2. **Parking/schools:** Lead mentioned "need parking and decent schools" but not reflected in search
3. **Chatbot not working:** Separate microservice on port 8010 not running (separate issue)
