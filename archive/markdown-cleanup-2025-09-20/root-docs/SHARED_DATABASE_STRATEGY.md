# Shared Database Strategy Guide
## Real Estate AI Platform - Database Integration

### Overview
This document provides a complete strategy for integrating independent chat services with the main real estate buyer profile management system using a shared PostgreSQL database approach.

## Database Architecture

### Shared Database Connection
- **Database**: Neon PostgreSQL 16.9
- **Connection**: `DATABASE_URL` environment variable
- **Schema**: Centralized in main project's `shared/schema.ts`

### Core Integration Tables

#### **Shared Tables (Use Directly)**
1. **`agents`** - Real estate agent authentication and profiles
2. **`buyerProfiles`** - Complete buyer profile data with AI analysis  
3. **`searchTransactions`** - Search history for chat context
4. **`repliersListings`** - Cached property data for chat references

#### **Chat-Specific Tables (New)**
1. **`chatSessions`** - Individual chat conversation sessions
2. **`chatMessages`** - All chat interactions with AI analysis
3. **`propertyNotes`** - Client notes on properties during chat
4. **`propertyInteractions`** - Property likes/dislikes/ratings
5. **`chatAgentInsights`** - AI-generated insights for agents
6. **`chatSearchContext`** - Links chat conversations to search results

## Implementation Strategy for Chat Service Agent

### Step 1: Database Access Setup
```bash
# In your chat service project, add database URL to secrets:
# Key: DATABASE_URL
# Value: postgresql://neondb_owner:npg_zl8q5FiGOBQr@ep-morning-sun-aespvi1r.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### Step 2: Install Dependencies
```json
{
  "dependencies": {
    "@neondatabase/serverless": "^0.10.5",
    "drizzle-orm": "^0.38.0",
    "drizzle-kit": "^0.30.0",
    "ws": "^8.18.0"
  }
}
```

### Step 3: Database Configuration
Create `db.ts` in your chat service:
```typescript
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared-schema"; // Import from main project

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
```

### Step 4: Schema Sharing Options

#### Option A: Copy Schema File (Recommended)
1. Copy `shared/schema.ts` from main project to your chat service
2. Import tables: `import { chatSessions, chatMessages, buyerProfiles, agents } from './shared-schema'`
3. Manually keep schemas in sync during development

#### Option B: NPM Package Approach
1. Create shared schema as separate NPM package
2. Both projects import from `@yourcompany/real-estate-schema`
3. Version controlled schema updates

#### Option C: Git Submodule
1. Create shared schema as separate git repository
2. Add as submodule to both projects
3. Automatic schema synchronization

## Data Flow Integration

### Chat → Search Integration
```typescript
// When client asks about properties during chat
const searchContext = await db.select().from(searchTransactions)
  .where(eq(searchTransactions.profileId, session.profileId))
  .orderBy(desc(searchTransactions.createdAt))
  .limit(1);

// Use search results for intelligent chat responses
```

### Search → Chat Enhancement  
```typescript
// Chat feedback improves search scoring
const chatInsights = await db.select().from(chatAgentInsights)
  .where(eq(chatAgentInsights.profileId, profileId));

// Apply insights to refine buyer profile preferences
```

### Agent Authentication Sharing
```typescript
// Same agent login works across both services
const agent = await db.select().from(agents)
  .where(eq(agents.email, email));
```

## Key Integration Points

### 1. Session Management
- Link chat sessions to buyer profiles via `profileId`
- Track agent engagement across both systems
- Maintain conversation context with search results

### 2. Property Context
- Reference properties using consistent `listingId` (Repliers API ID)
- Share property notes and interactions between services
- Maintain property preference learning

### 3. AI Analysis Coordination
- Chat sentiment analysis enhances buyer profile insights
- Search results inform chat conversation context
- Shared agent insights across both platforms

## Development Workflow

### For Chat Service Development
1. **Database Schema**: Import from main project
2. **Authentication**: Use existing `agents` table
3. **Client Data**: Access `buyerProfiles` for personalization
4. **Property Data**: Query `repliersListings` and search results
5. **Context**: Link conversations to `searchTransactions`

### Database Migrations
- **Main Project**: Manages all schema changes via Drizzle
- **Chat Service**: Pulls schema updates, no direct migrations
- **Coordination**: Schema changes communicated between teams

## API Integration Examples

### Creating Chat Session
```typescript
const session = await db.insert(chatSessions).values({
  id: generateUUID(),
  profileId: buyerProfile.id,
  agentId: agent.id,
  sessionStart: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  status: 'active'
}).returning();
```

### Linking to Search Results
```typescript
await db.insert(chatSearchContext).values({
  sessionId: chatSession.id,
  searchTransactionId: transaction.transactionId,
  contextType: 'initial_search',
  isActive: true
});
```

### Recording Property Interactions
```typescript
await db.insert(propertyInteractions).values({
  id: generateUUID(),
  sessionId: chatSession.id,
  listingId: 'ACT8910808',
  interactionType: 'like',
  rating: 5,
  reason: 'Love the modern kitchen and open floor plan',
  emotionalResponse: 'excited'
});
```

## Benefits of This Architecture

### For Search Service
- **Enhanced Profiles**: Chat interactions improve buyer understanding
- **Better Scoring**: Property preferences from chat enhance matching
- **Agent Insights**: Chat engagement data identifies hot leads

### For Chat Service  
- **Rich Context**: Access to complete buyer profiles and search history
- **Property Knowledge**: Full property database for intelligent responses
- **Agent Integration**: Seamless experience across both platforms

### For Agents
- **Unified Experience**: Single authentication across services
- **Complete Client View**: Chat and search data in one place
- **Better Lead Qualification**: Combined insights from both systems

## Security Considerations

### Database Access
- **Connection Pooling**: Neon handles automatic scaling
- **Read/Write Permissions**: Both services have full access
- **Data Isolation**: Logical separation via foreign key relationships

### Data Privacy
- **Shared Secrets**: DATABASE_URL contains credentials
- **Agent Authentication**: Existing bcrypt password hashing
- **Session Management**: UUID-based session identification

## Monitoring & Performance

### Database Performance
- **Connection Monitoring**: Track concurrent connections
- **Query Optimization**: Index on frequently joined columns
- **Connection Pooling**: Neon serverless handles automatically

### Data Consistency
- **Foreign Key Constraints**: Maintain referential integrity
- **Transaction Boundaries**: Use database transactions for multi-table operations
- **Cascade Deletes**: Properly configured for data cleanup

## Deployment Considerations

### Environment Variables
```bash
# Required for chat service
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
NODE_ENV=production
```

### Database Connection Limits
- **Neon Limit**: 100 concurrent connections per database
- **Connection Pooling**: Both services share connection limit
- **Load Balancing**: Consider connection distribution

## Next Steps for Chat Service Agent

1. **Set up database connection** using provided DATABASE_URL
2. **Install dependencies** listed in Step 2
3. **Copy schema file** from main project  
4. **Test connection** by querying existing `buyerProfiles` table
5. **Implement chat tables** using provided schema structure
6. **Build integration APIs** for search context and property interactions

## Support & Coordination

### Schema Updates
- **Main project** manages all database schema changes
- **Notify chat service** before pushing schema updates  
- **Version coordination** for breaking changes

### Shared Development
- **Database changes**: Coordinate via main project
- **API integration**: Design joint endpoints as needed
- **Testing**: Shared staging database for integration testing

This architecture provides a robust foundation for building integrated real estate AI services while maintaining proper separation of concerns and data consistency.