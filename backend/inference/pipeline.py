"""
ML inference pipeline for a single video source.

Architecture (two-thread):
  - _reader_worker  : reads frames at native video FPS (~25-30fps), annotates
                      each frame with the most recent detections, encodes JPEG.
                      This is what drives the /video/{id}/frame display endpoint.
  - _inference_worker: receives frames via a threading.Event, runs YOLOv10,
                       updates shared detection state and pushes to result_q.
  - broadcast_loop  : async; reads result_q every `interval` seconds and
                      pushes metric_update + alert payloads to WS clients.

Decoupling reader from inference means the video feed displays at full frame
rate (~25fps) while YOLO runs at its natural speed (~3-10fps on CPU) in the
background — the last known detections are drawn on every new display frame.
"""

import asyncio
import queue
import threading
import time
from datetime import datetime, timezone

import cv2

from inference.frame_reader import FrameReader
from inference.yolo_engine import YOLOEngine
from inference.zone_mapper import ZoneMapper
from inference.threshold_evaluator import evaluate

# Display target — reader thread sleeps to hit this; YOLO naturally runs slower
_DISPLAY_FPS = 30


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

        # Broadcast queue (inference → broadcast_loop)
        self._result_q: queue.Queue = queue.Queue(maxsize=8)

        # Threads
        self._stop_event = threading.Event()
        self._reader_thread: threading.Thread | None = None
        self._infer_thread: threading.Thread | None = None

        # Shared detection state (inference → reader)
        self._last_detections: list[dict] = []
        self._last_counts: list[int] = [0] * 9
        self._det_lock = threading.Lock()

        # Frame handoff (reader → inference)
        self._pending_frame = None
        self._pending_lock = threading.Lock()
        self._pending_event = threading.Event()

        # Output frame (reader → HTTP endpoint)
        self._latest_frame: bytes | None = None
        self._frame_lock = threading.Lock()

        # Metrics
        self._current_fps: float = 0.0
        self._alert_counter = 0
        self._active_breaches: set[int] = set()

    # ─── Public API ───────────────────────────────────────────

    def start(self) -> None:
        self._stop_event.clear()
        self._reader_thread = threading.Thread(
            target=self._reader_worker, daemon=True, name="argus-reader"
        )
        self._infer_thread = threading.Thread(
            target=self._inference_worker, daemon=True, name="argus-infer"
        )
        self._reader_thread.start()
        self._infer_thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._pending_event.set()  # unblock inference thread if it's waiting
        if self._reader_thread:
            self._reader_thread.join(timeout=10)
        if self._infer_thread:
            self._infer_thread.join(timeout=10)

    def get_latest_frame(self) -> bytes | None:
        """Return the most recent annotated JPEG frame bytes, thread-safe."""
        with self._frame_lock:
            return self._latest_frame

    async def broadcast_loop(self, manager, interval: float = 2.0) -> None:
        """
        Async loop — reads the latest inference result every `interval` seconds
        and broadcasts metric_update + alert payloads to all WS clients.
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

            breaching_now = {b["cellIndex"] for b in breaches}
            new_breaches = [b for b in breaches if b["cellIndex"] not in self._active_breaches]
            self._active_breaches = breaching_now

            for breach in new_breaches:
                alert = self._build_alert(breach, timestamp)
                await manager.broadcast({"type": "alert", "data": alert})
                await db.insert_incident(alert)

    # ─── Worker threads ───────────────────────────────────────

    def _reader_worker(self) -> None:
        """Reads frames at native video FPS, annotates, drives the display endpoint."""
        reader = FrameReader(self.source)
        reader.open()
        native_fps = reader.fps or 25.0
        frame_interval = 1.0 / _DISPLAY_FPS

        frame_count = 0
        fps_timer = time.time()

        print(f"[Reader] Started — {reader.width}x{reader.height} @ {native_fps:.1f}fps native")

        while not self._stop_event.is_set():
            t0 = time.time()

            ret, frame = reader.read()
            if not ret:
                time.sleep(0.05)
                continue

            # Hand this frame to the inference thread (non-blocking — drop if busy)
            if not self._pending_event.is_set():
                with self._pending_lock:
                    self._pending_frame = frame.copy()
                self._pending_event.set()

            # Get latest detections and annotate this frame for display
            with self._det_lock:
                dets = list(self._last_detections)
                counts = list(self._last_counts)

            self._annotate_frame(frame, dets, counts, reader.width, reader.height)

            # Track display FPS
            frame_count += 1
            elapsed = time.time() - fps_timer
            if elapsed >= 1.0:
                self._current_fps = round(frame_count / elapsed, 1)
                frame_count = 0
                fps_timer = time.time()

            # Throttle to _DISPLAY_FPS
            sleep_for = frame_interval - (time.time() - t0)
            if sleep_for > 0:
                time.sleep(sleep_for)

        reader.release()
        print("[Reader] Stopped.")

    def _inference_worker(self) -> None:
        """Runs YOLO on frames handed off by the reader; updates shared detection state."""
        engine = YOLOEngine(model=self._model, confidence=self._confidence)
        mapper: ZoneMapper | None = None

        print("[Inference] Worker started — waiting for frames")

        while not self._stop_event.is_set():
            signalled = self._pending_event.wait(timeout=1.0)
            self._pending_event.clear()

            if not signalled or self._stop_event.is_set():
                continue

            with self._pending_lock:
                frame = self._pending_frame

            if frame is None:
                continue

            # Init ZoneMapper once we know frame dimensions
            if mapper is None:
                h, w = frame.shape[:2]
                mapper = ZoneMapper(w, h)
                print(f"[Inference] ZoneMapper ready — {w}x{h}")

            detections = engine.detect(frame)
            counts = mapper.count_cells(detections)

            # Update shared state read by the reader thread for annotation
            with self._det_lock:
                self._last_detections = detections
                self._last_counts = counts

            # Push to broadcast queue
            result = {
                "counts": counts,
                "fps": self._current_fps,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            if self._result_q.full():
                try:
                    self._result_q.get_nowait()
                except queue.Empty:
                    pass
            try:
                self._result_q.put_nowait(result)
            except queue.Full:
                pass

        print("[Inference] Stopped.")

    # ─── Helpers ──────────────────────────────────────────────

    def _annotate_frame(self, frame, detections: list[dict], counts: list[int], w: int, h: int) -> None:
        """Draw bboxes, 3×3 grid, per-cell counts; encode to JPEG and store."""
        annotated = frame.copy()
        cw, ch = w / 3, h / 3

        # Bounding boxes + centroids
        for det in detections:
            x1, y1, x2, y2 = int(det["x1"]), int(det["y1"]), int(det["x2"]), int(det["y2"])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 128), 2)
            cv2.circle(annotated, (int(det["cx"]), int(det["cy"])), 4, (0, 255, 128), -1)

        # Grid lines
        for i in range(1, 3):
            cv2.line(annotated, (int(i * cw), 0), (int(i * cw), h), (80, 160, 80), 1)
            cv2.line(annotated, (0, int(i * ch)), (w, int(i * ch)), (80, 160, 80), 1)

        # Per-cell count label
        for idx, count in enumerate(counts):
            row, col = divmod(idx, 3)
            tx = int(col * cw + 6)
            ty = int(row * ch + 22)
            cv2.putText(annotated, str(count), (tx, ty),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 100), 2, cv2.LINE_AA)

        # Display FPS watermark
        cv2.putText(annotated, f"{self._current_fps:.1f} FPS", (8, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (140, 140, 140), 1, cv2.LINE_AA)

        ok, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if ok:
            with self._frame_lock:
                self._latest_frame = buf.tobytes()

    def _drain_latest(self) -> dict | None:
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
