"""
Contact Router

Handles public contact forms (no auth required).
"""

import logging
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, HTTPException

from ..services.email_service import send_email

router = APIRouter(prefix="/api", tags=["contact"])
logger = logging.getLogger(__name__)

# Config
DEMO_REQUEST_TO = "info@datacraftai.com"


class DemoRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    brokerage: str


@router.post("/demo-request")
async def submit_demo_request(request: DemoRequest):
    """
    Submit a demo request from the landing page.
    Sends email notification to the team.
    """
    try:
        # Format the email body
        body = f"""New Demo Request from ResidenceHive Landing Page

Name: {request.name}
Email: {request.email}
Phone: {request.phone}
Brokerage: {request.brokerage}

---
This is an automated message from the ResidenceHive website.
"""

        # Send email to team
        success = send_email(
            to_email=DEMO_REQUEST_TO,
            subject=f"Demo Request: {request.brokerage} - {request.name}",
            body=body,
            reply_to=request.email
        )

        if not success:
            logger.error(f"Failed to send demo request email for {request.email}")
            raise HTTPException(status_code=500, detail="Failed to send request")

        logger.info(f"Demo request submitted: {request.email} from {request.brokerage}")

        return {"status": "success", "message": "Demo request submitted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing demo request: {e}")
        raise HTTPException(status_code=500, detail="Failed to process request")
