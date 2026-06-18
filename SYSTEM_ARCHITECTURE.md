# ARGUS — System Architecture Document

> **Project ARGUS** — Autonomous Real-time Grid-based Urban Surveillance  
> Real-time crowd density monitoring and threshold-based alerting system powered by YOLOv10 inference.

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
  - [1.1 Tier 1 — ML Backend](#11-tier-1--ml-backend)
  - [1.2 Tier 2 — Alert Dashboard](#12-tier-2--alert-dashboard)
- [2. System Design](#2-system-design)
  - [2.1 Use Case Diagram](#21-use-case-diagram)
  - [2.2 Activity Diagrams](#22-activity-diagrams)
- [3. Technology Stack](#3-technology-stack)
  - [3.1 ML Pipeline — Five-Stage Processing Flow](#31-ml-pipeline--five-stage-processing-flow)
- [4. Alert Dashboard — Feature Specification](#4-alert-dashboard--feature-specification)
- [5. Implementation](#5-implementation)
  - [5.1 Project Structure](#51-project-structure)
  - [5.2 Component Hierarchy](#52-component-hierarchy)
  - [5.3 WebSocket Message Protocol](#53-websocket-message-protocol)
  - [5.4 REST API Endpoint Contract](#54-rest-api-endpoint-contract)
  - [5.5 Routing Map](#55-routing-map)

---

## 1. Architecture Overview

ARGUS follows a **decoupled two-tier model** separating inference from visualisation. The ML backend runs independently of the frontend dashboard, communicating exclusively via WebSocket for real-time alert delivery and REST endpoints for configuration management.

```mermaid
graph TB
    subgraph "Tier 1 — ML Backend"
        A["Video File / RTSP Stream"] -->|Frames| B["FastAPI + Uvicorn (ASGI)"]
        B --> C["OpenCV Frame Reader"]
        C --> D["YOLOv10-N Inference Engine"]
        D --> E["Zone Mapping (3×3 Grid)"]
        E --> F["Threshold Evaluation"]
        F -->|Metrics| G["Redis Hot Cache (optional)"]
        F -->|Alert Events| H["PostgreSQL (optional) / In-Memory Store"]
    end

    subgraph "Tier 2 — Alert Dashboard"
        I["React.js SPA"]
        J["Live Heatmap Grid"]
        K["Incident Alert Panel"]
        L["Threshold Config Panel"]
        M["System Health Panel"]
    end

    F -->|"WebSocket (2s interval)"| I
    I --> J
    I --> K
    I -->|"Config Changes (WebSocket)"| B
    I --> L
    I --> M
    G -->|"Reconnect Snapshot"| I

    style B fill:#2563eb,color:#fff
    style D fill:#7c3aed,color:#fff
    style I fill:#059669,color:#fff
    style G fill:#dc2626,color:#fff
    style H fill:#0369a1,color:#fff
```

### 1.1 Tier 1 — ML Backend

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| Application Server | FastAPI + Uvicorn (ASGI) | Video frame ingestion, API routing, WebSocket management |
| Inference Engine | YOLOv10-N (Ultralytics) | Person detection (class 0 only) on decoded video frames |
| Zone Mapper | `inference/zone_mapper.py` | Centroid pixel → 3×3 grid cell index (row-major) |
| Threshold Evaluator | `inference/threshold_evaluator.py` | Per-cell count vs. configured Warning/Critical thresholds |
| Alert Streamer | WebSocket (native FastAPI) | Real-time metric and alert payload delivery every 2s |
| In-Memory Store | `store.py` | Camera, incident, and threshold persistence when no DB is available |
| Hot Cache | Redis | Latest per-camera metric snapshot for dashboard reconnection (optional) |
| Persistent Store | PostgreSQL via asyncpg | Alert event persistence and threshold configuration (optional) |

> **Graceful Degradation:** The system runs fully without PostgreSQL or Redis. When `DATABASE_URL` is not set, all reads and writes go to `store.py` (in-memory). When `REDIS_URL` is not set, the cache layer is a no-op. No data is lost within a session.

### 1.2 Tier 2 — Alert Dashboard

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| SPA Framework | React 18 + Vite | Single-page alert dashboard with real-time state management |
| State Root | `App.jsx` | WebSocket state (snapshots, alerts, history) lifted here — persists across page navigation |
| Styling | Tailwind CSS | Responsive layout, heatmap cell colour transitions |
| Charts | Recharts | Live occupancy trend graphs |
| Communication | WebSocket singleton (`api.js`) | Bidirectional channel — receives alerts, sends config changes |
| REST Client | `fetch()` in `api.js` | Camera registration, incident log, health polling |

**Connection Lifecycle:**

1. On initial WebSocket connection, the dashboard receives the **current snapshot** from Redis cache (if available) or the latest pipeline result.
2. The pipeline broadcasts **metric updates every 2 seconds**. Alerts fire only when a cell **newly enters** a breach state — no duplicate spam on sustained breach.
3. **Threshold configuration changes** are sent back to the backend via the same WebSocket channel and applied to the running pipeline immediately with no restart.
4. WS state lives in `App.jsx` — navigating to Incident Log, Settings, or Health pages and back does **not** reset dashboard data.

---

## 2. System Design

### 2.1 Use Case Diagram

ARGUS identifies **two primary human actors** and **one system-level actor**:

```mermaid
graph TB
    subgraph Actors
        SO["🛡️ Security Operator"]
        SA["⚙️ System Administrator"]
        ML["🤖 ML Backend Engine"]
    end

    subgraph "Security Operator Use Cases"
        UC01["UC-01: View Live Dashboard"]
        UC02["UC-02: Receive Alert Notification"]
        UC03["UC-03: Acknowledge Alert"]
        UC04["UC-04: View Incident Log"]
        UC05["UC-05: Export Incident Report"]
    end

    subgraph "System Administrator Use Cases"
        UC06["UC-06: Configure Thresholds"]
        UC07["UC-07: Register Camera Feed"]
        UC08["UC-08: View System Health"]
    end

    subgraph "ML Backend Engine Use Cases"
        UC09["UC-09: Run Inference"]
        UC10["UC-10: Evaluate Threshold"]
        UC11["UC-11: Stream Metrics"]
    end

    SO --> UC01
    SO --> UC02
    SO --> UC03
    SO --> UC04
    SO --> UC05

    SA --> UC06
    SA --> UC07
    SA --> UC08

    ML --> UC09
    ML --> UC10
    ML --> UC11

    UC10 -.->|"triggers"| UC02
    UC11 -.->|"feeds"| UC01
```

#### Actor Descriptions

| Actor | Role | Description |
|-------|------|-------------|
| **Security Operator** | Human | Monitors live camera feeds, views active alerts, acknowledges incidents. |
| **System Administrator** | Human (Privileged) | Registers camera feeds (RTSP/video file), configures per-zone thresholds, monitors system health (FPS, WS clients, DB status). |
| **ML Backend Engine** | System | Continuously processes video frames, runs YOLOv10 inference, evaluates zone thresholds, emits WebSocket events. |

---

#### Use Cases — Security Operator

| ID | Use Case | Description | Status |
|----|----------|-------------|--------|
| **UC-01** | View Live Dashboard | Real-time heatmap of all registered cameras and zone occupancy states. | ✅ Implemented |
| **UC-02** | Receive Alert Notification | Visual alert on heatmap cell breach; alert panel entry prepended. | ✅ Implemented |
| **UC-03** | Acknowledge Alert | Logs operator session ID and acknowledgement timestamp via WebSocket. | ✅ Implemented |
| **UC-04** | View Incident Log | Chronological breach log filterable by camera, severity, date range. | ✅ Implemented |
| **UC-05** | Export Incident Report | Filtered incident log downloadable as CSV. | ✅ Implemented |

#### Use Cases — System Administrator

| ID | Use Case | Description | Status |
|----|----------|-------------|--------|
| **UC-06** | Configure Thresholds | Warning (amber) and Critical (red) thresholds per camera per zone cell; applied to running pipeline with no restart. | ✅ Implemented |
| **UC-07** | Register Camera Feed | Add RTSP stream or video file source; assigned name and venue label. | ✅ Implemented |
| **UC-08** | View System Health | Inference FPS per camera, WebSocket client count, DB status, cache status, uptime, backend latency. | ✅ Implemented |

#### Use Cases — ML Backend Engine

| ID | Use Case | Description | Status |
|----|----------|-------------|--------|
| **UC-09** | Run Inference | Per-frame YOLOv10-N person detection; centroids mapped to 3×3 grid. | ✅ Implemented |
| **UC-10** | Evaluate Threshold | Per-cell counts vs. thresholds; breach triggers alert only on state transition. | ✅ Implemented |
| **UC-11** | Stream Metrics | Broadcasts metric updates every `BROADCAST_INTERVAL` seconds to all WS clients. | ✅ Implemented |

---

### 2.2 Activity Diagrams

#### 2.2.1 Activity Diagram 1 — Video Processing and Alert Pipeline

```mermaid
flowchart TD
    START(("⚫ Start")) --> A["Frame arrives from video file / RTSP"]
    A --> B["FrameReader.read() via OpenCV"]
    B --> C["YOLOEngine.detect(frame)"]
    C --> D["Filter: confidence ≥ threshold (default 0.5)"]
    D --> E{"Accepted detection?"}

    E -->|No| F["Discard bounding box"]
    E -->|Yes| G["Calculate centroid (cx, cy)"]

    F --> E2{"More boxes?"}
    G --> H["ZoneMapper.get_cell(cx, cy) → cell index 0–8"]
    H --> I["Accumulate per-cell count"]
    I --> E2

    E2 -->|Yes| E
    E2 -->|No| J["ThresholdEvaluator.evaluate(counts, thresholds)"]

    J --> K{"Threshold breached?"}

    K -->|"Count < Warning"| L["GREEN status"]
    K -->|"Warning ≤ Count < Critical"| M["AMBER status"]
    K -->|"Count ≥ Critical"| N["RED status"]

    N --> O{"New breach? (not in _active_breaches)"}
    O -->|Yes| P["Build alert payload"]
    O -->|No| R
    P --> Q["Broadcast alert via WebSocket"]
    Q --> QQ["store.insert_incident() / db.insert_incident()"]
    QQ --> R

    L --> R["Broadcast metric_update to all WS clients"]
    M --> R
    R --> S["cache.set_snapshot() if Redis available"]
    S --> T["Sleep BROADCAST_INTERVAL seconds"]
    T --> START

    style N fill:#dc2626,color:#fff
    style M fill:#d97706,color:#fff
    style L fill:#059669,color:#fff
    style P fill:#7c3aed,color:#fff
```

**Pipeline Summary:**

1. **Frame Ingestion** — `FrameReader` wraps OpenCV; loops the video on EOF for continuous demo playback.
2. **YOLOv10 Inference** — Detects only class 0 (person); boxes below confidence threshold discarded.
3. **Zone Mapping** — Centroid pixel divided by frame dimensions → row-major 3×3 cell index (0–8).
4. **Threshold Evaluation** — Green / Amber / Red per cell based on Warning and Critical thresholds.
5. **Alert Deduplication** — `_active_breaches: set[int]` tracks currently breaching cells. An alert fires **only when a cell newly enters** breach — not on every tick while it remains breached.
6. **Persistence** — Incidents written to `store.py` (always) and PostgreSQL (if connected). Snapshot written to Redis (if connected).

---

#### 2.2.2 Activity Diagram 2 — Operator Alert Response

```mermaid
flowchart TD
    START(("⚫ Start")) --> A["WebSocket alert payload received"]
    A --> B["Update heatmap cell to RED"]
    B --> C["Pulse red border on camera card"]
    C --> D["Prepend entry to alert panel"]
    D --> E["Operator reviews alert details"]

    E --> G{"Deploy personnel?"}

    G -->|Yes| H["Dispatch personnel to zone"]
    H --> I["Acknowledge alert on dashboard"]
    I --> J["WS: send acknowledge → backend stores session ID + timestamp"]

    G -->|No| K["Assess as transient peak"]
    K --> L["Dismiss alert on dashboard"]
    L --> M["Mark dismissed in local state"]

    J --> N["Alert persists in incident log"]
    M --> N

    N --> O{"Zone count drops below threshold?"}
    O -->|Yes| P["Heatmap cell reverts to lower status colour"]
    O -->|No| Q["Cell remains at current status"]

    P --> END(("⚫ End"))
    Q --> END

    style B fill:#dc2626,color:#fff
    style I fill:#059669,color:#fff
    style L fill:#d97706,color:#fff
```

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **ML / Vision** | Python 3.11+ | Primary backend language |
| | PyTorch | Deep learning runtime for YOLOv10 |
| | OpenCV (`opencv-python-headless`) | Frame decoding, video file and RTSP support |
| | Ultralytics YOLOv10-N | Person detection; auto-downloads `yolov10n.pt` on first run |
| **Backend API** | FastAPI | Async API server; WebSocket + REST endpoint management |
| | Uvicorn (ASGI) | High-performance async server |
| | asyncpg | Async PostgreSQL driver |
| | redis-py | Async Redis client |
| **Data Layer** | `store.py` | In-memory camera/incident/threshold store — active when no DB |
| | PostgreSQL | Persistent storage (optional) |
| | Redis | Snapshot hot cache for WS reconnection (optional) |
| **Frontend** | React 18 | Single-page dashboard |
| | Vite | Build tool with HMR |
| | React Router 7 | Client-side routing |
| | Tailwind CSS 4 | Responsive styling; heatmap cell colour transitions |
| | Recharts | Live occupancy trend chart |
| | Lucide React | Icon system |
| **DevOps** | Docker + Compose | Full containerisation (postgres + redis + backend) |

---

### 3.1 ML Pipeline — Five-Stage Processing Flow

```mermaid
graph LR
    S1["Stage 1\nFrame Ingestion\nframe_reader.py"] --> S2["Stage 2\nYOLOv10 Inference\nyolo_engine.py"]
    S2 --> S3["Stage 3\nZone Mapping\nzone_mapper.py"]
    S3 --> S4["Stage 4\nThreshold Evaluation\nthreshold_evaluator.py"]
    S4 --> S5["Stage 5\nWebSocket Emit\npipeline.py"]

    style S1 fill:#0369a1,color:#fff
    style S2 fill:#7c3aed,color:#fff
    style S3 fill:#059669,color:#fff
    style S4 fill:#d97706,color:#fff
    style S5 fill:#dc2626,color:#fff
```

| Stage | Module | Input | Output |
|-------|--------|-------|--------|
| **1** | `frame_reader.py` | Video file / RTSP stream | Raw decoded frame; loops on EOF |
| **2** | `yolo_engine.py` | Decoded frame | Bounding boxes + confidence scores (class 0 only) |
| **3** | `zone_mapper.py` | Accepted bounding boxes | Per-cell count list (9 cells, row-major) |
| **4** | `threshold_evaluator.py` | Per-cell counts | `cells: list[dict]` with severity + `breaches: list[dict]` |
| **5** | `pipeline.py` | Cells + breaches | `metric_update` broadcast every interval; `alert` on new breach |

---

## 4. Alert Dashboard — Feature Specification

### 4.1 Live Camera Grid

| Feature | Description |
|---------|-------------|
| Camera Card | Name, total occupancy, 3×3 heatmap grid with per-cell counts, status badge |
| Colour Transitions | **Green** (below warning) · **Amber** (warning–critical) · **Red** (critical+) |
| Alert Animation | Card flashes red border pulse on active critical alert |
| State Persistence | WS state lives in `App.jsx` — navigating away and back does not reset data |

### 4.2 Incident Alert Panel

| Feature | Description |
|---------|-------------|
| Layout | Reverse-chronological list of active and recent alerts |
| Entry Fields | Timestamp · Camera · Cell index · Count · Severity badge · Acknowledge / Dismiss buttons |
| Deduplication | Alert fires only on state transition into breach, not on every tick |

### 4.3 System Administrator — Threshold Configuration

| Feature | Description |
|---------|-------------|
| Granularity | Per-camera, per-cell Warning and Critical thresholds (9 cells per camera) |
| Live Update | Changes sent via WebSocket → applied to running pipeline immediately |
| Defaults | Sourced from `.env` (`WARN_THRESHOLD` / `CRITICAL_THRESHOLD`) |

### 4.4 System Administrator — Camera Registration

| Feature | Description |
|---------|-------------|
| Source Types | RTSP stream URL or local video file path |
| Fields | Camera name · Venue / zone label · Source (RTSP URL or file path) |
| Storage | Written to `store.py` (in-memory) and PostgreSQL if connected |

### 4.5 System Health Monitoring

| Metric | Source |
|--------|--------|
| Backend status | `/api/health` response |
| Backend latency | Client-side `performance.now()` around fetch |
| WebSocket clients | Live count from ConnectionManager |
| Uptime | Server start time delta |
| Inference FPS | `pipeline._current_fps` (updated every second in inference thread) |
| DB status | `db.is_available()` — PostgreSQL connected vs. in-memory fallback |
| Cache status | `cache.is_available()` — Redis connected vs. no-op |

### 4.6 Incident Log and Export

| Feature | Description |
|---------|-------------|
| Stored Metadata | Camera ID/name · Venue · Cell index · Count · Threshold · Severity · Timestamp · Acknowledgement |
| Filtering | Camera (dynamic from API) · Severity · Date range |
| Export | Filtered results as CSV via `StreamingResponse` |
| Empty state | Shows informative message until first real breach — no fake data |

---

## 5. Implementation

### 5.1 Project Structure

```
ARGUS/
├── backend/
│   ├── main.py                    # FastAPI app, lifespan, WS endpoint, config from .env
│   ├── manager.py                 # WebSocket ConnectionManager (broadcast / send / count)
│   ├── db.py                      # asyncpg layer — delegates to store.py when no pool
│   ├── store.py                   # In-memory camera/incident/threshold store
│   ├── cache.py                   # Redis layer — no-op when unavailable
│   ├── schemas.py                 # Pydantic models
│   ├── mock.py                    # Mock data generators (kept for reference)
│   ├── inference/
│   │   ├── pipeline.py            # Daemon thread + async broadcast loop; alert deduplication
│   │   ├── frame_reader.py        # OpenCV reader; loops on EOF for continuous playback
│   │   ├── yolo_engine.py         # YOLOv10-N wrapper (person class 0 only)
│   │   ├── zone_mapper.py         # Centroid pixel → 3×3 row-major cell index
│   │   └── threshold_evaluator.py # Warning / Critical classification per cell
│   ├── routers/
│   │   ├── cameras.py             # GET /api/cameras · POST /api/cameras
│   │   ├── incidents.py           # GET /api/incidents · GET /api/incidents/export (CSV)
│   │   └── health.py              # GET /api/health (FPS, WS count, DB/cache status, uptime)
│   └── videos/                    # Place demo.mp4 here (gitignored)
├── frontend/
│   └── src/
│       ├── App.jsx                # WS state root (snapshots, alerts, history) — never unmounts
│       ├── pages/
│       │   ├── Dashboard.jsx      # Receives live data as props; no local WS subscription
│       │   ├── IncidentLog.jsx    # Camera filter populated from /api/cameras
│       │   ├── Settings.jsx       # Threshold config + camera registration (RTSP / video file)
│       │   └── SystemHealth.jsx   # FPS, latency, WS clients, DB status, cache status
│       ├── components/
│       │   ├── Layout.jsx
│       │   ├── CameraCard.jsx
│       │   ├── HeatmapGrid.jsx
│       │   ├── AlertPanel.jsx
│       │   └── OccupancyChart.jsx
│       └── services/
│           └── api.js             # WebSocketService singleton + RestAPI (real fetch calls)
└── docker-compose.yml             # postgres:16-alpine + redis:7-alpine + backend
```

### 5.2 Component Hierarchy

```mermaid
graph TD
    A["main.jsx"] --> B["BrowserRouter"]
    B --> C["App.jsx\n(WS state: snapshots, alerts, history)"]
    C --> D["Layout\n(connected, alertCount)"]

    D --> E["/ Dashboard\n(props from App)"]
    D --> F["/incidents IncidentLog\n(REST fetch)"]
    D --> G["/settings Settings\n(REST fetch + WS send)"]
    D --> H["/health SystemHealth\n(REST poll 10s)"]

    E --> I["CameraCard"]
    E --> J["AlertPanel"]
    E --> K["OccupancyChart"]
    I --> L["HeatmapGrid"]

    C -.->|"onMetricUpdate\nonAlert"| M["wsService singleton"]
    M -.->|"WebSocket"| N["FastAPI Backend"]

    style A fill:#6366f1,color:#fff
    style C fill:#dc2626,color:#fff
    style D fill:#2563eb,color:#fff
    style E fill:#059669,color:#fff
    style L fill:#d97706,color:#fff
    style M fill:#7c3aed,color:#fff
```

### 5.3 WebSocket Message Protocol

#### Server → Client

| Type | Payload | Trigger |
|------|---------|---------|
| `metric_update` | `CameraSnapshot[]` | Every `BROADCAST_INTERVAL` seconds |
| `alert` | `AlertPayload` | When a cell newly enters breach state |

**CameraSnapshot:**
```json
{
  "cameraId": "cam-001",
  "cameraName": "Mall Hallway",
  "venue": "Main Hall",
  "status": "online",
  "fps": 24.1,
  "totalOccupancy": 12,
  "cells": [
    { "cellIndex": 0, "count": 3, "severity": "green" },
    { "cellIndex": 4, "count": 6, "severity": "critical" }
  ]
}
```

#### Client → Server

| Type | Payload | Effect |
|------|---------|--------|
| `threshold_config` | `{ cameraId, cellIndex, warning, critical }` | Updates `pipeline.thresholds[cellIndex]` immediately; persists to store/DB |
| `acknowledge` | `{ alertId, sessionId, timestamp }` | Marks incident acknowledged in store/DB |

### 5.4 REST API Endpoint Contract

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cameras` | All cameras from store/DB |
| `POST` | `/api/cameras` | Register new camera (name, venue, rtspUrl/videoSource) |
| `GET` | `/api/incidents` | Filtered incident log (`?cameraId=&severity=&startDate=&endDate=`) |
| `GET` | `/api/incidents/export` | CSV download of filtered incidents |
| `GET` | `/api/health` | FPS, uptime, WS count, DB status, cache status, per-camera health |
| `GET` | `/` | Service info (mode: ml/mock, video_source, db, cache) |

### 5.5 Routing Map

| Path | Page | Use Cases | Live Data Source |
|------|------|-----------|-----------------|
| `/` | Dashboard | UC-01, UC-02, UC-03 | WebSocket `metric_update` + `alert` (state in App.jsx) |
| `/incidents` | IncidentLog | UC-04, UC-05 | `GET /api/incidents` (store/DB) |
| `/settings` | Settings | UC-06, UC-07 | `GET /api/cameras` + WS `threshold_config` |
| `/health` | SystemHealth | UC-08 | `GET /api/health` (polled every 10s) |

---

## Appendix — Data Flow Summary

```mermaid
sequenceDiagram
    participant CAM as Video / RTSP
    participant PIPE as Pipeline Thread
    participant EVAL as ThresholdEvaluator
    participant STORE as store.py / PostgreSQL
    participant RD as Redis
    participant WS as WebSocket Manager
    participant UI as React Dashboard

    CAM->>PIPE: Decoded frame (OpenCV)
    PIPE->>PIPE: YOLOv10 detect → ZoneMapper → counts[9]
    PIPE->>EVAL: evaluate(counts, thresholds)
    EVAL-->>PIPE: cells[], breaches[]

    PIPE->>WS: broadcast metric_update every 2s
    WS->>UI: Real-time data push

    alt New breach (not in _active_breaches)
        PIPE->>WS: broadcast alert payload
        PIPE->>STORE: insert_incident(alert)
        WS->>UI: Alert notification
    end

    PIPE->>RD: set_snapshot (if Redis available)

    Note over UI,WS: Config changes flow back
    UI->>WS: threshold_config { cellIndex, warning, critical }
    WS->>PIPE: pipeline.thresholds[cellIndex] updated live
    WS->>STORE: update_threshold persisted
```

---

*Document version: 2.0 · Last updated: June 2026 · Implementation complete*
