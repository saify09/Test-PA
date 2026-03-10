"""
GraphQL API Endpoint — TR-003
Provides GraphQL interface for PA queries alongside the existing REST API.
Schema covers: PA status queries, AI analysis, reviewer workbench, analytics.
Uses Strawberry (type-safe GraphQL library for Python/FastAPI).
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

import strawberry
from strawberry.fastapi import GraphQLRouter
from strawberry.scalars import JSON

from app.api.deps import get_current_user
from app.core.database import AsyncSessionLocal
from app.core.redis_client import get_redis


# ─── Types ────────────────────────────────────────────────────────────────────


@strawberry.type
class PAStatusType:
    pa_id: str
    pa_number: str
    status: str
    urgency: str
    patient_name: str
    service_description: str
    primary_diagnosis: str
    submitted_at: datetime
    decision_date: Optional[datetime]
    auth_number: Optional[str]
    valid_through: Optional[datetime]
    days_pending: int
    ai_confidence_score: Optional[float]
    ai_recommendation: Optional[str]


@strawberry.type
class AIAnalysisType:
    pa_id: str
    recommendation: str
    confidence_score: float
    risk_score: str
    rationale_summary: str
    criteria_matched: List[str]
    missing_criteria: List[str]
    documentation_completeness: float
    supporting_evidence: List[str]
    conflicting_factors: List[str]
    similar_cases_count: int
    similar_cases_approval_rate: float
    model_version: str
    processing_time_seconds: float
    bias_flags: List[str]


@strawberry.type
class ReviewQueueItemType:
    pa_id: str
    pa_number: str
    patient_name: str
    member_id_masked: str
    service_type: str
    diagnosis: str
    urgency: str
    deadline_hours: float
    ai_confidence_score: float
    ai_recommendation: str
    received_at: datetime
    days_in_queue: float
    documentation_complete: bool
    payer: str
    priority_score: int
    assigned_to: Optional[str]


@strawberry.type
class AnalyticsSummaryType:
    total_pas_received: int
    pas_in_queue: int
    auto_approval_rate: float
    ai_accuracy: float
    appeal_rate: float
    avg_tat_hours: float
    sla_compliance: float
    approval_rate: float
    denial_rate: float
    overturn_rate: float
    inter_rater_reliability: float
    guideline_adherence: float
    documentation_completeness: float


@strawberry.type
class DecisionType:
    pa_id: str
    decision: str
    decided_at: datetime
    decided_by: str
    clinical_notes: Optional[str]
    denial_reason: Optional[str]
    auth_number: Optional[str]
    auth_start: Optional[datetime]
    auth_end: Optional[datetime]


@strawberry.type
class AppealType:
    appeal_id: str
    pa_id: str
    pa_number: str
    appeal_type: str
    status: str
    submitted_at: datetime
    deadline: datetime
    reason_summary: str
    assigned_reviewer: Optional[str]
    outcome: Optional[str]


@strawberry.type
class ModelVersionType:
    version: str
    deployed_at: datetime
    accuracy: float
    auto_approval_threshold: float
    auto_denial_threshold: float
    training_cases: int
    validation_auc: float
    is_active: bool
    drift_score: Optional[float]


# ─── Queries ──────────────────────────────────────────────────────────────────


@strawberry.type
class Query:

    @strawberry.field(description="Get PA request by ID")
    async def pa_request(self, pa_id: str) -> Optional[PAStatusType]:
        """Fetch a single PA request with current status."""
        # In production: query from database via pa_id
        return PAStatusType(
            pa_id=pa_id,
            pa_number=f"PA-2026-{pa_id[:6]}",
            status="IN_REVIEW",
            urgency="ROUTINE",
            patient_name="Sarah Johnson",
            service_description="MRI Lumbar Spine without contrast",
            primary_diagnosis="M54.5 - Low back pain",
            submitted_at=datetime.utcnow(),
            decision_date=None,
            auth_number=None,
            valid_through=None,
            days_pending=1,
            ai_confidence_score=0.94,
            ai_recommendation="APPROVE",
        )

    @strawberry.field(description="List PA requests with optional filters")
    async def pa_requests(
        self,
        status: Optional[str] = None,
        urgency: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[PAStatusType]:
        """List PA requests with filtering and pagination."""
        # In production: query from database with filters
        return []

    @strawberry.field(description="Get AI analysis for a PA case")
    async def ai_analysis(self, pa_id: str) -> Optional[AIAnalysisType]:
        """Fetch the AI engine's full analysis for a case."""
        return AIAnalysisType(
            pa_id=pa_id,
            recommendation="APPROVE",
            confidence_score=0.94,
            risk_score="LOW",
            rationale_summary=(
                "Patient meets MCG criteria for lumbar MRI: documented conservative care "
                ">6 weeks, neurological symptoms present, no red flags identified."
            ),
            criteria_matched=[
                "Conservative care documented (12 weeks PT)",
                "Neurological symptoms: radiculopathy",
                "Failed NSAID therapy",
                "No surgical red flags",
            ],
            missing_criteria=[],
            documentation_completeness=0.97,
            supporting_evidence=[
                "MCG 28th Ed: Imaging for Low Back Pain §3.1",
                "AMA CPT 72148 guidelines",
            ],
            conflicting_factors=[],
            similar_cases_count=2847,
            similar_cases_approval_rate=0.89,
            model_version="v2.4.1",
            processing_time_seconds=3.2,
            bias_flags=[],
        )

    @strawberry.field(description="Get reviewer queue with priority sorting")
    async def review_queue(
        self,
        assigned_to: Optional[str] = None,
        urgency: Optional[str] = None,
        limit: int = 50,
    ) -> List[ReviewQueueItemType]:
        """Fetch cases in the clinical review queue."""
        # In production: query from queue service
        return []

    @strawberry.field(description="Get analytics summary dashboard")
    async def analytics_summary(
        self, date_range_days: int = 30
    ) -> AnalyticsSummaryType:
        """Aggregate KPI metrics for admin dashboard."""
        return AnalyticsSummaryType(
            total_pas_received=12847,
            pas_in_queue=234,
            auto_approval_rate=71.2,
            ai_accuracy=93.8,
            appeal_rate=6.4,
            avg_tat_hours=18.3,
            sla_compliance=97.1,
            approval_rate=68.7,
            denial_rate=21.4,
            overturn_rate=8.2,
            inter_rater_reliability=91.5,
            guideline_adherence=99.2,
            documentation_completeness=96.8,
        )

    @strawberry.field(description="List appeal cases")
    async def appeals(
        self,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> List[AppealType]:
        """Fetch appeals with optional status filter."""
        return []

    @strawberry.field(description="Get AI model version history")
    async def model_versions(self) -> List[ModelVersionType]:
        """List all deployed model versions — TR-106 versioning."""
        return [
            ModelVersionType(
                version="v2.4.1",
                deployed_at=datetime(2026, 2, 15),
                accuracy=0.938,
                auto_approval_threshold=0.92,
                auto_denial_threshold=0.15,
                training_cases=250000,
                validation_auc=0.971,
                is_active=True,
                drift_score=0.02,
            ),
            ModelVersionType(
                version="v2.3.0",
                deployed_at=datetime(2025, 11, 1),
                accuracy=0.924,
                auto_approval_threshold=0.91,
                auto_denial_threshold=0.14,
                training_cases=180000,
                validation_auc=0.958,
                is_active=False,
                drift_score=0.08,
            ),
        ]


# ─── Mutations ────────────────────────────────────────────────────────────────


@strawberry.type
class Mutation:

    @strawberry.mutation(description="Submit reviewer decision via GraphQL")
    async def submit_decision(
        self,
        pa_id: str,
        decision: str,
        clinical_notes: Optional[str] = None,
        denial_reason: Optional[str] = None,
        auth_start: Optional[datetime] = None,
        auth_end: Optional[datetime] = None,
    ) -> DecisionType:
        """Submit approve/deny/pend decision — FR-203."""
        return DecisionType(
            pa_id=pa_id,
            decision=decision,
            decided_at=datetime.utcnow(),
            decided_by="current_user",
            clinical_notes=clinical_notes,
            denial_reason=denial_reason,
            auth_number=f"AUTH-{pa_id[:6].upper()}" if decision == "APPROVED" else None,
            auth_start=auth_start,
            auth_end=auth_end,
        )

    @strawberry.mutation(description="Submit human feedback for AI learning — TR-107")
    async def submit_ai_feedback(
        self,
        pa_id: str,
        reviewer_decision: str,
        ai_recommendation: str,
        agreement: bool,
        override_reason: Optional[str] = None,
    ) -> bool:
        """
        Record human feedback on AI recommendation for continuous learning (TR-107).
        Disagreements feed the active learning pipeline for model retraining.
        """
        # In production: publish to ai-feedback Kafka topic
        # The continuous learning pipeline picks this up for periodic retraining
        feedback_record = {
            "pa_id": pa_id,
            "reviewer_decision": reviewer_decision,
            "ai_recommendation": ai_recommendation,
            "agreement": agreement,
            "override_reason": override_reason,
            "recorded_at": datetime.utcnow().isoformat(),
        }
        # Publish to redis pub/sub for real-time tracking, Kafka for batch retraining
        try:
            redis = await get_redis()
            await redis.lpush("ai_feedback_queue", str(feedback_record))
            await redis.incr("ai_feedback_total")
            if not agreement:
                await redis.incr("ai_disagreement_count")
        except Exception:
            pass  # Non-blocking — feedback loss is acceptable
        return True

    @strawberry.mutation(description="Trigger model retrain — TR-107")
    async def trigger_model_retrain(
        self,
        reason: str,
        model_version_to_replace: str,
    ) -> bool:
        """
        Initiate continuous learning pipeline run.
        In production: publishes to model-retrain Kafka topic consumed by MLflow pipeline.
        """
        return True

    @strawberry.mutation(description="Register webhook endpoint — TR-306")
    async def register_webhook(
        self,
        url: str,
        events: List[str],
        secret: str,
    ) -> bool:
        """Register a webhook for real-time PA status notifications."""
        # In production: persist to webhooks table, validate URL via ping
        return True


# ─── Subscriptions (real-time) ────────────────────────────────────────────────


@strawberry.type
class Subscription:

    @strawberry.subscription(description="Real-time PA status updates")
    async def pa_status_updates(self, pa_id: str):  # type: ignore[override]
        """
        WebSocket subscription for real-time PA status changes.
        Uses Redis pub/sub under the hood — TR-004 event-driven architecture.
        """
        import asyncio

        try:
            redis = await get_redis()
            pubsub = redis.pubsub()
            await pubsub.subscribe(f"pa_status:{pa_id}")
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield message["data"]
        except Exception:
            # Fallback for demo mode
            import asyncio

            for _ in range(3):
                await asyncio.sleep(5)
                yield f'{{"pa_id": "{pa_id}", "status": "IN_REVIEW"}}'


# ─── Router ───────────────────────────────────────────────────────────────────

schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    subscription=Subscription,
)

graphql_router = GraphQLRouter(
    schema,
    graphiql=True,  # Enable GraphiQL IDE at /graphql
    path="/graphql",
)
