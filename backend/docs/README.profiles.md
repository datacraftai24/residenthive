Buyer Profiles Router (CRUD)

Overview
Create, read, update, and delete buyer profiles. JSON array fields are stored in JSON columns; most fields are optional except core identity and location.

**Multi-Tenant Security**: All endpoints enforce agent-level data isolation. Agents can ONLY access buyer profiles they own (via `agent_id` foreign key). Attempting to access another agent's profile returns 404 (for reads) or 403 (for writes).

Authentication & Authorization
- Authentication via Clerk JWT (see README.agents.md for Clerk setup)
- `get_current_agent_id()` dependency extracts agent_id from JWT claims
- All endpoints automatically scope to the authenticated agent's data
- Cross-agent access is prevented at the database query level

Common types
- BuyerProfile (response): mirrors DB row with camelCase keys, e.g.
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@doe.com",
    "phone": null,
    "location": "Boston",
    "agentId": 28,
    "buyerType": "traditional",
    "budget": "$450K",
    "budgetMin": 400000,
    "budgetMax": 500000,
    "homeType": "single-family",
    "bedrooms": 3,
    "bathrooms": "2",
    "mustHaveFeatures": [], "dealbreakers": [], "preferredAreas": [], "lifestyleDrivers": [], "specialNeeds": [],
    "budgetFlexibility": 50, "locationFlexibility": 50, "timingFlexibility": 50,
    "emotionalContext": null, "voiceTranscript": null, "inferredTags": [], "emotionalTone": null,
    "priorityScore": 50, "rawInput": "...", "inputMethod": "form", "nlpConfidence": 100,
    "version": 1, "parentProfileId": null,
    "createdAt": "2025-10-04T19:33:01.000Z"
  }

Endpoints
1) GET /api/buyer-profiles
   - Lists profiles for the authenticated agent only.
   - Uses `agent_id = Depends(get_current_agent_id)` to get current agent
   - Query: `SELECT * FROM buyer_profiles WHERE agent_id = {agent_id}`
   - Response 200: BuyerProfile[]

2) GET /api/buyer-profiles/{id}
   - Fetch a single profile by id.
   - **Security**: Verifies profile belongs to authenticated agent
   - Query: `SELECT * FROM buyer_profiles WHERE id = {id} AND agent_id = {agent_id}`
   - Response 200: BuyerProfile
   - Response 404: { "detail": "Profile not found" } (returns 404 even if profile exists but belongs to different agent)

3) POST /api/buyer-profiles
   - Creates a profile for the authenticated agent.
   - Server automatically sets `agentId` to current authenticated agent (cannot create profiles for other agents)
   - Server fills `createdAt` if not provided
   - Body (example minimal)
     {
       "name": "John Doe",
       "email": "john@doe.com",
       "location": "Boston",
       "budget": "$400K - $500K",
       "budgetMin": 400000,
       "budgetMax": 500000,
       "homeType": "single-family",
       "bedrooms": 3,
       "bathrooms": "2",
       "mustHaveFeatures": [], "dealbreakers": [], "preferredAreas": ["Cambridge"],
       "lifestyleDrivers": [], "specialNeeds": [],
       "budgetFlexibility": 50, "locationFlexibility": 50, "timingFlexibility": 50,
       "rawInput": "...", "inputMethod": "form", "nlpConfidence": 100, "version": 1
     }
   - Response 200: BuyerProfile

4) PATCH /api/buyer-profiles/{id}
   - Partial update; any subset of fields.
   - **Security**: Verifies profile belongs to authenticated agent before update
   - Returns 403 Forbidden if profile belongs to different agent
   - Body (example)
     { "budgetMin": 425000, "budgetMax": 525000, "mustHaveFeatures": ["garage"] }
   - Response 200: BuyerProfile
   - Response 403: { "detail": "Not authorized to update this profile" }
   - Response 404: { "detail": "Profile not found" }

5) DELETE /api/buyer-profiles/{id}
   - Deletes a profile and all related data (cascades to search_transactions, cached_search_results, etc.).
   - **Security**: Verifies profile belongs to authenticated agent before deletion
   - Returns 403 Forbidden if profile belongs to different agent
   - Response 200: { "success": true }
   - Response 403: { "detail": "Not authorized to delete this profile" }
   - Response 404: { "detail": "Profile not found" }

Related helper
- GET /api/buyer-profiles/{id}/enhanced (Misc router)
  - Returns tags/persona envelope (placeholder implementation).
  - Response 200
    { "profileId": 1, "tags": [], "persona": { "urgencyLevel": 50, "personalityTraits": [], "confidenceScore": 0 } }

Notes
- JSON fields are read/write as arrays in the API and stored as JSON in the DB (`must_have_features`, etc.).
- Column mapping is handled in the router (camelCase → snake_case) to match existing schema.

## Security Testing

To verify multi-tenant isolation:

1. **Test Cross-Agent Access**:
   ```bash
   # Attempt to access profile belonging to different agent
   curl -X GET http://localhost:8000/api/buyer-profiles/123 \
     -H "Authorization: Bearer <agent_2_token>"
   
   # Expected: 404 Not Found (profile doesn't exist for this agent)
   ```

2. **Test Unauthorized Update**:
   ```bash
   # Attempt to update another agent's profile
   curl -X PATCH http://localhost:8000/api/buyer-profiles/123 \
     -H "Authorization: Bearer <agent_2_token>" \
     -H "Content-Type: application/json" \
     -d '{"budget": "1000000"}'
   
   # Expected: 403 Forbidden
   ```

3. **Test Unauthorized Deletion**:
   ```bash
   # Attempt to delete another agent's profile
   curl -X DELETE http://localhost:8000/api/buyer-profiles/123 \
     -H "Authorization: Bearer <agent_2_token>"
   
   # Expected: 403 Forbidden
   ```

4. **Verify Database Isolation**:
   ```sql
   -- Each profile should have correct agent_id
   SELECT id, name, agent_id FROM buyer_profiles;
   
   -- Queries should always filter by agent_id
   SELECT * FROM buyer_profiles WHERE id = 123 AND agent_id = 1;
   ```


