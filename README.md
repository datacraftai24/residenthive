ResidentHive — Frontend/Backend Split

Overview
- Two top-level folders only:
  - `frontend`: Vite + React app (UI) with Tailwind + Radix components.
  - `backend`: FastAPI (Python) service exposing the REST API.
- The frontend talks to the backend via the Vite dev proxy (`/api`, `/health`, `/ip`).

Requirements
- Frontend: Node 18+ and npm (or pnpm/yarn).
- Backend: Python 3.10+ and pip, a PostgreSQL database.
- Environment: set `DATABASE_URL` in `backend/.env`.

Quick Start
- Backend
  1) `cd backend`
  2) (optional) `python -m venv .venv && source .venv/bin/activate`
  3) `pip install -r requirements.txt`
  4) `cp .env.example .env` and set `DATABASE_URL`
  5) `uvicorn backend.app.main:app --reload --port 8000`

- Frontend
  1) `cd frontend`
  2) `npm install`
  3) `npm run dev`
  - The dev server proxies `/api`, `/health`, and `/ip` to `http://localhost:8000` by default.
  - To point elsewhere, set `VITE_BACKEND_URL` before running `npm run dev`.

Build & Deploy
- Frontend
  - `npm run build` → static assets in `frontend/dist`.
  - Serve these from any static host or CDN (Netlify, Vercel static, S3 + CloudFront, etc.).

- Backend
  - Run with Uvicorn/Gunicorn, e.g. `uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`.
  - Ensure `DATABASE_URL` is set in the environment or `backend/.env`.

Key API Endpoints (FastAPI)
- Health/Info
  - `GET /health` — health check
  - `GET /ip` — outbound public IP (best effort)

- Buyer Profiles
  - `GET /api/buyer-profiles` — list (uses `x-agent-id` header if present)
  - `GET /api/buyer-profiles/{id}` — fetch one
  - `POST /api/buyer-profiles` — create
  - `PATCH /api/buyer-profiles/{id}` — update
  - `DELETE /api/buyer-profiles/{id}` — delete
  - `GET /api/buyer-profiles/{id}/enhanced` — tags/persona (placeholder)

- NLP / Profile Extraction
  - `POST /api/extract-profile` — extract from free text
  - `POST /api/enhance-profile` — enhance structured form

- Conversational Edit & Feedback
  - `POST /api/buyer-profiles/{id}/parse-changes` — parse natural language changes
  - `PATCH /api/buyer-profiles/{id}/apply-changes` — apply parsed changes
  - `GET /api/buyer-profiles/{id}/quick-suggestions` — suggested edits
  - `POST /api/insights/disagree` — record disagreement with tags/persona
  - `POST /api/agent-notes`, `GET /api/agent-notes/{profileId}` — notes
  - `POST /api/insights/lock`, `GET /api/insights/lock/{profileId}` — lock status

- Agent Auth / Setup
  - `GET /api/agents/setup/{token}` — fetch agent by invite token
  - `POST /api/agents/setup-password` — set password + activate
  - `POST /api/agents/login` — simple email/password login

- Search & Listings
  - `POST /api/agent-search` — dual-view search payload (demo data)
  - `POST /api/agent-search/enhanced-only` — AI view only (demo data)
  - `POST /api/listings/search` — basic search (demo data)
  - `POST /api/listings/search-enhanced` — enhanced search (demo data)
  - `POST /api/listings/search-hybrid` — hybrid search (demo data)
  - `GET /api/cache/status/{profileId}` — cache status (placeholder)
  - `POST /api/listings/share` — create share link (demo)
  - `POST /api/listings/copy-text` — generate copy text
  - `POST /api/listings/generate-personal-message` — AI-style message (demo)
  - `GET /api/placeholder/{w}/{h}` — SVG placeholder images

- Investment Flow
  - `POST /api/investment-chat-enhanced` — kick off strategy generation
  - `GET /api/investment-strategy/{sessionId}` — check status / results

- Analytics
  - `GET /api/profiles/{profileId}/transactions` — list transactions
  - `GET /api/transactions/{transactionId}` — transaction details

- Validation Helpers
  - `POST /api/validate-context` — returns a `chat_url` for the client link generator
  - `GET /api/listings/nlp-history/{profileId}` — NLP search history (placeholder)
  - `POST /api/listings/search-nlp/{profileId}` — NLP search (placeholder)

Environment & Config
- Backend loads `backend/.env` automatically (via `python-dotenv`).
- Frontend dev proxy uses `VITE_BACKEND_URL` if set; otherwise defaults to `http://localhost:8000`.
- CORS: backend allows `frontend` origin by default (see `backend/app/main.py`).

Monorepo Layout
- `frontend/` — Vite config, Tailwind config, React source in `src/`, shared Zod schemas in `shared/`.
- `backend/` — FastAPI app under `app/`, requirements and `.env` in folder.

Notes
- Listing/search endpoints currently return realistic demo payloads to keep UI fully functional. Replace with live integrations as needed.
- To deploy, host the static frontend and the backend service separately, and set `VITE_BACKEND_URL` accordingly.

