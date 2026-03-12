"""
Member Portal API endpoints.

Serves all routes called by member-portal/lib/api.ts:
  /api/v1/member/pa-requests/*
  /api/v1/member/appeals/*
  /api/v1/member/notifications/*
  /api/v1/member/profile
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
_member_pa_store:     Dict[str, List[dict]] = {}
_member_appeal_store: Dict[str, List[dict]] = {}
_member_notif_store:  Dict[str, List[dict]] = {}
_member_profile_store: Dict[str, dict]      = {}

_STATUSES   = ["SUBMITTED","IN_REVIEW","APPROVED","DENIED","PENDED"]
_SVC_TYPES  = ["DIAGNOSTIC_IMAGING","SURGICAL_PROCEDURE","SPECIALTY_MEDICATION",
                "PHYSICAL_THERAPY","DURABLE_MEDICAL_EQUIPMENT"]
_DIAGNOSES  = [("M54.5","Low back pain"),("J18.9","Pneumonia"),
                ("E11.9","Type 2 diabetes"),("M17.11","Osteoarthritis, right knee")]
_PROCEDURES = [("72148","MRI Lumbar Spine"),("27447","Total knee arthroplasty"),
                ("J0135","Adalimumab injection"),("97110","Therapeutic exercises")]


def _seed_member_pas(uid: str) -> List[dict]:
    if uid in _member_pa_store:
        return _member_pa_store[uid]
    pas = []
    for i in range(8):
        dx   = random.choice(_DIAGNOSES)
        proc = random.choice(_PROCEDURES)
        st   = random.choice(_STATUSES)
        created = datetime.now(timezone.utc) - timedelta(days=random.randint(0,60))
        pas.append({
            "id":                            str(uuid.uuid4()),
            "pa_number":                     f"PA-2026-{300000+i:06d}",
            "status":                        st,
            "service_type":                  random.choice(_SVC_TYPES),
            "primary_diagnosis_description": dx[1],
            "procedure_description":         proc[1],
            "provider_name":                 f"Dr. {random.choice(['Smith','Johnson','Williams'])}",
            "facility_name":                 "City Medical Center",
            "payer":                         random.choice(["UHC","AETNA","BCBS"]),
            "submitted_at":                  created.isoformat(),
            "updated_at":                    (created+timedelta(hours=random.randint(1,48))).isoformat(),
            "decision_date":                 (created+timedelta(hours=24)).isoformat() if st in ("APPROVED","DENIED") else None,
            "auth_number":                   f"AUTH{random.randint(1000000,9999999)}" if st=="APPROVED" else None,
            "auth_valid_through":            (datetime.now(timezone.utc)+timedelta(days=180)).strftime("%Y-%m-%d") if st=="APPROVED" else None,
            "denial_reason":                 "Clinical criteria not met." if st=="DENIED" else None,
            "appeal_status":                 "NO_APPEAL",
            "can_appeal":                    st=="DENIED",
        })
    _member_pa_store[uid] = pas
    return pas


def _seed_member_appeals(uid: str) -> List[dict]:
    if uid in _member_appeal_store:
        return _member_appeal_store[uid]
    appeals = [
        {
            "id":          str(uuid.uuid4()),
            "appeal_id":   f"APL-2026-{400000+i:06d}",
            "pa_number":   f"PA-2026-{300000+i:06d}",
            "status":      random.choice(["SUBMITTED","IN_REVIEW","UPHELD","OVERTURNED"]),
            "type":        random.choice(["STANDARD","EXPEDITED"]),
            "submitted_at":(datetime.now(timezone.utc)-timedelta(days=random.randint(1,30))).isoformat(),
            "deadline":    (datetime.now(timezone.utc)+timedelta(days=random.randint(5,25))).isoformat(),
            "reason":      "I believe the denial was incorrect based on my medical needs.",
        }
        for i in range(3)
    ]
    _member_appeal_store[uid] = appeals
    return appeals


def _seed_member_notifs(uid: str) -> List[dict]:
    if uid in _member_notif_store:
        return _member_notif_store[uid]
    notifs = [
        {
            "id":         str(uuid.uuid4()),
            "type":       random.choice(["DECISION","STATUS_UPDATE","APPEAL_UPDATE","INFO"]),
            "title":      random.choice(["Authorization Approved","Decision Ready","Status Update","Action Required"]),
            "message":    "Your prior authorization request status has been updated.",
            "pa_number":  f"PA-2026-{300000+i:06d}",
            "created_at": (datetime.now(timezone.utc)-timedelta(hours=i*6)).isoformat(),
            "read":       i > 1,
        }
        for i in range(6)
    ]
    _member_notif_store[uid] = notifs
    return notifs


def _get_profile(uid: str, user: dict) -> dict:
    if uid not in _member_profile_store:
        _member_profile_store[uid] = {
            "member_id":      f"MB{random.randint(10000000,99999999)}",
            "first_name":     user.get("name","Sarah").split()[0],
            "last_name":      user.get("name","Johnson").split()[-1],
            "email":          f"{user.get('username','member1')}@email.com",
            "phone":          "312-555-0199",
            "date_of_birth":  "1985-08-22",
            "address": {
                "street":"123 Main St","city":"Chicago","state":"IL","zip":"60601"
            },
            "payer":          "UHC",
            "plan_name":      "UnitedHealthcare Choice Plus PPO",
            "group_number":   "GRP654321",
            "notification_prefs": {
                "email":  True,
                "sms":    False,
                "push":   True,
            },
        }
    return _member_profile_store[uid]


# ═══════════════════════════════════════════════════════════════════════════════
# PA REQUESTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/pa-requests")
async def list_pa_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    page:          int = Query(1, ge=1),
    limit:         int = Query(20, ge=1, le=100),
    current_user:  dict = Depends(get_current_user),
):
    uid  = current_user.get("sub","m-001")
    pas  = _seed_member_pas(uid)
    if status_filter:
        pas = [p for p in pas if p["status"] == status_filter.upper()]
    total = len(pas)
    start = (page-1)*limit
    return {"items": pas[start:start+limit], "total": total, "page": page,
            "pages": max(1,(total+limit-1)//limit)}


@router.get("/pa-requests/status")
async def check_pa_status(pa_number: str, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    for p in _seed_member_pas(uid):
        if p["pa_number"] == pa_number:
            return {"pa_number": pa_number, "status": p["status"],
                    "auth_number": p.get("auth_number"),
                    "updated_at": p["updated_at"]}
    return {"pa_number": pa_number, "status": "NOT_FOUND"}


@router.get("/pa-requests/{pa_id}")
async def get_pa_request(pa_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    for p in _seed_member_pas(uid):
        if p["id"] == pa_id or p["pa_number"] == pa_id:
            return p
    raise HTTPException(status_code=404, detail="PA request not found")


@router.get("/pa-requests/{pa_id}/letter")
async def get_pa_letter(pa_id: str, current_user: dict = Depends(get_current_user)):
    from fastapi.responses import Response
    letter = (
        f"PRIOR AUTHORIZATION DETERMINATION\n\n"
        f"Reference: {pa_id}\n"
        f"Date: {datetime.now().strftime('%B %d, %Y')}\n\n"
        f"Dear Member,\n\n"
        f"Your prior authorization request has been reviewed and APPROVED.\n\n"
        f"Authorization Number: AUTH{random.randint(1000000,9999999)}\n"
        f"Valid Through: {(datetime.now()+timedelta(days=180)).strftime('%B %d, %Y')}\n\n"
        f"Please present this letter to your provider at time of service.\n\n"
        f"Questions? Call Member Services at 1-800-555-HEALTH.\n"
    )
    return Response(content=letter.encode(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=PA-determination-{pa_id}.pdf"})



# PR-004: Download ALL PA letters as a ZIP archive (member data portability)
@router.get("/pa-requests/letters/download-all")
async def download_all_pa_letters(current_user: dict = Depends(get_current_user)):
    """
    PR-004: Return a ZIP archive containing PDF determination letters for all
    of the member's PA requests.  Used by the member portal Download All button.

    Production: streams letters from document-service S3 bucket into a ZIP.
    Demo:       generates synthetic letters from in-memory PA records.
    """
    import io
    import zipfile
    from fastapi.responses import StreamingResponse

    member_id = current_user.get("sub", "unknown")
    member_name = current_user.get("name", "Member")

    # Gather all PA records for this member
    try:
        from app.api.v1.endpoints.member import _pa_store
        pas = _pa_store.get(member_id, [])
    except Exception:
        pas = []

    # Build in-memory ZIP with one text/PDF letter per PA
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        if not pas:
            # Demo: generate 2 sample letters
            for i, (pa_num, svc, status) in enumerate([
                ("PA-2026-001234", "MRI Lumbar Spine", "APPROVED"),
                ("PA-2026-001241", "Physical Therapy", "IN_REVIEW"),
            ], 1):
                letter = (
                    f"PRIOR AUTHORIZATION DETERMINATION\n"
                    f"{'=' * 50}\n\n"
                    f"Reference Number: {pa_num}\n"
                    f"Service:          {svc}\n"
                    f"Status:           {status}\n"
                    f"Member:           {member_name}\n"
                    f"Date:             {datetime.now().strftime('%B %d, %Y')}\n\n"
                    f"Dear {member_name},\n\n"
                    f"Your prior authorization request has been reviewed.\n"
                    f"Decision: {status}\n\n"
                    f"Questions? Call Member Services at 1-800-555-HEALTH.\n"
                )
                zf.writestr(f"PA-letter-{pa_num}.txt", letter)
        else:
            for pa in pas:
                pa_num  = pa.get("pa_number", "UNKNOWN")
                svc     = pa.get("service_type", "Service")
                status  = pa.get("status", "UNKNOWN")
                auth    = pa.get("auth_number", "")
                decided = pa.get("decision_date", "")
                letter = (
                    f"PRIOR AUTHORIZATION DETERMINATION\n"
                    f"{'=' * 50}\n\n"
                    f"Reference Number:  {pa_num}\n"
                    f"Service:           {svc}\n"
                    f"Status:            {status}\n"
                    f"Member:            {member_name}\n"
                    f"Date Generated:    {datetime.now().strftime('%B %d, %Y')}\n"
                    + (f"Decision Date:     {decided}\n" if decided else "")
                    + (f"Auth Number:       {auth}\n" if auth else "")
                    + f"\nDear {member_name},\n\n"
                    f"Your prior authorization request ({pa_num}) has been "
                    f"reviewed and a determination of {status} has been made.\n\n"
                    f"Please present this letter to your provider at time of service.\n\n"
                    f"Questions? Call Member Services at 1-800-555-HEALTH.\n"
                )
                zf.writestr(f"PA-letter-{pa_num}.txt", letter)

        # Always include a manifest
        manifest_lines = [
            f"PA Letters Download — Generated {datetime.now().isoformat()}",
            f"Member: {member_name}",
            f"Total letters: {max(len(pas), 2)}",
            "",
            "Files included:",
        ]
        for pa in (pas or [{"pa_number": "PA-2026-001234"}, {"pa_number": "PA-2026-001241"}]):
            manifest_lines.append(f"  PA-letter-{pa.get('pa_number','UNKNOWN')}.txt")
        zf.writestr("MANIFEST.txt", "\n".join(manifest_lines))

    buf.seek(0)
    filename = f"PA_Letters_{datetime.now().strftime('%Y%m%d')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# APPEALS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/appeals")
async def list_appeals(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    uid     = current_user.get("sub","m-001")
    appeals = _seed_member_appeals(uid)
    total   = len(appeals)
    start   = (page-1)*limit
    return {"items": appeals[start:start+limit], "total": total, "page": page}


@router.get("/appeals/{appeal_id}")
async def get_appeal(appeal_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    for a in _seed_member_appeals(uid):
        if a["id"] == appeal_id or a["appeal_id"] == appeal_id:
            return a
    raise HTTPException(status_code=404, detail="Appeal not found")


@router.post("/appeals", status_code=201)
async def submit_appeal(data: dict, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    appeal = {
        "id":          str(uuid.uuid4()),
        "appeal_id":   f"APL-2026-{random.randint(400000,499999):06d}",
        "pa_number":   data.get("pa_number",""),
        "status":      "SUBMITTED",
        "type":        data.get("type","STANDARD"),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "deadline":    (datetime.now(timezone.utc)+timedelta(days=30)).isoformat(),
        "reason":      data.get("reason",""),
    }
    _seed_member_appeals(uid).insert(0, appeal)
    return appeal


# ═══════════════════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/notifications")
async def get_member_notifications(
    unread_only: bool = False,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    uid    = current_user.get("sub","m-001")
    notifs = _seed_member_notifs(uid)
    if unread_only:
        notifs = [n for n in notifs if not n["read"]]
    return {"notifications": notifs[:limit], "total": len(notifs),
            "unread_count": sum(1 for n in notifs if not n["read"])}


@router.put("/notifications/{notif_id}/read")
async def mark_notif_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    for n in _seed_member_notifs(uid):
        if n["id"] == notif_id:
            n["read"] = True
    return {"notification_id": notif_id, "read": True}


@router.put("/notifications/read-all")
async def mark_all_notifs_read(current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    for n in _seed_member_notifs(uid):
        n["read"] = True
    return {"message": "All notifications marked as read"}


# ═══════════════════════════════════════════════════════════════════════════════
# NOTIFICATION PREFERENCES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/notification-preferences")
async def get_notif_prefs(current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    profile = _get_profile(uid, current_user)
    return profile.get("notification_prefs", {"email": True, "sms": False, "push": True})


@router.put("/notification-preferences")
async def update_notif_prefs(prefs: dict, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    _get_profile(uid, current_user)["notification_prefs"] = prefs
    return {"updated": True, "preferences": prefs}


# ═══════════════════════════════════════════════════════════════════════════════
# PROFILE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    return _get_profile(uid, current_user)


@router.put("/profile")
async def update_profile(data: dict, current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub","m-001")
    profile = _get_profile(uid, current_user)
    profile.update({k: v for k, v in data.items() if k not in ("member_id","payer","plan_name","group_number")})
    return profile
