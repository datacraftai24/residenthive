Investment Strategy Router

Overview
Handles a simplified investment chat flow that, when sufficient info is provided, creates/updates an `investment_strategies` row and completes generation asynchronously.

Endpoints
1) POST /api/investment-chat-enhanced
   - Body
     { "message": "I have $50k and I want a duplex in Worcester", "sessionId": "optional-existing-session" }
   - Response 200 (question)
     { "type": "question", "message": "Great! How much capital... which city...", "sessionId": "..." }
   - Response 200 (ready)
     { "type": "ready", "message": "Thanks! I’m generating your investment strategy now...", "sessionId": "...", "strategyId": "..." }
   - Side effect: creates/ensures a row in `investment_strategies` with status `generating`.

2) GET /api/investment-strategy/{sessionId}
   - Returns status or the completed strategy bundle.
   - Response 200 (generating)
     { "status": "generating", "message": "Your investment strategy is being generated." }
   - Response 200 (complete)
     {
       "status": "complete",
       "strategy": { ... },
       "propertyRecommendations": [ ... ],
       "marketAnalysis": { ... },
       "financialProjections": { ... },
       "generationTime": 2000,
       "completedAt": "..."
     }
   - Response 404: { "detail": "Strategy not found" }

Tables used
- investment_strategies: stores the async strategy document and metadata.

Notes
- Current implementation seeds a basic strategy document as a background task for demo. Replace with real pipeline as needed.

