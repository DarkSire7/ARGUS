import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import IncidentLog from "./pages/IncidentLog";
import Settings from "./pages/Settings";
import SystemHealth from "./pages/SystemHealth";
import { wsService } from "./services/api";

const MAX_HISTORY = 60;
const SESSION_ID = "operator-001";

function playAlertTone(severity) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = severity === "critical" ? 1040 : 660;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // AudioContext blocked before user interaction — silently ignore
  }
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [role, setRole] = useState("operator"); // "operator" | "admin"
  const historyRef = useRef([]);
  const navigate = useNavigate();

  useEffect(() => {
    wsService.connect();

    const unsubConnection = wsService.onConnectionChange(({ connected }) => {
      setConnected(connected);
    });

    const unsubMetric = wsService.onMetricUpdate((data) => {
      setSnapshots(data);
      const point = {
        time: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
      };
      data.forEach((snap) => { point[snap.cameraId] = snap.totalOccupancy; });
      historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), point];
      setHistory([...historyRef.current]);
    });

    const unsubAlert = wsService.onAlert((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 100));
      playAlertTone(alert.severity);
    });

    return () => {
      unsubConnection();
      unsubMetric();
      unsubAlert();
      wsService.disconnect();
    };
  }, []);

  const handleAcknowledge = useCallback((alertId) => {
    wsService.sendAcknowledge(alertId, SESSION_ID);
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? { ...a, acknowledged: true, acknowledgedBy: SESSION_ID, acknowledgedAt: new Date().toISOString() }
          : a
      )
    );
  }, []);

  const handleDismiss = useCallback((alertId) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? { ...a, acknowledged: true, acknowledgedBy: `${SESSION_ID} (dismissed)`, acknowledgedAt: new Date().toISOString() }
          : a
      )
    );
  }, []);

  const handleRoleChange = useCallback((newRole) => {
    setRole(newRole);
    navigate("/");
  }, [navigate]);

  const activeAlertCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <Routes>
      <Route
        element={
          <Layout
            connected={connected}
            alertCount={activeAlertCount}
            role={role}
            onRoleChange={handleRoleChange}
          />
        }
      >
        <Route
          path="/"
          element={
            <Dashboard
              snapshots={snapshots}
              alerts={alerts}
              history={history}
              onAcknowledge={handleAcknowledge}
              onDismiss={handleDismiss}
            />
          }
        />
        <Route path="/incidents" element={<IncidentLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/health" element={<SystemHealth />} />
      </Route>
    </Routes>
  );
}
