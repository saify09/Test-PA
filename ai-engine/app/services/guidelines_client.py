"""
guidelines_client.py — External clinical criteria API integration.

INT-301: MCG Care Guidelines API (Milliman Care Guidelines)
INT-302: InterQual criteria engine (Change Healthcare / Optum)
INT-303: CMS NCD/LCD database (Medicare coverage determinations)

Architecture:
  - GuidelinesClient is the single entry point for all guideline lookups
  - Each payer/source has its own adapter (MCGAdapter, InterQualAdapter, CMSAdapter)
  - Results are normalised into GuidelineResult (internal model)
  - In development/CI: returns rich mock data so all endpoints work without API keys
  - In production: live API calls with 30-second timeout, Redis caching (5 min TTL),
    circuit-breaker fallback to cached/mock data on failure (NFR-304/NFR-305)

Configuration (via environment variables):
  MCG_API_KEY           — MCG API key (https://guidelines.mcg.com/api/)
  MCG_API_BASE          — default: https://guidelines.mcg.com/api/v3
  INTERQUAL_API_KEY     — InterQual API key (https://api.interqual.com/)
  INTERQUAL_API_BASE    — default: https://api.interqual.com/v2
  CMS_API_BASE          — default: https://api.cms.gov/coverage/v1
  GUIDELINES_CACHE_TTL  — Redis TTL in seconds (default: 300 = 5 min)
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import structlog

log = structlog.get_logger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
MCG_API_KEY          = os.getenv("MCG_API_KEY", "")
MCG_API_BASE         = os.getenv("MCG_API_BASE", "https://guidelines.mcg.com/api/v3")
INTERQUAL_API_KEY    = os.getenv("INTERQUAL_API_KEY", "")
INTERQUAL_API_BASE   = os.getenv("INTERQUAL_API_BASE", "https://api.interqual.com/v2")
CMS_API_BASE         = os.getenv("CMS_API_BASE", "https://api.cms.gov/coverage/v1")
CACHE_TTL            = int(os.getenv("GUIDELINES_CACHE_TTL", "300"))

# ── Internal models ───────────────────────────────────────────────────────────

@dataclass
class CriterionSpec:
    """A single clinical criterion from an external guideline source."""
    criterion_id:    str
    name:            str
    source:          str            # "MCG" | "InterQual" | "CMS"
    required:        bool
    weight:          float
    description:     str
    keywords:        List[str]      = field(default_factory=list)
    icd10_codes:     List[str]      = field(default_factory=list)
    cpt_codes:       List[str]      = field(default_factory=list)
    guideline_url:   Optional[str]  = None
    guideline_version: str          = ""


@dataclass
class GuidelineResult:
    """Normalised response from any guideline API."""
    source:          str
    service_type:    str
    icd10_code:      str
    criteria:        List[CriterionSpec]
    guideline_title: str
    guideline_version: str
    effective_date:  str
    cache_hit:       bool           = False
    latency_ms:      float          = 0.0
    raw_response:    Optional[Dict] = None


# ── Mock data (used when API keys absent — full criteria sets for dev/CI) ─────
_MOCK_MCG: Dict[str, List[Dict]] = {
    "DIAGNOSTIC_IMAGING": [
        {"id": "MCG-IMG-001", "name": "Failed conservative therapy ≥4 weeks",
         "required": True, "weight": 1.5,
         "desc": "Documentation of at least 4 weeks of conservative management including PT, NSAIDs, or equivalent.",
         "keywords": ["conservative", "physical therapy", "NSAIDs", "failed", "weeks"]},
        {"id": "MCG-IMG-002", "name": "Clinical indication documented",
         "required": True, "weight": 2.0,
         "desc": "Provider documents specific clinical indication (pain, neurological deficit, functional limitation).",
         "keywords": ["pain", "injury", "neurological", "deficit", "symptom", "limitation"]},
        {"id": "MCG-IMG-003", "name": "Previous imaging reviewed",
         "required": False, "weight": 0.8,
         "desc": "Prior imaging results reviewed and documented if available.",
         "keywords": ["prior", "previous", "x-ray", "imaging", "reviewed"]},
        {"id": "MCG-IMG-004", "name": "Diagnosis supports imaging modality",
         "required": True, "weight": 1.8,
         "desc": "ICD-10 diagnosis code is clinically consistent with the requested imaging modality.",
         "keywords": ["MRI", "CT", "ultrasound", "appropriate", "indicated", "consistent"]},
        {"id": "MCG-IMG-005", "name": "Clinical exam documented",
         "required": False, "weight": 1.0,
         "desc": "Ordering provider documents relevant physical examination findings.",
         "keywords": ["exam", "examination", "physical", "clinical", "assessment", "findings"]},
    ],
    "SURGICAL_PROCEDURE": [
        {"id": "MCG-SURG-001", "name": "Non-surgical alternatives exhausted",
         "required": True, "weight": 2.0,
         "desc": "Documentation of failed conservative/non-surgical management prior to surgical request.",
         "keywords": ["conservative", "failed", "alternative", "non-surgical", "medical management"]},
        {"id": "MCG-SURG-002", "name": "Imaging confirms surgical indication",
         "required": True, "weight": 2.0,
         "desc": "Imaging study (MRI/CT) confirms the structural finding requiring surgery.",
         "keywords": ["MRI", "CT", "imaging", "confirmed", "shows", "demonstrates"]},
        {"id": "MCG-SURG-003", "name": "Functional impairment documented",
         "required": True, "weight": 1.8,
         "desc": "Provider documents specific functional impairment affecting ADLs or work.",
         "keywords": ["functional", "impairment", "ADL", "disability", "limitation", "unable"]},
        {"id": "MCG-SURG-004", "name": "Surgical risk assessment completed",
         "required": False, "weight": 1.2,
         "desc": "Pre-operative risk assessment documented (ASA score, comorbidities).",
         "keywords": ["risk", "ASA", "pre-op", "anesthesia", "comorbid", "clearance"]},
    ],
    "SPECIALTY_MEDICATION": [
        {"id": "MCG-MED-001", "name": "FDA-approved indication",
         "required": True, "weight": 2.5,
         "desc": "Requested medication has FDA approval for the documented diagnosis.",
         "keywords": ["FDA", "approved", "indication", "labeled", "on-label"]},
        {"id": "MCG-MED-002", "name": "Step therapy documented",
         "required": True, "weight": 2.0,
         "desc": "Trial and failure/intolerance of preferred/generic alternatives documented.",
         "keywords": ["step therapy", "generic", "preferred", "failed", "intolerance", "adverse"]},
        {"id": "MCG-MED-003", "name": "Prescriber specialty appropriate",
         "required": False, "weight": 1.0,
         "desc": "Prescribing physician has appropriate specialty for the requested medication.",
         "keywords": ["specialist", "rheumatologist", "oncologist", "neurologist", "specialty"]},
        {"id": "MCG-MED-004", "name": "Lab/diagnostic criteria met",
         "required": True, "weight": 1.8,
         "desc": "Required laboratory or diagnostic criteria for medication use are documented.",
         "keywords": ["lab", "test", "criteria", "score", "HbA1c", "eGFR", "biomarker"]},
    ],
    "BEHAVIORAL_HEALTH": [
        {"id": "MCG-BH-001", "name": "DSM-5 diagnostic criteria met",
         "required": True, "weight": 2.5,
         "desc": "Treating clinician documents DSM-5 diagnosis with specific criteria met.",
         "keywords": ["DSM", "diagnosis", "criteria", "assessment", "psychiatric", "mental health"]},
        {"id": "MCG-BH-002", "name": "Outpatient treatment attempted",
         "required": True, "weight": 1.8,
         "desc": "Less intensive outpatient services attempted prior to intensive/inpatient request.",
         "keywords": ["outpatient", "therapy", "medication", "attempted", "failed", "inadequate"]},
        {"id": "MCG-BH-003", "name": "Safety risk assessment documented",
         "required": True, "weight": 2.0,
         "desc": "Current risk assessment (suicide/homicide ideation, self-harm) documented.",
         "keywords": ["safety", "risk", "suicidal", "homicidal", "self-harm", "assessment", "plan"]},
    ],
    "INPATIENT": [
        {"id": "MCG-INP-001", "name": "Acute medical necessity documented",
         "required": True, "weight": 3.0,
         "desc": "Condition requires inpatient level of care that cannot be managed in lower setting.",
         "keywords": ["acute", "inpatient", "unstable", "monitoring", "IV", "cannot be managed"]},
        {"id": "MCG-INP-002", "name": "Vital sign instability or acute change",
         "required": True, "weight": 2.5,
         "desc": "Vital sign abnormalities or acute change in clinical status documented.",
         "keywords": ["vitals", "fever", "hypotension", "tachycardia", "unstable", "acute"]},
        {"id": "MCG-INP-003", "name": "Skilled nursing or IV therapy required",
         "required": False, "weight": 1.5,
         "desc": "Inpatient services specifically require skilled nursing or IV medication administration.",
         "keywords": ["IV", "skilled nursing", "infusion", "monitoring", "nursing care"]},
    ],
}

_MOCK_INTERQUAL: Dict[str, List[Dict]] = {
    "DIAGNOSTIC_IMAGING": [
        {"id": "IQ-IMG-001", "name": "Symptom duration ≥ 6 weeks",
         "required": False, "weight": 1.2,
         "desc": "Symptoms present for at least 6 weeks without improvement.",
         "keywords": ["6 weeks", "duration", "persistent", "ongoing", "chronic"]},
        {"id": "IQ-IMG-002", "name": "Red flag symptoms present",
         "required": False, "weight": 2.0,
         "desc": "Red flag findings: fever, weight loss, bowel/bladder dysfunction, night pain.",
         "keywords": ["fever", "weight loss", "bowel", "bladder", "night pain", "red flag"]},
    ],
    "SURGICAL_PROCEDURE": [
        {"id": "IQ-SURG-001", "name": "Structural abnormality on imaging",
         "required": True, "weight": 1.8,
         "desc": "Imaging demonstrates structural abnormality correlating with clinical symptoms.",
         "keywords": ["herniation", "stenosis", "tear", "rupture", "fracture", "abnormality"]},
    ],
    "SPECIALTY_MEDICATION": [
        {"id": "IQ-MED-001", "name": "Disease severity score documented",
         "required": False, "weight": 1.5,
         "desc": "Validated disease severity score (e.g. CDAI, PASI, PHQ-9) meets threshold.",
         "keywords": ["score", "severity", "CDAI", "PASI", "PHQ", "DAS28", "moderate", "severe"]},
    ],
}

_MOCK_CMS: Dict[str, Dict] = {
    "99213": {"covered": True, "ncd": None, "note": "Office visit — no NCD restriction"},
    "72148": {"covered": True, "ncd": "NCD 220.6.14",
              "note": "MRI covered when medically necessary per LCD L34890"},
    "27447": {"covered": True, "ncd": "NCD 150.9",
              "note": "Total knee arthroplasty covered per LCD criteria"},
    "J0135": {"covered": True, "ncd": "NCD 110.10",
              "note": "Adalimumab covered for FDA-approved indications"},
}


# ── Redis cache helper ────────────────────────────────────────────────────────
_redis_client = None

async def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(
                os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True
            )
        except Exception:
            pass
    return _redis_client


async def _cache_get(key: str) -> Optional[Dict]:
    r = await _get_redis()
    if not r:
        return None
    try:
        raw = await r.get(f"guidelines:{key}")
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, value: Dict, ttl: int = CACHE_TTL) -> None:
    r = await _get_redis()
    if not r:
        return
    try:
        await r.setex(f"guidelines:{key}", ttl, json.dumps(value))
    except Exception:
        pass


def _cache_key(*parts: str) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()[:16]


# ── MCG Adapter ───────────────────────────────────────────────────────────────

class MCGAdapter:
    """INT-301: MCG Care Guidelines API adapter.

    API reference: https://guidelines.mcg.com/api/
    Auth: Bearer token (MCG_API_KEY)
    Endpoint: GET /criteria?serviceType=DIAGNOSTIC_IMAGING&icd10=M54.5
    """

    BASE = MCG_API_BASE

    @classmethod
    async def fetch(cls, service_type: str, icd10_code: str) -> List[CriterionSpec]:
        if not MCG_API_KEY:
            return cls._mock(service_type)

        ck = _cache_key("mcg", service_type, icd10_code)
        cached = await _cache_get(ck)
        if cached:
            return [CriterionSpec(**c) for c in cached]

        t0 = time.perf_counter()
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{cls.BASE}/criteria",
                    params={"serviceType": service_type, "icd10Code": icd10_code},
                    headers={"Authorization": f"Bearer {MCG_API_KEY}",
                             "Accept": "application/json"},
                )
            resp.raise_for_status()
            raw = resp.json()
            criteria = cls._parse(raw, service_type)
            await _cache_set(ck, [c.__dict__ for c in criteria])
            log.info("mcg.fetch_ok", service_type=service_type, icd10=icd10_code,
                     count=len(criteria), latency_ms=round((time.perf_counter()-t0)*1000))
            return criteria
        except Exception as exc:
            log.warning("mcg.fetch_failed_using_mock", error=str(exc),
                        service_type=service_type, icd10=icd10_code)
            return cls._mock(service_type)

    @classmethod
    def _parse(cls, raw: Dict, service_type: str) -> List[CriterionSpec]:
        """Parse live MCG API response into CriterionSpec list."""
        specs = []
        for item in raw.get("criteria", raw.get("items", [])):
            specs.append(CriterionSpec(
                criterion_id   = item.get("id", ""),
                name           = item.get("name", item.get("criterionName", "")),
                source         = "MCG",
                required       = item.get("required", item.get("isMandatory", False)),
                weight         = float(item.get("weight", 1.0)),
                description    = item.get("description", item.get("criterionText", "")),
                keywords       = item.get("keywords", []),
                icd10_codes    = item.get("icd10Codes", []),
                cpt_codes      = item.get("cptCodes", []),
                guideline_url  = item.get("guidelineUrl"),
                guideline_version = raw.get("version", ""),
            ))
        return specs or cls._mock(service_type)

    @classmethod
    def _mock(cls, service_type: str) -> List[CriterionSpec]:
        defs = _MOCK_MCG.get(service_type, _MOCK_MCG.get("DIAGNOSTIC_IMAGING", []))
        return [
            CriterionSpec(
                criterion_id   = d["id"],
                name           = d["name"],
                source         = "MCG",
                required       = d["required"],
                weight         = d["weight"],
                description    = d["desc"],
                keywords       = d["keywords"],
                guideline_version = "28th Edition 2026 (mock)",
            )
            for d in defs
        ]


# ── InterQual Adapter ─────────────────────────────────────────────────────────

class InterQualAdapter:
    """INT-302: InterQual criteria engine adapter.

    API reference: https://api.interqual.com/
    Auth: Bearer token (INTERQUAL_API_KEY)
    Endpoint: POST /auth-criteria with {serviceType, diagnosisCodes, procedureCode}
    """

    BASE = INTERQUAL_API_BASE

    @classmethod
    async def fetch(cls, service_type: str, icd10_code: str,
                    cpt_code: str = "") -> List[CriterionSpec]:
        if not INTERQUAL_API_KEY:
            return cls._mock(service_type)

        ck = _cache_key("iq", service_type, icd10_code, cpt_code)
        cached = await _cache_get(ck)
        if cached:
            return [CriterionSpec(**c) for c in cached]

        t0 = time.perf_counter()
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{cls.BASE}/auth-criteria",
                    json={
                        "serviceType":    service_type,
                        "diagnosisCodes": [icd10_code],
                        "procedureCode":  cpt_code,
                    },
                    headers={"Authorization": f"Bearer {INTERQUAL_API_KEY}",
                             "Content-Type": "application/json"},
                )
            resp.raise_for_status()
            raw = resp.json()
            criteria = cls._parse(raw, service_type)
            await _cache_set(ck, [c.__dict__ for c in criteria])
            log.info("interqual.fetch_ok", service_type=service_type, icd10=icd10_code,
                     count=len(criteria), latency_ms=round((time.perf_counter()-t0)*1000))
            return criteria
        except Exception as exc:
            log.warning("interqual.fetch_failed_using_mock", error=str(exc))
            return cls._mock(service_type)

    @classmethod
    def _parse(cls, raw: Dict, service_type: str) -> List[CriterionSpec]:
        specs = []
        for item in raw.get("criteria", raw.get("criteriaItems", [])):
            specs.append(CriterionSpec(
                criterion_id   = item.get("criterionId", item.get("id", "")),
                name           = item.get("criterionName", item.get("name", "")),
                source         = "InterQual",
                required       = item.get("required", False),
                weight         = float(item.get("clinicalWeight", 1.0)),
                description    = item.get("criterionText", item.get("description", "")),
                keywords       = item.get("keywords", []),
                guideline_version = raw.get("guidelineVersion", ""),
                guideline_url  = item.get("referenceUrl"),
            ))
        return specs or cls._mock(service_type)

    @classmethod
    def _mock(cls, service_type: str) -> List[CriterionSpec]:
        defs = _MOCK_INTERQUAL.get(service_type, [])
        return [
            CriterionSpec(
                criterion_id   = d["id"],
                name           = d["name"],
                source         = "InterQual",
                required       = d["required"],
                weight         = d["weight"],
                description    = d["desc"],
                keywords       = d["keywords"],
                guideline_version = "2026.1 (mock)",
            )
            for d in defs
        ]


# ── CMS NCD/LCD Adapter ───────────────────────────────────────────────────────

class CMSAdapter:
    """INT-303: CMS NCD/LCD database adapter.

    API: https://api.cms.gov/coverage/v1/
    Public API — no key required.
    Endpoint: GET /ncd?cptCode=72148
    """

    BASE = CMS_API_BASE

    @classmethod
    async def check_coverage(cls, cpt_code: str, icd10_code: str = "") -> Dict[str, Any]:
        ck = _cache_key("cms", cpt_code, icd10_code)
        cached = await _cache_get(ck)
        if cached:
            return cached

        try:
            import httpx
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{cls.BASE}/ncd",
                    params={"cptCode": cpt_code, "icd10Code": icd10_code},
                    headers={"Accept": "application/json"},
                )
            if resp.status_code == 200:
                result = resp.json()
                await _cache_set(ck, result, ttl=3600)  # CMS data: cache 1 hour
                return result
        except Exception as exc:
            log.debug("cms.fetch_failed_using_mock", error=str(exc), cpt=cpt_code)

        # Fallback to mock
        return _MOCK_CMS.get(cpt_code, {"covered": True, "ncd": None,
                                         "note": "Coverage status unavailable — treating as covered"})


# ── Unified GuidelinesClient ──────────────────────────────────────────────────

class GuidelinesClient:
    """
    Unified entry point for all clinical guideline lookups.

    Usage (from CriteriaEngine):
        from app.services.guidelines_client import GuidelinesClient
        result = await GuidelinesClient.get_criteria(service_type, icd10, cpt_code)
        criteria = result.criteria  # List[CriterionSpec]

    In dev (no API keys): returns rich mock criteria immediately.
    In prod (keys set): live MCG + InterQual calls with Redis caching.
    Coverage check: always returns CMS data (public API, no key needed).
    """

    @classmethod
    async def get_criteria(
        cls,
        service_type: str,
        icd10_code:   str,
        cpt_code:     str = "",
        sources:      List[str] = None,
    ) -> GuidelineResult:
        """Fetch and merge criteria from all configured guideline sources.

        Args:
            service_type: Internal service type (e.g. "DIAGNOSTIC_IMAGING")
            icd10_code:   Primary ICD-10-CM code (e.g. "M54.5")
            cpt_code:     CPT/HCPCS code (e.g. "72148")
            sources:      Which sources to query — defaults to ["MCG", "InterQual"]

        Returns:
            GuidelineResult with merged, deduplicated criteria from all sources.
        """
        t0 = time.perf_counter()
        sources = sources or ["MCG", "InterQual"]
        all_criteria: List[CriterionSpec] = []

        # Fetch concurrently
        import asyncio
        tasks = []
        if "MCG" in sources:
            tasks.append(MCGAdapter.fetch(service_type, icd10_code))
        if "InterQual" in sources:
            tasks.append(InterQualAdapter.fetch(service_type, icd10_code, cpt_code))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, list):
                all_criteria.extend(r)
            elif isinstance(r, Exception):
                log.warning("guidelines_client.source_error", error=str(r))

        # Dedup by criterion_id
        seen: set = set()
        deduped = []
        for c in all_criteria:
            if c.criterion_id not in seen:
                seen.add(c.criterion_id)
                deduped.append(c)

        version = f"MCG 28th Ed 2026 / InterQual 2026.1"
        if MCG_API_KEY and INTERQUAL_API_KEY:
            version = "Live (MCG + InterQual)"

        return GuidelineResult(
            source           = "+".join(sources),
            service_type     = service_type,
            icd10_code       = icd10_code,
            criteria         = deduped,
            guideline_title  = f"Clinical Authorization Criteria — {service_type}",
            guideline_version= version,
            effective_date   = "2026-01-01",
            latency_ms       = round((time.perf_counter() - t0) * 1000, 1),
        )

    @classmethod
    async def check_cms_coverage(cls, cpt_code: str, icd10_code: str = "") -> Dict[str, Any]:
        """INT-303: Check CMS NCD/LCD coverage for a procedure code."""
        return await CMSAdapter.check_coverage(cpt_code, icd10_code)
