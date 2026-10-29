import React, { useState } from "react";
import { DatasetSession } from "../types";

import {
  Wand2,
  Download,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";

import {
  CleaningOptions,
  DEFAULT_CLEANING_OPTIONS,
  cleanDataset,
  downloadDatasetAsCsv,
} from "../utils/cleaner";

import { profileDataset } from "../utils/profiler";

interface DataCleaningViewProps {
  session: DatasetSession;

  onUpdateCleanedData: (
    cleanedRows: Record<string, any>[],
    cleanedColumns: string[],
    newLogs: any[],
    newProfiles: any[],
    newQualityReport: any
  ) => void;

  onNavigateNext: () => void;
}

export const DataCleaningView: React.FC<
  DataCleaningViewProps
> = ({
  session,
  onUpdateCleanedData,
  onNavigateNext,
}) => {
  const [options, setOptions] =
    useState<CleaningOptions>(
      DEFAULT_CLEANING_OPTIONS
    );

  const [isCleaning, setIsCleaning] =
    useState(false);

  const [cleanSuccess, setCleanSuccess] =
    useState(false);

  const {
    rawRows,
    columns,
    columnProfiles,
    cleanedRows,
    cleaningLogs,
  } = session;

  // ============================================================
  // RUN CLEANING PIPELINE
  // ============================================================
  const handleRunCleaning = () => {
    setIsCleaning(true);
    setCleanSuccess(false);

    setTimeout(() => {
      try {
        const {
          cleanedRows: newCleanRows,
          cleanedColumns: newCleanCols,
          logs,
        } = cleanDataset(
          rawRows,
          columns,
          columnProfiles,
          options
        );

        // Re-profile the cleaned dataset so that
        // Data Quality receives fresh statistics.
        const {
          columnProfiles: newProfiles,
          qualityReport: newQuality,
        } = profileDataset(
          newCleanCols,
          newCleanRows
        );

        onUpdateCleanedData(
          newCleanRows,
          newCleanCols,
          logs,
          newProfiles,
          newQuality
        );

        setIsCleaning(false);
        setCleanSuccess(true);
      } catch (error) {
        console.error(
          "Data cleaning failed:",
          error
        );

        setIsCleaning(false);
        setCleanSuccess(false);
      }
    }, 300);
  };

  // ============================================================
  // DOWNLOAD CLEANED DATASET
  // ============================================================
  const handleDownload = () => {
    downloadDatasetAsCsv(
      cleanedRows,
      `cleaned_${session.fileName.replace(
        /\.[^/.]+$/,
        ""
      )}.csv`
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ======================================================
          HEADER
      ======================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Automated Data Cleaning Pipeline
            </h1>

            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono border border-emerald-500/25">
              Production Standard
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-1">
            Configure automated rules, execute
            non-destructive imputation, and track every
            transformation in an audit log.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Download */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download Cleaned CSV</span>
          </button>

          {/* Next */}
          <button
            onClick={onNavigateNext}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
          >
            <span>Proceed to Dynamic EDA</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ======================================================
          CLEANING CONFIGURATION
      ======================================================= */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">

        {/* Configuration Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-cyan-400" />
              <span>
                Pipeline Configuration Settings
              </span>
            </h2>

            <p className="text-xs text-slate-400">
              Select which autonomous sanitization and
              imputation steps to apply.
            </p>
          </div>

          <button
            onClick={() =>
              setOptions(
                DEFAULT_CLEANING_OPTIONS
              )
            }
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>

        {/* ==================================================
            CONFIGURATION CARDS
        =================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">

          {/* ------------------------------------------------
              DUPLICATES
          ------------------------------------------------- */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                Remove Duplicate Rows
              </span>

              <input
                type="checkbox"
                checked={
                  options.removeDuplicates
                }
                onChange={(e) =>
                  setOptions({
                    ...options,
                    removeDuplicates:
                      e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
            </div>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Detects and deletes completely identical
              row vectors to avoid sample bias.
            </p>
          </div>

          {/* ------------------------------------------------
              NUMERICAL IMPUTATION
          ------------------------------------------------- */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                Numerical Imputation
              </span>

              <select
                value={
                  options.imputeNumerical
                }
                onChange={(e) =>
                  setOptions({
                    ...options,
                    imputeNumerical:
                      e.target.value as
                        | "median"
                        | "mean"
                        | "zero"
                        | "none",
                  })
                }
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
              >
                <option value="median">
                  Median (Robust)
                </option>

                <option value="mean">
                  Mean (Average)
                </option>

                <option value="zero">
                  Zero (0)
                </option>

                <option value="none">
                  None (Keep)
                </option>
              </select>
            </div>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Fills missing continuous numeric cells
              using the column&apos;s statistical center.
            </p>
          </div>

          {/* ------------------------------------------------
              CATEGORICAL IMPUTATION
          ------------------------------------------------- */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                Categorical Imputation
              </span>

              <select
                value={
                  options.imputeCategorical
                }
                onChange={(e) =>
                  setOptions({
                    ...options,
                    imputeCategorical:
                      e.target.value as
                        | "mode"
                        | "missing_tag"
                        | "none",
                  })
                }
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
              >
                <option value="missing_tag">
                  Tag as &apos;Missing&apos;
                </option>

                <option value="mode">
                  Mode (Most Frequent)
                </option>

                <option value="none">
                  None (Keep)
                </option>
              </select>
            </div>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Fills missing text labels with explicit
              categorization or highest frequency label.
            </p>
          </div>

          {/* ------------------------------------------------
              CONSTANT COLUMNS
          ------------------------------------------------- */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                Drop Constant Columns
              </span>

              <input
                type="checkbox"
                checked={
                  options.dropConstantColumns
                }
                onChange={(e) =>
                  setOptions({
                    ...options,
                    dropConstantColumns:
                      e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
            </div>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Removes features with single distinct
              values carrying zero information variance.
            </p>
          </div>

          {/* ------------------------------------------------
              TRIM STRINGS
          ------------------------------------------------- */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                Trim String Whitespace
              </span>

              <input
                type="checkbox"
                checked={options.trimStrings}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    trimStrings:
                      e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
            </div>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Strips invisible leading and trailing
              whitespace to eliminate duplicate categories.
            </p>
          </div>

          {/* ------------------------------------------------
              OUTLIERS
          ------------------------------------------------- */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">

            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                Filter Tukey IQR Outliers
              </span>

              <input
                type="checkbox"
                checked={
                  options.removeOutliers
                }
                onChange={(e) =>
                  setOptions({
                    ...options,
                    removeOutliers:
                      e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
            </div>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Removes values outside the standard
              <strong className="text-slate-300">
                {" "}1.5x IQR Tukey fences
              </strong>
              {" "}for consistent statistical outlier
              handling.
            </p>

            <div className="pt-1 text-[10px] text-purple-300">
              Lower Fence = Q1 − 1.5 × IQR
              <br />
              Upper Fence = Q3 + 1.5 × IQR
            </div>
          </div>
        </div>

        {/* ==================================================
            EXECUTION AREA
        =================================================== */}
        <div className="flex items-center justify-between pt-2">

          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />

            <span>
              Non-destructive: original dataset is always
              preserved in memory.
            </span>
          </div>

          <button
            onClick={handleRunCleaning}
            disabled={isCleaning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
          >
            <Wand2
              className={`w-4 h-4 ${
                isCleaning
                  ? "animate-spin"
                  : ""
              }`}
            />

            <span>
              {isCleaning
                ? "Applying Rules..."
                : "Execute Cleaning Pipeline"}
            </span>
          </button>
        </div>
      </div>

      {/* ======================================================
          SUCCESS NOTIFICATION
      ======================================================= */}
      {cleanSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between text-xs text-emerald-300 animate-in fade-in duration-200">

          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />

            <span className="font-semibold text-emerald-200">
              Cleaning pipeline executed successfully.
            </span>

            <span>
              Dataset updated to{" "}
              {cleanedRows.length.toLocaleString()}{" "}
              clean records.
            </span>
          </div>

          <button
            onClick={handleDownload}
            className="underline font-semibold hover:text-white"
          >
            Export Cleaned CSV
          </button>
        </div>
      )}

      {/* ======================================================
          AUDIT LOG
      ======================================================= */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-4">

        <div className="flex items-center justify-between px-2">

          <div>
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-cyan-400" />

              <span>
                Transformation &amp; Decision Audit Log
              </span>
            </h2>

            <p className="text-xs text-slate-400">
              Deterministic log of every modification
              made during data preprocessing.
            </p>
          </div>

          <span className="text-xs text-slate-400 font-mono">
            {cleaningLogs.length} entries
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">

          <table className="w-full text-left text-xs text-slate-300">

            <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold border-b border-slate-800">

              <tr>
                <th className="py-2.5 px-3">
                  Time
                </th>

                <th className="py-2.5 px-3">
                  Operation
                </th>

                <th className="py-2.5 px-3">
                  Target Column
                </th>

                <th className="py-2.5 px-3">
                  Before State
                </th>

                <th className="py-2.5 px-3">
                  After State
                </th>

                <th className="py-2.5 px-3">
                  Impact / Affected
                </th>

                <th className="py-2.5 px-3">
                  Methodological Reason
                </th>
              </tr>

            </thead>

            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">

              {cleaningLogs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-800/40"
                >
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                    {log.timestamp}
                  </td>

                  <td className="py-2.5 px-3 font-semibold text-slate-200">
                    {log.operation}
                  </td>

                  <td className="py-2.5 px-3 font-mono text-[11px] text-cyan-300">
                    {log.column}
                  </td>

                  <td className="py-2.5 px-3 text-slate-400">
                    {log.before}
                  </td>

                  <td className="py-2.5 px-3 text-emerald-300 font-medium">
                    {log.after}
                  </td>

                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {log.affectedCount} records
                  </td>

                  <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-xs">
                    {log.reason}
                  </td>
                </tr>
              ))}

            </tbody>

          </table>
        </div>
      </div>
    </div>
  );
};