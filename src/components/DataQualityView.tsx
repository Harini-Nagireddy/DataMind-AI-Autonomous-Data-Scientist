import React from "react";
import { DatasetSession } from "../types";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  ArrowRight,
  Copy,
  Layers,
  Wand2,
  TrendingDown,
  Sparkles
} from "lucide-react";

interface DataQualityViewProps {
  session: DatasetSession;
  onNavigateToCleaning: () => void;
}

export const DataQualityView: React.FC<DataQualityViewProps> = ({ session, onNavigateToCleaning }) => {
  const { qualityReport } = session;
  const { qualityScore, totalMissingCells, missingRate, duplicateRows, duplicateRate, constantColumns, columnsWithOutliers, outlierCount, issues } = qualityReport;

  const scoreColor =
    qualityScore >= 80 ? "text-emerald-400" : qualityScore >= 60 ? "text-amber-400" : "text-rose-400";
  const scoreBg =
    qualityScore >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : qualityScore >= 60 ? "bg-amber-500/10 border-amber-500/20" : "bg-rose-500/10 border-rose-500/20";
  const scoreLabel =
    qualityScore >= 85 ? "Excellent Production Grade" : qualityScore >= 70 ? "Good — Minor Cleanups Recommended" : "Needs Preprocessing & Imputation";

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Data Quality &amp; Integrity Audit</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
              Deterministic Math
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Calculated assessment of missing cells, duplicate records, statistical outliers, and structural defects.
          </p>
        </div>

        <button
          onClick={onNavigateToCleaning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-md shadow-indigo-600/25 transition-all self-start sm:self-auto"
        >
          <Wand2 className="w-4 h-4" />
          <span>Launch Automated Data Cleaning</span>
        </button>
      </div>

      {/* Main Quality Gauge Card */}
      <div className={`p-6 rounded-2xl border ${scoreBg} flex flex-col md:flex-row items-center justify-between gap-6`}>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center shrink-0">
            <span className={`text-3xl font-extrabold ${scoreColor}`}>{qualityScore}</span>
            <span className="text-[10px] text-slate-400 font-semibold uppercase">/ 100</span>
          </div>

          <div className="space-y-1 text-left">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Composite Quality Rating</span>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${scoreColor} bg-slate-900 border border-slate-800`}>
                {scoreLabel}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">
              {issues.length === 0 ? "Zero Critical Defects Found" : `${issues.length} Identified Data Integrity Anomalies`}
            </h2>
            <p className="text-xs text-slate-300 max-w-xl">
              Quality score penalized based on missing cell ratio, duplicate row percentage, constant zero-variance features, and extreme distribution anomalies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">Total Cells Audited</div>
            <div className="text-base font-mono font-bold text-white">
              {qualityReport.totalCells.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Missing Cells</span>
            <span className="text-amber-400 font-semibold">{missingRate}%</span>
          </div>
          <div className="text-2xl font-bold text-white">{totalMissingCells.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">
            across {qualityReport.columnsWithMissing.length} attributes
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Duplicate Records</span>
            <span className="text-rose-400 font-semibold">{duplicateRate}%</span>
          </div>
          <div className="text-2xl font-bold text-white">{duplicateRows.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">identical row vectors</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Tukey Outliers</span>
            <span className="text-purple-400 font-semibold">1.5x IQR</span>
          </div>
          <div className="text-2xl font-bold text-white">{outlierCount.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">in {columnsWithOutliers.length} continuous numerical columns</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Constant Columns</span>
            <span className="text-slate-400 font-semibold">Zero Variance</span>
          </div>
          <div className="text-2xl font-bold text-white">{constantColumns.length}</div>
          <div className="text-[11px] text-slate-400">safe to prune for ML</div>
        </div>
      </div>

      {/* Issues & Recommendations Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-4">
        <div className="flex items-center justify-between px-2">
          <div>
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <span>Identified Quality Issues &amp; Recommended Actions</span>
            </h2>
            <p className="text-xs text-slate-400">Concrete steps to elevate dataset integrity</p>
          </div>
          <span className="text-xs text-slate-400 font-mono">{issues.length} issues detected</span>
        </div>

        {issues.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-2">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-white">No Critical Quality Issues Detected</p>
            <p className="text-xs text-slate-400">
              Your dataset is well-formatted, contains zero missing entries, and has no constant columns.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {issue.severity === "high" ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        High Severity
                      </span>
                    ) : issue.severity === "medium" ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Medium
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        Notice
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                      <span>{issue.message}</span>
                      {issue.column && (
                        <span className="font-mono text-[11px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {issue.column}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400">{issue.description}</p>
                    <div className="flex items-center gap-1.5 text-xs text-indigo-300 pt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>{issue.recommendation}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800/60">
                  <span className="text-[10px] text-slate-400 uppercase block">Impact Penalty</span>
                  <span className="text-xs font-mono font-bold text-amber-400">-{issue.impactScore} pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
