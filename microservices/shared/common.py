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
    SUBMITTED      = "SUBMITTED"
    IN_REVIEW      = "IN_REVIEW"
    PENDING_INFO   = "PENDING_INFO"
    APPROVED       = "APPROVED"
    DENIED         = "DENIED"
    AUTO_APPROVED  = "AUTO_APPROVED"
    AUTO_DENIED    = "AUTO_DENIED"
    PENDED         = "PENDED"
    CANCELLED      = "CANCELLED"
    EXPIRED        = "EXPIRED"

class UrgencyLevel(str, Enum):
    ROUTINE   = "ROUTINE"
    URGENT    = "URGENT"
    EMERGENCY = "EMERGENCY"
    EXPEDITED = "EXPEDITED"

class NotificationChannel(str, Enum):
    EMAIL  = "EMAIL"
    SMS    = "SMS"
    PORTAL = "PORTAL"
    FAX    = "FAX"
    MAIL   = "MAIL"

class NotificationRecipient(str, Enum):
    PROVIDER = "PROVIDER"
    MEMBER   = "MEMBER"
    ADMIN    = "ADMIN"
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
    prefix = {"UHC":"UHC","AETNA":"AET","BCBS":"BCB","CIGNA":"CGN","CVS":"CVS"}.get(payer,"AUTH")
    return f"{prefix}{datetime.now().strftime('%Y%m%d')}{uuid.uuid4().hex[:6].upper()}"

# ── SLA helpers ───────────────────────────────────────────────────────────────
SLA_HOURS = {
    UrgencyLevel.EMERGENCY: 24,
    UrgencyLevel.URGENT:    24,
    UrgencyLevel.EXPEDITED: 72,
    UrgencyLevel.ROUTINE:   72,
}

def sla_deadline(urgency: UrgencyLevel) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=SLA_HOURS.get(urgency, 72))

def sla_hours_remaining(deadline: datetime) -> float:
    return (deadline - datetime.now(timezone.utc)).total_seconds() / 3600

def is_sla_at_risk(deadline: datetime, warning_hours: float = 4.0) -> bool:
    return sla_hours_remaining(deadline) <= warning_hours

# ── Kafka helpers ──────────────────────────────────────────────────────────────
TOPICS = {
    "SUBMISSIONS":    "pa-submissions",
    "DECISIONS":      "pa-decisions",
    "NOTIFICATIONS":  "pa-notifications",
    "APPEALS":        "pa-appeals",
    "DOCUMENTS":      "pa-documents",
    "PAYER_OUTBOUND": "payer-outbound",
    "PAYER_INBOUND":  "payer-inbound",
    "AUDIT":          "pa-audit",
}

def build_event(event_type: str, pa_number: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "event_id":   new_uuid(),
        "event_type": event_type,
        "pa_number":  pa_number,
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "payload":    payload,
    }

# ── HTTP response helpers ──────────────────────────────────────────────────────
def ok(data: Any, message: str = "Success") -> Dict[str, Any]:
    return {"success": True, "message": message, "data": data}

def err(message: str, code: str = "ERROR") -> Dict[str, Any]:
    return {"success": False, "error": code, "message": message}

# ── ICD-10 / CPT validators ───────────────────────────────────────────────────
ICD10_RE = re.compile(r"^[A-Z]\d{2}[A-Z0-9]{0,7}$")
CPT_RE   = re.compile(r"^\d{5}$")
NPI_RE   = re.compile(r"^\d{10}$")

def valid_icd10(code: str) -> bool:
    return bool(ICD10_RE.match(code.upper().replace(".", "")))

def valid_cpt(code: str) -> bool:
    return bool(CPT_RE.match(code.strip()))

def valid_npi(npi: str) -> bool:
    return bool(NPI_RE.match(npi.strip()))


# ═══════════════════════════════════════════════════════════════════════════════
# FLS §6 — CROSS-PAYER CANONICAL FIELD TRANSFORMER
# ═══════════════════════════════════════════════════════════════════════════════
# Maps every internal field to/from each payer's exact wire format.
# Source: Field-Level Specifications Section 6, Table 26 (all 20 fields × 4 payers).
#
# Usage:
#   from microservices.shared.common import PayerFieldMapper
#   uhc_payload = PayerFieldMapper.to_payer("UHC", internal_dict)
#   internal    = PayerFieldMapper.from_payer("AETNA", fhir_response)

