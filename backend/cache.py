"""
Redis cache layer for ARGUS.

Stores the latest per-camera metric snapshot so a newly connected dashboard
client receives current state immediately instead of waiting for the next
inference cycle.

Degrades gracefully if Redis is unavailable — operations become no-ops and
get_snapshot() returns None (caller falls back to mock/generated data).
"""

import json
import os

import redis.asyncio as aioredis

_client: aioredis.Redis | None = None
_SNAPSHOT_KEY = "argus:latest_snapshot"
_SNAPSHOT_TTL = 300  # 5 minutes — prevents stale data surviving a long outage


async def init_redis() -> bool:
    global _client
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    try:
        client = aioredis.from_url(url, decode_responses=True, socket_connect_timeout=3)
        await client.ping()
        _client = client
        print("[Cache] Redis connected")
        return True
    except Exception as e:
        print(f"[Cache] Redis unavailable ({e}) — running without snapshot cache")
        _client = None
        return False


async def close_redis() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


def is_available() -> bool:
    return _client is not None


async def set_snapshot(snapshot: list[dict]) -> None:
    if not _client:
        return
    try:
        await _client.set(_SNAPSHOT_KEY, json.dumps(snapshot, default=str), ex=_SNAPSHOT_TTL)
    except Exception as e:
        print(f"[Cache] set_snapshot failed: {e}")


async def get_snapshot() -> list[dict] | None:
    if not _client:
        return None
    try:
        data = await _client.get(_SNAPSHOT_KEY)
        return json.loads(data) if data else None
    except Exception as e:
        print(f"[Cache] get_snapshot failed: {e}")
        return None
