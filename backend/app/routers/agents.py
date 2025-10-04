from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from ..db import get_conn, fetchone_dict
import bcrypt


router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    email: str
    password: str


class SetupPasswordRequest(BaseModel):
    token: str
    password: str


def _hash_password_bcrypt(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False
    try:
        # bcrypt hashes typically start with $2a$, $2b$, or $2y$
        return bcrypt.checkpw(plain.encode("utf-8"), stored_hash.encode("utf-8"))
    except Exception:
        return False


@router.get("/agents/setup/{token}")
def get_agent_by_token(token: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, first_name, last_name, brokerage_name, is_activated FROM agents WHERE invite_token = %s",
                (token,),
            )
            row = fetchone_dict(cur)
    if not row:
        return {"success": False, "error": "Invalid or expired setup link"}
    agent = {
        "id": row["id"],
        "email": row["email"],
        "firstName": row.get("first_name"),
        "lastName": row.get("last_name"),
        "brokerageName": row.get("brokerage_name"),
        "isActivated": bool(row.get("is_activated")),
    }
    return {"success": True, "agent": agent}


@router.post("/agents/setup-password")
def setup_password(req: SetupPasswordRequest):
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    pw_hash = _hash_password_bcrypt(req.password)
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE agents SET password_hash = %s, is_activated = TRUE, created_at = COALESCE(created_at, %s) WHERE invite_token = %s RETURNING id",
                (pw_hash, now, req.token),
            )
            row = cur.fetchone()
    if not row:
        return {"success": False, "error": "Invalid or expired setup token"}
    return {"success": True}


@router.post("/agents/login")
def login(req: LoginRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, first_name, last_name, brokerage_name, is_activated, password_hash FROM agents WHERE email = %s",
                (req.email,),
            )
            row = fetchone_dict(cur)
    if not row:
        return {"success": False, "message": "Invalid credentials"}
    if not row.get("password_hash"):
        return {"success": False, "message": "Account not set up"}
    if not _verify_password(req.password, row.get("password_hash")):
        return {"success": False, "message": "Invalid credentials"}
    agent = {
        "id": row["id"],
        "email": row["email"],
        "firstName": row.get("first_name"),
        "lastName": row.get("last_name"),
        "brokerageName": row.get("brokerage_name"),
        "isActivated": bool(row.get("is_activated")),
    }
    return {"success": True, "agent": agent}
