# API Integration Responses for Chat Service
## ResidentHive to Chat Service Communication - Response Examples

**Note:** Portal creation and validation is handled entirely by **ResidentHive**. Your chat service receives pre-validated requests with guaranteed search data.

## **Chat Session Creation (From ResidentHive)**

### Portal URL Structure (Direct Access):
```
URL: /chat/p?buyer_id={buyer_profile_id}&agent_id={residenthive_agent_id}
Example: /chat/p?buyer_id=13&agent_id=27
```

### Dynamic Context Loading Response:
```json
{
  "success": true,
  "hasSearchData": true,
  "agent": {
    "name": "Admin User",
    "brokerage": "DataCraft AI", 
    "email": "info@datacraftai.com"
  },
  "buyerProfile": {
    "id": 13,
    "name": "Test Client",
    "budget": "$200K - $500K",
    "location": "Austin, TX",
    "bedrooms": 3,
    "mustHaveFeatures": ["garage", "modern_kitchen"]
  },
  "searchContext": {
    "totalProperties": 28,
    "topPicks": 15,
    "otherMatches": 13,
    "searchDate": "2025-07-20T22:14:30Z",
    "searchMethod": "enhanced_ai_analysis"
  }
}
```

## **Error Scenarios (Pure ResidentHive Integration)**

### Missing Agent Error:
```json
{
  "success": false,
  "error": "agent_not_found",
  "message": "Agent ID 999 not found in ResidentHive agents table",
  "agent_id": 999,
  "action": "return_error_to_residenthive"
}
```

### Missing Buyer Profile Error:
```json
{
  "success": false,
  "error": "buyer_not_found", 
  "message": "Buyer profile ID 999 not found in ResidentHive buyer_profiles table",
  "buyer_id": 999,
  "action": "return_error_to_residenthive"
}
```

### No Search Data Error:
```json
{
  "success": false,
  "error": "no_search_data",
  "message": "Buyer has not performed any property searches yet",
  "buyer_id": 13,
  "agent": {
    "name": "Admin User",
    "brokerage": "DataCraft AI"
  },
  "action": "show_empty_state_with_residenthive_context"
}
```

### Database Connection Error:
```json
{
  "success": false,
  "error": "database_connection_failed",
  "message": "Unable to connect to ResidentHive shared database",
  "retryable": true
}
```

## **Agent Error Handling Scenarios**

### **Invalid Agent ID:**
```json
{
  "success": false,
  "error": "agent_not_found",
  "message": "Agent ID 999 not found in the system",
  "agentId": 999
}
```

### **Invalid Client Profile ID:**
```json
{
  "success": false,
  "error": "client_not_found", 
  "message": "Client profile ID 999 not found in the system",
  "clientProfileId": 999
}
```

### **Database Connection Error:**
```json
{
  "success": false,
  "error": "database_error",
  "message": "Unable to connect to ResidentHive database",
  "retryable": true
}
```

## **Agent Workflow Integration**

### **Chat Service Integration Handler:**

```typescript
// Your chat service endpoint - receives validated requests from ResidentHive
app.post('/api/chat-service/create-session', async (req, res) => {
  try {
    const { agent_id, client_profile_id, client_name, search_transaction_id } = req.body;
    
    // Get complete context (search data guaranteed to exist)
    const context = await getChatContext(client_profile_id, search_transaction_id);
    
    // Create chat session
    const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await db.insert(chatSessions).values({
      id: sessionId,
      profileId: client_profile_id,
      agentId: agent_id,
      sessionStart: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
    
    // Link to search context
    await db.insert(chatSearchContext).values({
      sessionId: sessionId,
      searchTransactionId: search_transaction_id,
      contextType: 'initial_search',
      isActive: true,
      createdAt: new Date().toISOString()
    });
    
    const chatPortalUrl = `https://chat-service.replit.app/portal/${sessionId}`;
    
    res.json({
      success: true,
      chat_session_id: sessionId,
      chat_portal_url: chatPortalUrl,
      session_context: {
        total_properties: context.totalProperties,
        top_picks: context.topPicks.length,
        other_matches: context.otherMatches.length,
        search_date: context.searchContext.created_at,
        location: context.clientProfile.location,
        client_name: client_name,
        agent_name: `Agent ${agent_id}`
      }
    });
    
  } catch (error) {
    console.error('Chat session creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'session_creation_failed',
      message: error.message
    });
  }
});
```

## **Client Search Validation Query**

### **Check if Client Has Search Data:**
```sql
-- Query to verify client has search history before portal creation
SELECT 
    COUNT(*) as search_count,
    MAX(created_at) as latest_search,
    CASE 
        WHEN COUNT(*) > 0 THEN true 
        ELSE false 
    END as has_search_data
FROM search_transactions 
WHERE profile_id = $client_profile_id;
```

### **Get Search Summary for Portal:**
```sql
-- Get complete search context for portal creation
SELECT 
    st.transaction_id,
    st.created_at,
    st.search_method,
    st.top_picks_count,
    st.other_matches_count,
    bp.name,
    bp.location,
    bp.budget,
    bp.bedrooms,
    bp.bathrooms
FROM search_transactions st
JOIN buyer_profiles bp ON st.profile_id = bp.id
WHERE st.profile_id = $client_profile_id
ORDER BY st.created_at DESC
LIMIT 1;
```

## **Portal URL Structure**

### **Chat Portal URL Format:**
```
https://chat-service.replit.app/portal/{session_id}?agent={agent_id}&client={client_profile_id}
```

### **Session ID Generation:**
```typescript
// Create unique session ID for chat portal
const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Example: chat_1753049670000_abc123def
```

This validation approach ensures that chat portals are only created when clients have meaningful search context, eliminating empty or generic conversations and providing authentic, search-based property discussions.