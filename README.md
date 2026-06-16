# ARGUS — Autonomous Real-time Grid-based Urban Surveillance

AI-powered crowd density monitoring system. Runs YOLOv10 person detection on a live video feed, maps detections to a 3×3 spatial grid, and streams real-time alerts to a React dashboard over WebSocket.

Built as a mini project demonstrating end-to-end ML integration: computer vision → backend inference pipeline → live frontend.

---

## Architecture

```
Video File / RTSP Stream
        │
        ▼
  FrameReader (OpenCV)
        │
        ▼
  YOLOv10-N (Ultralytics)  ← detects class 0 (person) only
        │
        ▼
  ZoneMapper  ← centroid pixel → 3×3 grid cell index
        │
        ▼
  ThresholdEvaluator  ← warning / critical per cell
        │
   ┌────┴────┐
   ▼         ▼
Pipeline   Alerts ──→ FastAPI WebSocket ──→ React Dashboard
(broadcast)
```

- **Backend:** FastAPI + Uvicorn, async WebSocket broadcast, optional PostgreSQL + Redis (degrades to in-memory store without either)
- **ML:** YOLOv10-N via Ultralytics — daemon thread for inference, async broadcast loop every 2s
- **Frontend:** React + Vite + Tailwind CSS, WebSocket state lifted to app root so data persists across navigation

---

## Quick Start (Local — no Docker required)

### Prerequisites

- Python 3.11+
- Node.js 18+
- A crowd video (MP4) — see [Demo Video](#demo-video) below

### 1. Clone

```bash
git clone https://github.com/DarkSire7/ARGUS.git
cd ARGUS
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:

```env
VIDEO_SOURCE=videos/demo.mp4

CAMERA_ID=cam-001
CAMERA_NAME=Mall Hallway
CAMERA_VENUE=Main Hall

WARN_THRESHOLD=4
CRITICAL_THRESHOLD=5
CONFIDENCE_THRESHOLD=0.5
BROADCAST_INTERVAL=2.0
```

> Set `WARN_THRESHOLD` and `CRITICAL_THRESHOLD` low (3–6) for a crowded video to trigger alerts frequently.

Place your demo video at `backend/videos/demo.mp4`, then:

```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```

On first run Ultralytics auto-downloads `yolov10n.pt` (~6 MB). Expected output:

```
[DB] DATABASE_URL not set — using in-memory store (no PostgreSQL)
[ARGUS] ML pipeline active — source: videos/demo.mp4
[Pipeline] Started — source=videos/demo.mp4 res=640x360 native_fps=25.0
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:8001
```

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Demo Video

Any YouTube crowd footage works (shopping mall, train station, airport).

```bash
pip install yt-dlp
python -m yt_dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio/best[height<=720]" \
  --merge-output-format mp4 -o backend/videos/demo.mp4 "<YOUTUBE_URL>"
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VIDEO_SOURCE` | *(required for ML mode)* | Path to video file, relative to `backend/` |
| `CAMERA_ID` | `cam-001` | Camera identifier |
| `CAMERA_NAME` | `Demo Feed` | Display name shown in UI |
| `CAMERA_VENUE` | `Main Hall` | Venue / zone label |
| `WARN_THRESHOLD` | `10` | Persons per cell → warning |
| `CRITICAL_THRESHOLD` | `20` | Persons per cell → critical alert |
| `CONFIDENCE_THRESHOLD` | `0.5` | YOLO detection confidence cutoff |
| `BROADCAST_INTERVAL` | `2.0` | WebSocket broadcast interval in seconds |
| `DATABASE_URL` | *(optional)* | PostgreSQL connection string |
| `REDIS_URL` | *(optional)* | Redis connection string |

---

## Docker (adds PostgreSQL + Redis persistence)

```bash
# Place demo.mp4 at backend/videos/demo.mp4 first
docker compose up
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML detection | YOLOv10-N (Ultralytics) |
| Video I/O | OpenCV (`opencv-python-headless`) |
| Backend | FastAPI, Uvicorn, asyncpg, redis-py |
| Real-time | FastAPI WebSocket + broadcast manager |
| Persistence | PostgreSQL / in-memory fallback |
| Cache | Redis / no-op fallback |
| Frontend | React 18, Vite, Tailwind CSS |
| Charts | Recharts |
| Icons | Lucide React |

---

## Project Structure

```
ARGUS/
├── backend/
│   ├── main.py                    # FastAPI app, lifespan, WebSocket endpoint
│   ├── manager.py                 # WebSocket ConnectionManager
│   ├── db.py                      # PostgreSQL layer (degrades to store.py)
│   ├── store.py                   # In-memory fallback store
│   ├── cache.py                   # Redis layer (no-op if unavailable)
│   ├── schemas.py                 # Pydantic models
│   ├── inference/
│   │   ├── pipeline.py            # Inference thread + async broadcast loop
│   │   ├── frame_reader.py        # OpenCV reader, loops on EOF
│   │   ├── yolo_engine.py         # YOLOv10 wrapper (person class only)
│   │   ├── zone_mapper.py         # Centroid pixel → 3×3 cell index
│   │   └── threshold_evaluator.py # Warning / critical classification
│   ├── routers/
│   │   ├── cameras.py
│   │   ├── incidents.py           # Filterable log + CSV export
│   │   └── health.py
│   └── videos/                    # Place demo.mp4 here (gitignored)
├── frontend/
│   └── src/
│       ├── App.jsx                # WS state root — persists across navigation
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── IncidentLog.jsx
│       │   ├── Settings.jsx
│       │   └── SystemHealth.jsx
│       ├── components/
│       └── services/
│           └── api.js             # WS singleton + REST client
└── docker-compose.yml
```

---

## WebSocket Protocol

**Server → Client**

```json
{ "type": "metric_update", "data": [{ "cameraId": "cam-001", "totalOccupancy": 12, "fps": 24.1, "cells": [...] }] }
{ "type": "alert", "data": { "id": "alert-1", "severity": "critical", "cellIndex": 4, "count": 7 } }
```

**Client → Server**

```json
{ "type": "threshold_config", "data": { "cameraId": "cam-001", "cellIndex": 4, "warning": 4, "critical": 6 } }
{ "type": "acknowledge", "data": { "alertId": "alert-1", "sessionId": "operator-001" } }
```
