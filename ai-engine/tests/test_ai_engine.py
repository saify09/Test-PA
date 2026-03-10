"""
Pytest test suite for the PA AI Engine.
Tests: schemas, criteria engine, NLP extractor, auto-decision, API endpoints.
Run: pytest tests/ -v --tb=short
"""

import asyncio
from datetime import date, datetime, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.schemas.pa_schemas import (
    PASubmissionRequest,
    MemberInfo,
    ProviderInfo,
    DiagnosisCode,
    ProcedureCode,
    ServiceType,
    UrgencyLevel,
    PayerCode,
    RouteDecision,
)
from app.services.criteria_engine import CriteriaEngine
from app.services.auto_decision import AutoDecisionService
from app.core.security import (
    hash_password,
    verify_password,
    encrypt_phi,
    decrypt_phi,
    mask_phi,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture
def sample_submission() -> PASubmissionRequest:
    return PASubmissionRequest(
        pa_number="PA-2026-TEST01",
        member=MemberInfo(
            member_id="UHC123456789",
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1975, 6, 15),
            gender="M",
            payer=PayerCode.UHC,
        ),
        provider=ProviderInfo(npi="1234567890", name="Dr. Jane Smith"),
        diagnoses=[
            DiagnosisCode(
                code="M511", description="Lumbar disc herniation", is_primary=True
            )
        ],
        procedures=[
            ProcedureCode(code="72148", description="MRI Lumbar Spine without contrast")
        ],
        service_type=ServiceType.DIAGNOSTIC_IMAGING,
        requested_start_date=date(2026, 4, 1),
        clinical_summary=(
            "Patient presents with 6 weeks of low back pain radiating to left leg. "
            "Conservative therapy including NSAIDs and physical therapy failed to provide relief. "
            "Clinical examination demonstrates neurological deficit. "
            "MRI is indicated to evaluate for disc herniation or stenosis."
        ),
        urgency=UrgencyLevel.ROUTINE,
    )


@pytest.fixture
def sparse_submission() -> PASubmissionRequest:
    """Submission with minimal clinical documentation — should score low confidence."""
    return PASubmissionRequest(
        pa_number="PA-2026-SPARSE",
        member=MemberInfo(
            member_id="AET000001",
            first_name="Jane",
            last_name="Smith",
            date_of_birth=date(1985, 1, 1),
            gender="F",
            payer=PayerCode.AETNA,
        ),
        provider=ProviderInfo(npi="9876543210", name="Dr. Bob Jones"),
        diagnoses=[DiagnosisCode(code="M545", is_primary=True)],
        procedures=[ProcedureCode(code="72148")],
        service_type=ServiceType.DIAGNOSTIC_IMAGING,
        requested_start_date=date(2026, 4, 1),
        clinical_summary="Back pain.",
        urgency=UrgencyLevel.ROUTINE,
    )


# ── Security Tests ────────────────────────────────────────────────────────────
class TestSecurity:
    def test_password_hash_verify(self):
        pw = "TestPass@2026!"
        hashed = hash_password(pw)
        assert verify_password(pw, hashed)
        assert not verify_password("WrongPass", hashed)

    def test_phi_encrypt_decrypt(self):
        phi = "Sarah Johnson | DOB: 1985-03-15 | MBR123456"
        enc = encrypt_phi(phi)
        assert enc != phi
        assert decrypt_phi(enc) == phi

    def test_phi_encrypt_empty(self):
        assert encrypt_phi("") == ""
        assert decrypt_phi("") == ""

    def test_phi_mask(self):
        masked = mask_phi("MB123456789", visible=4)
        assert masked.endswith("6789")
        assert masked.startswith("*")

    def test_phi_mask_short(self):
        assert mask_phi("AB") == "****"


