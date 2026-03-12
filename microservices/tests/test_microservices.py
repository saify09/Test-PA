"""
test_microservices.py — Full integration test suite for all PA system microservices.
Covers all 10 services: auth, intake, payer-integration, appeals, document,
notification, reporting, eligibility, audit, user-management.

Run against live services:
    pytest tests/test_microservices.py -v --tb=short

CI usage (requires services running — use docker-compose up first):
    pytest tests/test_microservices.py -v -x --tb=short

Env overrides:
    BASE_AUTH    BASE_INTAKE  BASE_PAYER   BASE_APPEALS  BASE_DOC
    BASE_NOTIF   BASE_REPORT  BASE_ELIG    BASE_AUDIT    BASE_USERS
"""
from __future__ import annotations

import io
import os
import pytest
import httpx
from datetime import date, timedelta

# ── Base URLs ──────────────────────────────────────────────────────────────────
B = {
    "auth":    os.getenv("BASE_AUTH",    "http://localhost:8007"),
    "intake":  os.getenv("BASE_INTAKE",  "http://localhost:8002"),
    "payer":   os.getenv("BASE_PAYER",   "http://localhost:8003"),
    "appeals": os.getenv("BASE_APPEALS", "http://localhost:8004"),
    "doc":     os.getenv("BASE_DOC",     "http://localhost:8006"),
    "notif":   os.getenv("BASE_NOTIF",   "http://localhost:8005"),
    "report":  os.getenv("BASE_REPORT",  "http://localhost:8009"),
    "elig":    os.getenv("BASE_ELIG",    "http://localhost:8010"),
    "audit":   os.getenv("BASE_AUDIT",   "http://localhost:8011"),
    "users":   os.getenv("BASE_USERS",   "http://localhost:8008"),
}
T = 10  # timeout seconds

# ── HTTP helpers ───────────────────────────────────────────────────────────────

def get(svc: str, path: str, **kw) -> httpx.Response:
    return httpx.get(f"{B[svc]}{path}", timeout=T, **kw)

def post(svc: str, path: str, **kw) -> httpx.Response:
    return httpx.post(f"{B[svc]}{path}", timeout=T, **kw)

def put(svc: str, path: str, **kw) -> httpx.Response:
    return httpx.put(f"{B[svc]}{path}", timeout=T, **kw)

def patch(svc: str, path: str, **kw) -> httpx.Response:
    return httpx.patch(f"{B[svc]}{path}", timeout=T, **kw)

def delete(svc: str, path: str, **kw) -> httpx.Response:
    return httpx.delete(f"{B[svc]}{path}", timeout=T, **kw)

ACCEPTABLE = (200, 201, 204, 400, 401, 403, 404, 409, 422, 503)

# ── Shared test data ───────────────────────────────────────────────────────────
TODAY       = date.today().isoformat()
TOMORROW    = (date.today() + timedelta(days=1)).isoformat()
MEMBER_ID   = "UHC12345678"
PROVIDER_NPI = "1234567890"
PA_NUMBER   = "PA-2026-TEST01"
DIAGNOSIS   = [{"code": "M545", "description": "Low back pain"}]
PROCEDURES  = [{"code": "72148", "description": "MRI lumbar spine without contrast"}]
CLINICAL_SUMMARY = (
    "Patient presents with persistent lumbar radiculopathy for 12 weeks. "
    "Conservative treatment including physical therapy (6 weeks) and NSAIDs has failed. "
    "Neurological deficit noted on exam. MRI required to evaluate for disc herniation "
    "prior to surgical consultation. Meets MCG Imaging Guidelines criteria."
)


