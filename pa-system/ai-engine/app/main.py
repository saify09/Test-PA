"""
PA AI Engine — FastAPI Application
Provides clinical criteria matching, document processing, confidence scoring,
BioBERT/ClinicalBERT NER, RAG-based guideline retrieval, and auto-decision
logic for the Prior Authorization system.
"""
import time
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.core.database import init_db
from app.core.redis_client import init_redis
from app.api.v1.router import api_router
from app.api.v1.endpoints.graphql_api import graphql_router  # TR-003 GraphQL

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    log.info("ai_engine.starting", version=settings.APP_VERSION, env=settings.ENVIRONMENT)
    await init_db()
    await init_redis()
    # Warm up ML models on startup (BioBERT, ClinicalBERT, OCR)
    from app.services.criteria_engine import CriteriaEngine
    from app.services.nlp_extractor import NLPExtractor
    from app.services.model_service import BioBERTService, ClinicalBERTService
    from app.services.ocr_service import OCRService
    await CriteriaEngine.warmup()
    await NLPExtractor.warmup()
    await BioBERTService.load()
    await ClinicalBERTService.load()
    await OCRService.warmup()
    # Load RAG engine if enabled
    if settings.ENABLE_RAG_ENGINE:
        try:
            from app.services.rag.rag_engine import ClinicalCriteriaRAG
            log.info("ai_engine.rag_loading")
        except Exception as e:
            log.warning("ai_engine.rag_skipped", reason=str(e))
    log.info("ai_engine.ready")
    yield
    log.info("ai_engine.shutting_down")


app = FastAPI(
    title="PA AI Engine",
    description="Clinical criteria matching, BioBERT/ClinicalBERT NER, RAG, and AI decision support for Prior Authorization",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def request_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"
    if elapsed_ms > 500:
        log.warning("slow_request", path=request.url.path, ms=round(elapsed_ms))
    return response


@app.middleware("http")
async def correlation_id(request: Request, call_next):
    import uuid
    cid = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    structlog.contextvars.bind_contextvars(correlation_id=cid)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response


# ── Prometheus metrics ────────────────────────────────────────────────────────
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")
app.include_router(graphql_router)  # TR-003: GraphQL at /graphql with GraphiQL IDE


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy", "version": settings.APP_VERSION, "service": "ai-engine"}


@app.get("/health/ready", tags=["Health"])
async def readiness():
    from app.core.database import check_db
    from app.core.redis_client import check_redis
    db_ok    = await check_db()
    redis_ok = await check_redis()
    status   = "ready" if db_ok and redis_ok else "not_ready"
    return {
        "status": status,
        "checks": {
            "database": "ok" if db_ok else "fail",
            "redis":    "ok" if redis_ok else "fail",
        },
    }


@app.get("/health/models", tags=["Health"])
async def model_status():
    """Check AI model availability."""
    from app.services.model_service import BioBERTService, ClinicalBERTService
    return {
        "biobert":       {"loaded": BioBERTService._available,  "model": "dmis-lab/biobert-v1.1"},
        "clinicalbert":  {"loaded": ClinicalBERTService._available, "model": "emilyalsentzer/Bio_ClinicalBERT"},
        "rag_engine":    {"enabled": settings.ENABLE_RAG_ENGINE},
        "ocr":           {"textract_configured": bool(import_check_boto3())},
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def import_check_boto3():
    try:
        import boto3
        return True
    except ImportError:
        return False
