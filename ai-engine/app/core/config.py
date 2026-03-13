"""Centralised settings — all values from environment variables."""
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────────
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = Field(default="dev-secret-change-in-production-min-32-chars")
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001",
                                   "http://localhost:3002", "http://localhost:3003"]

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://pauser:papass@localhost:5432/pa_system"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 300          # 5 min default cache
    SESSION_TTL_SECONDS: int = 900        # 15 min HIPAA session timeout

    # ── Kafka ────────────────────────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_TOPIC_SUBMISSIONS: str = "pa-submissions"
    KAFKA_TOPIC_DECISIONS:   str = "pa-decisions"
    KAFKA_TOPIC_NOTIFICATIONS: str = "pa-notifications"
    KAFKA_CONSUMER_GROUP:    str = "ai-engine"

    # ── AWS / S3 ─────────────────────────────────────────────────────────────
    AWS_REGION: str = "us-east-1"
    S3_DOCUMENTS_BUCKET: str = "pa-documents-hipaa"
    AWS_ACCESS_KEY_ID: str = "AKIA-DUMMY-ACCESS-KEY"
    AWS_SECRET_ACCESS_KEY: str = "dummy-secret-access-key-1234567890"

    # ── AI / ML ──────────────────────────────────────────────────────────────
    # Confidence thresholds
    AUTO_APPROVE_THRESHOLD: float = 0.92   # >= auto-approve
    AUTO_DENY_THRESHOLD:    float = 0.15   # <= auto-deny (requires MD sign-off)
    HUMAN_REVIEW_LOWER:     float = 0.15   # review band lower
    HUMAN_REVIEW_UPPER:     float = 0.92   # review band upper
    # Model configuration
    NLP_MODEL_NAME: str = "en_core_web_trf"
    TRANSFORMER_MODEL: str = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract"
    MAX_INFERENCE_TOKENS: int = 512
    INFERENCE_BATCH_SIZE: int = 16
    # Criteria guidelines version
    MCG_VERSION: str = "2024.1"
    INTERQUAL_VERSION: str = "2024"

    # INT-301: MCG Care Guidelines API (https://guidelines.mcg.com/api/)
    MCG_API_KEY:  str = Field(default="mcg-dummy-key-for-testing")   # set in production
    MCG_API_BASE: str = "https://guidelines.mcg.com/api/v3"
    # INT-302: InterQual criteria engine (https://api.interqual.com/)
    INTERQUAL_API_KEY:  str = Field(default="iq-dummy-key-for-testing")   # set in production
    INTERQUAL_API_BASE: str = "https://api.interqual.com/v2"
    # INT-303: CMS NCD/LCD database (public, no key required)
    CMS_API_BASE: str = "https://api.cms.gov/coverage/v1"
    # Guidelines cache TTL (Redis)
    GUIDELINES_CACHE_TTL: int = 300   # 5 minutes

    # ── Security (SC-006 / HIPAA SC-004) ────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 15           # HIPAA: 15-min sessions (NFR-104)
    JWT_REFRESH_DAYS: int = 1
    ENCRYPTION_KEY: str = Field(default="dev-enc-key-32bytes-change-prod!")  # AES-256

    # SC-006: Key rotation — 90-day cycle (HIPAA §164.312(a)(2)(iv))
    # In production:
    #   PRIMARY_SECRET_KEY   = current signing key (from AWS Secrets Manager / KMS)
    #   SECONDARY_SECRET_KEY = previous key (kept for token verification during rotation window)
    #   KEY_VERSION          = monotonically increasing integer stamped into every JWT ("kv" claim)
    #   KEY_ROTATION_DAYS    = rotation frequency (90 days per SC-006)
    #
    # Rotation procedure (zero-downtime):
    #   1. Generate new PRIMARY_SECRET_KEY, promote old primary → SECONDARY_SECRET_KEY
    #   2. Increment KEY_VERSION
    #   3. Rolling-deploy all services with new env vars
    #   4. Tokens signed with old key verify via SECONDARY_SECRET_KEY until they expire (≤15 min)
    #   5. After grace period (≥ JWT_EXPIRE_MINUTES), SECONDARY_SECRET_KEY can be retired
    PRIMARY_SECRET_KEY:   str = Field(default="")   # overrides SECRET_KEY if set
    SECONDARY_SECRET_KEY: str = Field(default="")   # previous key — valid during rotation window
    KEY_VERSION:          int = 1                    # incremented on each rotation
    KEY_ROTATION_DAYS:    int = 90                   # SC-006: rotate every 90 days

    # ── External payer APIs ──────────────────────────────────────────────────
    UHC_API_BASE: str = "https://api.uhc.com/prior-auth/v2"
    UHC_CLIENT_ID: str = ""
    UHC_CLIENT_SECRET: str = ""
    AETNA_API_BASE: str = "https://api.aetna.com/prior-auth/v1"
    AETNA_CLIENT_ID: str = ""
    AETNA_CLIENT_SECRET: str = ""
    CVS_API_BASE: str = "https://api.cvscaremark.com/pa/v1"
    CVS_API_KEY: str = ""

    # ── Feature flags ────────────────────────────────────────────────────────
    ENABLE_AUTO_APPROVE: bool = True
    ENABLE_AUTO_DENY:    bool = False      # Off by default — requires compliance review
    ENABLE_FHIR_PUSH:    bool = True
    ENABLE_KAFKA:        bool = True
    ENABLE_RAG_ENGINE:   bool = True       # RAG-based guideline retrieval
    # AI Model settings
    BIOBERT_MODEL_ID:      str = "dmis-lab/biobert-v1.1"
    CLINICALBERT_MODEL_ID: str = "emilyalsentzer/Bio_ClinicalBERT"
    PUBMEDBERT_MODEL_ID:   str = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract"
    MODELS_CACHE_DIR:      str = "/models"
    USE_GPU:               bool = False
    # Service URLs (inter-service communication)
    AUTH_SERVICE_URL:          str = "http://auth-service:8007"
    USER_MGMT_SERVICE_URL:     str = "http://user-management-service:8008"
    REPORTING_SERVICE_URL:     str = "http://reporting-service:8009"
    ELIGIBILITY_SERVICE_URL:   str = "http://eligibility-service:8010"
    AUDIT_SERVICE_URL:         str = "http://audit-service:8011"
    NOTIFICATION_SERVICE_URL:  str = "http://notification-service:8005"
    DOCUMENT_SERVICE_URL:      str = "http://document-service:8006"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# (appended by build process)
