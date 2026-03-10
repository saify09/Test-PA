"""
AutoDecisionService — executes auto-approve / auto-deny when thresholds met.
Payer integration handled separately in microservices; this module manages
the decision state machine and auth number generation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.core.config import settings
from app.schemas.pa_schemas import (
    AIRecommendation,
    AutoDecisionResult,
    DecisionStatus,
    PASubmissionRequest,
    RouteDecision,
)

log = structlog.get_logger(__name__)


def _gen_auth_number(payer: str) -> str:
    """Generate authorization number in payer-standard format."""
    prefix = {
        "UHC": "UHC",
        "AETNA": "AET",
        "BCBS": "BCB",
        "CIGNA": "CGN",
        "CVS": "CVS",
    }.get(payer, "AUTH")
    return f"{prefix}{datetime.now().strftime('%Y%m%d')}{uuid.uuid4().hex[:6].upper()}"


class AutoDecisionService:
    """
    Executes auto-approve / auto-deny decisions based on AI confidence output.
    All auto-decisions are logged to audit trail (HIPAA §164.312).
    """

    @classmethod
    async def evaluate(
        cls,
        submission: PASubmissionRequest,
        ai_result: AIRecommendation,
    ) -> AutoDecisionResult:
        route = ai_result.route_decision
        confidence = ai_result.confidence_score
        payer = submission.member.payer.value

        now = datetime.now(timezone.utc)

        if route == RouteDecision.AUTO_APPROVE:
            auth_num = _gen_auth_number(payer)
            log.info(
                "auto_decision.approved",
                pa=submission.pa_number,
                confidence=confidence,
                auth=auth_num,
            )
            return AutoDecisionResult(
                pa_number=submission.pa_number or "",
                decision=DecisionStatus.AUTO_APPROVED,
                auth_number=auth_num,
                reason_code="AUTO_CRITERIA_MET",
                reason_text=(
                    f"All required clinical criteria met with {confidence:.0%} confidence. "
                    f"Authorization {auth_num} issued automatically per system policy."
                ),
                confidence=confidence,
                decided_at=now,
                is_auto=True,
                requires_md=False,
            )

        if route == RouteDecision.AUTO_DENY:
            # Auto-deny always requires MD co-sign — flag it
            log.info(
                "auto_decision.deny_pending_md",
                pa=submission.pa_number,
                confidence=confidence,
            )
            return AutoDecisionResult(
                pa_number=submission.pa_number or "",
                decision=DecisionStatus.IN_REVIEW,  # Stays in review until MD signs
                auth_number=None,
                reason_code="AUTO_DENY_PENDING_MD",
                reason_text=(
                    f"AI confidence {confidence:.0%} below denial threshold. "
                    "Denial requires Medical Director co-signature before finalisation."
                ),
                confidence=confidence,
                decided_at=now,
                is_auto=True,
                requires_md=True,
            )

        if route == RouteDecision.ESCALATE:
            log.info(
                "auto_decision.escalated",
                pa=submission.pa_number,
                confidence=confidence,
            )
            return AutoDecisionResult(
                pa_number=submission.pa_number or "",
                decision=DecisionStatus.IN_REVIEW,
                reason_code="ESCALATED_MD",
                reason_text=(
                    "Case escalated to Medical Director review due to complexity, "
                    "urgency level, or low AI confidence."
                ),
                confidence=confidence,
                decided_at=now,
                is_auto=False,
                requires_md=True,
            )

        # HUMAN_REVIEW — no auto-decision, assign to queue
        log.info(
            "auto_decision.human_review_queued",
            pa=submission.pa_number,
            confidence=confidence,
        )
        return AutoDecisionResult(
            pa_number=submission.pa_number or "",
            decision=DecisionStatus.IN_REVIEW,
            reason_code="HUMAN_REVIEW_REQUIRED",
            reason_text=(
                f"AI confidence {confidence:.0%} in human-review band "
                f"({settings.AUTO_DENY_THRESHOLD:.0%}–{settings.AUTO_APPROVE_THRESHOLD:.0%}). "
                "Assigned to clinical reviewer queue."
            ),
            confidence=confidence,
            decided_at=now,
            is_auto=False,
            requires_md=False,
        )

    @staticmethod
    def compute_sla_deadline(submission: PASubmissionRequest) -> datetime:
        """Compute regulatory SLA deadline from urgency level."""
        from app.schemas.pa_schemas import UrgencyLevel

        now = datetime.now(timezone.utc)
        hours = {
            UrgencyLevel.EMERGENCY: 24,
            UrgencyLevel.URGENT: 24,
            UrgencyLevel.EXPEDITED: 72,
            UrgencyLevel.ROUTINE: 72,
        }.get(submission.urgency, 72)
        return now + timedelta(hours=hours)
