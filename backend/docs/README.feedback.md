Feedback / Notes / Lock Router

Overview
Lets agents provide feedback on AI insights, leave notes tied to a profile, and toggle a lock preventing auto-updates of AI insights.

Endpoints
1) POST /api/insights/disagree
   - Records disagreement with a tag or persona field.
   - Body (tag)
     { "profileId": 1, "tagName": "budget-conscious" }
   - Body (persona)
     { "profileId": 1, "personaField": "urgencyLevel" }
   - Response 200 { "success": true }

2) POST /api/agent-notes
   - Saves a note for a profile.
   - Body
     { "profileId": 1, "note": "Client prefers east-facing windows" }
   - Response 200 { "success": true }

3) GET /api/agent-notes/{profileId}
   - Returns notes for a profile.
   - Response 200
     [ { "id": 10, "note": "...", "createdAt": "..." }, ... ]

4) POST /api/insights/lock
   - Toggle insight lock for a profile.
   - Body
     { "profileId": 1, "isLocked": true }
   - Response 200 { "success": true }

5) GET /api/insights/lock/{profileId}
   - Returns lock status.
   - Response 200 { "isLocked": false }

Notes
- Stored in tables: agent_insight_feedback, agent_notes, profile_insights_lock.
- No authentication required by default in this implementation.

