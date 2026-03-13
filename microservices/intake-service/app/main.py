"""
Intake Service — Port 8002
Handles all inbound PA request channels: portal, EHR/FHIR, fax/EDI 278.
Responsibilities:
  - Validate & normalize incoming PA requests (FR-001 to FR-007)
  - Dedup check
  - Eligibility verification trigger
  - Publish to ai-inference Kafka topic
  - Generate PA tracking number
  - Auto-request missing info (FR-006)
"""
from __future__ import annotations
import re, json, asyncio
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings

log = structlog.get_logger(__name__)

# ── Settings ──────────────────────────────────────────────────────────────────
class Settings(BaseSettings):
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://pauser:papass@localhost:5432/pa_system"
    REDIS_URL: str = "redis://localhost:6379/1"
    KAFKA_SERVERS: str = "localhost:9092"
    AI_ENGINE_URL: str = "http://localhost:8001"
    SECRET_KEY: str = "dev-secret-change-in-production-min-32-chars"
    ENCRYPTION_KEY: str = "dev-enc-key-32bytes-change-prod!!"
    class Config: env_file = ".env"

settings = Settings()

# ── Schemas ───────────────────────────────────────────────────────────────────
class DiagnosisIn(BaseModel):
    code: str
    description: Optional[str] = None
    is_primary: bool = False

    @field_validator("code")
    @classmethod
    def clean_code(cls, v):
        v = v.upper().replace(".", "").strip()
        if not re.match(r"^[A-Z]\d{2}[A-Z0-9]{0,7}$", v):
            raise ValueError(f"Invalid ICD-10: {v}")
        return v

class ProcedureIn(BaseModel):
    code: str
    description: Optional[str] = None
    modifiers: List[str] = []
    units: int = 1

    @field_validator("code")
    @classmethod
    def clean_code(cls, v):
        v = v.upper().strip()
        if not re.match(r"^\d{5}$|^[A-Z]\d{4}$", v):
            raise ValueError(f"Invalid CPT/HCPCS: {v}")
        return v

class MemberIn(BaseModel):
    member_id: str
    first_name: str
    last_name: str
    date_of_birth: date
    gender: str = Field(..., pattern="^[MFU]$")
    payer: str  # UHC, AETNA, BCBS, CIGNA, CVS

class ProviderIn(BaseModel):
    npi: str = Field(..., pattern=r"^\d{10}$")
    name: str
    specialty: Optional[str] = None
    tax_id: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None

class IntakeRequest(BaseModel):
    """Universal intake schema — all channels normalize to this (FLS §2, FR-001)."""
    # Source
    source_channel: str = "PORTAL"  # PORTAL | EHR | FAX | EDI | API
    external_ref:   Optional[str] = None

    # Parties
    member:   MemberIn
    provider: ProviderIn
    ordering_provider: Optional[ProviderIn] = None   # FLS §2.4 — ordering vs rendering
    rendering_provider: Optional[ProviderIn] = None  # FLS §2.4

    # Clinical — core
    diagnoses:  List[DiagnosisIn] = Field(..., min_length=1)
    procedures: List[ProcedureIn] = Field(..., min_length=1)
    service_type: str
    place_of_service: str = "11"
    place_of_service_name: Optional[str] = None
    requested_start_date: date
    requested_units: int = Field(default=1, ge=1)
    clinical_summary: str = Field(..., min_length=5)
    urgency: str = "ROUTINE"

    # Clinical — extended (FLS §2.5, Field-Level Specs)
    frequency: Optional[str] = None           # e.g. "1x per week" — Required for PT/Home Health
    duration: Optional[str] = None            # e.g. "6 weeks" — Required for SURGICAL/PT
    prior_treatments: List[str] = []          # Step-therapy evidence for SPECIALTY_MEDICATION
    lab_results: Optional[str] = None         # Free-text or JSON lab summary
    estimated_cost: Optional[float] = None    # Estimated cost for utilization mgmt
    chief_complaint: Optional[str] = None     # Patient's chief complaint
    hpi: Optional[str] = None                 # History of Present Illness
    exam_findings: Optional[str] = None       # Physical exam findings (FLS §2.5)

    # Attachments
    document_ids: List[str] = []

