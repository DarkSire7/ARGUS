import { useRef, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  AlertOctagon,
  Check,
  X,
  Clock,
  MapPin,
  Users,
} from "lucide-react";

/**
 * Play a short alert beep using Web Audio API.
 */
function playAlertTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.1;

    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

/**
 * Alert panel showing real-time alerts in reverse chronological order.
 *
 * @param {{
 *   alerts: Array,
 *   onAcknowledge: (alertId: string) => void,
 *   onDismiss: (alertId: string) => void,
 *   playSound: boolean,
 * }} props
 */
export default function AlertPanel({
  alerts = [],
  onAcknowledge,
  onDismiss,
  playSound = true,
}) {
  const prevCountRef = useRef(alerts.length);
  const listRef = useRef(null);

  // Play sound on new alert
  useEffect(() => {
    if (alerts.length > prevCountRef.current && playSound) {
      playAlertTone();
    }
    prevCountRef.current = alerts.length;
  }, [alerts.length, playSound]);

  const formatTime = useCallback((isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  const cellLabel = (index) => {
    const labels = ["TL", "TC", "TR", "ML", "MC", "MR", "BL", "BC", "BR"];
    return labels[index] || `C${index}`;
  };

  if (alerts.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-severity-green/10 flex items-center justify-center">
          <Check className="w-7 h-7 text-severity-green" />
        </div>
        <h3 className="text-sm font-semibold text-argus-200 mb-1">
          All Clear
        </h3>
        <p className="text-xs text-argus-500">No active alerts</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-argus-700/50">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-severity-red" />
          <h3 className="text-sm font-semibold text-argus-100">Active Alerts</h3>
        </div>
        <span className="severity-badge-critical text-[10px] font-bold px-2 py-0.5 rounded-md">
          {alerts.filter((a) => !a.acknowledged).length}
        </span>
      </div>

      {/* Alert List */}
      <div ref={listRef} className="max-h-[500px] overflow-y-auto">
        {alerts.map((alert, idx) => (
          <div
            key={alert.id}
            className={`
              px-5 py-4 border-b border-argus-700/20
              transition-all duration-300
              ${idx === 0 ? "animate-fade-in" : ""}
              ${alert.acknowledged ? "opacity-50" : ""}
              hover:bg-argus-800/40
            `}
          >
            {/* Alert Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {alert.severity === "critical" ? (
                  <AlertOctagon className="w-3.5 h-3.5 text-severity-red" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-severity-amber" />
                )}
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded severity-badge-${alert.severity}`}
                >
                  {alert.severity}
                </span>
              </div>
              <div className="flex items-center gap-1 text-argus-500">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] font-mono">
                  {formatTime(alert.timestamp)}
                </span>
              </div>
            </div>

            {/* Alert Details */}
            <div className="space-y-1 mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-3 h-3 text-argus-500" />
                <span className="text-xs text-argus-300">
                  {alert.cameraName} — Zone {cellLabel(alert.cellIndex)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 text-argus-500" />
                <span className="text-xs text-argus-300">
                  <span className="font-bold text-argus-100">{alert.count}</span>
                  {" "}persons (threshold: {alert.thresholdValue})
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            {!alert.acknowledged && (
              <div className="flex items-center gap-2">
                <button
                  id={`ack-btn-${alert.id}`}
                  onClick={() => onAcknowledge?.(alert.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-severity-green/15 text-severity-green border border-severity-green/20 hover:bg-severity-green/25 transition-colors cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  Acknowledge
                </button>
                <button
                  id={`dismiss-btn-${alert.id}`}
                  onClick={() => onDismiss?.(alert.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-argus-700/50 text-argus-400 border border-argus-600/30 hover:bg-argus-700/80 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Dismiss
                </button>
              </div>
            )}

            {alert.acknowledged && (
              <div className="flex items-center gap-1.5 text-[10px] text-argus-500">
                <Check className="w-3 h-3" />
                <span>
                  Acknowledged by {alert.acknowledgedBy} at{" "}
                  {formatTime(alert.acknowledgedAt)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
