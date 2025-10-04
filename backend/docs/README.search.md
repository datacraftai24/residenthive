Agent Search Router (Dual View)

Overview
Returns a dual-view (market overview and AI recommendations) response for a given `profileId`. This implementation returns realistic demo data to keep the UI functional.

Endpoints
1) POST /api/agent-search
   - Body
     { "profileId": 1, "useReactive": true, "forceEnhanced": false }
   - Response 200
     {
       "searchType": "agent_dual_view" | "agent_dual_view_reactive",
       "profileData": { "id": 1, "name": "Client", "location": "Worcester" },
       "initialSearch": {
         "view1": { "viewType": "broad", "searchCriteria": {...}, "totalFound": 2, "listings": [...], "executionTime": 150 },
         "view2": { "viewType": "ai_recommendations", "searchCriteria": {...}, "totalFound": 2, "listings": [...], "executionTime": 220, "aiAnalysis": {...} },
         "totalFound": 2, "sufficientResults": true
       },
       "enhancedSearch": { /* present when useReactive && forceEnhanced */ },
       "totalExecutionTime": 370,
       "timestamp": "..."
     }

2) POST /api/agent-search/enhanced-only
   - Body
     { "profileId": 1 }
   - Response 200: AI recommendations view only
     {
       "searchType": "agent_dual_view",
       "view2": { ... },
       "totalExecutionTime": 210,
       "timestamp": "..."
     }

Notes
- Replace with your live aggregator and scoring system; the shapes here match the frontend’s expectations.

