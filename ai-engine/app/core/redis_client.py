"""Redis async client with connection pool."""

import redis.asyncio as redis
import structlog
from app.core.config import settings

log = structlog.get_logger(__name__)
_redis_client: redis.Redis | None = None


async def init_redis():
    global _redis_client
    try:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis_client.ping()
        log.info("redis.connected")
    except Exception as e:
        log.warning("redis.unavailable", error=str(e))
        _redis_client = None


async def check_redis() -> bool:
    if not _redis_client:
        return False
    try:
        await _redis_client.ping()
        return True
    except Exception:
        return False


def get_redis() -> redis.Redis | None:
    return _redis_client


async def cache_get(key: str) -> str | None:
    if not _redis_client:
        return None
    try:
        return await _redis_client.get(key)
    except Exception:
        return None


async def cache_set(key: str, value: str, ttl: int = settings.CACHE_TTL_SECONDS):
    if not _redis_client:
        return
    try:
        await _redis_client.setex(key, ttl, value)
    except Exception:
        pass


async def cache_delete(key: str):
    if not _redis_client:
        return
    try:
        await _redis_client.delete(key)
    except Exception:
        pass
