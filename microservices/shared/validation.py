"""
shared/validation.py — FLS §7 & §8 Structured Validation & Error Layer

Implements EVERY code defined in the Field-Level Specifications:
  - 20 VAL-codes  (§7.1 field-level validation rules)
  - 14 ERR-codes  (§8.1 user-facing error messages)
  - 10 API-codes  (§8.2 API integration error codes)

Usage:
    from microservices.shared.validation import (
        ValidationError, PAValidationError, PayerAPIError,
        VAL, ERR, API,
        validate_pa_submission, validate_member_id, validate_npi,
    )

FastAPI integration:
    from microservices.shared.validation import install_exception_handlers
    install_exception_handlers(app)
"""
from __future__ import annotations

import re
import hashlib
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


# ═══════════════════════════════════════════════════════════════════════════════
# §7 — VALIDATION CODES  (VAL-001 … VAL-020)
# ═══════════════════════════════════════════════════════════════════════════════

class VAL:
    """FLS §7.1 field-level validation rule codes."""
    MEMBER_ID        = "VAL-001"   # Regex: ^[A-Z0-9]{8,20}$
    DATE_OF_BIRTH    = "VAL-002"   # Past date, age 0-120
    PHONE_NUMBER     = "VAL-003"   # US format (XXX) XXX-XXXX
    EMAIL            = "VAL-004"   # RFC 5322
    ICD10_CODE       = "VAL-005"   # Valid ICD-10-CM current year
    CPT_CODE         = "VAL-006"   # Valid CPT/HCPCS current year
    NPI              = "VAL-007"   # 10-digit, Luhn check
    TAX_ID           = "VAL-008"   # EIN format XX-XXXXXXX
    ZIP_CODE         = "VAL-009"   # XXXXX or XXXXX-XXXX
    FILE_SIZE        = "VAL-010"   # Max 25MB per file
    FILE_TYPE        = "VAL-011"   # PDF, JPG, PNG, TIFF only
    QUANTITY         = "VAL-012"   # Integer > 0, max 999
    CLINICAL_SUMMARY = "VAL-013"   # Min 100, max 5000 chars
    DATE_RANGE       = "VAL-014"   # Start < End
    FUTURE_DATE      = "VAL-015"   # Cannot be > 30 days in future
    REQUIRED_FIELD   = "VAL-016"   # Not null / not empty
    AGE_SERVICE      = "VAL-017"   # Age appropriate for requested service
    DUPLICATE_PA     = "VAL-018"   # No duplicate PA same service ≤ 30 days
    NETWORK_CHECK    = "VAL-019"   # Provider must be in-network
    ELIGIBILITY      = "VAL-020"   # Member must have active coverage


# ═══════════════════════════════════════════════════════════════════════════════
# §8.1 — USER-FACING ERROR CODES  (ERR-100 … ERR-114)
# ═══════════════════════════════════════════════════════════════════════════════

