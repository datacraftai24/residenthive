"""
Clerk authentication for FastAPI backend using official Clerk Python SDK.
Verifies Clerk JWT tokens and manages agent records.
"""
from fastapi import Request, HTTPException
import os
from clerk_backend_api import Clerk
from clerk_backend_api.jwks_helpers import AuthenticateRequestOptions
from .db import get_conn, fetchone_dict


# Initialize Clerk SDK
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
if not CLERK_SECRET_KEY:
    print("WARNING: CLERK_SECRET_KEY not set. Authentication will fail.")

clerk_sdk = Clerk(bearer_auth=CLERK_SECRET_KEY) if CLERK_SECRET_KEY else None


async def get_or_create_agent(clerk_user_id: str) -> dict:
    """
    Get existing agent by Clerk user ID, or create a new one.
    Auto-creates agent record on first login by fetching data from Clerk API.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if agent exists
            cur.execute(
                "SELECT * FROM agents WHERE clerk_user_id = %s",
                (clerk_user_id,)
            )
            agent = fetchone_dict(cur)

            if agent:
                return agent

            # Agent doesn't exist - fetch user info from Clerk and create
            if not clerk_sdk:
                raise HTTPException(
                    status_code=500,
                    detail="Clerk SDK not initialized. Check CLERK_SECRET_KEY."
                )

            try:
                # Fetch user details from Clerk API
                user_data = clerk_sdk.users.get(user_id=clerk_user_id)

                # Extract user info
                email = ""
                if user_data.email_addresses:
                    email = user_data.email_addresses[0].email_address

                first_name = user_data.first_name or ""
                last_name = user_data.last_name or ""

                # Get brokerage from public metadata
                public_metadata = user_data.public_metadata or {}
                brokerage = public_metadata.get("brokerageName", "Independent")

                # Create new agent record
                cur.execute(
                    """
                    INSERT INTO agents (
                        clerk_user_id, email, first_name, last_name,
                        brokerage_name, is_activated, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    RETURNING *
                    """,
                    (clerk_user_id, email, first_name, last_name, brokerage, True)
                )
                agent = fetchone_dict(cur)
                conn.commit()

                return agent

            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create agent from Clerk user: {str(e)}"
                )


async def get_current_agent_id(request: Request) -> int:
    """
    FastAPI dependency that returns the current authenticated agent's ID.

    Verifies Clerk JWT token from request and auto-creates agent if needed.

    Usage in routes:
        @router.get("/api/buyer-profiles")
        async def list_profiles(agent_id: int = Depends(get_current_agent_id)):
            # agent_id is the authenticated agent's database ID
    """
    if not clerk_sdk:
        raise HTTPException(
            status_code=500,
            detail="Clerk SDK not initialized. Check CLERK_SECRET_KEY environment variable."
        )

    # Verify authentication using Clerk SDK
    try:
        request_state = clerk_sdk.authenticate_request(
            request,
            AuthenticateRequestOptions(
                # You can specify authorized parties (domains) if needed
                # authorized_parties=['https://yourdomain.com']
            )
        )

        if not request_state.is_signed_in:
            raise HTTPException(
                status_code=401,
                detail=f"Unauthorized: {request_state.reason or 'Not signed in'}"
            )

        # Get Clerk user ID from token payload
        clerk_user_id = request_state.payload.get("sub")
        if not clerk_user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token: missing user ID"
            )

        # Get or create agent record
        agent = await get_or_create_agent(clerk_user_id)

        if not agent or not agent.get("id"):
            raise HTTPException(
                status_code=403,
                detail="Agent record not found"
            )

        return agent["id"]

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Catch any other errors during authentication
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {str(e)}"
        )
