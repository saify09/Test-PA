"""
Document Processing Service — Port 8006
Handles all clinical document operations (FR-002, FR-003):
  - Upload & storage (S3 / local)
  - OCR on scanned/faxed docs (98%+ accuracy target)
  - NLP entity extraction (diagnoses, procedures, medications, labs)
  - Document classification (clinical notes, labs, imaging reports, Rx)
  - Secure pre-signed URL generation
  - Virus scanning (ClamAV integration)
  - HIPAA-compliant document lifecycle
"""

from __future__ import annotations
import asyncio, base64, hashlib, io, json, mimetypes, os, re, uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from contextlib import asynccontextmanager
from enum import Enum
from pathlib import Path

import structlog
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    Query,
    BackgroundTasks,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings

log = structlog.get_logger(__name__)


# ── Settings ──────────────────────────────────────────────────────────────────
class Settings(BaseSettings):
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    AWS_REGION: str = "us-east-1"
    S3_BUCKET: str = "pa-documents-hipaa"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    LOCAL_STORAGE_PATH: str = "/tmp/pa_documents"
    MAX_FILE_SIZE_MB: int = 50
    PRESIGNED_URL_EXPIRY: int = 3600  # 1 hour
    ENABLE_VIRUS_SCAN: bool = True
    AI_ENGINE_URL: str = "http://localhost:8001"
    REDIS_URL: str = "redis://localhost:6379/5"

    class Config:
        env_file = ".env"


settings = Settings()


# ── Enums ─────────────────────────────────────────────────────────────────────
class DocumentType(str, Enum):
    CLINICAL_NOTES = "CLINICAL_NOTES"
    LAB_RESULTS = "LAB_RESULTS"
    IMAGING_REPORT = "IMAGING_REPORT"
    PRESCRIPTION = "PRESCRIPTION"
    REFERRAL_LETTER = "REFERRAL_LETTER"
    OPERATIVE_REPORT = "OPERATIVE_REPORT"
    DISCHARGE_SUMMARY = "DISCHARGE_SUMMARY"
    INSURANCE_CARD = "INSURANCE_CARD"
    PRIOR_AUTH_FORM = "PRIOR_AUTH_FORM"
    APPEAL_LETTER = "APPEAL_LETTER"
    OTHER = "OTHER"


class ProcessingStatus(str, Enum):
    UPLOADED = "UPLOADED"
    SCANNING = "SCANNING"
    CLEAN = "CLEAN"
    INFECTED = "INFECTED"
    PROCESSING = "PROCESSING"
    EXTRACTED = "EXTRACTED"
    FAILED = "FAILED"


# ── Schemas ───────────────────────────────────────────────────────────────────
class DocumentRecord(BaseModel):
    document_id: str
    pa_number: Optional[str]
    filename: str
    doc_type: DocumentType
    mime_type: str
    file_size_bytes: int
    s3_key: Optional[str]
    local_path: Optional[str]
    sha256_hash: str
    status: ProcessingStatus
    ocr_required: bool
    extracted_text: Optional[str] = None
    extracted_fields: Dict[str, Any] = {}
    diagnoses_found: List[str] = []
    procedures_found: List[str] = []
    medications_found: List[str] = []
    lab_values: Dict[str, Any] = {}
    ocr_confidence: Optional[float] = None
    extraction_confidence: Optional[float] = None
    uploader_id: Optional[str] = None
    uploaded_at: str
    processed_at: Optional[str] = None


class ExtractionResult(BaseModel):
    document_id: str
    pa_number: Optional[str]
    doc_type: DocumentType
    raw_text: str
    diagnoses_found: List[str]
    procedures_found: List[str]
    medications_found: List[str]
    lab_values: Dict[str, Any]
    extracted_fields: Dict[str, Any]
    ocr_confidence: float
    extraction_confidence: float
    processing_ms: float


# ── In-memory doc store (production: PostgreSQL) ──────────────────────────────
_documents: Dict[str, Dict[str, Any]] = {}