class ERR:
    """FLS §8.1 user-facing error messages with suggested actions."""

    _CATALOG: Dict[str, Dict[str, str]] = {
        "ERR-100": {
            "code":             "ERR-100",
            "message":          "We cannot verify this member ID. Please check the ID and try again.",
            "suggested_action": "Verify Member ID with insurance card",
            "http_status":      "422",
        },
        "ERR-101": {
            "code":             "ERR-101",
            "message":          "This member's coverage is not currently active. Please contact the payer.",
            "suggested_action": "Check coverage effective dates",
            "http_status":      "422",
        },
        "ERR-102": {
            "code":             "ERR-102",
            "message":          "A prior authorization for this service already exists.",
            "suggested_action": "Review existing PA or wait for decision",
            "http_status":      "409",
        },
        "ERR-103": {
            "code":             "ERR-103",
            "message":          "This provider is out-of-network. PA may require additional documentation.",
            "suggested_action": "Verify network status or provide justification",
            "http_status":      "422",
        },
        "ERR-104": {
            "code":             "ERR-104",
            "message":          "Please upload clinical notes supporting medical necessity.",
            "suggested_action": "Upload required documents",
            "http_status":      "422",
        },
        "ERR-105": {
            "code":             "ERR-105",
            "message":          "Document upload failed. Please try again or use a smaller file.",
            "suggested_action": "Check file size (<25MB) and format (PDF, JPG, PNG, TIFF)",
            "http_status":      "400",
        },
        "ERR-106": {
            "code":             "ERR-106",
            "message":          "The diagnosis code entered is not valid for the current year.",
            "suggested_action": "Verify ICD-10 code or select from lookup",
            "http_status":      "422",
        },
        "ERR-107": {
            "code":             "ERR-107",
            "message":          "This service is not covered under the member's plan.",
            "suggested_action": "Review plan benefits or contact payer",
            "http_status":      "422",
        },
        "ERR-108": {
            "code":             "ERR-108",
            "message":          "Plan requires documented trial of preferred alternatives before this service.",
            "suggested_action": "Document prior conservative care or step therapy failure",
            "http_status":      "422",
        },
        "ERR-109": {
            "code":             "ERR-109",
            "message":          "Your session has expired. Please log in again.",
            "suggested_action": "Re-authenticate and resume",
            "http_status":      "401",
        },
        "ERR-110": {
            "code":             "ERR-110",
            "message":          "The PA system is temporarily unavailable. Please try again shortly.",
            "suggested_action": "Wait and retry, or submit via fax",
            "http_status":      "503",
        },
        "ERR-111": {
            "code":             "ERR-111",
            "message":          "Unable to reach payer systems. Your request has been queued.",
            "suggested_action": "Request will process when connection is restored",
            "http_status":      "503",
        },
        "ERR-112": {
            "code":             "ERR-112",
            "message":          "This service has age restrictions for the member.",
            "suggested_action": "Verify member age or select alternative service",
            "http_status":      "422",
        },
        "ERR-113": {
            "code":             "ERR-113",
            "message":          "Requested quantity exceeds plan maximum.",
            "suggested_action": "Reduce quantity or provide clinical justification for excess",
            "http_status":      "422",
        },
        "ERR-114": {
            "code":             "ERR-114",
            "message":          "Payer requires peer-to-peer discussion before denial appeal.",
            "suggested_action": "Contact payer to schedule peer-to-peer review",
            "http_status":      "422",
        },
    }

    @classmethod
    def get(cls, code: str, **overrides) -> Dict[str, str]:
        entry = dict(cls._CATALOG.get(code, {
            "code": code, "message": "An error occurred.", "suggested_action": "Contact support.",
        }))
        entry.update(overrides)
        return entry

    @classmethod
    def body(cls, code: str, **overrides) -> Dict[str, Any]:
        e = cls.get(code, **overrides)
        return {
            "error":            True,
            "code":             e["code"],
            "message":          e["message"],
            "suggested_action": e["suggested_action"],
        }

    # Convenience accessors
    MEMBER_NOT_FOUND         = "ERR-100"
    COVERAGE_INACTIVE        = "ERR-101"
    DUPLICATE_PA             = "ERR-102"
    OUT_OF_NETWORK           = "ERR-103"
    MISSING_CLINICAL_DOCS    = "ERR-104"
    UPLOAD_FAILED            = "ERR-105"
    INVALID_ICD10            = "ERR-106"
    SERVICE_NOT_COVERED      = "ERR-107"
    STEP_THERAPY_REQUIRED    = "ERR-108"
    SESSION_EXPIRED          = "ERR-109"
    SYSTEM_UNAVAILABLE       = "ERR-110"
    PAYER_API_ERROR          = "ERR-111"
    AGE_RESTRICTION          = "ERR-112"
    QUANTITY_EXCEEDED        = "ERR-113"
    PEER_TO_PEER_REQUIRED    = "ERR-114"


# ═══════════════════════════════════════════════════════════════════════════════
# §8.2 — API INTEGRATION ERROR CODES  (API-001 … API-010)
# ═══════════════════════════════════════════════════════════════════════════════

