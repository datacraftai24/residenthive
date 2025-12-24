Backend API Documentation (per router)

This backend is a FastAPI service exposing multiple routers under the path prefix `/api` (except health+ip). Each router below has a dedicated README with endpoints, request/response shapes, and examples.

Routers and docs
- Health: README.health.md
- Agents (login/setup): README.agents.md
- Buyer Profiles (CRUD): README.profiles.md
- Conversational Edit (parse/apply/quick suggestions): README.conversational.md
- Feedback, Notes, Lock: README.feedback.md
- NLP (extract/enhance): README.nlp.md
- Agent Search (dual view): README.search.md
- Listings (basic/enhanced/hybrid + cache/share/helpers): README.listings.md
- Analytics (transactions): README.analytics.md
- Misc helpers (validate-context, enhanced profile): README.misc.md

Conventions
- Base URL (dev): http://localhost:8000
- Frontend dev proxy: Vite proxies `/api`, `/health`, `/ip` to the backend; no CORS needed in dev.
- Content-Type: application/json for POST/PATCH requests unless noted.
- Authentication: none by default; some endpoints accept a header (e.g., `Authorization`) but it’s optional in this implementation.
- Database: PostgreSQL via `DATABASE_URL` (set in `backend/.env`).

