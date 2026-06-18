import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  SlidersHorizontal,
  Save,
  Plus,
  Camera,
  AlertTriangle,
  AlertOctagon,
  Check,
  RotateCcw,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { wsService, RestAPI } from "../services/api";

const CELL_LABELS = [
  "Top-Left", "Top-Center", "Top-Right",
  "Mid-Left", "Mid-Center", "Mid-Right",
  "Bot-Left", "Bot-Center", "Bot-Right",
];

export default function Settings() {
  const { role } = useOutletContext() || {};
  const isAdmin = role === "admin";
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [thresholds, setThresholds] = useState([]);
  const [saved, setSaved] = useState(false);

  const [newCamera, setNewCamera] = useState({ name: "", rtspUrl: "", venue: "", sourceType: "rtsp" });
  const [showNewCameraForm, setShowNewCameraForm] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerError, setRegisterError] = useState("");

  const loadCameras = async () => {
    try {
      const cams = await RestAPI.getCameras();
      setCameras(cams);
      if (cams.length > 0 && !selectedCamera) {
        setSelectedCamera(cams[0]);
        setThresholds(cams[0].thresholds.map((t) => ({ ...t })));
      }
    } catch (err) {
      console.error("Failed to load cameras:", err);
    }
  };

  useEffect(() => {
    loadCameras();
  }, []);

  const handleSelectCamera = (cam) => {
    setSelectedCamera(cam);
    setThresholds(cam.thresholds.map((t) => ({ ...t })));
    setSaved(false);
  };

  const updateThreshold = (cellIndex, field, value) => {
    setThresholds((prev) =>
      prev.map((t, i) =>
        i === cellIndex ? { ...t, [field]: parseInt(value) || 0 } : t
      )
    );
    setSaved(false);
  };

  const handleSave = () => {
    if (!selectedCamera) return;
    thresholds.forEach((threshold, cellIndex) => {
      wsService.sendThresholdConfig(
        selectedCamera.id,
        cellIndex,
        threshold.warning,
        threshold.critical
      );
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (!selectedCamera) return;
    const defaults = selectedCamera.thresholds.map((t) => ({ ...t }));
    setThresholds(defaults);
    setSaved(false);
  };

  const handleRegister = async () => {
    if (!newCamera.name || !newCamera.rtspUrl || !newCamera.venue) return;
    setRegisterError("");
    try {
      await RestAPI.registerCamera(newCamera);
      setRegisterSuccess(true);
      setNewCamera({ name: "", rtspUrl: "", venue: "", sourceType: "rtsp" });
      await loadCameras();
      setTimeout(() => {
        setRegisterSuccess(false);
        setShowNewCameraForm(false);
      }, 2000);
    } catch (err) {
      setRegisterError("Failed to register camera. Check backend connection.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAdmin ? "bg-purple-500/10" : "bg-argus-accent/10"}`}>
          {isAdmin
            ? <SlidersHorizontal className="w-5 h-5 text-purple-400" />
            : <SettingsIcon className="w-5 h-5 text-argus-accent" />
          }
        </div>
        <div>
          <h2 className="text-lg font-semibold text-argus-100">{isAdmin ? "Threshold Configuration" : "Settings"}</h2>
          <p className="text-xs text-argus-500">{isAdmin ? "Live per-cell warning and critical thresholds" : "Configure thresholds and manage cameras"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera Selector */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-argus-200">Cameras</h3>
              {!isAdmin && (
                <button
                  onClick={() => {
                    setShowNewCameraForm(!showNewCameraForm);
                    setRegisterError("");
                  }}
                  className="p-2 rounded-lg bg-argus-accent/10 text-argus-accent hover:bg-argus-accent/20 transition-colors cursor-pointer"
                  title="Add camera"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {cameras.length === 0 ? (
              <p className="text-xs text-argus-500 text-center py-4">
                No cameras registered yet.
              </p>
            ) : (
              <div className="space-y-2">
                {cameras.map((cam) => (
                  <button
                    key={cam.id}
                    onClick={() => handleSelectCamera(cam)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-xl
                      transition-all duration-200 text-left cursor-pointer
                      ${
                        selectedCamera?.id === cam.id
                          ? "bg-argus-accent/10 border border-argus-accent/30"
                          : "bg-argus-800/40 border border-transparent hover:border-argus-700/50"
                      }
                    `}
                  >
                    <Camera
                      className={`w-4 h-4 ${
                        selectedCamera?.id === cam.id ? "text-argus-accent" : "text-argus-500"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-argus-200 truncate">{cam.name}</p>
                      <p className="text-[10px] text-argus-500 font-mono truncate">{cam.venue}</p>
                    </div>
                    <span
                      className={`ml-auto w-2 h-2 rounded-full flex-shrink-0 ${
                        cam.status === "online" ? "bg-severity-green" : "bg-argus-500"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Register New Camera Form — operators only */}
          {showNewCameraForm && !isAdmin && (
            <div className="glass-panel rounded-2xl p-5 animate-fade-in">
              <h3 className="text-sm font-semibold text-argus-200 mb-4">Add Camera</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-argus-500 mb-1 font-medium uppercase tracking-wider">
                    Camera Name
                  </label>
                  <input
                    type="text"
                    value={newCamera.name}
                    onChange={(e) => setNewCamera((c) => ({ ...c, name: e.target.value }))}
                    placeholder="e.g., North Gate Camera"
                    className="w-full px-3 py-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-200 text-sm placeholder:text-argus-600 focus:outline-none focus:border-argus-accent/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-argus-500 mb-1.5 font-medium uppercase tracking-wider">
                    Source Type
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-argus-700/50">
                    {["rtsp", "video"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setNewCamera((c) => ({ ...c, sourceType: t, rtspUrl: "" }))}
                        className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${
                          newCamera.sourceType === t
                            ? "bg-argus-accent/20 text-argus-accent"
                            : "bg-argus-800 text-argus-500 hover:text-argus-300"
                        }`}
                      >
                        {t === "rtsp" ? "RTSP Stream" : "Video File"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-argus-500 mb-1 font-medium uppercase tracking-wider">
                    {newCamera.sourceType === "rtsp" ? "RTSP URL" : "Video File Path"}
                  </label>
                  <input
                    type="text"
                    value={newCamera.rtspUrl}
                    onChange={(e) => setNewCamera((c) => ({ ...c, rtspUrl: e.target.value }))}
                    placeholder={
                      newCamera.sourceType === "rtsp"
                        ? "rtsp://192.168.1.x:554/stream"
                        : "videos/demo.mp4"
                    }
                    className="w-full px-3 py-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-200 text-sm font-mono placeholder:text-argus-600 focus:outline-none focus:border-argus-accent/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-argus-500 mb-1 font-medium uppercase tracking-wider">
                    Venue / Zone
                  </label>
                  <input
                    type="text"
                    value={newCamera.venue}
                    onChange={(e) => setNewCamera((c) => ({ ...c, venue: e.target.value }))}
                    placeholder="e.g., North Wing"
                    className="w-full px-3 py-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-200 text-sm placeholder:text-argus-600 focus:outline-none focus:border-argus-accent/50 transition-colors"
                  />
                </div>

                {registerError && (
                  <p className="text-[11px] text-severity-red">{registerError}</p>
                )}

                <button
                  onClick={handleRegister}
                  disabled={!newCamera.name || !newCamera.rtspUrl || !newCamera.venue}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-argus-accent/20 text-argus-accent border border-argus-accent/30 hover:bg-argus-accent/30 disabled:opacity-30 transition-colors text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
                >
                  {registerSuccess ? (
                    <><Check className="w-4 h-4" /> Registered!</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Register Camera</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Threshold Configuration */}
        <div className="lg:col-span-2">
          {selectedCamera ? (
            <div className="glass-panel rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-argus-200">
                    Threshold Configuration — {selectedCamera.name}
                  </h3>
                  <p className="text-xs text-argus-500 mt-0.5">
                    Set Warning (amber) and Critical (red) per zone cell
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-argus-700/50 text-argus-400 text-xs font-medium hover:bg-argus-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      saved
                        ? "bg-severity-green/20 text-severity-green border border-severity-green/30"
                        : "bg-argus-accent/20 text-argus-accent border border-argus-accent/30 hover:bg-argus-accent/30"
                    }`}
                  >
                    {saved ? (
                      <><Check className="w-3.5 h-3.5" /> Saved!</>
                    ) : (
                      <><Save className="w-3.5 h-3.5" /> Apply Thresholds</>
                    )}
                  </button>
                </div>
              </div>

              {/* 3×3 Grid */}
              <div className="grid grid-cols-3 gap-3">
                {thresholds.map((threshold, cellIndex) => (
                  <div
                    key={cellIndex}
                    className="bg-argus-800/60 rounded-xl p-4 border border-argus-700/30"
                  >
                    <p className="text-[11px] font-semibold text-argus-300 mb-3">
                      {CELL_LABELS[cellIndex]}
                    </p>
                    <div className="space-y-2">
                      <div>
                        <label className="flex items-center gap-1 text-[10px] text-severity-amber mb-1 font-medium">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Warning
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={threshold.warning}
                          onChange={(e) => updateThreshold(cellIndex, "warning", e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-argus-900 border border-argus-700/50 text-argus-200 text-sm font-mono focus:outline-none focus:border-severity-amber/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-[10px] text-severity-red mb-1 font-medium">
                          <AlertOctagon className="w-2.5 h-2.5" />
                          Critical
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={threshold.critical}
                          onChange={(e) => updateThreshold(cellIndex, "critical", e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-argus-900 border border-argus-700/50 text-argus-200 text-sm font-mono focus:outline-none focus:border-severity-red/50 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 px-4 py-3 rounded-xl bg-argus-accent/5 border border-argus-accent/10">
                <p className="text-[11px] text-argus-400">
                  <span className="font-semibold text-argus-300">Current defaults:</span>{" "}
                  Warning at{" "}
                  <span className="font-mono text-severity-amber">
                    {selectedCamera.thresholds[0]?.warning ?? "—"}
                  </span>{" "}
                  persons/cell · Critical at{" "}
                  <span className="font-mono text-severity-red">
                    {selectedCamera.thresholds[0]?.critical ?? "—"}
                  </span>{" "}
                  persons/cell. Changes apply immediately — no restart required.
                </p>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-12 flex items-center justify-center">
              <p className="text-sm text-argus-500">Select a camera to configure thresholds</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
