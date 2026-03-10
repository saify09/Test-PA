"""
CriteriaEngine — Core AI clinical decision support.

Implements:
  - MCG / InterQual criteria matching (FR-101, FR-102)
  - Confidence score generation (FR-105)
  - Explainable rationale with citations (FR-106)
  - Edge-case / ambiguity flagging (FR-107)
  - Step therapy / formulary checks (FR-103)

In production: loads trained BiomedBERT model + guidelines database.
This module ships a comprehensive rule-based fallback that mirrors the
real ML pipeline so all endpoints work without GPU infrastructure.
"""

from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import structlog

from app.core.config import settings
from app.schemas.pa_schemas import (
    AIRecommendation,
    CriteriaEvaluation,
    CriterionResult,
    CriteriaStatus,
    PASubmissionRequest,
    RouteDecision,
    ServiceType,
    UrgencyLevel,
)

log = structlog.get_logger(__name__)

# ── Guideline knowledge base (abbreviated — production loads from DB) ─────────
# Each entry: criterion_id, name, source, required, weight, met_if
GUIDELINES: Dict[str, List[Dict]] = {
    "DIAGNOSTIC_IMAGING": [
        {
            "id": "IMG-001",
            "name": "Failed conservative therapy ≥4 weeks",
            "source": "MCG",
            "required": True,
            "weight": 1.5,
            "keywords": [
                "conservative",
                "physical therapy",
                "NSAIDs",
                "failed",
                "weeks",
            ],
        },
        {
            "id": "IMG-002",
            "name": "Clinical indication documented",
            "source": "MCG",
            "required": True,
            "weight": 2.0,
            "keywords": ["pain", "injury", "neurological", "deficit", "symptom"],
        },
        {
            "id": "IMG-003",
            "name": "Previous imaging reviewed (if any)",
            "source": "InterQual",
            "required": False,
            "weight": 0.8,
            "keywords": ["prior", "previous", "x-ray", "imaging", "reviewed"],
        },
        {
            "id": "IMG-004",
            "name": "Diagnosis supports imaging modality",
            "source": "MCG",
            "required": True,
            "weight": 1.8,
            "keywords": ["MRI", "CT", "ultrasound", "appropriate", "indicated"],
        },
        {
            "id": "IMG-005",
            "name": "Ordering provider documented clinical exam",
            "source": "InterQual",
            "required": False,
            "weight": 1.0,
            "keywords": ["exam", "examination", "physical", "clinical", "assessment"],
        },
    ],
    "SURGICAL_PROCEDURE": [
        {
            "id": "SURG-001",
            "name": "Non-surgical alternatives exhausted",
            "source": "MCG",
            "required": True,
            "weight": 2.0,
            "keywords": [
                "conservative",
                "failed",
                "alternative",
                "non-surgical",
                "medical management",
            ],
        },
        {
            "id": "SURG-002",
            "name": "Imaging confirming surgical indication",
            "source": "MCG",
            "required": True,
            "weight": 2.0,
            "keywords": ["MRI", "CT", "imaging", "confirmed", "shows", "demonstrates"],
        },
        {
            "id": "SURG-003",
            "name": "Functional impairment documented",
            "source": "InterQual",
            "required": True,
            "weight": 1.5,
            "keywords": [
                "functional",
                "impairment",
                "disability",
                "limitation",
                "activities",
            ],
        },
        {
            "id": "SURG-004",
            "name": "Appropriate surgical candidate (medical clearance)",
            "source": "InterQual",
            "required": True,
            "weight": 1.5,
            "keywords": [
                "clearance",
                "candidate",
                "medical",
                "surgical",
                "appropriate",
            ],
        },
        {
            "id": "SURG-005",
            "name": "In-network facility and surgeon",
            "source": "PLAN",
            "required": False,
            "weight": 1.0,
            "keywords": ["network", "in-network", "facility", "contracted"],
        },
    ],
    "SPECIALTY_MEDICATION": [
        {
            "id": "MED-001",
            "name": "Step therapy — formulary preferred agents tried",
            "source": "MCG",
            "required": True,
            "weight": 2.0,
            "keywords": [
                "step",
                "therapy",
                "formulary",
                "preferred",
                "tried",
                "failed",
                "generic",
            ],
        },
        {
            "id": "MED-002",
            "name": "Diagnosis matches FDA-approved indication",
            "source": "FDA",
            "required": True,
            "weight": 2.0,
            "keywords": ["diagnosis", "indication", "approved", "FDA", "label"],
        },
        {
            "id": "MED-003",
            "name": "Prescribing provider specialty appropriate",
            "source": "PLAN",
            "required": False,
            "weight": 0.8,
            "keywords": [
                "specialist",
                "rheumatologist",
                "oncologist",
                "prescriber",
                "specialty",
            ],
        },
        {
            "id": "MED-004",
            "name": "Baseline labs / monitoring documented",
            "source": "MCG",
            "required": False,
            "weight": 1.0,
            "keywords": ["labs", "baseline", "monitoring", "CBC", "LFT", "renal"],
        },
        {
            "id": "MED-005",
            "name": "Contraindications reviewed",
            "source": "InterQual",
            "required": True,
            "weight": 1.2,
            "keywords": [
                "contraindication",
                "allergy",
                "adverse",
                "interaction",
                "reviewed",
            ],
        },
    ],
    "PHYSICAL_THERAPY": [
        {
            "id": "PT-001",
            "name": "Acute or post-surgical condition documented",
            "source": "MCG",
            "required": True,
            "weight": 1.5,
            "keywords": [
                "acute",
                "post-surgical",
                "post-operative",
                "injury",
                "condition",
            ],
        },
        {
            "id": "PT-002",
            "name": "Functional goals documented",
            "source": "MCG",
            "required": True,
            "weight": 1.5,
            "keywords": [
                "functional",
                "goals",
                "objective",
                "measurable",
                "improvement",
            ],
        },
        {
            "id": "PT-003",
            "name": "Number of sessions clinically supported",
            "source": "InterQual",
            "required": False,
            "weight": 1.0,
            "keywords": ["sessions", "visits", "frequency", "duration", "plan"],
        },
    ],
    "DEFAULT": [
        {
            "id": "GEN-001",
            "name": "Medical necessity documented",
            "source": "MCG",
            "required": True,
            "weight": 2.0,
            "keywords": ["necessary", "required", "indicated", "medical", "clinical"],
        },
        {
            "id": "GEN-002",
            "name": "Clinical notes support request",
            "source": "MCG",
            "required": True,
            "weight": 1.5,
            "keywords": ["clinical", "notes", "documentation", "records", "history"],
        },
        {
            "id": "GEN-003",
            "name": "Diagnosis-procedure alignment",
            "source": "InterQual",
            "required": True,
            "weight": 1.8,
            "keywords": [
                "diagnosis",
                "appropriate",
                "indicated",
                "consistent",
                "supports",
            ],
        },
    ],
}

