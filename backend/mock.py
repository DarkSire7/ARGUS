"""
Python mirror of frontend/src/services/mockData.js.
Generates the same camera list and snapshot/alert/incident shapes
so Phase 1 backend produces data the frontend already understands.
Replaced entirely in Phase 2 by real YOLOv10 inference.
"""
import random
from datetime import datetime, timezone, timedelta


MOCK_CAMERAS: list[dict] = [
    {
        "id": "cam-001",
        "name": "Main Entrance Gate A",
        "venue": "North Wing",
        "rtspUrl": "rtsp://192.168.1.101:554/stream",
        "status": "online",
        "fps": 24.3,
        "thresholds": [{"warning": 10, "critical": 20}] * 9,
    },
    {
        "id": "cam-002",
        "name": "Food Court Central",
        "venue": "East Wing",
        "rtspUrl": "rtsp://192.168.1.102:554/stream",
        "status": "online",
        "fps": 22.7,
        "thresholds": [{"warning": 8, "critical": 15}] * 9,
    },
    {
        "id": "cam-003",
        "name": "Emergency Exit B7",
        "venue": "South Wing",
        "rtspUrl": "rtsp://192.168.1.103:554/stream",
        "status": "online",
        "fps": 25.0,
        "thresholds": [{"warning": 5, "critical": 10}] * 9,
    },
    {
        "id": "cam-004",
        "name": "Parking Lot West",
        "venue": "West Wing",
        "rtspUrl": "rtsp://192.168.1.104:554/stream",
        "status": "offline",
        "fps": 0.0,
        "thresholds": [{"warning": 12, "critical": 25}] * 9,
    },
]

_extra_cameras: list[dict] = []
_alert_counter = 1000


def get_all_cameras() -> list[dict]:
    return MOCK_CAMERAS + _extra_cameras


def add_camera(camera: dict) -> None:
    _extra_cameras.append(camera)


def _get_severity(count: int, warning: int, critical: int) -> str:
    if count >= critical:
        return "critical"
    if count >= warning:
        return "warning"
    return "green"


def _generate_cells(camera: dict) -> list[dict]:
    if camera["status"] == "offline":
        return [{"cellIndex": i, "count": 0, "severity": "green"} for i in range(9)]

    cells = []
    for i, threshold in enumerate(camera["thresholds"]):
        warning = threshold["warning"]
        critical = threshold["critical"]
        roll = random.random()

        if roll < 0.50:
            count = random.randint(0, max(0, int(warning * 0.6)))
        elif roll < 0.80:
            count = random.randint(max(0, int(warning * 0.5)), warning)
        elif roll < 0.95:
            count = random.randint(warning, critical)
        else:
            count = random.randint(critical, critical + 8)

        cells.append({
            "cellIndex": i,
            "count": count,
            "severity": _get_severity(count, warning, critical),
        })
    return cells


def generate_full_snapshot() -> list[dict]:
    snapshots = []
    for cam in get_all_cameras():
        cells = _generate_cells(cam)
        fps = round(cam["fps"] + (random.random() - 0.5) * 2, 1) if cam["status"] == "online" else 0.0
        snapshots.append({
            "cameraId": cam["id"],
            "cameraName": cam["name"],
            "venue": cam["venue"],
            "status": cam["status"],
            "fps": fps,
            "totalOccupancy": sum(c["count"] for c in cells),
            "cells": cells,
        })
    return snapshots


def generate_mock_alert(snapshots: list[dict]) -> dict | None:
    global _alert_counter

    breaches = [
        {
            "cameraId": snap["cameraId"],
            "cameraName": snap["cameraName"],
            "venue": snap["venue"],
            "cellIndex": cell["cellIndex"],
            "count": cell["count"],
            "severity": cell["severity"],
        }
        for snap in snapshots
        if snap["status"] == "online"
        for cell in snap["cells"]
        if cell["severity"] in ("critical", "warning")
    ]

    if not breaches:
        return None

    breach = random.choice(breaches)
    camera = next((c for c in get_all_cameras() if c["id"] == breach["cameraId"]), None)
    if not camera:
        return None

    threshold = camera["thresholds"][breach["cellIndex"]]
    threshold_val = threshold["critical"] if breach["severity"] == "critical" else threshold["warning"]

    _alert_counter += 1
    return {
        "id": f"alert-{_alert_counter}",
        **breach,
        "thresholdValue": threshold_val,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "acknowledged": False,
        "acknowledgedBy": None,
        "acknowledgedAt": None,
    }


def generate_mock_incidents(count: int = 50) -> list[dict]:
    online_cameras = [c for c in get_all_cameras() if c["status"] == "online"]
    if not online_cameras:
        return []

    now = datetime.now(timezone.utc)
    incidents = []

    for i in range(count):
        cam = random.choice(online_cameras)
        cell_index = random.randint(0, 8)
        threshold = cam["thresholds"][cell_index]
        is_critical = random.random() > 0.5

        severity = "critical" if is_critical else "warning"
        threshold_val = threshold["critical"] if is_critical else threshold["warning"]
        count_val = (
            random.randint(threshold["critical"], threshold["critical"] + 10)
            if is_critical
            else random.randint(threshold["warning"], threshold["critical"])
        )

        acknowledged = random.random() > 0.3
        ts = now - timedelta(seconds=random.randint(60, 86400 * 7))
        ack_at = (ts + timedelta(seconds=random.randint(30, 600))).isoformat() if acknowledged else None

        incidents.append({
            "id": f"incident-{1000 + i}",
            "cameraId": cam["id"],
            "cameraName": cam["name"],
            "venue": cam["venue"],
            "cellIndex": cell_index,
            "count": count_val,
            "thresholdValue": threshold_val,
            "severity": severity,
            "timestamp": ts.isoformat(),
            "acknowledged": acknowledged,
            "acknowledgedBy": f"operator-{random.randint(1, 5)}" if acknowledged else None,
            "acknowledgedAt": ack_at,
        })

    return sorted(incidents, key=lambda x: x["timestamp"], reverse=True)


def generate_system_health(ws_client_count: int = 0, uptime_seconds: float = 0.0) -> dict:
    hours, remainder = divmod(int(uptime_seconds), 3600)
    days, hours = divmod(hours, 24)
    minutes = remainder // 60

    return {
        "backendStatus": "connected",
        "backendLatency": random.randint(5, 45),
        "wsClientCount": ws_client_count,
        "uptime": f"{days}d {hours}h {minutes}m",
        "cameras": [
            {
                "id": cam["id"],
                "name": cam["name"],
                "status": cam["status"],
                "fps": round(cam["fps"] + (random.random() - 0.5) * 3, 1) if cam["status"] == "online" else 0.0,
                "lastFrame": datetime.now(timezone.utc).isoformat() if cam["status"] == "online" else None,
            }
            for cam in get_all_cameras()
        ],
    }
