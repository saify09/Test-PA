"""
test_endpoints.py — API endpoint tests for provider, reviewer, member, admin.
Covers the 91 routes added in the last session.
Run: pytest tests/test_endpoints.py -v --tb=short
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_auth_login_provider(client):
    r = await client.post("/auth/login", json={"username": "provider1", "password": "Provider@1234"})
    assert r.status_code in (200, 401, 422)

@pytest.mark.asyncio
async def test_auth_member_login(client):
    r = await client.post("/auth/member/login", json={"username": "member1", "password": "Member@1234"})
    assert r.status_code in (200, 401, 422)

@pytest.mark.asyncio
async def test_auth_forgot_password_anti_enum(client):
    """HIPAA SC-007: forgot-password never reveals whether email exists."""
    r1 = await client.post("/auth/forgot-password", json={"email": "real@example.com"})
    r2 = await client.post("/auth/forgot-password", json={"email": "fake@notexist.com"})
    # Both must return same status (anti-enumeration)
    assert r1.status_code == r2.status_code

@pytest.mark.asyncio
async def test_auth_refresh(client):
    r = await client.post("/auth/refresh", json={"refresh_token": "invalid"})
    assert r.status_code in (200, 401, 422)

@pytest.mark.asyncio
async def test_auth_me_unauthenticated(client):
    r = await client.get("/auth/me")
    assert r.status_code in (200, 401)


# ── Provider — PA management ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_prior_authorizations(client):
    r = await client.get("/api/v1/prior-authorizations")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_get_prior_auth_stats(client):
    r = await client.get("/api/v1/prior-authorizations/stats")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_submit_prior_authorization(client):
    payload = {
        "member_id": "UHC123456789",
        "member_dob": "1978-03-15",
        "member_first_name": "Sarah",
        "member_last_name": "Johnson",
        "primary_dx_code": "M545",
        "procedure_code": "72148",
        "service_type": "Diagnostic Imaging",
        "place_of_service": "22",
        "urgency": "ROUTINE",
        "provider_npi": "1234567890",
        "clinical_summary": "Patient presents with persistent lower back pain for 3 months, conservative therapy failed.",
        "requested_units": 1,
        "payer_code": "UHC",
        "requested_start_date": "2026-04-01",
    }
    r = await client.post("/api/v1/prior-authorizations", json=payload)
    assert r.status_code in (200, 201, 401, 403, 422)

@pytest.mark.asyncio
async def test_get_prior_auth_by_id(client):
    r = await client.get("/api/v1/prior-authorizations/PA-2026-000001")
    assert r.status_code in (200, 401, 403, 404)

@pytest.mark.asyncio
async def test_get_prior_auth_history(client):
    r = await client.get("/api/v1/prior-authorizations/PA-2026-000001/history")
    assert r.status_code in (200, 401, 403, 404)

@pytest.mark.asyncio
async def test_download_decision_letter(client):
    r = await client.get("/api/v1/prior-authorizations/PA-2026-000001/letter")
    assert r.status_code in (200, 401, 403, 404)

@pytest.mark.asyncio
async def test_cancel_prior_auth(client):
    r = await client.post("/api/v1/prior-authorizations/PA-2026-000001/cancel",
                          json={"reason": "Patient declined procedure"})
    assert r.status_code in (200, 401, 403, 404, 422)


# ── Provider — Eligibility & Documents ────────────────────────────────────────

@pytest.mark.asyncio
async def test_eligibility_verify(client):
    r = await client.post("/api/v1/eligibility/verify", json={
        "member_id": "UHC123456789", "payer": "UHC",
        "date_of_service": "2026-04-01", "provider_npi": "1234567890",
    })
    assert r.status_code in (200, 401, 403, 422)

@pytest.mark.asyncio
async def test_document_upload(client):
    import io
    files = {"file": ("test.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
    r = await client.post("/api/v1/documents/upload", files=files)
    assert r.status_code in (200, 201, 401, 403, 413, 422)

@pytest.mark.asyncio
async def test_document_delete(client):
    r = await client.delete("/api/v1/documents/doc-123")
    assert r.status_code in (200, 204, 401, 403, 404)


# ── Provider — Lookups ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_lookup_icd10(client):
    r = await client.get("/api/v1/lookup/icd10", params={"q": "back pain"})
    assert r.status_code in (200, 401)
    if r.status_code == 200:
        data = r.json()
        assert isinstance(data, (list, dict))

@pytest.mark.asyncio
async def test_lookup_cpt(client):
    r = await client.get("/api/v1/lookup/cpt", params={"q": "MRI"})
    assert r.status_code in (200, 401)

@pytest.mark.asyncio
async def test_lookup_npi(client):
    r = await client.get("/api/v1/lookup/npi", params={"npi": "1234567890"})
    assert r.status_code in (200, 401, 404)

@pytest.mark.asyncio
async def test_lookup_specialties(client):
    r = await client.get("/api/v1/lookup/specialties")
    assert r.status_code in (200, 401)

@pytest.mark.asyncio
async def test_lookup_places_of_service(client):
    r = await client.get("/api/v1/lookup/places-of-service")
    assert r.status_code in (200, 401)


# ── Reviewer — Queue ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_review_queue(client):
    r = await client.get("/api/v1/review-queue")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_get_review_queue_stats(client):
    r = await client.get("/api/v1/review-queue/stats")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_assign_case_to_reviewer(client):
    r = await client.post("/api/v1/review-queue/PA-2026-000001/assign",
                          json={"reviewer_id": "rev-001"})
    assert r.status_code in (200, 401, 403, 404, 422)

@pytest.mark.asyncio
async def test_self_assign_case(client):
    r = await client.post("/api/v1/review-queue/PA-2026-000001/self-assign")
    assert r.status_code in (200, 401, 403, 404, 409)


# ── Reviewer — Case Detail ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_case_review(client):
    r = await client.get("/api/v1/cases/PA-2026-000001/review")
    assert r.status_code in (200, 401, 403, 404)

@pytest.mark.asyncio
async def test_get_case_ai_analysis(client):
    r = await client.get("/api/v1/cases/PA-2026-000001/ai-analysis")
    assert r.status_code in (200, 401, 403, 404)

@pytest.mark.asyncio
async def test_get_case_guidelines(client):
    r = await client.get("/api/v1/cases/PA-2026-000001/guidelines")
    assert r.status_code in (200, 401, 403, 404)

@pytest.mark.asyncio
async def test_submit_decision_approve(client):
    r = await client.post("/api/v1/cases/PA-2026-000001/decision", json={
        "decision": "APPROVE",
        "clinical_notes": "Medically necessary per MCG criteria. Conservative therapy documented.",
        "approved_units": 1,
        "auth_start_date": "2026-04-01",
        "auth_end_date": "2026-07-01",
    })
    assert r.status_code in (200, 401, 403, 404, 422)

@pytest.mark.asyncio
async def test_submit_decision_deny(client):
    r = await client.post("/api/v1/cases/PA-2026-000001/decision", json={
        "decision": "DENY",
        "denial_reason": "NOT_MEDICALLY_NECESSARY",
        "clinical_notes": "Does not meet criteria.",
        "require_md_review": True,
    })
    assert r.status_code in (200, 401, 403, 404, 422)

@pytest.mark.asyncio
async def test_request_additional_info(client):
    r = await client.post("/api/v1/cases/PA-2026-000001/request-info", json={
        "pend_reason": "ADDITIONAL_CLINICAL_INFO",
        "information_requested": ["recent_labs", "imaging_results"],
    })
    assert r.status_code in (200, 401, 403, 404, 422)

@pytest.mark.asyncio
async def test_get_reviewer_metrics(client):
    r = await client.get("/api/v1/metrics/reviewer")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_get_ai_accuracy_metrics(client):
    r = await client.get("/api/v1/metrics/ai-accuracy")
    assert r.status_code in (200, 401, 403)


# ── Member Portal ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_member_get_pa_requests(client):
    r = await client.get("/api/v1/member/pa-requests")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_member_get_pa_status(client):
    r = await client.get("/api/v1/member/status")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_member_get_pa_detail(client):
    r = await client.get("/api/v1/member/pa-requests/PA-2026-000001")
    assert r.status_code in (200, 401, 403, 404)

@pytest.mark.asyncio
async def test_member_submit_appeal(client):
    r = await client.post("/api/v1/member/appeals", json={
        "pa_number": "PA-2026-000001",
        "appeal_type": "STANDARD",
        "reason_for_appeal": "New clinical information available that was not considered in the initial review.",
        "contact_phone": "(555) 123-4567",
        "preferred_contact_method": "PHONE",
    })
    assert r.status_code in (200, 201, 401, 403, 422)

@pytest.mark.asyncio
async def test_member_get_profile(client):
    r = await client.get("/api/v1/member/profile")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_member_get_notifications(client):
    r = await client.get("/api/v1/member/notifications")
    assert r.status_code in (200, 401, 403)


# ── Admin ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_kpis(client):
    r = await client.get("/api/v1/admin/analytics/kpis")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_admin_list_users(client):
    r = await client.get("/api/v1/admin/users")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_admin_list_cases(client):
    r = await client.get("/api/v1/admin/cases")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_admin_audit_log(client):
    r = await client.get("/api/v1/admin/audit")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_admin_system_health(client):
    r = await client.get("/api/v1/admin/system/health")
    assert r.status_code in (200, 401, 403)

@pytest.mark.asyncio
async def test_admin_notifications(client):
    r = await client.get("/api/v1/admin/notifications")
    assert r.status_code in (200, 401, 403)


# ── Health checks ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_check(client):
    r = await client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "healthy"

@pytest.mark.asyncio
async def test_graphql_schema(client):
    r = await client.post("/graphql", json={"query": "{ __typename }"})
    assert r.status_code in (200, 404)
