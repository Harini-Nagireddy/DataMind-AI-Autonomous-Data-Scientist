import React, { useState } from "react";
import { DatasetSession, ColumnProfile } from "../types";
import {
  Table,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Key,
  Search,
  ArrowRight,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";

interface DatasetOverviewProps {
  session: DatasetSession;
  onNavigateNext: () => void;
}

export const DatasetOverview: React.FC<DatasetOverviewProps> = ({ session, onNavigateNext }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [previewPage, setPreviewPage] = useState(0);
  const rowsPerPage = 15;

  const { rawRows, columns, columnProfiles, qualityReport, problemDetection } = session;

  const numCols = columnProfiles.filter((c) => c.dataType === "numerical" || c.dataType === "binary").length;
  const catCols = columnProfiles.filter((c) => c.dataType === "categorical" || c.dataType === "boolean").length;
  const dateCols = columnProfiles.filter((c) => c.dataType === "datetime").length;
  const idCols = columnProfiles.filter((c) => c.isPossibleId).length;

  // Search filter for preview
  const filteredRows = searchTerm
    ? rawRows.filter((r) =>
        Object.values(r).some((val) => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : rawRows;

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  const paginatedRows = filteredRows.slice(previewPage * rowsPerPage, (previewPage + 1) * rowsPerPage);

  const getTypeIcon = (dataType: ColumnProfile["dataType"]) => {
    switch (dataType) {
      case "numerical":
        return <Hash className="w-3.5 h-3.5 text-cyan-400" />;
      case "binary":
        return <ToggleLeft className="w-3.5 h-3.5 text-blue-400" />;
      case "categorical":
        return <Type className="w-3.5 h-3.5 text-indigo-400" />;
      case "datetime":
        return <Calendar className="w-3.5 h-3.5 text-emerald-400" />;
      case "boolean":
        return <ToggleLeft className="w-3.5 h-3.5 text-amber-400" />;
      case "id":
        return <Key className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Type className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top summary header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Dataset Understanding &amp; Schema</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
              {session.fileName}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated schema inference, attribute profiling, and target variable detection.
          </p>
        </div>

        <button
          onClick={onNavigateNext}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <span>Examine Data Quality</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Rows</p>
          <p className="text-2xl font-bold text-white mt-1">{session.totalRows.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-1">{session.isSampled ? "Full dataset" : "Records loaded"}</p>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Attributes</p>
          <p className="text-2xl font-bold text-white mt-1">{columns.length}</p>
          <p className="text-[10px] text-slate-400 mt-1">Columns detected</p>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Numerical</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">{numCols}</p>
          <p className="text-[10px] text-slate-400 mt-1">Continuous/discrete</p>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Categorical</p>
          <p className="text-2xl font-bold text-indigo-400 mt-1">{catCols}</p>
          <p className="text-[10px] text-slate-400 mt-1">Text &amp; discrete labels</p>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Quality Score</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              qualityReport.qualityScore >= 80
                ? "text-emerald-400"
                : qualityReport.qualityScore >= 60
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {qualityReport.qualityScore}%
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Audit rating</p>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Target Status</p>
          <p className="text-sm font-bold text-purple-300 mt-2 truncate">
            {problemDetection.hasTarget ? problemDetection.targetColumn : "None"}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-semibold text-purple-400">
            {problemDetection.hasTarget ? `${problemDetection.taskType}` : "EDA Mode"}
          </p>
        </div>
      </div>

      {/* Target variable suggestion callout */}
      {problemDetection.hasTarget && (
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                  AutoML Target Candidate Detected: &apos;{problemDetection.targetColumn}&apos;
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold uppercase">
                  {problemDetection.taskType} ({problemDetection.confidence}% confidence)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">{problemDetection.reason}</p>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Schema & Profiles Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden space-y-3 p-4">
        <div className="flex items-center justify-between px-2 pt-1">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Table className="w-4 h-4 text-cyan-400" />
            <span>Feature Schema &amp; Profiling Breakdown</span>
          </h2>
          <span className="text-xs text-slate-400">{columnProfiles.length} attributes profiled</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 text-slate-400 uppercase text-[11px] font-semibold border-y border-slate-800">
              <tr>
                <th className="py-3 px-4">Column Name</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Distinct Values</th>
                <th className="py-3 px-3">Missing</th>
                <th className="py-3 px-3">Summary Statistics / Top Values</th>
                <th className="py-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {columnProfiles.map((cp) => (
                <tr key={cp.name} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-white flex items-center gap-2">
                    <span>{cp.name}</span>
                    {cp.isPossibleId && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        ID
                      </span>
                    )}
                    {cp.isConstant && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                        Constant
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 text-[11px]">
                      {getTypeIcon(cp.dataType)}
                      <span className="capitalize">
                        {cp.isBinary || cp.dataType === "binary"
                          ? "Binary (0/1)"
                          : cp.isDiscrete && cp.dataType === "numerical"
                          ? "Discrete Num"
                          : cp.dataType}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">
                    <span className="font-semibold text-slate-200">{cp.uniqueCount.toLocaleString()}</span>
                    <span className="text-slate-400 text-[11px] ml-1">({cp.uniqueRate}%)</span>
                  </td>
                  <td className="py-3 px-3">
                    {cp.missingCount > 0 ? (
                      <span className="text-amber-400 font-medium">
                        {cp.missingCount} ({cp.missingRate}%)
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium">0%</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    {cp.isBinary || cp.dataType === "binary" ? (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span>
                          <strong className="text-slate-300">Binary:</strong> [0, 1]
                        </span>
                        {cp.mean !== undefined && (
                          <span>
                            <strong className="text-slate-300">Rate (1):</strong> {(cp.mean * 100).toFixed(1)}%
                          </span>
                        )}
                        {cp.topValues && cp.topValues.length > 0 && (
                          <span className="text-slate-400">
                            (0: {cp.topValues.find((t) => String(t.value) === "0")?.percentage ?? 0}%, 1: {cp.topValues.find((t) => String(t.value) === "1")?.percentage ?? 0}%)
                          </span>
                        )}
                      </div>
                    ) : cp.isDiscrete && cp.dataType === "numerical" ? (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span>
                          <strong className="text-slate-300">Levels:</strong> {cp.uniqueCount} distinct
                        </span>
                        {cp.median !== undefined && (
                          <span>
                            <strong className="text-slate-300">Med:</strong> {cp.median}
                          </span>
                        )}
                        <span>
                          <strong className="text-slate-300">Range:</strong> [{cp.min} - {cp.max}]
                        </span>
                      </div>
                    ) : cp.dataType === "numerical" && cp.mean !== undefined ? (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span>
                          <strong className="text-slate-300">Mean:</strong> {cp.mean}
                        </span>
                        <span>
                          <strong className="text-slate-300">Med:</strong> {cp.median}
                        </span>
                        <span>
                          <strong className="text-slate-300">Range:</strong> [{cp.min} - {cp.max}]
                        </span>
                        {cp.outlierCount !== undefined && cp.outlierCount > 0 && (
                          <span className="text-amber-400">
                            <strong>{cp.outlierCount}</strong> outliers
                          </span>
                        )}
                      </div>
                    ) : cp.topValues && cp.topValues.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {cp.topValues.slice(0, 2).map((tv) => (
                          <span key={tv.value} className="bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300">
                            &quot;{tv.value}&quot; ({tv.percentage}%)
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {cp.missingCount === 0 && !cp.isConstant ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Valid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Needs Review
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Data Preview Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2">
          <div>
            <h2 className="text-sm font-bold text-slate-200">Interactive Data Preview</h2>
            <p className="text-xs text-slate-400">Showing raw records as ingested into the session</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPreviewPage(0);
                }}
                placeholder="Search rows..."
                className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-44 sm:w-56"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs text-slate-300 font-mono">
            <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3 w-12 text-slate-400">#</th>
                {columns.map((col) => (
                  <th key={col} className="py-2.5 px-3 truncate max-w-[160px] font-sans">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {paginatedRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                    {previewPage * rowsPerPage + idx + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="py-2 px-3 truncate max-w-[200px]">
                      {row[col] === null || row[col] === undefined || row[col] === "" ? (
                        <span className="text-slate-400 italic">null</span>
                      ) : (
                        String(row[col])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-2 pt-1">
          <span>
            Showing {filteredRows.length === 0 ? 0 : previewPage * rowsPerPage + 1} to{" "}
            {Math.min((previewPage + 1) * rowsPerPage, filteredRows.length)} of {filteredRows.length} rows
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={previewPage === 0}
              onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700"
            >
              Previous
            </button>
            <span>
              Page {previewPage + 1} of {Math.max(1, totalPages)}
            </span>
            <button
              disabled={previewPage >= totalPages - 1}
              onClick={() => setPreviewPage((p) => p + 1)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
