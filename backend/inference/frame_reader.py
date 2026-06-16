import time
import cv2


class FrameReader:
    """
    Reads frames from a video file or RTSP stream via OpenCV.
    When the video file ends it loops back to frame 0 — useful for demo footage.
    """

    def __init__(self, source: str):
        self.source = source
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> None:
        self._cap = cv2.VideoCapture(self.source)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open video source: {self.source}")

    def read(self) -> tuple[bool, any]:
        """
        Read the next frame. On EOF, seeks back to frame 0 and retries once.
        Returns (success, frame).
        """
        ret, frame = self._cap.read()
        if not ret:
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self._cap.read()
        return ret, frame

    def release(self) -> None:
        if self._cap:
            self._cap.release()
            self._cap = None

    @property
    def fps(self) -> float:
        return self._cap.get(cv2.CAP_PROP_FPS) if self._cap else 0.0

    @property
    def width(self) -> int:
        return int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if self._cap else 0

    @property
    def height(self) -> int:
        return int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if self._cap else 0

    @property
    def total_frames(self) -> int:
        return int(self._cap.get(cv2.CAP_PROP_FRAME_COUNT)) if self._cap else 0
