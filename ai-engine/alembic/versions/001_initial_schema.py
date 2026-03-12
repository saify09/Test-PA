"""Initial schema — create all PA system tables.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-03-11 00:00:00.000000

Creates:
    pa_cases          — core PA request records (PHI encrypted at rest)
    pa_decisions      — reviewer/AI decisions for each case
    pa_appeals        — appeal submissions and outcomes
    audit_logs        — immutable HIPAA audit trail (§164.312)

All PHI columns are AES-256 encrypted at the application layer before
storage (TR-205). The database stores ciphertext only.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# ── Revision identifiers ──────────────────────────────────────────────────────
revision: str = "001_initial_schema"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ── pa_cases ──────────────────────────────────────────────────────────────
    op.create_table(
        "pa_cases",
        sa.Column("id",            sa.String(36),  primary_key=True),
        sa.Column("pa_number",     sa.String(30),  nullable=False),

        # Member — encrypted PHI (TR-205: AES-256 at rest)
        sa.Column("member_id_enc",    sa.String(512), nullable=False),
        sa.Column("member_name_enc",  sa.String(512), nullable=False),
        sa.Column("member_dob_enc",   sa.String(512), nullable=False),
        sa.Column("payer",            sa.String(20),  nullable=False),

        # Provider
        sa.Column("provider_npi",     sa.String(10),  nullable=False),
        sa.Column("provider_name",    sa.String(200), nullable=True),

        # Clinical (non-PHI)
        sa.Column("primary_diagnosis_code", sa.String(20), nullable=False),
        sa.Column("primary_procedure_code", sa.String(20), nullable=False),
        sa.Column("service_type",           sa.String(50), nullable=False),
        sa.Column("urgency",                sa.String(20), nullable=False,
                  server_default="ROUTINE"),
        sa.Column("requested_units",        sa.Integer,    nullable=False,
                  server_default="1"),
        sa.Column("requested_start_date",   sa.DateTime(timezone=True), nullable=True),

        # Encrypted PHI blobs
        sa.Column("clinical_summary_enc",    sa.Text, nullable=True),
        sa.Column("submission_payload_enc",  sa.Text, nullable=True),

        # Workflow status
        sa.Column("status",              sa.String(30), nullable=False,
                  server_default="SUBMITTED"),
        sa.Column("assigned_reviewer_id", sa.String(36), nullable=True),
        sa.Column("sla_deadline",        sa.DateTime(timezone=True), nullable=True),

        # AI scoring
        sa.Column("ai_confidence",        sa.Float,   nullable=True),
        sa.Column("ai_recommendation",    sa.String(20), nullable=True),
        sa.Column("ai_route_decision",    sa.String(20), nullable=True),
        sa.Column("ai_analysis_json",     sa.Text,    nullable=True),

        # Timestamps
        sa.Column("submitted_at",    sa.DateTime(timezone=True), nullable=False),
        sa.Column("ai_processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_at",     sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at",      sa.DateTime(timezone=True), nullable=False),
    )

    # Unique + basic indexes
    op.create_index("uq_pa_cases_pa_number", "pa_cases", ["pa_number"], unique=True)
    op.create_index("ix_pa_cases_payer",     "pa_cases", ["payer"])
    op.create_index("ix_pa_cases_status",    "pa_cases", ["status"])
    op.create_index("ix_pa_cases_provider_npi",        "pa_cases", ["provider_npi"])
    op.create_index("ix_pa_cases_primary_diagnosis_code", "pa_cases", ["primary_diagnosis_code"])
    op.create_index("ix_pa_cases_primary_procedure_code", "pa_cases", ["primary_procedure_code"])
    op.create_index("ix_pa_cases_service_type",        "pa_cases", ["service_type"])
    op.create_index("ix_pa_cases_urgency",             "pa_cases", ["urgency"])
    op.create_index("ix_pa_cases_assigned_reviewer_id","pa_cases", ["assigned_reviewer_id"])
    # Composite indexes for common query patterns
    op.create_index("ix_pa_cases_payer_status",  "pa_cases", ["payer", "status"])
    op.create_index("ix_pa_cases_submitted_at",  "pa_cases", ["submitted_at"])

    # ── pa_decisions ──────────────────────────────────────────────────────────
    op.create_table(
        "pa_decisions",
        sa.Column("id",       sa.String(36), primary_key=True),
        sa.Column("case_id",  sa.String(36),
                  sa.ForeignKey("pa_cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pa_number", sa.String(30), nullable=False),

        # Core decision
        sa.Column("decision",    sa.String(30), nullable=False),
        sa.Column("is_auto",     sa.Boolean,    nullable=False, server_default="0"),

        # Authorization details (issued on APPROVED)
        sa.Column("auth_number",     sa.String(40), nullable=True),
        sa.Column("auth_start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auth_end_date",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_units",  sa.Integer,    nullable=True),

        # Denial
        sa.Column("denial_reason_code", sa.String(20), nullable=True),
        sa.Column("denial_reason_text", sa.Text,        nullable=True),

        # Reviewer attribution (FR-204: MD co-sign required for denials)
        sa.Column("reviewer_id",    sa.String(36),  nullable=True),
        sa.Column("reviewer_name",  sa.String(200), nullable=True),
        sa.Column("reviewer_notes", sa.Text,        nullable=True),
        sa.Column("md_cosign_id",   sa.String(36),  nullable=True),

        # AI agreement tracking (KPI-201, FR-207)
        sa.Column("ai_agreed",                 sa.Boolean, nullable=True),
        sa.Column("ai_confidence_at_decision", sa.Float,   nullable=True),

        # Payer submission (FLS §5.x)
        sa.Column("payer_auth_number",    sa.String(50), nullable=True),
        sa.Column("payer_response_json",  sa.Text,       nullable=True),
        sa.Column("payer_submitted_at",   sa.DateTime(timezone=True), nullable=True),

        # Timestamps
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("ix_pa_decisions_case_id",   "pa_decisions", ["case_id"])
    op.create_index("ix_pa_decisions_pa_number", "pa_decisions", ["pa_number"])
    op.create_index("ix_pa_decisions_decision",  "pa_decisions", ["decision"])
    op.create_index("ix_pa_decisions_decided_at","pa_decisions", ["decided_at"])

    # ── pa_appeals ────────────────────────────────────────────────────────────
    op.create_table(
        "pa_appeals",
        sa.Column("id",           sa.String(36), primary_key=True),
        sa.Column("appeal_number",sa.String(30), nullable=False),
        sa.Column("case_id",      sa.String(36),
                  sa.ForeignKey("pa_cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_decision_id", sa.String(36),
                  sa.ForeignKey("pa_decisions.id"), nullable=False),

        # Appeal attributes
        sa.Column("appeal_type",    sa.String(20), nullable=False),  # STANDARD, EXPEDITED, EXTERNAL
        sa.Column("status",         sa.String(30), nullable=False, server_default="SUBMITTED"),
        sa.Column("reason_text",    sa.Text,       nullable=False),
        sa.Column("additional_info",sa.Text,       nullable=True),
        sa.Column("documents_json", sa.Text,       nullable=True),

        # Independent reviewer (FR-403)
        sa.Column("reviewer_id",    sa.String(36), nullable=True),
        sa.Column("decision",       sa.String(30), nullable=True),
        sa.Column("decision_notes", sa.Text,       nullable=True),
        sa.Column("overturned",     sa.Boolean,    nullable=True),

        # SLA deadlines (FR-402: 30-day standard, 72-hour expedited)
        sa.Column("regulatory_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at",          sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at",        sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at",          sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("uq_pa_appeals_appeal_number", "pa_appeals", ["appeal_number"], unique=True)
    op.create_index("ix_pa_appeals_case_id",       "pa_appeals", ["case_id"])
    op.create_index("ix_pa_appeals_status",        "pa_appeals", ["status"])
    op.create_index("ix_pa_appeals_submitted_at",  "pa_appeals", ["submitted_at"])

    # ── audit_logs ────────────────────────────────────────────────────────────
    # HIPAA §164.312(b): Implement hardware, software, and/or procedural
    # mechanisms that record and examine activity. Must be immutable.
    op.create_table(
        "audit_logs",
        sa.Column("id",          sa.String(36), primary_key=True),
        sa.Column("case_id",     sa.String(36),
                  sa.ForeignKey("pa_cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("pa_number",   sa.String(30), nullable=True),

        # Actor attribution
        sa.Column("user_id",     sa.String(36),  nullable=True),
        sa.Column("user_name",   sa.String(200), nullable=True),
        sa.Column("user_role",   sa.String(50),  nullable=True),

        # Event
        sa.Column("action",      sa.String(50), nullable=False),
        sa.Column("resource",    sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("details",     sa.Text,        nullable=True),

        # Network context (HIPAA: log IP for all PHI access)
        sa.Column("ip_address",  sa.String(45),  nullable=True),   # IPv6 max = 45 chars
        sa.Column("user_agent",  sa.String(512), nullable=True),
        sa.Column("result",      sa.String(20),  nullable=False, server_default="SUCCESS"),

        # PHI access tracking (HIPAA §164.528 accounting of disclosures)
        sa.Column("phi_accessed", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("phi_fields",   sa.String(500), nullable=True),

        # Timestamp (immutable — never updated)
        sa.Column("timestamp",   sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("ix_audit_logs_case_id",          "audit_logs", ["case_id"])
    op.create_index("ix_audit_logs_pa_number",        "audit_logs", ["pa_number"])
    op.create_index("ix_audit_logs_user_id",          "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action",           "audit_logs", ["action"])
    op.create_index("ix_audit_logs_timestamp",        "audit_logs", ["timestamp"])
    op.create_index("ix_audit_logs_phi_accessed",     "audit_logs", ["phi_accessed"])
    # Composite for common HIPAA audit queries
    op.create_index("ix_audit_logs_user_timestamp",   "audit_logs", ["user_id", "timestamp"])
    op.create_index("ix_audit_logs_action_timestamp", "audit_logs", ["action", "timestamp"])


def downgrade() -> None:
    # Drop in reverse FK dependency order
    op.drop_table("audit_logs")
    op.drop_table("pa_appeals")
    op.drop_table("pa_decisions")
    op.drop_table("pa_cases")
