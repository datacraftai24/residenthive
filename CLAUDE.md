# Claude Code Reference - ResidentHive

## Project Overview
ResidentHive is a real estate search platform with AI-powered property matching for agents and buyers.

### Tech Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI GPT-4 Vision for property analysis
- **MLS Data**: Repliers API integration

## Key Features

### 1. Agent Search System (`/api/agent-search`)
- **Dual-view search**: Market Overview + AI Recommendations
- **Automatic search widening**: Triggers when < 5 results
- **Progressive widening levels**:
  1. Exact match
  2. ±1 bedroom, flexible bathrooms
  3. ±20% budget adjustment
- **Full data persistence**: All searches are logged for offline access

### 2. Search Architecture

```
User Request → Agent Search → Reactive Service → Repliers API
                    ↓              ↓
              Transaction    Search Widening
               Logging         (if needed)
```

### 3. Important Services

#### Core Services
- `agent-search-service.ts` - Dual-view search orchestration
- `agent-search-service-reactive.ts` - Auto-enhancement logic
- `search-widening-service.ts` - Progressive search expansion
- `repliers-service.ts` - MLS API integration
- `transaction-logger.ts` - Search data persistence

#### Key Endpoints
- `POST /api/agent-search` - Main agent search (with persistence)
- `GET /api/listings/search` - Client dashboard view
- `POST /api/listings/search-nlp/:profileId` - NLP search for chat/WhatsApp

## Database Schema

### Key Tables
- `buyerProfiles` - Buyer preferences and criteria
- `profileTags` - AI-generated buyer insights
- `searchTransactions` - Search history and parameters
- `searchTransactionResults` - Complete property data from searches
- `repliersListings` - Cached MLS property data
- `agents` - Agent accounts with invite system

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build project
npm run build

# Database migrations
npm run db:generate
npm run db:migrate
npm run db:push

# Run tests
npm test
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
OPENAI_API_KEY=sk-...
REPLIERS_API_KEY=...
EMAIL_FROM=info@residenthive.com
EMAIL_REPLY_TO=support@residenthive.com
RESEND_API_KEY=...
JWT_SECRET=...
APP_URL=http://localhost:3000
```

## Current Branch Structure

- `main` - Production code
- `agent-invite-system` - Agent authentication feature
- `improve-search-functionality` - Search widening + data persistence

## Key Implementation Details

### Search Widening Logic
Located in `search-widening-service.ts`:
- Monitors initial search results
- Automatically expands criteria if < 5 properties found
- Maintains transparency with adjustment tracking
- Generates client-friendly summaries

### Data Persistence Strategy
All searches now save:
- Complete property details from MLS
- AI scoring and recommendations
- Search adjustments made
- Visual analysis results
- Agent interactions

This enables:
- Offline property data access
- Historical search analysis
- ML training data collection
- Reduced API calls

### Agent Authentication
- Token-based invite system
- Email verification required
- Secure agent dashboard access
- Profile-based search permissions

## Common Tasks

### Adding a new search feature
1. Update `agent-search-service-reactive.ts` for logic
2. Add persistence in `/api/agent-search` endpoint
3. Update frontend in `agent-dual-view-search.tsx`

### Modifying search criteria
1. Edit `search-widening-service.ts` for widening rules
2. Update `BuyerProfile` schema if needed
3. Test with various profile scenarios

### Debugging searches
1. Check console logs (extensive logging implemented)
2. Review `searchTransactions` table for history
3. Verify Repliers API responses in `repliers-service.ts`

## Testing Approach

### Search Testing
1. Create buyer profile with specific criteria
2. Run search through agent dashboard
3. Verify automatic widening triggers correctly
4. Check data persistence in database

### Key Test Scenarios
- Properties < $500k (limited inventory)
- Luxury properties > $2M
- Specific bedroom counts (5+ beds)
- Small markets with few listings

## Performance Considerations

- Search results cached in `searchTransactionResults`
- Parallel API calls for dual-view search
- Image URLs processed through Repliers CDN
- Transaction logging is async (doesn't block search)

## Security Notes

- All agent endpoints require authentication
- Buyer profiles have ownership validation
- API keys stored in environment variables
- No sensitive data in git repository

## Future Enhancements

1. **WhatsApp Integration** - Use NLP search endpoint
2. **Offline Mode** - Leverage persisted search data
3. **Market Analytics** - Analyze saved search patterns
4. **Predictive Matching** - ML on transaction data

## Troubleshooting

### Common Issues
1. **No search results**: Check Repliers API key and location
2. **Widening not triggering**: Verify MIN_VIABLE_RESULTS = 5
3. **Data not persisting**: Check transaction logger errors
4. **Auth failures**: Verify JWT_SECRET is set

### Debug Commands
```bash
# Check database connection
npm run db:studio

# View application logs
docker logs residenthive-app

# Test Repliers API
curl -H "Authorization: Bearer $REPLIERS_API_KEY" \
  https://api.repliers.io/listings?city=Austin&state=TX
```

## Contact & Resources

- GitHub: https://github.com/datacraftai24/residenthive
- Repliers API Docs: https://docs.repliers.io
- OpenAI API: https://platform.openai.com/docs

---

Last Updated: 2025-08-04
Branch: improve-search-functionality