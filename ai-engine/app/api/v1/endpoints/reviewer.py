"""
Reviewer Workbench API endpoints.

Serves all routes called by reviewer-workbench/lib/api.ts:
  /api/v1/review-queue/*
  /api/v1/cases/*
  /api/v1/metrics/*
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.api.deps import get_current_user

log = structlog.get_logger(__name__)
router = APIRouter()

# ── In-memory stores ───────────────────────────────────────────────────────────
_queue_store: List[dict] = []
_case_store:  Dict[str, dict] = {}

_SVC_TYPES  = ["DIAGNOSTIC_IMAGING","SURGICAL_PROCEDURE","SPECIALTY_MEDICATION",
                "PHYSICAL_THERAPY","DURABLE_MEDICAL_EQUIPMENT","HOME_HEALTH"]
_PAYERS     = ["UHC","AETNA","BCBS","CIGNA","HUMANA"]
_DIAGNOSES  = [("M54.5","Low back pain"),("J18.9","Pneumonia"),("I10","Essential hypertension"),
                ("E11.9","Type 2 diabetes"),("M17.11","Osteoarthritis, right knee")]
_PROCEDURES = [("72148","MRI Lumbar Spine"),("27447","Total knee arthroplasty"),
                ("J0135","Adalimumab injection"),("97110","Therapeutic exercises")]
_NAMES      = [("John","Smith"),("Sarah","Johnson"),("Michael","Williams"),("Emily","Brown"),
               ("James","Davis"),("Jessica","Miller")]
_REVIEWERS  = ["Sarah Parker RN","Michael Chen RN","Jennifer Lee RN","David Kim RN",None,None]


def _seed_queue():
    global _queue_store
    if _queue_store:
        return
    for i in range(30):
        dx   = random.choice(_DIAGNOSES)
        proc = random.choice(_PROCEDURES)
        nm   = random.choice(_NAMES)
        conf = round(random.uniform(0.25, 0.89), 3)
        assigned = random.choice(_REVIEWERS)
        created  = datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 96))
        _queue_store.append({
            "id":                            str(uuid.uuid4()),
            "pa_number":                     f"PA-2026-{200000+i:06d}",
            "status":                        "IN_REVIEW" if assigned else "SUBMITTED",
            "urgency":                       random.choice(["ROUTINE","ROUTINE","URGENT","EMERGENT"]),
            "service_type":                  random.choice(_SVC_TYPES),
            "payer":                         random.choice(_PAYERS),
            "provider_npi":                  f"1{random.randint(000000000,999999999):09d}",
            "provider_name":                 f"Dr. {random.choice(['Smith','Johnson','Davis'])}",
            "member_id":                     f"MB{random.randint(10000000,99999999)}",
            "member_name":                   f"{nm[0]} {nm[1]}",
            "primary_diagnosis_code":        dx[0],
            "primary_diagnosis_description": dx[1],
            "procedure_code":                proc[0],
            "procedure_description":         proc[1],
            "ai_confidence":                 conf,
            "ai_recommendation":             "APPROVE" if conf>0.75 else ("DENY" if conf<0.35 else "REVIEW_REQUIRED"),
            "assigned_to":                   assigned,
            "submitted_at":                  created.isoformat(),
            "sla_deadline":                  (created+timedelta(hours=72)).isoformat(),
            "sla_hours_remaining":           max(0, 72 - int((datetime.now(timezone.utc)-created).total_seconds()/3600)),
            "is_urgent":                     random.random() < 0.2,
        })


_seed_queue()


# ═══════════════════════════════════════════════════════════════════════════════
# REVIEW QUEUE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/review-queue")
async def get_queue(
    status_filter:      Optional[str] = Query(None, alias="status"),
    urgency:            Optional[str] = None,
    assigned_to:        Optional[str] = None,
    ai_recommendation:  Optional[str] = None,
    sort_by:            str = "submitted_at",
    sort_dir:           str = "asc",
    page:               int = Query(1, ge=1),
    limit:              int = Query(20, ge=1, le=100),
    current_user:       dict = Depends(get_current_user),
):
    items = list(_queue_store)
    if status_filter:
        items = [x for x in items if x["status"] == status_filter.upper()]
    if urgency:
        items = [x for x in items if x["urgency"] == urgency.upper()]
    if assigned_to:
        items = [x for x in items if x.get("assigned_to") == assigned_to]
    if ai_recommendation:
        items = [x for x in items if x.get("ai_recommendation") == ai_recommendation.upper()]
    try:
        items.sort(key=lambda x: x.get(sort_by,""), reverse=(sort_dir=="desc"))
    except Exception:
        pass
    total = len(items)
    start = (page-1)*limit
    return {"items": items[start:start+limit], "total": total, "page": page,
            "pages": max(1,(total+limit-1)//limit), "limit": limit}


@router.get("/review-queue/stats")
async def queue_stats(current_user: dict = Depends(get_current_user)):
    items = _queue_store
    return {
        "total_pending":       sum(1 for x in items if x["status"] not in ("APPROVED","DENIED","CANCELLED")),
        "assigned":            sum(1 for x in items if x.get("assigned_to")),
        "unassigned":          sum(1 for x in items if not x.get("assigned_to")),
        "urgent":              sum(1 for x in items if x["urgency"] in ("URGENT","EMERGENT")),
        "sla_at_risk":         sum(1 for x in items if x.get("sla_hours_remaining",99) < 24),
        "avg_ai_confidence":   round(sum(x["ai_confidence"] for x in items)/max(len(items),1), 3),
        "ai_approve_count":    sum(1 for x in items if x.get("ai_recommendation")=="APPROVE"),
        "ai_deny_count":       sum(1 for x in items if x.get("ai_recommendation")=="DENY"),
        "ai_review_count":     sum(1 for x in items if x.get("ai_recommendation")=="REVIEW_REQUIRED"),
    }


@router.post("/review-queue/{pa_id}/assign")
async def assign_case(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    reviewer_id = body.get("reviewer_id", current_user.get("name"))
    for item in _queue_store:
        if item["id"] == pa_id or item["pa_number"] == pa_id:
            item["assigned_to"] = reviewer_id
            item["status"] = "IN_REVIEW"
    return {"pa_id": pa_id, "assigned_to": reviewer_id, "status": "IN_REVIEW"}


@router.post("/review-queue/{pa_id}/self-assign")
async def self_assign(pa_id: str, current_user: dict = Depends(get_current_user)):
    name = current_user.get("name", current_user.get("sub","Reviewer"))
    for item in _queue_store:
        if item["id"] == pa_id or item["pa_number"] == pa_id:
            item["assigned_to"] = name
            item["status"] = "IN_REVIEW"
    return {"pa_id": pa_id, "assigned_to": name, "status": "IN_REVIEW"}


@router.delete("/review-queue/{pa_id}/assign")
async def unassign_case(pa_id: str, current_user: dict = Depends(get_current_user)):
    for item in _queue_store:
        if item["id"] == pa_id or item["pa_number"] == pa_id:
            item["assigned_to"] = None
            item["status"] = "SUBMITTED"
    return {"pa_id": pa_id, "assigned_to": None}


# ═══════════════════════════════════════════════════════════════════════════════
# CASES (detailed review)
# ═══════════════════════════════════════════════════════════════════════════════

def _build_case(pa_id: str) -> dict:
    """Build a rich case object for review."""
    dx   = random.choice(_DIAGNOSES)
    proc = random.choice(_PROCEDURES)
    nm   = random.choice(_NAMES)
    conf = round(random.uniform(0.40, 0.92), 3)
    created = datetime.now(timezone.utc) - timedelta(hours=random.randint(4, 72))
    return {
        "id":             pa_id,
        "pa_number":      pa_id if pa_id.startswith("PA-") else f"PA-2026-{abs(hash(pa_id))%900000+100000:06d}",
        "status":         "IN_REVIEW",
        "urgency":        random.choice(["ROUTINE","URGENT"]),
        "service_type":   random.choice(_SVC_TYPES),
        "payer":          random.choice(_PAYERS),
        "submitted_at":   created.isoformat(),
        "sla_deadline":   (created+timedelta(hours=72)).isoformat(),
        "member": {
            "member_id":   f"MB{random.randint(10000000,99999999)}",
            "name":        f"{nm[0]} {nm[1]}",
            "dob":         "1975-06-20",
            "age":         50,
            "gender":      random.choice(["Male","Female"]),
            "plan_name":   "PPO Gold",
            "group_number": "GRP123456",
        },
        "provider": {
            "npi":          f"1{random.randint(000000000,999999999):09d}",
            "name":         "Dr. Robert Smith",
            "specialty":    "Orthopedic Surgery",
            "facility":     "City Medical Center",
            "phone":        "312-555-0100",
        },
        "clinical": {
            "primary_diagnosis_code":        dx[0],
            "primary_diagnosis_description": dx[1],
            "secondary_diagnoses":           [],
            "procedure_code":                proc[0],
            "procedure_description":         proc[1],
            "clinical_notes":                "Patient has failed conservative treatment over 6 months. "
                                              "Physical therapy, NSAIDs, and corticosteroid injections have "
                                              "not provided adequate relief. Surgery is indicated.",
            "icd10_codes":                   [dx[0]],
            "requested_quantity":            1,
            "requested_units":               "procedure",
        },
        "ai_analysis": {
            "confidence":        conf,
            "recommendation":    "APPROVE" if conf>0.75 else ("DENY" if conf<0.35 else "REVIEW_REQUIRED"),
            "criteria_met":      conf > 0.5,
            "criteria_details":  [
                {"criterion":"Medical necessity documented","met": True,"evidence":"Clinical notes page 2"},
                {"criterion":"Failed conservative treatment","met": conf>0.5,"evidence":"Prior treatment history"},
                {"criterion":"Appropriate diagnosis","met": True,"evidence":f"ICD-10 {dx[0]}"},
                {"criterion":"Provider in-network","met": random.random()>0.2,"evidence":"Provider directory check"},
            ],
            "extracted_conditions":  [dx[1]],
            "extracted_procedures":  [proc[1]],
            "guideline_references":  ["MCG Care Guidelines","InterQual Criteria"],
            "processing_time_ms":    random.randint(850,2400),
        },
        "documents":   [
            {"doc_id": str(uuid.uuid4()), "filename": "clinical_notes.pdf",
             "type": "CLINICAL_NOTES", "pages": 8, "ocr_status": "COMPLETE",
             "uploaded_at": (created+timedelta(minutes=5)).isoformat()},
            {"doc_id": str(uuid.uuid4()), "filename": "imaging_report.pdf",
             "type": "IMAGING", "pages": 3, "ocr_status": "COMPLETE",
             "uploaded_at": (created+timedelta(minutes=10)).isoformat()},
        ],
        "history":     [
            {"status":"SUBMITTED","timestamp":created.isoformat(),"actor":"Dr. Robert Smith","note":"Submitted via portal"},
            {"status":"IN_REVIEW","timestamp":(created+timedelta(minutes=3)).isoformat(),
             "actor":"AI Engine","note":f"AI confidence: {conf:.0%}"},
        ],
        "annotations": [],
        "draft_notes": "",
    }


@router.get("/cases/{pa_id}/review")
async def get_case(pa_id: str, current_user: dict = Depends(get_current_user)):
    if pa_id not in _case_store:
        _case_store[pa_id] = _build_case(pa_id)
    return _case_store[pa_id]


@router.get("/cases/{pa_id}/ai-analysis")
async def get_ai_analysis(pa_id: str, current_user: dict = Depends(get_current_user)):
    case = _case_store.get(pa_id) or _build_case(pa_id)
    return case.get("ai_analysis", {})


@router.get("/cases/{pa_id}/guidelines")
async def get_guidelines(pa_id: str, current_user: dict = Depends(get_current_user)):
    return {
        "pa_number": pa_id,
        "guidelines": [
            {
                "source":   "MCG Care Guidelines 27th Edition",
                "code":     "MCG-27-MS-070",
                "title":    "Lumbar Spine Surgery",
                "criteria": [
                    "Persistent radiculopathy > 6 weeks despite conservative care",
                    "MRI-confirmed herniation correlating with symptoms",
                    "Neurological deficits present or progressive",
                ],
                "met":      True,
                "last_updated": "2025-01-01",
            },
            {
                "source":   "InterQual Criteria 2025",
                "code":     "IQ-2025-ORT-042",
                "title":    "Spine Surgery — Medical Necessity",
                "criteria": [
                    "Failure of 6+ weeks conservative treatment",
                    "Functional limitation documented",
                    "Imaging consistent with clinical presentation",
                ],
                "met":      True,
                "last_updated": "2025-03-01",
            },
        ],
    }


@router.get("/cases/{pa_id}/history")
async def get_case_history(pa_id: str, current_user: dict = Depends(get_current_user)):
    case = _case_store.get(pa_id) or _build_case(pa_id)
    return {"pa_number": pa_id, "history": case.get("history",[])}


@router.get("/cases/{pa_id}/documents")
async def get_case_documents(pa_id: str, current_user: dict = Depends(get_current_user)):
    case = _case_store.get(pa_id) or _build_case(pa_id)
    return {"pa_number": pa_id, "documents": case.get("documents",[])}


@router.put("/cases/{pa_id}/draft")
async def save_draft(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    if pa_id not in _case_store:
        _case_store[pa_id] = _build_case(pa_id)
    _case_store[pa_id]["draft_notes"] = body.get("notes","")
    return {"pa_number": pa_id, "saved": True, "timestamp": datetime.now(timezone.utc).isoformat()}


@router.post("/cases/{pa_id}/decision")
async def submit_decision(pa_id: str, decision: dict, current_user: dict = Depends(get_current_user)):
    dec = decision.get("decision","")
    if pa_id not in _case_store:
        _case_store[pa_id] = _build_case(pa_id)
    case = _case_store[pa_id]
    case["status"] = dec
    case["decision_date"] = datetime.now(timezone.utc).isoformat()
    case["reviewer_name"] = current_user.get("name","Reviewer")
    # Update queue
    for item in _queue_store:
        if item["id"] == pa_id or item["pa_number"] == pa_id or item["pa_number"] == case["pa_number"]:
            item["status"] = dec
    return {
        "pa_number":   case["pa_number"],
        "decision":    dec,
        "decided_by":  current_user.get("name","Reviewer"),
        "decided_at":  datetime.now(timezone.utc).isoformat(),
        "auth_number": f"AUTH{random.randint(1000000,9999999)}" if dec=="APPROVED" else None,
    }


@router.post("/cases/{pa_id}/request-info")
async def request_info(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    return {
        "pa_number":     pa_id,
        "status":        "PENDED",
        "items_requested": body.get("items",[]),
        "deadline":      (datetime.now(timezone.utc)+timedelta(days=14)).isoformat(),
        "message":       "Provider has been notified of additional information requirements.",
    }


@router.post("/cases/{pa_id}/annotations")
async def add_annotation(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    ann = {
        "annotation_id": str(uuid.uuid4()),
        "text":          body.get("text",""),
        "type":          body.get("type","NOTE"),
        "author":        current_user.get("name","Reviewer"),
        "created_at":    datetime.now(timezone.utc).isoformat(),
    }
    if pa_id not in _case_store:
        _case_store[pa_id] = _build_case(pa_id)
    _case_store[pa_id].setdefault("annotations",[]).append(ann)
    return ann


@router.post("/cases/{pa_id}/co-sign")
async def co_sign(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    return {
        "pa_number":   pa_id,
        "co_signed_by": current_user.get("name","Medical Director"),
        "co_signed_at": datetime.now(timezone.utc).isoformat(),
        "notes":        body.get("notes",""),
    }


@router.post("/cases/{pa_id}/p2p-response")
async def p2p_response(pa_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    return {
        "pa_number":   pa_id,
        "p2p_outcome": body.get("outcome",""),
        "notes":       body.get("notes",""),
        "recorded_by": current_user.get("name","Reviewer"),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# METRICS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/metrics/reviewer")
async def reviewer_metrics(reviewer_id: Optional[str] = None,
                           current_user: dict = Depends(get_current_user)):
    return {
        "reviewer_id":           reviewer_id or current_user.get("sub",""),
        "reviewer_name":         current_user.get("name","Reviewer"),
        "cases_reviewed_today":  random.randint(5,18),
        "cases_reviewed_week":   random.randint(40,90),
        "cases_reviewed_month":  random.randint(180,350),
        "avg_review_time_min":   round(random.uniform(8,22),1),
        "approval_rate":         round(random.uniform(0.62,0.78),3),
        "denial_rate":           round(random.uniform(0.12,0.28),3),
        "pending_rate":          round(random.uniform(0.05,0.15),3),
        "ai_agreement_rate":     round(random.uniform(0.82,0.94),3),
        "sla_compliance":        round(random.uniform(0.96,0.999),3),
        "cases_assigned":        sum(1 for x in _queue_store if x.get("assigned_to")==current_user.get("name")),
    }


@router.get("/metrics/queue")
async def queue_metrics(current_user: dict = Depends(get_current_user)):
    items = _queue_store
    return {
        "total_pending":        len(items),
        "unassigned":           sum(1 for x in items if not x.get("assigned_to")),
        "avg_sla_remaining_h":  round(sum(x.get("sla_hours_remaining",48) for x in items)/max(len(items),1),1),
        "urgent_count":         sum(1 for x in items if x["urgency"] in ("URGENT","EMERGENT")),
        "by_service_type":      {t: sum(1 for x in items if x["service_type"]==t) for t in _SVC_TYPES},
        "by_payer":             {p: sum(1 for x in items if x["payer"]==p) for p in _PAYERS},
        "volume_trend":         [random.randint(20,60) for _ in range(7)],
    }


@router.get("/metrics/ai-accuracy")
async def ai_accuracy_metrics(current_user: dict = Depends(get_current_user)):
    return {
        "overall_accuracy":    round(random.uniform(0.88,0.96),3),
        "precision":           round(random.uniform(0.87,0.95),3),
        "recall":              round(random.uniform(0.89,0.97),3),
        "f1_score":            round(random.uniform(0.88,0.96),3),
        "agreement_rate":      round(random.uniform(0.83,0.93),3),
        "auto_approval_rate":  round(random.uniform(0.68,0.82),3),
        "false_positive_rate": round(random.uniform(0.02,0.07),3),
        "false_negative_rate": round(random.uniform(0.03,0.08),3),
        "by_service_type":     {t: round(random.uniform(0.82,0.96),3) for t in _SVC_TYPES},
        "model_version":       "ClinicalBERT-v2.1 + RAG-Guidelines-v4",
        "last_evaluated":      (datetime.now(timezone.utc)-timedelta(days=1)).isoformat(),
    }
