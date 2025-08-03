# Chat Service Integration Guide
## Real Estate Platform - Shared Database Architecture

## Overview
This guide provides everything needed to build a chat service that shares the database with the main real estate platform. The chat service will have full access to buyer profiles, search data, and property information for intelligent conversations.

## Database Access Setup

### **Connection Details**
```bash
# Add to your chat service environment variables
DATABASE_URL=postgresql://neondb_owner:npg_zl8q5FiGOBQr@ep-morning-sun-aespvi1r.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### **Required Dependencies**
```json
{
  "dependencies": {
    "@neondatabase/serverless": "^0.10.5",
    "drizzle-orm": "^0.38.0",
    "drizzle-kit": "^0.30.0", 
    "ws": "^8.18.0",
    "zod": "^3.22.4"
  }
}
```

## Database Schema Integration

### **Copy Schema Files**
Copy these files from the main project to your chat service:
- `shared/schema.ts` - Complete database schema with all tables and types

### **Database Client Setup**
Create `db.ts` in your chat service:
```typescript
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared/schema"; // Copied from main project

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
```

## Available Database Tables

### **Core Shared Tables**
1. **`agents`** - Real estate agent profiles and authentication
2. **`buyerProfiles`** - Complete buyer profiles with AI analysis and preferences
3. **`searchTransactions`** - Search history and results for context
4. **`repliersListings`** - Cached property data for quick access

### **Chat-Specific Tables (Ready to Use)**
1. **`chatSessions`** - Individual chat conversation sessions
2. **`chatMessages`** - All chat interactions with AI analysis
3. **`propertyNotes`** - Client notes on properties during conversations
4. **`propertyInteractions`** - Property likes/dislikes/ratings
5. **`chatAgentInsights`** - AI-generated insights for agents
6. **`chatSearchContext`** - Links chat conversations to search results

## Chat Service Implementation Examples

### **1. Starting a Chat Session**
```typescript
import { db } from './db';
import { chatSessions, buyerProfiles, agents } from './shared/schema';
import { eq } from 'drizzle-orm';

async function createChatSession(profileId: number, agentId: number) {
  const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  
  const [session] = await db.insert(chatSessions).values({
    id: sessionId,
    profileId,
    agentId,
    sessionStart: now,
    lastActivity: now,
    createdAt: now
  }).returning();
  
  return session;
}
```

### **2. Getting Buyer Profile Context**
```typescript
async function getBuyerContext(profileId: number) {
  // Get complete buyer profile
  const [profile] = await db.select().from(buyerProfiles)
    .where(eq(buyerProfiles.id, profileId));
  
  // Get recent search history for context
  const searches = await db.select().from(searchTransactions)
    .where(eq(searchTransactions.profileId, profileId))
    .orderBy(desc(searchTransactions.createdAt))
    .limit(3);
  
  return { profile, recentSearches: searches };
}
```

### **3. Logging Chat Messages**
```typescript
async function logChatMessage(
  sessionId: string, 
  message: string, 
  aiResponse: string,
  propertyMentioned?: string
) {
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await db.insert(chatMessages).values({
    id: messageId,
    sessionId,
    message,
    aiResponse,
    timestamp: new Date().toISOString(),
    propertyMentioned,
    createdAt: new Date().toISOString()
  });
}
```

### **4. Recording Property Interactions**
```typescript
async function recordPropertyInteraction(
  sessionId: string,
  listingId: string,
  interactionType: 'like' | 'dislike' | 'favorite' | 'viewed',
  rating?: number,
  reason?: string
) {
  const interactionId = `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await db.insert(propertyInteractions).values({
    id: interactionId,
    sessionId,
    listingId,
    interactionType,
    rating,
    reason,
    emotionalResponse: interactionType === 'like' ? 'excited' : 'interested',
    createdAt: new Date().toISOString()
  });
}
```

### **5. Getting Property Details for Chat**
```typescript
async function getPropertyForChat(listingId: string) {
  const [property] = await db.select().from(repliersListings)
    .where(eq(repliersListings.id, listingId));
  
  if (!property) {
    return null;
  }
  
  // Format for chat context
  return {
    id: property.id,
    address: property.address,
    price: property.price,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    description: property.description,
    features: JSON.parse(property.features || '[]'),
    images: JSON.parse(property.images || '[]')
  };
}
```

### **6. Generating Agent Insights**
```typescript
async function generateAgentInsight(
  sessionId: string,
  profileId: number,
  agentId: number,
  insightType: 'hot_lead' | 'follow_up_needed' | 'ready_to_view',
  message: string,
  confidence: number
) {
  const insightId = `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await db.insert(chatAgentInsights).values({
    id: insightId,
    sessionId,
    profileId,
    agentId,
    insightType,
    insightMessage: message,
    confidenceScore: confidence,
    priority: confidence > 0.8 ? 'high' : 'medium',
    generatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });
}
```

## Integration with Main Project

### **Agent Link System**
The main project generates agent links that your chat service can consume:

```typescript
// When agent shares a link, it includes profileId and agentId
// Your chat service can extract this and start a session

