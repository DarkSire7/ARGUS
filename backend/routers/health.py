import time
from datetime import datetime, timezone
from fastapi import APIRouter, Request
import db
import cache

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def get_health(request: Request):
    manager = request.app.state.manager
    start_time = request.app.state.start_time
    pipeline = getattr(request.app.state, "pipeline", None)

    uptime_seconds = time.time() - start_time
    hours, remainder = divmod(int(uptime_seconds), 3600)
    days, hours = divmod(hours, 24)
    minutes = remainder // 60

    cameras = await db.get_cameras()

    cam_health = []
    for cam in cameras:
        fps = 0.0
        last_frame = None
        if pipeline and cam["id"] == pipeline.camera_id:
            fps = round(getattr(pipeline, "_current_fps", 0.0), 1)
            if fps > 0:
                last_frame = datetime.now(timezone.utc).strftime("%H:%M:%S")
        cam_health.append({
            "id": cam["id"],
            "name": cam["name"],
            "status": cam.get("status", "online"),
            "fps": fps,
            "lastFrame": last_frame,
        })

    return {
        "backendStatus": "connected",
        "dbConnected": db.is_available(),
        "cacheConnected": cache.is_available(),
        "wsClientCount": manager.count,
        "uptime": f"{days}d {hours}h {minutes}m",
        "cameras": cam_health,
    }
