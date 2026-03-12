"""
Central API v1 router — registers all endpoint modules at correct prefixes.

Route mapping (matches exactly what each frontend calls):
  /auth/*                    → auth.py       (login, logout, refresh, me, member/login, admin/login, forgot-password)
  /api/v1/prior-authorizations/* → provider.py (provider portal PA routes)
  /api/v1/eligibility/*      → provider.py   (eligibility verify)
  /api/v1/documents/*        → provider.py   (upload, delete)
  /api/v1/notifications/*    → provider.py   (provider notifications)
  /api/v1/lookup/*           → provider.py   (icd10, cpt, npi, specialties, places-of-service)
  /api/v1/review-queue/*     → reviewer.py   (reviewer workbench queue)
  /api/v1/cases/*            → reviewer.py   (case detail, decision, annotations)
  /api/v1/metrics/*          → reviewer.py   (reviewer & queue metrics)
  /api/v1/member/*           → member.py     (member portal routes)
  /api/v1/admin/*            → admin.py      (admin dashboard routes)
  /api/v1/ai/*               → analyze.py    (AI analysis, OCR, NLP)
  /api/v1/mlops/*            → mlops.py      (ML feedback, retrain, bias)
  /api/v1/graphql            → graphql_api.py
"""
from fastapi import APIRouter
from app.api.v1.endpoints import analyze, auth, admin, mlops
from app.api.v1.endpoints import provider, reviewer, member

api_router = APIRouter()

# ── Authentication (prefix handled at app level, not here) ────────────────────
# Registered at /auth/* in main.py

# ── Provider Portal ───────────────────────────────────────────────────────────
api_router.include_router(provider.router, tags=["Provider Portal"])

# ── Reviewer Workbench ────────────────────────────────────────────────────────
api_router.include_router(reviewer.router, tags=["Reviewer Workbench"])

# ── Member Portal ─────────────────────────────────────────────────────────────
api_router.include_router(member.router,   prefix="/member", tags=["Member Portal"])

# ── Admin Dashboard ───────────────────────────────────────────────────────────
api_router.include_router(admin.router,    prefix="/admin",  tags=["Admin"])

# ── AI Analysis ───────────────────────────────────────────────────────────────
api_router.include_router(analyze.router,  prefix="/ai",     tags=["AI Analysis"])

# ── ML Ops ────────────────────────────────────────────────────────────────────
api_router.include_router(mlops.router,    prefix="/mlops",  tags=["ML Ops"])
