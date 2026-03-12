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


# ── SC-006: Key rotation helpers ─────────────────────────────────────────────

def _active_signing_key() -> str:
    """Return the current signing key.
    If PRIMARY_SECRET_KEY is set (production: from Secrets Manager), use it.
    Fall back to SECRET_KEY (dev/CI default).
    """
    return settings.PRIMARY_SECRET_KEY or settings.SECRET_KEY


def _verification_keys() -> list[str]:
    """Return all valid verification keys for the current rotation window.

    During a 90-day rotation (SC-006), two keys are valid simultaneously:
      - primary   (new key  — used for all new tokens)
      - secondary (old key  — still valid until existing tokens expire ≤ 15 min)
    This enables zero-downtime key rotation across a rolling deployment.
    """
    keys = [_active_signing_key()]
    if settings.SECONDARY_SECRET_KEY and settings.SECONDARY_SECRET_KEY != _active_signing_key():
        keys.append(settings.SECONDARY_SECRET_KEY)
    return keys


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    # SC-006: stamp key version ("kv") so audit logs can trace which key signed the token
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
        "kv": settings.KEY_VERSION,
    })
    return jwt.encode(to_encode, _active_signing_key(), algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_DAYS)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
        "kv": settings.KEY_VERSION,
    })
    return jwt.encode(to_encode, _active_signing_key(), algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> dict[str, Any] | None:
    """Verify JWT against all keys valid in the current rotation window (SC-006).

    Tries PRIMARY key first (fast path), then falls back to SECONDARY key
    so tokens signed just before a rotation remain valid for their 15-min lifetime.
    """
    for key in _verification_keys():
        try:
            return jwt.decode(token, key, algorithms=[settings.JWT_ALGORITHM])
        except JWTError:
            continue
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


# ── TOTP / MFA (SC-001, NFR-101) ─────────────────────────────────────────────
# RFC 6238 TOTP — implemented via stdlib so no extra dep at import time.
# In production, pyotp==2.9.0 is in requirements.txt and used if available.

def _totp_generate_secret() -> str:
    """Generate a cryptographically random Base32 TOTP secret (160 bits)."""
    try:
        import pyotp                                    # preferred — pyotp 2.9
        return pyotp.random_base32()
    except ImportError:
        pass
    # Fallback: stdlib implementation
    random_bytes = secrets.token_bytes(20)              # 160-bit secret
    return base64.b32encode(random_bytes).decode("utf-8")


def totp_new_secret() -> str:
    """Public API: create a new TOTP secret for a user (enrollment)."""
    return _totp_generate_secret()


def totp_provisioning_uri(secret: str, username: str,
                          issuer: str = "PA_System") -> str:
    """Return otpauth:// URI for QR code scanning."""
    try:
        import pyotp
        return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)
    except ImportError:
        pass
    # Fallback: manual URI construction (RFC 6238 / Google Authenticator format)
    from urllib.parse import quote
    label = quote(f"{issuer}:{username}")
    params = (
        f"secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits=6&period=30"
    )
    return f"otpauth://totp/{label}?{params}"


def totp_verify(secret: str, code: str, valid_window: int = 1) -> bool:
    """Verify a 6-digit TOTP code.  valid_window=1 allows ±30 sec clock skew.

    Returns True if code is valid and has not been used (replay detection
    should be implemented at the session layer using Redis).
    """
    if not secret or not code:
        return False
    # Strip spaces/dashes the user might have typed
    code = code.replace(" ", "").replace("-", "").strip()
    if not code.isdigit() or len(code) != 6:
        return False

    try:
        import pyotp
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=valid_window)
    except ImportError:
        pass

    # Fallback: stdlib TOTP (RFC 6238)
    import hmac as _hmac
    import struct as _struct
    import time as _time

    def _hotp(key_b32: str, counter: int) -> str:
        key = base64.b32decode(key_b32.upper())
        msg = _struct.pack(">Q", counter)
        digest = _hmac.new(key, msg, hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        truncated = _struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
        return str(truncated % 10 ** 6).zfill(6)

    now_counter = int(_time.time()) // 30
    for delta in range(-valid_window, valid_window + 1):
        if _hotp(secret, now_counter + delta) == code:
            return True
    return False


def generate_backup_codes(n: int = 10) -> list[str]:
    """Generate n single-use 8-digit backup codes (formatted as XXXX-XXXX)."""
    codes = []
    for _ in range(n):
        raw = str(secrets.randbelow(100_000_000)).zfill(8)
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


# Roles that REQUIRE MFA before full token issuance (SC-001)
MFA_REQUIRED_ROLES: frozenset[str] = frozenset({
    "REVIEWER_RN",
    "MEDICAL_DIRECTOR",
    "SUPER_ADMIN",
    "ADMIN",
    "OPS_ADMIN",
})
