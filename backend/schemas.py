from pydantic import BaseModel
from typing import Optional, Literal


class CellStatus(BaseModel):
    cellIndex: int
    count: int
    severity: Literal["green", "warning", "critical"]


class CameraSnapshot(BaseModel):
    cameraId: str
    cameraName: str
    venue: str
    status: Literal["online", "offline"]
    fps: float
    totalOccupancy: int
    cells: list[CellStatus]


class AlertPayload(BaseModel):
    id: str
    cameraId: str
    cameraName: str
    venue: str
    cellIndex: int
    count: int
    thresholdValue: int
    severity: Literal["warning", "critical"]
    timestamp: str
    acknowledged: bool
    acknowledgedBy: Optional[str]
    acknowledgedAt: Optional[str]


class Camera(BaseModel):
    id: str
    name: str
    venue: str
    rtspUrl: str
    status: Literal["online", "offline"]
    fps: float
    thresholds: list[dict]


class CameraRegisterRequest(BaseModel):
    name: str
    rtspUrl: str
    venue: str


class Incident(BaseModel):
    id: str
    cameraId: str
    cameraName: str
    venue: str
    cellIndex: int
    count: int
    thresholdValue: int
    severity: Literal["warning", "critical"]
    timestamp: str
    acknowledged: bool
    acknowledgedBy: Optional[str]
    acknowledgedAt: Optional[str]


class HealthCameraEntry(BaseModel):
    id: str
    name: str
    status: str
    fps: float
    lastFrame: Optional[str]


class HealthStatus(BaseModel):
    backendStatus: str
    backendLatency: int
    wsClientCount: int
    uptime: str
    cameras: list[HealthCameraEntry]
