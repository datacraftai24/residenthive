# Search System Documentation

## Overview

The ResidentHive search system uses the Repliers MLS API with NLP (Natural Language Processing) to provide intelligent property searches. The system includes progressive search widening to ensure agents always have properties to show their clients.

## Architecture

### Core Components

1. **RepliersService** (`/server/services/repliers-service.ts`)
   - Centralized service for all Repliers API interactions
   - Handles NLP prompt generation
   - Manages API authentication and requests

2. **NLPSearchService** (`/server/nlp-search-service.ts`)
   - Orchestrates the NLP search workflow
   - Persists search logs to database
   - Handles search refinements with context

3. **SearchWideningService** (`/server/services/search-widening-service.ts`)
   - Implements progressive search widening
   - Provides clear messaging for agents
   - Ensures searches always return results

## Search Flow

### 1. Standard Agent Search
```
Agent initiates search → NLP prompt generation → Repliers NLP API → Execute search → Persist results
```

### 2. NLP Prompt Generation

The system generates NLP prompts based on the input method:

- **Voice/Text Input**: Uses the raw input directly
- **Form Input**: Builds prompt from structured fields

Example prompts:
- Voice: "I'm looking for a 3 bedroom house in Austin with a nice backyard for my kids. My budget is around 500 to 600 thousand."
- Form: "under $600,000 3 bedrooms single-family in Quincy, MA preferably with garage, modern kitchen"

### 3. Progressive Search Widening

When initial searches return insufficient results (< 5 properties), the system automatically widens the search:

#### Widening Levels

1. **Exact Match** (`exact`)
   - Original buyer criteria
   - No adjustments

2. **Remove Features** (`no_features`)
   - Removes feature requirements (garage, modern kitchen, etc.)
   - Keeps budget, bedrooms, location intact
   - Message: "I found X properties by focusing on your core needs (location, budget, bedrooms) and temporarily setting aside specific feature preferences..."

3. **Flexible Bedrooms** (`flexible_beds`)
   - Allows ±1 bedroom flexibility
   - Features still removed
   - Message: "To expand your options, I've included properties with 2 to 4 bedrooms..."

4. **Flexible Budget** (`flexible_budget`)
   - Expands budget by 20%
   - Keeps bedroom flexibility
   - Message: "I've expanded the search to include properties up to 20% above your target budget..."

5. **Location Only** (`location_only`)
   - Shows all properties in the specified location
   - Removes all other criteria
   - Message: "Here are all X available properties in [location]. This complete view of the market helps us understand all options..."

## API Integration

### Repliers NLP API

The system uses a two-step process:

1. **NLP Configuration Request**
   ```javascript
   POST https://api.repliers.io/nlp
   {
     "prompt": "3 bedroom house in Austin under 600k",
     "nlpId": "previous-search-id" // optional, for refinements
   }
   ```

2. **Execute Search**
   ```javascript
   GET [generated URL from NLP response]
   ```

### Authentication
All requests include the `REPLIERS-API-KEY` header.

## Data Persistence

All searches are logged to the database:

```sql
nlpSearchLogs:
- profileId
- agentId  
- nlpQuery (original prompt)
- nlpResponse (NLP API response)
- searchUrl (generated search URL)
- searchResults (property listings)
- executionTime
- nlpId (for search refinements)
```

## Key Features

### 1. Smart Prompt Generation
- Detects input method (voice/text vs form)
- Softens requirements ("preferably with" instead of "must have")
- Handles missing data gracefully

### 2. Progressive Widening
- Automatic detection when results are insufficient
- Step-by-step easing of restrictions
- Clear communication to agents about what changed

### 3. Agent Messaging
- Pre-written messages for each widening level
- Professional, client-ready language
- Explains adjustments clearly

### 4. Error Handling
- Fallback to location-only search
- Graceful degradation
- Comprehensive logging

## Configuration

### Environment Variables
```
REPLIERS_API_KEY=your-api-key-here
```

### Search Thresholds
- Minimum viable results: 5 properties
- Broad search limit: 50 properties
- Targeted search limit: 25 properties

## Usage Examples

### Basic Search
```javascript
const result = await repliersService.searchBroadListings(profile);
```

### Progressive Search with Widening
```javascript
const result = await searchWideningService.performProgressiveSearch(profile);
// Returns: listings, searchLevel, adjustments, clientMessage
```

### NLP Search with Persistence
```javascript
const { nlpResponse, searchResults } = await nlpSearchService.performNLPSearch(
  profile,
  tags,
  contextNlpId
);
```

## Best Practices

1. **Always use NLP** for Repliers searches to avoid parameter mapping errors
2. **Soften requirements** in prompts ("prefer" vs "must have")
3. **Start with broad searches** then filter client-side if needed
4. **Use progressive widening** to ensure results
5. **Provide clear messaging** to agents about search adjustments

## Common Issues and Solutions

### Issue: 0 Search Results
**Cause**: Overly restrictive NLP interpretation
**Solution**: System automatically widens search, removing features first

### Issue: Wrong Parameter Names
**Cause**: Manual parameter mapping (location vs city, price_min vs minPrice)
**Solution**: Use NLP API which handles parameters automatically

### Issue: Too Many Results
**Cause**: Search too broad
**Solution**: Use targeted search for AI analysis (25 results max)

## Future Enhancements

1. **Machine Learning**: Learn from successful searches to improve NLP prompts
2. **Custom Widening Rules**: Per-market or per-agent widening strategies
3. **Real-time Feedback**: Allow agents to adjust widening in real-time
4. **Market Analytics**: Use search data to provide market insights