import { useMemo } from "react";

const CELL_LABELS = [
  "TL", "TC", "TR",
  "ML", "MC", "MR",
  "BL", "BC", "BR",
];

/**
 * 3×3 heatmap grid showing per-cell occupancy counts with
 * severity-based colour transitions.
 *
 * @param {{ cells: Array<{ cellIndex: number, count: number, severity: string }> }} props
 */
export default function HeatmapGrid({ cells = [], compact = false }) {
  const gridCells = useMemo(() => {
    const cellMap = Array.from({ length: 9 }, (_, i) => ({
      cellIndex: i,
      count: 0,
      severity: "green",
    }));

    cells.forEach((cell) => {
      if (cell.cellIndex >= 0 && cell.cellIndex < 9) {
        cellMap[cell.cellIndex] = cell;
      }
    });

    return cellMap;
  }, [cells]);

  return (
    <div
      className={`grid grid-cols-3 gap-1 ${compact ? "w-full" : "w-full max-w-[280px]"}`}
    >
      {gridCells.map((cell) => (
        <div
          key={cell.cellIndex}
          className={`
            relative flex flex-col items-center justify-center rounded-lg
            transition-all duration-500 ease-out
            ${compact ? "h-10" : "h-14"}
            ${
              cell.severity === "critical"
                ? "heatmap-red"
                : cell.severity === "warning"
                ? "heatmap-amber"
                : "heatmap-green"
            }
          `}
        >
          <span
            className={`
              font-bold font-mono
              ${compact ? "text-sm" : "text-lg"}
              ${
                cell.severity === "critical"
                  ? "text-severity-red"
                  : cell.severity === "warning"
                  ? "text-severity-amber"
                  : "text-severity-green"
              }
            `}
          >
            {cell.count}
          </span>
          {!compact && (
            <span className="text-[9px] text-argus-400 font-mono mt-0.5">
              {CELL_LABELS[cell.cellIndex]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
