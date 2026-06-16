import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import IncidentLog from "./pages/IncidentLog";
import Settings from "./pages/Settings";
import SystemHealth from "./pages/SystemHealth";
import { wsService } from "./services/api";

const MAX_HISTORY = 60;
const SESSION_ID = "operator-001";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const historyRef = useRef([]);

  useEffect(() => {
    wsService.connect();

    const unsubConnection = wsService.onConnectionChange(({ connected }) => {
      setConnected(connected);
    });

    const unsubMetric = wsService.onMetricUpdate((data) => {
      setSnapshots(data);

      const point = {
        time: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      data.forEach((snap) => {
        point[snap.cameraId] = snap.totalOccupancy;
      });

      historyRef.current = [
        ...historyRef.current.slice(-(MAX_HISTORY - 1)),
        point,
      ];
      setHistory([...historyRef.current]);
    });

    const unsubAlert = wsService.onAlert((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 100));
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

  const activeAlertCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <Routes>
      <Route element={<Layout connected={connected} alertCount={activeAlertCount} />}>
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