class API:
    """FLS §8.2 API integration error codes."""

    _CATALOG: Dict[str, Dict[str, str]] = {
        "API-001": {
            "code":             "API-001",
            "scenario":         "Authentication failure",
            "message":          "Invalid OAuth token or credentials",
            "suggested_action": "Refresh token and retry",
        },
        "API-002": {
            "code":             "API-002",
            "scenario":         "Rate limit exceeded",
            "message":          "Too many requests to payer API",
            "suggested_action": "Implement exponential backoff",
        },
        "API-003": {
            "code":             "API-003",
            "scenario":         "Malformed request",
            "message":          "Request body does not match API schema",
            "suggested_action": "Validate request against schema",
        },
        "API-004": {
            "code":             "API-004",
            "scenario":         "Payer system timeout",
            "message":          "No response from payer within 30 seconds",
            "suggested_action": "Retry with exponential backoff",
        },
        "API-005": {
            "code":             "API-005",
            "scenario":         "Unknown payer response",
            "message":          "Payer returned unexpected response structure",
            "suggested_action": "Log for manual review",
        },
        "API-006": {
            "code":             "API-006",
            "scenario":         "Certificate expired",
            "message":          "mTLS certificate expired or invalid",
            "suggested_action": "Renew certificate",
        },
        "API-007": {
            "code":             "API-007",
            "scenario":         "Unsupported payer version",
            "message":          "Payer API version no longer supported",
            "suggested_action": "Upgrade integration to new version",
        },
        "API-008": {
            "code":             "API-008",
            "scenario":         "Field mapping error",
            "message":          "Required payer field missing in our data",
            "suggested_action": "Check field mapping configuration",
        },
        "API-009": {
            "code":             "API-009",
            "scenario":         "Character encoding issue",
            "message":          "Special characters not properly encoded",
            "suggested_action": "Apply UTF-8 encoding",
        },
        "API-010": {
            "code":             "API-010",
            "scenario":         "Webhook delivery failed",
            "message":          "Unable to deliver status update to provider",
            "suggested_action": "Queue for retry",
        },
    }

    @classmethod
    def get(cls, code: str) -> Dict[str, str]:
        return dict(cls._CATALOG.get(code, {"code": code, "message": "API error"}))

    AUTH_FAILURE         = "API-001"
    RATE_LIMITED         = "API-002"
    MALFORMED_REQUEST    = "API-003"
    TIMEOUT              = "API-004"
    UNKNOWN_RESPONSE     = "API-005"
    CERT_EXPIRED         = "API-006"
    VERSION_UNSUPPORTED  = "API-007"
    FIELD_MAPPING_ERROR  = "API-008"
    ENCODING_ERROR       = "API-009"
    WEBHOOK_FAILED       = "API-010"


# ═══════════════════════════════════════════════════════════════════════════════
# EXCEPTION CLASSES
# ═══════════════════════════════════════════════════════════════════════════════

class PAValidationError(Exception):
    """Raised when a PA field fails FLS §7 validation. Carries VAL code."""
    def __init__(self, val_code: str, field: str, detail: str):
        self.val_code = val_code
        self.field    = field
        self.detail   = detail
        super().__init__(f"{val_code} [{field}]: {detail}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error":      True,
            "code":       self.val_code,
            "field":      self.field,
            "message":    self.detail,
            "suggested_action": "Correct the field value and resubmit.",
        }


class PAUserError(Exception):
    """Raised for FLS §8.1 ERR-1xx user-facing errors."""
    def __init__(self, err_code: str, detail_override: Optional[str] = None, **kwargs):
        self.err_code = err_code
        self.body     = ERR.body(err_code, **({"message": detail_override} if detail_override else {}))
        self.body.update(kwargs)
        super().__init__(self.body["message"])

    def http_status(self) -> int:
        return int(ERR.get(self.err_code).get("http_status", "422"))


class PayerAPIError(Exception):
    """Raised for FLS §8.2 API-00x integration errors."""
    def __init__(self, api_code: str, payer: str = "", raw: str = ""):
        self.api_code = api_code
        self.payer    = payer
        self.raw      = raw
        entry         = API.get(api_code)
        self.message  = entry.get("message", "Payer API error")
        super().__init__(f"{api_code} [{payer}]: {self.message}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error":            True,
            "code":             self.api_code,
            "payer":            self.payer,
            "message":          self.message,
            "suggested_action": API.get(self.api_code).get("suggested_action", ""),
        }


# ═══════════════════════════════════════════════════════════════════════════════
# FASTAPI EXCEPTION HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