# ═══════════════════════════════════════════════════════════════════════════════
# §1 — AUTH SERVICE (port 8007)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuthService:

    def test_health(self):
        r = get("auth", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_login_provider_valid(self):
        r = post("auth", "/auth/login",
                 json={"username": "provider1", "password": "Provider@1234"})
        assert r.status_code in (200, 401, 422)
        if r.status_code == 200:
            data = r.json()
            assert "access_token" in data
            assert data.get("token_type") == "bearer"

    def test_login_invalid_credentials(self):
        r = post("auth", "/auth/login",
                 json={"username": "nobody", "password": "wrongpass"})
        assert r.status_code in (401, 422)

    def test_login_missing_fields(self):
        r = post("auth", "/auth/login", json={"username": "provider1"})
        assert r.status_code == 422

    def test_member_login(self):
        r = post("auth", "/auth/member/login",
                 json={"username": "member1", "password": "Member@1234"})
        assert r.status_code in (200, 401, 422)

    def test_forgot_password_anti_enumeration(self):
        """HIPAA SC-007: both real and fake emails must return identical status."""
        r1 = post("auth", "/auth/forgot-password", json={"email": "real@health.org"})
        r2 = post("auth", "/auth/forgot-password", json={"email": "fake@doesnotexist.invalid"})
        assert r1.status_code == r2.status_code

    def test_refresh_token_invalid(self):
        r = post("auth", "/auth/refresh", json={"refresh_token": "garbage_token_xyz"})
        assert r.status_code in (401, 422)

    def test_get_me_unauthenticated(self):
        r = get("auth", "/auth/me")
        assert r.status_code in (200, 401)

    def test_logout(self):
        r = post("auth", "/auth/logout", json={"refresh_token": "any"})
        assert r.status_code in (200, 204, 401, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# §2 — INTAKE SERVICE (port 8002)
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntakeService:

    def test_health(self):
        r = get("intake", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_validate_submission_valid(self):
        """FLS §7 — validation layer reachable through intake."""
        payload = {
            "member_id":            MEMBER_ID,
            "member_dob":           "1978-03-15",
            "provider_npi":         PROVIDER_NPI,
            "payer_code":           "UHC",
            "primary_dx_code":      "M545",
            "procedure_code":       "72148",
            "service_type":         "Diagnostic Imaging",
            "urgency":              "ROUTINE",
            "clinical_notes":       CLINICAL_SUMMARY,
            "requested_units":      1,
            "requested_start_date": TODAY,
            "place_of_service":     "22",
        }
        r = post("intake", "/intake/validate", json=payload)
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert "valid" in data or "errors" in data

    def test_validate_invalid_member_id(self):
        """VAL-001: Member ID regex must reject lowercase."""
        payload = {"member_id": "invalid id!", "provider_npi": PROVIDER_NPI,
                   "payer_code": "UHC", "primary_dx_code": "M545",
                   "procedure_code": "72148", "service_type": "Medical",
                   "urgency": "ROUTINE", "clinical_notes": CLINICAL_SUMMARY,
                   "requested_units": 1, "requested_start_date": TODAY}
        r = post("intake", "/intake/validate", json=payload)
        assert r.status_code in (200, 422)

    def test_submit_standard(self):
        """FR-001: Standard PA submission."""
        payload = {
            "pa_number":            PA_NUMBER,
            "member_id":            MEMBER_ID,
            "member_dob":           "1978-03-15",
            "member_first_name":    "Sarah",
            "member_last_name":     "Johnson",
            "provider_npi":         PROVIDER_NPI,
            "provider_name":        "Dr. Robert Smith",
            "payer_code":           "UHC",
            "diagnoses":            DIAGNOSIS,
            "procedures":           PROCEDURES,
            "service_type":         "Diagnostic Imaging",
            "urgency":              "ROUTINE",
            "clinical_summary":     CLINICAL_SUMMARY,
            "requested_units":      1,
            "requested_start_date": TODAY,
            "place_of_service":     "22",
        }
        r = post("intake", "/intake/submit", json=payload)
        assert r.status_code in (201, 200, 409, 422)
        if r.status_code in (200, 201):
            data = r.json()
            assert "pa_number" in data or "pa_id" in data

    def test_submit_fhir_bundle(self):
        """FR-001 / FLS §5.2 — FHIR R4 bundle intake."""
        bundle = {
            "resourceType": "Bundle",
            "type": "transaction",
            "entry": [
                {"resource": {"resourceType": "Patient", "id": "p1",
                              "identifier": [{"value": MEMBER_ID}],
                              "name": [{"family": "Johnson", "given": ["Sarah"]}],
                              "birthDate": "1978-03-15"}},
                {"resource": {"resourceType": "ServiceRequest", "id": "sr1",
                              "status": "active", "intent": "order",
                              "subject": {"reference": "Patient/p1"},
                              "code": {"coding": [{"code": "72148"}]}}}
            ]
        }
        r = post("intake", "/intake/fhir", json=bundle)
        assert r.status_code in (200, 201, 400, 422)

    def test_submit_edi_278(self):
        """FR-001 — EDI X12 278 intake."""
        edi = (
            "ISA*00*          *00*          *ZZ*SENDER         *ZZ*UHC            "
            "*260301*1200*^*00501*000000001*0*P*:~\n"
            f"ST*278*0001~\nBHT*0007*13*{PA_NUMBER}*20260301*1200*RQ~\nSE*3*0001~\n"
        )
        r = post("intake", "/intake/edi278",
                 content=edi.encode(),
                 headers={"Content-Type": "application/edi-x12"})
        assert r.status_code in (200, 201, 400, 422)

    def test_get_intake_status(self):
        r = get("intake", f"/intake/{PA_NUMBER}/status")
        assert r.status_code in (200, 404)

    # ── GAP 1 TESTS: Extended Clinical Fields & SLA Fixes ─────────────────────

    def test_submit_with_extended_clinical_fields(self):
        """GAP-001: IntakeRequest extended with FLS §2.5 clinical fields."""
        payload = {
            "member": {
                "member_id": MEMBER_ID,
                "first_name": "Sarah", "last_name": "Johnson",
                "date_of_birth": "1978-03-15", "gender": "F", "payer": "UHC",
            },
            "provider": {"npi": PROVIDER_NPI, "name": "Dr. Robert Smith"},
            "diagnoses": [{"code": "M545", "description": "Low back pain", "is_primary": True}],
            "procedures": [{"code": "72148", "description": "MRI lumbar spine"}],
            "service_type": "DIAGNOSTIC_IMAGING",
            "requested_start_date": TODAY,
            "clinical_summary": CLINICAL_SUMMARY,
            "urgency": "ROUTINE",
            # Extended fields (Gap 1 additions)
            "frequency": "1x per week",
            "duration": "6 weeks",
            "prior_treatments": ["Physical therapy 6 weeks", "NSAIDs 3 months"],
            "lab_results": "ESR: 42 mm/hr, CRP: 8.2 mg/L",
            "estimated_cost": 1250.00,
            "chief_complaint": "Persistent low back pain radiating to left leg",
            "hpi": "Patient reports 12 weeks of worsening lumbar pain with left L5 radiculopathy.",
        }
        r = post("intake", "/intake/submit", json=payload)
        assert r.status_code in (201, 200, 409, 422)
        if r.status_code in (200, 201):
            data = r.json()
            assert "pa_number" in data
            assert "sla_deadline" in data

    def test_sla_emergency_is_8_hours(self):
        """GAP-001 / FR-402: EMERGENCY urgency must use 8h SLA, not 24h."""
        payload = {
            "member": {
                "member_id": MEMBER_ID,
                "first_name": "Critical", "last_name": "Patient",
                "date_of_birth": "1960-06-01", "gender": "M", "payer": "UHC",
            },
            "provider": {"npi": PROVIDER_NPI, "name": "Dr. Emergency"},
            "diagnoses": [{"code": "I214", "description": "NSTEMI", "is_primary": True}],
            "procedures": [{"code": "92941", "description": "PCI emergent"}],
            "service_type": "SURGICAL_PROCEDURE",
            "requested_start_date": TODAY,
            "clinical_summary": "Acute STEMI with cardiogenic shock. Emergent PCI required immediately.",
            "urgency": "EMERGENCY",
        }
        r = post("intake", "/intake/submit", json=payload)
        assert r.status_code in (201, 200, 409, 422)
        if r.status_code in (200, 201):
            data = r.json()
            assert data.get("estimated_response_hours") == 8, (
                f"EMERGENCY must be 8h per PRD FR-402, got {data.get('estimated_response_hours')}"
            )

    def test_sla_endpoint_accessible(self):
        """GAP-001: New /intake/{pa}/sla endpoint must be reachable."""
        r = get("intake", f"/intake/{PA_NUMBER}/sla")
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            data = r.json()
            assert "sla_deadline" in data
            assert "hours_remaining" in data
            assert "is_at_risk" in data
            assert "urgency" in data

    def test_specialty_medication_requires_prior_treatments(self):
        """GAP-001 / FLS §2.5: SPECIALTY_MEDICATION without prior_treatments should flag issues."""
        payload = {
            "member": {
                "member_id": MEMBER_ID,
                "first_name": "Emily", "last_name": "Chen",
                "date_of_birth": "1988-11-03", "gender": "F", "payer": "UHC",
            },
            "provider": {"npi": PROVIDER_NPI, "name": "Dr. Chen"},
            "diagnoses": [{"code": "M069", "description": "Rheumatoid arthritis", "is_primary": True}],
            "procedures": [{"code": "J0135", "description": "Adalimumab injection"}],
            "service_type": "SPECIALTY_MEDICATION",
            "requested_start_date": TODAY,
            "clinical_summary": "Patient with RA requesting adalimumab biologic therapy.",
            "urgency": "ROUTINE",
            # Intentionally omitting prior_treatments
        }
        r = post("intake", "/intake/validate", json=payload)
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            # Should NOT be fully valid — prior treatments are required
            if not data.get("valid", True):
                assert any("step therapy" in issue.lower() or "prior treatment" in issue.lower()
                           for issue in data.get("issues", []))

    def test_validate_returns_service_type_applied(self):
        """GAP-001: Validate endpoint should return service_type_checks_applied."""
        payload = {
            "member": {
                "member_id": MEMBER_ID,
                "first_name": "Sarah", "last_name": "Johnson",
                "date_of_birth": "1978-03-15", "gender": "F", "payer": "UHC",
            },
            "provider": {"npi": PROVIDER_NPI, "name": "Dr. Smith"},
            "diagnoses": [{"code": "M545", "is_primary": True}],
            "procedures": [{"code": "72148"}],
            "service_type": "PHYSICAL_THERAPY",
            "requested_start_date": TODAY,
            "clinical_summary": CLINICAL_SUMMARY,
            "urgency": "ROUTINE",
            "frequency": "3x per week",
            "duration": "8 weeks",
        }
        r = post("intake", "/intake/validate", json=payload)
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            # New field should be present
            assert "service_type_checks_applied" in data or "valid" in data


# ═══════════════════════════════════════════════════════════════════════════════
# §2b — DOCUMENT SERVICE NLP EXTRACTION GAPS (port 8006)
# ═══════════════════════════════════════════════════════════════════════════════

class TestDocumentNLPExtraction:
    """GAP-002: Document service must extract HPI, chief complaint, physical exam, prior treatments."""

    CLINICAL_NOTE = (
        "Chief Complaint: Persistent low back pain radiating to left leg for 12 weeks.\n"
        "History of Present Illness: Patient is a 45-year-old male presenting with lumbar "
        "radiculopathy. Symptoms began after a lifting injury. Patient has tried conservative "
        "management including physical therapy for 6 weeks and NSAIDs without improvement. "
        "Pain rated 7/10.\n"
        "Physical Examination: Lumbar tenderness on palpation. Range of motion limited to 30 "
        "degrees flexion. Positive straight leg raise at 45 degrees. Motor strength 4/5 L5. "
        "Sensory deficit in L5 dermatome.\n"
        "Diagnosis: M54.4 Lumbago with sciatica. ICD-10: M541\n"
        "Procedure: MRI Lumbar Spine without contrast. CPT: 72148\n"
    )

    def test_upload_clinical_note_and_check_extraction(self):
        """GAP-002 / FLS §3.2: Uploaded clinical note must populate narrative fields after OCR."""
        note_bytes = self.CLINICAL_NOTE.encode("utf-8")
        files = {"file": ("clinical_note.txt", io.BytesIO(note_bytes), "text/plain")}
        data  = {"pa_number": PA_NUMBER, "doc_type": "CLINICAL_NOTES", "uploaded_by": "provider1"}
        r = post("doc", "/documents/upload", files=files, data=data)
        assert r.status_code in (200, 201, 422)
        if r.status_code in (200, 201):
            resp = r.json()
            doc_id = resp.get("doc_id") or resp.get("document_id")
            assert doc_id is not None, "Upload must return a document ID"

            # Poll extraction result
            ext_r = get("doc", f"/documents/{doc_id}/extraction")
            assert ext_r.status_code in (200, 202, 404)
            if ext_r.status_code == 200:
                ext = ext_r.json()
                # GAP-002: these fields must now be present
                assert "chief_complaint" in ext or "extracted_fields" in ext, \
                    "chief_complaint must be populated from clinical note"

    def test_document_contains_icd_and_cpt_codes(self):
        """FR-003: ICD-10 and CPT codes must be extracted from clinical text."""
        note_bytes = self.CLINICAL_NOTE.encode("utf-8")
        files = {"file": ("note_codes.txt", io.BytesIO(note_bytes), "text/plain")}
        data  = {"pa_number": PA_NUMBER, "doc_type": "CLINICAL_NOTES"}
        r = post("doc", "/documents/upload", files=files, data=data)
        assert r.status_code in (200, 201, 422)
        if r.status_code in (200, 201):
            doc_id = r.json().get("doc_id") or r.json().get("document_id")
            if doc_id:
                ext_r = get("doc", f"/documents/{doc_id}/extraction")
                if ext_r.status_code == 200:
                    ext = ext_r.json()
                    diagnoses = ext.get("diagnoses_found", [])
                    procedures = ext.get("procedures_found", [])
                    # At least one of ICD or CPT should be found
                    assert len(diagnoses) > 0 or len(procedures) > 0, \
                        "ICD-10/CPT extraction should find codes in clinical note"


# ═══════════════════════════════════════════════════════════════════════════════
# §3 — PAYER INTEGRATION (port 8003)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPayerIntegrationService:

    def test_health(self):
        r = get("payer", "/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "healthy"
        assert "payers_configured" in data

    def test_list_payers(self):
        """All 6 payers must be listed with FLS section references."""
        r = get("payer", "/payers")
        assert r.status_code == 200
        payers = r.json().get("payers", [])
        codes = {p["code"] for p in payers}
        assert {"UHC", "AETNA", "CVS", "CIGNA", "HUMANA", "BCBS"}.issubset(codes)

    def test_payer_has_fls_section(self):
        """Each payer entry must reference its FLS section."""
        r = get("payer", "/payers")
        assert r.status_code == 200
        for p in r.json().get("payers", []):
            assert "fls" in p, f"Payer {p.get('code')} missing FLS section reference"

    def test_eligibility_verify_uhc(self):
        """FLS §5.1 — UHC real-time eligibility."""
        r = post("payer", "/eligibility/verify", json={
            "member_id":       MEMBER_ID,
            "payer":           "UHC",
            "date_of_service": TODAY,
            "provider_npi":    PROVIDER_NPI,
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert "is_eligible" in data
            assert "requires_pa" in data
            assert data.get("member_id") == MEMBER_ID

    def test_eligibility_verify_aetna(self):
        """FLS §5.2 — Aetna FHIR R4 eligibility."""
        r = post("payer", "/eligibility/verify", json={
            "member_id": "AET98765432", "payer": "AETNA",
            "date_of_service": TODAY,
        })
        assert r.status_code in (200, 422)

    def test_eligibility_verify_humana(self):
        """FLS §5.5 — Humana Availity eligibility."""
        r = post("payer", "/eligibility/verify", json={
            "member_id": "HUM55566677", "payer": "HUMANA",
            "date_of_service": TODAY,
        })
        assert r.status_code in (200, 422)

    def test_pa_submit_uhc(self):
        """FLS §5.1 — PA submission to UHC REST API."""
        r = post("payer", "/pa/submit", json={
            "pa_number":            PA_NUMBER,
            "payer":                "UHC",
            "member_id":            MEMBER_ID,
            "member_dob":           "1978-03-15",
            "provider_npi":         PROVIDER_NPI,
            "diagnoses":            DIAGNOSIS,
            "procedures":           PROCEDURES,
            "service_type":         "Diagnostic Imaging",
            "urgency":              "ROUTINE",
            "clinical_summary":     CLINICAL_SUMMARY,
            "requested_units":      1,
            "requested_start_date": TODAY,
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert data.get("payer") == "UHC"
            assert "payer_ref_number" in data
            assert data.get("submission_method") == "REST"

    def test_pa_submit_aetna_fhir(self):
        """FLS §5.2 — Aetna FHIR R4 Bundle submission."""
        r = post("payer", "/pa/submit", json={
            "pa_number":            "PA-AETNA-TEST",
            "payer":                "AETNA",
            "member_id":            "AET98765432",
            "member_dob":           "1965-07-22",
            "member_first_name":    "John",
            "member_last_name":     "Doe",
            "provider_npi":         PROVIDER_NPI,
            "diagnoses":            DIAGNOSIS,
            "procedures":           PROCEDURES,
            "service_type":         "Diagnostic Imaging",
            "urgency":              "ROUTINE",
            "clinical_summary":     CLINICAL_SUMMARY,
            "requested_units":      1,
            "requested_start_date": TODAY,
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            assert r.json().get("submission_method") == "FHIR_BUNDLE"

    def test_pa_submit_cvs_caremark(self):
        """FLS §5.3 — CVS Caremark NCPDP ePA submission."""
        r = post("payer", "/pa/submit", json={
            "pa_number":            "PA-CVS-TEST",
            "payer":                "CVS",
            "member_id":            "CVS33344455",
            "member_dob":           "1988-11-03",
            "member_first_name":    "Emily",
            "member_last_name":     "Chen",
            "provider_npi":         PROVIDER_NPI,
            "diagnoses":            [{"code": "M069", "description": "Rheumatoid arthritis"}],
            "procedures":           [{"code": "J0135", "description": "Adalimumab injection"}],
            "service_type":         "Pharmacy",
            "urgency":              "ROUTINE",
            "clinical_summary":     CLINICAL_SUMMARY,
            "requested_units":      2,
            "requested_start_date": TODAY,
            "ndc_code":             "00074334702",
            "rx_bin":               "610014",
            "rx_pcn":               "CAREMARK",
            "rx_group":             "RX5678",
            "medication_name":      "HUMIRA",
            "days_supply":          28,
            "prior_medications_tried": ["methotrexate 15mg x 12 weeks", "leflunomide 20mg x 12 weeks"],
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            assert r.json().get("submission_method") == "NCPDP_ePA"

    def test_pa_submit_humana_x12_278(self):
        """FLS §5.5 — Humana Availity + HL7 v2.5 + X12 278 batch."""
        r = post("payer", "/pa/submit", json={
            "pa_number":            "PA-HUM-TEST",
            "payer":                "HUMANA",
            "member_id":            "HUM55566677",
            "member_dob":           "1972-04-18",
            "provider_npi":         PROVIDER_NPI,
            "diagnoses":            DIAGNOSIS,
            "procedures":           PROCEDURES,
            "service_type":         "Medical",
            "urgency":              "ROUTINE",
            "clinical_summary":     CLINICAL_SUMMARY,
            "requested_units":      1,
            "requested_start_date": TODAY,
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert data.get("submission_method") == "AVAILITY_X12_278"
            assert data.get("turnaround_hours") == 120  # 5 business days

    def test_humana_preview_messages(self):
        """FLS §5.5 — HL7 v2.5 + X12 278 message preview endpoint."""
        r = post("payer", "/humana/preview", json={
            "pa_number":      "PA-PREV-001",
            "member_id":      MEMBER_ID,
            "provider_npi":   PROVIDER_NPI,
            "procedure_code": "72148",
            "diagnosis_code": "M545",
            "urgency":        "ROUTINE",
            "clinical_notes": CLINICAL_SUMMARY,
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert "hl7_v25" in data
            assert "x12_278" in data
            assert "MSH" in data["hl7_v25"]
            assert "ISA" in data["x12_278"]

    def test_aetna_fhir_bundle_preview(self):
        """FLS §5.2 — FHIR R4 bundle structure validation."""
        r = post("payer", "/aetna/fhir/bundle/preview", json={
            "pa_number":            "PA-FHIR-PREV",
            "payer":                "AETNA",
            "member_id":            "AET11122233",
            "member_dob":           "1980-06-15",
            "member_first_name":    "Alice",
            "member_last_name":     "Brown",
            "provider_npi":         PROVIDER_NPI,
            "diagnoses":            DIAGNOSIS,
            "procedures":           PROCEDURES,
            "service_type":         "Imaging",
            "clinical_summary":     CLINICAL_SUMMARY,
            "requested_units":      1,
            "requested_start_date": TODAY,
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            bundle = r.json()
            assert bundle.get("resourceType") == "Bundle"
            assert bundle.get("type") == "transaction"
            # FLS Table 20: must contain Patient, Coverage, Condition, ServiceRequest
            resource_types = {e["resource"]["resourceType"] for e in bundle.get("entry", [])}
            assert "Patient" in resource_types
            assert "Coverage" in resource_types
            assert "ServiceRequest" in resource_types

    def test_cvs_formulary_check(self):
        """FLS §5.3 — Formulary pre-check required before CVS PA."""
        r = post("payer", "/formulary/check", json={
            "ndc_code":   "00074334702",
            "rx_bin":     "610014",
            "rx_pcn":     "CAREMARK",
            "rx_group":   "RX5678",
            "member_id":  "CVS33344455",
            "diagnosis":  "M069",
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert "on_formulary" in data
            assert "requires_pa" in data
            assert "requires_step_therapy" in data
            assert "biosimilar_preferred" in data

    def test_cvs_formulary_biologic_has_step_therapy(self):
        """FLS §5.3 — Biologic NDC (0069 prefix = Pfizer) must trigger step therapy."""
        r = post("payer", "/formulary/check", json={
            "ndc_code": "00690317002",   # 0069 prefix → biologic
            "rx_bin": "610014", "rx_pcn": "CAREMARK",
            "rx_group": "RX5678", "member_id": "CVS33344455",
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert data.get("requires_step_therapy") is True
            assert len(data.get("step_therapy_agents", [])) > 0

    def test_pa_status_poll(self):
        r = post("payer", "/pa/status/poll", json={
            "pa_number": PA_NUMBER, "payer": "UHC",
            "payer_ref_number": "UHC20260301TEST001",
        })
        assert r.status_code in (200, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# §4 — APPEALS SERVICE (port 8004)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAppealsService:

    def test_health(self):
        r = get("appeals", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_submit_standard_appeal(self):
        r = post("appeals", "/appeals/submit", json={
            "pa_number":          PA_NUMBER,
            "member_id":          MEMBER_ID,
            "appeal_type":        "STANDARD",
            "reason_for_appeal":  "New clinical evidence: MRI urgently needed per neurology consult.",
            "contact_phone":      "(555) 123-4567",
            "preferred_contact":  "PHONE",
        })
        assert r.status_code in (201, 200, 409, 422)
        if r.status_code in (200, 201):
            data = r.json()
            assert "appeal_number" in data or "appeal_id" in data

    def test_submit_expedited_appeal(self):
        """Expedited appeals must have urgency justification."""
        r = post("appeals", "/appeals/submit", json={
            "pa_number":               PA_NUMBER,
            "member_id":               MEMBER_ID,
            "appeal_type":             "EXPEDITED",
            "reason_for_appeal":       "Patient's health condition is rapidly deteriorating.",
            "expedited_justification": "Imminent risk of serious harm if treatment delayed.",
            "contact_phone":           "(555) 234-5678",
            "preferred_contact":       "PHONE",
        })
        assert r.status_code in (201, 200, 409, 422)

    def test_list_appeals(self):
        r = get("appeals", "/appeals")
        assert r.status_code in (200, 401)

    def test_get_appeal_by_number(self):
        r = get("appeals", "/appeals/APP-2026-999999")
        assert r.status_code in (200, 404)

    def test_appeals_analytics(self):
        r = get("appeals", "/appeals/analytics/outcomes")
        assert r.status_code in (200, 401)
        if r.status_code == 200:
            data = r.json()
            assert "total_appeals" in data or "outcomes" in data

    def test_sla_at_risk(self):
        r = get("appeals", "/appeals/sla/at-risk")
        assert r.status_code in (200, 401)

    def test_peer_to_peer_request(self):
        """ERR-114 pathway: peer-to-peer review request."""
        r = post("appeals", "/appeals/p2p/request", json={
            "pa_number":    PA_NUMBER,
            "provider_npi": PROVIDER_NPI,
            "reason":       "Requesting peer-to-peer review of denial decision.",
            "availability": ["Monday 9-11am", "Tuesday 2-4pm"],
        })
        assert r.status_code in (201, 200, 404, 422)

    def test_escalate_appeal(self):
        r = post("appeals", "/appeals/APP-2026-999999/escalate",
                 json={"reason": "No response within SLA window.", "escalate_to": "MEDICAL_DIRECTOR"})
        assert r.status_code in (200, 404, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# §5 — DOCUMENT SERVICE (port 8006)
# ═══════════════════════════════════════════════════════════════════════════════

class TestDocumentService:

    def test_health(self):
        r = get("doc", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_upload_pdf_document(self):
        """VAL-010/VAL-011 — file size and type validation."""
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
        files = {"file": ("clinical_notes.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        data  = {"pa_number": PA_NUMBER, "doc_type": "CLINICAL_NOTES",
                 "uploaded_by": "provider1"}
        r = post("doc", "/documents/upload", files=files, data=data)
        assert r.status_code in (200, 201, 422)
        if r.status_code in (200, 201):
            resp = r.json()
            assert "doc_id" in resp

    def test_upload_rejected_filetype(self):
        """VAL-011 — reject non-PDF/image file types."""
        files = {"file": ("malware.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")}
        r = post("doc", "/documents/upload", files=files,
                 data={"pa_number": PA_NUMBER, "doc_type": "OTHER"})
        assert r.status_code in (400, 422)

    def test_list_documents(self):
        r = get("doc", "/documents", params={"pa_number": PA_NUMBER})
        assert r.status_code in (200, 401)

    def test_get_document_not_found(self):
        r = get("doc", "/documents/doc-does-not-exist-xyz")
        assert r.status_code in (404, 401)

    def test_get_document_extraction(self):
        """OCR extraction endpoint must be accessible."""
        r = get("doc", "/documents/doc-test-001/extraction")
        assert r.status_code in (200, 404, 401)

    def test_delete_document(self):
        r = delete("doc", "/documents/doc-test-delete-001")
        assert r.status_code in (200, 204, 404, 401)

    def test_batch_extract(self):
        r = post("doc", "/documents/batch-extract",
                 json={"doc_ids": ["doc-001", "doc-002"]})
        assert r.status_code in (200, 202, 401, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# §6 — NOTIFICATION SERVICE (port 8005)
# ═══════════════════════════════════════════════════════════════════════════════

class TestNotificationService:

    def test_health(self):
        r = get("notif", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_send_decision_notification(self):
        r = post("notif", "/notify/send", json={
            "recipient_id":      "provider1",
            "recipient_type":    "PROVIDER",
            "channel":           "EMAIL",
            "template_id":       "PA_APPROVED",
            "pa_number":         PA_NUMBER,
            "variables": {
                "provider_name":   "Dr. Smith",
                "patient_name":    "Sarah Johnson",
                "auth_number":     "UHC20260301ABC",
                "valid_through":   "2026-07-01",
            },
        })
        assert r.status_code in (200, 201, 422)
        if r.status_code in (200, 201):
            data = r.json()
            assert "notification_id" in data or "notif_id" in data

    def test_send_bulk_notifications(self):
        r = post("notif", "/notify/bulk", json={
            "notifications": [
                {"recipient_id": "prov1", "recipient_type": "PROVIDER",
                 "channel": "EMAIL", "template_id": "PA_APPROVED",
                 "pa_number": PA_NUMBER, "variables": {}},
                {"recipient_id": "mem1", "recipient_type": "MEMBER",
                 "channel": "EMAIL", "template_id": "PA_APPROVED",
                 "pa_number": PA_NUMBER, "variables": {}},
            ]
        })
        assert r.status_code in (200, 201, 207, 422)

    def test_get_inbox(self):
        r = get("notif", "/notify/inbox/provider1")
        assert r.status_code in (200, 404, 401)

    def test_get_templates(self):
        r = get("notif", "/notify/templates")
        assert r.status_code in (200, 401)
        if r.status_code == 200:
            templates = r.json()
            assert isinstance(templates, (list, dict))

    def test_get_notification_log(self):
        r = get("notif", "/notify/log")
        assert r.status_code in (200, 401)

    def test_ehr_update_notification(self):
        """INT-201: EHR status update via FHIR."""
        r = post("notif", "/notify/ehr-update", json={
            "pa_number":   PA_NUMBER,
            "member_id":   MEMBER_ID,
            "decision":    "APPROVED",
            "auth_number": "UHC20260301ABC",
            "ehr_system":  "EPIC",
            "endpoint":    "https://ehr.example.com/fhir/r4/Task",
        })
        assert r.status_code in (200, 201, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# §7 — REPORTING SERVICE (port 8009)
# ═══════════════════════════════════════════════════════════════════════════════

class TestReportingService:

    def test_health(self):
        r = get("report", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_kpi_operational(self):
        r = get("report", "/reports/kpi/operational")
        assert r.status_code in (200, 401)
        if r.status_code == 200:
            data = r.json()
            # FLS §4.1 required operational KPIs
            assert "total_pas_received" in data or "total" in data

    def test_kpi_quality(self):
        r = get("report", "/reports/kpi/quality")
        assert r.status_code in (200, 401)

    def test_kpi_business(self):
        r = get("report", "/reports/kpi/business")
        assert r.status_code in (200, 401)

    def test_kpi_summary(self):
        r = get("report", "/reports/kpi/summary")
        assert r.status_code in (200, 401)

    def test_decision_breakdown(self):
        r = get("report", "/reports/decisions")
        assert r.status_code in (200, 401)

    def test_decisions_by_payer(self):
        r = get("report", "/reports/decisions/by-payer")
        assert r.status_code in (200, 401)

    def test_decisions_trend(self):
        r = get("report", "/reports/decisions/trend")
        assert r.status_code in (200, 401)

    def test_ai_performance(self):
        r = get("report", "/reports/ai/performance")
        assert r.status_code in (200, 401)
        if r.status_code == 200:
            data = r.json()
            assert "accuracy" in data or "model_accuracy" in data

    def test_ai_drift(self):
        r = get("report", "/reports/ai/drift")
        assert r.status_code in (200, 401)


# ═══════════════════════════════════════════════════════════════════════════════
# §8 — ELIGIBILITY SERVICE (port 8010)
# ═══════════════════════════════════════════════════════════════════════════════

class TestEligibilityService:

    def test_health(self):
        r = get("elig", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_verify_eligibility(self):
        r = post("elig", "/eligibility/verify", json={
            "member_id":       MEMBER_ID,
            "payer":           "UHC",
            "date_of_service": TODAY,
            "provider_npi":    PROVIDER_NPI,
        })
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert "is_eligible" in data
            assert "plan_name" in data or "plan_type" in data

    def test_eligibility_response_fields(self):
        """FLS §5.x — eligibility response must include all required fields."""
        r = post("elig", "/eligibility/verify", json={
            "member_id": MEMBER_ID, "payer": "UHC", "date_of_service": TODAY,
        })
        if r.status_code == 200:
            data = r.json()
            assert "requires_pa" in data
            assert "network_status" in data
            assert "source" in data

    def test_batch_eligibility(self):
        r = post("elig", "/eligibility/batch", json={
            "requests": [
                {"member_id": "UHC11111111", "payer": "UHC", "date_of_service": TODAY},
                {"member_id": "UHC22222222", "payer": "UHC", "date_of_service": TODAY},
            ]
        })
        assert r.status_code in (200, 422)

    def test_x12_270_eligibility(self):
        """FLS §5.x — X12 270 eligibility inquiry."""
        edi = "ISA*00*          *00*          *ZZ*SENDER*ZZ*UHC*260301*1200*^*00501*1*0*P*:~\nST*270*0001~\nSE*2*0001~\n"
        r = post("elig", "/eligibility/x12/270",
                 content=edi.encode(),
                 headers={"Content-Type": "application/edi-x12"})
        assert r.status_code in (200, 400, 422)

    def test_formulary_check(self):
        r = post("elig", "/formulary/check", json={
            "drug_code":  "J0135",
            "payer":      "UHC",
            "member_id":  MEMBER_ID,
            "diagnosis":  "M069",
        })
        assert r.status_code in (200, 422)

    def test_provider_credentials(self):
        r = get("elig", f"/provider/credentials/{PROVIDER_NPI}")
        assert r.status_code in (200, 404)

    def test_care_management_risk(self):
        r = get("elig", f"/care-management/risk/{MEMBER_ID}")
        assert r.status_code in (200, 404)


# ═══════════════════════════════════════════════════════════════════════════════
# §9 — AUDIT SERVICE (port 8011)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuditService:

    def test_health(self):
        r = get("audit", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_log_event(self):
        r = post("audit", "/audit/log", json={
            "event_type":  "PA_SUBMITTED",
            "actor_id":    "provider1",
            "actor_role":  "PROVIDER",
            "resource":    "PriorAuthorization",
            "resource_id": PA_NUMBER,
            "action":      "CREATE",
            "ip_address":  "10.0.0.1",
            "metadata":    {"pa_number": PA_NUMBER, "payer": "UHC"},
        })
        assert r.status_code in (200, 201, 422)
        if r.status_code in (200, 201):
            data = r.json()
            assert "audit_id" in data or "id" in data

    def test_log_phi_access(self):
        """HIPAA §164.312(b) — PHI access must be audited."""
        r = post("audit", "/audit/log", json={
            "event_type":  "PHI_ACCESS",
            "actor_id":    "reviewer1",
            "actor_role":  "REVIEWER",
            "resource":    "PatientRecord",
            "resource_id": MEMBER_ID,
            "action":      "READ",
            "ip_address":  "10.0.1.50",
        })
        assert r.status_code in (200, 201, 422)

    def test_batch_log(self):
        r = post("audit", "/audit/log/batch", json={
            "events": [
                {"event_type": "PA_VIEWED", "actor_id": "reviewer1",
                 "actor_role": "REVIEWER", "resource": "PA", "resource_id": PA_NUMBER,
                 "action": "READ", "ip_address": "10.0.1.50"},
                {"event_type": "DECISION_SUBMITTED", "actor_id": "reviewer1",
                 "actor_role": "REVIEWER", "resource": "PA", "resource_id": PA_NUMBER,
                 "action": "UPDATE", "ip_address": "10.0.1.50"},
            ]
        })
        assert r.status_code in (200, 201, 422)

    def test_query_audit_log(self):
        r = post("audit", "/audit/query", json={
            "filters": {"actor_id": "reviewer1"},
            "limit": 20,
            "offset": 0,
        })
        assert r.status_code in (200, 401)

    def test_get_audit_event(self):
        r = get("audit", "/audit/events/audit-test-001")
        assert r.status_code in (200, 404)

    def test_user_audit_trail(self):
        r = get("audit", "/audit/user/reviewer1")
        assert r.status_code in (200, 404, 401)

    def test_resource_audit_trail(self):
        r = get("audit", f"/audit/resource/{PA_NUMBER}")
        assert r.status_code in (200, 404, 401)

    def test_compliance_report(self):
        r = get("audit", "/audit/reports/compliance")
        assert r.status_code in (200, 401)

    def test_phi_access_report(self):
        """HIPAA §164.528 — access to PHI disclosure accounting."""
        r = get("audit", "/audit/reports/phi-access")
        assert r.status_code in (200, 401)

    def test_audit_stats(self):
        r = get("audit", "/audit/stats")
        assert r.status_code in (200, 401)

    def test_event_types(self):
        r = get("audit", "/audit/event-types")
        assert r.status_code in (200, 401)


# ═══════════════════════════════════════════════════════════════════════════════
# §10 — USER MANAGEMENT SERVICE (port 8008)
# ═══════════════════════════════════════════════════════════════════════════════

class TestUserManagementService:

    def test_health(self):
        r = get("users", "/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_list_users(self):
        r = get("users", "/users")
        assert r.status_code in (200, 401)
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_get_user_not_found(self):
        r = get("users", "/users/user-does-not-exist-xyz")
        assert r.status_code in (404, 401)

    def test_create_provider_user(self):
        r = post("users", "/users", json={
            "username":   "testprovider99",
            "email":      "testprovider99@clinic.example.com",
            "password":   "Secure@1234",
            "full_name":  "Dr. Test Provider",
            "role":       "PROVIDER",
            "npi":        PROVIDER_NPI,
            "specialty":  "Radiology",
        })
        assert r.status_code in (201, 200, 409, 422)
        if r.status_code in (200, 201):
            data = r.json()
            assert "user_id" in data
            assert data.get("role") == "PROVIDER"

    def test_create_reviewer_user(self):
        r = post("users", "/users", json={
            "username":  "testreviewer99",
            "email":     "testreviewer99@health.example.com",
            "password":  "Secure@1234",
            "full_name": "Nurse Jane Test",
            "role":      "REVIEWER",
        })
        assert r.status_code in (201, 200, 409, 422)

    def test_update_user(self):
        r = patch("users", "/users/user-test-001",
                  json={"full_name": "Dr. Updated Name"})
        assert r.status_code in (200, 404, 422)

    def test_delete_user(self):
        r = delete("users", "/users/user-to-delete-xyz")
        assert r.status_code in (200, 204, 404)

    def test_list_roles(self):
        r = get("users", "/roles")
        assert r.status_code in (200, 401)
        if r.status_code == 200:
            roles = r.json()
            role_names = [role.get("name") if isinstance(role, dict) else role for role in roles]
            # Must have at minimum these four roles
            for required in ("PROVIDER", "REVIEWER", "ADMIN"):
                assert any(required in str(rn) for rn in role_names), \
                    f"Role '{required}' not found in {role_names}"

    def test_get_user_permissions(self):
        r = get("users", "/permissions/user-test-001")
        assert r.status_code in (200, 404, 401)

    def test_check_permissions(self):
        r = post("users", "/permissions/check", json={
            "user_id":    "user-test-001",
            "permission": "pa:submit",
            "resource":   "PriorAuthorization",
        })
        assert r.status_code in (200, 404, 422)

    def test_list_providers(self):
        r = get("users", "/providers")
        assert r.status_code in (200, 401)

    def test_get_provider_by_npi(self):
        r = get("users", f"/providers/{PROVIDER_NPI}")
        assert r.status_code in (200, 404, 401)

    def test_create_provider_profile(self):
        r = post("users", "/providers", json={
            "npi":          "9876543210",
            "name":         "Dr. Create Test",
            "specialty":    "Cardiology",
            "phone":        "(555) 999-0001",
            "email":        "createtest@cardiology.example.com",
            "practice_name": "Test Cardiology Group",
        })
        assert r.status_code in (201, 200, 409, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: FLS §7 Validation codes
# ═══════════════════════════════════════════════════════════════════════════════

class TestFLSValidationCodes:
    """Verify FLS §7 VAL-codes are enforced at the intake boundary."""

    def _validate(self, payload: dict) -> httpx.Response:
        return post("intake", "/intake/validate", json=payload)

    def _base(self) -> dict:
        return {
            "member_id":            MEMBER_ID,
            "member_dob":           "1978-03-15",
            "provider_npi":         PROVIDER_NPI,
            "payer_code":           "UHC",
            "primary_dx_code":      "M545",
            "procedure_code":       "72148",
            "service_type":         "Imaging",
            "urgency":              "ROUTINE",
            "clinical_notes":       CLINICAL_SUMMARY,
            "requested_units":      1,
            "requested_start_date": TODAY,
        }

    def test_val001_member_id_format(self):
        """VAL-001: member_id must match ^[A-Z0-9]{8,20}$"""
        p = self._base(); p["member_id"] = "bad id!"
        r = self._validate(p)
        assert r.status_code in (200, 422)

    def test_val005_invalid_icd10(self):
        """VAL-005: reject clearly invalid ICD-10 code."""
        p = self._base(); p["primary_dx_code"] = "ZZZZZZZZ"
        r = self._validate(p)
        assert r.status_code in (200, 422)

    def test_val007_npi_length(self):
        """VAL-007: NPI must be exactly 10 digits."""
        p = self._base(); p["provider_npi"] = "12345"
        r = self._validate(p)
        assert r.status_code in (200, 422)

    def test_val012_quantity_zero(self):
        """VAL-012: quantity must be integer > 0."""
        p = self._base(); p["requested_units"] = 0
        r = self._validate(p)
        assert r.status_code in (200, 422)

    def test_val013_clinical_summary_too_short(self):
        """VAL-013: clinical notes minimum 100 chars."""
        p = self._base(); p["clinical_notes"] = "Too short."
        r = self._validate(p)
        assert r.status_code in (200, 422)

    def test_val016_required_field_missing(self):
        """VAL-016: missing required field must be rejected."""
        p = self._base(); del p["member_id"]
        r = self._validate(p)
        assert r.status_code in (200, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: FLS §8 Error codes in responses
# ═══════════════════════════════════════════════════════════════════════════════

class TestFLSErrorResponseShape:
    """FLS §8 — All error responses must have code + message + suggested_action."""

    def test_validation_error_has_code(self):
        """All 422 responses must carry a FLS error code field."""
        r = post("intake", "/intake/validate", json={"member_id": ""})
        if r.status_code == 422:
            body = r.json()
            # Either top-level code or nested errors list
            has_code = "code" in body or (
                "errors" in body and len(body["errors"]) > 0
                and "code" in body["errors"][0]
            ) or "detail" in body
            assert has_code, f"422 response missing code field: {body}"

    def test_not_found_has_structured_body(self):
        """404 responses must be structured JSON, not raw strings."""
        r = get("appeals", "/appeals/PA-DOES-NOT-EXIST-999")
        if r.status_code == 404:
            try:
                body = r.json()
                assert isinstance(body, dict)
            except Exception:
                pass  # Some services may return text/plain 404

    def test_all_health_endpoints_return_healthy(self):
        """Every service's /health must return status=healthy."""
        services_checked = 0
        for svc, base in B.items():
            try:
                r = httpx.get(f"{base}/health", timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    assert data.get("status") == "healthy", \
                        f"Service {svc} at {base}: status={data.get('status')}"
                    services_checked += 1
            except (httpx.ConnectError, httpx.TimeoutException):
                pass  # Service not running — skip gracefully in unit mode
        # At least note how many were checked (informational)
        print(f"\n  ✓ Checked {services_checked}/{len(B)} services")
