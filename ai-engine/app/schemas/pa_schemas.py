"""
Pydantic v2 schemas for the AI engine.
Covers PA submission, AI analysis request/response, FHIR R4 mappings,
criteria evaluation, and decision outputs.
"""

from __future__ import annotations
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator
import re


# ── Enumerations ──────────────────────────────────────────────────────────────
class UrgencyLevel(str, Enum):
    ROUTINE = "ROUTINE"
    URGENT = "URGENT"
    EMERGENCY = "EMERGENCY"
    EXPEDITED = "EXPEDITED"


class DecisionStatus(str, Enum):
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    PENDED = "PENDED"
    IN_REVIEW = "IN_REVIEW"
    AUTO_APPROVED = "AUTO_APPROVED"
    AUTO_DENIED = "AUTO_DENIED"
    PENDING_INFO = "PENDING_INFO"
    CANCELLED = "CANCELLED"


class ServiceType(str, Enum):
    DIAGNOSTIC_IMAGING = "DIAGNOSTIC_IMAGING"
    SURGICAL_PROCEDURE = "SURGICAL_PROCEDURE"
    SPECIALTY_MEDICATION = "SPECIALTY_MEDICATION"
    PHYSICAL_THERAPY = "PHYSICAL_THERAPY"
    DME = "DME"
    BEHAVIORAL_HEALTH = "BEHAVIORAL_HEALTH"
    INPATIENT = "INPATIENT"
    OUTPATIENT = "OUTPATIENT"
    HOME_HEALTH = "HOME_HEALTH"
    OTHER = "OTHER"


class RouteDecision(str, Enum):
    AUTO_APPROVE = "AUTO_APPROVE"
    AUTO_DENY = "AUTO_DENY"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    ESCALATE = "ESCALATE"  # MD director required


class CriteriaStatus(str, Enum):
    MET = "MET"
    NOT_MET = "NOT_MET"
    PARTIAL = "PARTIAL"
    MISSING_INFO = "MISSING_INFO"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class PayerCode(str, Enum):
    UHC = "UHC"
    AETNA = "AETNA"
    BCBS = "BCBS"
    CIGNA = "CIGNA"
    CVS = "CVS"
    OTHER = "OTHER"


