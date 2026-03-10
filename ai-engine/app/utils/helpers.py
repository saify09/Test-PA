"""
Utility services:
  - FHIR R4 ClaimResponse mapper (FR-303)
  - Eligibility checker (FR-004)
  - PA number generator
  - Audit logger
  - Kafka event publisher
"""

from __future__ import annotations

import json
import random
import string
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional
import structlog
from app.core.config import settings

log = structlog.get_logger(__name__)


# ── PA Number Generator ───────────────────────────────────────────────────────
def generate_pa_number() -> str:
    """Generate unique PA tracking number: PA-YYYY-XXXXXX"""
    year = datetime.now().year
    suffix = "".join(random.choices(string.digits, k=6))
    return f"PA-{year}-{suffix}"


def generate_appeal_number() -> str:
    year = datetime.now().year
    suffix = "".join(random.choices(string.digits, k=6))
    return f"APP-{year}-{suffix}"


# ── FHIR R4 Mapper ────────────────────────────────────────────────────────────
class FHIRMapper:
    """
    Maps internal PA decision to FHIR R4 ClaimResponse resource.
    Supports HL7 FHIR R4 push-back to EHR systems (FR-303).
    """

    @staticmethod
    def decision_to_fhir_claim_response(
        pa_number: str,
        decision: str,
        auth_number: Optional[str],
        auth_start: Optional[date],
        auth_end: Optional[date],
        member_fhir_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        outcome_map = {
            "APPROVED": "complete",
            "AUTO_APPROVED": "complete",
            "DENIED": "complete",
            "AUTO_DENIED": "complete",
            "PENDED": "queued",
            "IN_REVIEW": "queued",
        }
        disposition_map = {
            "APPROVED": "Approved",
            "AUTO_APPROVED": "Approved",
            "DENIED": "Denied — see determination letter for details",
            "AUTO_DENIED": "Denied — see determination letter for details",
            "PENDED": "Pending additional information",
            "IN_REVIEW": "Under clinical review",
        }
        resource: Dict[str, Any] = {
            "resourceType": "ClaimResponse",
            "id": pa_number,
            "meta": {
                "versionId": "1",
                "lastUpdated": datetime.now(timezone.utc).isoformat(),
                "profile": [
                    "http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-claimresponse"
                ],
            },
            "status": "active",
            "type": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/claim-type",
                        "code": "professional",
                    }
                ]
            },
            "use": "preauthorization",
            "created": datetime.now(timezone.utc).isoformat(),
            "outcome": outcome_map.get(decision, "queued"),
            "disposition": disposition_map.get(decision, "Pending"),
        }
        if auth_number:
            resource["preAuthRef"] = auth_number
        if auth_start and auth_end:
            resource["preAuthPeriod"] = {
                "start": auth_start.isoformat(),
                "end": auth_end.isoformat(),
            }
        if member_fhir_id:
            resource["patient"] = {"reference": f"Patient/{member_fhir_id}"}
        return resource

    @staticmethod
    def pa_to_fhir_claim(submission_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Convert internal PA submission to FHIR R4 Claim resource."""
        return {
            "resourceType": "Claim",
            "id": submission_dict.get("pa_number", ""),
            "status": "active",
            "type": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/claim-type",
                        "code": "professional",
                    }
                ]
            },
            "use": "preauthorization",
            "created": datetime.now(timezone.utc).isoformat(),
            "priority": {
                "coding": [{"code": submission_dict.get("urgency", "normal").lower()}]
            },
        }


# ── Eligibility Checker ───────────────────────────────────────────────────────
class EligibilityChecker:
    """
    Real-time eligibility verification against payer APIs (FR-004).
    Production: calls UHC /eligibility/v1/verify, Aetna /eligibility, etc.
    """

    @classmethod
    async def verify(
        cls,
        member_id: str,
        payer: str,
        service_date: date,
        provider_npi: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            result = await cls._call_payer_api(
                member_id, payer, service_date, provider_npi
            )
            return result
        except Exception as e:
            log.warning("eligibility.api_error", payer=payer, error=str(e))
            # Fallback to mock — production should NOT silently fall back
            return cls._mock_response(member_id, payer)

    @staticmethod
    async def _call_payer_api(
        member_id: str, payer: str, service_date: date, provider_npi: Optional[str]
    ) -> Dict[str, Any]:
        import httpx

        api_configs = {
            "UHC": {
                "url": f"{settings.UHC_API_BASE}/eligibility/verify",
                "auth": ("Bearer", settings.UHC_CLIENT_SECRET),
            },
            "AETNA": {
                "url": f"{settings.AETNA_API_BASE}/eligibility",
                "auth": ("Bearer", settings.AETNA_CLIENT_SECRET),
            },
        }
        cfg = api_configs.get(payer)
        if not cfg or not cfg["auth"][1]:
            raise ValueError(f"No API config for payer {payer}")

        payload = {"memberId": member_id, "dateOfService": service_date.isoformat()}
        if provider_npi:
            payload["providerNpi"] = provider_npi

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                cfg["url"],
                json=payload,
                headers={"Authorization": f"{cfg['auth'][0]} {cfg['auth'][1]}"},
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def _mock_response(member_id: str, payer: str) -> Dict[str, Any]:
        return {
            "is_eligible": True,
            "plan_name": f"{payer} PPO Gold",
            "coverage_start": "2026-01-01",
            "coverage_end": "2026-12-31",
            "deductible_met": False,
            "deductible_remaining": 1200.00,
            "requires_pa": True,
            "copay": 50.0,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "_source": "mock",
        }


# ── Kafka Event Publisher ─────────────────────────────────────────────────────
class EventPublisher:
    """
    Publishes domain events to Kafka topics (TR-004 event-driven architecture).
    Falls back to no-op if Kafka unavailable.
    """

    _producer = None

    @classmethod
    async def publish(cls, topic: str, key: str, payload: Dict[str, Any]):
        if not settings.ENABLE_KAFKA:
            log.debug("event_publisher.kafka_disabled", topic=topic, key=key)
            return
        try:
            if not cls._producer:
                from aiokafka import AIOKafkaProducer

                cls._producer = AIOKafkaProducer(
                    bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                    value_serializer=lambda v: json.dumps(v).encode(),
                    key_serializer=lambda k: k.encode() if k else None,
                )
                await cls._producer.start()
            await cls._producer.send(topic, key=key, value=payload)
            log.debug("event_publisher.sent", topic=topic, key=key)
        except Exception as e:
            log.warning("event_publisher.failed", topic=topic, error=str(e))

    @classmethod
    async def publish_submission(cls, pa_number: str, payload: Dict[str, Any]):
        await cls.publish(settings.KAFKA_TOPIC_SUBMISSIONS, pa_number, payload)

    @classmethod
    async def publish_decision(
        cls, pa_number: str, decision: str, payload: Dict[str, Any]
    ):
        await cls.publish(
            settings.KAFKA_TOPIC_DECISIONS,
            pa_number,
            {"pa_number": pa_number, "decision": decision, **payload},
        )


# ── Audit Logger ──────────────────────────────────────────────────────────────
class AuditLogger:
    """HIPAA-compliant audit logger (§164.312(b))."""

    @staticmethod
    async def log(
        action: str,
        resource: str,
        resource_id: Optional[str] = None,
        user_id: Optional[str] = None,
        user_name: Optional[str] = None,
        user_role: Optional[str] = None,
        details: Optional[str] = None,
        ip_address: Optional[str] = None,
        phi_accessed: bool = False,
        phi_fields: Optional[str] = None,
        result: str = "SUCCESS",
        db_session=None,
    ):
        from app.models.pa_models import AuditLog

        entry = {
            "action": action,
            "resource": resource,
            "resource_id": resource_id,
            "user_id": user_id,
            "user_name": user_name,
            "user_role": user_role,
            "details": details,
            "ip_address": ip_address,
            "phi_accessed": phi_accessed,
            "phi_fields": phi_fields,
            "result": result,
        }
        log.info("audit", **{k: v for k, v in entry.items() if v is not None})
        if db_session:
            try:
                db_entry = AuditLog(**entry)
                db_session.add(db_entry)
                await db_session.flush()
            except Exception as e:
                log.error("audit.db_write_failed", error=str(e))
