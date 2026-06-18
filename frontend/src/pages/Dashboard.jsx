import { useState } from "react";
import { TrendingUp, Camera as CameraIcon, AlertTriangle } from "lucide-react";
import CameraCard from "../components/CameraCard";
import AlertPanel from "../components/AlertPanel";
import OccupancyChart from "../components/OccupancyChart";
import CameraFeedModal from "../components/CameraFeedModal";

export default function Dashboard({ snapshots, alerts, history, onAcknowledge, onDismiss }) {
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  const totalCameras = snapshots.length;
  const onlineCameras = snapshots.filter((s) => s.status === "online").length;
  const totalOccupancy = snapshots.reduce((sum, s) => sum + (s.totalOccupancy || 0), 0);
  const activeAlerts = alerts.filter((a) => !a.acknowledged).length;
  const onlineSnapshots = snapshots.filter((s) => s.status === "online");

  // Keep modal snapshot fresh: if modal is open, merge latest data for that camera
  const modalSnapshot = selectedSnapshot
    ? (snapshots.find((s) => s.cameraId === selectedSnapshot.cameraId) ?? selectedSnapshot)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Live feed modal */}
      {modalSnapshot && (
        <CameraFeedModal
          snapshot={modalSnapshot}
          onClose={() => setSelectedSnapshot(null)}
        />
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CameraIcon} label="Cameras Online" value={`${onlineCameras}/${totalCameras}`} color="accent" />
        <StatCard icon={TrendingUp} label="Total Occupancy" value={totalOccupancy} color="green" />
        <StatCard icon={AlertTriangle} label="Active Alerts" value={activeAlerts} color={activeAlerts > 0 ? "red" : "green"} />
        <StatCard icon={CameraIcon} label="Zones Monitored" value={onlineCameras * 9} color="accent" />
      </div>

      {/* Main Grid: Cameras + Alert Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {snapshots.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 flex items-center justify-center">
              <p className="text-sm text-argus-500">Waiting for live feed from backend…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {snapshots.map((snapshot) => (
                <CameraCard
                  key={snapshot.cameraId}
                  snapshot={snapshot}
                  onClick={snapshot.status === "online" ? () => setSelectedSnapshot(snapshot) : undefined}
                />
              ))}
            </div>
          )}

          <OccupancyChart
            history={history}
            cameras={onlineSnapshots.map((s) => ({ cameraId: s.cameraId, cameraName: s.cameraName }))}
          />
        </div>

        <div className="xl:col-span-1">
          <AlertPanel alerts={alerts} onAcknowledge={onAcknowledge} onDismiss={onDismiss} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    accent: { bg: "bg-argus-accent/10", text: "text-argus-accent", border: "border-argus-accent/20" },
    green:  { bg: "bg-severity-green/10", text: "text-severity-green", border: "border-severity-green/20" },
    red:    { bg: "bg-severity-red/10", text: "text-severity-red", border: "border-severity-red/20" },
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