# ── S3 / local storage ────────────────────────────────────────────────────────
class StorageBackend:
    """Abstraction over S3 and local filesystem for dev/prod parity."""

    @staticmethod
    async def store(file_bytes: bytes, key: str) -> str:
        """Store file. Returns storage path / S3 key."""
        if settings.AWS_ACCESS_KEY_ID:
            return await StorageBackend._store_s3(file_bytes, key)
        return await StorageBackend._store_local(file_bytes, key)

    @staticmethod
    async def _store_s3(file_bytes: bytes, key: str) -> str:
        try:
            import boto3

            s3 = boto3.client("s3", region_name=settings.AWS_REGION)
            s3.put_object(
                Bucket=settings.S3_BUCKET,
                Key=key,
                Body=file_bytes,
                ServerSideEncryption="aws:kms",  # AES-256 via KMS
                Metadata={
                    "hipaa": "phi",
                    "uploaded": datetime.now(timezone.utc).isoformat(),
                },
            )
            log.info("storage.s3_stored", key=key, size=len(file_bytes))
            return f"s3://{settings.S3_BUCKET}/{key}"
        except Exception as e:
            log.warning("storage.s3_failed", error=str(e))
            return await StorageBackend._store_local(file_bytes, key)

    @staticmethod
    async def _store_local(file_bytes: bytes, key: str) -> str:
        path = Path(settings.LOCAL_STORAGE_PATH) / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(file_bytes)
        log.debug("storage.local_stored", path=str(path))
        return str(path)

    @staticmethod
    async def get(key: str) -> Optional[bytes]:
        if settings.AWS_ACCESS_KEY_ID and key.startswith("s3://"):
            try:
                import boto3

                s3 = boto3.client("s3", region_name=settings.AWS_REGION)
                bucket, obj_key = key[5:].split("/", 1)
                resp = s3.get_object(Bucket=bucket, Key=obj_key)
                return resp["Body"].read()
            except Exception as e:
                log.warning("storage.s3_get_failed", error=str(e))
                return None
        # Local
        path = Path(settings.LOCAL_STORAGE_PATH) / key.lstrip("/")
        if path.exists():
            return path.read_bytes()
        return None

    @staticmethod
    async def presigned_url(key: str, expiry: int = 3600) -> Optional[str]:
        if not settings.AWS_ACCESS_KEY_ID:
            return f"http://localhost:8006/documents/download/{key.split('/')[-1]}"
        try:
            import boto3

            s3 = boto3.client("s3", region_name=settings.AWS_REGION)
            return s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET, "Key": key},
                ExpiresIn=expiry,
            )
        except Exception:
            return None

    @staticmethod
    async def delete(key: str) -> bool:
        if settings.AWS_ACCESS_KEY_ID and key.startswith("s3://"):
            try:
                import boto3

                s3 = boto3.client("s3", region_name=settings.AWS_REGION)
                bucket, obj_key = key[5:].split("/", 1)
                s3.delete_object(Bucket=bucket, Key=obj_key)
                return True
            except Exception:
                return False
        path = Path(settings.LOCAL_STORAGE_PATH) / key.lstrip("/")
        if path.exists():
            path.unlink()
            return True
        return False


# ── Virus scanner ──────────────────────────────────────────────────────────────
async def virus_scan(file_bytes: bytes) -> Tuple[bool, str]:
    """Scan file with ClamAV. Returns (is_clean, reason)."""
    if not settings.ENABLE_VIRUS_SCAN:
        return True, "SCAN_DISABLED"
    try:
        import clamd

        cd = clamd.ClamdUnixSocket()
        result = cd.instream(io.BytesIO(file_bytes))
        status = result.get("stream", ("OK",))[0]
        is_clean = status == "OK"
        return is_clean, status
    except Exception:
        log.debug("virus_scan.clamav_unavailable_skipping")
        return True, "UNAVAILABLE"


