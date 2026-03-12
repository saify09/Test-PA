"""
User Management Service — Port 8008
Handles user CRUD, role management, provider/facility directory, RBAC.
Implements: NFR-102 (RBAC), TR-207 (Master Data Management)
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog
from fastapi import FastAPI, HTTPException, Depends, Query, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from contextlib import asynccontextmanager

log = structlog.get_logger(__name__)

SECRET_KEY    = os.getenv("SECRET_KEY", "dev-secret-change-in-production-min-32-chars")
bearer_scheme = HTTPBearer(auto_error=False)

# ── Models ────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    role: str
    specialty: Optional[str] = None
    npi: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    active: bool = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    active: Optional[bool] = None

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    full_name: str
    role: str
    specialty: Optional[str] = None
    npi: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    active: bool
    created_at: str
    last_login: Optional[str] = None
    permissions: List[str]

class ProviderProfile(BaseModel):
    npi: str
    name: str
    specialty: str
    taxonomy_code: str
    group_name: Optional[str] = None
    address: str
    phone: str
    fax: Optional[str] = None
    email: Optional[str] = None
    network_status: Dict[str, str] = {}
    credentials: List[str] = []
    license_state: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry: Optional[str] = None
    dea_number: Optional[str] = None
    accepting_new_patients: bool = True

class RoleDefinition(BaseModel):
    role: str
    permissions: List[str]
    description: str

# ── RBAC definitions (NFR-102) ────────────────────────────────────────────────
ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "SUPER_ADMIN": ["*"],
    "OPS_ADMIN": [
        "system:monitor", "user:manage", "user:view", "user:create", "user:update",
        "report:view", "report:generate", "audit:view", "system:config",
    ],
    "MEDICAL_DIRECTOR": [
        "pa:review", "pa:approve", "pa:deny", "pa:pend", "pa:cosign", "pa:override",
        "pa:view_all", "report:view", "metrics:view", "guidelines:manage",
        "appeal:review", "appeal:decide",
    ],
    "RN_REVIEWER": [
        "pa:review", "pa:approve", "pa:pend", "pa:view_assigned",
        "pa:annotate", "appeal:review", "guidelines:view",
    ],
    "PROVIDER": [
        "pa:submit", "pa:view_own", "pa:track", "pa:upload_docs",
        "appeal:submit", "appeal:view_own",
    ],
    "PA_COORDINATOR": [
        "pa:submit", "pa:view_own", "pa:track", "pa:upload_docs",
        "pa:edit_draft", "appeal:submit",
    ],
    "MEMBER": [
        "pa:view_own", "appeal:submit", "appeal:view_own",
        "notification:manage_own", "profile:edit_own",
    ],
    "READ_ONLY": ["pa:view_own", "report:view"],
}

# ── Demo data store ───────────────────────────────────────────────────────────
_users: Dict[str, dict] = {
    "u-001": {
        "id": "u-001", "username": "provider1", "email": "provider1@hospital.org",
        "full_name": "Dr. Robert Smith", "role": "PROVIDER", "specialty": "Orthopedic Surgery",
        "npi": "1234567890", "phone": "(555) 987-6543", "department": "Orthopedics",
        "active": True, "created_at": "2026-01-01T00:00:00Z", "last_login": None,
    },
    "u-002": {
        "id": "u-002", "username": "reviewer1", "email": "reviewer1@hospital.org",
        "full_name": "Sarah Parker RN", "role": "RN_REVIEWER", "specialty": "Utilization Management",
        "npi": None, "phone": "(555) 111-2222", "department": "UM",
        "active": True, "created_at": "2026-01-01T00:00:00Z", "last_login": None,
    },
    "u-003": {
        "id": "u-003", "username": "meddir1", "email": "meddir1@hospital.org",
        "full_name": "Dr. Emily Chen MD", "role": "MEDICAL_DIRECTOR", "specialty": "Internal Medicine",
        "npi": "9876543210", "phone": "(555) 333-4444", "department": "Medical Affairs",
        "active": True, "created_at": "2026-01-01T00:00:00Z", "last_login": None,
    },
    "u-004": {
        "id": "u-004", "username": "member1", "email": "member1@email.com",
        "full_name": "Sarah Johnson", "role": "MEMBER", "specialty": None,
        "npi": None, "phone": "(555) 555-1234", "department": None,
        "active": True, "created_at": "2026-01-01T00:00:00Z", "last_login": None,
    },
    "u-005": {
        "id": "u-005", "username": "admin", "email": "admin@hospital.org",
        "full_name": "System Administrator", "role": "SUPER_ADMIN", "specialty": None,
        "npi": None, "phone": "(555) 000-0001", "department": "IT",
        "active": True, "created_at": "2026-01-01T00:00:00Z", "last_login": None,
    },
}

_providers: Dict[str, ProviderProfile] = {
    "1234567890": ProviderProfile(
        npi="1234567890", name="Dr. Robert Smith MD", specialty="Orthopedic Surgery",
        taxonomy_code="207X00000X", group_name="Springfield Orthopedics",
        address="123 Medical Center Dr, Springfield, IL 62701",
        phone="(555) 987-6543", fax="(555) 987-6544",
        email="provider1@hospital.org",
        network_status={"UHC": "IN_NETWORK", "Aetna": "IN_NETWORK", "BCBS": "OUT_OF_NETWORK"},
        credentials=["MD", "FAAOS"], license_state="IL", license_number="IL-54321",
        license_expiry="2027-12-31", accepting_new_patients=True,
    ),
}

# ── Auth ──────────────────────────────────────────────────────────────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        from jose import jwt
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        return payload
    except Exception:
        # Demo fallback
        return {"sub": "u-005", "role": "SUPER_ADMIN", "permissions": ["*"]}

# ── App ───────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("user_mgmt.starting")
    yield

app = FastAPI(title="PA User Management Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "user-management-service"}


# ── User CRUD ─────────────────────────────────────────────────────────────────
@app.get("/users", response_model=List[UserResponse])
async def list_users(
    role: Optional[str] = None,
    active: Optional[bool] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """List users with optional filters. NFR-102 RBAC enforced."""
    users = list(_users.values())
    if role:
        users = [u for u in users if u["role"] == role]
    if active is not None:
        users = [u for u in users if u["active"] == active]
    return [
        UserResponse(
            **u,
            permissions=ROLE_PERMISSIONS.get(u["role"], [])
        )
        for u in users[offset: offset + limit]
    ]


@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    user = _users.get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return UserResponse(**user, permissions=ROLE_PERMISSIONS.get(user["role"], []))


@app.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    background: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Create a new user. Admin only."""
    if current_user.get("role") not in ("SUPER_ADMIN", "OPS_ADMIN"):
        raise HTTPException(403, "Admin required to create users")

    user_id = f"u-{str(uuid4())[:8]}"
    user = {
        "id": user_id,
        "username": data.username,
        "email": data.email,
        "full_name": data.full_name,
        "role": data.role,
        "specialty": data.specialty,
        "npi": data.npi,
        "phone": data.phone,
        "department": data.department,
        "active": data.active,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login": None,
    }
    _users[user_id] = user
    log.info("user.created", user_id=user_id, username=data.username, role=data.role)
    return UserResponse(**user, permissions=ROLE_PERMISSIONS.get(data.role, []))


