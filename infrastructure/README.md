# AI Prior Authorization System

Production-grade, HIPAA-compliant Prior Authorization platform.
**7-session build** — all sessions included in this archive.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Kong API Gateway (:8000)                   │
│         Rate limiting · JWT auth · WAF · TLS 1.3               │
└──────────┬──────────┬──────────┬──────────┬──────────┬─────────┘
           │          │          │          │          │
     ┌─────▼──┐ ┌─────▼──┐ ┌────▼───┐ ┌────▼───┐ ┌───▼────┐
     │Provider│ │Reviewer│ │Member  │ │Admin   │ │(mobile)│
     │:3000   │ │:3001   │ │:3002   │ │:3003   │ │        │
     └────────┘ └────────┘ └────────┘ └────────┘ └────────┘

┌─────────────── Backend Microservices ──────────────────────────┐
│                                                                 │
│  Intake :8002  →  AI Engine :8001  →  Payer Integ. :8003      │
│       ↓                ↓                    ↓                  │
│  Appeals :8004    Notifications :8005   Documents :8006        │
│                                                                 │
│  ←────────────── Kafka (event bus) ──────────────────────→    │
└─────────────────────────────────────────────────────────────────┘

┌───── Data Layer ──────────────────────────────────────────────┐
│  PostgreSQL 16 (partitioned, encrypted)                       │
│  Redis 7 (sessions, cache, pub/sub)                           │
│  S3 (documents, AES-256-KMS, 7yr retention)                   │
└───────────────────────────────────────────────────────────────┘
```

---

## Archive Contents

```
pa-system-sessions-1-7/
├── provider-portal/          Next.js 14 — Provider PA submission
├── reviewer-workbench/       Next.js 14 — Clinical reviewer interface
├── member-portal/            Next.js 14 — Member status & appeals
├── admin-dashboard/          Next.js 14 — Operations & analytics
├── ai-engine/                FastAPI — AI inference, criteria engine
├── microservices/
│   ├── intake-service/       Multi-channel intake (FHIR, EDI 278)
│   ├── payer-integration/    UHC/Aetna REST + BCBS/Cigna EDI
│   ├── appeals-service/      Full lifecycle, 30d/72h deadlines
│   ├── notification-service/ Email/SMS/portal, EN+ES templates
│   ├── document-service/     OCR, NLP extraction, S3 storage
│   └── docker-compose.yml    Full local stack
└── infrastructure/
    ├── sql/init.sql           PostgreSQL schema + RLS + audit
    ├── k8s/                   Kubernetes manifests (EKS)
    ├── terraform/main.tf      AWS infra (VPC, EKS, RDS, Redis)
    ├── kong/kong.yaml         API gateway config
    ├── monitoring/            Prometheus alerts (20 rules)
    ├── cicd/deploy.yml        GitHub Actions CI/CD
    └── scripts/RUNBOOK.md     Ops runbook
```

---

## Quick Start — Local Docker Compose

```bash
cd microservices

# Copy env template
cp .env.example .env

# Start full stack (Postgres + Redis + Kafka + all services)
docker compose up -d

# Run DB migrations
docker compose exec ai-engine alembic upgrade head

# Verify health
curl http://localhost:8001/health   # AI Engine
curl http://localhost:8002/health   # Intake
curl http://localhost:8003/health   # Payer Integration
curl http://localhost:8004/health   # Appeals
curl http://localhost:8005/health   # Notifications
curl http://localhost:8006/health   # Documents
```

**Demo credentials (all services):**

| Role | Username | Password |
|---|---|---|
| Provider | `provider1` | `Provider@1234` |
| Reviewer RN | `reviewer1` | `Review@1234` |
| Medical Director | `meddir1` | `Doctor@1234` |
| Member | `member1` | `Member@1234` |
| Admin | `admin` | `Admin@1234` |

---

## Running Frontend Apps

```bash
# Provider Portal
cd provider-portal && npm install && npm run dev   # http://localhost:3000

# Reviewer Workbench
cd reviewer-workbench && npm install && npm run dev  # http://localhost:3001