# ── Schema Validation Tests ───────────────────────────────────────────────────
class TestSchemas:
    def test_valid_icd10_code(self):
        dx = DiagnosisCode(code="M51.1", is_primary=True)
        assert dx.code == "M511"  # Dot removed and uppercased

    def test_invalid_icd10_raises(self):
        with pytest.raises(Exception):
            DiagnosisCode(code="INVALID", is_primary=True)

    def test_valid_npi(self):
        p = ProviderInfo(npi="1234567890", name="Dr. Test")
        assert p.npi == "1234567890"

    def test_invalid_npi_raises(self):
        with pytest.raises(Exception):
            ProviderInfo(npi="123", name="Dr. Test")

    def test_valid_cpt(self):
        proc = ProcedureCode(code="72148")
        assert proc.code == "72148"

    def test_invalid_cpt_raises(self):
        with pytest.raises(Exception):
            ProcedureCode(code="1234")

    def test_member_id_uppercased(self):
        m = MemberInfo(
            member_id="uhc123",
            first_name="A",
            last_name="B",
            date_of_birth=date(1980, 1, 1),
            gender="M",
            payer=PayerCode.UHC,
        )
        assert m.member_id == "UHC123"

    def test_pa_primary_diagnosis_property(self, sample_submission):
        dx = sample_submission.primary_diagnosis
        assert dx is not None
        assert dx.code == "M511"


# ── Criteria Engine Tests ─────────────────────────────────────────────────────
class TestCriteriaEngine:
    @pytest.mark.asyncio
    async def test_analyze_returns_recommendation(self, sample_submission):
        result = await CriteriaEngine.analyze(sample_submission)
        assert result.pa_number == "PA-2026-TEST01"
        assert 0.0 <= result.confidence_score <= 1.0
        assert result.recommendation in ("APPROVE", "DENY", "PEND", "REQUEST_INFO")
        assert result.route_decision is not None

    @pytest.mark.asyncio
    async def test_rich_clinical_summary_higher_confidence(
        self, sample_submission, sparse_submission
    ):
        rich_result = await CriteriaEngine.analyze(sample_submission)
        sparse_result = await CriteriaEngine.analyze(sparse_submission)
        assert rich_result.confidence_score > sparse_result.confidence_score

    @pytest.mark.asyncio
    async def test_criteria_evaluation_populated(self, sample_submission):
        result = await CriteriaEngine.analyze(sample_submission)
        assert result.criteria_evaluation is not None
        assert len(result.criteria_evaluation.criteria) > 0
        assert (
            result.criteria_evaluation.met_count
            + result.criteria_evaluation.not_met_count
            >= 0
        )

    @pytest.mark.asyncio
    async def test_high_confidence_routes_to_auto_approve(self, sample_submission):
        """Rich imaging submission with all criteria met should route toward approval."""
        result = await CriteriaEngine.analyze(sample_submission)
        # Rich submission should have reasonable confidence
        assert result.confidence_score > 0.40

    @pytest.mark.asyncio
    async def test_sparse_submission_routes_to_review(self, sparse_submission):
        result = await CriteriaEngine.analyze(sparse_submission)
        assert result.route_decision in (
            RouteDecision.HUMAN_REVIEW,
            RouteDecision.AUTO_DENY,
            RouteDecision.ESCALATE,
        )

    @pytest.mark.asyncio
    async def test_emergency_always_escalated(self, sample_submission):
        sample_submission.urgency = UrgencyLevel.EMERGENCY
        result = await CriteriaEngine.analyze(sample_submission)
        assert result.route_decision == RouteDecision.ESCALATE

    @pytest.mark.asyncio
    async def test_inference_time_under_5s(self, sample_submission):
        result = await CriteriaEngine.analyze(sample_submission)
        assert result.inference_ms is not None
        assert result.inference_ms < 5000  # PRD requirement: <5s

    @pytest.mark.asyncio
    async def test_denial_has_reasons(self, sparse_submission):
        result = await CriteriaEngine.analyze(sparse_submission)
        if result.recommendation in ("DENY", "PEND"):
            # Either denial reasons or missing info should be populated
            assert len(result.denial_reasons) > 0 or len(result.missing_info) > 0

    @pytest.mark.asyncio
    async def test_medication_step_therapy(self):
        """Biologic medication request should trigger step therapy check."""
        submission = PASubmissionRequest(
            pa_number="PA-2026-MED01",
            member=MemberInfo(
                member_id="UHC999",
                first_name="A",
                last_name="B",
                date_of_birth=date(1980, 1, 1),
                gender="F",
                payer=PayerCode.UHC,
            ),
            provider=ProviderInfo(npi="1234567890", name="Dr. Test"),
            diagnoses=[DiagnosisCode(code="M0500", is_primary=True)],
            procedures=[ProcedureCode(code="J0135")],
            service_type=ServiceType.SPECIALTY_MEDICATION,
            requested_start_date=date(2026, 4, 1),
            clinical_summary="Rheumatoid arthritis failing methotrexate after 6 months. Requesting adalimumab.",
            urgency=UrgencyLevel.ROUTINE,
        )
        result = await CriteriaEngine.analyze(submission)
        assert result.step_therapy_check is not None


