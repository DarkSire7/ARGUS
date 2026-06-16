import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import IncidentLog from "./pages/IncidentLog";
import Settings from "./pages/Settings";
import SystemHealth from "./pages/SystemHealth";
import { wsService } from "./services/api";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  // Initialize WebSocket on mount
  useEffect(() => {
    wsService.connect();

    const unsubConnection = wsService.onConnectionChange(({ connected }) => {
      setConnected(connected);
    });

    const unsubAlert = wsService.onAlert(() => {
      setAlertCount((c) => c + 1);
      // Auto-decrement after 30s to approximate resolved alerts
      setTimeout(() => setAlertCount((c) => Math.max(0, c - 1)), 30000);
    });

    return () => {
      unsubConnection();
      unsubAlert();
      wsService.disconnect();
    };
  }, []);

  return (
    <Routes>
      <Route
        element={<Layout connected={connected} alertCount={alertCount} />}
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/incidents" element={<IncidentLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/health" element={<SystemHealth />} />
      </Route>
    </Routes>
  );
}