# ── Document classifier ───────────────────────────────────────────────────────
def classify_document(filename: str, extracted_text: str) -> DocumentType:
    """Classify document type from filename and content keywords."""
    text_lower = extracted_text.lower() if extracted_text else ""
    fn_lower = filename.lower()

    patterns = [
        (
            DocumentType.LAB_RESULTS,
            ["lab", "laboratory", "hba1c", "cbc", "bmp", "lipid", "culture"],
        ),
        (
            DocumentType.IMAGING_REPORT,
            [
                "radiology",
                "mri",
                "ct scan",
                "x-ray",
                "ultrasound",
                "impression:",
                "technique:",
            ],
        ),
        (
            DocumentType.OPERATIVE_REPORT,
            ["operative", "procedure:", "surgeon:", "anesthesia", "incision"],
        ),
        (
            DocumentType.DISCHARGE_SUMMARY,
            ["discharge", "hospital course", "disposition:", "follow-up:"],
        ),
        (
            DocumentType.PRESCRIPTION,
            ["prescription", "sig:", "dispense", "refills:", "rx#", "pharmacy"],
        ),
        (
            DocumentType.REFERRAL_LETTER,
            ["referral", "refer", "specialist", "consultation request"],
        ),
        (
            DocumentType.PRIOR_AUTH_FORM,
            ["prior auth", "authorization request", "pa form", "formulary"],
        ),
        (
            DocumentType.APPEAL_LETTER,
            ["appeal", "reconsideration", "overturn", "grievance"],
        ),
        (DocumentType.INSURANCE_CARD, ["insurance", "member id", "group #", "plan id"]),
    ]
    for doc_type, keywords in patterns:
        if any(k in text_lower or k in fn_lower for k in keywords):
            return doc_type
    return DocumentType.CLINICAL_NOTES


# ── NLP extraction ────────────────────────────────────────────────────────────
ICD10_RE = re.compile(r"\b([A-Z]\d{2}(?:\.[A-Z0-9]{1,4})?)\b", re.I)
CPT_RE = re.compile(r"\b(\d{5})\b")
HCPCS_RE = re.compile(r"\b([A-Z]\d{4})\b", re.I)
LAB_RE = re.compile(
    r"(hemoglobin|hgb|a1c|hba1c|creatinine|egfr|bun|sodium|potassium|wbc|platelets|"
    r"alt|ast|bilirubin|albumin|psa|tsh|t4|ldl|hdl|triglycerides|glucose|hematocrit)"
    r"[:\s]+(\d+\.?\d*)\s*(g/dl|mg/dl|meq/l|u/l|%|ng/ml|miu/l|cells/μl|mmol/l)?",
    re.I,
)
MED_RE = re.compile(
    r"\b(methotrexate|adalimumab|humira|dupilumab|dupixent|pembrolizumab|keytruda|"
    r"bevacizumab|avastin|rituximab|infliximab|remicade|etanercept|enbrel|secukinumab|"
    r"prednisone|methylprednisolone|ibuprofen|naproxen|celecoxib|gabapentin|pregabalin|"
    r"atorvastatin|lisinopril|metformin|semaglutide|insulin|tramadol|oxycodone|"
    r"morphine|hydrocodone|fentanyl|cyclobenzaprine|baclofen|tizanidine)\b",
    re.I,
)


def extract_entities(text: str) -> Dict[str, Any]:
    """Extract clinical entities from document text."""
    upper = text.upper()
    diagnoses = list(dict.fromkeys(ICD10_RE.findall(upper)))[:20]
    cpt = [c for c in CPT_RE.findall(text) if 10000 <= int(c) <= 99999]
    hcpcs = list(dict.fromkeys(HCPCS_RE.findall(upper)))[:10]
    procedures = list(dict.fromkeys(cpt + hcpcs))[:15]
    medications = list(dict.fromkeys(m.lower() for m in MED_RE.findall(text)))[:20]
    labs = {}
    for m in LAB_RE.finditer(text):
        labs[m.group(1).lower()] = {"value": m.group(2), "unit": m.group(3) or ""}

    fields = {
        "conservative_therapy": bool(
            re.search(
                r"(tried|failed|completed)\s+(physical therapy|nsaids|ibuprofen|naproxen|conservative)",
                text,
                re.I,
            )
        ),
        "functional_impairment": bool(
            re.search(r"(impair|limit|disab|cannot|unable|difficulty)", text, re.I)
        ),
        "duration_of_symptoms": _extract_duration(text),
        "pain_scale": _extract_pain(text),
        "physician_name": _extract_physician(text),
        "dates_mentioned": re.findall(
            r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b", text
        )[:10],
    }
    return {
        "diagnoses": diagnoses,
        "procedures": procedures,
        "medications": medications,
        "labs": labs,
        "fields": fields,
    }


