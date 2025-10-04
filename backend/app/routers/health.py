from fastapi import APIRouter
import httpx
from datetime import datetime
import time
from ..db import get_conn, fetchone_dict

router = APIRouter()
_START_TIME = datetime.utcnow()


@router.get("/health")
def health():
    started = time.monotonic()
    resp = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": (datetime.utcnow() - _START_TIME).total_seconds(),
        "database": {
            "status": "unknown",
            "connection": False,
            "latency_ms": None,
            "version": None,
        },
    }
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                t0 = time.monotonic()
                cur.execute("SELECT 1 as test, version() as version")
                row = fetchone_dict(cur)
                db_latency = int((time.monotonic() - t0) * 1000)
                resp["database"].update({
                    "status": "healthy",
                    "connection": True,
                    "latency_ms": db_latency,
                    "version": row.get("version") if row else None,
                })
    except Exception as e:
        resp["status"] = "degraded"
        resp["database"].update({
            "status": "error",
            "connection": False,
        })
    return resp


@router.get("/ip")
def outbound_ip():
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.get("https://api.ipify.org")
            r.raise_for_status()
            return {"ip": r.text}
    except Exception:
        return {"error": "Unable to fetch IP"}


@router.get("/health/db")
def health_db():
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                t0 = time.monotonic()
                cur.execute("SELECT 1 as test, version() as version")
                row = fetchone_dict(cur)
                latency = int((time.monotonic() - t0) * 1000)
                return {
                    "status": "healthy",
                    "connection": True,
                    "latency_ms": latency,
                    "version": row.get("version") if row else None,
                }
    except Exception as e:
        return {
            "status": "error",
            "connection": False,
            "message": str(e),
        }
