// ============================================================
// ARGUS — Mock Data Service
// Provides simulated camera data, metric snapshots, and alert
// events for frontend development without the ML backend.
// ============================================================

/**
 * Registered cameras with zone labels and default thresholds.
 */
export const MOCK_CAMERAS = [
  {
    id: "cam-001",
    name: "Main Entrance Gate A",
    venue: "North Wing",
    rtspUrl: "rtsp://192.168.1.101:554/stream",
    status: "online",
    fps: 24.3,
    thresholds: Array.from({ length: 9 }, () => ({ warning: 10, critical: 20 })),
  },
  {
    id: "cam-002",
    name: "Food Court Central",
    venue: "East Wing",
    rtspUrl: "rtsp://192.168.1.102:554/stream",
    status: "online",
    fps: 22.7,
    thresholds: Array.from({ length: 9 }, () => ({ warning: 8, critical: 15 })),
  },
  {
    id: "cam-003",
    name: "Emergency Exit B7",
    venue: "South Wing",
    rtspUrl: "rtsp://192.168.1.103:554/stream",
    status: "online",
    fps: 25.0,
    thresholds: Array.from({ length: 9 }, () => ({ warning: 5, critical: 10 })),
  },
  {
    id: "cam-004",
    name: "Parking Lot West",
    venue: "West Wing",
    rtspUrl: "rtsp://192.168.1.104:554/stream",
    status: "offline",
    fps: 0,
    thresholds: Array.from({ length: 9 }, () => ({ warning: 12, critical: 25 })),
  },
];

/**
 * Severity levels with their associated labels.
 */
export const SEVERITY = {
  GREEN: "green",
  AMBER: "warning",
  RED: "critical",
};

/**
 * Calculate severity for a cell given count and thresholds.
 */
export function getSeverity(count, warning, critical) {
  if (count >= critical) return SEVERITY.RED;
  if (count >= warning) return SEVERITY.AMBER;
  return SEVERITY.GREEN;
}

/**
 * Generate a random integer between min and max (inclusive).
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a metric snapshot for a single camera.
 * Returns an array of 9 cell objects with count and severity.
 */
export function generateMetricSnapshot(camera) {
  if (camera.status === "offline") {
    return Array.from({ length: 9 }, (_, i) => ({
      cellIndex: i,
      count: 0,
      severity: SEVERITY.GREEN,
    }));
  }

  return camera.thresholds.map((threshold, i) => {
    // Weighted distribution: mostly low counts, occasional spikes
    const roll = Math.random();
    let count;
    if (roll < 0.5) {
      count = randInt(0, Math.floor(threshold.warning * 0.6));
    } else if (roll < 0.8) {
      count = randInt(Math.floor(threshold.warning * 0.5), threshold.warning);
    } else if (roll < 0.95) {
      count = randInt(threshold.warning, threshold.critical);
    } else {
      count = randInt(threshold.critical, threshold.critical + 8);
    }

    return {
      cellIndex: i,
      count,
      severity: getSeverity(count, threshold.warning, threshold.critical),
    };
  });
}

/**
 * Generate a full state snapshot for all cameras.
 */
export function generateFullSnapshot() {
  return MOCK_CAMERAS.map((camera) => ({
    cameraId: camera.id,
    cameraName: camera.name,
    venue: camera.venue,
    status: camera.status,
    fps: camera.status === "online" ? camera.fps + (Math.random() - 0.5) * 2 : 0,
    cells: generateMetricSnapshot(camera),
    totalOccupancy: 0, // Computed below
  })).map((snapshot) => ({
    ...snapshot,
    totalOccupancy: snapshot.cells.reduce((sum, cell) => sum + cell.count, 0),
  }));
}

/**
 * Generate a mock alert event.
 */
let alertCounter = 1000;
export function generateMockAlert(cameraSnapshots) {
  // Find cells that are in critical or warning state
  const breaches = [];
  cameraSnapshots.forEach((snap) => {
    if (snap.status === "offline") return;
    snap.cells.forEach((cell) => {
      if (cell.severity === SEVERITY.RED || cell.severity === SEVERITY.AMBER) {
        breaches.push({
          cameraId: snap.cameraId,
          cameraName: snap.cameraName,
          venue: snap.venue,
          cellIndex: cell.cellIndex,
          count: cell.count,
          severity: cell.severity,
        });
      }
    });
  });

  if (breaches.length === 0) return null;

  const breach = breaches[Math.floor(Math.random() * breaches.length)];
  const camera = MOCK_CAMERAS.find((c) => c.id === breach.cameraId);
  const threshold = camera.thresholds[breach.cellIndex];

  alertCounter++;
  return {
    id: `alert-${alertCounter}`,
    ...breach,
    thresholdValue:
      breach.severity === SEVERITY.RED ? threshold.critical : threshold.warning,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
  };
}

/**
 * Generate mock incident log entries for the incident log page.
 */
export function generateMockIncidents(count = 50) {
  const incidents = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const camera = MOCK_CAMERAS[randInt(0, MOCK_CAMERAS.length - 1)];
    if (camera.status === "offline") continue;

    const cellIndex = randInt(0, 8);
    const threshold = camera.thresholds[cellIndex];
    const isCritical = Math.random() > 0.5;
    const thresholdVal = isCritical ? threshold.critical : threshold.warning;
    const severity = isCritical ? SEVERITY.RED : SEVERITY.AMBER;
    const countVal = isCritical
      ? randInt(threshold.critical, threshold.critical + 10)
      : randInt(threshold.warning, threshold.critical);

    const acknowledged = Math.random() > 0.3;
    const timestamp = new Date(now - randInt(60000, 86400000 * 7)).toISOString();

    incidents.push({
      id: `incident-${1000 + i}`,
      cameraId: camera.id,
      cameraName: camera.name,
      venue: camera.venue,
      cellIndex,
      count: countVal,
      thresholdValue: thresholdVal,
      severity,
      timestamp,
      acknowledged,
      acknowledgedBy: acknowledged ? `operator-${randInt(1, 5)}` : null,
      acknowledgedAt: acknowledged
        ? new Date(
            new Date(timestamp).getTime() + randInt(30000, 600000)
          ).toISOString()
        : null,
    });
  }

  return incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Mock system health data.
 */
export function generateSystemHealth() {
  return {
    backendStatus: "connected",
    backendLatency: randInt(5, 45),
    wsClientCount: randInt(1, 8),
    uptime: "3d 14h 27m",
    cameras: MOCK_CAMERAS.map((cam) => ({
      id: cam.id,
      name: cam.name,
      status: cam.status,
      fps: cam.status === "online" ? +(cam.fps + (Math.random() - 0.5) * 3).toFixed(1) : 0,
      lastFrame: cam.status === "online" ? new Date().toISOString() : null,
    })),
  };
}