def _extract_duration(text: str) -> Optional[str]:
    m = re.search(
        r"(\d+)\s*(day|week|month|year)s?\s*(of\s*)?(symptom|pain|condition)?",
        text,
        re.I,
    )
    return f"{m.group(1)} {m.group(2)}s" if m else None


def _extract_pain(text: str) -> Optional[str]:
    m = re.search(
        r"pain\s*(?:score|scale|level|rating)?[:\s]+(\d+)\s*(?:/\s*10)?", text, re.I
    )
    return f"{m.group(1)}/10" if m else None


def _extract_physician(text: str) -> Optional[str]:
    m = re.search(
        r"(?:dr\.?|doctor|physician|provider)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)",
        text,
        re.I,
    )
    return m.group(1) if m else None


# ── OCR engine ────────────────────────────────────────────────────────────────
async def run_ocr(file_bytes: bytes, mime_type: str) -> Tuple[str, float]:
    """
    OCR pipeline: AWS Textract → pytesseract fallback.
    Returns (extracted_text, confidence_score).
    Target: 98%+ accuracy for typed text (FR-002).
    """
    # Try AWS Textract first
    if settings.AWS_ACCESS_KEY_ID:
        try:
            import boto3

            textract = boto3.client("textract", region_name=settings.AWS_REGION)
            response = textract.detect_document_text(Document={"Bytes": file_bytes})
            blocks = [b for b in response["Blocks"] if b["BlockType"] == "LINE"]
            text = "\n".join(b["Text"] for b in blocks)
            conf = (
                sum(b.get("Confidence", 95) for b in blocks) / max(len(blocks), 1) / 100
            )
            log.info(
                "ocr.textract_success", blocks=len(blocks), confidence=round(conf, 3)
            )
            return text, conf
        except Exception as e:
            log.warning("ocr.textract_failed", error=str(e))

    # pytesseract fallback
    try:
        import pytesseract
        from PIL import Image

        img = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(img)
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        confs = [c for c in data["conf"] if isinstance(c, (int, float)) and c > 0]
        conf = sum(confs) / max(len(confs), 1) / 100
        log.info("ocr.tesseract_success", confidence=round(conf, 3))
        return text, conf
    except Exception as e:
        log.warning("ocr.tesseract_failed", error=str(e))

    return "[OCR processing pending]", 0.0


