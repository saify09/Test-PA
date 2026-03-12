"""
AI Engine auth endpoints — SC-001, NFR-101, NFR-104
Proxies authentication to the centralised auth-service (port 8007).

MFA enforcement (SC-001 / NFR-101):
  Roles REVIEWER_RN, MEDICAL_DIRECTOR, SUPER_ADMIN, OPS_ADMIN require a valid
  TOTP code on every login. Requests without mfa_code receive:
    HTTP 401 {"error": "MFA_REQUIRED", "mfa_required": true}

Session lifetime (NFR-104): 15 minutes (settings.JWT_EXPIRE_MINUTES = 15).
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.security import (
    MFA_REQUIRED_ROLES,
    totp_new_secret,
    totp_provisioning_uri,
    generate_backup_codes,
    verify_token,
)

log = structlog.get_logger(__name__)
router = APIRouter()
bearer_scheme = HTTPBearer(auto_error=False)

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8007")


# ── Dependency ───────────────────────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


async def require_role(*roles: str):
    """RBAC factory — SC-007 minimum necessary access."""
    async def checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", "")
        if user_role not in roles and user_role != "SUPER_ADMIN":
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user_role}' not permitted for this resource",
            )
        return current_user
    return checker


# ── Schemas ──────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str
    mfa_code: Optional[str] = None  # required for MFA_REQUIRED_ROLES


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class MFAConfirmRequest(BaseModel):
    totp_code: str


# ── Proxy helper ─────────────────────────────────────────────────────────────
async def _proxy(method: str, path: str,
                 json: Optional[dict] = None,
                 headers: Optional[dict] = None) -> dict:
    url = f"{AUTH_SERVICE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await getattr(client, method)(url, json=json, headers=headers or {})
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise HTTPException(status_code=resp.status_code, detail=detail)
        return resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        log.error("auth.proxy_error", path=path, error=str(exc))
        raise HTTPException(status_code=503, detail="Auth service unavailable")


# ── Routes ───────────────────────────────────────────────────────────────────
@router.post("/login")
async def login(request: LoginRequest, req: Request):
    """
    SC-001 / NFR-101: Login with username + password [+ TOTP].
    Privileged roles (MFA_REQUIRED_ROLES) must supply mfa_code.
    Returns 401 {error: MFA_REQUIRED} when code is missing.
    """
    log.info("auth.login_attempt", username=request.username,
             ip=req.client.host if req.client else "unknown")
    return await _proxy("post", "/auth/login", json=request.model_dump())


@router.post("/refresh")
async def refresh(request: RefreshRequest):
    """NFR-104: Rotate refresh token → new 15-min access token."""
    return await _proxy("post", "/auth/refresh", json=request.model_dump())


@router.post("/logout")
async def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """Revoke access token (jti deny-listed in Redis)."""
    hdrs = {"Authorization": f"Bearer {credentials.credentials}"} if credentials else {}
    return await _proxy("post", "/auth/logout", headers=hdrs)


@router.get("/me")
async def me(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """Return current user profile: role, permissions, mfa_enabled."""
    hdrs = {"Authorization": f"Bearer {credentials.credentials}"} if credentials else {}
    return await _proxy("get", "/auth/me", headers=hdrs)


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Anti-enumeration password reset (SC-007). Always returns 200."""
    return await _proxy("post", "/auth/forgot-password", json={"email": request.email})


@router.post("/mfa/setup")
async def mfa_setup(current_user: dict = Depends(get_current_user)):
    """
    SC-001 enrolment step 1: Generate TOTP secret + QR provisioning URI.
    Secret is not active until /auth/mfa/enable is called with a valid code.
    """
    username = current_user.get("username", current_user.get("sub", "user"))
    secret   = totp_new_secret()
    uri      = totp_provisioning_uri(secret, username)
    codes    = generate_backup_codes(10)
    log.info("auth.mfa.setup", user_id=current_user.get("sub"),
             role=current_user.get("role"))
    return {
        "secret":           secret,
        "provisioning_uri": uri,
        "backup_codes":     codes,
        "instructions": (
            "1. Scan this QR code (or enter secret) in Google Authenticator / Authy. "
            "2. Call POST /auth/mfa/enable with a 6-digit code to activate MFA. "
            "3. Keep backup codes safe — they cannot be recovered later."
        ),
    }


@router.post("/mfa/enable")
async def mfa_enable(
    request: MFAConfirmRequest,
    current_user: dict = Depends(get_current_user),
):
    """SC-001 enrolment step 2: Confirm TOTP and activate MFA for this account."""
    return await _proxy("post", "/auth/mfa/enable", json={"totp_code": request.totp_code})


@router.post("/mfa/verify")
async def mfa_verify(
    request: MFAConfirmRequest,
    current_user: dict = Depends(get_current_user),
):
    """Step-up TOTP verify — used before high-risk actions (e.g. MD denial co-sign)."""
    return await _proxy("post", "/auth/mfa/verify", json={"totp_code": request.totp_code})
