"""Add users, provider profiles, notifications, and MFA tables.

Revision ID: 002_users_mfa_notifications
Revises: 001_initial_schema
Create Date: 2026-03-11 00:01:00.000000

Creates:
    users                   — system users with RBAC roles
    user_mfa_credentials    — TOTP MFA secrets (SC-001, NFR-101)
    user_sessions           — session tracking for 15-min timeout (NFR-104)
    provider_profiles       — NPI-validated provider records
    notifications           — notification inbox per user (FR-302)
    refresh_tokens          — JWT refresh token store for rotation (SC-006)
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision: str = "002_users_mfa_notifications"
down_revision: str = "001_initial_schema"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:

    # ── users ─────────────────────────────────────────────────────────────────
    # NFR-102: RBAC with principle of least privilege
    op.create_table(
        "users",
        sa.Column("id",           sa.String(36),  primary_key=True),
        sa.Column("username",     sa.String(50),  nullable=False),
        sa.Column("email",        sa.String(200), nullable=False),
        sa.Column("password_hash",sa.String(512), nullable=False),
        sa.Column("full_name",    sa.String(200), nullable=False),

        # RBAC role (NFR-102)
        sa.Column("role",         sa.String(30),  nullable=False),
        # Roles: PROVIDER | REVIEWER | MD_REVIEWER | ADMIN | MEMBER | SUPER_ADMIN

        sa.Column("status",       sa.String(20),  nullable=False,
                  server_default="ACTIVE"),
        # Status: ACTIVE | INACTIVE | LOCKED | PENDING_MFA_SETUP

        # MFA state (SC-001: MFA required for all users)
        sa.Column("mfa_enabled",  sa.Boolean,     nullable=False, server_default="0"),
        sa.Column("mfa_required", sa.Boolean,     nullable=False, server_default="0"),
        # mfa_required=True for REVIEWER, MD_REVIEWER, ADMIN roles

        # Provider-specific
        sa.Column("npi",          sa.String(10),  nullable=True),
        sa.Column("specialty",    sa.String(100), nullable=True),
        sa.Column("tax_id_enc",   sa.String(512), nullable=True),   # encrypted

        # Security tracking
        sa.Column("failed_login_attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_until",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_ip",   sa.String(45),  nullable=True),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),

        # Timestamps
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at",   sa.DateTime(timezone=True), nullable=True),  # soft delete
    )

    op.create_index("uq_users_username", "users", ["username"], unique=True)
    op.create_index("uq_users_email",    "users", ["email"],    unique=True)
    op.create_index("ix_users_role",     "users", ["role"])
    op.create_index("ix_users_status",   "users", ["status"])
    op.create_index("ix_users_npi",      "users", ["npi"])

    # ── user_mfa_credentials ──────────────────────────────────────────────────
    # SC-001: MFA via TOTP (OATH HOTP/TOTP RFC 6238)
    op.create_table(
        "user_mfa_credentials",
        sa.Column("id",          sa.String(36), primary_key=True),
        sa.Column("user_id",     sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),

        # TOTP secret — stored encrypted (SC-006: AES-256)
        sa.Column("totp_secret_enc", sa.String(512), nullable=False),
        # TOTP config
        sa.Column("issuer",      sa.String(100), nullable=False, server_default="PA_System"),
        sa.Column("digits",      sa.Integer,     nullable=False, server_default="6"),
        sa.Column("period",      sa.Integer,     nullable=False, server_default="30"),
        sa.Column("algorithm",   sa.String(10),  nullable=False, server_default="SHA1"),

        # Backup codes (10 single-use recovery codes, stored as encrypted JSON)
        sa.Column("backup_codes_enc",  sa.Text, nullable=True),
        sa.Column("backup_codes_used", sa.Integer, nullable=False, server_default="0"),

        # Setup state
        sa.Column("verified",    sa.Boolean, nullable=False, server_default="0"),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at",  sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("uq_user_mfa_user_id", "user_mfa_credentials", ["user_id"], unique=True)

    # ── user_sessions ─────────────────────────────────────────────────────────
    # NFR-104: Automated session timeout after 15 minutes of inactivity
    op.create_table(
        "user_sessions",
        sa.Column("id",           sa.String(36), primary_key=True),
        sa.Column("user_id",      sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_token_hash", sa.String(512), nullable=False),  # SHA-256 of token

        sa.Column("ip_address",   sa.String(45),  nullable=True),
        sa.Column("user_agent",   sa.String(512), nullable=True),
        sa.Column("device_type",  sa.String(50),  nullable=True),   # WEB | MOBILE | API

        # Timeout management (NFR-104: 15 min inactivity = 900 seconds)
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason",sa.String(50), nullable=True),
        # Revoke reasons: LOGOUT | TIMEOUT | ADMIN_REVOKE | PASSWORD_CHANGE | MFA_RESET
    )

    op.create_index("ix_user_sessions_user_id",  "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at","user_sessions", ["expires_at"])
    op.create_index("uq_user_sessions_token_hash","user_sessions",
                    ["session_token_hash"], unique=True)

    # ── refresh_tokens ────────────────────────────────────────────────────────
    # SC-006: JWT token rotation + revocation
    op.create_table(
        "refresh_tokens",
        sa.Column("id",           sa.String(36), primary_key=True),
        sa.Column("user_id",      sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash",   sa.String(512), nullable=False),  # SHA-256 of raw token
        sa.Column("family_id",    sa.String(36),  nullable=False),  # rotation family (detect reuse)

        sa.Column("issued_at",    sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason",sa.String(50), nullable=True),
        sa.Column("ip_address",   sa.String(45), nullable=True),
        sa.Column("replaced_by",  sa.String(36), nullable=True),  # ID of successor token
    )

    op.create_index("uq_refresh_tokens_hash",    "refresh_tokens", ["token_hash"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_family",  "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_expires", "refresh_tokens", ["expires_at"])

    # ── provider_profiles ─────────────────────────────────────────────────────
    # INT-205: Provider directory with credentialing validation
    op.create_table(
        "provider_profiles",
        sa.Column("id",            sa.String(36),  primary_key=True),
        sa.Column("user_id",       sa.String(36),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("npi",           sa.String(10),  nullable=False),
        sa.Column("name",          sa.String(200), nullable=False),
        sa.Column("specialty",     sa.String(100), nullable=True),
        sa.Column("specialty_taxonomy", sa.String(20), nullable=True),  # NUCC code
        sa.Column("phone",         sa.String(20),  nullable=True),
        sa.Column("fax",           sa.String(20),  nullable=True),
        sa.Column("email",         sa.String(200), nullable=True),

        # Facility affiliation
        sa.Column("facility_name", sa.String(200), nullable=True),
        sa.Column("facility_npi",  sa.String(10),  nullable=True),
        sa.Column("facility_address", sa.Text,     nullable=True),

        # Tax ID (encrypted PHI)
        sa.Column("tax_id_enc",    sa.String(512), nullable=True),

        # Network status (FLS §5.1.4: UHC network check required)
        sa.Column("in_network_uhc",    sa.Boolean, nullable=True),
        sa.Column("in_network_aetna",  sa.Boolean, nullable=True),
        sa.Column("in_network_cigna",  sa.Boolean, nullable=True),
        sa.Column("in_network_humana", sa.Boolean, nullable=True),
        sa.Column("in_network_bcbs",   sa.Boolean, nullable=True),
        sa.Column("network_checked_at",sa.DateTime(timezone=True), nullable=True),

        # Credentialing
        sa.Column("license_state",    sa.String(2),   nullable=True),
        sa.Column("license_number",   sa.String(50),  nullable=True),
        sa.Column("license_expiry",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("dea_number",       sa.String(20),  nullable=True),
        sa.Column("board_certified",  sa.Boolean,     nullable=True),

        sa.Column("active",     sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("uq_provider_profiles_npi", "provider_profiles", ["npi"], unique=True)
    op.create_index("ix_provider_profiles_user_id",  "provider_profiles", ["user_id"])
    op.create_index("ix_provider_profiles_specialty","provider_profiles", ["specialty"])

    # ── notifications ─────────────────────────────────────────────────────────
    # FR-302: Notifications via portal, email, and postal mail
    op.create_table(
        "notifications",
        sa.Column("id",           sa.String(36), primary_key=True),
        sa.Column("recipient_id", sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pa_number",    sa.String(30), nullable=True),
        sa.Column("type",         sa.String(50), nullable=False),
        # Types: PA_APPROVED | PA_DENIED | PA_PENDED | INFO_REQUEST |
        #        APPEAL_DECISION | SLA_WARNING | SYSTEM | STATUS_CHANGE

        sa.Column("channel",      sa.String(20), nullable=False, server_default="PORTAL"),
        # Channels: PORTAL | EMAIL | SMS | POSTAL | EHR

        sa.Column("title",        sa.String(200), nullable=False),
        sa.Column("message",      sa.Text,        nullable=False),
        sa.Column("action_url",   sa.String(500), nullable=True),

        # Delivery state
        sa.Column("read",         sa.Boolean, nullable=False, server_default="0"),
        sa.Column("read_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered",    sa.Boolean, nullable=False, server_default="0"),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivery_error",sa.Text,   nullable=True),
        sa.Column("retry_count",  sa.Integer, nullable=False, server_default="0"),

        # Multi-language (FR-307: English + Spanish minimum)
        sa.Column("language",     sa.String(5), nullable=False, server_default="en"),

        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at",   sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("ix_notifications_recipient_id", "notifications", ["recipient_id"])
    op.create_index("ix_notifications_pa_number",    "notifications", ["pa_number"])
    op.create_index("ix_notifications_type",         "notifications", ["type"])
    op.create_index("ix_notifications_read",         "notifications", ["read"])
    op.create_index("ix_notifications_created_at",   "notifications", ["created_at"])
    # Composite: unread inbox query
    op.create_index("ix_notifications_recipient_read",
                    "notifications", ["recipient_id", "read"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("provider_profiles")
    op.drop_table("refresh_tokens")
    op.drop_table("user_sessions")
    op.drop_table("user_mfa_credentials")
    op.drop_table("users")
