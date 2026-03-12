"""
Provider Portal API endpoints.

Serves all routes called by provider-portal/lib/api.ts:
  /api/v1/prior-authorizations/*
  /api/v1/eligibility/*
  /api/v1/documents/*
  /api/v1/notifications/*
  /api/v1/lookup/*
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.utils.helpers import generate_pa_number

log = structlog.get_logger(__name__)
router = APIRouter()

# ── In-memory demo stores (per-session) ───────────────────────────────────────
_pa_store:     Dict[str, List[dict]] = {}
_notif_store:  Dict[str, List[dict]] = {}
_doc_store:    Dict[str, dict]       = {}

# ── Demo seed helpers ─────────────────────────────────────────────────────────
_STATUSES   = ["SUBMITTED", "IN_REVIEW", "APPROVED", "DENIED", "PENDED", "CANCELLED"]
_SVC_TYPES  = ["DIAGNOSTIC_IMAGING", "SURGICAL_PROCEDURE", "SPECIALTY_MEDICATION",
                "PHYSICAL_THERAPY", "DURABLE_MEDICAL_EQUIPMENT", "HOME_HEALTH"]
_PAYERS     = ["UHC", "AETNA", "BCBS", "CIGNA", "HUMANA"]
_DIAGNOSES  = [("M54.5","Low back pain"),("J18.9","Pneumonia"),("I10","Essential hypertension"),
                ("E11.9","Type 2 diabetes"),("M17.11","Osteoarthritis, right knee"),
                ("C50.911","Breast cancer"),("F32.1","Major depressive disorder")]
_PROCEDURES = [("72148","MRI Lumbar Spine"),("27447","Total knee arthroplasty"),
                ("J0135","Adalimumab injection"),("97110","Therapeutic exercises"),
                ("43239","EGD with biopsy"),("99213","Office visit, established patient")]
_NAMES      = [("John","Smith"),("Sarah","Johnson"),("Michael","Williams"),("Emily","Brown"),
               ("James","Davis"),("Jessica","Miller"),("Robert","Wilson"),("Linda","Moore")]


def _seed_pa(npi: str, idx: int) -> dict:
    dx   = random.choice(_DIAGNOSES)
    proc = random.choice(_PROCEDURES)
    nm   = random.choice(_NAMES)
    st   = random.choice(_STATUSES)
    created = datetime.now(timezone.utc) - timedelta(days=random.randint(0, 45))
    ai_conf = round(random.uniform(0.52, 0.98), 3)
    return {
        "id":                          str(uuid.uuid4()),
        "pa_number":                   f"PA-2026-{100000+idx:06d}",
        "status":                      st,
        "urgency":                     random.choice(["ROUTINE","ROUTINE","URGENT","EMERGENT"]),
        "service_type":                random.choice(_SVC_TYPES),
        "payer":                       random.choice(_PAYERS),
        "provider_npi":                npi,
        "member_id":                   f"MB{random.randint(10000000,99999999)}",
        "member_name":                 f"{nm[0]} {nm[1]}",
        "member_dob":                  "1978-03-15",
        "primary_diagnosis_code":      dx[0],
        "primary_diagnosis_description": dx[1],
        "procedure_code":              proc[0],
        "procedure_description":       proc[1],
        "clinical_notes":              "Patient has documented medical necessity for the requested service.",
        "ai_confidence":               ai_conf,
        "ai_recommendation":           "APPROVE" if ai_conf>0.75 else ("DENY" if ai_conf<0.35 else "REVIEW_REQUIRED"),
        "submitted_at":                created.isoformat(),
        "updated_at":                  (created+timedelta(hours=random.randint(1,48))).isoformat(),
        "sla_deadline":                (created+timedelta(hours=72)).isoformat(),
        "decision_date":               (created+timedelta(hours=24)).isoformat() if st in ("APPROVED","DENIED") else None,
        "auth_number":                 f"AUTH{random.randint(1000000,9999999)}" if st=="APPROVED" else None,
        "auth_valid_through":          (datetime.now(timezone.utc)+timedelta(days=180)).strftime("%Y-%m-%d") if st=="APPROVED" else None,
        "denial_reason":               "Clinical criteria not met per MCG guidelines." if st=="DENIED" else None,
        "reviewer_name":               "Sarah Parker RN" if st in ("APPROVED","DENIED","PENDED") else None,
        "documents":                   [],
        "appeal_status":               "NO_APPEAL",
    }


def _get_pas(npi: str) -> List[dict]:
    if npi not in _pa_store:
        _pa_store[npi] = [_seed_pa(npi, i) for i in range(20)]
    return _pa_store[npi]


def _get_notifs(uid: str) -> List[dict]:
    if uid not in _notif_store:
        _notif_store[uid] = [
            {
                "id":         str(uuid.uuid4()),
                "type":       random.choice(["DECISION","STATUS_UPDATE","INFO_NEEDED","APPEAL_UPDATE"]),
                "title":      random.choice(["PA Approved","Additional Info Required","PA Submitted","Decision Pending"]),
                "message":    "Your prior authorization request has been updated. Please review.",
                "pa_number":  f"PA-2026-{100000+i:06d}",
                "created_at": (datetime.now(timezone.utc)-timedelta(hours=i*4)).isoformat(),
                "read":       i > 2,
                "priority":   "HIGH" if i < 2 else "NORMAL",
            }
            for i in range(10)
        ]
    return _notif_store[uid]


# ═══════════════════════════════════════════════════════════════════════════════
# PRIOR AUTHORIZATIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/prior-authorizations")
async def list_pas(
    status_filter: Optional[str] = Query(None, alias="status"),
    urgency:       Optional[str] = None,
    search:        Optional[str] = None,
    date_from:     Optional[str] = None,
    date_to:       Optional[str] = None,
    page:          int = Query(1, ge=1),
    limit:         int = Query(20, ge=1, le=100),
    current_user:  dict = Depends(get_current_user),
):
    npi = current_user.get("npi", current_user.get("sub", "DEFAULT_NPI"))
    pas = _get_pas(npi)

    if status_filter:
        pas = [p for p in pas if p["status"] == status_filter.upper()]
    if urgency:
        pas = [p for p in pas if p["urgency"] == urgency.upper()]
    if search:
        s = search.lower()
        pas = [p for p in pas if s in p["pa_number"].lower() or s in p.get("member_name","").lower()
               or s in p.get("procedure_description","").lower()]

    total = len(pas)
    start = (page - 1) * limit
    return {"items": pas[start:start+limit], "total": total, "page": page,
            "pages": max(1,(total+limit-1)//limit), "limit": limit}


@router.post("/prior-authorizations", status_code=201)
async def submit_pa(data: dict, background: BackgroundTasks,
                    current_user: dict = Depends(get_current_user)):
    """Submit a new PA.

    FR-103 (Step Therapy / Formulary Check):
    If payer is CVS or service_type is SPECIALTY_MEDICATION / PHARMACY,
    a formulary pre-check is performed via eligibility-service /formulary/check
    before AI scoring. Submissions failing formulary get ERR-107/ERR-108.
    """
    import os
    pa_number = generate_pa_number()
    npi = current_user.get("npi", current_user.get("sub", "DEFAULT_NPI"))

    # ── FR-103: Formulary / step-therapy pre-check for pharmacy PAs ────────────────────
    payer        = data.get("payer", "UHC")
    service_type = data.get("service_type", "")
    ndc_code     = data.get("ndc_code") or data.get("procedure_code", "")
    is_pharmacy_pa = (
        payer == "CVS"
        or service_type in ("SPECIALTY_MEDICATION", "PHARMACY")
        or (ndc_code and len(ndc_code.replace("-", "")) == 11)
    )

    formulary_result: dict = {}
    if is_pharmacy_pa and ndc_code:
        try:
            import httpx as _httpx
            eligibility_url = os.getenv("ELIGIBILITY_SERVICE_URL",
                                        "http://eligibility-service:8010")
            async with _httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    f"{eligibility_url}/formulary/check",
                    json={
                        "member_id":  data.get("member_id", ""),
                        "drug_name":  data.get("drug_name") or ndc_code,
                        "ndc_code":   ndc_code,
                        "payer_code": payer,
                    },
                )
            formulary_result = resp.json() if resp.status_code == 200 else {}

            # FR-103: Block if drug not covered (ERR-107)
            if formulary_result.get("coverage_status") == "NOT_COVERED":
                return {
                    "error":     "ERR-107",
                    "message":   "This service is not covered under the member's plan. "
                                 + formulary_result.get("reason", ""),
                    "formulary": formulary_result,
                    "pa_number": None,
                    "action":    "Review plan benefits or contact payer",
                }

            # FR-103: Block if step therapy required but not documented (ERR-108)
            if (formulary_result.get("step_therapy_required")
                    and not data.get("prior_treatments")
                    and not data.get("step_therapy_documented")):
                step = formulary_result.get("required_step_therapy", "preferred alternative")
                return {
                    "error":     "ERR-108",
                    "message":   f"Plan requires documented trial of {step} before this service.",
                    "formulary": formulary_result,
                    "pa_number": None,
                    "action":    "Document prior conservative care or step-therapy attempt",
                }

            log.info("pa.formulary_check_passed",
                     ndc=ndc_code, payer=payer, coverage=formulary_result.get("coverage_status"))

        except Exception as exc:
            log.warning("pa.formulary_check_failed", error=str(exc), ndc=ndc_code, payer=payer)
            formulary_result = {"warning": "formulary_check_unavailable"}

    # Run AI analysis (graceful fallback)
    try:
        from app.services.criteria_engine import CriteriaEngine
        from app.schemas.pa_schemas import (
            PASubmissionRequest, MemberInfo, ProviderInfo,
            DiagnosisCode, ProcedureCode, PayerCode, ServiceType, Urgency
        )
        from datetime import date
        submission = PASubmissionRequest(
            pa_number=pa_number,
            member=MemberInfo(
                member_id=data.get("member_id","M000000"),
                first_name=data.get("member_first_name","Unknown"),
                last_name=data.get("member_last_name","Unknown"),
                date_of_birth=date.fromisoformat(data["member_dob"]) if data.get("member_dob") else date(1980,1,1),
                payer=PayerCode(data.get("payer","UHC")),
            ),
            provider=ProviderInfo(npi=data.get("provider_npi","0000000000"), name=data.get("provider_name","Unknown")),
            primary_diagnosis=DiagnosisCode(code=data.get("primary_diagnosis_code","Z00.00"),
                                            description=data.get("primary_diagnosis_description","")),
            primary_procedure=ProcedureCode(code=data.get("procedure_code","99999"),
                                            description=data.get("procedure_description","")),
            service_type=ServiceType(data.get("service_type","DIAGNOSTIC_IMAGING")),
            urgency=Urgency(data.get("urgency","ROUTINE")),
            clinical_summary=data.get("clinical_notes",""),
            submitted_at=datetime.now(timezone.utc),
        )
        ai_result = await CriteriaEngine.analyze(submission)
        ai_conf   = ai_result.confidence_score
        ai_rec    = ai_result.recommendation
        route     = ai_result.route_decision.value
    except Exception as exc:
        log.warning("pa.ai_analysis_failed", error=str(exc))
        ai_conf = round(random.uniform(0.60, 0.92), 3)
        ai_rec  = "APPROVE" if ai_conf > 0.75 else "REVIEW_REQUIRED"
        route   = "AUTO_APPROVE" if ai_conf >= 0.92 else "HUMAN_REVIEW_REQUIRED"

    pa_status  = "APPROVED" if route == "AUTO_APPROVE" else "IN_REVIEW"
    auth_num   = f"AUTH{random.randint(1000000,9999999)}" if pa_status == "APPROVED" else None
    new_pa: dict = {
        "id":                            str(uuid.uuid4()),
        "pa_number":                     pa_number,
        "status":                        pa_status,
        "urgency":                       data.get("urgency","ROUTINE"),
        "service_type":                  data.get("service_type","DIAGNOSTIC_IMAGING"),
        "payer":                         data.get("payer","UHC"),
        "provider_npi":                  data.get("provider_npi",""),
        "provider_name":                 data.get("provider_name",""),
        "member_id":                     data.get("member_id",""),
        "member_name":                   f"{data.get('member_first_name','')} {data.get('member_last_name','')}".strip(),
        "member_dob":                    data.get("member_dob",""),
        "primary_diagnosis_code":        data.get("primary_diagnosis_code",""),
        "primary_diagnosis_description": data.get("primary_diagnosis_description",""),
        "procedure_code":                data.get("procedure_code",""),
        "procedure_description":         data.get("procedure_description",""),
        "clinical_notes":                data.get("clinical_notes",""),
        "ai_confidence":                 ai_conf,
        "ai_recommendation":             ai_rec,
        "ai_route":                      route,
        "submitted_at":                  datetime.now(timezone.utc).isoformat(),
        "updated_at":                    datetime.now(timezone.utc).isoformat(),
        "sla_deadline":                  (datetime.now(timezone.utc)+timedelta(hours=72)).isoformat(),
        "auth_number":                   auth_num,
        "decision_date":                 datetime.now(timezone.utc).isoformat() if pa_status=="APPROVED" else None,
        "auth_valid_through":            (datetime.now(timezone.utc)+timedelta(days=180)).strftime("%Y-%m-%d") if pa_status=="APPROVED" else None,
        "documents":                     [],
        "appeal_status":                 "NO_APPEAL",
    }
    _get_pas(npi).insert(0, new_pa)
    return new_pa


@router.get("/prior-authorizations/stats")
async def pa_stats(current_user: dict = Depends(get_current_user)):
    npi = current_user.get("npi", current_user.get("sub","DEFAULT_NPI"))
    pas = _get_pas(npi)
    by_status: Dict[str,int] = {}
    for p in pas:
        by_status[p["status"]] = by_status.get(p["status"],0)+1
    return {
        "total":                len(pas),
        "by_status":            by_status,
        "pending_review":       by_status.get("IN_REVIEW",0)+by_status.get("PENDED",0),
        "approved_this_month":  by_status.get("APPROVED",0),
        "denied_this_month":    by_status.get("DENIED",0),
        "avg_turnaround_hours": round(random.uniform(12,24),1),
        "auto_approval_rate":   round(random.uniform(0.70,0.82),3),
        "sla_compliance":       round(random.uniform(0.975,0.999),3),
    }


@router.get("/prior-authorizations/{pa_id}")
async def get_pa(pa_id: str, current_user: dict = Depends(get_current_user)):
    npi = current_user.get("npi", current_user.get("sub","DEFAULT_NPI"))
    for p in _get_pas(npi):
        if p["id"] == pa_id or p["pa_number"] == pa_id:
            return p
    # Return a plausible demo record if not found
    return _seed_pa(npi, abs(hash(pa_id)) % 10000)


@router.get("/prior-authorizations/{pa_id}/history")
async def pa_history(pa_id: str, current_user: dict = Depends(get_current_user)):
    base = datetime.now(timezone.utc) - timedelta(hours=48)
    return {
        "pa_number": pa_id,
        "history": [
            {"status":"SUBMITTED",  "timestamp": base.isoformat(),
             "actor":"Dr. Robert Smith","note":"PA submitted via provider portal."},
            {"status":"IN_REVIEW",  "timestamp":(base+timedelta(minutes=5)).isoformat(),
             "actor":"AI Engine",  "note":f"AI analysis complete — confidence {random.randint(65,94)}%"},
            {"status":"IN_REVIEW",  "timestamp":(base+timedelta(hours=2)).isoformat(),
             "actor":"Sarah Parker RN","note":"Case assigned for clinical review."},
            {"status":"APPROVED",   "timestamp":(base+timedelta(hours=18)).isoformat(),
             "actor":"Dr. Emily Chen MD","note":"Approved — criteria met per MCG guidelines."},
        ],
    }


@router.get("/prior-authorizations/{pa_id}/letter")
async def pa_letter(pa_id: str, current_user: dict = Depends(get_current_user)):
    letter = (
        f"PRIOR AUTHORIZATION DETERMINATION LETTER\n\n"
        f"PA Number: {pa_id}\nDate: {datetime.now().strftime('%B %d, %Y')}\n"
        f"Provider: {current_user.get('name','Dr. Smith')}\n\n"
        f"DETERMINATION: APPROVED\n\n"
        f"This letter confirms that the requested prior authorization has been approved\n"
        f"based on review of submitted clinical documentation.\n\n"
        f"Authorization Number: AUTH{random.randint(1000000,9999999)}\n"
        f"Valid Through: {(datetime.now()+timedelta(days=180)).strftime('%B %d, %Y')}\n\n"
        f"For questions, contact Prior Authorization at 1-800-PA-SYSTEM.\n"
    )
    return Response(content=letter.encode(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=PA-letter-{pa_id}.pdf"})


@router.post("/prior-authorizations/{pa_id}/cancel")
async def cancel_pa(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    npi = current_user.get("npi", current_user.get("sub","DEFAULT_NPI"))
    for p in _get_pas(npi):
        if p["id"] == pa_id or p["pa_number"] == pa_id:
            p["status"] = "CANCELLED"
            p["updated_at"] = datetime.now(timezone.utc).isoformat()
    return {"pa_number": pa_id, "status": "CANCELLED", "reason": body.get("reason")}


@router.post("/prior-authorizations/{pa_id}/peer-to-peer")
async def request_p2p(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    return {
        "pa_number":        pa_id,
        "p2p_request_id":   f"P2P-{uuid.uuid4().hex[:8].upper()}",
        "status":           "SCHEDULED",
        "preferred_time":   body.get("preferred_time"),
        "assigned_reviewer":"Dr. Emily Chen MD",
        "contact_phone":    body.get("phone"),
        "message":          "Peer-to-peer consultation scheduled. You will receive a confirmation call within 24 hours.",
    }


@router.post("/prior-authorizations/{pa_id}/appeals")
async def submit_appeal(pa_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    return {
        "appeal_id":        f"APL-{uuid.uuid4().hex[:8].upper()}",
        "pa_number":        pa_id,
        "status":           "SUBMITTED",
        "submitted_at":     datetime.now(timezone.utc).isoformat(),
        "deadline":         (datetime.now(timezone.utc)+timedelta(days=30)).isoformat(),
        "tracking_number":  f"TRK-{random.randint(100000,999999)}",
        "message":          "Appeal received. You will be notified within 30 days (72 hours for expedited).",
    }


@router.get("/prior-authorizations/{pa_id}/appeals")
async def get_appeals(pa_id: str, current_user: dict = Depends(get_current_user)):
    return {
        "pa_number": pa_id,
        "appeals": [
            {
                "appeal_id":    f"APL-{uuid.uuid4().hex[:8].upper()}",
                "status":       random.choice(["SUBMITTED","IN_REVIEW","UPHELD","OVERTURNED"]),
                "submitted_at": (datetime.now(timezone.utc)-timedelta(days=5)).isoformat(),
                "deadline":     (datetime.now(timezone.utc)+timedelta(days=25)).isoformat(),
                "type":         "STANDARD",
            }
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ELIGIBILITY
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/eligibility/verify")
async def verify_eligibility(data: dict, current_user: dict = Depends(get_current_user)):
    ded = random.choice([500.0,1000.0,2000.0,3000.0])
    return {
        "member_id":            data.get("member_id",""),
        "payer":                data.get("payer","UHC"),
        "coverage_status":      "ACTIVE",
        "coverage_type":        "PPO",
        "plan_name":            f"{data.get('payer','UHC')} Choice Plus PPO",
        "group_number":         f"GRP{random.randint(100000,999999)}",
        "effective_date":       "2026-01-01",
        "termination_date":     None,
        "deductible_individual":ded,
        "deductible_remaining": round(ded*random.uniform(0.1,0.9),2),
        "deductible_met":       random.random()>0.5,
        "out_of_pocket_max":    7000.0,
        "out_of_pocket_remaining": round(random.uniform(500,6000),2),
        "copay_specialist":     40.0,
        "coinsurance":          0.20,
        "prior_auth_required":  True,
        "requires_pcp_referral":False,
        "verified_at":          datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/documents/upload")
async def upload_document(
    file:          UploadFile = File(...),
    pa_number:     str = Form(None),
    document_type: str = Form("CLINICAL_NOTES"),
    current_user:  dict = Depends(get_current_user),
):
    doc_id  = str(uuid.uuid4())
    content = await file.read()
    doc = {
        "document_id":   doc_id,
        "pa_number":     pa_number,
        "filename":      file.filename,
        "document_type": document_type,
        "file_size":     len(content),
        "mime_type":     file.content_type or "application/octet-stream",
        "status":        "PROCESSED",
        "ocr_status":    "COMPLETE",
        "uploaded_at":   datetime.now(timezone.utc).isoformat(),
        "uploaded_by":   current_user.get("name","Unknown"),
    }
    _doc_store[doc_id] = doc
    return doc


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    _doc_store.pop(doc_id, None)
    return {"document_id": doc_id, "deleted": True}


# ═══════════════════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/notifications")
async def get_notifications(
    unread_only: bool = False,
    limit:       int  = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    ns = _get_notifs(current_user.get("sub","u-001"))
    if unread_only:
        ns = [n for n in ns if not n["read"]]
    return {
        "notifications": ns[:limit],
        "total":         len(ns),
        "unread_count":  sum(1 for n in ns if not n["read"]),
    }


@router.put("/notifications/{notification_id}/read")
async def mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    for n in _get_notifs(current_user.get("sub","u-001")):
        if n["id"] == notification_id:
            n["read"] = True
    return {"notification_id": notification_id, "read": True}


@router.put("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    for n in _get_notifs(current_user.get("sub","u-001")):
        n["read"] = True
    return {"message": "All notifications marked as read"}


@router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","u-001")
    _notif_store[uid] = [n for n in _get_notifs(uid) if n["id"] != notification_id]
    return {"notification_id": notification_id, "deleted": True}


# ═══════════════════════════════════════════════════════════════════════════════
# LOOKUP / REFERENCE DATA
# ═══════════════════════════════════════════════════════════════════════════════

_ICD10 = [
    {"code":"M54.5","description":"Low back pain","category":"Musculoskeletal"},
    {"code":"J18.9","description":"Pneumonia, unspecified","category":"Respiratory"},
    {"code":"I10","description":"Essential (primary) hypertension","category":"Circulatory"},
    {"code":"E11.9","description":"Type 2 diabetes mellitus without complications","category":"Endocrine"},
    {"code":"M17.11","description":"Primary osteoarthritis, right knee","category":"Musculoskeletal"},
    {"code":"C50.911","description":"Malignant neoplasm of unspecified site of right female breast","category":"Neoplasms"},
    {"code":"F32.1","description":"Major depressive disorder, single episode, moderate","category":"Mental"},
    {"code":"G43.909","description":"Migraine, unspecified, not intractable","category":"Nervous"},
    {"code":"N18.3","description":"Chronic kidney disease, stage 3","category":"Genitourinary"},
    {"code":"Z79.4","description":"Long-term (current) use of insulin","category":"Factors"},
]

_CPT = [
    {"code":"72148","description":"MRI Lumbar Spine without contrast","category":"Radiology"},
    {"code":"27447","description":"Total knee arthroplasty","category":"Surgery"},
    {"code":"97110","description":"Therapeutic exercises","category":"Physical Medicine"},
    {"code":"43239","description":"EGD with biopsy","category":"Surgery"},
    {"code":"99213","description":"Office/outpatient visit, established patient","category":"E&M"},
    {"code":"70553","description":"MRI Brain with and without contrast","category":"Radiology"},
    {"code":"93000","description":"Electrocardiogram, routine","category":"Cardiology"},
    {"code":"36415","description":"Collection of venous blood by venipuncture","category":"Lab"},
    {"code":"J0135","description":"Adalimumab injection","category":"Drugs"},
    {"code":"J3490","description":"Unclassified drugs","category":"Drugs"},
]

_SPECIALTIES = [
    "Cardiology","Oncology","Orthopedic Surgery","Neurology","Rheumatology",
    "Gastroenterology","Pulmonology","Nephrology","Endocrinology","Dermatology",
    "Psychiatry","Physical Medicine & Rehabilitation","Pain Management","Ophthalmology",
]

_PLACES_OF_SERVICE = [
    {"code":"11","description":"Office"},{"code":"21","description":"Inpatient Hospital"},
    {"code":"22","description":"On Campus-Outpatient Hospital"},{"code":"23","description":"Emergency Room – Hospital"},
    {"code":"24","description":"Ambulatory Surgical Center"},{"code":"31","description":"Skilled Nursing Facility"},
    {"code":"32","description":"Nursing Facility"},{"code":"33","description":"Custodial Care Facility"},
    {"code":"41","description":"Ambulance – Land"},{"code":"51","description":"Inpatient Psychiatric Facility"},
    {"code":"61","description":"Comprehensive Inpatient Rehabilitation Facility"},
    {"code":"81","description":"Independent Laboratory"},{"code":"99","description":"Other Place of Service"},
]


@router.get("/lookup/icd10")
async def lookup_icd10(q: str = Query("", min_length=0), current_user: dict = Depends(get_current_user)):
    results = [x for x in _ICD10 if q.lower() in x["code"].lower() or q.lower() in x["description"].lower()] if q else _ICD10
    return {"results": results[:20], "total": len(results)}


@router.get("/lookup/cpt")
async def lookup_cpt(q: str = Query("", min_length=0), current_user: dict = Depends(get_current_user)):
    results = [x for x in _CPT if q.lower() in x["code"].lower() or q.lower() in x["description"].lower()] if q else _CPT
    return {"results": results[:20], "total": len(results)}


@router.get("/lookup/npi")
async def lookup_npi(q: str = Query("", min_length=0), current_user: dict = Depends(get_current_user)):
    results = [
        {"npi":f"1{random.randint(000000000,999999999):09d}",
         "name":f"Dr. {random.choice(['Smith','Johnson','Williams','Jones','Brown'])}",
         "specialty":random.choice(_SPECIALTIES),"city":"Chicago","state":"IL"}
        for _ in range(5)
    ]
    return {"results": results, "total": len(results)}


@router.get("/lookup/specialties")
async def get_specialties(current_user: dict = Depends(get_current_user)):
    return {"specialties": _SPECIALTIES}


@router.get("/lookup/places-of-service")
async def get_places_of_service(current_user: dict = Depends(get_current_user)):
    return {"places_of_service": _PLACES_OF_SERVICE}
