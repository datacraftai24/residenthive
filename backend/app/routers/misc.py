from fastapi import APIRouter


router = APIRouter(prefix="/api")


@router.post("/validate-context")
def validate_context(payload: dict):
    buyer_id = payload.get("buyer_id")
    return {
        "success": True,
        "ready": True,
        "errors": [],
        "preview": "Context is valid.",
        "chat_url": f"/client/{buyer_id}" if buyer_id else "/client/demo"
    }


@router.get("/buyer-profiles/{profile_id}/enhanced")
def enhanced_profile(profile_id: int):
    return {
        "profileId": profile_id,
        "tags": [],
        "persona": {
            "urgencyLevel": 50,
            "personalityTraits": [],
            "confidenceScore": 0,
        },
    }
