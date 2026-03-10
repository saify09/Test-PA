# AI-Driven Prior Authorization System
### Enterprise Healthcare AI Platform | HIPAA-Compliant | Full-Stack

[![HIPAA Compliant](https://img.shields.io/badge/HIPAA-Compliant-green)](docs/)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green)](https://fastapi.tiangolo.com)

## Overview

An end-to-end AI-powered Prior Authorization system that:
- **Automates 70%+** of PA approvals using BioBERT + ClinicalBERT AI
- **Processes claims** in <5 seconds with RAG-based clinical criteria matching
- **Integrates** with EHR systems (Epic, Cerner) via FHIR R4 / HL7 v2.x
- **Connects** to UHC, Aetna, BCBS, Cigna payer APIs
- **Maintains** full HIPAA compliance with immutable audit trails

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND PORTALS (Next.js 14)             │
│  Provider Portal:3000 | Reviewer:3001 | Member:3002 | Admin:3003 │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                     ┌────────────┴────────────┐
                     │   Kong API Gateway:8000  │
                     └────────────┬────────────┘
                                  │
┌─────────────────────────────────┴────────────────────────────┐
│                    BACKEND MICROSERVICES (FastAPI)             │
│                                                               │
│  AI Engine:8001        ← BioBERT, ClinicalBERT, RAG, OCR    │
│  Intake Service:8002   ← PA submission, EDI 278              │
│  Payer Integration:8003 ← UHC/Aetna/BCBS/Cigna APIs        │
│  Appeals Service:8004  ← FR-401..407 appeals workflow        │
│  Notification:8005     ← Email/SMS/Fax/HL7/FHIR             │
│  Document Service:8006 ← OCR, S3 storage, DICOM             │
│  Auth Service:8007     ← JWT, MFA, SAML/OAuth SSO           │
│  User Mgmt:8008        ← RBAC, provider directory           │
│  Reporting:8009        ← KPIs, analytics, exports           │
│  Eligibility:8010      ← X12 270/271, formulary checks      │
│  Audit Service:8011    ← HIPAA audit logs, SIEM             │
└─────────────────────────────────┬────────────────────────────┘
                                  │
┌─────────────────────────────────┴────────────────────────────┐
│                    INFRASTRUCTURE                             │
│  PostgreSQL:5432 | Redis:6379 | Kafka:9092                   │
│  Prometheus:9090 | Grafana:3100 | Kong:8080                  │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Docker Desktop 4.x+ with Docker Compose v2
- 8GB RAM (16GB recommended for AI models)
- 20GB free disk space

### 1. Configure Environment
```bash
cp .env.example .env
# Edit .env and fill in your API keys
# At minimum, SECRET_KEY and ENCRYPTION_KEY must be set
```

### 2. Start All Services
```bash
docker compose up -d
```

### 3. Initialize Database
```bash
docker compose exec postgres psql -U pauser -d pa_system -f /docker-entrypoint-initdb.d/01-init.sql
```

### 4. Access Portals
| Portal | URL | Credentials |
|--------|-----|-------------|
| Provider Portal | http://localhost:3000 | provider1 / Provider@1234 |
| Reviewer Workbench | http://localhost:3001 | reviewer1 / Review@1234 |
| Member Portal | http://localhost:3002 | member1 / Member@1234 |
| Admin Dashboard | http://localhost:3003 | admin / Admin@1234 |
| Grafana | http://localhost:3100 | admin / admin123 |
| API Docs (AI Engine) | http://localhost:8001/docs | |

## AI Engine Details

### Models Used
| Model | Purpose | HuggingFace ID |
|-------|---------|----------------|
| BioBERT | Named Entity Recognition (ICD-10, CPT, NDC) | dmis-lab/biobert-v1.1 |
| ClinicalBERT | Medical necessity classification | emilyalsentzer/Bio_ClinicalBERT |
| PubMedBERT | RAG guideline similarity search | microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract |

### AI Pipeline
```
Document Upload → OCR (AWS Textract/pytesseract)
                → BioBERT NER (entities)
                → ClinicalBERT (classification)
                → RAG (guideline retrieval)
                → CriteriaEngine (MCG/InterQual matching)
                → ScoringService (calibrated confidence)
                → AutoDecisionService (approve/deny/route)
```

### Confidence Thresholds
- **Auto-Approve**: ≥ 92% confidence
- **Human Review**: 15% - 92% confidence
- **Auto-Deny** (pending MD co-sign): ≤ 15% confidence

## Services Reference

### Auth Service (8007)
- JWT token issuance (60-min access, 7-day refresh)
- MFA via TOTP (NFR-101)
- SAML 2.0 + OAuth 2.0 SSO (TR-305)
- 15-minute session inactivity timeout (NFR-104)

### Eligibility Service (8010)
- Real-time X12 270/271 eligibility checks (INT-201)
- PBM formulary verification with step therapy (INT-203)
- Provider credentialing via NPPES (INT-205)
- Care management risk scores (INT-204)

### Audit Service (8011)
- Immutable HIPAA audit log (SC-002)
- SHA-256 tamper detection checksums
- 7-year retention (TR-203)
- SIEM integration (NFR-107)
- Regulatory export (JSON/CSV)

## HIPAA Compliance

| Control | Implementation |
|---------|---------------|
| Access Control (SC-001) | JWT + MFA + RBAC |
| Audit Controls (SC-002) | Immutable audit-service |
| Transmission Security (SC-004) | TLS 1.3 enforced |
| Encryption at Rest (SC-006) | AES-256 via AWS KMS |
| Session Timeout (NFR-104) | 15-minute inactivity |
| PHI Masking | Encrypted in DB, masked in logs |
| Minimum Necessary (SC-007) | RBAC with least privilege |

## API Reference

### Submit PA Request
```bash
curl -X POST http://localhost:8001/api/v1/portal/pa/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"member": {...}, "primary_diagnosis": {"code": "M54.5"}, ...}'
```

### Get AI Analysis
```bash
curl -X POST http://localhost:8001/api/v1/ai/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pa_number": "PA-2026-000001", ...}'
```

### GraphQL API (TR-003)
```
http://localhost:8001/graphql  (GraphiQL IDE)
```

### Verify Eligibility
```bash
curl -X POST http://localhost:8010/eligibility/verify \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"member_id": "MB12345678", "payer": "UHC"}'
```

## Project Structure

```
pa-system/
├── provider-portal/          # Next.js 14 — Provider self-service
├── reviewer-workbench/       # Next.js 14 — Clinical reviewer UI
├── member-portal/            # Next.js 14 — Patient portal
├── admin-dashboard/          # Next.js 14 — Admin & analytics
├── ai-engine/                # FastAPI — BioBERT, ClinicalBERT, RAG
│   └── app/
│       ├── services/
│       │   ├── model_service.py    # BioBERT + ClinicalBERT
│       │   ├── ocr_service.py      # AWS Textract + pytesseract
│       │   ├── nlp_extractor.py    # NLP pipeline
│       │   ├── criteria_engine.py  # MCG/InterQual matching
│       │   ├── auto_decision.py    # Decision state machine
│       │   └── rag/                # RAG guideline retrieval
│       └── api/v1/endpoints/
│           ├── analyze.py          # Core AI endpoints
│           ├── auth.py             # JWT auth
│           ├── portal.py           # PA workflow
│           ├── admin.py            # Admin endpoints
│           ├── mlops.py            # Model management
│           └── graphql_api.py      # GraphQL (TR-003)
├── microservices/
│   ├── intake-service/             # PA ingestion
│   ├── payer-integration/          # Payer APIs
│   ├── appeals-service/            # Appeals workflow
│   ├── notification-service/       # Notifications
│   ├── document-service/           # Document management
│   ├── auth-service/               # Authentication
│   ├── user-management-service/    # RBAC + directory
│   ├── reporting-service/          # KPIs + reports
│   ├── eligibility-service/        # X12 eligibility
│   └── audit-service/              # HIPAA audit log
├── infrastructure/
│   ├── sql/init.sql                # Database schema
│   ├── kong/kong.yaml              # API gateway config
│   ├── terraform/main.tf           # AWS infrastructure
│   ├── k8s/                        # Kubernetes manifests
│   ├── helm/                       # Helm chart
│   └── monitoring/                 # Prometheus + Grafana
├── docker-compose.yml              # Complete stack
├── .env.example                    # Environment template
└── README.md                       # This file
```

## Production Deployment

See `infrastructure/terraform/main.tf` for AWS EKS deployment.
See `.github/workflows/deploy.yml` for CI/CD pipeline.

## Support

- API Documentation: http://localhost:8001/docs
- Architecture: `infrastructure/README.md`
- HIPAA runbook: `infrastructure/scripts/RUNBOOK.md`
