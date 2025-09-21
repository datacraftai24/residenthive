# Quick Start Guide for Chat Service Integration
## Real Estate Platform - Database Integration

## Essential Information

### **Database Connection**
```bash
DATABASE_URL=postgresql://neondb_owner:npg_zl8q5FiGOBQr@ep-morning-sun-aespvi1r.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### **Database Overview**
- **Database**: PostgreSQL 16.9 on Neon serverless
- **Total Tables**: 23 tables ready for use
- **Data**: 50+ authentic real estate listings from Texas
- **Agents**: Complete authentication system ready
- **Profiles**: AI-analyzed buyer profiles with search history

## Core Tables You'll Use

### **1. Chat-Specific Tables (Your Primary Tables)**
```sql
chat_sessions         -- Individual conversation sessions
chat_messages         -- All chat interactions with AI analysis  
property_notes        -- Client notes on properties
property_interactions -- Property likes/dislikes/ratings
chat_agent_insights   -- AI insights for agents
chat_search_context   -- Links chat to search results
```

### **2. Shared Data Tables (Read Access)**
```sql
buyer_profiles        -- Complete client profiles with preferences
agents               -- Real estate agent authentication
search_transactions  -- Search history for context
repliers_listings    -- Property database (50+ listings)
```

## Quick Integration Steps

### **Step 1: Copy Schema**
Download and copy these files to your chat service:
- `shared/schema.ts` - Complete database schema with types
- `DATABASE_SCHEMA_EXPORT_COMPLETE.sql` - Full SQL schema reference

### **Step 2: Install Dependencies**
```bash
npm install @neondatabase/serverless drizzle-orm ws zod
```

### **Step 3: Database Client**
```typescript
// db.ts
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared-schema"; // Your copied schema

neonConfig.webSocketConstructor = ws;
export const db = drizzle({ 
  client: new Pool({ connectionString: process.env.DATABASE_URL }), 
  schema 
});
```

## Essential Chat Functions

### **Start Chat Session**
```typescript
const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
await db.insert(chatSessions).values({
  id: sessionId,
  profileId: buyerProfileId,
  agentId: agentId,
  sessionStart: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  createdAt: new Date().toISOString()
});
```

### **Get Buyer Context**
```typescript
// Get complete buyer profile for personalized chat
const profile = await db.select().from(buyerProfiles)
  .where(eq(buyerProfiles.id, profileId)).limit(1);

// Get recent search history for context
const searches = await db.select().from(searchTransactions)
  .where(eq(searchTransactions.profileId, profileId))
  .orderBy(desc(searchTransactions.createdAt)).limit(3);
```

### **Log Chat Messages**
```typescript
await db.insert(chatMessages).values({
  id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  sessionId,
  message: userMessage,
  aiResponse: botResponse,
  timestamp: new Date().toISOString(),
  sentimentScore: 0.7, // -1.00 to 1.00
  questionCategory: 'pricing', // location/pricing/features/logistics
  createdAt: new Date().toISOString()
});
```

### **Record Property Interactions**
```typescript
await db.insert(propertyInteractions).values({
  id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  sessionId,
  listingId: 'ACT8910808', // Property ID
  interactionType: 'like', // like/dislike/favorite/viewed
  rating: 5, // 1-5 stars
  reason: 'Love the modern kitchen',
  emotionalResponse: 'excited',
  createdAt: new Date().toISOString()
});
```

## Available Sample Data

### **Real Buyer Profiles** (ID 13 and others)
- Name: "Unknown Buyer"
- Budget: $200K - $500K range
- Location: Austin, Dallas, Houston areas
- Complete AI analysis with preferences

### **Authentic Properties** (50+ listings)
- Property IDs: ACT8910808, DAL8910809, HOU8910810, etc.
- Price range: $800 - $1,995,000
- Bedrooms: 0-5, Bathrooms: 1-3
- Complete MLS data with images

### **Active Agents**
- Admin User (info@datacraftai.com)
- Complete authentication system
- Agent ID: Available in agents table

## Multi-Agent AI Features

### **Agent Path Tracking**
```typescript
// Track which AI agents processed the message
agentPath: "1->2->3", // Data Analyzer → Image Analyzer → Response Enhancer
```

### **Intent Classification**
```typescript
intentClassification: 'comparing', // browsing/comparing/deciding/scheduling
```

### **Generate Agent Insights**
```typescript
await db.insert(chatAgentInsights).values({
  id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  sessionId,
  profileId,
  agentId,
  insightType: 'hot_lead', // hot_lead/follow_up_needed/ready_to_view
  insightMessage: 'Client showing high engagement with luxury properties',
  confidenceScore: 0.85, // 0.00-1.00
  priority: 'high', // low/medium/high/urgent
  generatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString()
});
```

## WhatsApp Integration Ready

### **Daily Summary for Agents**
```typescript
// Get daily stats for WhatsApp summary
const dailyStats = await db.select().from(chatSessions)
  .where(and(
    eq(chatSessions.agentId, agentId),
    gte(chatSessions.sessionStart, startOfDay),
    lte(chatSessions.sessionStart, endOfDay)
  ));
```

### **Hot Lead Notifications**
```typescript
// Get urgent insights for immediate WhatsApp alerts
const hotLeads = await db.select().from(chatAgentInsights)
  .where(and(
    eq(chatAgentInsights.agentId, agentId),
    eq(chatAgentInsights.insightType, 'hot_lead'),
    eq(chatAgentInsights.status, 'new')
  ));
```

## Performance & Best Practices

### **Connection Management**
- Neon handles connection pooling automatically
- Your service shares 100 connection limit with main platform
- Use efficient queries with proper WHERE clauses

### **Data Consistency**
- All foreign key relationships are enforced
- Use database transactions for multi-table operations
- Proper cascade deletes configured

### **Error Handling**
- Database has comprehensive constraints
- Handle foreign key violations gracefully
- Use try/catch for all database operations

## Testing Environment

Your chat service will have immediate access to:
- ✅ **Real buyer profiles** with AI analysis and preferences
- ✅ **Authentic property listings** from Austin, Dallas, Houston
- ✅ **Complete search history** for intelligent context
- ✅ **Agent authentication** system ready to use
- ✅ **Visual analysis data** for property discussions
- ✅ **Multi-agent routing** support built-in

## Support Files Available

1. **`DATABASE_SCHEMA_EXPORT_COMPLETE.sql`** - Complete SQL schema with documentation
2. **`CHAT_SERVICE_INTEGRATION_GUIDE.md`** - Comprehensive integration guide
3. **`shared/schema.ts`** - TypeScript schema file to copy
4. **`SHARED_DATABASE_STRATEGY.md`** - Overall architecture strategy

The database is production-ready with 23 tables, proper relationships, performance indexes, and authentic real estate data. Your chat service can start development immediately with full context and intelligent conversation capabilities.