from typing import Any, Dict, Optional


class PayerFieldMapper:
    """
    FLS §6 canonical cross-payer field transformer.

    Internal field model → payer wire format (outbound)
    Payer wire format   → internal field model (inbound)

    Covers all 20 fields from FLS Table 26:
      member_id, first_name, last_name, dob, gender, primary_dx,
      procedure_code, provider_npi, urgency, clinical_notes,
      requested_date, quantity, place_of_service, auth_number,
      decision, effective_date, expiration_date, denial_reason,
      approved_units, reviewer_id
    """

    # ── OUTBOUND: internal → payer ────────────────────────────────────────────

    @staticmethod
    def to_uhc(data: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.1 / Table 17 — internal → UHC REST API (JSON)."""
        urgency_map = {"ROUTINE": "ROUTINE", "URGENT": "URGENT", "EMERGENT": "EMERGENCY"}
        return {
            "authorizationRequest": {
                "requestId":   data.get("pa_number", ""),
                "requestDate": data.get("submitted_at", ""),
                "priority":    urgency_map.get(data.get("urgency", "ROUTINE"), "ROUTINE"),
            },
            "subscriber": {
                "memberId":    data.get("member_id", "").upper(),
                "firstName":   data.get("first_name", "").upper(),
                "lastName":    data.get("last_name", "").upper(),
                "dateOfBirth": data.get("dob", ""),          # ISO 8601
                "gender":      data.get("gender", "U")[0].upper(),  # M/F/U
            },
            "clinicalInfo": {
                "primaryDiagnosis": {
                    "code":        data.get("primary_dx", "").replace(".", ""),
                    "description": data.get("primary_dx_desc", ""),
                },
                "summary":     data.get("clinical_notes", ""),
            },
            "serviceRequest": {
                "procedureCode":      data.get("procedure_code", ""),
                "modifiers":          data.get("modifiers", []),
                "serviceType":        data.get("service_type", ""),
                "placeOfService":     data.get("place_of_service", "11"),
                "requestedStartDate": data.get("requested_date", ""),
                "requestedUnits":     data.get("quantity", 1),
            },
            "renderingProvider": {
                "npi":   data.get("provider_npi", ""),
                "taxId": data.get("provider_tax_id", "").replace("-", ""),
            },
            "serviceLocation": {
                "npi": data.get("facility_npi", ""),
            },
            "submitter": {
                "name":  data.get("provider_name", ""),
                "phone": re.sub(r"\D", "", data.get("provider_phone", "")),
                "fax":   re.sub(r"\D", "", data.get("provider_fax", "")),
            },
            "attachments": data.get("document_ids", []),
        }

    @staticmethod
    def to_aetna_fhir(data: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.2.2 / Table 20 — internal → Aetna FHIR R4 Bundle."""
        icd10_system    = "http://hl7.org/fhir/sid/icd-10-cm"
        cpt_system      = "http://www.ama-assn.org/go/cpt"
        npi_system      = "http://hl7.org/fhir/sid/us-npi"
        snomed_system   = "http://snomed.info/sct"
        ucum_system     = "http://unitsofmeasure.org"
        priority_map    = {"ROUTINE": "routine", "URGENT": "urgent",
                           "EMERGENT": "asap", "EXPEDITED": "asap"}
        gender_map      = {"M": "male", "F": "female", "X": "other", "U": "unknown"}

        patient_id   = f"patient-{data.get('member_id','')}"
        coverage_id  = f"coverage-{data.get('member_id','')}"
        condition_id = f"condition-{data.get('pa_number','')}"
        pract_id     = f"practitioner-{data.get('provider_npi','')}"
        org_id       = f"org-{data.get('facility_npi','')}"
        sr_id        = f"servicerequest-{data.get('pa_number','')}"

        bundle_entries = [
            {
                "fullUrl":  f"urn:uuid:{patient_id}",
                "resource": {
                    "resourceType": "Patient",
                    "id":           patient_id,
                    "identifier": [{
                        "type":  {"coding": [{"code": "MB"}]},
                        "value": data.get("member_id", ""),
                    }],
                    "name": [{"family": data.get("last_name", ""),
                              "given":  [data.get("first_name", "")]}],
                    "birthDate": data.get("dob", ""),
                    "gender":    gender_map.get(data.get("gender", "U"), "unknown"),
                },
            },
            {
                "fullUrl":  f"urn:uuid:{coverage_id}",
                "resource": {
                    "resourceType":  "Coverage",
                    "id":            coverage_id,
                    "status":        "active",
                    "beneficiary":   {"reference": f"urn:uuid:{patient_id}"},
                    "payor":         [{"display": "Aetna"}],
                },
            },
            {
                "fullUrl":  f"urn:uuid:{condition_id}",
                "resource": {
                    "resourceType": "Condition",
                    "id":           condition_id,
                    "subject":      {"reference": f"urn:uuid:{patient_id}"},
                    "code": {
                        "coding": [{
                            "system": icd10_system,
                            "code":   data.get("primary_dx", "").replace(".", ""),
                            "display":data.get("primary_dx_desc", ""),
                        }]
                    },
                },
            },
            {
                "fullUrl":  f"urn:uuid:{pract_id}",
                "resource": {
                    "resourceType": "Practitioner",
                    "id":           pract_id,
                    "identifier": [{
                        "type":  {"coding": [{"code": "NPI", "system": npi_system}]},
                        "value": data.get("provider_npi", ""),
                    }],
                    "name": [{"text": data.get("provider_name", "")}],
                },
            },
            {
                "fullUrl":  f"urn:uuid:{org_id}",
                "resource": {
                    "resourceType": "Organization",
                    "id":           org_id,
                    "identifier": [{
                        "type":  {"coding": [{"code": "NPI", "system": npi_system}]},
                        "value": data.get("facility_npi", ""),
                    }],
                    "name": data.get("facility_name", ""),
                },
            },
            {
                "fullUrl":  f"urn:uuid:{sr_id}",
                "resource": {
                    "resourceType": "ServiceRequest",
                    "id":           sr_id,
                    "status":       "active",
                    "intent":       "order",
                    "priority":     priority_map.get(data.get("urgency", "ROUTINE"), "routine"),
                    "subject":      {"reference": f"urn:uuid:{patient_id}"},
                    "requester":    {"reference": f"urn:uuid:{pract_id}"},
                    "code": {
                        "coding": [{
                            "system":  cpt_system,
                            "code":    data.get("procedure_code", ""),
                            "display": data.get("procedure_desc", ""),
                        }]
                    },
                    "category": [{
                        "coding": [{"system": snomed_system, "display": data.get("service_type", "")}]
                    }],
                    "reasonCode": [{
                        "coding": [{"system": icd10_system, "code": data.get("primary_dx", "").replace(".", "")}]
                    }],
                    "quantityQuantity": {
                        "value": data.get("quantity", 1),
                        "system": ucum_system,
                        "code":   "1",
                    },
                    "occurrencePeriod": {
                        "start": data.get("requested_date", ""),
                    },
                    "insurance": [{"reference": f"urn:uuid:{coverage_id}"}],
                    "supportingInfo": [
                        {"reference": f"urn:uuid:{doc_id}"}
                        for doc_id in data.get("document_ids", [])
                    ],
                    "note": [{"text": data.get("clinical_notes", "")}],
                },
            },
        ]
        return {
            "resourceType": "Bundle",
            "id":           data.get("pa_number", ""),
            "type":         "collection",
            "timestamp":    data.get("submitted_at", ""),
            "entry":        bundle_entries,
        }

    @staticmethod
    def to_cvs_caremark(data: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.3 / Table 22 — internal → CVS Caremark NCPDP ePA (JSON)."""
        return {
            "patient": {
                "memberId":    data.get("member_id", ""),
                "rxBin":       data.get("rx_bin", ""),           # VAL-001 per FLS §5.3
                "rxPcn":       data.get("rx_pcn", ""),
                "rxGroup":     data.get("rx_group", ""),
                "name":        f"{data.get('first_name','')} {data.get('last_name','')}".strip(),
                "dateOfBirth": data.get("dob", ""),
                "gender":      data.get("gender", "U")[0].upper(),
            },
            "medication": {
                "ndcCode":     re.sub(r"[-\s]", "", data.get("ndc_code", "")),  # 11-digit, no dashes
                "productName": data.get("medication_name", ""),
                "strength":    data.get("medication_strength", ""),
                "dosageForm":  data.get("dosage_form", ""),
            },
            "prescription": {
                "quantity":    data.get("quantity", 0),
                "daysSupply":  data.get("days_supply", 30),
                "directions":  data.get("sig", ""),
                "refills":     data.get("refills", 0),
                "fillDate":    data.get("requested_date", ""),
            },
            "clinicalInfo": {
                "diagnosisCode":    data.get("primary_dx", "").replace(".", ""),
                "justification":    data.get("clinical_notes", ""),
                "priorMedications": data.get("prior_medications_tried", []),
            },
            "prescriber": {
                "npi":   data.get("provider_npi", ""),
                "name":  data.get("provider_name", ""),
                "phone": re.sub(r"\D", "", data.get("provider_phone", "")),
            },
            "pharmacy": {
                "npi":     data.get("pharmacy_npi", ""),
                "ncpdpId": data.get("pharmacy_ncpdp_id", ""),
            },
        }

    @staticmethod
    def to_cigna(data: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.4 / Table 23 — internal → Cigna REST API."""
        return {
            "member": {
                "id":        data.get("member_id", ""),
                "firstName": data.get("first_name", ""),
                "lastName":  data.get("last_name", ""),
                "birthDate": data.get("dob", ""),
                "sex":       data.get("gender", "U")[0].upper(),
            },
            "provider": {
                "npi":  data.get("provider_npi", ""),
                "name": data.get("provider_name", ""),
            },
            "service": {
                "procedureCode": data.get("procedure_code", ""),
                "location":      data.get("place_of_service", "11"),
                "startDate":     data.get("requested_date", ""),
                "quantity":      data.get("quantity", 1),
                "urgency":       data.get("urgency", "ROUTINE"),
            },
            "diagnosis": [
                {"code": data.get("primary_dx", "").replace(".", "")}
            ],
            "clinical": {
                "narrative": data.get("clinical_notes", ""),
            },
        }

    @staticmethod
    def to_humana(data: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.5 / Table 24 — internal → Humana Availity (HL7 v2.5 / X12 278 batch)."""
        # Humana primarily uses EDI X12 278 batch processing via Availity portal
        # This produces the JSON representation; EDI generation is in to_x12_278()
        return {
            "availityRequest": {
                "memberId":     data.get("member_id", ""),
                "firstName":    data.get("first_name", ""),
                "lastName":     data.get("last_name", ""),
                "dateOfBirth":  data.get("dob", ""),
                "gender":       data.get("gender", "U")[0].upper(),
            },
            "provider": {
                "npi":   data.get("provider_npi", ""),
                "name":  data.get("provider_name", ""),
                "phone": re.sub(r"\D", "", data.get("provider_phone", "")),
            },
            "serviceRequest": {
                "procedureCode":  data.get("procedure_code", ""),
                "diagnosisCode":  data.get("primary_dx", "").replace(".", ""),
                "serviceType":    data.get("service_type", ""),
                "requestedDate":  data.get("requested_date", ""),
                "quantity":       data.get("quantity", 1),
                "clinicalNotes":  data.get("clinical_notes", ""),
                "priority":       data.get("urgency", "ROUTINE"),
            },
            "submissionMethod": "BATCH_278",
            "notes": "Humana processes via Availity portal (batch preferred). "
                     "Real-time decisions only for Gold Card providers.",
        }

    # ── INBOUND: payer response → internal ────────────────────────────────────

    @staticmethod
    def from_uhc(response: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.1 / Table 18 — UHC response → internal field model."""
        r = response.get("authorizationResponse", response)
        status_map = {
            "APPROVED":  "APPROVED",
            "DENIED":    "DENIED",
            "PENDED":    "PENDED",
            "IN_REVIEW": "IN_REVIEW",
        }
        return {
            "decision":        status_map.get(r.get("status", ""), "IN_REVIEW"),
            "auth_number":     r.get("authNumber"),
            "effective_date":  r.get("effectiveDate"),
            "expiration_date": r.get("expirationDate"),
            "approved_units":  r.get("approvedUnits"),
            "denial_reason":   r.get("denialReason"),
            "denial_reason_text": r.get("denialDescription"),
            "pend_reason":     r.get("pendReason"),
            "notes_to_provider": r.get("additionalInfo"),
            "payer_reviewer_id": r.get("reviewedBy"),
            "payer":           "UHC",
        }

    @staticmethod
    def from_aetna_fhir(claim_response: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.2 — Aetna FHIR ClaimResponse → internal field model."""
        outcome_map = {
            "complete":    "APPROVED",
            "queued":      "IN_REVIEW",
            "partial":     "PENDED",
            "error":       "DENIED",
        }
        items = claim_response.get("addItem", [{}])
        item  = items[0] if items else {}
        return {
            "decision":        outcome_map.get(claim_response.get("outcome", "queued"), "IN_REVIEW"),
            "auth_number":     claim_response.get("preAuthRef"),
            "effective_date":  item.get("servicedDate") or item.get("servicedPeriod", {}).get("start"),
            "expiration_date": item.get("servicedPeriod", {}).get("end"),
            "approved_units":  item.get("quantity", {}).get("value"),
            "denial_reason":   next((e.get("code", {}).get("text") for e in claim_response.get("error", [])), None),
            "payer":           "AETNA",
        }

    @staticmethod
    def from_cvs_caremark(response: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.3 — CVS Caremark response → internal field model."""
        decision_map = {"APPROVED": "APPROVED", "DENIED": "DENIED", "PENDED": "PENDED"}
        return {
            "decision":        decision_map.get(response.get("decision", ""), "IN_REVIEW"),
            "auth_number":     response.get("approvalNumber"),
            "effective_date":  response.get("effectiveDate"),
            "expiration_date": response.get("expirationDate"),
            "approved_units":  response.get("approvedQuantity"),
            "denial_reason":   response.get("denialReason"),
            "reviewer_id":     response.get("reviewerId"),
            "payer":           "CVS",
        }

    @staticmethod
    def from_cigna(response: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.4 — Cigna response → internal field model."""
        return {
            "decision":        response.get("decision", {}).get("status", "IN_REVIEW"),
            "auth_number":     response.get("authorization", {}).get("number"),
            "effective_date":  response.get("authorization", {}).get("startDate"),
            "expiration_date": response.get("authorization", {}).get("endDate"),
            "approved_units":  response.get("authorization", {}).get("approvedUnits"),
            "denial_reason":   response.get("decision", {}).get("reason"),
            "reviewer_id":     response.get("decision", {}).get("reviewer"),
            "payer":           "CIGNA",
        }

    # ── OUTBOUND: internal → BCBS/Anthem Availity ────────────────────────────

    @staticmethod
    def to_bcbs(data: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.6 — internal field model → BCBS/Anthem Availity wire format.

        BCBS is a federation of 35+ independent companies. This targets the
        Anthem BCBS REST API (largest member) at https://api.anthem.com/prior-auth/v1/
        with Availity SSO + OAuth 2.0 (FLS §5.6 Integration Overview).

        NOTE: eviCore/AIM/NIA specialty routing handled via 'specialty_program'
        field — imaging/cardiology routed automatically to eviCore.
        BlueCard cross-plan eligibility uses separate eligibility check.
        """
        # FLS §6 Table 26 — BCBS Anthem field mappings
        urgency_map = {
            "ROUTINE":   "standard",
            "URGENT":    "urgent",
            "EMERGENT":  "stat",
            "EXPEDITED": "expedited",
        }

        # Specialty program routing (FLS §5.6: eviCore for imaging/cardiology)
        service_type = data.get("service_type", "").lower()
        specialty_program = None
        if any(s in service_type for s in ("imaging", "mri", "ct scan", "radiology", "x-ray")):
            specialty_program = "eviCore"
        elif any(s in service_type for s in ("cardiology", "cardiac", "echo", "stress")):
            specialty_program = "eviCore"
        elif any(s in service_type for s in ("neurology", "orthopedic", "spine", "pain")):
            specialty_program = "AIM"

        payload: Dict[str, Any] = {
            # FLS §6: member fields
            "member": {
                "id":        data.get("member_id", ""),                         # FLS §6: member_id
                "firstName": (data.get("member_first_name", "") or "").upper(), # Anthem: uppercase
                "lastName":  (data.get("member_last_name", "") or "").upper(),
                "birthDate": data.get("member_dob", ""),                        # ISO 8601 YYYY-MM-DD
                "gender":    {"M": "M", "F": "F", "X": "U", "U": "U"}.get(
                                 data.get("member_gender", "U"), "U"),
                "blueCardPlan": data.get("payer_plan_code", ""),                # BlueCard plan prefix
            },
            # FLS §6: provider fields
            "provider": {
                "npi":       data.get("provider_npi", ""),                      # FLS §6: provider_npi
                "taxId":     (data.get("provider_tax_id", "") or "").replace("-", ""),
                "name":      data.get("provider_name", ""),
                "specialty": data.get("provider_specialty", ""),
                "phone":     (data.get("provider_phone", "") or "").replace(r"[^\d]", ""),
                "inNetwork": True,  # network check performed at eligibility step
            },
            "facility": {
                "npi":     data.get("facility_npi", ""),
                "name":    data.get("facility_name", ""),
                "address": data.get("facility_address", ""),
            },
            # FLS §6: clinical / service request fields
            "service": {
                "procedureCode": data.get("procedure_code", ""),                # FLS §6: procedure_code
                "procedureDesc": data.get("procedure_desc", ""),
                "serviceType":   data.get("service_type", ""),
                "location":      data.get("place_of_service", ""),              # FLS §6: place_of_service
                "startDate":     data.get("requested_date", ""),                # FLS §6: requested_date
                "quantity":      data.get("quantity", 1),                       # FLS §6: quantity
                "urgency":       urgency_map.get(
                                     data.get("urgency", "ROUTINE"), "standard"), # FLS §6: urgency
            },
            "diagnosis": [
                {
                    "code":    data.get("primary_dx", "").replace(".", ""),     # FLS §6: primary_dx
                    "type":    "principal",
                    "system":  "ICD-10-CM",
                }
            ],
            "clinical": {
                "narrative":    data.get("clinical_notes", ""),                 # FLS §6: clinical_notes
                "priorTreatment": data.get("prior_treatments", ""),
                "labResults":   data.get("lab_results", ""),
            },
            "requestId":       data.get("pa_number", ""),                       # FLS §6: internal ref
            "requestDate":     data.get("submission_date", ""),
            "submitter": {
                "name":  data.get("submitter_name", data.get("provider_name", "")),
                "phone": data.get("submitter_phone", data.get("provider_phone", "")),
                "fax":   data.get("submitter_fax", ""),
            },
        }

        # Add secondary diagnoses if present
        for i, key in enumerate(["secondary_dx_1", "secondary_dx_2"], start=2):
            if data.get(key):
                payload["diagnosis"].append({
                    "code":   data[key].replace(".", ""),
                    "type":   "secondary",
                    "system": "ICD-10-CM",
                    "order":  i,
                })

        # eviCore / AIM / NIA specialty routing (FLS §5.6)
        if specialty_program:
            payload["specialtyProgram"] = specialty_program
            payload["service"]["specialtyRouting"] = True

        # Attachments (Anthem: PDF only, max 10MB, max 10 files)
        if data.get("document_ids"):
            payload["attachments"] = [
                {"documentId": doc_id, "type": "ClinicalNotes"}
                for doc_id in (data["document_ids"] or [])[:10]
            ]

        return payload

    # ── INBOUND: BCBS/Anthem response → internal ──────────────────────────────

    @staticmethod
    def from_bcbs(response: Dict[str, Any]) -> Dict[str, Any]:
        """FLS §5.6 — BCBS/Anthem Availity response → internal field model.

        Maps the Anthem prior-auth/v1 response back to the canonical internal
        field model defined in FLS §6 Table 26.
        """
        # Anthem uses nested 'authorization' object for approvals
        auth  = response.get("authorization", {})
        error = response.get("error", {})

        # Anthem status codes → internal decision
        status_map = {
            "APPROVED":          "APPROVED",
            "PARTIALLY_APPROVED": "APPROVED",    # partial approval → treat as approved
            "DENIED":            "DENIED",
            "PENDED":            "PENDED",
            "PENDING":           "PENDED",
            "IN_REVIEW":         "IN_REVIEW",
            "RECEIVED":          "IN_REVIEW",
            "CANCELLED":         "CANCELLED",
        }

        # Denial reason from error object or top-level
        denial_reason = (
            error.get("code")
            or error.get("reason")
            or response.get("denialReason")
            or response.get("statusReason")
        )

        return {
            # FLS §6 Table 26: decision
            "decision":          status_map.get(
                                     response.get("status", "").upper(), "IN_REVIEW"),
            # FLS §6: auth_number
            "auth_number":       auth.get("number") or response.get("authorizationNumber"),
            # FLS §6: effective_date
            "effective_date":    auth.get("startDate") or response.get("effectiveDate"),
            # FLS §6: expiration_date
            "expiration_date":   auth.get("endDate") or response.get("expirationDate"),
            # FLS §6: approved_units
            "approved_units":    auth.get("approvedUnits") or response.get("approvedQuantity"),
            # FLS §6: denial_reason
            "denial_reason":     denial_reason,
            "denial_reason_text": error.get("description") or response.get("statusDescription"),
            "pend_reason":       response.get("pendReason") or response.get("additionalInfoRequired"),
            # Anthem-specific: specialty program routing confirmation
            "specialty_program": response.get("specialtyProgram"),
            "evicore_ref":       response.get("evicoreReferenceNumber"),
            # FLS §6: reviewer_id
            "reviewer_id":       response.get("reviewedBy") or auth.get("reviewerId"),
            # FLS §6: payer
            "payer":             "BCBS",
            # SLA (FLS §5.6: varies 24hrs–5 days by plan)
            "sla_hours":         response.get("expectedDecisionHours", 96),
            "notes":             response.get("additionalInfo") or response.get("providerNotes"),
        }

    # ── DISPATCHER ────────────────────────────────────────────────────────────

    @classmethod
    def to_payer(cls, payer: str, internal: Dict[str, Any]) -> Dict[str, Any]:
        """Route internal dict → correct payer wire format."""
        dispatch = {
            "UHC":    cls.to_uhc,
            "AETNA":  cls.to_aetna_fhir,
            "CVS":    cls.to_cvs_caremark,
            "CIGNA":  cls.to_cigna,
            "HUMANA": cls.to_humana,
            "BCBS":   cls.to_bcbs,          # FLS §5.6 — added
        }
        fn = dispatch.get(payer.upper())
        if not fn:
            raise ValueError(
                f"Unsupported payer '{payer}'. Known: {list(dispatch)}"
            )
        return fn(internal)

    @classmethod
    def from_payer(cls, payer: str, response: Dict[str, Any]) -> Dict[str, Any]:
        """Route payer wire response → internal field model."""
        dispatch = {
            "UHC":    cls.from_uhc,
            "AETNA":  cls.from_aetna_fhir,
            "CVS":    cls.from_cvs_caremark,
            "CIGNA":  cls.from_cigna,
            "BCBS":   cls.from_bcbs,        # FLS §5.6 — added
        }
        fn = dispatch.get(payer.upper())
        if not fn:
            raise ValueError(
                f"Unsupported payer '{payer}'. Known: {list(dispatch)}"
            )
        return fn(response)
