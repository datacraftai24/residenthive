# Chat Service Integration - ResidentHive Database Structure
## Answers to Agent Integration Questions

## Overview of ResidentHive Architecture

**Integration Flow:**
1. **Agent onboards client** → Uses ResidentHive agent authentication system
2. **Client profile is created** → Stored in `buyer_profiles` table with AI analysis
3. **Search is performed** → Creates `search_transactions` with results in `search_transaction_results`
4. **Chat bot uses search context** → Accesses buyer profile + search results for intelligent conversations
5. **Chat bot link prepared** → Links to specific buyer profile and search context

## Key Questions Answered

### **1. Agent Association with Properties**

**Answer:** Properties in ResidentHive are **NOT directly associated with specific agents**. Here's how it actually works:

```sql
-- Properties are universal - no agent_id column in repliers_listings
-- All agents can search and show any active property to their clients
SELECT id, address, price, bedrooms, bathrooms, city, state 
FROM repliers_listings 
WHERE status = 'active';
```

**Why this design:**
- Properties come from Repliers MLS API (universal property database)
- Agents don't "own" listings - they help clients find properties from the market
- Same property can be shown by multiple agents to different clients
- Agent association happens at the **client relationship level**, not property level

### **2. Agent Table Structure**

**Complete `agents` table structure:**

```sql
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,              -- Agent ID (e.g., 27)
    email TEXT NOT NULL UNIQUE,         -- info@datacraftai.com
    password_hash TEXT,                  -- bcrypt hashed password
    first_name TEXT NOT NULL,           -- "Admin"
    last_name TEXT NOT NULL,            -- "User"  
    brokerage_name TEXT NOT NULL,       -- "DataCraft AI"
    invite_token TEXT UNIQUE,           -- for secure onboarding
    is_activated BOOLEAN DEFAULT false, -- account activation status
    created_at TEXT NOT NULL
);
```

**Agent-Client Relationship:**
- Agents are linked to **buyer profiles**, not properties
- Each `buyer_profile` contains complete client preferences
- Agents perform searches FOR their clients using client criteria

### **3. Property Selection for Chat Bot**

**Answer:** Show properties based on **client's search results**, not agent ownership.

**Recommended approach:**
```sql
-- Get properties from client's recent search transaction
SELECT 
    rl.*,
    str.top_picks_data,
    str.other_matches_data
FROM buyer_profiles bp
JOIN search_transactions st ON bp.id = st.profile_id  
JOIN search_transaction_results str ON st.transaction_id = str.transaction_id
JOIN repliers_listings rl ON rl.id = ANY(
    SELECT jsonb_array_elements_text(str.top_picks_data::jsonb)
)
WHERE bp.id = $client_profile_id
ORDER BY st.created_at DESC
LIMIT 1;
```

**Property Selection Strategy:**
1. **Primary:** Show properties from client's latest search results
2. **Secondary:** If no search results, show properties matching client's profile criteria
3. **Fallback:** Show all active properties in client's preferred location

### **4. Critical Tables for Integration**

**Essential Tables You Need:**

#### **A. Client Context Tables**
```sql
-- Complete buyer profile with AI analysis
buyer_profiles (id, name, email, budget_min, budget_max, location, bedrooms, bathrooms, must_have_features, dealbreakers, ...)

-- Search history with scored results  
search_transactions (transaction_id, profile_id, search_method, created_at, ...)
search_transaction_results (transaction_id, top_picks_data, other_matches_data, ...)
```

#### **B. Property Database**
```sql
-- Universal property database (50+ authentic Texas listings)
repliers_listings (id, address, price, bedrooms, bathrooms, city, state, features, images, ...)

-- AI visual analysis of property images
listing_visual_analysis (listing_id, visual_tags, summary, flags, confidence, ...)
```

#### **C. Agent System**
```sql
-- Real estate agents with authentication
agents (id, email, first_name, last_name, brokerage_name, ...)

-- Your chat service tables (already created)
chat_sessions (id, profile_id, agent_id, ...)
chat_messages (id, session_id, message, ai_response, ...)
```

