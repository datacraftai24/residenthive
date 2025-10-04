NLP Router (Profile Extraction/Enhancement)

Overview
Extracts a structured buyer profile from free text and enhances a structured form with inferred fields.

Endpoints
1) POST /api/extract-profile
   - Body
     { "input": "Family looking for a 3-bed in Worcester around $450k, 2 baths, modern kitchen" }
   - Response 200 (example)
     {
       "name": "Buyer",
       "email": null,
       "location": "Worcester",
       "budget": "$400K - $500K",
       "budgetMin": 400000,
       "budgetMax": 500000,
       "homeType": "single-family",
       "bedrooms": 3,
       "bathrooms": "2",
       "mustHaveFeatures": [], "dealbreakers": [], "preferredAreas": ["Worcester"],
       "lifestyleDrivers": [], "specialNeeds": [],
       "budgetFlexibility": 50, "locationFlexibility": 50, "timingFlexibility": 50,
       "emotionalContext": null, "inferredTags": [], "emotionalTone": null, "priorityScore": 50
     }

2) POST /api/enhance-profile
   - Accepts form data and fills/normalizes missing numeric budget values and defaults.
   - Body (example)
     {
       "formData": {
         "name":"Jane Doe","email":"jane@doe.com","location":"Boston",
         "budget":"$450K","homeType":"single-family","bedrooms":3,"bathrooms":"2",
         "mustHaveFeatures":[],"dealbreakers":[],"preferredAreas":[],
         "budgetFlexibility":50,"locationFlexibility":50,"timingFlexibility":50
       }
     }
   - Response 200: same shape as extract-profile response.

Notes
- The current implementation uses lightweight heuristics (regex) for demo purposes; replace with an LLM or NLP pipeline for production.
- No authentication required by default.

