import React from "react";
import { ActiveTab, DatasetSession } from "../types";
import {
  LogOut,
  Database,
  BarChart3,
  Sparkles,
  Download,
  PlusCircle,
  FileText,
  Activity,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface HeaderProps {
  authUser?: { name: string; email: string };
  onLogout?: () => void;
  currentTab: ActiveTab;
  session: DatasetSession | null;
  onNewSession: () => void;
  onExportReport: () => void;
  onTabChange: (tab: ActiveTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  session,
  onNewSession,
  onExportReport,
  onTabChange,
  authUser,
  onLogout,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand logo & Session Info */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onTabChange(session ? "overview" : "landing")}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/35 transition-all">
            <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-white text-base">DataMind</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">
                AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Autonomous Data Scientist</p>
          </div>
        </button>

        {session && (
          <div className="hidden md:flex items-center gap-3 pl-4 ml-4 border-l border-slate-800">
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-md border border-slate-700/60 text-xs">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-medium text-slate-200 truncate max-w-[200px]" title={session.fileName}>
                {session.fileName}
              </span>
              <span className="text-slate-400 text-[11px]">
                ({session.totalRows.toLocaleString()} rows &bull; {session.columns.length} cols)
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Session Active</span>
            </div>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {session && (
          <>
            <button
              onClick={() => onTabChange("dashboard")}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentTab === "dashboard"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Smart Dashboard</span>
            </button>

            <button
              onClick={onExportReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
              title="Download Full Report"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export Report</span>
            </button>
          </>
        )}

        <button
          onClick={onNewSession}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-md shadow-indigo-600/25 transition-all"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>{session ? "New Dataset" : "Upload Dataset"}</span>
        </button>

        {authUser && (
          <div className="hidden lg:flex items-center gap-2 pl-2 ml-1 border-l border-slate-800">
            <div className="text-right leading-tight">
              <p className="text-xs font-semibold text-slate-200">{authUser.name}</p>
              <p className="text-[10px] text-slate-500 max-w-[150px] truncate">{authUser.email}</p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" title="Log out" aria-label="Log out">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
