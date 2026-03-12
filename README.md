# AI Prior Authorization System

A production-grade, HIPAA-compliant Prior Authorization (PA) platform powered by BioBERT, ClinicalBERT, RAG-based clinical guideline retrieval, and an automated decision engine. Built with a microservices architecture on FastAPI + Next.js 14.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND PORTALS                           │
│  Provider Portal :3000  │  Reviewer Workbench :3001                │
│  Member Portal   :3002  │  Admin Dashboard    :3003                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP (Next.js rewrites → /auth/* /api/v1/*)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│               KONG API GATEWAY  :8080 (HTTP) / :8443 (HTTPS)       │
│   Rate limiting · JWT validation · CORS · Request logging           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  AI Engine     │ │ Microservices│ │  Infrastructure  │
│  :8001         │ │              │ │                  │
│                │ │ :8002 Intake │ │ PostgreSQL  :5432 │
│ BioBERT NER    │ │ :8003 Payer  │ │ Redis       :6379 │
│ ClinicalBERT   │ │ :8004 Appeals│ │ Kafka       :9092 │
│ RAG Engine     │ │ :8005 Notif  │ │ Prometheus  :9090 │
│ OCR (Textract) │ │ :8006 Docs   │ │ Grafana     :3100 │
│ Auto-Decision  │ │ :8007 Auth   │ │                  │
│                │ │ :8008 Users  │ │                  │
│                │ │ :8009 Report │ │                  │
│                │ │ :8010 Eligib │ │                  │
│                │ │ :8011 Audit  │ │                  │
└────────────────┘ └──────────────┘ └──────────────────┘
```

---

## Quick Start

### Prerequisites

- Docker 24+ and Docker Compose v2
- 8 GB RAM minimum (16 GB recommended for AI models)
- macOS, Linux, or WSL2

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/pa-system.git
cd pa-system
cp .env.example .env
# Edit .env — set SECRET_KEY, ENCRYPTION_KEY, and AWS credentials at minimum
```

### 2. Start the Stack

```bash
docker compose up -d
```

Services start in dependency order. The AI Engine takes ~2 minutes to warm up ML models.

### 3. Verify Health

```bash
curl http://localhost:8001/health          # AI Engine
curl http://localhost:8001/health/models  # ML model status
curl http://localhost:8001/docs           # OpenAPI docs
```

### 4. Access the Portals

| Portal | URL | Credentials |
|---|---|---|
| Provider Portal | http://localhost:3000 | `provider1` / `Provider@1234` |
| Reviewer Workbench | http://localhost:3001 | `reviewer1` / `Review@1234` |
| Member Portal | http://localhost:3002 | `member1` / `Member@1234` |
| Admin Dashboard | http://localhost:3003 | `admin` / `Admin@1234` |
| Grafana | http://localhost:3100 | `admin` / (set via `GRAFANA_PASSWORD`) |
| Prometheus | http://localhost:9090 | — |

---

## Service Reference

### AI Engine (Port 8001)

Core clinical AI service. All frontend traffic routes here.

**Auth routes** (`/auth/*`):
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Provider/reviewer login |
| POST | `/auth/admin/login` | Admin login |
| POST | `/auth/member/login` | Member login |
| POST | `/auth/member/register` | Member self-registration |
| POST | `/auth/forgot-password` | Password reset initiation |
| POST | `/auth/refresh` | Refresh JWT |
| POST | `/auth/logout` | Revoke token |
| GET | `/auth/me` | Current user profile |

**Provider Portal routes** (`/api/v1/*`):
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/prior-authorizations` | List PAs |
| POST | `/api/v1/prior-authorizations` | Submit PA (triggers AI) |
| GET | `/api/v1/prior-authorizations/stats` | Dashboard KPIs |
| GET | `/api/v1/prior-authorizations/{id}` | PA detail |
| GET | `/api/v1/prior-authorizations/{id}/history` | Status timeline |
| GET | `/api/v1/prior-authorizations/{id}/letter` | Decision letter (PDF) |
| POST | `/api/v1/prior-authorizations/{id}/cancel` | Cancel PA |
| POST | `/api/v1/prior-authorizations/{id}/peer-to-peer` | Request P2P |
| POST | `/api/v1/prior-authorizations/{id}/appeals` | Submit appeal |
| GET | `/api/v1/prior-authorizations/{id}/appeals` | List appeals |
| POST | `/api/v1/eligibility/verify` | Real-time eligibility check |
| POST | `/api/v1/documents/upload` | Upload clinical document |
| DELETE | `/api/v1/documents/{id}` | Delete document |
| GET | `/api/v1/notifications` | Provider notifications |
| PUT | `/api/v1/notifications/{id}/read` | Mark read |
| PUT | `/api/v1/notifications/read-all` | Mark all read |
| DELETE | `/api/v1/notifications/{id}` | Delete notification |
| GET | `/api/v1/lookup/icd10` | ICD-10 code search |
| GET | `/api/v1/lookup/cpt` | CPT code search |
| GET | `/api/v1/lookup/npi` | NPI directory search |
| GET | `/api/v1/lookup/specialties` | Medical specialties |
| GET | `/api/v1/lookup/places-of-service` | Place of service codes |

**Reviewer Workbench routes**:
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/review-queue` | PA review queue |
| GET | `/api/v1/review-queue/stats` | Queue statistics |
| POST | `/api/v1/review-queue/{id}/assign` | Assign to reviewer |
| POST | `/api/v1/review-queue/{id}/self-assign` | Self-assign |
| DELETE | `/api/v1/review-queue/{id}/assign` | Unassign |
| GET | `/api/v1/cases/{id}/review` | Full case detail |
| GET | `/api/v1/cases/{id}/ai-analysis` | AI recommendation detail |
| GET | `/api/v1/cases/{id}/guidelines` | Applicable guidelines |
| GET | `/api/v1/cases/{id}/history` | Case history |
| GET | `/api/v1/cases/{id}/documents` | Case documents |
| PUT | `/api/v1/cases/{id}/draft` | Save draft notes |
| POST | `/api/v1/cases/{id}/decision` | Submit decision |
| POST | `/api/v1/cases/{id}/request-info` | Request additional info |
| POST | `/api/v1/cases/{id}/annotations` | Add annotation |
| POST | `/api/v1/cases/{id}/co-sign` | Co-sign decision |
| POST | `/api/v1/cases/{id}/p2p-response` | Record P2P outcome |
| GET | `/api/v1/metrics/reviewer` | Reviewer performance |
| GET | `/api/v1/metrics/queue` | Queue metrics |
| GET | `/api/v1/metrics/ai-accuracy` | AI accuracy metrics |

**Member Portal routes** (`/api/v1/member/*`):
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/member/pa-requests` | Member's PA list |
| GET | `/api/v1/member/pa-requests/status` | Check PA status |
| GET | `/api/v1/member/pa-requests/{id}` | PA detail |
| GET | `/api/v1/member/pa-requests/{id}/letter` | Determination letter |
| GET | `/api/v1/member/appeals` | Member's appeals |
| GET | `/api/v1/member/appeals/{id}` | Appeal detail |
| POST | `/api/v1/member/appeals` | Submit appeal |
| GET | `/api/v1/member/notifications` | Member notifications |
| PUT | `/api/v1/member/notifications/{id}/read` | Mark read |
| PUT | `/api/v1/member/notifications/read-all` | Mark all read |
| GET | `/api/v1/member/notification-preferences` | Notification prefs |
| PUT | `/api/v1/member/notification-preferences` | Update prefs |
| GET | `/api/v1/member/profile` | Member profile |
| PUT | `/api/v1/member/profile` | Update profile |

**Admin Dashboard routes** (`/api/v1/admin/*`):

Analytics (11 endpoints): `kpis`, `volume`, `decisions`, `tat`, `ai-metrics`, `by-payer`, `by-service`, `denial-reasons`, `reviewer-performance`, `sla-compliance`, `appeals`

User Management: full CRUD + `enable`, `disable`, `reset-password`

Cases: list, get, export (CSV), reassign, override

Audit Log: paginated query + CSV export

System: `health`, `services`, `queues`, `config` (read/write), `incidents`, `ai-models`

---

## AI/ML Pipeline

```
Document Upload
     │
     ▼
OCR (AWS Textract → pytesseract fallback)
     │
     ▼
NLP Extraction (BioBERT NER)
  - ICD-10 codes
  - CPT codes
  - Medications (NDC)
  - Clinical conditions
     │
     ▼
RAG Retrieval (ClinicalBERT + FAISS)
  - MCG Care Guidelines
  - InterQual criteria
  - Payer-specific policies
     │
     ▼
ClinicalBERT Classifier
  - Medical necessity score
  - Criteria match %
  - Confidence calibration (Platt scaling)
     │
     ▼
Auto-Decision Engine
  - ≥ 0.92 confidence → AUTO_APPROVE
  - ≤ 0.15 confidence → AUTO_DENY
  - Otherwise → HUMAN_REVIEW_REQUIRED
     │
     ▼
Kafka Event (pa-submissions topic)
  - Triggers notifications
  - Updates payer systems
  - Records audit log
```

---

## Microservices

| Service | Port | Description |
|---|---|---|
| `auth-service` | 8007 | JWT, MFA (TOTP), SAML 2.0 / OAuth 2.0 SSO |
| `user-management-service` | 8008 | RBAC, 8 roles, provider directory (NPI) |
| `intake-service` | 8002 | PA submission, EDI 278 validation |
| `payer-integration` | 8003 | UHC, Aetna, BCBS, Cigna, Humana APIs |
| `appeals-service` | 8004 | Appeals workflow, P2P consultation |
| `notification-service` | 8005 | Email (SendGrid), SMS (Twilio), fax, FHIR |
| `document-service` | 8006 | S3 upload, OCR coordination, DICOM |
| `eligibility-service` | 8010 | X12 270/271, formulary (CVS/Caremark) |
| `reporting-service` | 8009 | KPIs, analytics, CSV/JSON exports |
| `audit-service` | 8011 | HIPAA audit log, SHA-256 tamper detection |

---

## HIPAA Compliance

| Control | Implementation |
|---|---|
| Access Control (§164.312(a)) | RBAC with 8 roles; JWT with 60-min TTL |
| Audit Controls (§164.312(b)) | Immutable audit log; 7-year retention; SIEM forwarding |
| Integrity (§164.312(c)) | SHA-256 checksums on all audit entries |
| Transmission Security (§164.312(e)) | TLS 1.3; AES-256 at rest (S3 SSE) |
| Authentication (§164.312(d)) | MFA (TOTP); SAML 2.0 SSO; 15-min inactivity timeout |
| PHI Minimum Necessary | Role-gated endpoints; PHI field logging |

---

## Roles and Demo Credentials

| Role | Username | Password | Access |
|---|---|---|---|
| Provider | `provider1` | `Provider@1234` | Submit PAs, track status, appeal |
| RN Reviewer | `reviewer1` | `Review@1234` | Review queue, annotate, pend |
| Medical Director | `meddir1` | `Doctor@1234` | Decisions, co-sign, P2P |
| Member | `member1` | `Member@1234` | View own PAs, submit appeal |
| Super Admin | `admin` | `Admin@1234` | Full system access |
| Ops Admin | `ops1` | `Ops@1234` | System monitoring, config |

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# REQUIRED — change before any non-dev use
SECRET_KEY=your-jwt-secret-min-32-chars
ENCRYPTION_KEY=your-aes256-key-exactly-32-bytes

# DATABASE
DATABASE_URL=postgresql+asyncpg://pauser:papass@postgres:5432/pa_system
REDIS_URL=redis://:redispass@redis:6379/0

# AWS (for S3 document storage and Textract OCR)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
S3_DOCUMENTS_BUCKET=pa-documents-hipaa

# PAYER APIs
UHC_CLIENT_ID=...
UHC_CLIENT_SECRET=...
AETNA_CLIENT_ID=...
AETNA_CLIENT_SECRET=...
BCBS_API_KEY=...
CIGNA_CLIENT_ID=...
CIGNA_CLIENT_SECRET=...

# NOTIFICATIONS
SENDGRID_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+15550000000

# AI MODELS
BIOBERT_MODEL_ID=dmis-lab/biobert-v1.1
CLINICALBERT_MODEL_ID=emilyalsentzer/Bio_ClinicalBERT
ENABLE_RAG_ENGINE=true
USE_GPU=0

# CLINICAL GUIDELINES
MCG_API_KEY=...
INTERQUAL_API_KEY=...
```

---

## Development

### Run AI Engine locally

```bash
cd ai-engine
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Run a Frontend locally

```bash
cd provider-portal
npm install
NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev
```

### Run Tests

```bash
# AI Engine unit tests
cd ai-engine && pytest tests/ -v

# Microservices integration tests
pytest microservices/tests/ -v

# Frontend type-check + build
cd provider-portal && npx tsc --noEmit && npm run build
```

---

## CI/CD Pipeline

`.github/workflows/deploy.yml` runs on every push:

1. **Backend Tests** — pytest for AI engine + microservices (with Postgres + Redis service containers)
2. **Frontend Tests** — TypeScript type-check + Next.js production build for all 4 portals
3. **Security Scanning** — Bandit (Python SAST), Trivy (container CVEs), Gitleaks (secret scan)
4. **Docker Build & ECR Push** — builds all 11 images, pushes to Amazon ECR
5. **Staging Deploy** — Helm upgrade to `pa-system-staging-eks`
6. **Production Deploy** — canary 20% → monitor 5 min → promote to 100% (auto-rollback on >5% error rate)

### Required GitHub Secrets

```
AWS_ACCOUNT_ID
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
DATABASE_URL          (production database URL)
SLACK_WEBHOOK_URL     (deployment notifications)
```

---

## Infrastructure

### Kubernetes (EKS)

```bash
# Apply base manifests
kubectl apply -f infrastructure/k8s/base/

# Or use Helm
helm upgrade --install pa-system ./infrastructure/helm/pa-system \
  --values infrastructure/helm/pa-system/values-staging.yaml
```

### Terraform (AWS)

```bash
cd infrastructure/terraform
terraform init
terraform plan -var-file=terraform.tfvars.example
terraform apply
```

Provisions: VPC, EKS cluster, RDS PostgreSQL, ElastiCache Redis, MSK Kafka, S3 buckets, ECR repositories.

### Monitoring

- **Prometheus** — scrapes all 11 services every 15s; `http://localhost:9090`
- **Grafana** — pre-built PA System dashboard at `http://localhost:3100`
- **Alerts** — SLA breach, high error rate, model drift, queue backlog (see `infrastructure/monitoring/prometheus/alerts.yaml`)

---

## SLA Targets

| Urgency | Decision SLA | Auto-Decision |
|---|---|---|
| Emergent | 8 hours | Immediate if conf ≥ 0.92 |
| Urgent | 24 hours | Immediate if conf ≥ 0.92 |
| Routine | 72 hours | Immediate if conf ≥ 0.92 |

**Uptime SLA**: 99.9% (< 8.7 hours downtime/year)

---

## Troubleshooting

**AI Engine won't start**
```bash
docker compose logs ai-engine
# If ML models fail to load, check MODELS_CACHE_DIR volume and disk space
```

**Frontend can't reach backend**
```bash
# Verify next.config.js rewrites are in place
# Provider portal should proxy /auth/* and /api/v1/* to ai-engine:8001
docker compose logs provider-portal
```

**Database connection errors**
```bash
docker compose exec postgres psql -U pauser -d pa_system -c "SELECT 1"
```

**Full runbook**: `infrastructure/scripts/RUNBOOK.md`

---

## License

Proprietary. All rights reserved. HIPAA-compliant system — PHI handling governed by BAA.
