"""
shared/common.py — Shared utilities across all PA microservices.
Imported by intake, payer-integration, appeals, notification, document services.
"""

from __future__ import annotations
import json, uuid, re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional
from enum import Enum


# ── Status enums (shared across all services) ─────────────────────────────────
class PAStatus(str, Enum):
    SUBMITTED = "SUBMITTED"
    IN_REVIEW = "IN_REVIEW"
    PENDING_INFO = "PENDING_INFO"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    AUTO_APPROVED = "AUTO_APPROVED"
    AUTO_DENIED = "AUTO_DENIED"
    PENDED = "PENDED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class UrgencyLevel(str, Enum):
    ROUTINE = "ROUTINE"
    URGENT = "URGENT"
    EMERGENCY = "EMERGENCY"
    EXPEDITED = "EXPEDITED"


class NotificationChannel(str, Enum):
    EMAIL = "EMAIL"
    SMS = "SMS"
    PORTAL = "PORTAL"
    FAX = "FAX"
    MAIL = "MAIL"


class NotificationRecipient(str, Enum):
    PROVIDER = "PROVIDER"
    MEMBER = "MEMBER"
    ADMIN = "ADMIN"
    REVIEWER = "REVIEWER"


# ── ID generators ─────────────────────────────────────────────────────────────
def new_uuid() -> str:
    return str(uuid.uuid4())


def gen_pa_number() -> str:
    import random, string

    return f"PA-{datetime.now().year}-{''.join(random.choices(string.digits, k=6))}"


def gen_appeal_number() -> str:
    import random, string

    return f"APP-{datetime.now().year}-{''.join(random.choices(string.digits, k=6))}"


def gen_auth_number(payer: str) -> str:
    prefix = {
        "UHC": "UHC",
        "AETNA": "AET",
        "BCBS": "BCB",
        "CIGNA": "CGN",
        "CVS": "CVS",
    }.get(payer, "AUTH")
    return f"{prefix}{datetime.now().strftime('%Y%m%d')}{uuid.uuid4().hex[:6].upper()}"


# ── SLA helpers ───────────────────────────────────────────────────────────────
SLA_HOURS = {
    UrgencyLevel.EMERGENCY: 24,
    UrgencyLevel.URGENT: 24,
    UrgencyLevel.EXPEDITED: 72,
    UrgencyLevel.ROUTINE: 72,
}


def sla_deadline(urgency: UrgencyLevel) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=SLA_HOURS.get(urgency, 72))


def sla_hours_remaining(deadline: datetime) -> float:
    return (deadline - datetime.now(timezone.utc)).total_seconds() / 3600


def is_sla_at_risk(deadline: datetime, warning_hours: float = 4.0) -> bool:
    return sla_hours_remaining(deadline) <= warning_hours


# ── Kafka helpers ──────────────────────────────────────────────────────────────
TOPICS = {
    "SUBMISSIONS": "pa-submissions",
    "DECISIONS": "pa-decisions",
    "NOTIFICATIONS": "pa-notifications",
    "APPEALS": "pa-appeals",
    "DOCUMENTS": "pa-documents",
    "PAYER_OUTBOUND": "payer-outbound",
    "PAYER_INBOUND": "payer-inbound",
    "AUDIT": "pa-audit",
}


def build_event(
    event_type: str, pa_number: str, payload: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "event_id": new_uuid(),
        "event_type": event_type,
        "pa_number": pa_number,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }


# ── HTTP response helpers ──────────────────────────────────────────────────────
def ok(data: Any, message: str = "Success") -> Dict[str, Any]:
    return {"success": True, "message": message, "data": data}


def err(message: str, code: str = "ERROR") -> Dict[str, Any]:
    return {"success": False, "error": code, "message": message}


# ── ICD-10 / CPT validators ───────────────────────────────────────────────────
ICD10_RE = re.compile(r"^[A-Z]\d{2}[A-Z0-9]{0,7}$")
CPT_RE = re.compile(r"^\d{5}$")
NPI_RE = re.compile(r"^\d{10}$")


def valid_icd10(code: str) -> bool:
    return bool(ICD10_RE.match(code.upper().replace(".", "")))


def valid_cpt(code: str) -> bool:
    return bool(CPT_RE.match(code.strip()))


def valid_npi(npi: str) -> bool:
    return bool(NPI_RE.match(npi.strip()))
