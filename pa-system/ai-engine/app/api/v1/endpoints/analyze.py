"""
AI Engine API — /api/v1/analyze
Core endpoint: submit PA for AI analysis, returns recommendation.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import encrypt_phi
from app.api.deps import get_current_user
from app.schemas.pa_schemas import (
    PASubmissionRequest, AIRecommendation, AutoDecisionResult,
    EligibilityRequest, EligibilityResult, DocumentExtractionRequest,
    DocumentExtractionResult,
)
from app.services.criteria_engine import CriteriaEngine
from app.services.nlp_extractor import NLPExtractor
from app.services.auto_decision import AutoDecisionService
from app.utils.helpers import generate_pa_number, EventPublisher, AuditLogger, EligibilityChecker
from app.models.pa_models import PACase, PADecision
import structlog

log = structlog.get_logger(__name__)
router = APIRouter()


# ── POST /analyze ─────────────────────────────────────────────────────────────
@router.post("/analyze", response_model=AIRecommendation, status_code=status.HTTP_200_OK)
async def analyze_pa(
    submission: PASubmissionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Run full AI clinical criteria analysis on a PA submission.
    Returns confidence score, recommendation, criteria breakdown, routing decision.
    Target: <5 seconds (TR-204).
    """
    # Assign PA number if not set
    if not submission.pa_number:
        submission.pa_number = generate_pa_number()

    log.info("analyze.start", pa=submission.pa_number, user=current_user.get("sub"))

    # Run AI analysis
    result = await CriteriaEngine.analyze(submission)

    # Persist case + AI result async
    background_tasks.add_task(
        _persist_case, submission, result, db, current_user
    )

    return result


