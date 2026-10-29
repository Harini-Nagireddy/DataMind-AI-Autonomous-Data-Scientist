import React from "react";
import {
  Sparkles,
  ArrowRight,
  Database,
  ShieldAlert,
  Cpu,
  LineChart,
  Lightbulb,
  FileCheck2,
  Sliders,
  CheckCircle,
  Zap,
  BarChart3,
  Bot
} from "lucide-react";
import { SAMPLE_DATASETS, SampleDatasetInfo } from "../utils/sampleData";

interface LandingPageProps {
  onStartUpload: () => void;
  onLoadSample: (sample: SampleDatasetInfo) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartUpload, onLoadSample }) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] p-6 md:p-12 max-w-6xl mx-auto space-y-16">
      {/* Hero Section */}
      <div className="text-center space-y-6 pt-6 pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-xs font-semibold tracking-wide uppercase">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          Autonomous AI-Powered Data Science Engine
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
          Turn Raw Data into <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-300 to-teal-300">Production Insights &amp; Trained ML</span>
        </h1>

        <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Upload any CSV or Excel dataset. DataMind AI autonomously audits quality, cleans anomalies, performs dynamic exploratory analysis, trains machine-learning models, and generates executive business intelligence.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            onClick={onStartUpload}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-xl shadow-indigo-600/30 transition-all hover:scale-[1.02]"
          >
            <span>Start Dataset Analysis</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Instant 1-Click Sample Datasets */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Or Explore with Real Sample Datasets (1-Click Load)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Pre-loaded with realistic multidimensional business records ready for instant profiling &amp; AutoML.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {SAMPLE_DATASETS.map((sample) => (
            <button
              key={sample.id}
              onClick={() => onLoadSample(sample)}
              className="text-left p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-indigo-500/50 hover:bg-slate-800/40 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                      {sample.category}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${sample.taskType === "regression" ? "bg-amber-500/15 text-amber-300 border-amber-500/25" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"}`}>
                      {sample.taskType === "regression" ? "Regression" : "Classification"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {sample.rowCount} rows &bull; {sample.colCount} cols
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                  {sample.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {sample.description}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-1 text-xs text-indigo-400 font-medium group-hover:translate-x-1 transition-transform">
                <span>Analyze this dataset</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Autonomous Workflow Explanation */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">The Autonomous Pipeline</h2>
          <p className="text-xs md:text-sm text-slate-400 max-w-xl mx-auto">
            From raw, messy records to verified predictive models and dynamic interactive intelligence in 5 transparent steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { step: "01", title: "Ingestion & Schema", desc: "CSV & Excel parsing, column type detection, identifier recognition." },
            { step: "02", title: "Quality Audit", desc: "Deduplication, Tukey's IQR outlier fences, null cell scoring." },
            { step: "03", title: "Dynamic EDA", desc: "Adaptive distributions, box plots, time-series, correlation matrices." },
            { step: "04", title: "AutoML & Evaluation", desc: "scikit-learn pipelines, stratified holdout, cross-validation, baselines, and multiple genuine algorithms." },
            { step: "05", title: "Insights & Reports", desc: "Gemini natural language business strategy and verified exportable reports." },
          ].map((item, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                {item.step}
              </span>
              <h3 className="text-xs font-bold text-slate-100">{item.title}</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Core Capability Cards */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Engineered for Any Tabular Domain</h2>
          <p className="text-xs md:text-sm text-slate-400">
            Works universally across customer, financial, marketing, HR, logistics, and operational datasets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Deterministic Data Quality</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              No guesswork. Calculates actual mathematical quality scores (0-100%), missing percentage ratios, duplicate counts, constant columns, and statistical anomalies.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-all">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Genuine AutoML Benchmarking</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Trains real classification and regression algorithms with scikit-learn pipelines, stratified holdout testing, cross-validation, baselines, and genuine evaluation metrics.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-all">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Grounded Gemini Insights</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generates executive summaries, key findings, and recommended operational next steps strictly based on the calculated figures, with zero numerical hallucinations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