async function handleAgentLink(linkId: string) {
  // Call main project API to validate and get link data
  const response = await fetch(`https://residenthive-demo-info4334.replit.app/api/agent-links/${linkId}`);
  const linkData = await response.json();
  
  // Start chat session with the linked profile
  const session = await createChatSession(linkData.profileId, linkData.agentId);
  
  // Get buyer context for personalized chat
  const context = await getBuyerContext(linkData.profileId);
  
  return { session, context, linkData };
}
```

### **Property Search Integration**
Your chat service can reference search results from the main project:

```typescript
async function getSearchContext(profileId: number) {
  const [latestSearch] = await db.select().from(searchTransactions)
    .where(eq(searchTransactions.profileId, profileId))
    .orderBy(desc(searchTransactions.createdAt))
    .limit(1);
  
  if (latestSearch) {
    // Get the detailed search results
    const results = await db.select().from(searchTransactionResults)
      .where(eq(searchTransactionResults.transactionId, latestSearch.transactionId));
    
    return { searchTransaction: latestSearch, results };
  }
  
  return null;
}
```

## Multi-Agent AI System Support

The database schema supports your multi-agent routing system:

### **Agent Path Tracking**
```typescript
await db.insert(chatMessages).values({
  // ... other fields
  agentPath: "1->2->3", // Track which AI agents processed the message
  questionCategory: "pricing", // location/pricing/features/logistics
  intentClassification: "comparing", // browsing/comparing/deciding
  sentimentScore: 0.7 // -1.00 to 1.00
});
```

### **Context Linking**
```typescript
// Link chat conversations to specific search results
await db.insert(chatSearchContext).values({
  sessionId: chatSession.id,
  searchTransactionId: searchTransaction.transactionId,
  contextType: 'initial_search',
  isActive: true
});
```

## Data Types Reference

### **Key Types from Schema**
```typescript
// Import these from your copied schema file
import {
  ChatSession,
  ChatMessage,
  PropertyInteraction,
  ChatAgentInsight,
  BuyerProfile,
  SearchTransaction,
  // Insert types
  InsertChatSession,
  InsertChatMessage,
  InsertPropertyInteraction,
  InsertChatAgentInsight
} from './shared/schema';
```

## Development Workflow

### **Database Operations**
- **No migrations needed** - The main project manages schema changes
- **Full read/write access** - Your chat service can modify all chat-specific tables
- **Shared data access** - Read buyer profiles, agents, and search data as needed

### **Testing with Real Data**
The database contains authentic real estate data:
- **50+ real properties** from Austin, Dallas, Houston areas
- **Complete buyer profiles** with AI analysis
- **Actual MLS listings** with property images and details
- **Search transaction history** for context

### **Error Handling**
```typescript
try {
  const session = await createChatSession(profileId, agentId);
} catch (error) {
  console.error('Database operation failed:', error);
  // Handle gracefully - database has proper constraints and foreign keys
}
```

## Performance Considerations

### **Connection Pooling**
- Neon PostgreSQL handles connection pooling automatically
- Your chat service shares the connection limit with main project
- Monitor concurrent connections in production

### **Query Optimization**
- Database has proper indexes on foreign keys and timestamp columns
- Use selective queries with proper WHERE clauses
- Limit results for chat context (recent messages, top searches)

### **Caching Strategy**
- Cache buyer profiles for active chat sessions
- Cache frequently accessed property data
- Use database JSON columns for complex data structures

## WhatsApp/SMS Integration Approach

### **Agent Notifications**
```typescript
async function getHotLeadsForAgent(agentId: number) {
  const insights = await db.select().from(chatAgentInsights)
    .where(and(
      eq(chatAgentInsights.agentId, agentId),
      eq(chatAgentInsights.insightType, 'hot_lead'),
      eq(chatAgentInsights.status, 'new')
    ))
    .orderBy(desc(chatAgentInsights.generatedAt));
  
  return insights;
}

// Send daily summary via WhatsApp
async function generateDailySummary(agentId: number, date: string) {
  const startOfDay = `${date} 00:00:00`;
  const endOfDay = `${date} 23:59:59`;
  
  const dailyStats = {
    newChats: await db.select().from(chatSessions)
      .where(and(
        eq(chatSessions.agentId, agentId),
        gte(chatSessions.sessionStart, startOfDay),
        lte(chatSessions.sessionStart, endOfDay)
      )),
    propertyInteractions: await db.select().from(propertyInteractions)
      .innerJoin(chatSessions, eq(propertyInteractions.sessionId, chatSessions.id))
      .where(and(
        eq(chatSessions.agentId, agentId),
        gte(propertyInteractions.createdAt, startOfDay),
        lte(propertyInteractions.createdAt, endOfDay)
      )),
    hotLeads: await getHotLeadsForAgent(agentId)
  };
  
  return dailyStats;
}
```

This shared database approach gives your chat service complete access to all buyer context, property information, and search history while maintaining data consistency and enabling intelligent, personalized conversations.