import { useState, useEffect } from "react";
import {
  Activity,
  Wifi,
  WifiOff,
  Camera,
  Clock,
  Gauge,
  Users,
  RefreshCw,
} from "lucide-react";
import { RestAPI } from "../services/api";

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [latency, setLatency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const t0 = performance.now();
      const data = await RestAPI.getHealth();
      setLatency(Math.round(performance.now() - t0));
      setHealth(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch health:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-argus-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading health data...</span>
        </div>
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-argus-accent/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-argus-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-argus-100">
              System Health
            </h2>
            <p className="text-xs text-argus-500">
              Backend and camera status monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-argus-500 font-mono">
              Last refresh: {lastRefresh.toLocaleTimeString("en-GB")}
            </span>
          )}
          <button
            id="refresh-health-btn"
            onClick={fetchHealth}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-argus-700/50 text-argus-400 text-xs font-medium hover:bg-argus-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HealthCard
          icon={health.backendStatus === "connected" ? Wifi : WifiOff}
          label="Backend Status"
          value={health.backendStatus === "connected" ? "Connected" : "Disconnected"}
          color={health.backendStatus === "connected" ? "green" : "red"}
        />
        <HealthCard
          icon={Gauge}
          label="Backend Latency"
          value={latency !== null ? `${latency}ms` : "—"}
          color={latency === null ? "accent" : latency < 20 ? "green" : latency < 50 ? "amber" : "red"}
        />
        <HealthCard
          icon={Users}
          label="WebSocket Clients"
          value={health.wsClientCount}
          color="accent"
        />
        <HealthCard
          icon={Clock}
          label="Uptime"
          value={health.uptime}
          color="accent"
        />
      </div>

      {/* Camera Status Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-argus-700/50">
          <Camera className="w-4 h-4 text-argus-400" />
          <h3 className="text-sm font-semibold text-argus-200">
            Camera Health
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-argus-700/50">
                {["Camera", "Status", "Inference FPS", "Last Frame"].map(
                  (header) => (
                    <th
                      key={header}
                      className="px-5 py-3 text-left text-[10px] font-semibold text-argus-400 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {health.cameras.map((cam) => (
                <tr
                  key={cam.id}
                  className="border-b border-argus-700/20 hover:bg-argus-800/40 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          cam.status === "online"
                            ? "bg-severity-green/10"
                            : "bg-argus-700"
                        }`}
                      >
                        <Camera
                          className={`w-4 h-4 ${
                            cam.status === "online"
                              ? "text-severity-green"
                              : "text-argus-500"
                          }`}
                        />
                      </div>
                      <div>
                        <p className="text-sm text-argus-200">{cam.name}</p>
                        <p className="text-[10px] text-argus-500 font-mono">
                          {cam.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        cam.status === "online"
                          ? "severity-badge-green"
                          : "severity-badge-critical"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          cam.status === "online"
                            ? "bg-severity-green animate-glow"
                            : "bg-severity-red"
                        }`}
                      />
                      {cam.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-argus-100">
                        {cam.fps}
                      </span>
                      <span className="text-[10px] text-argus-500">FPS</span>
                      {cam.status === "online" && (
                        <div className="w-16 h-1.5 rounded-full bg-argus-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              cam.fps >= 20
                                ? "bg-severity-green"
                                : cam.fps >= 10
                                ? "bg-severity-amber"
                                : "bg-severity-red"
                            }`}
                            style={{
                              width: `${Math.min(100, (cam.fps / 30) * 100)}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {cam.lastFrame ? (
                      <span className="text-xs font-mono text-argus-300">
                        {new Date(cam.lastFrame).toLocaleTimeString("en-GB")}
                      </span>
                    ) : (
                      <span className="text-xs text-argus-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HealthCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    accent: { bg: "bg-argus-accent/10", text: "text-argus-accent", border: "border-argus-accent/20" },
    green: { bg: "bg-severity-green/10", text: "text-severity-green", border: "border-severity-green/20" },
    amber: { bg: "bg-severity-amber/10", text: "text-severity-amber", border: "border-severity-amber/20" },
    red: { bg: "bg-severity-red/10", text: "text-severity-red", border: "border-severity-red/20" },
  };

  const c = colorMap[color] || colorMap.accent;

  return (
    <div className={`glass-panel rounded-2xl p-5 border ${c.border}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
      </div>
      <p className="text-[11px] text-argus-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold font-mono ${c.text}`}>{value}</p>
    </div>
  );
}
