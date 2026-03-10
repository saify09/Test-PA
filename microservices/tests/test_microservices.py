"""
Microservices integration test suite.
Tests: intake, payer integration, appeals, notifications, document service.
Run: pytest tests/ -v --tb=short
"""

import asyncio, io
from datetime import date, datetime, timezone
from typing import AsyncGenerator
import pytest
from httpx import AsyncClient, ASGITransport


# ══════════════════════════════════════════════════════════════════════════════
# INTAKE SERVICE TESTS
# ══════════════════════════════════════════════════════════════════════════════
class TestIntakeService:
    @pytest.fixture
    def valid_intake_payload(self):
        return {
            "source_channel": "PORTAL",
            "member": {
                "member_id": "UHC123456789",
                "first_name": "John",
                "last_name": "Doe",
                "date_of_birth": "1975-06-15",
                "gender": "M",
                "payer": "UHC",
            },
            "provider": {"npi": "1234567890", "name": "Dr. Jane Smith"},
            "diagnoses": [
                {
                    "code": "M511",
                    "description": "Lumbar disc herniation",
                    "is_primary": True,
                }
            ],
            "procedures": [{"code": "72148", "description": "MRI Lumbar Spine"}],
            "service_type": "DIAGNOSTIC_IMAGING",
            "requested_start_date": "2026-04-01",
            "clinical_summary": "Patient has 6 weeks of low back pain with failed conservative therapy including NSAIDs and physical therapy. Neurological deficit documented.",
            "urgency": "ROUTINE",
        }

    @pytest.mark.asyncio
    async def test_submit_returns_pa_number(self, valid_intake_payload):
        from microservices.intake_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/intake/submit", json=valid_intake_payload)
        assert resp.status_code == 201
        data = resp.json()
        assert "pa_number" in data
        assert data["pa_number"].startswith("PA-")

    @pytest.mark.asyncio
    async def test_submit_sets_sla_deadline(self, valid_intake_payload):
        from microservices.intake_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/intake/submit", json=valid_intake_payload)
        data = resp.json()
        assert "sla_deadline" in data
        assert data["estimated_response_hours"] == 72  # ROUTINE

    @pytest.mark.asyncio
    async def test_urgent_has_24h_sla(self, valid_intake_payload):
        valid_intake_payload["urgency"] = "URGENT"
        from microservices.intake_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/intake/submit", json=valid_intake_payload)
        assert resp.json()["estimated_response_hours"] == 24

    @pytest.mark.asyncio
    async def test_invalid_icd10_rejected(self, valid_intake_payload):
        valid_intake_payload["diagnoses"][0]["code"] = "INVALID"
        from microservices.intake_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/intake/submit", json=valid_intake_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_npi_rejected(self, valid_intake_payload):
        valid_intake_payload["provider"]["npi"] = "123"
        from microservices.intake_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/intake/submit", json=valid_intake_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_validate_endpoint(self, valid_intake_payload):
        from microservices.intake_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/intake/validate", json=valid_intake_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "valid" in data

    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        from microservices.intake_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["service"] == "intake"


# ══════════════════════════════════════════════════════════════════════════════
# PAYER INTEGRATION TESTS
# ══════════════════════════════════════════════════════════════════════════════
class TestPayerIntegration:
    @pytest.mark.asyncio
    async def test_eligibility_returns_mock_when_no_api_key(self):
        from microservices.payer_integration.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/eligibility/verify",
                json={
                    "member_id": "UHC123",
                    "payer": "UHC",
                    "date_of_service": "2026-04-01",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_eligible"] is True
        assert "plan_name" in data

    @pytest.mark.asyncio
    async def test_formulary_biologic_requires_step(self):
        from microservices.payer_integration.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/formulary/check",
                json={
                    "drug_code": "J0135",
                    "payer": "UHC",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["requires_step"] is True
        assert len(data["step_agents"]) > 0

    @pytest.mark.asyncio
    async def test_formulary_standard_no_step(self):
        from microservices.payer_integration.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/formulary/check",
                json={
                    "drug_code": "99213",
                    "payer": "AETNA",
                },
            )
        assert resp.status_code == 200
        assert resp.json()["requires_step"] is False

    @pytest.mark.asyncio
    async def test_pa_submit_returns_ref_number(self):
        from microservices.payer_integration.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/pa/submit",
                json={
                    "pa_number": "PA-2026-TEST01",
                    "payer": "UHC",
                    "member_id": "UHC123456",
                    "member_dob": "1975-01-01",
                    "provider_npi": "1234567890",
                    "diagnoses": [{"code": "M511"}],
                    "procedures": [{"code": "72148", "units": 1}],
                    "service_type": "DIAGNOSTIC_IMAGING",
                    "urgency": "ROUTINE",
                    "requested_units": 1,
                    "clinical_summary": "MRI needed for lumbar disc herniation evaluation.",
                    "requested_start_date": "2026-04-01",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "payer_ref_number" in data

    @pytest.mark.asyncio
    async def test_edi_payer_submits_via_edi(self):
        from microservices.payer_integration.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/pa/submit",
                json={
                    "pa_number": "PA-2026-EDI01",
                    "payer": "BCBS",
                    "member_id": "BCBS999",
                    "member_dob": "1980-05-15",
                    "provider_npi": "9876543210",
                    "diagnoses": [{"code": "M511"}],
                    "procedures": [{"code": "72148", "units": 1}],
                    "service_type": "DIAGNOSTIC_IMAGING",
                    "urgency": "ROUTINE",
                    "requested_units": 1,
                    "clinical_summary": "EDI 278 submission test.",
                    "requested_start_date": "2026-04-01",
                },
            )
        assert resp.status_code == 200
        assert resp.json()["source"] == "EDI"

    @pytest.mark.asyncio
    async def test_list_payers(self):
        from microservices.payer_integration.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/payers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["payers"]) >= 4


