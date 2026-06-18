import { useEffect, useState, useRef } from "react";
import { Camera, X, WifiOff, Users, Activity } from "lucide-react";
import { BACKEND_URL } from "../services/api";

const POLL_MS = 200; // ~5 fps — smooth enough for surveillance, gentle on the server

export default function CameraFeedModal({ snapshot, onClose }) {
  const [frameSrc, setFrameSrc] = useState(null);
  const [streamError, setStreamError] = useState(false);
  const activeRef = useRef(true);
  const frameUrl = `${BACKEND_URL}/video/${snapshot.cameraId}/frame`;

  // Poll the single-frame endpoint and preload off-screen to avoid flicker
  useEffect(() => {
    activeRef.current = true;
    setStreamError(false);

    const poll = () => {
      if (!activeRef.current) return;
      const img = new Image();
      img.onload = () => {
        if (activeRef.current) {
          setFrameSrc(img.src);
          setStreamError(false);
        }
      };
      img.onerror = () => {
        if (activeRef.current) setStreamError(true);
      };
      img.src = `${frameUrl}?t=${Date.now()}`;
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      activeRef.current = false;
      clearInterval(id);
    };
  }, [frameUrl]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const hasCritical = snapshot.cells?.some((c) => c.severity === "critical");
  const hasWarning  = snapshot.cells?.some((c) => c.severity === "warning");
  const maxSeverity = hasCritical ? "critical" : hasWarning ? "warning" : "normal";

  const severityColor = {
    critical: "text-severity-red border-severity-red/40",
    warning:  "text-severity-amber border-severity-amber/40",
    normal:   "text-severity-green border-severity-green/40",
  }[maxSeverity];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl glass-panel rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-argus-700/50">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              hasCritical ? "bg-severity-red/15" : "bg-argus-accent/10"
            }`}>
              <Camera className={`w-4 h-4 ${hasCritical ? "text-severity-red" : "text-argus-accent"}`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-argus-100">{snapshot.cameraName}</h3>
              <p className="text-[11px] text-argus-500 font-mono">{snapshot.venue} · {snapshot.cameraId}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${severityColor}`}>
              {maxSeverity}
            </span>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-argus-800 border border-argus-700/50">
              <Users className="w-3.5 h-3.5 text-argus-400" />
              <span className="text-sm font-bold font-mono text-argus-100">{snapshot.totalOccupancy}</span>
              <span className="text-[10px] text-argus-500">persons</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-argus-800 border border-argus-700/50">
              <Activity className="w-3.5 h-3.5 text-argus-400" />
              <span className="text-sm font-bold font-mono text-argus-100">{snapshot.fps ?? "—"}</span>
              <span className="text-[10px] text-argus-500">fps</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-400 hover:text-argus-100 hover:bg-argus-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video area */}
        <div className="bg-black relative" style={{ aspectRatio: "16/9" }}>
          {streamError || (!frameSrc && !streamError) ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-argus-500">
              {streamError ? (
                <>
                  <WifiOff className="w-10 h-10" />
                  <p className="text-sm">Live stream unavailable</p>
                  <p className="text-[11px] text-argus-600 font-mono">{frameUrl}</p>
                </>
              ) : (
                <p className="text-sm animate-pulse">Connecting to feed…</p>
              )}
            </div>
          ) : null}

          {frameSrc && (
            <img
              src={frameSrc}
              alt={`Live feed — ${snapshot.cameraName}`}
              className="w-full h-full object-contain"
            />
          )}

          {/* LIVE badge */}
          {frameSrc && !streamError && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 border border-severity-red/40 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-severity-red animate-pulse" />
              <span className="text-[10px] font-bold text-severity-red uppercase tracking-widest">Live</span>
            </div>
          )}
        </div>

        {/* Zone grid summary footer */}
        {snapshot.cells && snapshot.cells.length === 9 && (
          <div className="px-5 py-4 border-t border-argus-700/50">
            <p className="text-[10px] text-argus-500 uppercase tracking-wider mb-2 font-semibold">Zone Occupancy</p>
            <div className="grid grid-cols-9 gap-1.5">
              {snapshot.cells.map((cell, i) => {
                const style =
                  cell.severity === "critical"
                    ? "bg-severity-red/20 border-severity-red/40 text-severity-red"
                    : cell.severity === "warning"
                    ? "bg-severity-amber/20 border-severity-amber/40 text-severity-amber"
                    : "bg-argus-800 border-argus-700/40 text-argus-300";
                return (
                  <div key={i} className={`flex flex-col items-center justify-center py-1.5 rounded-lg border ${style}`}>
                    <span className="text-sm font-bold font-mono leading-none">{cell.count}</span>
                    <span className="text-[9px] opacity-60 mt-0.5">
                      {["TL","TC","TR","ML","MC","MR","BL","BC","BR"][i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
