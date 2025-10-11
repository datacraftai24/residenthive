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

Clerk Authentication (Frontend)
- This project includes optional Clerk-based auth for the React app.
- Setup
  1) Create a Clerk application at clerk.com and get your Publishable Key and Secret Key.
  2) In the repo root `.env`, add:
     - `VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx` (used by the Vite frontend)
  3) Install deps and run the frontend:
     - `cd frontend && npm install && npm run dev`
  4) Visit `/sign-in` or `/sign-up` to authenticate.

- Integration details
  - App wraps React with `ClerkProvider` using `VITE_CLERK_PUBLISHABLE_KEY`.
  - `ProtectedRoute` uses Clerk to ensure the user is signed in.
  - Legacy route `/agent-login` now renders Clerk's SignIn for backward compatibility.
  - The backend currently does not verify Clerk JWTs; add server-side verification later if needed.

Server Auth (Backend) with Clerk
- JWT verification: FastAPI now verifies Clerk session tokens via JWKS.
- Mapping to agentId: Requests map the signed-in Clerk user to an `agents.id` by email to isolate data.
- Endpoints covered: `GET /api/buyer-profiles`, `POST /api/buyer-profiles`.

Backend env variables
- Recommended
  - `CLERK_ALLOWED_ISSUER=https://<your-subdomain>.clerk.accounts.dev` (or your Prod issuer)
- Optional
  - `CLERK_AUDIENCE=<expected-audience>` (set if you enforce JWT audience)
  - `CLERK_SECRET_KEY=sk_test_xxx` (used to fetch user email when it’s not in the JWT)
  - `CLERK_API_URL=https://api.clerk.com` (override only if needed)
  - `CLERK_JWKS_CACHE_TTL=300` (seconds)
  - `AUTO_PROVISION_AGENTS=true` (create agent row on first login if not found)
  - `DEFAULT_BROKERAGE_NAME=Unknown` (used when auto-provisioning)

Frontend API calls
- The frontend attaches `Authorization: Bearer <session token>` to API calls using Clerk’s `window.Clerk.session.getToken()`.
- If you use custom fetch code, import `apiRequest` from `src/lib/queryClient` or call `window.Clerk.session.getToken()` and set the header yourself.