# ── Processing pipeline ───────────────────────────────────────────────────────
async def process_document(doc_id: str):
    """Full async document processing pipeline."""
    doc = _documents.get(doc_id)
    if not doc:
        return

    doc["status"] = ProcessingStatus.PROCESSING.value
    t0 = datetime.now(timezone.utc)

    try:
        # Retrieve file bytes
        storage_key = doc.get("s3_key") or doc.get("local_path", "")
        file_bytes = await StorageBackend.get(storage_key)
        if not file_bytes:
            doc["status"] = ProcessingStatus.FAILED.value
            return

        mime = doc["mime_type"]
        text = ""
        ocr_conf = 1.0

        # OCR if image/PDF
        if mime in ("image/jpeg", "image/png", "image/tiff", "application/pdf"):
            text, ocr_conf = await run_ocr(file_bytes, mime)
            doc["ocr_required"] = True
            doc["ocr_confidence"] = round(ocr_conf, 3)
        elif mime == "text/plain":
            text = file_bytes.decode("utf-8", errors="replace")
        else:
            try:
                text = file_bytes.decode("utf-8", errors="replace")
            except Exception:
                text = ""

        # Entity extraction
        entities = extract_entities(text)

        # Classify
        doc_type = classify_document(doc["filename"], text)

        # Update record
        doc["extracted_text"] = text[:5000]  # Store first 5000 chars
        doc["doc_type"] = doc_type.value
        doc["extracted_fields"] = entities["fields"]
        doc["diagnoses_found"] = entities["diagnoses"]
        doc["procedures_found"] = entities["procedures"]
        doc["medications_found"] = entities["medications"]
        doc["lab_values"] = entities["labs"]

        # Extraction confidence (heuristic)
        ext_conf = 0.5
        if entities["diagnoses"]:
            ext_conf += 0.15
        if entities["procedures"]:
            ext_conf += 0.10
        if entities["medications"]:
            ext_conf += 0.10
        if entities["labs"]:
            ext_conf += 0.10
        if len(text) > 200:
            ext_conf += 0.05
        doc["extraction_confidence"] = round(min(1.0, ext_conf), 3)

        doc["status"] = ProcessingStatus.EXTRACTED.value
        doc["processed_at"] = datetime.now(timezone.utc).isoformat()
        processing_ms = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
        log.info(
            "document.processed",
            doc_id=doc_id,
            type=doc_type.value,
            dx=len(entities["diagnoses"]),
            ms=round(processing_ms),
        )

    except Exception as e:
        doc["status"] = ProcessingStatus.FAILED.value
        log.error("document.processing_failed", doc_id=doc_id, error=str(e))


# ── FastAPI app ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("document_service.starting", port=8006)
    Path(settings.LOCAL_STORAGE_PATH).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="Document Processing Service",
    description="HIPAA-compliant document upload, OCR, NLP extraction, and storage",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "document-processing",
        "version": settings.APP_VERSION,
    }


# ── POST /documents/upload ────────────────────────────────────────────────────
@app.post("/documents/upload", status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pa_number: Optional[str] = Form(None),
    doc_type: Optional[str] = Form(None),
    uploader_id: Optional[str] = Form(None),
):
    """
    Upload clinical document for a PA request.
    Triggers virus scan + async OCR/extraction pipeline.
    """
    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > settings.MAX_FILE_SIZE_MB:
        raise HTTPException(
            413, f"File too large ({size_mb:.1f}MB). Max {settings.MAX_FILE_SIZE_MB}MB."
        )

    # MIME validation
    allowed_mimes = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/tiff",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    mime = (
        file.content_type
        or mimetypes.guess_type(file.filename or "")[0]
        or "application/octet-stream"
    )
    if mime not in allowed_mimes:
        raise HTTPException(415, f"Unsupported file type: {mime}")

    # Hash for integrity / dedup
    sha256 = hashlib.sha256(file_bytes).hexdigest()

    # Virus scan
    is_clean, scan_result = await virus_scan(file_bytes)
    if not is_clean:
        log.warning(
            "document.virus_detected", filename=file.filename, result=scan_result
        )
        raise HTTPException(422, f"File rejected: virus detected ({scan_result})")

    doc_id = str(uuid.uuid4())
    ext = Path(file.filename or "doc").suffix
    s3_key = f"pa_documents/{pa_number or 'unlinked'}/{doc_id}{ext}"
    storage_path = await StorageBackend.store(file_bytes, s3_key)

    record = {
        "document_id": doc_id,
        "pa_number": pa_number,
        "filename": file.filename or f"document{ext}",
        "doc_type": doc_type or DocumentType.OTHER.value,
        "mime_type": mime,
        "file_size_bytes": len(file_bytes),
        "s3_key": s3_key,
        "local_path": storage_path,
        "sha256_hash": sha256,
        "status": ProcessingStatus.CLEAN.value,
        "ocr_required": mime != "text/plain",
        "extracted_text": None,
        "extracted_fields": {},
        "diagnoses_found": [],
        "procedures_found": [],
        "medications_found": [],
        "lab_values": {},
        "ocr_confidence": None,
        "extraction_confidence": None,
        "uploader_id": uploader_id,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "processed_at": None,
    }
    _documents[doc_id] = record
    background_tasks.add_task(process_document, doc_id)

    log.info(
        "document.uploaded",
        doc_id=doc_id,
        pa=pa_number,
        filename=file.filename,
        size_mb=round(size_mb, 2),
    )
    return {
        "document_id": doc_id,
        "pa_number": pa_number,
        "filename": file.filename,
        "status": "PROCESSING",
        "message": "Document uploaded and queued for OCR/extraction.",
    }