# Member Portal
cd member-portal && npm install && npm run dev     # http://localhost:3002

# Admin Dashboard
cd admin-dashboard && npm install && npm run dev   # http://localhost:3003
```

---

## Running Tests

```bash
# Backend — AI Engine
cd ai-engine && pip install -r requirements.txt pytest pytest-asyncio httpx
pytest tests/ -v

# Backend — Microservices
cd microservices && pip install pytest pytest-asyncio httpx
# (install requirements from each service)
pytest tests/ -v

# Frontend type check
cd provider-portal && npm run build
```

---

## Production Deployment

### Prerequisites
- AWS CLI configured with appropriate permissions
- `kubectl` connected to EKS cluster
- `helm` v3.14+
- `terraform` v1.7+

### Steps

```bash
# 1. Provision AWS infrastructure
cd infrastructure/terraform
terraform init
terraform plan -var="db_password=$DB_PASSWORD" -out=plan.out
terraform apply plan.out

# 2. Configure kubectl
aws eks update-kubeconfig --region us-east-1 --name pa-system-production-eks

# 3. Install secrets (using Sealed Secrets or AWS Secrets Manager)
kubectl apply -f infrastructure/k8s/base/namespace.yaml

# 4. Deploy via Helm
helm upgrade --install pa-system ./infrastructure/helm/pa-system \
  --namespace pa-system \
  --values infrastructure/helm/pa-system/values-production.yaml \
  --wait --timeout 15m

# 5. Run migrations
kubectl run db-migrate --rm -it --restart=Never \
  --image=$ECR/pa-system/ai-engine:latest \
  -- alembic upgrade head

# 6. Configure Kong
deck sync --state infrastructure/kong/kong.yaml
```

---

## HIPAA Compliance Checklist

| Control | Implementation |
|---|---|
| AES-256 encryption at rest | PHI columns encrypted (AES-256-GCM), RDS KMS, S3 KMS |
| TLS 1.3 in transit | Kong enforces TLS 1.3, Redis TLS, RDS SSL required |
| MFA | TOTP MFA for all reviewer/admin accounts |
| RBAC | 7 role types, row-level security in PostgreSQL |
| Session timeout | 15-minute JWT expiry, 15-minute Redis session TTL |
| Audit logging | Append-only `audit.logs` table, 6-year retention |
| Minimum necessary access | Service accounts scoped per microservice |
| BAA | AWS BAA on file; SendGrid/Twilio BAA required |
| Incident response | Documented in `RUNBOOK.md` |

---

## Key PRD KPIs

| KPI | Target | Implementation |
|---|---|---|
| Auto-approval rate | >70% | AI Engine (BiomedBERT + MCG criteria) |
| AI accuracy | >92% | Criteria engine + appeal feedback loop |
| Turnaround time | <24h urgent / <72h routine | SLA engine + alerts |
| API p95 latency | <500ms | Kong + HPA autoscaling |
| Uptime | 99.9% | Multi-AZ EKS + RDS + Redis |
| Document OCR accuracy | >98% | AWS Textract primary + Tesseract fallback |

---

## Service Ports Summary

| Service | Port | Stack |
|---|---|---|
| Provider Portal | 3000 | Next.js 14 |
| Reviewer Workbench | 3001 | Next.js 14 |
| Member Portal | 3002 | Next.js 14 |
| Admin Dashboard | 3003 | Next.js 14 |
| AI Engine | 8001 | FastAPI / Python 3.11 |
| Intake Service | 8002 | FastAPI / Python 3.11 |
| Payer Integration | 8003 | FastAPI / Python 3.11 |
| Appeals Service | 8004 | FastAPI / Python 3.11 |
| Notification Service | 8005 | FastAPI / Python 3.11 |
| Document Service | 8006 | FastAPI / Python 3.11 |
| Kong Gateway | 8000 / 8443 | Kong 3.6 |
| Kafka UI | 8080 | Kafka UI |
| PostgreSQL | 5432 | PostgreSQL 16 |
| Redis | 6379 | Redis 7 |
