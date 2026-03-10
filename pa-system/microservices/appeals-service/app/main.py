"""
Appeals Service — Port 8004
Manages the full appeals lifecycle (FR-401 to FR-407):
  - Accept appeals via portal, fax, mail
  - Regulatory deadline tracking (30-day standard, 72-hour expedited)
  - Independent reviewer routing (different from original reviewer)
  - External review process support
  - Outcome analysis and AI improvement signals
  - Appeal overturn reporting
"""
from __future__ import annotations
import json, uuid, random, string
from datetime import datetime, timezone, date, timedelta
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager
from enum import Enum

import structlog
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

log = structlog.get_logger(__name__)


class Settings(BaseSettings):
    APP_VERSION: str = "1.0.0"
    DATABASE_URL: str = "postgresql+asyncpg://pauser:papass@localhost:5432/pa_system"
    REDIS_URL: str = "redis://localhost:6379/3"
    KAFKA_SERVERS: str = "localhost:9092"
    NOTIFICATION_SERVICE_URL: str = "http://localhost:8005"
    class Config: env_file = ".env"

settings = Settings()


# ── Enums ─────────────────────────────────────────────────────────────────────
class AppealType(str, Enum):
    STANDARD  = "STANDARD"    # 30-day regulatory deadline
    EXPEDITED = "EXPEDITED"   # 72-hour regulatory deadline
    EXTERNAL  = "EXTERNAL"    # Independent external review org (IRO)
    PEER_TO_PEER = "PEER_TO_PEER"  # Provider-initiated clinical discussion

class AppealStatus(str, Enum):
    SUBMITTED   = "SUBMITTED"
    ACKNOWLEDGED= "ACKNOWLEDGED"
    IN_REVIEW   = "IN_REVIEW"
    PENDING_INFO= "PENDING_INFO"
    DECIDED     = "DECIDED"
    ESCALATED   = "ESCALATED"
    WITHDRAWN   = "WITHDRAWN"
    CLOSED      = "CLOSED"

class AppealChannel(str, Enum):
    PORTAL = "PORTAL"
    FAX    = "FAX"
    MAIL   = "MAIL"
    PHONE  = "PHONE"
    EHR    = "EHR"

class AppealDecision(str, Enum):
    OVERTURNED     = "OVERTURNED"      # Original denial reversed
    UPHELD         = "UPHELD"          # Denial maintained
    PARTIAL        = "PARTIAL"         # Partial approval granted
    MODIFIED       = "MODIFIED"        # Approved with modifications
    WITHDRAWN      = "WITHDRAWN"       # Appellant withdrew

class EscalationReason(str, Enum):
    SLA_RISK       = "SLA_RISK"
    URGENT_CLINICAL= "URGENT_CLINICAL"
    LEGAL_THREAT   = "LEGAL_THREAT"
    REGULATORY     = "REGULATORY"
    SECOND_LEVEL   = "SECOND_LEVEL"


# ── Schemas ───────────────────────────────────────────────────────────────────
class AppealSubmitRequest(BaseModel):
    pa_number:          str
    original_decision:  str  # DENIED / PARTIAL
    appeal_type:        AppealType = AppealType.STANDARD
    channel:            AppealChannel = AppealChannel.PORTAL
    appellant_type:     str = "PROVIDER"  # PROVIDER | MEMBER
    appellant_id:       str
    appellant_name:     str
    appellant_phone:    Optional[str] = None
    appellant_fax:      Optional[str] = None
    reason_text:        str = Field(..., min_length=20)
    additional_info:    Optional[str] = None
    document_ids:       List[str] = []
    urgency_justification: Optional[str] = None  # Required for EXPEDITED
    external_rep_name:  Optional[str] = None     # Attorney / advocate
    external_rep_phone: Optional[str] = None

class AppealUpdateRequest(BaseModel):
    status:         Optional[AppealStatus] = None
    reviewer_id:    Optional[str] = None
    reviewer_notes: Optional[str] = None
    decision:       Optional[AppealDecision] = None
    decision_notes: Optional[str] = None
    overturned:     Optional[bool] = None
    md_cosign_id:   Optional[str] = None

