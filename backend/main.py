import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import db
import cache
from manager import ConnectionManager
from routers import cameras, incidents, health

load_dotenv()

# ─── Config ────────────────────────────────────────────────────────────────────

VIDEO_SOURCE = os.getenv("VIDEO_SOURCE", "")
CAMERA_ID = os.getenv("CAMERA_ID", "cam-001")
CAMERA_NAME = os.getenv("CAMERA_NAME", "Demo Feed")
CAMERA_VENUE = os.getenv("CAMERA_VENUE", "Main Hall")
WARN_THRESHOLD = int(os.getenv("WARN_THRESHOLD", "10"))
CRITICAL_THRESHOLD = int(os.getenv("CRITICAL_THRESHOLD", "20"))
CONFIDENCE = float(os.getenv("CONFIDENCE_THRESHOLD", "0.5"))
BROADCAST_INTERVAL = float(os.getenv("BROADCAST_INTERVAL", "2.0"))

_use_ml = VIDEO_SOURCE and Path(VIDEO_SOURCE).exists()

# ─── Manager ───────────────────────────────────────────────────────────────────

manager = ConnectionManager()

# ─── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.manager = manager
    app.state.start_time = time.time()
    app.state.pipeline = None

    # Initialise data layer (both are optional — degrade gracefully)
    await db.init_pool()
    await cache.init_redis()

    # Seed the real camera from .env into store (and DB if available)
    real_cam = {
        "id": CAMERA_ID,
        "name": CAMERA_NAME,
        "venue": CAMERA_VENUE,
        "rtspUrl": "",
        "status": "online",
        "fps": 0.0,
        "thresholds": [{"warning": WARN_THRESHOLD, "critical": CRITICAL_THRESHOLD}] * 9,
    }
    await db.seed_cameras([real_cam])

    # Start inference pipeline (no mock fallback — real data only)
    task = None
    if _use_ml:
        from inference.pipeline import Pipeline
        thresholds = [{"warning": WARN_THRESHOLD, "critical": CRITICAL_THRESHOLD}] * 9
        pipeline = Pipeline(
            source=VIDEO_SOURCE,
            camera_id=CAMERA_ID,
            camera_name=CAMERA_NAME,
            venue=CAMERA_VENUE,
            thresholds=thresholds,
            confidence=CONFIDENCE,
        )
        pipeline.start()
        app.state.pipeline = pipeline
        task = asyncio.create_task(pipeline.broadcast_loop(manager, BROADCAST_INTERVAL))
        print(f"[ARGUS] ML pipeline active — source: {VIDEO_SOURCE}")
    elif VIDEO_SOURCE:
        print(f"[ARGUS] WARNING: VIDEO_SOURCE='{VIDEO_SOURCE}' not found on disk")
    else:
        print("[ARGUS] No VIDEO_SOURCE set — set VIDEO_SOURCE in .env to activate ML")

    yield

    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    if app.state.pipeline:
        app.state.pipeline.stop()

    await db.close_pool()
    await cache.close_redis()


# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ARGUS Backend",
    description="Crowd density monitoring — YOLOv10 inference + WebSocket alert streaming",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cameras.router)
app.include_router(incidents.router)
app.include_router(health.router)


@app.get("/")
async def root():
    return {
        "service": "ARGUS Backend",
        "version": "3.0.0",
        "mode": "ml" if _use_ml else "mock",
        "video_source": VIDEO_SOURCE or None,
        "db": db.is_available(),
        "cache": cache.is_available(),
        "ws_clients": manager.count,
        "docs": "/docs",
    }


# ─── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    print(f"[WS] Client connected — {manager.count} total")

    try:
        # Send most recent snapshot immediately on connect
        # Priority: Redis cache → live pipeline result → generate fresh mock
        cached = await cache.get_snapshot()
        if cached:
            await manager.send(websocket, {"type": "metric_update", "data": cached})
        elif _use_ml and app.state.pipeline:
            result = app.state.pipeline._drain_latest()
            if result:
                from inference.threshold_evaluator import evaluate
                cells, _ = evaluate(result["counts"], app.state.pipeline.thresholds)
                snapshot = app.state.pipeline._build_snapshot(cells, result["fps"])
                await manager.send(websocket, {"type": "metric_update", "data": [snapshot]})

        # Listen for client → server messages
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = message.get("type")
            data = message.get("data", {})

            if msg_type == "threshold_config":
                cam_id = data.get("cameraId")
                cell_idx = data.get("cellIndex")
                warning = data.get("warning", WARN_THRESHOLD)
                critical = data.get("critical", CRITICAL_THRESHOLD)

                # Apply to running pipeline immediately
                if app.state.pipeline and app.state.pipeline.camera_id == cam_id:
                    if cell_idx is not None and 0 <= cell_idx < 9:
                        app.state.pipeline.thresholds[cell_idx] = {
                            "warning": warning,
                            "critical": critical,
                        }

                # Persist to DB
                if cam_id is not None and cell_idx is not None:
                    await db.update_threshold(cam_id, cell_idx, warning, critical)

                print(f"[WS] threshold_config applied: cam={cam_id} cell={cell_idx} w={warning} c={critical}")

            elif msg_type == "acknowledge":
                alert_id = data.get("alertId")
                session_id = data.get("sessionId", "unknown")
                ack_at = data.get("timestamp")
                if alert_id:
                    await db.acknowledge_incident(alert_id, session_id, ack_at)
                    print(f"[WS] acknowledged: {alert_id} by {session_id}")

            else:
                print(f"[WS] Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"[WS] Client disconnected — {manager.count} remaining")
    except Exception as e:
        print(f"[WS] Error: {e}")
        manager.disconnect(websocket)
