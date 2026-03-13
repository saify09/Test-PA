"""SQLAlchemy 2.0 ORM models — all PHI fields AES-256 encrypted at rest."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Integer, Float, Boolean, DateTime, Text, JSON,
    ForeignKey, Index, Enum as SAEnum, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.schemas.pa_schemas import DecisionStatus, UrgencyLevel, ServiceType, PayerCode


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ── PA Case ───────────────────────────────────────────────────────────────────
class PACase(Base):
    __tablename__ = "pa_cases"

    id:             Mapped[str]  = mapped_column(String(36), primary_key=True, default=new_uuid)
    pa_number:      Mapped[str]  = mapped_column(String(30), unique=True, index=True, nullable=False)

    # Member (encrypted PHI)
    member_id_enc:    Mapped[str]  = mapped_column(String(512), nullable=False)   # encrypted
    member_name_enc:  Mapped[str]  = mapped_column(String(512), nullable=False)   # encrypted
    member_dob_enc:   Mapped[str]  = mapped_column(String(512), nullable=False)   # encrypted
    payer:            Mapped[str]  = mapped_column(String(20), nullable=False, index=True)

    # Provider
    provider_npi:     Mapped[str]  = mapped_column(String(10), nullable=False, index=True)
    provider_name:    Mapped[Optional[str]] = mapped_column(String(200))

    # Clinical
    primary_diagnosis_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    primary_procedure_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    service_type:     Mapped[str]  = mapped_column(String(50), nullable=False, index=True)
    urgency:          Mapped[str]  = mapped_column(String(20), default="ROUTINE", index=True)
    requested_units:  Mapped[int]  = mapped_column(Integer, default=1)
    requested_start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    clinical_summary_enc: Mapped[Optional[str]] = mapped_column(Text)   # encrypted

    # All raw JSON payload (encrypted)
    submission_payload_enc: Mapped[Optional[str]] = mapped_column(Text)

    # Status / routing
    status:           Mapped[str]  = mapped_column(String(30), default="SUBMITTED", index=True)
    assigned_reviewer_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)
    sla_deadline:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # AI output
    ai_confidence:    Mapped[Optional[float]] = mapped_column(Float)
    ai_recommendation:Mapped[Optional[str]]   = mapped_column(String(20))
    ai_route_decision:Mapped[Optional[str]]   = mapped_column(String(20))
    ai_analysis_json: Mapped[Optional[str]]   = mapped_column(Text)  # full AIRecommendation JSON

    # Timestamps
    submitted_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ai_processed_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decision_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at:       Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:       Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    decisions: Mapped[list["PADecision"]] = relationship(back_populates="case", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="case")

    __table_args__ = (
        Index("ix_pa_cases_payer_status", "payer", "status"),
        Index("ix_pa_cases_submitted_at", "submitted_at"),
    )


# ── PA Decision ───────────────────────────────────────────────────────────────
class PADecision(Base):
    __tablename__ = "pa_decisions"

    id:             Mapped[str]  = mapped_column(String(36), primary_key=True, default=new_uuid)
    case_id:        Mapped[str]  = mapped_column(ForeignKey("pa_cases.id"), nullable=False, index=True)
    pa_number:      Mapped[str]  = mapped_column(String(30), nullable=False, index=True)

    decision:       Mapped[str]  = mapped_column(String(30), nullable=False)
    is_auto:        Mapped[bool] = mapped_column(Boolean, default=False)
    auth_number:    Mapped[Optional[str]] = mapped_column(String(40))   # issued on approval
    auth_start_date:Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    auth_end_date:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_units: Mapped[Optional[int]] = mapped_column(Integer)

    # Denial
    denial_reason_code: Mapped[Optional[str]] = mapped_column(String(20))
    denial_reason_text: Mapped[Optional[str]] = mapped_column(Text)

    # Reviewer
    reviewer_id:    Mapped[Optional[str]] = mapped_column(String(36))
    reviewer_name:  Mapped[Optional[str]] = mapped_column(String(200))
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text)
    md_cosign_id:   Mapped[Optional[str]] = mapped_column(String(36))   # Required for denials

    # AI agreement tracking
    ai_agreed:      Mapped[Optional[bool]] = mapped_column(Boolean)
    ai_confidence_at_decision: Mapped[Optional[float]] = mapped_column(Float)

    # Payer response
    payer_auth_number: Mapped[Optional[str]] = mapped_column(String(50))
    payer_response_json: Mapped[Optional[str]] = mapped_column(Text)
    payer_submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    decided_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationship
    case: Mapped["PACase"] = relationship(back_populates="decisions")


# ── Appeal ────────────────────────────────────────────────────────────────────
class PAAppeal(Base):
    __tablename__ = "pa_appeals"

    id:             Mapped[str]  = mapped_column(String(36), primary_key=True, default=new_uuid)
    appeal_number:  Mapped[str]  = mapped_column(String(30), unique=True, index=True)
    case_id:        Mapped[str]  = mapped_column(ForeignKey("pa_cases.id"), nullable=False, index=True)
    original_decision_id: Mapped[str] = mapped_column(ForeignKey("pa_decisions.id"), nullable=False)

    appeal_type:    Mapped[str]  = mapped_column(String(20))  # STANDARD, EXPEDITED, EXTERNAL
    status:         Mapped[str]  = mapped_column(String(30), default="SUBMITTED", index=True)
    reason_text:    Mapped[str]  = mapped_column(Text, nullable=False)
    additional_info:Mapped[Optional[str]] = mapped_column(Text)
    documents_json: Mapped[Optional[str]] = mapped_column(Text)

    # Reviewer (must differ from original)
    reviewer_id:    Mapped[Optional[str]] = mapped_column(String(36))
    decision:       Mapped[Optional[str]] = mapped_column(String(30))
    decision_notes: Mapped[Optional[str]] = mapped_column(Text)
    overturned:     Mapped[Optional[bool]] = mapped_column(Boolean)

    # Deadlines
    regulatory_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decided_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    submitted_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ── Audit Log ─────────────────────────────────────────────────────────────────
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id:             Mapped[str]  = mapped_column(String(36), primary_key=True, default=new_uuid)
    case_id:        Mapped[Optional[str]] = mapped_column(ForeignKey("pa_cases.id"), index=True)
    pa_number:      Mapped[Optional[str]] = mapped_column(String(30), index=True)

    user_id:        Mapped[Optional[str]] = mapped_column(String(36), index=True)
    user_name:      Mapped[Optional[str]] = mapped_column(String(200))
    user_role:      Mapped[Optional[str]] = mapped_column(String(50))
    action:         Mapped[str]  = mapped_column(String(50), nullable=False, index=True)
    resource:       Mapped[str]  = mapped_column(String(50), nullable=False)
    resource_id:    Mapped[Optional[str]] = mapped_column(String(100))
    details:        Mapped[Optional[str]] = mapped_column(Text)
    ip_address:     Mapped[Optional[str]] = mapped_column(String(45))
    user_agent:     Mapped[Optional[str]] = mapped_column(String(512))
    result:         Mapped[str]  = mapped_column(String(20), default="SUCCESS")
    timestamp:      Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    # PHI access tracking (HIPAA §164.312)
    phi_accessed:   Mapped[bool] = mapped_column(Boolean, default=False)
    phi_fields:     Mapped[Optional[str]] = mapped_column(String(500))

    case: Mapped[Optional["PACase"]] = relationship(back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_logs_user_timestamp", "user_id", "timestamp"),
        Index("ix_audit_logs_action_timestamp", "action", "timestamp"),
    )
