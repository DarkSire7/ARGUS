import { useMemo } from "react";
import { Camera, Users, AlertTriangle, AlertOctagon } from "lucide-react";
import HeatmapGrid from "./HeatmapGrid";

/**
 * Camera card showing camera name, total occupancy, heatmap grid,
 * and alert status. Pulses red border on critical alert.
 *
 * @param {{ snapshot: Object }} props
 */
export default function CameraCard({ snapshot }) {
  const {
    cameraId,
    cameraName,
    venue,
    status,
    cells,
    totalOccupancy,
  } = snapshot;

  const hasCritical = useMemo(
    () => cells.some((c) => c.severity === "critical"),
    [cells]
  );

  const hasWarning = useMemo(
    () => cells.some((c) => c.severity === "warning"),
    [cells]
  );

  const maxSeverity = hasCritical
    ? "critical"
    : hasWarning
    ? "warning"
    : "green";

  return (
    <div
      id={`camera-card-${cameraId}`}
      className={`
        glass-panel glass-panel-hover rounded-2xl p-5
        transition-all duration-300 ease-out
        ${hasCritical ? "animate-pulse-red border-severity-red/30" : ""}
        ${status === "offline" ? "opacity-50" : ""}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`
              w-10 h-10 rounded-xl flex items-center justify-center
              ${
                status === "offline"
                  ? "bg-argus-700"
                  : hasCritical
                  ? "bg-severity-red/15"
                  : "bg-argus-accent/10"
              }
            `}
          >
            <Camera
              className={`w-5 h-5 ${
                status === "offline"
                  ? "text-argus-500"
                  : hasCritical
                  ? "text-severity-red"
                  : "text-argus-accent"
              }`}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-argus-100 leading-tight">
              {cameraName}
            </h3>
            <p className="text-[11px] text-argus-500 font-mono">{venue}</p>
          </div>
        </div>

        {/* Status Badge */}
        <div
          className={`
            px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider
            ${
              status === "offline"
                ? "bg-argus-700 text-argus-400"
                : `severity-badge-${maxSeverity}`
            }
          `}
        >
          {status === "offline" ? "Offline" : maxSeverity === "critical" ? "CRITICAL" : maxSeverity === "warning" ? "WARNING" : "NORMAL"}
        </div>
      </div>

      {/* Occupancy Count */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-argus-800/60">
        <Users className="w-4 h-4 text-argus-400" />
        <span className="text-xs text-argus-400">Total Occupancy</span>
        <span className="ml-auto text-lg font-bold font-mono text-argus-100">
          {totalOccupancy}
        </span>
      </div>

      {/* Heatmap Grid */}
      <div className="flex justify-center">
        <HeatmapGrid cells={cells} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-argus-700/30">
        <span className="text-[10px] font-mono text-argus-500">{cameraId}</span>
        <div className="flex items-center gap-1">
          {hasCritical && (
            <AlertOctagon className="w-3.5 h-3.5 text-severity-red" />
          )}
          {hasWarning && !hasCritical && (
            <AlertTriangle className="w-3.5 h-3.5 text-severity-amber" />
          )}
          <span
            className={`w-2 h-2 rounded-full ${
              status === "offline"
                ? "bg-argus-500"
                : "bg-severity-green animate-glow"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
