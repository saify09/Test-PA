"""
Security utilities:
- JWT creation/verification (HIPAA 15-min sessions)
- bcrypt password hashing
- AES-256-GCM PHI field encryption
"""
import base64
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── JWT ───────────────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_DAYS)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


# ── Password ─────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── AES-256-GCM PHI Encryption ───────────────────────────────────────────────
def _get_aes_key() -> bytes:
    """Derive 32-byte AES key from config (in prod: use AWS KMS)."""
    key_str = settings.ENCRYPTION_KEY
    key_bytes = key_str.encode("utf-8")
    # Pad/trim to exactly 32 bytes
    return (key_bytes + b"\x00" * 32)[:32]


def encrypt_phi(plaintext: str) -> str:
    """Encrypt PHI field with AES-256-GCM. Returns base64(nonce + ciphertext)."""
    if not plaintext:
        return plaintext
    key = _get_aes_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_phi(ciphertext_b64: str) -> str:
    """Decrypt AES-256-GCM encrypted PHI field."""
    if not ciphertext_b64:
        return ciphertext_b64
    try:
        key = _get_aes_key()
        aesgcm = AESGCM(key)
        raw = base64.b64decode(ciphertext_b64)
        nonce, ct = raw[:12], raw[12:]
        return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
    except Exception:
        return "[DECRYPTION_ERROR]"


def mask_phi(value: str, visible: int = 4) -> str:
    """Return masked version of PHI for logging (never log raw PHI)."""
    if not value or len(value) <= visible:
        return "****"
    return "*" * (len(value) - visible) + value[-visible:]