def install_exception_handlers(app: FastAPI) -> None:
    """Register FLS-compliant exception handlers on a FastAPI app."""

    @app.exception_handler(PAValidationError)
    async def handle_validation(request: Request, exc: PAValidationError):
        return JSONResponse(status_code=422, content=exc.to_dict())

    @app.exception_handler(PAUserError)
    async def handle_user_error(request: Request, exc: PAUserError):
        return JSONResponse(status_code=exc.http_status(), content=exc.body)

    @app.exception_handler(PayerAPIError)
    async def handle_payer_error(request: Request, exc: PayerAPIError):
        return JSONResponse(status_code=503, content=exc.to_dict())


# ═══════════════════════════════════════════════════════════════════════════════
# §7 VALIDATORS — one function per VAL code
# ═══════════════════════════════════════════════════════════════════════════════

_MEMBER_ID_RE = re.compile(r"^[A-Z0-9]{8,20}$")
_PHONE_RE     = re.compile(r"^\(\d{3}\) \d{3}-\d{4}$")
_EMAIL_RE     = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ICD10_RE     = re.compile(r"^[A-Z]\d{2}[A-Z0-9]{0,7}$")
_CPT_RE       = re.compile(r"^(\d{5}|[A-Z]\d{4})$")
_NPI_RE       = re.compile(r"^\d{10}$")
_EIN_RE       = re.compile(r"^\d{2}-\d{7}$")
_ZIP_RE       = re.compile(r"^\d{5}(-\d{4})?$")
_ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png", "image/tiff"}
_MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB


def _luhn_npi(npi: str) -> bool:
    """NPI Luhn check per CMS spec (prefix 80840 prepended)."""
    digits = "80840" + npi
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def validate_member_id(value: str) -> str:
    """VAL-001 — member ID format."""
    if not value or not _MEMBER_ID_RE.match(value.upper()):
        raise PAValidationError(VAL.MEMBER_ID, "member_id",
            "Invalid Member ID format. Must be 8-20 alphanumeric characters.")
    return value.upper()


def validate_dob(value: str) -> date:
    """VAL-002 — date of birth: past date, age 0-120."""
    try:
        d = date.fromisoformat(value)
    except (ValueError, TypeError):
        raise PAValidationError(VAL.DATE_OF_BIRTH, "date_of_birth",
            "Invalid date of birth. Use YYYY-MM-DD format.")
    today = date.today()
    if d >= today:
        raise PAValidationError(VAL.DATE_OF_BIRTH, "date_of_birth",
            "Date of birth must be in the past.")
    age = (today - d).days // 365
    if age > 120:
        raise PAValidationError(VAL.DATE_OF_BIRTH, "date_of_birth",
            "Invalid date of birth: age exceeds 120 years.")
    return d


def validate_phone(value: str) -> str:
    """VAL-003 — US phone format (XXX) XXX-XXXX."""
    if not value or not _PHONE_RE.match(value.strip()):
        raise PAValidationError(VAL.PHONE_NUMBER, "phone",
            "Invalid phone number. Use format (XXX) XXX-XXXX.")
    return value.strip()


def validate_email(value: str) -> str:
    """VAL-004 — RFC 5322 email validation."""
    if not value or not _EMAIL_RE.match(value.strip()):
        raise PAValidationError(VAL.EMAIL, "email",
            "Invalid email address.")
    return value.strip().lower()


def validate_icd10(value: str) -> str:
    """VAL-005 — ICD-10-CM code format."""
    clean = value.upper().replace(".", "").strip()
    if not clean or not _ICD10_RE.match(clean):
        raise PAValidationError(VAL.ICD10_CODE, "diagnosis_code",
            f"Invalid diagnosis code '{value}'. Must be a valid ICD-10-CM code.")
    return clean


def validate_cpt(value: str) -> str:
    """VAL-006 — CPT / HCPCS code format."""
    clean = value.strip().upper()
    if not clean or not _CPT_RE.match(clean):
        raise PAValidationError(VAL.CPT_CODE, "procedure_code",
            f"Invalid procedure code '{value}'. Must be a 5-digit CPT or HCPCS code.")
    return clean


