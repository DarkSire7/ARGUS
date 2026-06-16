from ultralytics import YOLO


class YOLOEngine:
    """
    Wraps YOLOv10 inference via Ultralytics.
    On first instantiation the model weights are auto-downloaded (~6MB for nano).
    Only returns detections for class 0 (person) above the confidence threshold.
    """

    PERSON_CLASS = 0

    def __init__(self, model: str = "yolov10n.pt", confidence: float = 0.5):
        self.confidence = confidence
        self._model = YOLO(model)

    def detect(self, frame) -> list[dict]:
        """
        Run inference on a decoded OpenCV frame (BGR numpy array).
        Returns list of dicts: {x1, y1, x2, y2, confidence, cx, cy}
        """
        results = self._model(frame, verbose=False)[0]
        detections: list[dict] = []

        for box in results.boxes:
            if int(box.cls[0]) != self.PERSON_CLASS:
                continue
            conf = float(box.conf[0])
            if conf < self.confidence:
                continue

            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "confidence": conf,
                "cx": (x1 + x2) / 2,
                "cy": (y1 + y2) / 2,
            })

        return detections
