"""
NLPExtractor — Document intelligence service.

Implements:
  - FR-002: OCR on scanned/faxed docs (98%+ accuracy)
  - FR-003: Extract key data elements: diagnoses, procedures, labs, medications
  - TR-101: NLP transformer-based models
  - TR-104: Named entity recognition for ICD-10, CPT, NDC codes

Uses BioBERTService for NER + OCRService for document extraction.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog

from app.core.config import settings
from app.schemas.pa_schemas import DocumentExtractionRequest, DocumentExtractionResult
from app.services.model_service import BioBERTService, ClinicalNERResult
from app.services.ocr_service import OCRService

log = structlog.get_logger(__name__)


class NLPExtractor:
    """Orchestrates OCR + BioBERT NER for clinical document processing."""

    @classmethod
    async def warmup(cls) -> None:
        """Pre-load models."""
        await BioBERTService.load()
        await OCRService.warmup()
        log.info("nlp_extractor.ready")

    @classmethod
    async def ocr_document(cls, s3_key: str) -> str:
        """Perform OCR on a document stored in S3. Returns raw text."""
        result = await OCRService.extract_text_from_s3(s3_key)
        return result.get("text", "")

    @classmethod
    async def extract(
        cls,
        request: DocumentExtractionRequest,
        raw_text: str,
    ) -> DocumentExtractionResult:
        """
        Full extraction pipeline:
        1. Preprocess text
        2. BioBERT NER for entities
        3. Regex patterns for structured fields
        4. Build structured result
        """
        t0 = time.perf_counter()
        clean_text = cls._preprocess(raw_text)

        # BioBERT NER
        ner: ClinicalNERResult = await BioBERTService.extract_entities(clean_text)

        # Additional regex extraction
        dates   = _extract_dates(clean_text)
        labs    = ner.lab_values or _extract_labs_regex(clean_text)
        drugs   = ner.drug_names or _extract_drugs_regex(clean_text)
        prior_tx = _extract_prior_treatments(clean_text)
        chief_complaint = _extract_chief_complaint(clean_text)

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)

        return DocumentExtractionResult(
            document_id=request.document_id,
            # Codes
            icd10_codes=ner.icd10_codes[:5],
            cpt_codes=ner.cpt_codes[:5],
            ndc_codes=ner.ndc_codes[:5],
            # Clinical
            drug_names=drugs[:10],
            conditions=ner.conditions[:8],
            lab_results=labs[:12],
            prior_treatments=prior_tx[:8],
            chief_complaint=chief_complaint,
            # Metadata
            word_count=len(clean_text.split()),
            has_clinical_summary=len(clean_text) > 200,
            has_lab_results=len(labs) > 0,
            has_prior_treatments=len(prior_tx) > 0,
            extraction_confidence=0.95 if ner.model_used == "biobert" else 0.85,
            model_used=ner.model_used,
            processing_ms=elapsed_ms,
        )

    @staticmethod
    def _preprocess(text: str) -> str:
        """Clean OCR output: normalize whitespace, remove noise."""
        # Remove page headers/footers
        text = re.sub(r"Page \d+ of \d+", "", text, flags=re.I)
        # Normalize whitespace
        text = re.sub(r"\r\n", "\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Fix common OCR errors
        text = text.replace("|", "I").replace("0ther", "Other")
        return text.strip()


# ── Regex helpers ─────────────────────────────────────────────────────────────
_DATE_RE = re.compile(
    r"\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}"
    r"|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b",
    re.I,
)
_LAB_RE = re.compile(
    r"(hemoglobin|hgb|a1c|creatinine|egfr|bun|sodium|wbc|platelets|alt|ast|psa|tsh|ldl|hdl|crp|esr)"
    r"\s*[:\-]?\s*(\d+\.?\d*)\s*(g/dl|mg/dl|meq/l|u/l|%|ng/ml|miu/l|mm/hr)?",
    re.I,
)
_DRUG_RE = re.compile(
    r"\b(methotrexate|adalimumab|humira|dupixent|dupilumab|prednisone|ibuprofen|naproxen"
    r"|tramadol|oxycodone|gabapentin|pregabalin|atorvastatin|lisinopril|metformin|insulin"
    r"|semaglutide|ozempic|pembrolizumab|keytruda|bevacizumab|rituximab|infliximab|remicade"
    r"|etanercept|enbrel|secukinumab|cosentyx|abatacept|cyclobenzaprine)\b",
    re.I,
)
_PRIOR_TX_RE = re.compile(
    r"(?:tried|attempted|failed|completed|underwent|received)\s+"
    r"(physical therapy|PT|chiropractic|NSAIDs?|ibuprofen|naproxen|conservative"
    r"|rest|ice|heat|corticosteroid|injection|epidural|acupuncture|massage)",
    re.I,
)
_CHIEF_RE = re.compile(
    r"(?:chief complaint|cc|reason for visit|presenting complaint)\s*[:\-]\s*([^\n.]{10,150})",
    re.I,
)

def _extract_dates(text: str) -> List[str]:
    return list(dict.fromkeys(m.group(1) for m in _DATE_RE.finditer(text)))[:10]

def _extract_labs_regex(text: str) -> List[Dict[str, str]]:
    return [{"name": m.group(1).upper(), "value": m.group(2), "unit": m.group(3) or ""}
            for m in _LAB_RE.finditer(text)][:12]

def _extract_drugs_regex(text: str) -> List[str]:
    return list(dict.fromkeys(m.group(1).lower() for m in _DRUG_RE.finditer(text)))[:10]

def _extract_prior_treatments(text: str) -> List[str]:
    return list(dict.fromkeys(m.group(0) for m in _PRIOR_TX_RE.finditer(text)))[:8]

def _extract_chief_complaint(text: str) -> Optional[str]:
    m = _CHIEF_RE.search(text)
    if m:
        return m.group(1).strip()[:200]
    # Fallback: first non-header sentence
    sentences = [s.strip() for s in text.split(".") if len(s.strip()) > 30]
    return sentences[0][:200] if sentences else None