class EDI278Request(BaseModel):
    """Raw EDI X12 278 transaction — parsed and normalized to IntakeRequest."""
    isa_segment: str
    transaction_set: str
    raw_edi: str

class FHIRClaimRequest(BaseModel):
    """Inbound FHIR R4 Claim resource."""
    resourceType: str = "Claim"
    id: Optional[str] = None
    status: str = "active"
    use: str = "preauthorization"
    patient: Dict[str, Any] = {}
    provider: Dict[str, Any] = {}
    insurance: List[Dict[str, Any]] = []
    item: List[Dict[str, Any]] = []
    diagnosis: List[Dict[str, Any]] = []

class IntakeResponse(BaseModel):
    pa_number: str
    status: str
    submitted_at: str
    sla_deadline: str
    estimated_response_hours: int
    missing_info: List[str]
    message: str
    ai_triggered: bool

# ── Validation logic ──────────────────────────────────────────────────────────
REQUIRED_FIELDS = {
    "DIAGNOSTIC_IMAGING":   ["diagnoses", "procedures", "clinical_summary", "requested_start_date"],
    "SURGICAL_PROCEDURE":   ["diagnoses", "procedures", "clinical_summary", "requested_start_date"],
    "SPECIALTY_MEDICATION": ["diagnoses", "procedures", "clinical_summary"],
    "PHYSICAL_THERAPY":     ["diagnoses", "procedures", "clinical_summary", "frequency"],
    "HOME_HEALTH":          ["diagnoses", "procedures", "clinical_summary", "frequency", "duration"],
    "DEFAULT":              ["diagnoses", "procedures", "clinical_summary"],
}

# PRD FR-401/FR-402: Correct SLA deadlines by urgency level
SLA_HOURS: Dict[str, int] = {
    "EMERGENCY":  8,   # FR-402: Life-threatening → 8 hours
    "EMERGENT":   8,   # alias
    "URGENT":    24,   # Non-emergent urgent → 24 hours
    "EXPEDITED": 48,  # Expedited review → 48 hours
    "ROUTINE":   72,  # Standard review → 72 hours
}

def validate_intake(req: IntakeRequest) -> List[str]:
    """Returns list of missing/invalid fields — FR-006: Auto-request missing info."""
    issues = []

    # Core checks (all service types)
    if not any(d.is_primary for d in req.diagnoses):
        issues.append("No primary diagnosis designated")
    if len(req.clinical_summary) < 20:
        issues.append("Clinical summary too brief (minimum 20 characters)")
    if req.requested_start_date < date(2020, 1, 1):
        issues.append("Requested start date appears incorrect")
    if not req.member.member_id or len(req.member.member_id) < 4:
        issues.append("Invalid member ID")

    # Service-type specific checks (FLS §2.5)
    stype = (req.service_type or "").upper()

    if stype == "SPECIALTY_MEDICATION":
        # Step therapy evidence is mandatory for specialty biologics
        if not req.prior_treatments:
            issues.append(
                "Step therapy documentation required: list prior treatments tried "
                "(e.g., methotrexate, NSAIDs) for specialty medication requests"
            )

    if stype in ("SURGICAL_PROCEDURE", "PHYSICAL_THERAPY"):
        if not req.duration:
            issues.append("Duration of treatment/symptoms required for this service type")

    if stype in ("PHYSICAL_THERAPY", "HOME_HEALTH"):
        if not req.frequency:
            issues.append("Treatment frequency required (e.g., '2x per week') for this service type")

    return issues

