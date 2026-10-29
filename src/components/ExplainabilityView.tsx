import React from "react";
import { DatasetSession } from "../types";
import {
  FileCheck,
  Sparkles,
  ArrowRight,
  BarChart3,
  Lightbulb,
  Cpu,
  Layers,
  HelpCircle,
  TrendingUp,
  Sliders
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

interface ExplainabilityViewProps {
  session: DatasetSession;
  onNavigateToInsights: () => void;
}

export const ExplainabilityView: React.FC<ExplainabilityViewProps> = ({
  session,
  onNavigateToInsights,
}) => {
  const { automlSummary } = session;

  if (!automlSummary) {
    return (
      <div className="p-12 text-center space-y-4 max-w-xl mx-auto">
        <FileCheck className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">No Trained Models Available</h2>
        <p className="text-xs text-slate-400">
          Run AutoML to generate model feature importance and model explainability charts.
        </p>
      </div>
    );
  }

  const model = automlSummary.selectedModel;
  const importanceData = model.featureImportance.slice(0, 10);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Model Explainability &amp; Feature Importance</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-mono border border-purple-500/25">
              Model Feature Importance
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Feature importance is derived from the selected scikit-learn model. Importance indicates predictive contribution, not causation.
          </p>
        </div>

        <button
          onClick={onNavigateToInsights}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <span>Executive AI Insights</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Model Overview Summary */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">{model.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                Primary Model
              </span>
            </div>
            <p className="text-xs text-slate-400">{model.algorithm}</p>
          </div>
        </div>

        <div className="text-xs text-slate-300">
          Target Goal: <span className="font-mono text-cyan-300 font-bold">&apos;{automlSummary.targetColumn}&apos;</span> ({automlSummary.taskType})
        </div>
      </div>

      {/* Feature Importance Horizontal Chart */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span>Top Predictive Drivers (Normalized Model Importance %)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Higher percentage indicates greater model-derived predictive importance. This does not prove the feature causes the target.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">100% Normalized</span>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={importanceData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} opacity={0.5} />
              <XAxis type="number" stroke="#94a3b8" fontSize={11} domain={[0, "auto"]} unit="%" />
              <YAxis
                type="category"
                dataKey="feature"
                stroke="#cbd5e1"
                fontSize={11}
                tickLine={false}
                width={120}
              />
              <Tooltip
                formatter={(val: any) => [`${val}%`, "Model Importance"]}
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }}
              />
              <Bar dataKey="importance" fill="#6366f1" radius={[0, 4, 4, 0]}>
                {importanceData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? "#06b6d4" : index < 3 ? "#6366f1" : "#8b5cf6"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Narrative Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span>Driver Interpretation</span>
          </h3>
          {importanceData.length > 0 ? (
            <p className="text-xs text-slate-300 leading-relaxed">
              The single most influential feature is <strong>&apos;{importanceData[0].feature}&apos;</strong>, contributing{" "}
              <strong>{importanceData[0].importance}%</strong> of overall predictive weight. When analyzing{" "}
              &apos;{automlSummary.targetColumn}&apos;, operational changes in &apos;{importanceData[0].feature}&apos; will have the most significant leverage over outcomes.
            </p>
          ) : (
            <p className="text-xs text-slate-400">No feature importance data generated.</p>
          )}
          {importanceData.length > 1 && (
            <p className="text-xs text-slate-400 leading-relaxed pt-1">
              Secondary drivers include <strong>&apos;{importanceData[1].feature}&apos;</strong> ({importanceData[1].importance}%) and{" "}
              <strong>&apos;{importanceData[2]?.feature}&apos;</strong> ({importanceData[2]?.importance}%).
            </p>
          )}
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Model Transparency &amp; Complexity</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            This model was trained with strictly normalized inputs and evaluated on a held-out test partition. Low-variance ID fields and constant attributes were excluded beforehand to eliminate target leakage and reduce dimensional noise.
          </p>
        </div>
      </div>
    </div>
  );
};
