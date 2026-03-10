"""Centralised settings — all values from environment variables."""

from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────────
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = Field(default="dev-secret-change-in-production-min-32-chars")
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
    ]

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://pauser:papass@localhost:5432/pa_system"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 300  # 5 min default cache
    SESSION_TTL_SECONDS: int = 900  # 15 min HIPAA session timeout

    # ── Kafka ────────────────────────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_TOPIC_SUBMISSIONS: str = "pa-submissions"
    KAFKA_TOPIC_DECISIONS: str = "pa-decisions"
    KAFKA_TOPIC_NOTIFICATIONS: str = "pa-notifications"
    KAFKA_CONSUMER_GROUP: str = "ai-engine"

    # ── AWS / S3 ─────────────────────────────────────────────────────────────
    AWS_REGION: str = "us-east-1"
    S3_DOCUMENTS_BUCKET: str = "pa-documents-hipaa"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""

    # ── AI / ML ──────────────────────────────────────────────────────────────
    # Confidence thresholds
    AUTO_APPROVE_THRESHOLD: float = 0.92  # >= auto-approve
    AUTO_DENY_THRESHOLD: float = 0.15  # <= auto-deny (requires MD sign-off)
    HUMAN_REVIEW_LOWER: float = 0.15  # review band lower
    HUMAN_REVIEW_UPPER: float = 0.92  # review band upper
    # Model configuration
    NLP_MODEL_NAME: str = "en_core_web_trf"
    TRANSFORMER_MODEL: str = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract"
    MAX_INFERENCE_TOKENS: int = 512
    INFERENCE_BATCH_SIZE: int = 16
    # Criteria guidelines version
    MCG_VERSION: str = "2024.1"
    INTERQUAL_VERSION: str = "2024"

    # ── Security ─────────────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 15  # HIPAA: 15-min sessions
    JWT_REFRESH_DAYS: int = 1
    ENCRYPTION_KEY: str = Field(default="dev-enc-key-32bytes-change-prod!")  # AES-256

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
    ENABLE_AUTO_DENY: bool = False  # Off by default — requires compliance review
    ENABLE_FHIR_PUSH: bool = True
    ENABLE_KAFKA: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