def check_duplicate(pa_number: str, member_id: str, procedure_code: str) -> bool:
    """
    In production: query DB for existing active PA within last 90 days
    with same member + procedure. Returns True if duplicate found.
    """
    return False  # Mock: no duplicates

def normalize_fhir_to_intake(fhir: FHIRClaimRequest) -> IntakeRequest:
    """Map FHIR R4 Claim → IntakeRequest."""
    diagnoses = []
    for i, dx in enumerate(fhir.diagnosis):
        code_obj = dx.get("diagnosisCodeableConcept", {})
        codings  = code_obj.get("coding", [{}])
        code     = codings[0].get("code", "Z00") if codings else "Z00"
        diagnoses.append(DiagnosisIn(code=code, is_primary=(i == 0)))

    procedures = []
    for item in fhir.item:
        prod_serv = item.get("productOrService", {})
        codings   = prod_serv.get("coding", [{}])
        code      = codings[0].get("code", "99213") if codings else "99213"
        procedures.append(ProcedureIn(code=code))

    patient_ref = fhir.patient.get("reference", "").replace("Patient/", "")
    provider_ref = fhir.provider.get("reference", "").replace("Practitioner/", "")

    return IntakeRequest(
        source_channel="EHR",
        member=MemberIn(
            member_id=patient_ref or "FHIR_MEMBER",
            first_name="FHIR", last_name="Patient",
            date_of_birth=date(1980, 1, 1), gender="U", payer="UHC"
        ),
        provider=ProviderIn(npi=provider_ref[:10].zfill(10) if provider_ref else "0000000000",
                            name="FHIR Provider"),
        diagnoses=diagnoses or [DiagnosisIn(code="Z00", is_primary=True)],
        procedures=procedures or [ProcedureIn(code="99213")],
        service_type="OTHER",
        requested_start_date=date.today(),
        clinical_summary=f"FHIR claim {fhir.id or 'unknown'} — normalized intake",
    )

def parse_edi_278(edi: str) -> Dict[str, Any]:
    """
    Parse X12 EDI 278 transaction.
    Production: use python-x12 or boto3 Textract for full parsing.
    This extracts key segments: NM1, HI (diagnosis), SV1 (procedure), DTP.
    """
    segments = edi.strip().split("~")
    result: Dict[str, Any] = {
        "member_id": None, "provider_npi": None,
        "diagnoses": [], "procedures": [],
        "service_type": "OTHER", "urgency": "ROUTINE",
    }
    for seg in segments:
        elements = seg.strip().split("*")
        if not elements: continue
        seg_id = elements[0]

        if seg_id == "NM1" and len(elements) > 9:
            if elements[1] == "IL":      result["member_id"] = elements[9]
            elif elements[1] == "82":    result["provider_npi"] = elements[9]

        elif seg_id == "HI" and len(elements) > 1:
            for e in elements[1:]:
                parts = e.split(":")
                if len(parts) >= 2:
                    result["diagnoses"].append(parts[1])

        elif seg_id == "SV1" and len(elements) > 1:
            svc = elements[1].split(":")
            if len(svc) >= 2:
                result["procedures"].append(svc[1])

        elif seg_id == "UM" and len(elements) > 2:
            if elements[2] == "1":     result["urgency"] = "URGENT"
            elif elements[2] == "2":   result["urgency"] = "EMERGENCY"

    return result

# ── Kafka publisher ───────────────────────────────────────────────────────────
async def publish_to_ai_queue(pa_number: str, payload: Dict[str, Any]):
    """Publish intake event to Kafka pa-submissions topic."""
    try:
        from aiokafka import AIOKafkaProducer
        producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_SERVERS,
            value_serializer=lambda v: json.dumps(v, default=str).encode(),
        )
        await producer.start()
        try:
            await producer.send("pa-submissions", key=pa_number.encode(), value=payload)
        finally:
            await producer.stop()
        log.info("kafka.published", topic="pa-submissions", pa=pa_number)
    except Exception as e:
        log.warning("kafka.unavailable", error=str(e))