# ══════════════════════════════════════════════════════════════════════════════
# APPEALS SERVICE TESTS
# ══════════════════════════════════════════════════════════════════════════════
class TestAppealsService:
    @pytest.fixture
    def valid_appeal(self):
        return {
            "pa_number": "PA-2026-123456",
            "original_decision": "DENIED",
            "appeal_type": "STANDARD",
            "channel": "PORTAL",
            "appellant_type": "PROVIDER",
            "appellant_id": "PROV001",
            "appellant_name": "Dr. Jane Smith",
            "reason_text": "Denial appears inconsistent with MCG guidelines. "
            "Patient has completed 6 weeks of conservative therapy as required.",
        }

    @pytest.mark.asyncio
    async def test_submit_appeal_returns_appeal_number(self, valid_appeal):
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/appeals/submit", json=valid_appeal)
        assert resp.status_code == 201
        data = resp.json()
        assert data["appeal_number"].startswith("APP-")

    @pytest.mark.asyncio
    async def test_standard_appeal_has_30day_deadline(self, valid_appeal):
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/appeals/submit", json=valid_appeal)
        data = resp.json()
        assert "regulatory_deadline" in data
        assert "30 calendar days" in data["deadline_description"]

    @pytest.mark.asyncio
    async def test_expedited_appeal_has_72h_deadline(self, valid_appeal):
        valid_appeal["appeal_type"] = "EXPEDITED"
        valid_appeal["urgency_justification"] = "Patient requires urgent treatment"
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/appeals/submit", json=valid_appeal)
        assert resp.status_code == 201
        assert "72 hours" in resp.json()["deadline_description"]

    @pytest.mark.asyncio
    async def test_expedited_without_justification_rejected(self, valid_appeal):
        valid_appeal["appeal_type"] = "EXPEDITED"
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/appeals/submit", json=valid_appeal)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_get_appeal(self, valid_appeal):
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            post = await client.post("/appeals/submit", json=valid_appeal)
            appeal_number = post.json()["appeal_number"]
            get = await client.get(f"/appeals/{appeal_number}")
        assert get.status_code == 200
        assert get.json()["appeal_number"] == appeal_number

    @pytest.mark.asyncio
    async def test_update_requires_md_cosign_for_upheld(self, valid_appeal):
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            post = await client.post("/appeals/submit", json=valid_appeal)
            appeal_number = post.json()["appeal_number"]
            update = await client.put(
                f"/appeals/{appeal_number}",
                json={"decision": "UPHELD"},  # No md_cosign_id
            )
        assert update.status_code == 422

    @pytest.mark.asyncio
    async def test_outcome_analytics(self):
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/appeals/analytics/outcomes?days=30")
        assert resp.status_code == 200
        data = resp.json()
        assert "overturn_rate" in data
        assert "top_denial_reasons" in data

    @pytest.mark.asyncio
    async def test_sla_at_risk_endpoint(self):
        from microservices.appeals_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/appeals/sla/at-risk")
        assert resp.status_code == 200
        assert "at_risk_count" in resp.json()


# ══════════════════════════════════════════════════════════════════════════════
# NOTIFICATION SERVICE TESTS
# ══════════════════════════════════════════════════════════════════════════════
class TestNotificationService:
    @pytest.mark.asyncio
    async def test_send_notification_queued(self):
        from microservices.notification_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/notify/send",
                json={
                    "pa_number": "PA-2026-123456",
                    "event_type": "DECISION_APPROVED",
                    "recipient_type": "PROVIDER",
                    "recipient_id": "PROV001",
                    "recipient_name": "Dr. Smith",
                    "channel": "EMAIL",
                    "template_id": "DECISION_APPROVED",
                    "template_vars": {
                        "auth_number": "UHC20260310ABC",
                        "service_description": "MRI Lumbar",
                        "approved_units": "1",
                        "auth_start": "2026-04-01",
                        "auth_end": "2026-07-01",
                    },
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "notification_id" in data

    @pytest.mark.asyncio
    async def test_template_preview_english(self):
        from microservices.notification_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                "/notify/templates/DECISION_APPROVED/preview?language=en"
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "rendered" in data
        assert "subject" in data["rendered"]

    @pytest.mark.asyncio
    async def test_template_preview_spanish(self):
        from microservices.notification_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                "/notify/templates/DECISION_APPROVED/preview?language=es"
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "Aprobada" in data["rendered"].get("subject", "") or "APROBADA" in data[
            "rendered"
        ].get("subject", "")

    @pytest.mark.asyncio
    async def test_list_templates(self):
        from microservices.notification_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/notify/templates")
        assert resp.status_code == 200
        assert len(resp.json()["templates"]) >= 5

    @pytest.mark.asyncio
    async def test_high_priority_sends_immediately(self):
        from microservices.notification_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/notify/send",
                json={
                    "pa_number": "PA-2026-URGENT",
                    "event_type": "SLA_WARNING",
                    "recipient_type": "REVIEWER",
                    "recipient_id": "REV001",
                    "recipient_name": "Dr. Chen",
                    "channel": "EMAIL",
                    "template_id": "SLA_WARNING",
                    "priority": "HIGH",
                    "template_vars": {
                        "current_status": "IN_REVIEW",
                        "sla_deadline": "2026-03-11T08:00:00Z",
                        "hours_remaining": "2.5",
                        "reviewer_name": "Dr. Chen",
                    },
                },
            )
        assert resp.status_code == 200


