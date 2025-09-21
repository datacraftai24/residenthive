# Buyer Profile Three Tabs - Complete Flow Documentation

## Overview

The buyer profile interface in ResidentHive is organized into three distinct tabs, each serving a specific purpose in the property search and client management workflow. This document details the complete flow and logic for each tab.

## Tab Structure

The three tabs are implemented in `client/src/components/profile-viewer.tsx` (lines 154-171):

1. **Profile Details** - Basic buyer information and preferences
2. **Agent Search** - Dual-view property search for agents
3. **Smart Search** - NLP-powered conversational search

## Tab 1: Profile Details

### Purpose
Display and manage comprehensive buyer profile information including contact details, preferences, and AI-generated insights.

### Components and Data Flow

1. **Basic Information Section** (lines 175-241)
   - Email, Budget, Home Type
   - Bedrooms, Bathrooms
   - Priority Score (0-100 with visual indicator)
   - Data source: `BuyerProfile` object from `/api/buyer-profiles/${profileId}`

2. **Features and Preferences** (lines 244-282)
   - Must-Have Features (displayed as badges)
   - Dealbreakers (displayed as destructive badges)
   - Empty states handled gracefully

3. **Flexibility Analysis** (lines 285-334)
   - Budget Flexibility (0-100%)
   - Location Flexibility (0-100%)
   - Timing Flexibility (0-100%)
   - Visual progress bars for each metric

4. **AI Behavioral Analysis** (lines 351-371)
   - Tags and Persona display
   - Only shown if AI analysis exists
   - Data from enhanced profile endpoint

5. **Agent Actions & Feedback** (lines 336-349)
   - Quick action buttons for agents
   - Feedback collection interface

### Key Features
- **Edit Mode**: Conversational edit interface (line 99-107)
- **Share Profile**: Generate shareable links (line 142-145)
- **Confidence Display**: Shows NLP confidence for voice/text inputs

## Tab 2: Agent Search

### Purpose
Sophisticated dual-view search system designed for real estate agents to analyze market data and AI recommendations.

### Implementation
Component: `AgentDualViewSearch` (agent-dual-view-search.tsx)

### Search Flow

1. **Initial Search Trigger** (lines 171-175)
   ```typescript
   POST /api/agent-search
   {
     profileId: profile.id,
     useReactive: true,  // Enable reactive search
     forceEnhanced: false
   }
   ```

2. **Dual View System**:

   **View 1: Market Overview** (lines 399-491)
   - Broad market search showing all available properties
   - Table format with:
     - Property address and details
     - Price, beds/baths, square footage
     - Property type and days on market
     - Action buttons (View, Share)
   - Search criteria displayed in header

   **View 2: AI Recommendations** (lines 493-623)
   - Scored and filtered properties
   - Match percentage (0-100%)
   - Match reasons and AI insights
   - Visual analysis results (when available)
   - Card-based layout with rich details

3. **Reactive Search Features**:
   - **Auto-Enhancement**: If initial search returns <20 results, system automatically expands criteria
   - **Search Adjustments**: Shows what was changed (e.g., budget ±20%, bedrooms ±1)
   - **Agent Recommendations**: Suggests actions based on results
   - **Manual Enhancement**: Button to force expanded search

### Data Processing

1. **Backend Flow** (agent-search-service.ts):
   ```
   Profile → View 1 Broad Search → Repliers API
                ↓
   View 1 Results → Reused in View 2
                ↓
   View 2 AI Analysis → Scoring → Categorization
   ```

2. **Scoring System** (listing-scorer.ts):
   - Feature Match: 25%
   - Budget Match: 20%
   - Bedroom Match: 15%
   - Location Match: 10%
   - Visual Tag Match: 10%
   - Behavioral Tag Match: 10%
   - Listing Quality: 10%
   - Penalties: Dealbreakers (-30 points each)
   - Floor: Minimum 10 points

3. **Performance Optimizations**:
   - View 2 reuses View 1 listings (no duplicate API calls)
   - Visual analysis temporarily disabled (89s → 5s improvement)
   - Results limited to 50 listings in View 1, 20 in View 2

## Tab 3: Smart Search

### Purpose
Natural language search interface allowing conversational refinements and search history tracking.

### Implementation
Component: `NLPListingSearch` (nlp-listing-search.tsx)

### Search Flow

1. **Initial Search** (lines 89-91)
   ```typescript
   POST /api/listings/search-nlp/${profile.id}
   // No body - uses profile preferences
   ```

2. **Refinement Search** (lines 93-102)
   ```typescript
   POST /api/listings/search-nlp/${profile.id}
   {
     contextNlpId: currentNlpId,
     refinementText: "prefer newer homes"
   }
   ```

3. **Search History**:
   - Fetched from `/api/listings/nlp-history/${profile.id}`
   - Shows query, results count, execution time
   - Clickable to restore previous searches

### Features

1. **Profile Context Display** (lines 116-143)
   - Shows current search context
   - Location, budget, bedrooms, bathrooms
   - Visual indicators with icons

2. **Conversational Refinement** (lines 182-199)
   - Natural language input field
   - Examples: "prefer newer homes", "closer to schools"
   - Maintains context via NLP ID

3. **Search Results** (lines 253-337)
   - AI-generated summary of search
   - Property cards with key details
   - Click to select functionality
   - Technical details in collapsible section

4. **Empty State Handling**:
   - Helpful message when no results
   - Suggestions for refinement
   - Visual feedback with icons

## Data Flow Summary

### Profile Details Tab
```
GET /api/buyer-profiles/${profileId} → Basic Profile
GET /api/buyer-profiles/${profileId}/enhanced → Tags & Persona
```

### Agent Search Tab
```
POST /api/agent-search → Dual View Results
  ├── View 1: Broad Market Search
  └── View 2: AI Recommendations with Scoring
```

### Smart Search Tab
```
POST /api/listings/search-nlp/${profileId} → NLP Search
GET /api/listings/nlp-history/${profileId} → Search History
```

## Key Technical Details

1. **State Management**:
   - React Query for data fetching and caching
   - Local state for UI controls (active view, search history)
   - Profile data shared across all tabs

2. **Performance Considerations**:
   - 5-minute cache on search results (staleTime: 300000)
   - Pagination in table views (20-50 items)
   - Lazy loading of enhanced profile data

3. **Error Handling**:
   - Loading states with skeletons
   - Empty states with helpful messages
   - Network error fallbacks

4. **Responsive Design**:
   - Mobile-optimized with conditional rendering
   - Abbreviated labels on small screens
   - Grid layouts that stack on mobile

## Integration Points

1. **Client Dashboard**: 
   - Uses agent search endpoint for AI recommendations
   - Transforms data format for compatibility

2. **Share Functionality**:
   - Profile share button generates public links
   - Shareable profiles have expiration dates

3. **Visual Analysis**:
   - Currently disabled for performance
   - When enabled, adds image-based property matching

## Future Enhancements

1. **Pending Features**:
   - Re-enable visual analysis with optimization
   - Integrate comprehensive listing parser
   - Add data persistence layer

2. **Known Issues**:
   - NaN score validation needed
   - AI recommendations need client dashboard integration
   - Parser created but not yet integrated