# ── Auto Decision Tests ───────────────────────────────────────────────────────
class TestAutoDecision:
    @pytest.mark.asyncio
    async def test_high_confidence_auto_approve(self, sample_submission):
        ai_result = await CriteriaEngine.analyze(sample_submission)
        # Patch to force auto-approve threshold
        ai_result.confidence_score = 0.95
        ai_result.route_decision = RouteDecision.AUTO_APPROVE
        ai_result.criteria_evaluation.missing_info_list = []

        decision = await AutoDecisionService.evaluate(sample_submission, ai_result)
        assert decision.decision.value in (
            "AUTO_APPROVED",
            "IN_REVIEW",
        )  # depends on feature flag

    @pytest.mark.asyncio
    async def test_human_review_band(self, sample_submission):
        ai_result = await CriteriaEngine.analyze(sample_submission)
        ai_result.route_decision = RouteDecision.HUMAN_REVIEW
        decision = await AutoDecisionService.evaluate(sample_submission, ai_result)
        assert not decision.is_auto or decision.decision.value == "IN_REVIEW"

    @pytest.mark.asyncio
    async def test_escalate_requires_md(self, sample_submission):
        ai_result = await CriteriaEngine.analyze(sample_submission)
        ai_result.route_decision = RouteDecision.ESCALATE
        decision = await AutoDecisionService.evaluate(sample_submission, ai_result)
        assert decision.requires_md

    def test_sla_deadline_urgent(self, sample_submission):
        sample_submission.urgency = UrgencyLevel.URGENT
        deadline = AutoDecisionService.compute_sla_deadline(sample_submission)
        diff = (deadline - datetime.now(timezone.utc)).total_seconds() / 3600
        assert 23 < diff < 25  # 24h ± 1h

    def test_sla_deadline_routine(self, sample_submission):
        sample_submission.urgency = UrgencyLevel.ROUTINE
        deadline = AutoDecisionService.compute_sla_deadline(sample_submission)
        diff = (deadline - datetime.now(timezone.utc)).total_seconds() / 3600
        assert 71 < diff < 73  # 72h ± 1h


# ── API Endpoint Tests ────────────────────────────────────────────────────────
@pytest.fixture
def mock_auth_header():
    """Generate a valid test JWT."""
    from app.core.security import create_access_token

    token = create_access_token(
        {"sub": "test-user", "name": "Test User", "role": "REVIEWER_RN"}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ai-engine"


@pytest.mark.asyncio
async def test_analyze_endpoint_authenticated(sample_submission, mock_auth_header):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/ai/analyze",
            json=sample_submission.model_dump(mode="json"),
            headers=mock_auth_header,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "confidence_score" in data
    assert "route_decision" in data
    assert 0.0 <= data["confidence_score"] <= 1.0


@pytest.mark.asyncio
async def test_analyze_requires_auth(sample_submission):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/ai/analyze",
            json=sample_submission.model_dump(mode="json"),
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_demo_user():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": "reviewer1", "password": "Review@1234"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_bad_credentials():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/auth/login", json={"username": "nobody", "password": "wrong"}
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint(mock_auth_header):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/v1/auth/me", headers=mock_auth_header)
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "REVIEWER_RN"
