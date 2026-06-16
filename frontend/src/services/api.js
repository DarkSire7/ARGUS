// ============================================================
// ARGUS — API Service Layer
// WebSocket service + REST calls to the FastAPI backend.
// VITE_BACKEND_URL can be set in .env (defaults to localhost:8000).
// ============================================================

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";
const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/ws/dashboard";

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
  }

  connect(url = WS_URL) {
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

      this.ws.onerror = () => {
        // onclose fires after onerror — reconnect is handled there
      };
    } catch {
      console.warn("[ARGUS WS] Connection failed. Retrying in 3s...");
      this._scheduleReconnect(url);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
  }

  onMetricUpdate(callback) {
    this.listeners.metricUpdate.push(callback);
    return () => {
      this.listeners.metricUpdate = this.listeners.metricUpdate.filter((cb) => cb !== callback);
    };
  }

  onAlert(callback) {
    this.listeners.alert.push(callback);
    return () => {
      this.listeners.alert = this.listeners.alert.filter((cb) => cb !== callback);
    };
  }

  onConnectionChange(callback) {
    this.listeners.connectionChange.push(callback);
    return () => {
      this.listeners.connectionChange = this.listeners.connectionChange.filter((cb) => cb !== callback);
    };
  }

  sendThresholdConfig(cameraId, cellIndex, warning, critical) {
    this._send({ type: "threshold_config", data: { cameraId, cellIndex, warning, critical } });
  }

  sendAcknowledge(alertId, sessionId) {
    this._send({ type: "acknowledge", data: { alertId, sessionId, timestamp: new Date().toISOString() } });
  }

  // ─── Private ────────────────────────────────────────────────

  _send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.log("[ARGUS WS] Not connected — message dropped:", payload.type);
    }
  }

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
      try { cb(data); } catch (err) {
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
}

export const wsService = new WebSocketService();

// ─── REST API ────────────────────────────────────────────────

export const RestAPI = {
  async getCameras() {
    const r = await fetch(`${BACKEND_URL}/api/cameras`);
    if (!r.ok) throw new Error(`GET /api/cameras ${r.status}`);
    return r.json();
  },

  async registerCamera(cameraData) {
    const r = await fetch(`${BACKEND_URL}/api/cameras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cameraData),
    });
    if (!r.ok) throw new Error(`POST /api/cameras ${r.status}`);
    return r.json();
  },

  async getIncidents(filters = {}) {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ""))
    );
    const r = await fetch(`${BACKEND_URL}/api/incidents?${params}`);
    if (!r.ok) throw new Error(`GET /api/incidents ${r.status}`);
    return r.json();
  },

  async exportIncidentsCSV(filters = {}) {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ""))
    );
    window.open(`${BACKEND_URL}/api/incidents/export?${params}`);
  },

  async getHealth() {
    const r = await fetch(`${BACKEND_URL}/api/health`);
    if (!r.ok) throw new Error(`GET /api/health ${r.status}`);
    return r.json();
  },
};
