"""FastAPI dependency injections: auth, DB session, rate limiting."""
from __future__ import annotations
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_token
from app.core.redis_client import get_redis, cache_get

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Validate JWT and return decoded payload. Raises 401 on failure."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Authentication required",
                            headers={"WWW-Authenticate": "Bearer"})
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    # Check if token revoked (logout) — stored in Redis
    jti = payload.get("jti")
    if jti:
        revoked = await cache_get(f"revoked_token:{jti}")
        if revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Token has been revoked")
    return payload


async def require_role(*roles: str):
    """Factory for role-based access control."""
    async def checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", "")
        if user_role not in roles and "SUPER_ADMIN" not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail=f"Role '{user_role}' not permitted for this endpoint")
        return current_user
    return checker


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
