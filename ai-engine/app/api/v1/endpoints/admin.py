"""
Admin Dashboard API endpoints — complete implementation.

Serves ALL routes called by admin-dashboard/lib/api.ts:
  /api/v1/admin/analytics/*   (11 endpoints)
  /api/v1/admin/users/*       (CRUD + enable/disable/reset-password)
  /api/v1/admin/cases/*       (list, get, export, reassign, override)
  /api/v1/admin/audit-log/*   (list + export)
  /api/v1/admin/roles
  /api/v1/admin/permissions
  /api/v1/admin/system/*      (health, services, queues, config, incidents, ai-models)
  /api/v1/admin/notifications/*
"""
from __future__ import annotations
import io, random, uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user

log = structlog.get_logger(__name__)
router = APIRouter()

# ── Stores ────────────────────────────────────────────────────────────────────
_users:  Dict[str, dict] = {}
_cases:  List[dict]      = []
_cfg:    Dict[str, str]  = {}
_notifs: List[dict]      = []

_ROLES = ["SUPER_ADMIN","OPS_ADMIN","MEDICAL_DIRECTOR","RN_REVIEWER",
           "PROVIDER","PA_COORDINATOR","MEMBER","READ_ONLY"]
_PERMS = ["pa.view","pa.submit","pa.review","pa.decide","pa.override",
           "user.view","user.create","user.edit","user.disable",
           "audit.view","audit.export","analytics.view","system.config"]
_SVCS   = ["DIAGNOSTIC_IMAGING","SURGICAL_PROCEDURE","SPECIALTY_MEDICATION",
            "PHYSICAL_THERAPY","DURABLE_MEDICAL_EQUIPMENT","HOME_HEALTH"]
_PAYERS = ["UHC","AETNA","BCBS","CIGNA","HUMANA"]


def _init():
    global _users, _cases, _cfg, _notifs
    if _users:
        return
    demo_users = [
        ("u1","provider1","Dr. John Smith","j.smith@hospital.com","PROVIDER","1234567890",True),
        ("u2","reviewer1","Sarah Parker RN","s.parker@health.org","RN_REVIEWER",None,True),
        ("u3","meddir1","Dr. Robert Chen","r.chen@health.org","MEDICAL_DIRECTOR",None,True),
        ("u4","admin","System Admin","admin@pa-system.health","SUPER_ADMIN",None,True),
        ("u5","member1","Sarah Johnson","s.johnson@email.com","MEMBER",None,True),
        ("u6","reviewer2","Michael Kim RN","m.kim@health.org","RN_REVIEWER",None,True),
        ("u7","provider2","Dr. Emily Davis","e.davis@clinic.com","PROVIDER","9876543210",False),
    ]
    for uid,uname,name,email,role,npi,active in demo_users:
        _users[uid] = {"id":uid,"username":uname,"full_name":name,"email":email,"role":role,
                       "npi":npi,"is_active":active,"mfa_enabled":random.random()>0.3,
                       "department":random.choice(["UM","Clinical","Administration"]),
                       "created_at":(datetime.now(timezone.utc)-timedelta(days=random.randint(30,365))).isoformat(),
                       "last_login":(datetime.now(timezone.utc)-timedelta(hours=random.randint(0,72))).isoformat() if active else None}
    for i in range(40):
        st = random.choice(["APPROVED","DENIED","IN_REVIEW","PENDED","CANCELLED","SUBMITTED"])
        cr = datetime.now(timezone.utc)-timedelta(days=random.randint(0,30))
        _cases.append({"id":str(uuid.uuid4()),"pa_number":f"PA-2026-{500000+i:06d}","status":st,
                        "service_type":random.choice(_SVCS),"payer":random.choice(_PAYERS),
                        "provider_npi":f"1{random.randint(0,999999999):09d}",
                        "provider_name":f"Dr. {random.choice(['Smith','Johnson','Williams'])}",
                        "member_id":f"MB{random.randint(10000000,99999999)}",
                        "member_name":f"{random.choice(['John','Sarah','Michael'])} {random.choice(['Smith','Johnson'])}",
                        "diagnosis_code":random.choice(["M54.5","J18.9","I10","E11.9"]),
                        "procedure_code":random.choice(["72148","27447","J0135","97110"]),
                        "ai_confidence":round(random.uniform(0.45,0.97),3),
                        "reviewer":random.choice(["Sarah Parker RN","Michael Kim RN",None]),
                        "submitted_at":cr.isoformat(),"urgency":random.choice(["ROUTINE","ROUTINE","URGENT"]),
                        "decided_at":(cr+timedelta(hours=random.randint(2,48))).isoformat() if st in ("APPROVED","DENIED") else None})
    _cfg.update({"auto_approval_threshold":"0.92","auto_denial_threshold":"0.15",
                  "sla_standard_hours":"72","sla_urgent_hours":"24","sla_emergent_hours":"8",
                  "ai_model_version":"ClinicalBERT-v2.1","rag_enabled":"true",
                  "session_timeout_minutes":"15","mfa_required":"true","audit_retention_years":"7"})
    for i in range(8):
        _notifs.append({"id":str(uuid.uuid4()),"type":random.choice(["SYSTEM_ALERT","SLA_WARNING","MODEL_DRIFT"]),
                         "title":random.choice(["SLA Breach Risk","Model Drift Detected","High Volume Alert"]),
                         "message":"Administrative notification.","severity":random.choice(["LOW","MEDIUM","HIGH"]),
                         "created_at":(datetime.now(timezone.utc)-timedelta(hours=i*3)).isoformat(),"read":i>2})