# ── POST /analyze/with-decision ───────────────────────────────────────────────
@router.post("/analyze/with-decision", response_model=dict, status_code=status.HTTP_200_OK)
async def analyze_and_decide(
    submission: PASubmissionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Full pipeline: analyze → auto-decide → publish event.
    Returns both AI recommendation and auto-decision result.
    """
    if not submission.pa_number:
        submission.pa_number = generate_pa_number()

    # 1. AI Analysis
    ai_result = await CriteriaEngine.analyze(submission)

    # 2. Auto-decision
    decision_result = await AutoDecisionService.evaluate(submission, ai_result)

    # 3. Publish Kafka event
    background_tasks.add_task(
        EventPublisher.publish_decision,
        submission.pa_number,
        decision_result.decision.value,
        {"confidence": ai_result.confidence_score, "route": ai_result.route_decision.value}
    )

    # 4. Audit log
    background_tasks.add_task(
        AuditLogger.log,
        action="AI_DECISION",
        resource="pa_case",
        resource_id=submission.pa_number,
        user_id=current_user.get("sub"),
        details=f"Decision: {decision_result.decision}, Confidence: {ai_result.confidence_score:.2%}",
        phi_accessed=True,
        phi_fields="member_id,diagnosis,procedure",
    )

    return {
        "pa_number": submission.pa_number,
        "ai_recommendation": ai_result.model_dump(),
        "auto_decision": decision_result.model_dump(),
    }


# ── POST /eligibility/verify ──────────────────────────────────────────────────
@router.post("/eligibility/verify", response_model=dict)
async def verify_eligibility(
    request: EligibilityRequest,
    current_user: dict = Depends(get_current_user),
):
    """Verify member eligibility in real-time against payer system (FR-004)."""
    result = await EligibilityChecker.verify(
        member_id=request.member_id,
        payer=request.payer.value,
        service_date=request.date_of_service,
        provider_npi=request.provider_npi,
    )
    return result


# ── POST /documents/extract ───────────────────────────────────────────────────
@router.post("/documents/extract", response_model=DocumentExtractionResult)
async def extract_document(
    request: DocumentExtractionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Extract clinical entities from a document (OCR if needed).
    Implements FR-002, FR-003.
    """
    # Fetch raw text from S3 or use pre-provided
    if request.s3_key:
        raw_text = await NLPExtractor.ocr_document(request.s3_key)
    else:
        raw_text = f"[No S3 key — document_id={request.document_id}]"

    return await NLPExtractor.extract(request, raw_text)


# ── GET /pa/{pa_number}/status ────────────────────────────────────────────────
@router.get("/pa/{pa_number}/status")
async def get_pa_status(
    pa_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get current status and AI analysis for a PA case."""
    from sqlalchemy import select
    result = await db.execute(select(PACase).where(PACase.pa_number == pa_number))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"PA {pa_number} not found")
    return {
        "pa_number": case.pa_number,
        "status": case.status,
        "ai_confidence": case.ai_confidence,
        "ai_recommendation": case.ai_recommendation,
        "ai_route_decision": case.ai_route_decision,
        "submitted_at": case.submitted_at,
        "sla_deadline": case.sla_deadline,
        "updated_at": case.updated_at,
    }


# ── POST /pa/{pa_number}/decision ─────────────────────────────────────────────
@router.post("/pa/{pa_number}/decision")
async def record_reviewer_decision(
    pa_number: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Record a human reviewer's decision. Tracks AI agreement rate (FR-207).
    Requires MD co-sign for denials (FR-204).
    """
    from sqlalchemy import select
    result = await db.execute(select(PACase).where(PACase.pa_number == pa_number))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="PA not found")

    decision_value = payload.get("decision")
    if not decision_value:
        raise HTTPException(status_code=400, detail="decision field required")

    # Require MD co-sign for denials
    if decision_value == "DENIED" and not payload.get("md_cosign_id"):
        raise HTTPException(status_code=422,
                            detail="MD co-signature required for denial (FR-204)")

    # Track AI agreement
    ai_agreed = case.ai_recommendation == decision_value if case.ai_recommendation else None

    # Create decision record
    decision = PADecision(
        case_id=case.id,
        pa_number=pa_number,
        decision=decision_value,
        is_auto=False,
        reviewer_id=current_user.get("sub"),
        reviewer_name=current_user.get("name"),
        reviewer_notes=payload.get("notes"),
        denial_reason_code=payload.get("denial_reason_code"),
        denial_reason_text=payload.get("denial_reason_text"),
        md_cosign_id=payload.get("md_cosign_id"),
        auth_number=payload.get("auth_number"),
        ai_agreed=ai_agreed,
        ai_confidence_at_decision=case.ai_confidence,
    )
    db.add(decision)

    # Update case status
    case.status = decision_value
    case.decision_at = datetime.now(timezone.utc)
    await db.flush()

    background_tasks.add_task(
        AuditLogger.log,
        action="CASE_DECISION",
        resource="pa_case",
        resource_id=pa_number,
        user_id=current_user.get("sub"),
        user_name=current_user.get("name"),
        user_role=current_user.get("role"),
        details=f"Decision: {decision_value}, AI agreed: {ai_agreed}",
        phi_accessed=True,
        phi_fields="pa_case",
    )
    background_tasks.add_task(
        EventPublisher.publish_decision, pa_number, decision_value,
        {"reviewer": current_user.get("name"), "ai_agreed": ai_agreed}
    )

    return {"pa_number": pa_number, "decision": decision_value, "ai_agreed": ai_agreed}


# ── Internal background task ───────────────────────────────────────────────────
async def _persist_case(
    submission: PASubmissionRequest,
    ai_result: AIRecommendation,
    db: AsyncSession,
    current_user: dict,
):
    """Persist PA case + AI analysis to DB (background task)."""
    try:
        from sqlalchemy import select
        # Check if case already exists
        existing = await db.execute(
            select(PACase).where(PACase.pa_number == submission.pa_number)
        )
        if existing.scalar_one_or_none():
            return   # Already persisted

        deadline = AutoDecisionService.compute_sla_deadline(submission)
        member = submission.member
        proc = submission.primary_procedure

        case = PACase(
            pa_number=submission.pa_number or generate_pa_number(),
            member_id_enc=encrypt_phi(member.member_id),
            member_name_enc=encrypt_phi(f"{member.first_name} {member.last_name}"),
            member_dob_enc=encrypt_phi(str(member.date_of_birth)),
            payer=member.payer.value,
            provider_npi=submission.provider.npi,
            provider_name=submission.provider.name,
            primary_diagnosis_code=submission.primary_diagnosis.code if submission.primary_diagnosis else "",
            primary_procedure_code=proc.code if proc else "",
            service_type=submission.service_type.value,
            urgency=submission.urgency.value,
            requested_units=submission.requested_units,
            clinical_summary_enc=encrypt_phi(submission.clinical_summary),
            status="IN_REVIEW" if ai_result.route_decision.value.startswith("HUMAN") else "SUBMITTED",
            sla_deadline=deadline,
            ai_confidence=ai_result.confidence_score,
            ai_recommendation=ai_result.recommendation,
            ai_route_decision=ai_result.route_decision.value,
            ai_analysis_json=ai_result.model_dump_json(),
            ai_processed_at=datetime.now(timezone.utc),
            submitted_at=submission.submitted_at or datetime.now(timezone.utc),
        )
        db.add(case)
        await db.flush()
        log.info("persist_case.saved", pa=submission.pa_number)
    except Exception as e:
        log.error("persist_case.failed", pa=submission.pa_number, error=str(e))