def validate_npi(value: str) -> str:
    """VAL-007 — NPI: 10-digit with Luhn check."""
    clean = value.strip()
    if not _NPI_RE.match(clean):
        raise PAValidationError(VAL.NPI, "npi",
            f"Invalid NPI '{value}'. Must be exactly 10 digits.")
    if not _luhn_npi(clean):
        raise PAValidationError(VAL.NPI, "npi",
            f"Invalid NPI '{value}'. Failed Luhn check digit validation.")
    return clean


def validate_tax_id(value: str) -> str:
    """VAL-008 — EIN format XX-XXXXXXX."""
    clean = value.strip()
    if not _EIN_RE.match(clean):
        raise PAValidationError(VAL.TAX_ID, "tax_id",
            f"Invalid Tax ID '{value}'. Use format XX-XXXXXXX.")
    return clean


def validate_zip(value: str) -> str:
    """VAL-009 — ZIP code: XXXXX or XXXXX-XXXX."""
    clean = value.strip()
    if not _ZIP_RE.match(clean):
        raise PAValidationError(VAL.ZIP_CODE, "zip_code",
            f"Invalid zip code '{value}'. Use XXXXX or XXXXX-XXXX.")
    return clean


def validate_file_size(size_bytes: int, filename: str = "") -> None:
    """VAL-010 — file size max 25 MB."""
    if size_bytes > _MAX_FILE_BYTES:
        mb = size_bytes / (1024 * 1024)
        raise PAValidationError(VAL.FILE_SIZE, "file",
            f"File '{filename}' is {mb:.1f} MB. Maximum allowed is 25 MB.")


def validate_file_type(mime_type: str, filename: str = "") -> None:
    """VAL-011 — allowed file types: PDF, JPG, PNG, TIFF."""
    if mime_type.lower() not in _ALLOWED_MIME:
        raise PAValidationError(VAL.FILE_TYPE, "file",
            f"Unsupported file type '{mime_type}'. Allowed: PDF, JPG, PNG, TIFF.")


def validate_quantity(value: int) -> int:
    """VAL-012 — quantity: integer 1-999."""
    if not isinstance(value, int) or value < 1 or value > 999:
        raise PAValidationError(VAL.QUANTITY, "quantity",
            f"Invalid quantity {value}. Must be an integer between 1 and 999.")
    return value


def validate_clinical_summary(value: str) -> str:
    """VAL-013 — clinical summary: 100-5000 characters."""
    if not value or len(value.strip()) < 100:
        raise PAValidationError(VAL.CLINICAL_SUMMARY, "clinical_summary",
            f"Clinical summary is too short ({len(value.strip())} chars). Minimum 100 characters required.")
    if len(value) > 5000:
        raise PAValidationError(VAL.CLINICAL_SUMMARY, "clinical_summary",
            f"Clinical summary exceeds maximum of 5000 characters ({len(value)} chars).")
    return value.strip()


def validate_date_range(start: str, end: str) -> Tuple[date, date]:
    """VAL-014 — date range: start < end."""
    try:
        s, e = date.fromisoformat(start), date.fromisoformat(end)
    except (ValueError, TypeError):
        raise PAValidationError(VAL.DATE_RANGE, "date_range",
            "Invalid date format. Use YYYY-MM-DD.")
    if s >= e:
        raise PAValidationError(VAL.DATE_RANGE, "date_range",
            f"Start date ({start}) must be before end date ({end}).")
    return s, e


def validate_not_future(value: str, field: str = "date", max_days_ahead: int = 30) -> date:
    """VAL-015 — date cannot be more than 30 days in the future."""
    try:
        d = date.fromisoformat(value)
    except (ValueError, TypeError):
        raise PAValidationError(VAL.FUTURE_DATE, field,
            f"Invalid date format for {field}. Use YYYY-MM-DD.")
    delta = (d - date.today()).days
    if delta > max_days_ahead:
        raise PAValidationError(VAL.FUTURE_DATE, field,
            f"Date {value} is {delta} days in the future. Maximum allowed is {max_days_ahead} days.")
    return d


def validate_required(value: Any, field: str) -> Any:
    """VAL-016 — required field: not null/empty."""
    if value is None or (isinstance(value, str) and not value.strip()):
        raise PAValidationError(VAL.REQUIRED_FIELD, field,
            f"Required field '{field}' is missing or empty.")
    return value


