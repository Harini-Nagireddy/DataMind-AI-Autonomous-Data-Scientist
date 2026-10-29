import React from "react";
import { DatasetSession } from "../types";
import {
  FileDown,
  Download,
  Printer,
  FileCode,
  CheckCircle2,
  Share2,
  ShieldCheck
} from "lucide-react";
import {
  downloadHtmlReport,
  downloadJsonSession,
  generateHtmlReport
} from "../utils/exportReport";
interface ReportViewProps {
  session: DatasetSession;
}

export const ReportView: React.FC<ReportViewProps> = ({ session }) => {
  const { fileName } = session;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Autonomous Science Reports &amp; Exports</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-mono border border-indigo-500/25">
              Multi-Format
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Export the complete analysis report and, for advanced users, the machine-readable session data.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print PDF</span>
          </button>

          <button
            onClick={() => downloadHtmlReport(session)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download HTML Report</span>
          </button>
        </div>
      </div>

      {/* Export Cards Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-indigo-500/40 transition-all flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <FileDown className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Standalone HTML Report</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Comprehensive report containing dataset summary, data quality, cleaning audit, EDA findings, dashboard insights, model evaluations, and explainability results.
            </p>
          </div>
          <button
            onClick={() => downloadHtmlReport(session)}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-2"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export HTML File</span>
          </button>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-purple-500/40 transition-all flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Advanced Session JSON</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">Technical</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Optional machine-readable export containing the analysis session, dataset metadata, statistics, correlations, and AutoML results for reproducibility or technical use.
            </p>
          </div>
          <button
            onClick={() => downloadJsonSession(session)}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-2"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Export Session JSON</span>
          </button>
        </div>
      </div>

      {/* Live Preview Box of HTML Report */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200">Interactive Report Document Preview</h2>
          <span className="text-xs text-slate-400 font-mono">Dataset: {fileName}</span>
        </div>

        <div className="w-full h-[500px] border border-slate-800 rounded-xl overflow-hidden bg-white">
          <iframe
            srcDoc={generateHtmlReport(session)}
            title="Report Preview"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
};
