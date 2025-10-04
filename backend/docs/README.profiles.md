Buyer Profiles Router (CRUD)

Overview
Create, read, update, and delete buyer profiles. JSON array fields are stored in JSON columns; most fields are optional except core identity and location.

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
   - Lists profiles for an agent.
   - Optional header: `x-agent-id: 28` (defaults to 28 if not provided).
   - Response 200: BuyerProfile[]

2) GET /api/buyer-profiles/{id}
   - Fetch a single profile by id.
   - Response 200: BuyerProfile
   - Response 404: { "detail": "Profile not found" }

3) POST /api/buyer-profiles
   - Creates a profile. Server fills `createdAt` if not provided; if agentId is omitted, defaults to 28.
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
   - Body (example)
     { "budgetMin": 425000, "budgetMax": 525000, "mustHaveFeatures": ["garage"] }
   - Response 200: BuyerProfile

5) DELETE /api/buyer-profiles/{id}
   - Deletes a profile. Also expected to cascade or clean up via separate processes for related rows.
   - Response 200: { "success": true }

Related helper
- GET /api/buyer-profiles/{id}/enhanced (Misc router)
  - Returns tags/persona envelope (placeholder implementation).
  - Response 200
    { "profileId": 1, "tags": [], "persona": { "urgencyLevel": 50, "personalityTraits": [], "confidenceScore": 0 } }

Notes
- JSON fields are read/write as arrays in the API and stored as JSON in the DB (`must_have_features`, etc.).
- Column mapping is handled in the router (camelCase → snake_case) to match existing schema.