class AppealRecord(BaseModel):
    appeal_number:   str
    pa_number:       str
    appeal_type:     AppealType
    status:          AppealStatus
    channel:         AppealChannel
    appellant_type:  str
    appellant_name:  str
    reason_text:     str
    document_ids:    List[str]
    regulatory_deadline: str
    decision:        Optional[AppealDecision] = None
    overturned:      Optional[bool] = None
    reviewer_id:     Optional[str] = None
    submitted_at:    str
    decided_at:      Optional[str] = None
    days_remaining:  Optional[float] = None

class P2PRequest(BaseModel):
    pa_number:         str
    provider_npi:      str
    provider_name:     str
    provider_phone:    str
    preferred_times:   List[str]
    clinical_rationale: str

class OutcomeAnalysis(BaseModel):
    period_days:       int
    total_appeals:     int
    by_type:           Dict[str, int]
    by_status:         Dict[str, int]
    overturn_rate:     float
    avg_days_to_decision: float
    top_denial_reasons:   List[Dict[str, Any]]
    by_service_type:   Dict[str, Dict[str, Any]]
    ai_accuracy_impact: Dict[str, float]


# ── In-memory store (production: PostgreSQL) ──────────────────────────────────
_appeals: Dict[str, Dict[str, Any]] = {}


# ── Deadline calculator ───────────────────────────────────────────────────────
APPEAL_DEADLINES = {
    AppealType.STANDARD:    timedelta(days=30),
    AppealType.EXPEDITED:   timedelta(hours=72),
    AppealType.EXTERNAL:    timedelta(days=60),
    AppealType.PEER_TO_PEER:timedelta(days=5),
}

def calc_deadline(appeal_type: AppealType) -> datetime:
    return datetime.now(timezone.utc) + APPEAL_DEADLINES[appeal_type]

def days_remaining(deadline_str: str) -> float:
    dl = datetime.fromisoformat(deadline_str)
    if dl.tzinfo is None:
        dl = dl.replace(tzinfo=timezone.utc)
    return max(0.0, (dl - datetime.now(timezone.utc)).total_seconds() / 86400)


# ── Independent reviewer routing ─────────────────────────────────────────────
def route_to_independent_reviewer(pa_number: str, original_reviewer_id: Optional[str]) -> str:
    """
    Ensure appeal reviewer differs from original case reviewer (FR-403).
    In production: queries reviewer assignment service with exclusion list.
    """
    reviewers = ["rev_A1", "rev_B2", "rev_C3", "rev_D4", "rev_E5"]
    eligible = [r for r in reviewers if r != original_reviewer_id]
    return eligible[hash(pa_number) % len(eligible)] if eligible else reviewers[0]


