"""
In-memory store — lightweight DB substitute when PostgreSQL is unavailable.

Seeded from .env config on startup (see main.py lifespan).
Accumulates real incidents from the ML pipeline so Incident Log, Settings,
and System Health all show live data without needing Docker.
"""

_cameras: dict[str, dict] = {}
_incidents: list[dict] = []
_thresholds: dict[tuple, dict] = {}

_WARN_DEFAULT = 10
_CRIT_DEFAULT = 20


def seed(cameras: list[dict]) -> None:
    for cam in cameras:
        cid = cam["id"]
        defaults = [{"warning": _WARN_DEFAULT, "critical": _CRIT_DEFAULT}] * 9
        _cameras[cid] = {
            "id": cid,
            "name": cam["name"],
            "venue": cam["venue"],
            "rtspUrl": cam.get("rtspUrl", cam.get("rtsp_url", "")),
            "status": cam.get("status", "online"),
            "fps": cam.get("fps", 0.0),
            "thresholds": cam.get("thresholds", defaults),
        }
        for i, t in enumerate(cam.get("thresholds", defaults)):
            _thresholds[(cid, i)] = {"warning": t["warning"], "critical": t["critical"]}


def get_cameras() -> list[dict]:
    result = []
    for cam in _cameras.values():
        result.append({
            **cam,
            "thresholds": [
                _thresholds.get((cam["id"], i), {"warning": _WARN_DEFAULT, "critical": _CRIT_DEFAULT})
                for i in range(9)
            ],
        })
    return result


def add_camera(camera: dict) -> None:
    cid = camera["id"]
    _cameras[cid] = camera
    defaults = [{"warning": _WARN_DEFAULT, "critical": _CRIT_DEFAULT}] * 9
    for i, t in enumerate(camera.get("thresholds", defaults)):
        _thresholds[(cid, i)] = {"warning": t["warning"], "critical": t["critical"]}


def update_threshold(camera_id: str, cell_index: int, warning: int, critical: int) -> None:
    _thresholds[(camera_id, cell_index)] = {"warning": warning, "critical": critical}
    if camera_id in _cameras:
        _cameras[camera_id]["thresholds"] = [
            _thresholds.get((camera_id, i), {"warning": _WARN_DEFAULT, "critical": _CRIT_DEFAULT})
            for i in range(9)
        ]


def insert_incident(incident: dict) -> None:
    _incidents.insert(0, incident)
    if len(_incidents) > 500:
        _incidents.pop()


def get_incidents(
    camera_id: str | None = None,
    severity: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    result = list(_incidents)
    if camera_id:
        result = [i for i in result if i.get("cameraId") == camera_id]
    if severity:
        result = [i for i in result if i.get("severity") == severity]
    if start_date:
        result = [i for i in result if (i.get("timestamp") or "") >= start_date]
    if end_date:
        result = [i for i in result if (i.get("timestamp") or "") <= end_date]
    return result[:500]


def acknowledge_incident(alert_id: str, acknowledged_by: str, acknowledged_at: str) -> None:
    for idx, inc in enumerate(_incidents):
        if inc["id"] == alert_id:
            _incidents[idx] = {
                **inc,
                "acknowledged": True,
                "acknowledgedBy": acknowledged_by,
                "acknowledgedAt": acknowledged_at,
            }
            break