# ── Dedup checker ─────────────────────────────────────────────────────────────
async def check_dedup_async(member_id: str, procedure_code: str) -> Optional[str]:
    """Returns existing PA number if duplicate found, else None."""
    # Production: query PA DB with Redis cache
    return None

# ── FastAPI app ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("intake_service.starting", port=8002)
    yield
    log.info("intake_service.stopping")

app = FastAPI(
    title="PA Intake Service",
    description="Multi-channel PA request intake, validation, and routing",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=500)

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "intake", "version": settings.APP_VERSION}

# ── POST /intake/submit ───────────────────────────────────────────────────────
@app.post("/intake/submit", response_model=IntakeResponse, status_code=201)
async def submit(req: IntakeRequest, background_tasks: BackgroundTasks):
    """
    Primary intake endpoint — all portal-submitted PA requests land here.
    FR-001: Accept via portal | FR-003: Extract fields | FR-005: Dedup check
    FR-006: Auto-request missing info | FR-007: Generate PA number
    """
    import random, string
    pa_number = f"PA-{datetime.now().year}-{''.join(random.choices(string.digits, k=6))}"

    # Dedup check (FR-005)
    proc_code = req.procedures[0].code if req.procedures else ""
    dup = await check_dedup_async(req.member.member_id, proc_code)
    if dup:
        raise HTTPException(status_code=409, detail=f"Duplicate PA found: {dup}")

    # Validation (FR-006)
    missing = validate_intake(req)

    # SLA deadline — FR-401/FR-402: corrected urgency map
    hours = SLA_HOURS.get(req.urgency.upper(), 72)
    from datetime import timedelta
    deadline = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(hours=hours)
    submitted_at = datetime.now(timezone.utc).replace(microsecond=0)

    # Publish to AI engine queue — include all extended clinical fields
    event_payload = {
        "pa_number": pa_number,
        "source_channel": req.source_channel,
        "member_id": req.member.member_id,
        "member_dob": req.member.date_of_birth.isoformat(),
        "member_gender": req.member.gender,
        "payer": req.member.payer,
        "provider_npi": req.provider.npi,
        "provider_name": req.provider.name,
        "provider_specialty": req.provider.specialty,
        "diagnoses": [d.model_dump() for d in req.diagnoses],
        "procedures": [p.model_dump() for p in req.procedures],
        "service_type": req.service_type,
        "urgency": req.urgency,
        "clinical_summary": req.clinical_summary[:2000],
        "submitted_at": submitted_at.isoformat(),
        "sla_deadline": deadline.isoformat(),
        "sla_hours": hours,
        "place_of_service": req.place_of_service,
        # Extended clinical fields (FLS §2.5)
        "frequency": req.frequency,
        "duration": req.duration,
        "prior_treatments": req.prior_treatments,
        "lab_results": req.lab_results,
        "estimated_cost": req.estimated_cost,
        "chief_complaint": req.chief_complaint,
        "hpi": req.hpi,
        "document_ids": req.document_ids,
    }
    background_tasks.add_task(publish_to_ai_queue, pa_number, event_payload)

    log.info("intake.accepted", pa=pa_number, channel=req.source_channel,
             payer=req.member.payer, urgency=req.urgency, missing=len(missing))

    return IntakeResponse(
        pa_number=pa_number,
        status="SUBMITTED" if not missing else "PENDING_INFO",
        submitted_at=submitted_at.isoformat(),
        sla_deadline=deadline.isoformat(),
        estimated_response_hours=hours,
        missing_info=missing,
        message=(
            f"PA {pa_number} submitted. Under review within {hours} hours."
            if not missing
            else f"PA {pa_number} submitted with {len(missing)} item(s) pending."
        ),
        ai_triggered=True,
    )