# ── GET /documents/{doc_id} ───────────────────────────────────────────────────
@app.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    doc = _documents.get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    # Don't expose full extracted text in list — use separate endpoint
    return {k: v for k, v in doc.items() if k != "extracted_text"}


# ── GET /documents/{doc_id}/extraction ───────────────────────────────────────
@app.get("/documents/{doc_id}/extraction")
async def get_extraction(doc_id: str):
    doc = _documents.get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc["status"] not in (ProcessingStatus.EXTRACTED.value,):
        return {
            "document_id": doc_id,
            "status": doc["status"],
            "message": "Processing not complete",
        }
    return ExtractionResult(
        document_id=doc_id,
        pa_number=doc.get("pa_number"),
        doc_type=DocumentType(doc["doc_type"]),
        raw_text=doc.get("extracted_text") or "",
        diagnoses_found=doc["diagnoses_found"],
        procedures_found=doc["procedures_found"],
        medications_found=doc["medications_found"],
        lab_values=doc["lab_values"],
        extracted_fields=doc["extracted_fields"],
        ocr_confidence=doc.get("ocr_confidence") or 0.0,
        extraction_confidence=doc.get("extraction_confidence") or 0.0,
        processing_ms=0.0,
    )


# ── GET /documents/{doc_id}/download ─────────────────────────────────────────
@app.get("/documents/{doc_id}/download")
async def download_document(doc_id: str):
    doc = _documents.get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    url = await StorageBackend.presigned_url(
        doc.get("s3_key", ""), settings.PRESIGNED_URL_EXPIRY
    )
    if url:
        from fastapi.responses import RedirectResponse

        return RedirectResponse(url=url)

    file_bytes = await StorageBackend.get(doc.get("local_path", ""))
    if not file_bytes:
        raise HTTPException(404, "File not found in storage")
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc["mime_type"],
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


# ── GET /documents — list by PA ───────────────────────────────────────────────
@app.get("/documents")
async def list_documents(
    pa_number: Optional[str] = None, page: int = 1, limit: int = 20
):
    docs = list(_documents.values())
    if pa_number:
        docs = [d for d in docs if d.get("pa_number") == pa_number]
    docs.sort(key=lambda d: d["uploaded_at"], reverse=True)
    start = (page - 1) * limit
    return {
        "items": [
            {k: v for k, v in d.items() if k != "extracted_text"}
            for d in docs[start : start + limit]
        ],
        "total": len(docs),
        "page": page,
    }


# ── DELETE /documents/{doc_id} ────────────────────────────────────────────────
@app.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str):
    doc = _documents.get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await StorageBackend.delete(doc.get("s3_key") or doc.get("local_path", ""))
    del _documents[doc_id]
    log.info("document.deleted", doc_id=doc_id)


# ── POST /documents/batch-extract ────────────────────────────────────────────
@app.post("/documents/batch-extract")
async def batch_extract(doc_ids: List[str], background_tasks: BackgroundTasks):
    """Trigger (re-)extraction on multiple documents."""
    queued = []
    for doc_id in doc_ids:
        if doc_id in _documents:
            background_tasks.add_task(process_document, doc_id)
            queued.append(doc_id)
    return {"queued": len(queued), "document_ids": queued}
