"""
PostgreSQL data layer via asyncpg.

When DATABASE_URL is not set or Postgres is unreachable, every write goes to
the in-memory store (store.py) and every read returns from it — so the rest of
the backend works without Docker.
"""

import asyncpg
import os
from datetime import datetime, timezone

import store

_pool: asyncpg.Pool | None = None

# ─── Schema ────────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cameras (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    venue       TEXT NOT NULL,
    rtsp_url    TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'online',
    fps         FLOAT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS thresholds (
    camera_id   TEXT REFERENCES cameras(id) ON DELETE CASCADE,
    cell_index  INT  NOT NULL,
    warning     INT  NOT NULL DEFAULT 10,
    critical    INT  NOT NULL DEFAULT 20,
    PRIMARY KEY (camera_id, cell_index)
);

CREATE TABLE IF NOT EXISTS incidents (
    id               TEXT        PRIMARY KEY,
    camera_id        TEXT        NOT NULL,
    camera_name      TEXT        NOT NULL,
    venue            TEXT        NOT NULL,
    cell_index       INT         NOT NULL,
    count            INT         NOT NULL,
    threshold_value  INT         NOT NULL,
    severity         TEXT        NOT NULL,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged     BOOLEAN     NOT NULL DEFAULT FALSE,
    acknowledged_by  TEXT,
    acknowledged_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS incidents_camera_idx   ON incidents(camera_id);
CREATE INDEX IF NOT EXISTS incidents_severity_idx ON incidents(severity);
CREATE INDEX IF NOT EXISTS incidents_ts_idx       ON incidents(timestamp DESC);
"""

# ─── Init / teardown ───────────────────────────────────────────────────────────

async def init_pool() -> bool:
    global _pool
    url = os.getenv("DATABASE_URL", "")
    if not url:
        print("[DB] DATABASE_URL not set — using in-memory store (no PostgreSQL)")
        return False
    try:
        _pool = await asyncpg.create_pool(url, min_size=2, max_size=10, command_timeout=10)
        async with _pool.acquire() as conn:
            await conn.execute(_SCHEMA)
        print("[DB] PostgreSQL connected and schema ready")
        return True
    except Exception as e:
        print(f"[DB] Connection failed ({e}) — using in-memory store")
        _pool = None
        return False


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def is_available() -> bool:
    return _pool is not None

# ─── Cameras ───────────────────────────────────────────────────────────────────

async def seed_cameras(cameras: list[dict]) -> None:
    store.seed(cameras)
    if not _pool:
        return
    async with _pool.acquire() as conn:
        async with conn.transaction():
            for cam in cameras:
                await conn.execute(
                    """INSERT INTO cameras (id, name, venue, rtsp_url, status, fps)
                       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING""",
                    cam["id"], cam["name"], cam["venue"],
                    cam.get("rtspUrl", cam.get("rtsp_url", "")),
                    cam.get("status", "online"), cam.get("fps", 0.0),
                )
                for i, t in enumerate(cam.get("thresholds", [])):
                    await conn.execute(
                        """INSERT INTO thresholds (camera_id, cell_index, warning, critical)
                           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING""",
                        cam["id"], i, t["warning"], t["critical"],
                    )


async def get_cameras() -> list[dict]:
    if not _pool:
        return store.get_cameras()
    async with _pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM cameras ORDER BY name")
        cameras = []
        for row in rows:
            threshold_rows = await conn.fetch(
                "SELECT warning, critical FROM thresholds WHERE camera_id=$1 ORDER BY cell_index",
                row["id"],
            )
            cameras.append({
                "id": row["id"],
                "name": row["name"],
                "venue": row["venue"],
                "rtspUrl": row["rtsp_url"],
                "status": row["status"],
                "fps": row["fps"],
                "thresholds": [{"warning": t["warning"], "critical": t["critical"]} for t in threshold_rows],
            })
        return cameras


async def add_camera(camera: dict) -> None:
    store.add_camera(camera)
    if not _pool:
        return
    async with _pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """INSERT INTO cameras (id, name, venue, rtsp_url, status, fps)
                   VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING""",
                camera["id"], camera["name"], camera["venue"],
                camera.get("rtspUrl", ""), camera.get("status", "online"), camera.get("fps", 0.0),
            )
            for i, t in enumerate(camera.get("thresholds", [{"warning": 10, "critical": 20}] * 9)):
                await conn.execute(
                    """INSERT INTO thresholds (camera_id, cell_index, warning, critical)
                       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING""",
                    camera["id"], i, t["warning"], t["critical"],
                )


async def update_threshold(camera_id: str, cell_index: int, warning: int, critical: int) -> None:
    store.update_threshold(camera_id, cell_index, warning, critical)
    if not _pool:
        return
    async with _pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO thresholds (camera_id, cell_index, warning, critical)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (camera_id, cell_index)
               DO UPDATE SET warning=EXCLUDED.warning, critical=EXCLUDED.critical""",
            camera_id, cell_index, warning, critical,
        )


# ─── Incidents ─────────────────────────────────────────────────────────────────

async def insert_incident(incident: dict) -> None:
    store.insert_incident(incident)
    if not _pool:
        return
    try:
        async with _pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO incidents
                   (id, camera_id, camera_name, venue, cell_index, count,
                    threshold_value, severity, timestamp)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                   ON CONFLICT DO NOTHING""",
                incident["id"],
                incident["cameraId"],
                incident["cameraName"],
                incident["venue"],
                incident["cellIndex"],
                incident["count"],
                incident["thresholdValue"],
                incident["severity"],
                incident["timestamp"],
            )
    except Exception as e:
        print(f"[DB] Failed to insert incident: {e}")


async def get_incidents(
    camera_id: str | None = None,
    severity: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    if not _pool:
        return store.get_incidents(camera_id, severity, start_date, end_date)

    conditions = []
    params: list = []

    def add(cond: str, val):
        params.append(val)
        conditions.append(f"{cond} ${len(params)}")

    if camera_id:
        add("camera_id =", camera_id)
    if severity:
        add("severity =", severity)
    if start_date:
        add("timestamp >=", start_date)
    if end_date:
        add("timestamp <=", end_date)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"""
        SELECT id, camera_id, camera_name, venue, cell_index, count,
               threshold_value, severity, timestamp,
               acknowledged, acknowledged_by, acknowledged_at
        FROM incidents {where}
        ORDER BY timestamp DESC
        LIMIT 500
    """

    async with _pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [_row_to_incident(r) for r in rows]


async def acknowledge_incident(alert_id: str, acknowledged_by: str, acknowledged_at: str) -> None:
    store.acknowledge_incident(alert_id, acknowledged_by, acknowledged_at)
    if not _pool:
        return
    async with _pool.acquire() as conn:
        await conn.execute(
            """UPDATE incidents
               SET acknowledged=TRUE, acknowledged_by=$1, acknowledged_at=$2
               WHERE id=$3""",
            acknowledged_by, acknowledged_at, alert_id,
        )


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_incident(row) -> dict:
    def _iso(val) -> str | None:
        if val is None:
            return None
        return val.isoformat() if hasattr(val, "isoformat") else str(val)

    return {
        "id": row["id"],
        "cameraId": row["camera_id"],
        "cameraName": row["camera_name"],
        "venue": row["venue"],
        "cellIndex": row["cell_index"],
        "count": row["count"],
        "thresholdValue": row["threshold_value"],
        "severity": row["severity"],
        "timestamp": _iso(row["timestamp"]),
        "acknowledged": row["acknowledged"],
        "acknowledgedBy": row["acknowledged_by"],
        "acknowledgedAt": _iso(row["acknowledged_at"]),
    }