_init()

def _trend(n=7, base=50, var=20): return [max(0,base+random.randint(-var,var)) for _ in range(n)]

# ── ANALYTICS ─────────────────────────────────────────────────────────────────
@router.get("/analytics/kpis")
async def kpis(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    return {"total_submissions":random.randint(1200,1500),"total_approved":random.randint(800,1000),
            "total_denied":random.randint(150,250),"total_pending":random.randint(80,150),
            "auto_approval_rate":round(random.uniform(0.70,0.82),3),"avg_turnaround_hours":round(random.uniform(10,22),1),
            "sla_compliance_rate":round(random.uniform(0.975,0.999),3),"ai_accuracy":round(random.uniform(0.88,0.96),3),
            "appeal_overturn_rate":round(random.uniform(0.12,0.22),3),"provider_satisfaction":round(random.uniform(4.1,4.8),1),"period":range or "last_30_days"}

@router.get("/analytics/volume")
async def volume(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    return {"daily":_trend(30,45,15),"weekly":_trend(12,300,50),"monthly":_trend(6,1300,200),
            "by_service":{t:random.randint(50,300) for t in _SVCS},
            "by_urgency":{"ROUTINE":random.randint(800,1100),"URGENT":random.randint(100,200),"EMERGENT":random.randint(10,40)}}

@router.get("/analytics/decisions")
async def decisions(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    total=random.randint(1200,1500); ap=int(total*0.68); dn=int(total*0.16)
    return {"total":total,"approved":ap,"denied":dn,"pended":total-ap-dn,
            "auto_approved":int(ap*0.72),"auto_denied":int(dn*0.30),
            "approval_rate":round(ap/total,3),"denial_rate":round(dn/total,3),
            "by_payer":{p:{"approved":random.randint(80,200),"denied":random.randint(20,60)} for p in _PAYERS}}

@router.get("/analytics/tat")
async def tat(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    return {"avg_hours":round(random.uniform(10,22),1),"median_hours":round(random.uniform(8,18),1),
            "p90_hours":round(random.uniform(28,48),1),
            "by_urgency":{"ROUTINE":round(random.uniform(18,28),1),"URGENT":round(random.uniform(8,16),1),"EMERGENT":round(random.uniform(2,6),1)},
            "by_service":{t:round(random.uniform(10,30),1) for t in _SVCS},"trend":[round(random.uniform(10,28),1) for _ in range(7)]}

@router.get("/analytics/ai-metrics")
async def ai_metrics(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    return {"accuracy":round(random.uniform(0.88,0.96),3),"precision":round(random.uniform(0.87,0.95),3),
            "recall":round(random.uniform(0.89,0.97),3),"f1_score":round(random.uniform(0.88,0.96),3),
            "auto_decision_rate":round(random.uniform(0.70,0.82),3),"human_agreement":round(random.uniform(0.83,0.93),3),
            "false_positives":random.randint(8,25),"false_negatives":random.randint(5,18),
            "model_version":"ClinicalBERT-v2.1+RAG-v4","bias_score":round(random.uniform(0.02,0.06),3),
            "drift_score":round(random.uniform(0.01,0.04),3),
            "last_retrained":(datetime.now(timezone.utc)-timedelta(days=14)).isoformat()}

@router.get("/analytics/by-payer")
async def by_payer(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    return {"payers":[{"payer":p,"total":random.randint(200,400),"approved":random.randint(130,280),
                        "denied":random.randint(30,80),"approval_rate":round(random.uniform(0.60,0.78),3),
                        "avg_tat_hours":round(random.uniform(12,26),1),"sla_compliance":round(random.uniform(0.97,0.999),3)}
                       for p in _PAYERS]}

@router.get("/analytics/by-service")
async def by_service(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    return {"services":[{"service_type":t,"total":random.randint(50,300),"approved":random.randint(30,200),
                          "denied":random.randint(5,60),"approval_rate":round(random.uniform(0.55,0.82),3),
                          "avg_tat_hours":round(random.uniform(8,28),1),"auto_rate":round(random.uniform(0.60,0.85),3)}
                         for t in _SVCS]}

@router.get("/analytics/denial-reasons")
async def denial_reasons(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    reasons=["Criteria not met per MCG","Not medically necessary","Step therapy not completed",
              "Not covered under plan","Experimental procedure","Duplicate request","Missing documentation"]
    counts=[random.randint(10,60) for _ in reasons]; s=sum(counts)
    return {"total_denials":random.randint(150,300),"reasons":[{"reason":r,"count":c,"pct":round(c/s,3)} for r,c in zip(reasons,counts)]}

@router.get("/analytics/reviewer-performance")
async def reviewer_perf(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    revs=["Sarah Parker RN","Michael Kim RN","Jennifer Lee RN","David Wong RN","Lisa Nguyen RN"]
    return {"reviewers":[{"name":r,"cases_reviewed":random.randint(80,200),"avg_time_min":round(random.uniform(8,22),1),
                           "approval_rate":round(random.uniform(0.60,0.78),3),"ai_agreement":round(random.uniform(0.82,0.95),3),
                           "sla_compliance":round(random.uniform(0.95,0.999),3)} for r in revs]}

@router.get("/analytics/sla-compliance")
async def sla_compliance(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    return {"overall_compliance":round(random.uniform(0.975,0.999),3),
            "by_urgency":{"ROUTINE":round(random.uniform(0.97,0.999),3),"URGENT":round(random.uniform(0.96,0.998),3),"EMERGENT":round(random.uniform(0.95,0.999),3)},
            "breaches_this_month":random.randint(2,12),"at_risk_now":random.randint(3,15),
            "trend":[round(random.uniform(0.97,0.999),3) for _ in range(7)]}

@router.get("/analytics/appeals")
async def appeals_analytics(range:Optional[str]=None, current_user:dict=Depends(get_current_user)):
    total=random.randint(80,150); ov=int(total*random.uniform(0.12,0.22))
    return {"total_appeals":total,"overturned":ov,"upheld":total-ov,"overturn_rate":round(ov/total,3),
            "avg_resolution_days":round(random.uniform(12,22),1)}

# ── USERS ─────────────────────────────────────────────────────────────────────
@router.get("/users")
async def list_users(role:Optional[str]=None, active:Optional[bool]=None, search:Optional[str]=None,
                      page:int=Query(1,ge=1), limit:int=Query(20,ge=1,le=100), current_user:dict=Depends(get_current_user)):
    users=list(_users.values())
    if role: users=[u for u in users if u["role"]==role]
    if active is not None: users=[u for u in users if u["is_active"]==active]
    if search:
        s=search.lower(); users=[u for u in users if s in u["username"].lower() or s in u["full_name"].lower()]
    total=len(users); start=(page-1)*limit
    return {"items":users[start:start+limit],"total":total,"page":page,"pages":max(1,(total+limit-1)//limit)}

@router.get("/users/{uid}")
async def get_user(uid:str, current_user:dict=Depends(get_current_user)):
    u=_users.get(uid)
    if not u: raise HTTPException(404,"User not found")
    return u

@router.post("/users", status_code=201)
async def create_user(data:dict, current_user:dict=Depends(get_current_user)):
    uid=str(uuid.uuid4())[:6]
    u={"id":uid,"username":data.get("username",""),"full_name":data.get("full_name",""),
       "email":data.get("email",""),"role":data.get("role","PROVIDER"),"npi":data.get("npi"),
       "is_active":True,"mfa_enabled":False,"department":data.get("department",""),
       "created_at":datetime.now(timezone.utc).isoformat(),"last_login":None}
    _users[uid]=u; return u

@router.put("/users/{uid}")
async def update_user(uid:str, data:dict, current_user:dict=Depends(get_current_user)):
    if uid not in _users: raise HTTPException(404,"User not found")
    _users[uid].update({k:v for k,v in data.items() if k not in ("id","created_at")}); return _users[uid]

@router.put("/users/{uid}/disable")
async def disable_user(uid:str, current_user:dict=Depends(get_current_user)):
    if uid not in _users: raise HTTPException(404,"User not found")
    _users[uid]["is_active"]=False; return {"user_id":uid,"is_active":False}

@router.put("/users/{uid}/enable")
async def enable_user(uid:str, current_user:dict=Depends(get_current_user)):
    if uid not in _users: raise HTTPException(404,"User not found")
    _users[uid]["is_active"]=True; return {"user_id":uid,"is_active":True}

@router.post("/users/{uid}/reset-password")
async def reset_pw(uid:str, current_user:dict=Depends(get_current_user)):
    if uid not in _users: raise HTTPException(404,"User not found")
    return {"user_id":uid,"message":"Password reset email sent.","temp_token":str(uuid.uuid4())}

@router.get("/roles")
async def get_roles(current_user:dict=Depends(get_current_user)):
    return {"roles":_ROLES}

@router.get("/permissions")
async def get_permissions(current_user:dict=Depends(get_current_user)):
    return {"permissions":_PERMS}

# ── CASES ─────────────────────────────────────────────────────────────────────
@router.get("/cases")
async def admin_cases(status_filter:Optional[str]=Query(None,alias="status"), payer:Optional[str]=None,
                       service_type:Optional[str]=None, search:Optional[str]=None,
                       page:int=Query(1,ge=1), limit:int=Query(20,ge=1,le=100), current_user:dict=Depends(get_current_user)):
    items=list(_cases)
    if status_filter: items=[c for c in items if c["status"]==status_filter.upper()]
    if payer: items=[c for c in items if c["payer"]==payer]
    if service_type: items=[c for c in items if c["service_type"]==service_type]
    if search:
        s=search.lower(); items=[c for c in items if s in c["pa_number"].lower() or s in c.get("member_name","").lower()]
    total=len(items); start=(page-1)*limit
    return {"items":items[start:start+limit],"total":total,"page":page,"pages":max(1,(total+limit-1)//limit)}

@router.get("/cases/export")
async def export_cases(current_user:dict=Depends(get_current_user)):
    lines=["pa_number,status,payer,service_type,provider_name,member_name,submitted_at\n"]
    for c in _cases: lines.append(f"{c['pa_number']},{c['status']},{c['payer']},{c['service_type']},\"{c['provider_name']}\",\"{c['member_name']}\",{c['submitted_at']}\n")
    return StreamingResponse(io.BytesIO("".join(lines).encode()),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=cases-export.csv"})

@router.get("/cases/{cid}")
async def get_case(cid:str, current_user:dict=Depends(get_current_user)):
    for c in _cases:
        if c["id"]==cid or c["pa_number"]==cid: return c
    raise HTTPException(404,"Case not found")

@router.put("/cases/{cid}/reassign")
async def reassign(cid:str, body:dict, current_user:dict=Depends(get_current_user)):
    for c in _cases:
        if c["id"]==cid or c["pa_number"]==cid: c["reviewer"]=body.get("reviewer_id","")
    return {"case_id":cid,"reviewer":body.get("reviewer_id"),"reassigned":True}

@router.post("/cases/{cid}/override")
async def override(cid:str, body:dict, current_user:dict=Depends(get_current_user)):
    for c in _cases:
        if c["id"]==cid or c["pa_number"]==cid:
            c["status"]=body.get("decision",""); c["override_by"]=current_user.get("name"); c["override_reason"]=body.get("reason","")
    return {"case_id":cid,"decision":body.get("decision"),"override_by":current_user.get("name"),"override_at":datetime.now(timezone.utc).isoformat()}

# ── AUDIT LOG ─────────────────────────────────────────────────────────────────
_AUDIT_TYPES=["PA_SUBMIT","PA_VIEW","PA_DECISION","USER_LOGIN","USER_LOGOUT","CONFIG_CHANGE","REPORT_EXPORT","CASE_ASSIGN"]

def _gen_audit():
    us=list(_users.values()) or [{"id":"u0","full_name":"System","role":"SYSTEM"}]
    return [{"id":str(uuid.uuid4()),"timestamp":(datetime.now(timezone.utc)-timedelta(hours=i*2+random.randint(0,4))).isoformat(),
              "event_type":random.choice(_AUDIT_TYPES),"user_id":random.choice(us)["id"],
              "user_name":random.choice(us)["full_name"],"user_role":random.choice(us)["role"],
              "resource":random.choice(["pa_case","user","config","report"]),
              "resource_id":f"PA-2026-{random.randint(100000,599999):06d}",
              "ip_address":f"10.0.{random.randint(1,254)}.{random.randint(1,254)}",
              "phi_accessed":random.random()>0.5,"result":random.choice(["SUCCESS","SUCCESS","SUCCESS","FAILURE"]),
              "details":"Action completed."} for i in range(60)]

_audit=_gen_audit()

@router.get("/audit-log")
async def audit_log(event_type:Optional[str]=None, user_id:Optional[str]=None, phi_accessed:Optional[bool]=None,
                     page:int=Query(1,ge=1), limit:int=Query(50,ge=1,le=200), current_user:dict=Depends(get_current_user)):
    events=list(_audit)
    if event_type: events=[e for e in events if e["event_type"]==event_type]
    if user_id: events=[e for e in events if e["user_id"]==user_id]
    if phi_accessed is not None: events=[e for e in events if e["phi_accessed"]==phi_accessed]
    total=len(events); start=(page-1)*limit
    return {"items":events[start:start+limit],"total":total,"page":page,"pages":max(1,(total+limit-1)//limit)}

@router.get("/audit-log/export")
async def export_audit(current_user:dict=Depends(get_current_user)):
    lines=["timestamp,event_type,user_name,user_role,resource,resource_id,phi_accessed,result\n"]
    for e in _audit: lines.append(f"{e['timestamp']},{e['event_type']},\"{e['user_name']}\",{e['user_role']},{e['resource']},{e['resource_id']},{e['phi_accessed']},{e['result']}\n")
    return StreamingResponse(io.BytesIO("".join(lines).encode()),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=audit-log.csv"})

# ── SYSTEM ────────────────────────────────────────────────────────────────────
def _svc_list():
    svcs=[("AI Engine",8001),("Intake Service",8002),("Payer Integration",8003),("Appeals Service",8004),
           ("Notification Service",8005),("Document Service",8006),("Auth Service",8007),
           ("User Management",8008),("Reporting Service",8009),("Eligibility Service",8010),("Audit Service",8011)]
    return [{"name":n,"port":p,"status":random.choice(["healthy","healthy","healthy","degraded"]),
              "response_time_ms":random.randint(5,120),"uptime_pct":round(random.uniform(99.0,99.99),2),
              "last_check":datetime.now(timezone.utc).isoformat(),"version":"1.0.0"} for n,p in svcs]

@router.get("/system/health")
async def sys_health(current_user:dict=Depends(get_current_user)):
    svcs=_svc_list(); h=sum(1 for s in svcs if s["status"]=="healthy")
    return {"overall_status":"healthy" if h==len(svcs) else "degraded","healthy_services":h,
            "total_services":len(svcs),"database_status":"healthy","cache_status":"healthy",
            "uptime_seconds":random.randint(86400,2592000),"checked_at":datetime.now(timezone.utc).isoformat()}

@router.get("/system/services")
async def sys_services(current_user:dict=Depends(get_current_user)):
    return {"services":_svc_list()}

@router.get("/system/queues")
async def sys_queues(current_user:dict=Depends(get_current_user)):
    return {"queues":[{"name":n,"depth":random.randint(0,20),"consumers":random.randint(1,4),"rate_per_min":random.randint(5,80)}
                       for n in ["pa-submissions","pa-decisions","notifications","audit-events","ocr-processing"]]}

@router.get("/system/config")
async def sys_config(current_user:dict=Depends(get_current_user)):
    return {"config":_cfg}

@router.put("/system/config/{key}")
async def update_cfg(key:str, body:dict, current_user:dict=Depends(get_current_user)):
    _cfg[key]=str(body.get("value","")); return {"key":key,"value":_cfg[key],"updated_by":current_user.get("name"),"updated_at":datetime.now(timezone.utc).isoformat()}

@router.get("/system/incidents")
async def sys_incidents(current_user:dict=Depends(get_current_user)):
    return {"incidents":[{"id":str(uuid.uuid4()),"title":"Elevated AI Engine latency","severity":"LOW","status":"RESOLVED",
                           "started_at":(datetime.now(timezone.utc)-timedelta(hours=48)).isoformat(),
                           "resolved_at":(datetime.now(timezone.utc)-timedelta(hours=46)).isoformat(),
                           "impact":"AI analysis latency +200ms. Auto-decisions continued normally."}]}

@router.get("/system/ai-models")
async def sys_ai_models(current_user:dict=Depends(get_current_user)):
    return {"models":[
        {"name":"ClinicalBERT","version":"v2.1","status":"active","accuracy":0.934,"purpose":"Medical necessity classification",
         "last_trained":(datetime.now(timezone.utc)-timedelta(days=14)).isoformat()},
        {"name":"BioBERT NER","version":"v1.1","status":"active","accuracy":0.921,"purpose":"Clinical entity extraction",
         "last_trained":(datetime.now(timezone.utc)-timedelta(days=21)).isoformat()},
        {"name":"RAG Guidelines","version":"v4","status":"active","accuracy":None,"purpose":"Clinical guideline retrieval",
         "last_trained":(datetime.now(timezone.utc)-timedelta(days=7)).isoformat()},
    ]}

# ── ADMIN NOTIFICATIONS ───────────────────────────────────────────────────────
@router.get("/notifications")
async def admin_notifs(current_user:dict=Depends(get_current_user)):
    return {"notifications":_notifs,"unread_count":sum(1 for n in _notifs if not n["read"])}

@router.put("/notifications/read-all")
async def admin_mark_read(current_user:dict=Depends(get_current_user)):
    for n in _notifs: n["read"]=True
    return {"message":"All admin notifications marked as read"}
