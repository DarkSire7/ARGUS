import { useState, useEffect, useRef, useCallback } from "react";
import { TrendingUp, Camera as CameraIcon, AlertTriangle } from "lucide-react";
import CameraCard from "../components/CameraCard";
import AlertPanel from "../components/AlertPanel";
import OccupancyChart from "../components/OccupancyChart";
import { wsService } from "../services/api";

const MAX_HISTORY = 60; // Rolling window data points
const SESSION_ID = "operator-001"; // TODO: Replace with auth session

export default function Dashboard() {
  const [snapshots, setSnapshots] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const historyRef = useRef([]);

  // Subscribe to WebSocket metrics
  useEffect(() => {
    const unsubMetric = wsService.onMetricUpdate((data) => {
      setSnapshots(data);

      // Build history data point
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
      unsubMetric();
      unsubAlert();
    };
  }, []);

  // Acknowledge alert
  const handleAcknowledge = useCallback((alertId) => {
    wsService.sendAcknowledge(alertId, SESSION_ID);
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              acknowledged: true,
              acknowledgedBy: SESSION_ID,
              acknowledgedAt: new Date().toISOString(),
            }
          : a
      )
    );
  }, []);

  // Dismiss alert
  const handleDismiss = useCallback((alertId) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              acknowledged: true,
              acknowledgedBy: `${SESSION_ID} (dismissed)`,
              acknowledgedAt: new Date().toISOString(),
            }
          : a
      )
    );
  }, []);

  // Stats
  const totalCameras = snapshots.length;
  const onlineCameras = snapshots.filter((s) => s.status === "online").length;
  const totalOccupancy = snapshots.reduce(
    (sum, s) => sum + (s.totalOccupancy || 0),
    0
  );
  const activeAlerts = alerts.filter((a) => !a.acknowledged).length;

  const onlineSnapshots = snapshots.filter((s) => s.status === "online");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CameraIcon}
          label="Cameras Online"
          value={`${onlineCameras}/${totalCameras}`}
          color="accent"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Occupancy"
          value={totalOccupancy}
          color="green"
        />
        <StatCard
          icon={AlertTriangle}
          label="Active Alerts"
          value={activeAlerts}
          color={activeAlerts > 0 ? "red" : "green"}
        />
        <StatCard
          icon={CameraIcon}
          label="Zones Monitored"
          value={onlineCameras * 9}
          color="accent"
        />
      </div>

      {/* Main Grid: Cameras + Alert Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Camera Grid */}
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {snapshots.map((snapshot) => (
              <CameraCard key={snapshot.cameraId} snapshot={snapshot} />
            ))}
          </div>

          {/* Occupancy Trend Chart */}
          <OccupancyChart
            history={history}
            cameras={onlineSnapshots.map((s) => ({
              cameraId: s.cameraId,
              cameraName: s.cameraName,
            }))}
          />
        </div>

        {/* Alert Panel */}
        <div className="xl:col-span-1">
          <AlertPanel
            alerts={alerts}
            onAcknowledge={handleAcknowledge}
            onDismiss={handleDismiss}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    accent: {
      bg: "bg-argus-accent/10",
      text: "text-argus-accent",
      border: "border-argus-accent/20",
    },
    green: {
      bg: "bg-severity-green/10",
      text: "text-severity-green",
      border: "border-severity-green/20",
    },
    red: {
      bg: "bg-severity-red/10",
      text: "text-severity-red",
      border: "border-severity-red/20",
    },
  };

  const c = colorMap[color] || colorMap.accent;

  return (
    <div className={`glass-panel glass-panel-hover rounded-2xl p-4 border ${c.border}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <div>
          <p className="text-[11px] text-argus-500">{label}</p>
          <p className={`text-xl font-bold font-mono ${c.text}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