# ══════════════════════════════════════════════════════════════════════════════
# DOCUMENT SERVICE TESTS
# ══════════════════════════════════════════════════════════════════════════════
class TestDocumentService:
    @pytest.mark.asyncio
    async def test_upload_text_document(self):
        from microservices.document_service.app.main import app

        content = b"""
Patient: John Doe  DOB: 1975-06-15
Diagnosis: M51.1 Lumbar disc herniation
Procedure: 72148 MRI Lumbar Spine
Clinical Notes: Patient presents with 6 weeks of low back pain radiating to the left leg.
Conservative therapy including NSAIDs (ibuprofen 800mg) and physical therapy failed.
Hemoglobin: 14.2 g/dL  Creatinine: 1.0 mg/dL
Pain scale: 7/10
"""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/documents/upload",
                files={
                    "file": ("clinical_notes.txt", io.BytesIO(content), "text/plain")
                },
                data={"pa_number": "PA-2026-TEST01", "uploader_id": "PROV001"},
            )
        assert resp.status_code == 201
        data = resp.json()
        assert "document_id" in data

    @pytest.mark.asyncio
    async def test_upload_then_get_document(self):
        from microservices.document_service.app.main import app

        content = b"Sample clinical note for testing document retrieval."
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            upload = await client.post(
                "/documents/upload",
                files={"file": ("note.txt", io.BytesIO(content), "text/plain")},
                data={"pa_number": "PA-2026-GET01"},
            )
            doc_id = upload.json()["document_id"]
            get = await client.get(f"/documents/{doc_id}")
        assert get.status_code == 200
        assert get.json()["document_id"] == doc_id

    @pytest.mark.asyncio
    async def test_upload_rejects_large_file(self):
        from microservices.document_service.app.main import app
        from microservices.document_service.app.main import settings

        orig = settings.MAX_FILE_SIZE_MB
        settings.MAX_FILE_SIZE_MB = 0  # Force rejection
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/documents/upload",
                    files={"file": ("big.txt", io.BytesIO(b"x" * 100), "text/plain")},
                )
            assert resp.status_code == 413
        finally:
            settings.MAX_FILE_SIZE_MB = orig

    @pytest.mark.asyncio
    async def test_unsupported_mime_rejected(self):
        from microservices.document_service.app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/documents/upload",
                files={
                    "file": (
                        "script.exe",
                        io.BytesIO(b"\x4d\x5a"),
                        "application/x-msdownload",
                    )
                },
            )
        assert resp.status_code == 415

    @pytest.mark.asyncio
    async def test_entity_extraction_finds_icd10(self):
        from microservices.document_service.app.main import extract_entities

        text = "Patient diagnosed with M51.1 lumbar disc herniation. Lab: A1C: 7.2% Creatinine: 1.1 mg/dL"
        result = extract_entities(text)
        assert "M511" in result["diagnoses"] or any(
            "M51" in d for d in result["diagnoses"]
        )
        assert "a1c" in result["labs"] or "creatinine" in result["labs"]

    @pytest.mark.asyncio
    async def test_document_classifier(self):
        from microservices.document_service.app.main import (
            classify_document,
            DocumentType,
        )

        assert (
            classify_document("lab_results.pdf", "CBC results hemoglobin 14.2")
            == DocumentType.LAB_RESULTS
        )
        assert (
            classify_document(
                "mri_report.pdf", "MRI Impression: disc herniation at L4-L5"
            )
            == DocumentType.IMAGING_REPORT
        )
        assert (
            classify_document(
                "rx.txt", "Prescription Sig: take once daily Dispense #30 Refills: 2"
            )
            == DocumentType.PRESCRIPTION
        )

    @pytest.mark.asyncio
    async def test_list_documents_by_pa(self):
        from microservices.document_service.app.main import app

        content = b"Test doc for list endpoint"
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/documents/upload",
                files={"file": ("doc1.txt", io.BytesIO(content), "text/plain")},
                data={"pa_number": "PA-2026-LIST01"},
            )
            resp = await client.get("/documents?pa_number=PA-2026-LIST01")
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1
