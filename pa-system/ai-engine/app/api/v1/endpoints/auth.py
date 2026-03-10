"""Auth endpoints — login, logout, refresh, me."""
from __future__ import annotations
from datetime import timedelta
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from app.core.security import verify_password, hash_password, create_access_token, create_refresh_token, verify_token
from app.core.redis_client import cache_set, cache_delete
from app.api.deps import get_current_user, get_client_ip
from app.core.config import settings
import structlog

log = structlog.get_logger(__name__)
router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = settings.JWT_EXPIRE_MINUTES * 60


# Hardcoded demo users — in production these come from the users DB
DEMO_USERS = {
    "provider1": {"id": "u1", "role": "PROVIDER",     "name": "Dr. John Smith",   "pw_hash": hash_password("Provider@1234")},
    "reviewer1": {"id": "u2", "role": "REVIEWER_RN",  "name": "Sarah Parker RN",  "pw_hash": hash_password("Review@1234")},
    "meddir1":   {"id": "u3", "role": "MEDICAL_DIRECTOR","name": "Dr. Robert Chen","pw_hash": hash_password("Doctor@1234")},
    "admin":     {"id": "u4", "role": "SUPER_ADMIN",  "name": "System Admin",     "pw_hash": hash_password("Admin@1234")},
    "member1":   {"id": "u5", "role": "MEMBER",       "name": "Sarah Johnson",    "pw_hash": hash_password("Member@1234")},
}


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request):
    user = DEMO_USERS.get(body.username)
    if not user or not verify_password(body.password, user["pw_hash"]):
        log.warning("auth.login_failed", username=body.username, ip=get_client_ip(request))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    jti = str(uuid.uuid4())
    token_data = {"sub": user["id"], "name": user["name"], "role": user["role"],
                  "username": body.username, "jti": jti}
    access_token  = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    log.info("auth.login_success", username=body.username, role=user["role"], ip=get_client_ip(request))
    return LoginResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/admin/login", response_model=LoginResponse)
async def admin_login(body: LoginRequest, request: Request):
    """Admin-portal login — requires ADMIN or higher role."""
    user = DEMO_USERS.get(body.username)
    if not user or not verify_password(body.password, user["pw_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["role"] not in ("SUPER_ADMIN", "ADMIN", "OPS_ADMIN"):
        raise HTTPException(status_code=403, detail="Admin access required")
    jti = str(uuid.uuid4())
    token_data = {"sub": user["id"], "name": user["name"], "role": user["role"], "jti": jti}
    return LoginResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data)
    )


@router.post("/refresh")
async def refresh(body: dict):
    token = body.get("refresh_token")
    if not token:
        raise HTTPException(status_code=400, detail="refresh_token required")
    payload = verify_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    jti = str(uuid.uuid4())
    new_payload = {k: v for k, v in payload.items() if k not in ("exp", "iat", "type", "jti")}
    new_payload["jti"] = jti
    return {"access_token": create_access_token(new_payload), "token_type": "bearer"}


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    jti = current_user.get("jti")
    if jti:
        await cache_set(f"revoked_token:{jti}", "1", ttl=settings.SESSION_TTL_SECONDS)
    return {"detail": "Logged out"}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user.get("sub"),
        "name": current_user.get("name"),
        "role": current_user.get("role"),
        "username": current_user.get("username"),
    }
