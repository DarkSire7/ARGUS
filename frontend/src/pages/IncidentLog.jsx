import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Download,
  Filter,
  AlertTriangle,
  AlertOctagon,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { RestAPI } from "../services/api";

const PAGE_SIZE = 15;

export default function IncidentLog() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    cameraId: "",
    severity: "",
    startDate: "",
    endDate: "",
  });
  const [page, setPage] = useState(1);

  // Fetch incidents
  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const activeFilters = {};
      if (filters.cameraId) activeFilters.cameraId = filters.cameraId;
      if (filters.severity) activeFilters.severity = filters.severity;
      if (filters.startDate) activeFilters.startDate = filters.startDate;
      if (filters.endDate) activeFilters.endDate = filters.endDate;

      const data = await RestAPI.getIncidents(activeFilters);
      setIncidents(data);
      setPage(1);
    } catch (err) {
      console.error("Failed to fetch incidents:", err);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Pagination
  const totalPages = Math.ceil(incidents.length / PAGE_SIZE);
  const pagedIncidents = incidents.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Export
  const handleExport = async () => {
    await RestAPI.exportIncidentsCSV(filters);
  };

  const formatDateTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const cellLabel = (index) => {
    const labels = ["TL", "TC", "TR", "ML", "MC", "MR", "BL", "BC", "BR"];
    return labels[index] || `C${index}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-argus-accent/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-argus-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-argus-100">
              Incident Log
            </h2>
            <p className="text-xs text-argus-500">
              {incidents.length} incidents recorded
            </p>
          </div>
        </div>

        <button
          id="export-csv-btn"
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-argus-accent/10 text-argus-accent border border-argus-accent/20 hover:bg-argus-accent/20 transition-colors text-sm font-medium cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-argus-400" />
          <h3 className="text-sm font-medium text-argus-300">Filters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Camera Filter */}
          <div>
            <label className="block text-[11px] text-argus-500 mb-1.5 font-medium uppercase tracking-wider">
              Camera
            </label>
            <select
              id="filter-camera"
              value={filters.cameraId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, cameraId: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-200 text-sm focus:outline-none focus:border-argus-accent/50 transition-colors"
            >
              <option value="">All Cameras</option>
              <option value="cam-001">Main Entrance Gate A</option>
              <option value="cam-002">Food Court Central</option>
              <option value="cam-003">Emergency Exit B7</option>
              <option value="cam-004">Parking Lot West</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-[11px] text-argus-500 mb-1.5 font-medium uppercase tracking-wider">
              Severity
            </label>
            <select
              id="filter-severity"
              value={filters.severity}
              onChange={(e) =>
                setFilters((f) => ({ ...f, severity: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-200 text-sm focus:outline-none focus:border-argus-accent/50 transition-colors"
            >
              <option value="">All Severities</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] text-argus-500 mb-1.5 font-medium uppercase tracking-wider">
              From Date
            </label>
            <input
              id="filter-start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, startDate: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-200 text-sm focus:outline-none focus:border-argus-accent/50 transition-colors"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] text-argus-500 mb-1.5 font-medium uppercase tracking-wider">
              To Date
            </label>
            <input
              id="filter-end-date"
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, endDate: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl bg-argus-800 border border-argus-700/50 text-argus-200 text-sm focus:outline-none focus:border-argus-accent/50 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-argus-700/50">
                {[
                  "Timestamp",
                  "Camera",
                  "Zone",
                  "Count",
                  "Threshold",
                  "Severity",
                  "Status",
                ].map((header) => (
                  <th
                    key={header}
                    className="px-5 py-3 text-left text-[10px] font-semibold text-argus-400 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-argus-500">
                      <Search className="w-4 h-4 animate-pulse" />
                      <span className="text-sm">Loading incidents...</span>
                    </div>
                  </td>
                </tr>
              ) : pagedIncidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <p className="text-sm text-argus-500">
                      No incidents match the current filters.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedIncidents.map((incident) => (
                  <tr
                    key={incident.id}
                    className="border-b border-argus-700/20 hover:bg-argus-800/40 transition-colors"
                  >
                    <td className="px-5 py-3 text-xs font-mono text-argus-300 whitespace-nowrap">
                      {formatDateTime(incident.timestamp)}
                    </td>
                    <td className="px-5 py-3">
                      <div>
                        <span className="text-xs text-argus-200">
                          {incident.cameraName}
                        </span>
                        <br />
                        <span className="text-[10px] text-argus-500 font-mono">
                          {incident.cameraId}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-1 rounded-md bg-argus-700/50 text-xs font-mono text-argus-300">
                        {cellLabel(incident.cellIndex)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm font-bold font-mono text-argus-100">
                      {incident.count}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-argus-400">
                      {incident.thresholdValue}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider severity-badge-${incident.severity}`}
                      >
                        {incident.severity === "critical" ? (
                          <AlertOctagon className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {incident.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {incident.acknowledged ? (
                        <span className="inline-flex items-center gap-1 text-severity-green text-[10px]">
                          <Check className="w-3 h-3" />
                          {incident.acknowledgedBy}
                        </span>
                      ) : (
                        <span className="text-argus-500 text-[10px]">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-argus-700/50">
            <span className="text-xs text-argus-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-argus-700/50 text-argus-400 hover:bg-argus-700 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-argus-700/50 text-argus-400 hover:bg-argus-700 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
