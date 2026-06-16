# ARGUS — Autonomous Real-time Grid-based Urban Surveillance

> AI-powered crowd density monitoring — YOLOv10 inference → 3×3 spatial grid → live React dashboard over WebSocket.

---

## Features

- **Live crowd detection** — YOLOv10-N detects people in each video frame and maps them to a 3×3 zone grid per camera
- **Real-time dashboard** — WebSocket streams zone occupancy heatmaps, FPS, and total occupancy counts every 2 seconds
- **Threshold alerting** — configurable warning and critical thresholds per zone cell; alerts fire only when a cell newly enters breach (no duplicate spam)
- **Incident log** — full history of threshold breaches, filterable by camera, severity, and date range with CSV export
- **Live settings** — adjust warning/critical thresholds per zone cell from the UI; changes apply to the running pipeline immediately with no restart
- **Camera management** — register additional cameras from the Settings page
- **System health** — real inference FPS, WebSocket client count, uptime, and per-camera status
- **No database required** — runs fully on an in-memory store out of the box; optionally connects to PostgreSQL + Redis when available

---

## Tech Stack

| | Technology |
|---|---|
| 🧠 **ML Detection** | YOLOv10-N via [Ultralytics](https://github.com/ultralytics/ultralytics) |
| 🎥 **Video I/O** | OpenCV (`opencv-python-headless`) |
| ⚡ **Backend** | FastAPI + Uvicorn (async) |
| 🔌 **Real-time** | FastAPI WebSocket + broadcast manager |
| 🗄️ **Database** | PostgreSQL via asyncpg *(optional — in-memory fallback)* |
| 📦 **Cache** | Redis *(optional — no-op fallback)* |
| ⚛️ **Frontend** | React 18 + Vite |
| 🎨 **Styling** | Tailwind CSS |
| 📊 **Charts** | Recharts |
| 🐳 **Container** | Docker + Docker Compose |
