"""
ML inference pipeline for a single video source.

Architecture:
  - A daemon thread runs the blocking OpenCV + YOLOv10 loop continuously.
  - Results (cell counts + fps) are pushed into a thread-safe queue.
  - The async broadcast_loop() reads the latest result every `interval` seconds
    and pushes metric_update + alert payloads to all connected WS clients.
  - Alert deduplication: an alert is only emitted when a cell *enters* a breach
    state, not on every tick while it stays breached.
"""

import asyncio
import queue
import threading
import time
from datetime import datetime, timezone

from inference.frame_reader import FrameReader
from inference.yolo_engine import YOLOEngine
from inference.zone_mapper import ZoneMapper
from inference.threshold_evaluator import evaluate


class Pipeline:
    def __init__(
        self,
        source: str,
        camera_id: str,
        camera_name: str,
        venue: str,
        thresholds: list[dict],
        confidence: float = 0.5,
        model: str = "yolov10n.pt",
    ):
        self.source = source
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.venue = venue
        self.thresholds = thresholds

        self._confidence = confidence
        self._model = model
        self._result_q: queue.Queue = queue.Queue(maxsize=8)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._alert_counter = 0
        self._active_breaches: set[int] = set()
        self._current_fps: float = 0.0

    # ─── Public API ───────────────────────────────────────────

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._worker,
            daemon=True,
            name="argus-inference",
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)

    async def broadcast_loop(self, manager, interval: float = 2.0) -> None:
        """
        Async loop — awaits `interval` seconds, then grabs the latest inference
        result and broadcasts to all connected WS clients via `manager`.
        Also persists alerts to PostgreSQL and caches snapshots in Redis.
        """
        import db
        import cache

        while not self._stop_event.is_set():
            await asyncio.sleep(interval)

            result = self._drain_latest()
            if result is None:
                continue

            counts: list[int] = result["counts"]
            fps: float = result["fps"]
            timestamp: str = result["timestamp"]

            cells, breaches = evaluate(counts, self.thresholds)

            snapshot = self._build_snapshot(cells, fps)
            await manager.broadcast({"type": "metric_update", "data": [snapshot]})
            await cache.set_snapshot([snapshot])

            # Emit alert only when a cell newly enters breach — not on every tick
            breaching_now = {b["cellIndex"] for b in breaches}
            new_breaches = [b for b in breaches if b["cellIndex"] not in self._active_breaches]
            self._active_breaches = breaching_now

            for breach in new_breaches:
                alert = self._build_alert(breach, timestamp)
                await manager.broadcast({"type": "alert", "data": alert})
                await db.insert_incident(alert)

    # ─── Private ──────────────────────────────────────────────

    def _worker(self) -> None:
        reader = FrameReader(self.source)
        reader.open()
        engine = YOLOEngine(model=self._model, confidence=self._confidence)
        mapper = ZoneMapper(reader.width, reader.height)

        frame_count = 0
        fps_timer = time.time()
        current_fps = reader.fps or 25.0

        print(f"[Pipeline] Started — source={self.source} "
              f"res={reader.width}x{reader.height} native_fps={reader.fps:.1f}")

        while not self._stop_event.is_set():
            ret, frame = reader.read()
            if not ret:
                time.sleep(0.05)
                continue

            detections = engine.detect(frame)
            counts = mapper.count_cells(detections)

            frame_count += 1
            elapsed = time.time() - fps_timer
            if elapsed >= 1.0:
                current_fps = round(frame_count / elapsed, 1)
                self._current_fps = current_fps
                frame_count = 0
                fps_timer = time.time()

            result = {
                "counts": counts,
                "fps": current_fps,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Keep queue fresh — drop oldest if full
            if self._result_q.full():
                try:
                    self._result_q.get_nowait()
                except queue.Empty:
                    pass
            try:
                self._result_q.put_nowait(result)
            except queue.Full:
                pass

        reader.release()
        print("[Pipeline] Stopped.")

    def _drain_latest(self) -> dict | None:
        """Return the most recent queued result, discarding stale ones."""
        latest = None
        while True:
            try:
                latest = self._result_q.get_nowait()
            except queue.Empty:
                break
        return latest

    def _build_snapshot(self, cells: list[dict], fps: float) -> dict:
        return {
            "cameraId": self.camera_id,
            "cameraName": self.camera_name,
            "venue": self.venue,
            "status": "online",
            "fps": fps,
            "totalOccupancy": sum(c["count"] for c in cells),
            "cells": cells,
        }

    def _build_alert(self, breach: dict, timestamp: str) -> dict:
        self._alert_counter += 1
        return {
            "id": f"alert-{self._alert_counter}",
            "cameraId": self.camera_id,
            "cameraName": self.camera_name,
            "venue": self.venue,
            "cellIndex": breach["cellIndex"],
            "count": breach["count"],
            "thresholdValue": breach["thresholdValue"],
            "severity": breach["severity"],
            "timestamp": timestamp,
            "acknowledged": False,
            "acknowledgedBy": None,
            "acknowledgedAt": None,
        }
