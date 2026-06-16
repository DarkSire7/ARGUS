import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * Custom tooltip for the occupancy chart.
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="glass-panel rounded-xl px-4 py-3 border border-argus-700/50 shadow-2xl">
      <p className="text-[10px] font-mono text-argus-400 mb-2">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-argus-300">{entry.name}:</span>
          <span className="font-bold text-argus-100">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Occupancy trend chart showing live camera metrics over time.
 *
 * @param {{ history: Array<{ time: string, [cameraId: string]: number }>, cameras: Array<{ cameraId: string, cameraName: string }> }} props
 */
export default function OccupancyChart({ history = [], cameras = [] }) {
  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"];

  if (history.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 flex items-center justify-center h-[250px]">
        <p className="text-xs text-argus-500">Collecting data...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-argus-200 mb-4">
        Occupancy Trends
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            {cameras.map((cam, idx) => (
              <linearGradient
                key={cam.cameraId}
                id={`gradient-${cam.cameraId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={COLORS[idx % COLORS.length]}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={COLORS[idx % COLORS.length]}
                  stopOpacity={0}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(58, 58, 92, 0.3)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: "#5a5a80" }}
            axisLine={{ stroke: "rgba(58, 58, 92, 0.3)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#5a5a80" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {cameras.map((cam, idx) => (
            <Area
              key={cam.cameraId}
              type="monotone"
              dataKey={cam.cameraId}
              name={cam.cameraName}
              stroke={COLORS[idx % COLORS.length]}
              fill={`url(#gradient-${cam.cameraId})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