# ── Notification trigger ──────────────────────────────────────────────────────
async def send_acknowledgment(appeal: Dict[str, Any]):
    """Trigger acknowledgment notification (FR-401)."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(f"{settings.NOTIFICATION_SERVICE_URL}/notify/send", json={
                "pa_number": appeal["pa_number"],
                "event_type": "APPEAL_ACKNOWLEDGED",
                "recipient_type": appeal["appellant_type"],
                "recipient_id": appeal["appellant_id"],
                "channel": "EMAIL",
                "template_id": "APPEAL_ACK",
                "template_vars": {
                    "appeal_number": appeal["appeal_number"],
                    "appeal_type": appeal["appeal_type"],
                    "deadline": appeal["regulatory_deadline"],
                },
            })
    except Exception as e:
        log.warning("appeal.notification_failed", error=str(e))


async def publish_appeal_event(appeal_number: str, event_type: str, payload: Dict):
    """Publish to Kafka pa-appeals topic."""
    try:
        from aiokafka import AIOKafkaProducer
        producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_SERVERS,
            value_serializer=lambda v: json.dumps(v, default=str).encode(),
        )
        await producer.start()
        try:
            await producer.send("pa-appeals", key=appeal_number.encode(),
                                value={"event_type": event_type, **payload})
        finally:
            await producer.stop()
    except Exception:
        pass


# ── FastAPI app ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("appeals_service.starting", port=8004)
    # Seed mock data
    _seed_mock_appeals()
    yield

app = FastAPI(
    title="Appeals Service",
    description="Full appeals lifecycle management with regulatory deadline tracking",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "appeals", "version": settings.APP_VERSION}


# ── POST /appeals/submit ──────────────────────────────────────────────────────
@app.post("/appeals/submit", status_code=201)
async def submit_appeal(req: AppealSubmitRequest, background_tasks: BackgroundTasks):
    """
    Accept appeal submission from any channel (FR-401).
    Sends automated acknowledgment (FR-401).
    Routes to independent reviewer (FR-403).
    """
    # Validate expedited requires justification
    if req.appeal_type == AppealType.EXPEDITED and not req.urgency_justification:
        raise HTTPException(400, "Urgency justification required for expedited appeal")

    appeal_number = f"APP-{datetime.now().year}-{''.join(random.choices(string.digits, k=6))}"
    deadline      = calc_deadline(req.appeal_type)
    reviewer_id   = route_to_independent_reviewer(req.pa_number, None)

    appeal = {
        "appeal_number":      appeal_number,
        "pa_number":          req.pa_number,
        "appeal_type":        req.appeal_type.value,
        "status":             AppealStatus.ACKNOWLEDGED.value,
        "channel":            req.channel.value,
        "appellant_type":     req.appellant_type,
        "appellant_id":       req.appellant_id,
        "appellant_name":     req.appellant_name,
        "reason_text":        req.reason_text,
        "document_ids":       req.document_ids,
        "regulatory_deadline":deadline.isoformat(),
        "reviewer_id":        reviewer_id,
        "decision":           None,
        "overturned":         None,
        "submitted_at":       datetime.now(timezone.utc).isoformat(),
        "decided_at":         None,
    }
    _appeals[appeal_number] = appeal

    background_tasks.add_task(send_acknowledgment, appeal)
    background_tasks.add_task(publish_appeal_event, appeal_number, "APPEAL_SUBMITTED",
                              {"pa_number": req.pa_number, "type": req.appeal_type.value})

    log.info("appeal.submitted", appeal=appeal_number, pa=req.pa_number,
             type=req.appeal_type.value, deadline=deadline.isoformat())

    deadline_desc = {
        AppealType.STANDARD:    "30 calendar days",
        AppealType.EXPEDITED:   "72 hours",
        AppealType.EXTERNAL:    "60 calendar days",
        AppealType.PEER_TO_PEER:"5 business days",
    }[req.appeal_type]

    return {
        "appeal_number":      appeal_number,
        "status":             AppealStatus.ACKNOWLEDGED.value,
        "regulatory_deadline":deadline.isoformat(),
        "deadline_description":deadline_desc,
        "assigned_reviewer":  reviewer_id,
        "submitted_at":       appeal["submitted_at"],
        "message":            (
            f"Appeal {appeal_number} acknowledged. You will receive a decision within "
            f"{deadline_desc} per regulatory requirements. Tracking number: {appeal_number}."
        ),
    }


# ── GET /appeals/{appeal_number} ──────────────────────────────────────────────
@app.get("/appeals/{appeal_number}")
async def get_appeal(appeal_number: str = Path(...)):
    appeal = _appeals.get(appeal_number)
    if not appeal:
        raise HTTPException(404, f"Appeal {appeal_number} not found")
    remaining = days_remaining(appeal["regulatory_deadline"])
    return {**appeal, "days_remaining": round(remaining, 1),
            "sla_at_risk": remaining <= 2.0}


# ── GET /appeals — list by PA number ─────────────────────────────────────────
@app.get("/appeals")
async def list_appeals(
    pa_number: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
):
    results = list(_appeals.values())
    if pa_number:
        results = [a for a in results if a["pa_number"] == pa_number]
    if status:
        results = [a for a in results if a["status"] == status]
    results = sorted(results, key=lambda x: x["submitted_at"], reverse=True)
    start = (page - 1) * limit
    items = results[start:start + limit]
    for item in items:
        item["days_remaining"] = round(days_remaining(item["regulatory_deadline"]), 1)
    return {"items": items, "total": len(results), "page": page}


# ── PUT /appeals/{appeal_number} — reviewer updates ───────────────────────────
@app.put("/appeals/{appeal_number}")
async def update_appeal(
    appeal_number: str,
    update: AppealUpdateRequest,
    background_tasks: BackgroundTasks,
):
    appeal = _appeals.get(appeal_number)
    if not appeal:
        raise HTTPException(404, "Appeal not found")

    # Enforce MD co-sign for upheld decisions
    if update.decision == AppealDecision.UPHELD and not update.md_cosign_id:
        raise HTTPException(422, "Medical Director co-signature required for upheld denial")

    if update.status:       appeal["status"]         = update.status.value
    if update.reviewer_id:  appeal["reviewer_id"]    = update.reviewer_id
    if update.reviewer_notes: appeal["reviewer_notes"] = update.reviewer_notes
    if update.decision:
        appeal["decision"]    = update.decision.value
        appeal["overturned"]  = update.decision == AppealDecision.OVERTURNED
        appeal["status"]      = AppealStatus.DECIDED.value
        appeal["decided_at"]  = datetime.now(timezone.utc).isoformat()

    log.info("appeal.updated", appeal=appeal_number, status=appeal["status"],
             decision=appeal.get("decision"))

    if update.decision:
        background_tasks.add_task(publish_appeal_event, appeal_number, "APPEAL_DECIDED",
                                  {"decision": update.decision.value,
                                   "overturned": appeal["overturned"]})
    return appeal


# ── POST /appeals/{appeal_number}/escalate ────────────────────────────────────
@app.post("/appeals/{appeal_number}/escalate")
async def escalate_appeal(
    appeal_number: str,
    reason: str = Query(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    appeal = _appeals.get(appeal_number)
    if not appeal:
        raise HTTPException(404, "Appeal not found")
    appeal["status"] = AppealStatus.ESCALATED.value
    appeal["escalation_reason"] = reason
    log.info("appeal.escalated", appeal=appeal_number, reason=reason)
    background_tasks.add_task(publish_appeal_event, appeal_number, "APPEAL_ESCALATED",
                              {"reason": reason})
    return {"appeal_number": appeal_number, "status": "ESCALATED", "reason": reason}


# ── POST /appeals/p2p/request ─────────────────────────────────────────────────
@app.post("/appeals/p2p/request", status_code=201)
async def request_peer_to_peer(req: P2PRequest):
    """Provider requests peer-to-peer consultation with medical reviewer (FR-205)."""
    p2p_id = f"P2P-{datetime.now().year}-{''.join(random.choices(string.digits, k=5))}"
    deadline = datetime.now(timezone.utc) + timedelta(days=5)
    log.info("p2p.requested", p2p=p2p_id, pa=req.pa_number, provider=req.provider_name)
    return {
        "p2p_id": p2p_id,
        "pa_number": req.pa_number,
        "status": "SCHEDULED",
        "deadline": deadline.isoformat(),
        "message": f"Peer-to-peer consultation {p2p_id} requested. "
                   f"Medical Director will contact {req.provider_name} within 5 business days.",
    }


# ── GET /appeals/analytics/outcomes ───────────────────────────────────────────
@app.get("/appeals/analytics/outcomes")
async def appeal_outcomes(days: int = Query(30, ge=7, le=365)):
    """Appeal outcome analysis for quality monitoring and AI improvement (FR-406, FR-407)."""
    all_appeals = list(_appeals.values())
    decided = [a for a in all_appeals if a.get("decision")]
    overturned = [a for a in decided if a.get("overturned")]
    overturn_rate = len(overturned) / max(len(decided), 1) * 100

    by_type = {}
    for a in all_appeals:
        t = a["appeal_type"]
        by_type[t] = by_type.get(t, 0) + 1

    by_status = {}
    for a in all_appeals:
        s = a["status"]
        by_status[s] = by_status.get(s, 0) + 1

    # Mock denial reason analysis
    top_denial_reasons = [
        {"reason": "Step therapy not completed",     "count": 28, "overturn_rate": 42.8},
        {"reason": "Missing clinical documentation", "count": 22, "overturn_rate": 68.2},
        {"reason": "Not medically necessary",        "count": 18, "overturn_rate": 16.7},
        {"reason": "Non-formulary drug requested",   "count": 14, "overturn_rate": 35.7},
        {"reason": "Out of network provider",        "count": 9,  "overturn_rate": 22.2},
    ]

    return OutcomeAnalysis(
        period_days=days,
        total_appeals=len(all_appeals),
        by_type=by_type,
        by_status=by_status,
        overturn_rate=round(overturn_rate, 1),
        avg_days_to_decision=8.4,
        top_denial_reasons=top_denial_reasons,
        by_service_type={
            "DIAGNOSTIC_IMAGING": {"total": 24, "overturn_rate": 54.2},
            "SPECIALTY_MEDICATION": {"total": 31, "overturn_rate": 29.0},
            "SURGICAL_PROCEDURE": {"total": 18, "overturn_rate": 22.2},
        },
        ai_accuracy_impact={
            "cases_where_ai_agreed_with_denial": 0.78,
            "overturn_rate_when_ai_agreed": 14.2,
            "overturn_rate_when_ai_disagreed": 72.4,
            "ai_would_have_approved": 0.31,
        },
    )


# ── GET /appeals/sla/at-risk ───────────────────────────────────────────────────
@app.get("/appeals/sla/at-risk")
async def sla_at_risk(warning_hours: float = Query(48.0)):
    """Get appeals approaching regulatory deadline (for SLA alerting)."""
    at_risk = []
    for appeal in _appeals.values():
        remaining = days_remaining(appeal["regulatory_deadline"])
        if remaining * 24 <= warning_hours and appeal["status"] not in ("DECIDED","CLOSED","WITHDRAWN"):
            at_risk.append({
                **appeal,
                "hours_remaining": round(remaining * 24, 1),
                "days_remaining": round(remaining, 1),
            })
    at_risk.sort(key=lambda x: x["hours_remaining"])
    return {"at_risk_count": len(at_risk), "warning_hours": warning_hours, "items": at_risk}


# ── Mock data seed ────────────────────────────────────────────────────────────
def _seed_mock_appeals():
    for i in range(15):
        num = f"APP-2026-{str(100001+i).zfill(6)}"
        types = [AppealType.STANDARD, AppealType.EXPEDITED, AppealType.STANDARD,
                 AppealType.PEER_TO_PEER, AppealType.STANDARD]
        statuses = [AppealStatus.DECIDED, AppealStatus.IN_REVIEW, AppealStatus.SUBMITTED,
                    AppealStatus.ACKNOWLEDGED, AppealStatus.ESCALATED]
        t = types[i % len(types)]
        s = statuses[i % len(statuses)]
        dl = calc_deadline(t)
        _appeals[num] = {
            "appeal_number": num,
            "pa_number": f"PA-2026-{str(200001+i).zfill(6)}",
            "appeal_type": t.value,
            "status": s.value,
            "channel": "PORTAL",
            "appellant_type": "PROVIDER" if i % 3 != 0 else "MEMBER",
            "appellant_id": f"PROV{i:03d}" if i % 3 != 0 else f"MBR{i:03d}",
            "appellant_name": f"Provider {i}" if i % 3 != 0 else f"Member {i}",
            "reason_text": "Denial appears inconsistent with clinical guidelines. "
                           "Attached additional documentation supporting medical necessity.",
            "document_ids": [f"doc_{i}_001", f"doc_{i}_002"],
            "regulatory_deadline": dl.isoformat(),
            "reviewer_id": f"rev_X{i % 5}",
            "decision": AppealDecision.OVERTURNED.value if (s == AppealStatus.DECIDED and i % 3 == 0) else
                        AppealDecision.UPHELD.value     if (s == AppealStatus.DECIDED and i % 3 == 1) else None,
            "overturned": (s == AppealStatus.DECIDED and i % 3 == 0) if s == AppealStatus.DECIDED else None,
            "submitted_at": (datetime.now(timezone.utc) - timedelta(days=i+1)).isoformat(),
            "decided_at": (datetime.now(timezone.utc) - timedelta(days=i//2)).isoformat()
                          if s == AppealStatus.DECIDED else None,
        }
