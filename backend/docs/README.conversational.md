Conversational Edit Router

Overview
Provides natural-language editing for buyer profiles: parse free text to suggested changes and apply them. Also includes quick suggestions.

Endpoints
1) POST /api/buyer-profiles/{id}/parse-changes
   - Parses a natural language instruction into structured changes.
   - Body
     { "text": "Increase budget by $50K and add swimming pool", "currentProfile": { ...BuyerProfile } }
   - Response 200
     { "changes": [ { "field": "budgetMin", "oldValue": 400000, "newValue": 450000, "confidence": 85, "action": "update" }, { "field": "mustHaveFeatures", "newValue": "swimming pool", "confidence": 80, "action": "add" } ], "confidence": 85 }

2) PATCH /api/buyer-profiles/{id}/apply-changes
   - Applies the parsed change set to the profile.
   - Body
     { "changes": [ { "field": "budgetMin", "newValue": 450000, "action": "update" }, { "field": "mustHaveFeatures", "newValue": "swimming pool", "action": "add" } ] }
   - Response 200: BuyerProfile (updated)

3) GET /api/buyer-profiles/{id}/quick-suggestions
   - Returns quick suggestions (heuristics).
   - Response 200
     { "suggestions": ["Increase search radius by 5 miles", "Allow 1 fewer bathroom for better inventory", ...] }

Notes
- Parsing is heuristic in this implementation (regex-based) and should be replaced with a robust NLP service for production.
- Apply ensures array fields (e.g., mustHaveFeatures) are merged without duplication.