# ── POST /intake/fhir ─────────────────────────────────────────────────────────
@app.post("/intake/fhir", status_code=201)
async def intake_fhir(claim: FHIRClaimRequest, background_tasks: BackgroundTasks):
    """Accept FHIR R4 Claim resource for EHR-integrated submissions (FR-001)."""
    normalized = normalize_fhir_to_intake(claim)
    return await submit(normalized, background_tasks)

# ── POST /intake/edi278 ───────────────────────────────────────────────────────
@app.post("/intake/edi278", status_code=201)
async def intake_edi(body: EDI278Request, background_tasks: BackgroundTasks):
    """Accept X12 EDI 278 transaction (FR-001)."""
    parsed = parse_edi_278(body.raw_edi)
    import random, string
    dx_list = [DiagnosisIn(code=c, is_primary=(i == 0))
               for i, c in enumerate(parsed.get("diagnoses", ["Z00"])[:5])]
    proc_list = [ProcedureIn(code=c) for c in parsed.get("procedures", ["99213"])[:5]]
    req = IntakeRequest(
        source_channel="EDI",
        external_ref=body.transaction_set,
        member=MemberIn(
            member_id=parsed.get("member_id") or "EDI_MEMBER",
            first_name="EDI", last_name="Member",
            date_of_birth=date(1970, 1, 1), gender="U",
            payer="UHC",
        ),
        provider=ProviderIn(
            npi=(parsed.get("provider_npi") or "0000000000")[:10].zfill(10),
            name="EDI Provider",
        ),
        diagnoses=dx_list,
        procedures=proc_list,
        service_type=parsed.get("service_type", "OTHER"),
        requested_start_date=date.today(),
        clinical_summary=f"EDI 278 transaction {body.transaction_set}",
        urgency=parsed.get("urgency", "ROUTINE"),
    )
    return await submit(req, background_tasks)

# ── GET /intake/{pa_number}/status ────────────────────────────────────────────
@app.get("/intake/{pa_number}/status")
async def get_status(pa_number: str):
    """Check processing status of an intake submission."""
    return {
        "pa_number": pa_number,
        "intake_status": "PROCESSED",
        "ai_queued": True,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

# ── GET /intake/{pa_number}/sla ────────────────────────────────────────────────
@app.get("/intake/{pa_number}/sla")
async def get_sla(pa_number: str):
    """
    Return SLA deadline and remaining hours for a PA request.
    Used by Member Portal to display estimated decision date.
    FR-401, FR-402.
    """
    from datetime import timedelta
    # Production: retrieve from DB. Demo: derive from PA number timestamp.
    now = datetime.now(timezone.utc)
    # Parse submission date from PA number if format PA-YYYY-NNNNNN
    try:
        year_part = int(pa_number.split("-")[1]) if "-" in pa_number else now.year
        submitted_at = datetime(year_part, now.month, now.day, tzinfo=timezone.utc)
    except Exception:
        submitted_at = now - timedelta(hours=24)

    # Default to ROUTINE SLA until we resolve from DB
    urgency = "ROUTINE"
    hours = SLA_HOURS.get(urgency, 72)
    sla_deadline = submitted_at + timedelta(hours=hours)
    hours_remaining = max(0, (sla_deadline - now).total_seconds() / 3600)
    is_at_risk = hours_remaining < 12

    return {
        "pa_number": pa_number,
        "urgency": urgency,
        "sla_deadline": sla_deadline.isoformat(),
        "hours_remaining": round(hours_remaining, 1),
        "is_at_risk": is_at_risk,
        "sla_hours_total": hours,
        "checked_at": now.isoformat(),
    }

# ── POST /intake/validate ──────────────────────────────────────────────────────
@app.post("/intake/validate")
async def validate_only(req: IntakeRequest):
    """Dry-run validation without submitting. Useful for portal pre-check (FR-006)."""
    issues = validate_intake(req)
    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "required_fields_complete": len(issues) == 0,
        "service_type_checks_applied": req.service_type,
    }
