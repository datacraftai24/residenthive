Backend (FastAPI)

Run locally:

- Create and fill `.env` with `DATABASE_URL`.
- Install deps: `pip install -r backend/requirements.txt`
- Start server: `uvicorn backend.app.main:app --reload --port 8000`

Notes:

- Endpoints implemented: health, ip, buyer profile CRUD, extract/enhance profile, investment chat + status, share links, and minimal placeholders for agent-search and NLP search to keep the UI functional.
- Vite dev is configured to proxy `/api`, `/health`, and `/ip` to `http://localhost:8000`.
