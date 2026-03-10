"""Central API v1 router — includes all endpoint modules."""
from fastapi import APIRouter
from app.api.v1.endpoints import analyze, auth, admin, portal, mlops

api_router = APIRouter()

api_router.include_router(auth.router,    prefix="/auth",    tags=["Authentication"])
api_router.include_router(analyze.router, prefix="/ai",      tags=["AI Analysis"])
api_router.include_router(portal.router,  prefix="/portal",  tags=["Provider Portal"])
api_router.include_router(admin.router,   prefix="/admin",   tags=["Admin"])
api_router.include_router(mlops.router,   prefix="/mlops",   tags=["ML Ops"])

