import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import health as health_router
from .routers import profiles as profiles_router
from .routers import investment as investment_router
from .routers import share as share_router
from .routers import nlp as nlp_router
from .routers import misc as misc_router
from .routers import agents as agents_router
from .routers import conversational as conversational_router
from .routers import feedback as feedback_router
from .routers import analytics as analytics_router
from .routers import search as search_router
from .routers import listings as listings_router
from dotenv import load_dotenv, find_dotenv
from pathlib import Path
import os


def create_app() -> FastAPI:
    # Load environment variables for the backend.
    # Prefer a repo-root .env, but also load backend/.env if present to allow overrides.
    try:
        repo_root_env = Path(__file__).resolve().parents[2] / ".env"
        backend_env = Path(__file__).resolve().parents[1] / ".env"
        # Load root .env first (if it exists), then backend/.env (to allow overrides)
        if repo_root_env.exists():
            load_dotenv(dotenv_path=repo_root_env, override=False)
        if backend_env.exists():
            load_dotenv(dotenv_path=backend_env, override=False)
        # As a fallback, try auto-discovery upward from backend/app
        if not repo_root_env.exists() and not backend_env.exists():
            load_dotenv(find_dotenv(usecwd=False), override=False)
    except Exception:
        # Don't fail app startup if .env loading encounters an issue
        pass
    app = FastAPI(title="ResidentHive Backend", version="1.0.0")

    # CORS configuration for local dev and production
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Allow multiple origins including local, Docker, and Cloud Run
    allowed_origins = [
        frontend_url,
        "http://localhost:5173",  # Vite dev server
        "http://localhost:8080",  # Docker frontend
        "http://localhost:3000",  # Alternative dev port
    ]

    # Add Cloud Run frontend URL if specified
    cloud_run_frontend = os.getenv("CLOUD_RUN_FRONTEND_URL")
    if cloud_run_frontend:
        allowed_origins.append(cloud_run_frontend)

    # In development, allow all origins. In production, use specific origins
    if os.getenv("NODE_ENV") == "production":
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        # Development: allow all origins for easier testing
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Routers
    app.include_router(health_router.router)
    app.include_router(profiles_router.router)
    app.include_router(investment_router.router)
    app.include_router(share_router.router)
    app.include_router(nlp_router.router)
    app.include_router(misc_router.router)
    app.include_router(agents_router.router)
    app.include_router(conversational_router.router)
    app.include_router(feedback_router.router)
    app.include_router(analytics_router.router)
    app.include_router(search_router.router)
    app.include_router(listings_router.router)

    return app


app = create_app()