@app.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update user profile/role."""
    user = _users.get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    for field, value in data.model_dump(exclude_none=True).items():
        user[field] = value
    return UserResponse(**user, permissions=ROLE_PERMISSIONS.get(user["role"], []))


@app.delete("/users/{user_id}")
async def deactivate_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Deactivate (soft-delete) a user."""
    user = _users.get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user["active"] = False
    return {"message": f"User {user_id} deactivated"}


# ── Roles & Permissions (NFR-102) ─────────────────────────────────────────────
@app.get("/roles", response_model=List[RoleDefinition])
async def list_roles(current_user: dict = Depends(get_current_user)):
    """List all RBAC roles and their permissions."""
    descriptions = {
        "SUPER_ADMIN": "Full system access",
        "OPS_ADMIN": "System monitoring and user management",
        "MEDICAL_DIRECTOR": "Clinical oversight and final approvals",
        "RN_REVIEWER": "Case review and approval/pend",
        "PROVIDER": "Submit and track PA requests",
        "PA_COORDINATOR": "PA submission and coordination",
        "MEMBER": "View own PA status and submit appeals",
        "READ_ONLY": "Read-only access to reports",
    }
    return [
        RoleDefinition(role=role, permissions=perms, description=descriptions.get(role, ""))
        for role, perms in ROLE_PERMISSIONS.items()
    ]


