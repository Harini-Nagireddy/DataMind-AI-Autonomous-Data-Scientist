import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Database,
  RefreshCw,
  Table
} from "lucide-react";
import { parseFile, ParsedDataResult } from "../utils/parser";
import { SAMPLE_DATASETS, SampleDatasetInfo } from "../utils/sampleData";

interface UploadSectionProps {
  onDatasetParsed: (data: ParsedDataResult) => void;
  onLoadSample: (sample: SampleDatasetInfo) => void;
  isProcessing?: boolean;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onDatasetParsed,
  onLoadSample,
  isProcessing = false,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processSelectedFile = async (file: File) => {
    setErrorMsg(null);
    setLoadingMsg(`Parsing ${file.name}...`);

    try {
      const parsed = await parseFile(file);
      setLoadingMsg(null);
      onDatasetParsed(parsed);
    } catch (err: any) {
      setLoadingMsg(null);
      setErrorMsg(err.message || "Failed to parse file. Please check file format and contents.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-10">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
          Upload Dataset for Autonomous Science
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          Upload your raw tabular dataset in CSV, Excel (.xlsx, .xls) format. DataMind AI will inspect its schema, assess quality, and prepare it for modeling.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 md:p-14 text-center cursor-pointer transition-all ${
          dragActive
            ? "border-cyan-400 bg-cyan-950/20 scale-[1.01]"
            : "border-slate-700/80 bg-slate-900/40 hover:border-indigo-500/60 hover:bg-slate-900/70"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
            {loadingMsg || isProcessing ? (
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            ) : (
              <UploadCloud className="w-8 h-8 text-indigo-400" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-base font-semibold text-white">
              {loadingMsg ? loadingMsg : "Click to select or drag and drop your file here"}
            </p>
            <p className="text-xs text-slate-400">
              Supports CSV, XLSX, and XLS &bull; Max 50 MB &bull; Entirely processed locally in session
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <span className="text-[11px] px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
              .csv
            </span>
            <span className="text-[11px] px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
              .xlsx
            </span>
            <span className="text-[11px] px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
              .xls
            </span>
          </div>
        </div>
      </div>

      {/* Error display */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 flex items-start gap-3 text-red-300 text-xs animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-red-200">Upload Validation Error</p>
            <p className="text-slate-300">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Quick 1-click sample datasets */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Instant Test Datasets
          </span>
          <span className="text-xs text-slate-400">Test the entire ML &amp; EDA stack immediately</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SAMPLE_DATASETS.map((sample) => (
            <button
              key={sample.id}
              onClick={() => onLoadSample(sample)}
              className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-indigo-500/40 hover:bg-slate-850 text-left transition-all group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                  {sample.category}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {sample.rowCount} x {sample.colCount}
                </span>
              </div>
              <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">
                {sample.name}
              </h4>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                {sample.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
