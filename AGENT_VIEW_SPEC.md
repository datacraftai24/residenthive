# Agent Search Tab - UI Specification

## Location
**Path**: Agent Search → AI Recommendations Tab
**File**: `frontend/src/components/agent-dual-view-search.tsx`

## Current State (Before Changes)
- Single view showing property cards with full AI analysis
- No compact/detailed toggle
- All information displayed at once

---

## Target Design: Two View Modes

### 1. COMPACT VIEW (Default)
**Purpose**: Quick scanning - Zillow-style horizontal layout for fast property review

#### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  [Photo 40%]  │  [Info 60%]                                 │
│               │  Price + Address                             │
│               │  Beds/Baths/Sqft                             │
│               │  "One-line AI summary"                       │
│               │  ✓ 2-car garage (short)                      │
│               │  ✓ Updated kitchen (short)                   │
│               │  ⚠ Missing home office (short)               │
│               │  [Share] [More ▼]                            │
└─────────────────────────────────────────────────────────────┘
```

#### Compact View Features
1. **Photo Section (40% width)**
   - Main image (clickable to cycle)
   - Thumbnail strip (5 thumbnails max)
   - Image counter badge (e.g., "1/42")
   - Match score badge overlay (e.g., "95% Match")
   - Selection checkbox

2. **Info Section (60% width)**
   - Price (large, green, bold)
   - Address + City, State
   - Specs row: beds | baths | sqft
   - One-line AI summary (italic, gray)

3. **Quick Scan Items (SHORT bullets, NO evidence)**
   - Top 2 match reasons (green checkmark icon)
   - Top 2 concerns (amber warning icon)
   - Top 1 hidden gem (purple star icon)
   - **TEXT MUST BE SHORT** (e.g., "2-car garage", "Updated kitchen")
   - **NO EVIDENCE QUOTES** (remove "Feature you confirmed with evidence: '...'")

4. **Action Buttons**
   - Share button
   - More/Less toggle button

---

### 2. COMPACT VIEW - EXPANDED (Click "More")
**Purpose**: Show full agent analysis when user clicks "More"

#### Expanded Section Layout
```
Agent's Take                                    [SHOW FIRST badge]

┌─ Agent Narrative (White box) ──────────────────────────────┐
│ I'm really excited about this property! It has the updated │
│ kitchen you wanted, with the listing mentioning that it    │
│ 'flows seamlessly off the dining area'...                  │
└─────────────────────────────────────────────────────────────┘

┌─ What I Verified (Green box) ───────────────────────────────┐
│ ✓ Feature you confirmed with evidence: 'The updated        │
│   kitchen flows seamlessly...' [FULL EVIDENCE TEXT]        │
│ ✓ Another verified feature with quote: 'The inviting...'   │
└─────────────────────────────────────────────────────────────┘

┌─ Honest Concerns (Amber box) ───────────────────────────────┐
│ ⚠ Missing: home office space - This could impact your      │
│   work-from-home needs. Typical cost to create...          │
└─────────────────────────────────────────────────────────────┘

┌─ 💎 Hidden Opportunities (Purple box) ──────────────────────┐
│ ⭐ The professionally landscaped yard could be a lovely...  │
└─────────────────────────────────────────────────────────────┘

┌─ Information Needed (Blue box) ─────────────────────────────┐
│ • Age of HVAC system                                        │
│ • Property tax history                                      │
└─────────────────────────────────────────────────────────────┘

┌─ Next Steps (Gray box) ─────────────────────────────────────┐
│ ☐ Verify garage door opener functionality                  │
│ ☐ Request disclosure documents                             │
└─────────────────────────────────────────────────────────────┘

[AI badges: 🤖 95% | ✓ 42 Photos | 🎯 4 Matches | ⚠️ 1 Concern]
```

#### Expanded View Features
1. **Header**
   - "Agent's Take" title with blue icon
   - Recommendation badge: SHOW FIRST | SOLID OPTION | MAYBE | SKIP

2. **Agent Narrative** (White background)
   - Conversational paragraph explaining why selected
   - Professional, enthusiastic agent tone
   - Example: "I'm really excited about this property! It has the updated kitchen you wanted..."

3. **What I Verified** (Green background)
   - ALL match reasons WITH full evidence text
   - Include quoted text from listing
   - Green checkmark icon for each

4. **Honest Concerns** (Amber background)
   - ALL dealbreakers WITH full explanation
   - Include cost estimates, impact analysis
   - Amber warning icon for each

5. **Hidden Opportunities** (Purple background)
   - Opportunities buyer might not see
   - Value-add potential
   - Purple star icon for each

6. **Information Needed** (Blue background)
   - Missing data points
   - What agent needs to verify
   - Bullet points

7. **Next Steps** (Gray background)
   - Actionable agent tasks
   - Checkboxes for completion tracking

8. **Footer Badges**
   - AI Score percentage
   - Photos analyzed count
   - Verified matches count
   - Concerns count
   - Hidden gems count

---

### 3. DETAILED VIEW (Toggle to "Detailed")
**Purpose**: Full vertical property card with all analysis upfront

#### Layout
Same as expanded compact view, but:
- Full-width vertical card layout
- ALL information visible by default (no "More" button)
- Larger images (aspect ratio 4:3)
- Same "Agent's Take" section as compact expanded
- Match Score Breakdown (visual progress bars)
- Matched Requirements (badge grid)
- Points to Consider (badge grid)
- Property Description (3-line clamp)
- Action buttons at bottom

---

## Key Differences Summary

| Feature | Compact (Collapsed) | Compact (Expanded) | Detailed |
|---------|-------------------|-------------------|----------|
| Layout | Horizontal 40/60 | Horizontal + expansion | Full vertical |
| Quick bullets | Short (no evidence) | N/A | N/A |
| Agent's Take | Hidden | Full narrative | Full narrative |
| Evidence text | NO | YES (in expansion) | YES |
| Match reasons | Top 2 only | ALL with evidence | ALL with badges |
| Concerns | Top 2 only | ALL with explanation | ALL with badges |
| Hidden gems | Top 1 only | ALL | ALL |
| Default state | Collapsed | User expands | Everything shown |

---

## Data Structure Requirements

### Backend Must Send
```typescript
{
  matchReasons: string[],  // WITH evidence text for detailed/expanded
  dealbreakers: string[],  // WITH explanation for detailed/expanded
  aiInsights: {
    personalizedAnalysis: {
      summary: string,           // Agent narrative
      hiddenGems: string[],
      missingInfo: string[],
      agentTasks: string[]
    }
  }
}
```

### Frontend Processing
1. **For Compact Quick Bullets**: Use helper function `extractShortReason()` to strip evidence
2. **For Expanded/Detailed**: Show full text WITH evidence

---

## Toggle Behavior
```
[Compact] [Detailed] <-- Buttons at top

Compact view:
  - Default: Collapsed (short bullets only)
  - User clicks "More": Expands to show Agent's Take

Detailed view:
  - Everything visible by default
  - No "More" button
  - Full Agent's Take section shown
```

---

## Why This Failed Previously

1. **Backend data** likely doesn't have `aiInsights.personalizedAnalysis` populated
2. **Evidence text mixed with bullets** - need to separate short vs full
3. **Wrong data structure** - expandable section wasn't getting the right data

## Next Steps

1. **Verify backend response** - Check if `aiInsights.personalizedAnalysis` exists
2. **Check data in browser console** - See what's actually being sent
3. **Fix backend first** if needed - Ensure proper data structure
4. **Then fix frontend** - Add proper parsing and display logic
