import time
from fastapi import APIRouter
from schemas import CameraRegisterRequest
import db

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("")
async def list_cameras():
    return await db.get_cameras()


@router.post("")
async def register_camera(body: CameraRegisterRequest):
    new_id = f"cam-{int(time.time())}"
    camera = {
        "id": new_id,
        "name": body.name,
        "venue": body.venue,
        "rtspUrl": body.rtspUrl,
        "status": "online",
        "fps": 0.0,
        "thresholds": [{"warning": 10, "critical": 20}] * 9,
    }
    await db.add_camera(camera)
    return {"success": True, "id": new_id}
