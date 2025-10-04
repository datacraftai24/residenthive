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
from dotenv import load_dotenv
from pathlib import Path
import os


def create_app() -> FastAPI:
    # Load backend .env
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")
    app = FastAPI(title="ResidentHive Backend", version="1.0.0")

    # CORS for local dev
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_url, "*"],
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