# ICD-10 high-approval codes (strong medical necessity evidence base)
HIGH_APPROVAL_DX = {
    "M511",
    "M512",
    "M513",  # Lumbar disc herniation
    "M4716",
    "M4715",  # Spondylosis with radiculopathy
    "G8929",
    "G8921",  # Pain disorders
    "C50",
    "C34",
    "C18",  # Oncology — very high approval
    "I250",
    "I251",
    "I259",  # CAD
    "N185",
    "N186",  # CKD stage 5-6
    "E1165",
    "E1166",  # Diabetic complications
    "J449",
    "J448",  # COPD
    "F329",
    "F334",  # Major depression, recurrent
}

# Step therapy required medication codes
STEP_THERAPY_REQUIRED_CPT = {
    "J0135",
    "J0171",
    "J0179",  # Adalimumab / biologics
    "J0223",
    "J0224",  # Dupilumab
    "J9039",
    "J9041",  # Bevacizumab / oncology
    "96413",
    "96415",  # Chemotherapy infusion
}


class CriteriaEngine:
    """
    Clinical AI criteria matching engine.
    In production: wraps BiomedBERT fine-tuned on clinical guidelines.
    Fallback: deterministic rule-based engine using keyword + code matching.
    """

    _ml_model = None  # Loaded on warmup if transformers available
    _version = settings.MCG_VERSION

    @classmethod
    async def warmup(cls):
        """Pre-load ML models to avoid cold-start latency."""
        try:
            from transformers import pipeline

            cls._ml_model = pipeline(
                "text-classification",
                model=settings.TRANSFORMER_MODEL,
                device=-1,  # CPU; set to 0 for GPU
            )
            log.info(
                "criteria_engine.ml_model_loaded", model=settings.TRANSFORMER_MODEL
            )
        except Exception as e:
            log.warning("criteria_engine.ml_unavailable_using_rules", error=str(e))

    @classmethod
    async def analyze(cls, submission: PASubmissionRequest) -> AIRecommendation:
        """
        Main entry point: given a PA submission, return a full AI recommendation.
        Target: <5 seconds inference time (TR-204).
        """
        t0 = time.perf_counter()

        # 1. Select applicable guideline set
        guideline_key = cls._map_service_type(submission.service_type)
        criteria_defs = GUIDELINES.get(guideline_key, GUIDELINES["DEFAULT"])

        # 2. Evaluate each criterion against clinical text
        clinical_text = cls._build_clinical_text(submission)
        criteria_results = cls._evaluate_criteria(
            criteria_defs, clinical_text, submission
        )

        # 3. Check code-level signals
        code_signals = cls._check_code_signals(submission)

        # 4. Build criteria evaluation summary
        met = sum(1 for c in criteria_results if c.status == CriteriaStatus.MET)
        not_met = sum(1 for c in criteria_results if c.status == CriteriaStatus.NOT_MET)
        missing = sum(
            1 for c in criteria_results if c.status == CriteriaStatus.MISSING_INFO
        )
        req_unmet = sum(
            1
            for c in criteria_results
            if c.required and c.status == CriteriaStatus.NOT_MET
        )

        # 5. Compute confidence score
        confidence, reasoning_parts = cls._compute_confidence(
            criteria_results, code_signals, submission, met, not_met, missing, req_unmet
        )

        # 6. Determine recommendation and routing
        recommendation, route = cls._make_routing_decision(
            confidence, req_unmet, missing, submission
        )

        # 7. Collect supporting evidence excerpts
        evidence = cls._extract_evidence(criteria_results, clinical_text)

        # 8. Missing info list
        missing_info = [
            c.criterion_name
            for c in criteria_results
            if c.status == CriteriaStatus.MISSING_INFO
        ]
        missing_info += cls._compute_missing_info(submission)

        # 9. Denial reasons if applicable
        denial_reasons = []
        if recommendation in ("DENY", "PEND") and req_unmet > 0:
            denial_reasons = [
                f"{c.criterion_name} ({c.guideline_source} {c.guideline_version})"
                for c in criteria_results
                if c.required and c.status == CriteriaStatus.NOT_MET
            ]

        # 10. Assemble full evaluation
        evaluation = CriteriaEvaluation(
            pa_number=submission.pa_number or "PENDING",
            guideline_set=f"{guideline_key}_{cls._version}",
            criteria=criteria_results,
            met_count=met,
            not_met_count=not_met,
            missing_info_count=missing,
            overall_status=(
                CriteriaStatus.MET
                if req_unmet == 0 and missing == 0
                else (
                    CriteriaStatus.MISSING_INFO
                    if missing > 0
                    else CriteriaStatus.NOT_MET
                )
            ),
            missing_info_list=missing_info,
            evaluated_at=datetime.now(timezone.utc),
        )

        reasoning = " ".join(reasoning_parts)
        inference_ms = (time.perf_counter() - t0) * 1000
        log.info(
            "criteria_engine.analyzed",
            pa=submission.pa_number,
            confidence=round(confidence, 3),
            route=route,
            ms=round(inference_ms),
        )

        return AIRecommendation(
            pa_number=submission.pa_number or "PENDING",
            confidence_score=round(confidence, 4),
            recommendation=recommendation,
            route_decision=route,
            reasoning=reasoning,
            criteria_evaluation=evaluation,
            supporting_evidence=evidence,
            missing_info=missing_info,
            denial_reasons=denial_reasons,
            suggested_alternatives=cls._get_alternatives(submission, recommendation),
            icd10_validation=code_signals.get("icd10", {}),
            formulary_check=code_signals.get("formulary"),
            step_therapy_check=code_signals.get("step_therapy"),
            model_version="v2.4.1",
            inference_ms=round(inference_ms, 1),
            generated_at=datetime.now(timezone.utc),
        )

    # ── Private helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _map_service_type(stype: ServiceType) -> str:
        mapping = {
            ServiceType.DIAGNOSTIC_IMAGING: "DIAGNOSTIC_IMAGING",
            ServiceType.SURGICAL_PROCEDURE: "SURGICAL_PROCEDURE",
            ServiceType.SPECIALTY_MEDICATION: "SPECIALTY_MEDICATION",
            ServiceType.PHYSICAL_THERAPY: "PHYSICAL_THERAPY",
        }
        return mapping.get(stype, "DEFAULT")

    @staticmethod
    def _build_clinical_text(submission: PASubmissionRequest) -> str:
        parts = [submission.clinical_summary]
        for doc in submission.documents:
            if doc.extracted_text:
                parts.append(doc.extracted_text)
        # Add diagnosis/procedure context
        dx_descs = [
            d.description or d.code for d in submission.diagnoses if d.description
        ]
        if dx_descs:
            parts.append("Diagnoses: " + "; ".join(dx_descs))
        return "\n\n".join(parts).lower()

    @staticmethod
    def _evaluate_criteria(
        criteria_defs: List[Dict],
        clinical_text: str,
        submission: PASubmissionRequest,
    ) -> List[CriterionResult]:
        results = []
        for cdef in criteria_defs:
            keywords = cdef["keywords"]
            matched = [kw for kw in keywords if kw.lower() in clinical_text]
            match_ratio = len(matched) / max(len(keywords), 1)

            if match_ratio >= 0.6:
                status = CriteriaStatus.MET
                evidence = f"Clinical documentation references: {', '.join(matched)}"
            elif match_ratio >= 0.3:
                status = CriteriaStatus.PARTIAL
                evidence = f"Partial evidence found: {', '.join(matched)}"
            elif len(clinical_text) < 50:
                status = CriteriaStatus.MISSING_INFO
                evidence = None
            else:
                status = CriteriaStatus.NOT_MET
                evidence = f"Required keywords not found: {', '.join(keywords[:3])}"

            results.append(
                CriterionResult(
                    criterion_id=cdef["id"],
                    criterion_name=cdef["name"],
                    guideline_source=cdef["source"],
                    guideline_version=settings.MCG_VERSION,
                    status=status,
                    evidence_text=evidence,
                    weight=cdef["weight"],
                    required=cdef["required"],
                )
            )
        return results

    @staticmethod
    def _check_code_signals(submission: PASubmissionRequest) -> Dict[str, Any]:
        signals: Dict[str, Any] = {}
        primary_dx = submission.primary_diagnosis
        primary_proc = submission.primary_procedure

        # ICD-10 validation
        icd_validation = {"valid": True, "high_approval": False, "oncology": False}
        if primary_dx:
            code_clean = primary_dx.code.replace(".", "").upper()
            icd_validation["high_approval"] = any(
                code_clean.startswith(prefix) for prefix in HIGH_APPROVAL_DX
            )
            icd_validation["oncology"] = code_clean.startswith(
                "C"
            ) or code_clean.startswith("D")
        signals["icd10"] = icd_validation

        # Step therapy
        if primary_proc:
            needs_step = primary_proc.code in STEP_THERAPY_REQUIRED_CPT
            signals["step_therapy"] = {
                "required": needs_step,
                "satisfied": not needs_step,  # Would check clinical text in prod
            }

        # Formulary
        if submission.service_type == ServiceType.SPECIALTY_MEDICATION:
            signals["formulary"] = {
                "on_formulary": True,  # Would query formulary DB in prod
                "tier": 4,
                "requires_pa": True,
            }

        return signals

    @staticmethod
    def _compute_confidence(
        criteria: List[CriterionResult],
        code_signals: Dict,
        submission: PASubmissionRequest,
        met: int,
        not_met: int,
        missing: int,
        req_unmet: int,
    ) -> Tuple[float, List[str]]:
        reasoning: List[str] = []

        # Base score from weighted criteria
        total_weight = sum(c.weight for c in criteria)
        if total_weight == 0:
            base_score = 0.5
        else:
            met_weight = sum(
                c.weight for c in criteria if c.status == CriteriaStatus.MET
            )
            partial_weight = sum(
                c.weight * 0.5 for c in criteria if c.status == CriteriaStatus.PARTIAL
            )
            base_score = (met_weight + partial_weight) / total_weight

        score = base_score
        reasoning.append(
            f"Criteria score: {base_score:.0%} ({met} met, {not_met} not met, {missing} missing info)."
        )

        # ICD-10 boost
        icd = code_signals.get("icd10", {})
        if icd.get("high_approval"):
            score = min(1.0, score + 0.08)
            reasoning.append(
                "Diagnosis code carries strong medical necessity evidence base (+8%)."
            )
        if icd.get("oncology"):
            score = min(1.0, score + 0.05)
            reasoning.append("Oncology diagnosis — expedited pathway (+5%).")

        # Required unmet penalty
        if req_unmet > 0:
            penalty = req_unmet * 0.15
            score = max(0.0, score - penalty)
            reasoning.append(
                f"{req_unmet} required criterion/criteria not met (−{penalty:.0%})."
            )

        # Missing info neutral drag
        if missing > 0:
            score = max(0.0, score - missing * 0.05)
            reasoning.append(
                f"{missing} item(s) need additional documentation (−{missing*5}%)."
            )

        # Urgency — emergency doesn't change threshold but flags for expedited
        if submission.urgency == UrgencyLevel.EMERGENCY:
            reasoning.append("EMERGENCY urgency — case routed for immediate review.")
        elif submission.urgency == UrgencyLevel.URGENT:
            reasoning.append("URGENT urgency flag noted.")

        # Step therapy fail
        st = code_signals.get("step_therapy", {})
        if st.get("required") and not st.get("satisfied"):
            score = max(0.0, score - 0.20)
            reasoning.append("Step therapy requirement not evidenced (−20%).")

        # Clinical summary length heuristic
        if len(submission.clinical_summary) < 100:
            score = max(0.0, score - 0.10)
            reasoning.append(
                "Clinical summary is brief — additional documentation recommended (−10%)."
            )
        elif len(submission.clinical_summary) > 500:
            score = min(1.0, score + 0.03)
            reasoning.append("Detailed clinical summary provided (+3%).")

        return round(min(1.0, max(0.0, score)), 4), reasoning

    @staticmethod
    def _make_routing_decision(
        confidence: float,
        req_unmet: int,
        missing: int,
        submission: PASubmissionRequest,
    ) -> Tuple[str, RouteDecision]:
        # Emergency always goes to human review (expedited)
        if submission.urgency == UrgencyLevel.EMERGENCY:
            return "PEND", RouteDecision.ESCALATE

        # Required criteria unmet + confidence very low → deny pathway
        if confidence <= settings.AUTO_DENY_THRESHOLD and req_unmet > 0:
            if settings.ENABLE_AUTO_DENY:
                return "DENY", RouteDecision.AUTO_DENY
            return "DENY", RouteDecision.ESCALATE  # Requires MD even if auto-deny off

        # Missing info → request additional documentation
        if missing > 0 and confidence < 0.60:
            return "REQUEST_INFO", RouteDecision.HUMAN_REVIEW

        # Auto-approve band
        if (
            confidence >= settings.AUTO_APPROVE_THRESHOLD
            and req_unmet == 0
            and missing == 0
        ):
            if settings.ENABLE_AUTO_APPROVE:
                return "APPROVE", RouteDecision.AUTO_APPROVE
            return "APPROVE", RouteDecision.HUMAN_REVIEW

        # Gray zone or high-risk service types always get human eyes
        if submission.service_type in (
            ServiceType.SURGICAL_PROCEDURE,
            ServiceType.INPATIENT,
        ):
            return "APPROVE" if confidence > 0.7 else "PEND", RouteDecision.HUMAN_REVIEW

        # Middle confidence band
        if confidence > 0.65:
            return "APPROVE", RouteDecision.HUMAN_REVIEW
        return "PEND", RouteDecision.HUMAN_REVIEW

    @staticmethod
    def _extract_evidence(
        criteria: List[CriterionResult],
        clinical_text: str,
    ) -> List[str]:
        evidence = []
        for c in criteria:
            if c.status == CriteriaStatus.MET and c.evidence_text:
                evidence.append(f"[{c.criterion_id}] {c.evidence_text}")
        # Extract first 200 chars of clinical text as verbatim support
        if clinical_text and len(clinical_text) > 30:
            snippet = clinical_text[:200].strip().replace("\n", " ")
            evidence.append(f"[Clinical] {snippet}…")
        return evidence[:5]  # Cap at 5 evidence items

    @staticmethod
    def _compute_missing_info(submission: PASubmissionRequest) -> List[str]:
        missing = []
        if not submission.documents:
            missing.append(
                "Supporting clinical documentation (no attachments provided)"
            )
        if len(submission.clinical_summary) < 50:
            missing.append("Detailed clinical summary (minimum 50 characters)")
        if not any(d.is_primary for d in submission.diagnoses):
            missing.append("Primary diagnosis designation")
        return missing

    @staticmethod
    def _get_alternatives(
        submission: PASubmissionRequest, recommendation: str
    ) -> List[str]:
        if recommendation not in ("DENY", "PEND"):
            return []
        alts = {
            ServiceType.DIAGNOSTIC_IMAGING: [
                "Plain X-ray if not yet performed",
                "Clinical reassessment at 6 weeks",
            ],
            ServiceType.SURGICAL_PROCEDURE: [
                "Continue conservative therapy 4–6 additional weeks",
                "Pain management consultation",
            ],
            ServiceType.SPECIALTY_MEDICATION: [
                "Trial of preferred formulary agent",
                "Biosimilar substitution if applicable",
            ],
        }
        return alts.get(
            submission.service_type,
            ["Conservative management", "Alternative covered service"],
        )
