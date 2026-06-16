import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Settings,
  Activity,
  Shield,
  Wifi,
  WifiOff,
  Bell,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/incidents", icon: FileText, label: "Incident Log" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/health", icon: Activity, label: "System Health" },
];

export default function Layout({ connected, alertCount }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`
          glass-panel flex flex-col border-r border-argus-700/50
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? "w-[72px]" : "w-[240px]"}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-argus-700/50">
          <div className="relative flex-shrink-0">
            <Shield className="w-8 h-8 text-argus-accent" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-severity-green rounded-full animate-glow" />
          </div>
          {!sidebarCollapsed && (
            <div className="animate-fade-in">
              <h1 className="text-lg font-bold tracking-wider text-white">
                ARGUS
              </h1>
              <p className="text-[10px] font-mono text-argus-400 -mt-1 tracking-widest">
                SURVEILLANCE
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
            const isActive =
              to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl
                  transition-all duration-200 group relative
                  ${
                    isActive
                      ? "bg-argus-accent/10 text-argus-accent border border-argus-accent/20"
                      : "text-argus-400 hover:text-argus-200 hover:bg-argus-700/30 border border-transparent"
                  }
                `}
              >
                <Icon
                  className={`w-5 h-5 flex-shrink-0 ${
                    isActive ? "text-argus-accent" : "text-argus-400 group-hover:text-argus-200"
                  }`}
                />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{label}</span>
                )}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-argus-800 text-argus-200 text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-argus-700">
                    {label}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center justify-center h-12 border-t border-argus-700/50 text-argus-400 hover:text-argus-200 transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="glass-panel flex items-center justify-between h-16 px-6 border-b border-argus-700/50">
          <div>
            <h2 className="text-sm font-semibold text-argus-200 tracking-wide">
              {NAV_ITEMS.find(
                (item) =>
                  item.to === "/" 
                    ? location.pathname === "/" 
                    : location.pathname.startsWith(item.to)
              )?.label || "Dashboard"}
            </h2>
            <p className="text-xs text-argus-500 font-mono">
              Real-time Crowd Monitoring
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Alert Counter */}
            {alertCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg severity-badge-critical">
                <Bell className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">{alertCount} Active</span>
              </div>
            )}

            {/* Connection Status */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                connected
                  ? "severity-badge-green"
                  : "severity-badge-critical"
              }`}
            >
              {connected ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Disconnected</span>
                </>
              )}
            </div>

            {/* Operator Badge */}
            <div className="flex items-center gap-2 pl-4 border-l border-argus-700/50">
              <div className="w-8 h-8 rounded-lg bg-argus-accent/20 flex items-center justify-center">
                <span className="text-xs font-bold text-argus-accent">OP</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium text-argus-200">Operator</p>
                <p className="text-[10px] text-argus-500 font-mono">
                  session-001
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