# ── Member / Provider ─────────────────────────────────────────────────────────
class MemberInfo(BaseModel):
    member_id: str = Field(..., description="Payer member ID")
    first_name: str
    last_name: str
    date_of_birth: date
    gender: str = Field(..., pattern="^[MFU]$")
    payer: PayerCode
    plan_id: Optional[str] = None
    group_number: Optional[str] = None

    @field_validator("member_id")
    @classmethod
    def validate_member_id(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("Member ID too short")
        return v.upper().strip()


class ProviderInfo(BaseModel):
    npi: str = Field(..., pattern=r"^\d{10}$", description="10-digit NPI")
    name: str
    specialty: Optional[str] = None
    tax_id: Optional[str] = None
    facility_npi: Optional[str] = None
    facility_name: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    address: Optional[str] = None


# ── Diagnosis / Procedure codes ───────────────────────────────────────────────
class DiagnosisCode(BaseModel):
    code: str = Field(..., description="ICD-10-CM code")
    description: Optional[str] = None
    is_primary: bool = False

    @field_validator("code")
    @classmethod
    def validate_icd10(cls, v: str) -> str:
        v = v.upper().replace(".", "").strip()
        if not re.match(r"^[A-Z]\d{2}[A-Z0-9]{0,7}$", v):
            raise ValueError(f"Invalid ICD-10 code format: {v}")
        return v


class ProcedureCode(BaseModel):
    code: str = Field(..., description="CPT or HCPCS code")
    description: Optional[str] = None
    modifiers: List[str] = Field(default_factory=list)
    units: int = Field(default=1, ge=1)

    @field_validator("code")
    @classmethod
    def validate_procedure(cls, v: str) -> str:
        v = v.upper().strip()
        # CPT: 5 digits; HCPCS Level II: letter + 4 digits
        if not re.match(r"^\d{5}$|^[A-Z]\d{4}$", v):
            raise ValueError(f"Invalid CPT/HCPCS code: {v}")
        return v


# ── Clinical Documentation ────────────────────────────────────────────────────
class ClinicalDocument(BaseModel):
    document_id: str
    document_type: str  # CLINICAL_NOTES, LAB_RESULTS, IMAGING, PRESCRIPTION, etc.
    filename: Optional[str] = None
    s3_key: Optional[str] = None
    extracted_text: Optional[str] = None
    upload_date: Optional[datetime] = None


# ── PA Submission Request ─────────────────────────────────────────────────────
class PASubmissionRequest(BaseModel):
    """Full PA submission — intake to AI engine."""

    # Identifiers
    pa_number: Optional[str] = None  # Set by intake service
    external_ref: Optional[str] = None  # Payer reference if pre-generated

    # Parties
    member: MemberInfo
    provider: ProviderInfo

    # Clinical
    diagnoses: List[DiagnosisCode] = Field(..., min_length=1)
    procedures: List[ProcedureCode] = Field(..., min_length=1)
    service_type: ServiceType
    place_of_service: str = Field(default="11", description="CMS POS code")
    requested_start_date: date
    requested_units: int = Field(default=1, ge=1)
    clinical_summary: str = Field(..., min_length=10, max_length=5000)
    urgency: UrgencyLevel = UrgencyLevel.ROUTINE

    # Supporting documents
    documents: List[ClinicalDocument] = Field(default_factory=list)

    # Payer specifics
    payer_specific_data: Dict[str, Any] = Field(default_factory=dict)

    # Metadata
    submitted_at: Optional[datetime] = None
    source_channel: str = Field(default="PORTAL")  # PORTAL, EHR, FAX, EDI

    @property
    def primary_diagnosis(self) -> DiagnosisCode | None:
        return next(
            (d for d in self.diagnoses if d.is_primary),
            self.diagnoses[0] if self.diagnoses else None,
        )

    @property
    def primary_procedure(self) -> ProcedureCode | None:
        return self.procedures[0] if self.procedures else None


# ── Criteria Evaluation ───────────────────────────────────────────────────────
class CriterionResult(BaseModel):
    criterion_id: str
    criterion_name: str
    guideline_source: str  # MCG, INTERQUAL, CUSTOM
    guideline_version: str
    status: CriteriaStatus
    evidence_text: Optional[str] = None  # extracted from clinical docs
    notes: Optional[str] = None
    weight: float = Field(default=1.0, description="Relative importance 0-2")
    required: bool = True


class CriteriaEvaluation(BaseModel):
    """Full criteria matching result for a PA request."""

    pa_number: str
    guideline_set: str  # e.g. "MCG_2024.1_IMAGING"
    criteria: List[CriterionResult]
    met_count: int
    not_met_count: int
    missing_info_count: int
    overall_status: CriteriaStatus
    missing_info_list: List[str] = Field(default_factory=list)
    evaluated_at: datetime


# ── AI Analysis Response ──────────────────────────────────────────────────────
class AIRecommendation(BaseModel):
    """Core AI decision output."""

    pa_number: str
    confidence_score: float = Field(
        ..., ge=0.0, le=1.0, description="0-1 approval confidence"
    )
    recommendation: str = Field(..., description="APPROVE / DENY / PEND / REQUEST_INFO")
    route_decision: RouteDecision
    reasoning: str = Field(..., description="Human-readable AI rationale")
    criteria_evaluation: CriteriaEvaluation
    supporting_evidence: List[str] = Field(
        default_factory=list, description="Excerpts from clinical docs"
    )
    missing_info: List[str] = Field(
        default_factory=list, description="Gaps blocking approval"
    )
    denial_reasons: List[str] = Field(default_factory=list)
    suggested_alternatives: List[str] = Field(default_factory=list)
    icd10_validation: Dict[str, Any] = Field(default_factory=dict)
    formulary_check: Optional[Dict[str, Any]] = None
    step_therapy_check: Optional[Dict[str, Any]] = None
    model_version: str = "v2.4.1"
    inference_ms: Optional[float] = None
    generated_at: datetime


# ── Auto-Decision Output ──────────────────────────────────────────────────────
class AutoDecisionResult(BaseModel):
    pa_number: str
    decision: DecisionStatus
    auth_number: Optional[str] = None  # Set when auto-approved
    reason_code: Optional[str] = None
    reason_text: str
    confidence: float
    decided_at: datetime
    is_auto: bool = True
    requires_md: bool = False  # True when auto-deny attempted


# ── Document Processing ───────────────────────────────────────────────────────
class DocumentExtractionRequest(BaseModel):
    document_id: str
    s3_key: str
    doc_type: str
    pa_number: str


class DocumentExtractionResult(BaseModel):
    document_id: str
    pa_number: str
    raw_text: str
    extracted_fields: Dict[str, Any]
    diagnoses_found: List[str]
    procedures_found: List[str]
    medications_found: List[str]
    lab_values: Dict[str, Any]
    confidence: float
    ocr_required: bool
    processing_ms: float


# ── FHIR R4 mapping helpers ───────────────────────────────────────────────────
class FHIRClaimRequest(BaseModel):
    """Minimal FHIR R4 ClaimResponse-compatible output for EHR push-back."""

    resourceType: str = "ClaimResponse"
    id: str
    status: str
    use: str = "preauthorization"
    outcome: str  # complete / error / queued
    disposition: Optional[str] = None
    preAuthRef: Optional[str] = None  # auth number
    preAuthPeriod: Optional[Dict[str, str]] = None


# ── Eligibility ───────────────────────────────────────────────────────────────
class EligibilityRequest(BaseModel):
    member_id: str
    payer: PayerCode
    date_of_service: date
    service_type: Optional[ServiceType] = None
    provider_npi: Optional[str] = None


class EligibilityResult(BaseModel):
    member_id: str
    payer: PayerCode
    is_eligible: bool
    plan_name: Optional[str] = None
    coverage_start: Optional[date] = None
    coverage_end: Optional[date] = None
    deductible_met: Optional[bool] = None
    copay: Optional[float] = None
    requires_pa: bool = True
    coverage_details: Dict[str, Any] = Field(default_factory=dict)
    checked_at: datetime


# ── Notification ──────────────────────────────────────────────────────────────
class NotificationPayload(BaseModel):
    pa_number: str
    event_type: str  # DECISION_READY, INFO_REQUESTED, SLA_WARNING, etc.
    recipient_type: str  # PROVIDER, MEMBER, ADMIN
    recipient_id: str
    channel: str  # EMAIL, SMS, PORTAL
    template_id: str
    template_vars: Dict[str, Any] = Field(default_factory=dict)
    priority: str = "NORMAL"  # HIGH for urgent/SLA
