// ============================================================
// ARGUS — API Service Layer
// WebSocket service and REST endpoint stubs.
// TODO: Replace BACKEND_URL with actual FastAPI backend address.
// ============================================================

import {
  generateFullSnapshot,
  generateMockAlert,
  generateMockIncidents,
  generateSystemHealth,
  MOCK_CAMERAS,
} from "./mockData";

// TODO: Replace with actual backend URL when FastAPI backend is deployed
const BACKEND_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws/dashboard";

// ─── WebSocket Service ───────────────────────────────────────

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = {
      metricUpdate: [],
      alert: [],
      connectionChange: [],
    };
    this.reconnectTimer = null;
    this.connected = false;
    this._useMock = true; // Set to false when backend is available
    this._mockInterval = null;
  }

  /**
   * Connect to WebSocket endpoint.
   * Falls back to mock data simulation if connection fails.
   * @param {string} url - WebSocket URL (defaults to WS_URL)
   */
  connect(url = WS_URL) {
    if (this._useMock) {
      this._startMockStream();
      return;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        this._notifyListeners("connectionChange", { connected: true });
        console.log("[ARGUS WS] Connected to backend");
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this._handleMessage(message);
        } catch (err) {
          console.error("[ARGUS WS] Failed to parse message:", err);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this._notifyListeners("connectionChange", { connected: false });
        console.log("[ARGUS WS] Disconnected. Reconnecting in 3s...");
        this._scheduleReconnect(url);
      };

      this.ws.onerror = (err) => {
        console.error("[ARGUS WS] Error:", err);
      };
    } catch {
      console.warn("[ARGUS WS] Connection failed, using mock data");
      this._useMock = true;
      this._startMockStream();
    }
  }

  /**
   * Disconnect from WebSocket.
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this._mockInterval) {
      clearInterval(this._mockInterval);
      this._mockInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
  }

  /**
   * Register a listener for metric updates.
   * @param {Function} callback - (snapshot: CameraSnapshot[]) => void
   */
  onMetricUpdate(callback) {
    this.listeners.metricUpdate.push(callback);
    return () => {
      this.listeners.metricUpdate = this.listeners.metricUpdate.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Register a listener for alert events.
   * @param {Function} callback - (alert: AlertPayload) => void
   */
  onAlert(callback) {
    this.listeners.alert.push(callback);
    return () => {
      this.listeners.alert = this.listeners.alert.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Register a listener for connection state changes.
   * @param {Function} callback - ({ connected: boolean }) => void
   */
  onConnectionChange(callback) {
    this.listeners.connectionChange.push(callback);
    return () => {
      this.listeners.connectionChange =
        this.listeners.connectionChange.filter((cb) => cb !== callback);
    };
  }

  /**
   * Send threshold configuration update to backend.
   * @param {string} cameraId
   * @param {number} cellIndex
   * @param {number} warning
   * @param {number} critical
   */
  sendThresholdConfig(cameraId, cellIndex, warning, critical) {
    const payload = {
      type: "threshold_config",
      data: { cameraId, cellIndex, warning, critical },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.log("[ARGUS WS] Mock: Threshold config sent", payload.data);
    }
  }

  /**
   * Send alert acknowledgement to backend.
   * @param {string} alertId
   * @param {string} sessionId
   */
  sendAcknowledge(alertId, sessionId) {
    const payload = {
      type: "acknowledge",
      data: { alertId, sessionId, timestamp: new Date().toISOString() },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.log("[ARGUS WS] Mock: Alert acknowledged", payload.data);
    }
  }

  // ─── Private Methods ────────────────────────────────────────

  _handleMessage(message) {
    switch (message.type) {
      case "metric_update":
        this._notifyListeners("metricUpdate", message.data);
        break;
      case "alert":
        this._notifyListeners("alert", message.data);
        break;
      default:
        console.warn("[ARGUS WS] Unknown message type:", message.type);
    }
  }

  _notifyListeners(event, data) {
    this.listeners[event].forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[ARGUS WS] Listener error (${event}):`, err);
      }
    });
  }

  _scheduleReconnect(url) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(url);
    }, 3000);
  }

  _startMockStream() {
    this.connected = true;
    this._notifyListeners("connectionChange", { connected: true });

    // Send initial snapshot immediately
    const snapshot = generateFullSnapshot();
    this._notifyListeners("metricUpdate", snapshot);

    // Stream updates every 2 seconds
    this._mockInterval = setInterval(() => {
      const newSnapshot = generateFullSnapshot();
      this._notifyListeners("metricUpdate", newSnapshot);

      // 30% chance of alert on each tick
      if (Math.random() < 0.3) {
        const alert = generateMockAlert(newSnapshot);
        if (alert) {
          this._notifyListeners("alert", alert);
        }
      }
    }, 2000);
  }
}

// Singleton instance
export const wsService = new WebSocketService();

// ─── REST API Stubs ──────────────────────────────────────────

export const RestAPI = {
  /**
   * GET /api/cameras — List all registered cameras.
   * TODO: Replace with fetch(`${BACKEND_URL}/api/cameras`)
   */
  async getCameras() {
    // TODO: return fetch(`${BACKEND_URL}/api/cameras`).then(r => r.json());
    return MOCK_CAMERAS;
  },

  /**
   * POST /api/cameras — Register a new camera feed.
   * TODO: Replace with actual POST request
   * @param {{ name: string, rtspUrl: string, venue: string }} cameraData
   */
  async registerCamera(cameraData) {
    // TODO: return fetch(`${BACKEND_URL}/api/cameras`, { method: 'POST', body: JSON.stringify(cameraData) }).then(r => r.json());
    console.log("[ARGUS API] Mock: Camera registered", cameraData);
    return { success: true, id: `cam-${Date.now()}`, ...cameraData };
  },

  /**
   * GET /api/incidents — Fetch incident log with optional filters.
   * TODO: Replace with actual GET request
   * @param {{ cameraId?: string, severity?: string, startDate?: string, endDate?: string }} filters
   */
  async getIncidents(filters = {}) {
    // TODO: const params = new URLSearchParams(filters);
    // TODO: return fetch(`${BACKEND_URL}/api/incidents?${params}`).then(r => r.json());
    let incidents = generateMockIncidents(50);

    if (filters.cameraId) {
      incidents = incidents.filter((i) => i.cameraId === filters.cameraId);
    }
    if (filters.severity) {
      incidents = incidents.filter((i) => i.severity === filters.severity);
    }
    if (filters.startDate) {
      incidents = incidents.filter(
        (i) => new Date(i.timestamp) >= new Date(filters.startDate)
      );
    }
    if (filters.endDate) {
      incidents = incidents.filter(
        (i) => new Date(i.timestamp) <= new Date(filters.endDate)
      );
    }

    return incidents;
  },

  /**
   * GET /api/incidents/export — Download CSV export of filtered incidents.
   * TODO: Replace with actual download endpoint
   * @param {{ cameraId?: string, severity?: string, startDate?: string, endDate?: string }} filters
   */
  async exportIncidentsCSV(filters = {}) {
    // TODO: window.open(`${BACKEND_URL}/api/incidents/export?${new URLSearchParams(filters)}`);
    const incidents = await this.getIncidents(filters);
    const headers = [
      "ID",
      "Camera ID",
      "Camera Name",
      "Venue",
      "Cell Index",
      "Count",
      "Threshold",
      "Severity",
      "Timestamp",
      "Acknowledged",
      "Acknowledged By",
      "Acknowledged At",
    ];
    const rows = incidents.map((i) =>
      [
        i.id,
        i.cameraId,
        i.cameraName,
        i.venue,
        i.cellIndex,
        i.count,
        i.thresholdValue,
        i.severity,
        i.timestamp,
        i.acknowledged,
        i.acknowledgedBy || "",
        i.acknowledgedAt || "",
      ].join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `argus-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * GET /api/health — System health metrics.
   * TODO: Replace with actual health endpoint
   */
  async getHealth() {
    // TODO: return fetch(`${BACKEND_URL}/api/health`).then(r => r.json());
    return generateSystemHealth();
  },
};