## **Updated get_residenthive_properties() Function**

```typescript
// Recommended implementation for your chat service
async function get_residenthive_properties(clientProfileId: number, agentId?: number) {
    // Get client's profile for context
    const [profile] = await db.select().from(buyerProfiles)
        .where(eq(buyerProfiles.id, clientProfileId));
    
    if (!profile) {
        throw new Error(`Client profile ${clientProfileId} not found`);
    }
    
    // Get client's most recent search results
    const [latestSearch] = await db.select()
        .from(searchTransactions)
        .innerJoin(searchTransactionResults, 
            eq(searchTransactions.transactionId, searchTransactionResults.transactionId))
        .where(eq(searchTransactions.profileId, clientProfileId))
        .orderBy(desc(searchTransactions.createdAt))
        .limit(1);
    
    if (latestSearch) {
        // Return properties from client's search results
        const topPicks = JSON.parse(latestSearch.search_transaction_results.top_picks_data);
        const otherMatches = JSON.parse(latestSearch.search_transaction_results.other_matches_data);
        
        return {
            clientProfile: profile,
            searchContext: latestSearch.search_transactions,
            topPicks: topPicks,
            otherMatches: otherMatches,
            totalProperties: topPicks.length + otherMatches.length
        };
    }
    
    // Fallback: Get properties matching client criteria
    const matchingProperties = await db.select().from(repliersListings)
        .where(and(
            eq(repliersListings.status, 'active'),
            gte(repliersListings.price, profile.budget_min || 0),
            lte(repliersListings.price, profile.budget_max || 10000000),
            eq(repliersListings.city, profile.location)
        ))
        .limit(20);
    
    return {
        clientProfile: profile,
        searchContext: null,
        properties: matchingProperties,
        totalProperties: matchingProperties.length,
        isFilteredResults: true
    };
}
```

## **Context Building for Chat Service**

### **Complete Context Available:**

```typescript
// Full context your chat service can access
async function buildChatContext(profileId: number, agentId: number) {
    const context = {
        // Client Information
        client: await getBuyerProfile(profileId),
        
        // Agent Information  
        agent: await getAgentInfo(agentId),
        
        // Property Search History
        searchHistory: await getSearchHistory(profileId, 5),
        
        // Available Properties (from search or filtered)
        properties: await get_residenthive_properties(profileId, agentId),
        
        // Previous Chat Context (if returning client)
        previousChats: await getPreviousChatSessions(profileId, agentId),
        
        // Property Interactions History
        propertyInteractions: await getPropertyInteractions(profileId)
    };
    
    return context;
}
```

## **Sample Data Available in Database**

### **Active Agents:**
- Agent ID: Available in database (check `agents` table)
- Email: info@datacraftai.com
- Name: Admin User  
- Brokerage: DataCraft AI

### **Sample Buyer Profiles:**
- Profile ID 13: Complete buyer profile with preferences
- Budget: $200K-$500K range
- Location: Austin/Dallas/Houston areas
- Complete AI analysis with behavioral tags

### **Authentic Properties (50+ listings):**
- Property IDs: ACT8910808, DAL8910809, HOU8910810, etc.
- Price range: $800 - $1,995,000
- Complete MLS data with authentic property images
- Visual analysis available via `listing_visual_analysis` table

## **Key Integration Points**

### **1. Agent Portal Creation:**
```sql
-- Get agent info for portal branding
SELECT first_name, last_name, brokerage_name, email 
FROM agents WHERE id = $agent_id;
```

### **2. Client Property Discovery:**
```sql
-- Properties are discovered through search, not agent ownership
-- Use search_transactions and search_transaction_results tables
```

### **3. Chat Context Linking:**
```sql
-- Link chat conversations to search results
INSERT INTO chat_search_context (session_id, search_transaction_id, context_type)
VALUES ($session_id, $search_transaction_id, 'initial_search');
```

This architecture enables your chat service to provide intelligent, context-aware conversations using the client's actual property search results and preferences, rather than arbitrary agent property assignments.