import React from "react";
import { ActiveTab, DatasetSession } from "../types";
import {
  LayoutDashboard,
  ShieldCheck,
  Wand2,
  BarChart2,
  Cpu,
  Target,
  FileCheck,
  Lightbulb,
  SlidersHorizontal,
  BotMessageSquare,
  FileDown,
  UploadCloud,
  Home,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";

interface SidebarProps {
  currentTab: ActiveTab;
  session: DatasetSession | null;
  onTabChange: (tab: ActiveTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, session, onTabChange }) => {
  const navItems = [
    {
      id: "overview" as ActiveTab,
      label: "Dataset Overview",
      icon: LayoutDashboard,
      badge: session ? `${session.columns.length} cols` : null,
      disabled: !session,
    },
    {
      id: "quality" as ActiveTab,
      label: "Data Quality",
      icon: ShieldCheck,
      badge: session ? `${session.qualityReport.qualityScore}%` : null,
      badgeColor: session
        ? session.qualityReport.qualityScore >= 80
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : undefined,
      disabled: !session,
    },
    {
      id: "cleaning" as ActiveTab,
      label: "Data Cleaning",
      icon: Wand2,
      badge: session && session.cleaningLogs.length > 0 ? `${session.cleaningLogs.length}` : null,
      disabled: !session,
    },
    {
      id: "eda" as ActiveTab,
      label: "Exploratory EDA",
      icon: BarChart2,
      badge: null,
      disabled: !session,
    },
    {
      id: "dashboard" as ActiveTab,
      label: "Smart Dashboard",
      icon: SlidersHorizontal,
      badge: "Dynamic",
      badgeColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      disabled: !session,
    },
    {
      id: "automl" as ActiveTab,
      label: "AutoML Engine",
      icon: Cpu,
      badge: session?.automlSummary ? `${session.automlSummary.models.length} models` : "Ready",
      badgeColor: session?.automlSummary ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : undefined,
      disabled: !session,
    },
    {
      id: "evaluation" as ActiveTab,
      label: "Model Evaluation",
      icon: Target,
      badge: session?.automlSummary ? "Active" : null,
      disabled: !session,
    },
    {
      id: "explainability" as ActiveTab,
      label: "Explainability",
      icon: FileCheck,
      badge: null,
      disabled: !session,
    },
    {
      id: "insights" as ActiveTab,
      label: "AI Insights",
      icon: Lightbulb,
      badge: "Gemini",
      badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      disabled: !session,
    },
    {
      id: "assistant" as ActiveTab,
      label: "AI Data Assistant",
      icon: BotMessageSquare,
      badge: "Chat",
      disabled: !session,
    },
    {
      id: "report" as ActiveTab,
      label: "Analysis Reports",
      icon: FileDown,
      badge: null,
      disabled: !session,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/60 backdrop-blur-sm flex flex-col justify-between p-4 shrink-0 h-[calc(100vh-4rem)] sticky top-16 select-none">
      <div className="space-y-6 overflow-y-auto pr-1">
        {/* Quick Mode Switch */}
        <div className="space-y-1">
          <button
            onClick={() => onTabChange("landing")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === "landing"
                ? "bg-slate-800 text-white font-semibold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Home className="w-4 h-4 text-slate-400" />
            <span>Platform Home</span>
          </button>

          <button
            onClick={() => onTabChange("upload")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === "upload"
                ? "bg-indigo-600/30 text-indigo-300 font-semibold border border-indigo-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <UploadCloud className="w-4 h-4 text-indigo-400" />
            <span>Dataset Uploader</span>
          </button>
        </div>

        {/* Workflow Steps Section */}
        <div>
          <div className="px-3 mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <span>Analysis Workflow</span>
            {session && <span className="text-emerald-400 font-normal">Active</span>}
          </div>

          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              const isDisabled = item.disabled;

              return (
                <button
                  key={item.id}
                  disabled={isDisabled}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isDisabled
                      ? "opacity-35 cursor-not-allowed text-slate-400"
                      : isActive
                      ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-semibold shadow-md shadow-indigo-600/20"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                        item.badgeColor ||
                        (isActive
                          ? "bg-indigo-900/60 text-indigo-200 border-indigo-400/40"
                          : "bg-slate-800 text-slate-300 border-slate-700")
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer / Status Card */}
      {session && (
        <div className="pt-4 mt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Target Problem:</span>
              <span className="font-medium text-slate-200 text-[11px] truncate max-w-[110px]">
                {session.problemDetection.hasTarget ? session.problemDetection.targetColumn : "None"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Task Mode:</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-semibold uppercase">
                {session.problemDetection.taskType}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