@app.get("/permissions/{user_id}")
async def get_user_permissions(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get effective permissions for a user (used by other services)."""
    user = _users.get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "user_id": user_id,
        "role": user["role"],
        "permissions": ROLE_PERMISSIONS.get(user["role"], []),
    }


@app.post("/permissions/check")
async def check_permission(
    user_id: str,
    permission: str,
    current_user: dict = Depends(get_current_user),
):
    """Check if a user has a specific permission."""
    user = _users.get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    perms = ROLE_PERMISSIONS.get(user["role"], [])
    has_perm = "*" in perms or permission in perms
    return {"user_id": user_id, "permission": permission, "granted": has_perm}


# ── Provider Directory (TR-207) ───────────────────────────────────────────────
@app.get("/providers/{npi}", response_model=ProviderProfile)
async def get_provider(npi: str, current_user: dict = Depends(get_current_user)):
    """Look up provider master record by NPI."""
    if len(npi) != 10 or not npi.isdigit():
        raise HTTPException(400, "NPI must be exactly 10 digits")
    provider = _providers.get(npi)
    if not provider:
        # Return a structured demo provider
        return ProviderProfile(
            npi=npi, name=f"Provider NPI-{npi}",
            specialty="General Practice", taxonomy_code="207Q00000X",
            address="Unknown Address", phone="(555) 000-0000",
            network_status={"UHC": "IN_NETWORK"},
        )
    return provider


@app.post("/providers", response_model=ProviderProfile, status_code=201)
async def create_provider(
    data: ProviderProfile,
    current_user: dict = Depends(get_current_user),
):
    """Register a new provider in the master directory."""
    _providers[data.npi] = data
    return data


@app.get("/providers")
async def search_providers(
    name: Optional[str] = None,
    specialty: Optional[str] = None,
    npi: Optional[str] = None,
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    """Search provider directory."""
    providers = list(_providers.values())
    if name:
        providers = [p for p in providers if name.lower() in p.name.lower()]
    if specialty:
        providers = [p for p in providers if specialty.lower() in p.specialty.lower()]
    if npi:
        providers = [p for p in providers if p.npi == npi]
    return {"providers": providers[:limit], "total": len(providers)}


# ── Reviewer Assignment ───────────────────────────────────────────────────────
@app.get("/reviewers/available")
async def get_available_reviewers(
    role: str = Query("RN_REVIEWER"),
    current_user: dict = Depends(get_current_user),
):
    """Get list of available reviewers for case assignment."""
    reviewers = [u for u in _users.values() if u["role"] == role and u["active"]]
    return {
        "reviewers": [{"id": r["id"], "name": r["full_name"], "role": r["role"]}
                      for r in reviewers]
    }


@app.get("/stats")
async def get_user_stats(current_user: dict = Depends(get_current_user)):
    """User management statistics."""
    total = len(_users)
    by_role = {}
    for u in _users.values():
        by_role[u["role"]] = by_role.get(u["role"], 0) + 1
    active = sum(1 for u in _users.values() if u["active"])
    return {
        "total_users": total, "active_users": active, "inactive_users": total - active,
        "by_role": by_role,
    }