def validate_age_for_service(dob: date, service_code: str,
                              min_age: Optional[int] = None, max_age: Optional[int] = None) -> None:
    """VAL-017 — age/service appropriateness check."""
    age = (date.today() - dob).days // 365
    if min_age is not None and age < min_age:
        raise PAValidationError(VAL.AGE_SERVICE, "date_of_birth",
            f"Member age {age} is below minimum age {min_age} for service {service_code}.")
    if max_age is not None and age > max_age:
        raise PAValidationError(VAL.AGE_SERVICE, "date_of_birth",
            f"Member age {age} exceeds maximum age {max_age} for service {service_code}.")


def validate_no_duplicate_pa(existing_pas: List[Dict], member_id: str,
                               procedure_code: str, days: int = 30) -> None:
    """VAL-018 — no duplicate PA for same service within 30 days."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    for pa in existing_pas:
        if (pa.get("member_id") == member_id
                and pa.get("procedure_code") == procedure_code
                and pa.get("status") not in ("CANCELLED", "DENIED", "EXPIRED")):
            submitted = pa.get("submitted_at", "")
            try:
                sub_dt = datetime.fromisoformat(submitted.replace("Z", "+00:00"))
                if sub_dt >= cutoff:
                    raise PAValidationError(VAL.DUPLICATE_PA, "procedure_code",
                        f"A PA for procedure {procedure_code} already exists "
                        f"(PA {pa.get('pa_number')}) submitted within the last {days} days.")
            except (ValueError, AttributeError):
                pass


def validate_provider_in_network(npi: str, payer: str,
                                  in_network: bool = True) -> None:
    """VAL-019 — provider must be in-network. Raises if out-of-network."""
    if not in_network:
        raise PAUserError(ERR.OUT_OF_NETWORK,
            f"Provider NPI {npi} is out-of-network for {payer}. "
            "PA may require additional documentation.")


def validate_member_eligibility(is_eligible: bool, payer: str,
                                 member_id: str) -> None:
    """VAL-020 — member must have active coverage."""
    if not is_eligible:
        raise PAUserError(ERR.COVERAGE_INACTIVE,
            f"Member {member_id} does not have active coverage with {payer}.")


# ═══════════════════════════════════════════════════════════════════════════════
# COMPOSITE VALIDATOR — full PA submission
# ═══════════════════════════════════════════════════════════════════════════════

def validate_pa_submission(data: Dict[str, Any]) -> List[PAValidationError]:
    """
    Run all applicable FLS §7 validators against a PA submission dict.
    Returns list of errors (empty = valid). Does NOT raise.
    """
    errors: List[PAValidationError] = []

    def _check(fn, *args, **kwargs):
        try:
            fn(*args, **kwargs)
        except PAValidationError as e:
            errors.append(e)

    _check(validate_required, data.get("member_id"), "member_id")
    if data.get("member_id"):
        _check(validate_member_id, data["member_id"])

    _check(validate_required, data.get("primary_diagnosis_code"), "primary_diagnosis_code")
    if data.get("primary_diagnosis_code"):
        _check(validate_icd10, data["primary_diagnosis_code"])

    _check(validate_required, data.get("procedure_code"), "procedure_code")
    if data.get("procedure_code"):
        _check(validate_cpt, data["procedure_code"])

    _check(validate_required, data.get("provider_npi"), "provider_npi")
    if data.get("provider_npi"):
        _check(validate_npi, data["provider_npi"])

    _check(validate_required, data.get("clinical_notes"), "clinical_notes")
    if data.get("clinical_notes"):
        _check(validate_clinical_summary, data["clinical_notes"])

    if data.get("quantity") is not None:
        _check(validate_quantity, data["quantity"])

    if data.get("member_dob"):
        _check(validate_dob, data["member_dob"])

    if data.get("requested_start_date"):
        _check(validate_not_future, data["requested_start_date"], "requested_start_date")

    return errors


def validation_error_response(errors: List[PAValidationError]) -> Dict[str, Any]:
    """Convert list of validation errors to standardized HTTP 422 response body."""
    return {
        "error":   True,
        "code":    "VALIDATION_FAILED",
        "message": f"{len(errors)} validation error(s) found.",
        "errors":  [e.to_dict() for e in errors],
    }
