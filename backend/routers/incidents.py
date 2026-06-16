import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

import db

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

_FIELDS = [
    "id", "cameraId", "cameraName", "venue", "cellIndex",
    "count", "thresholdValue", "severity", "timestamp",
    "acknowledged", "acknowledgedBy", "acknowledgedAt",
]


@router.get("")
async def get_incidents(
    cameraId: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
):
    return await db.get_incidents(cameraId, severity, startDate, endDate)


@router.get("/export")
async def export_incidents(
    cameraId: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
):
    incidents = await db.get_incidents(cameraId, severity, startDate, endDate)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=_FIELDS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(incidents)

    filename = f"argus-incidents-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
