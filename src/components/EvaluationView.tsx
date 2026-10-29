import React, { useState } from "react";
import { DatasetSession, MLModelResult } from "../types";
import {
  Target,
  BarChart2,
  TrendingUp,
  Activity,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Layers,
  Info
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from "recharts";

interface EvaluationViewProps {
  session: DatasetSession;
  onNavigateToExplainability: () => void;
}

export const EvaluationView: React.FC<EvaluationViewProps> = ({
  session,
  onNavigateToExplainability,
}) => {
  const { automlSummary } = session;
  const [selectedModelId, setSelectedModelId] = useState<string>(automlSummary?.selectedModel.id || "");

  if (!automlSummary) {
    return (
      <div className="p-12 text-center space-y-4 max-w-xl mx-auto">
        <Cpu className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">No Models Evaluated Yet</h2>
        <p className="text-xs text-slate-400">
          Run the AutoML Benchmark first to generate genuine model evaluation metrics, confusion matrices, and ROC curves.
        </p>
      </div>
    );
  }

  const activeModel =
    automlSummary.models.find((m) => m.id === selectedModelId) || automlSummary.selectedModel;

  const { metrics, confusionMatrix, rocCurve } = activeModel;
  const isClassification = activeModel.taskType === "classification";

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Model Evaluation &amp; Diagnostics</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono border border-cyan-500/25">
              Holdout Test Set
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Examine genuine out-of-sample confusion matrices, classification trade-offs, and regression residual metrics.
          </p>
        </div>

        <button
          onClick={onNavigateToExplainability}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <span>Feature Explainability</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Model Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2 shrink-0">
          Inspecting Model:
        </span>
        {automlSummary.models.map((m) => {
          const isSelected = m.id === activeModel.id;
          return (
            <button
              key={m.id}
              onClick={() => setSelectedModelId(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
                isSelected
                  ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              <span>{m.name}</span>
              {m.isBest && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/30 text-emerald-300">
                  Best
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Metric Cards Grid */}
      <div className={`grid grid-cols-2 ${isClassification ? "sm:grid-cols-4" : "sm:grid-cols-5"} gap-4`}>
        {isClassification ? (
          <>
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Accuracy
              </span>
              <span className="text-2xl font-mono font-bold text-white mt-1 block">
                {metrics.accuracy != null ? (metrics.accuracy * 100).toFixed(1) + "%" : "N/A"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Total correct predictions</span>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                F1 Score (Macro)
              </span>
              <span className="text-2xl font-mono font-bold text-indigo-400 mt-1 block">
                {metrics.f1?.toFixed(3) ?? "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Harmonic precision-recall mean</span>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Precision (Macro)
              </span>
              <span className="text-2xl font-mono font-bold text-cyan-400 mt-1 block">
                {metrics.precision?.toFixed(3) ?? "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Minimizes false positives</span>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Recall (Macro)
              </span>
              <span className="text-2xl font-mono font-bold text-emerald-400 mt-1 block">
                {metrics.recall?.toFixed(3) ?? "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">True positive discovery rate</span>
            </div>
          </>
        ) : (
          <>
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                R² Coefficient
              </span>
              <span className="text-2xl font-mono font-bold text-white mt-1 block">
                {metrics.r2?.toFixed(3) ?? "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Variance explained</span>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                RMSE (Root MSE)
              </span>
              <span className="text-2xl font-mono font-bold text-cyan-400 mt-1 block">
                {metrics.rmse?.toFixed(2) ?? "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Standard error scale</span>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                MAE (Mean Absolute)
              </span>
              <span className="text-2xl font-mono font-bold text-indigo-400 mt-1 block">
                {metrics.mae?.toFixed(2) ?? "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Average absolute residual</span>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                MSE (Mean Squared)
              </span>
              <span className="text-2xl font-mono font-bold text-emerald-400 mt-1 block">
                {metrics.mse?.toFixed(2) ?? "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Penalizes large errors</span>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">MAPE</span>
              <span className="text-2xl font-mono font-bold text-purple-400 mt-1 block">
                {metrics.mape != null ? (metrics.mape * 100).toFixed(2) + "%" : "-"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Percentage error; zero targets excluded</span>
            </div>
          </>
        )}
      </div>

      {/* AutoML Benchmark Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200">Model Performance Comparison</h3>
            <p className="text-xs text-slate-400">Cross-validated primary metric for every successfully trained model.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={automlSummary.models.filter(m => m.status === "trained").map(m => ({ name: m.name, score: Number(m.primaryMetricValue || 0) }))} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis type="number" domain={isClassification ? [0, 1] : ["auto", "auto"]} stroke="#94a3b8" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} width={130} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }} />
                <Bar dataKey="score" name={isClassification ? "F1 Macro" : "R²"} fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200">Training Time Comparison</h3>
            <p className="text-xs text-slate-400">Measured training time for each AutoML model.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={automlSummary.models.filter(m => m.status === "trained").map(m => ({ name: m.name, seconds: Number((m.trainingTimeMs || 0) / 1000) }))} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} width={130} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }} formatter={(value: number) => [`${value.toFixed(2)} s`, "Training time"]} />
                <Bar dataKey="seconds" name="Seconds" fill="#22d3ee" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Diagnostics Canvas: Confusion Matrix and ROC Curve */}
      {isClassification ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Confusion Matrix Heatmap */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-200">Confusion Matrix Heatmap</h3>
                <p className="text-xs text-slate-400">Actual ground truth (rows) vs Model prediction (cols)</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">Test N = {automlSummary.testCount}</span>
            </div>

            {confusionMatrix ? (
              <div className="pt-2">
                <div className="flex justify-center">
                  <div className="space-y-2">
                    {/* Header: Predicted Labels */}
                    <div className="text-center text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                      Predicted Class &rarr;
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider rotate-[-90deg] whitespace-nowrap">
                        Actual &rarr;
                      </div>

                      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                        <table className="text-xs text-center border-collapse">
                          <thead>
                            <tr className="bg-slate-900 text-slate-400 text-[11px]">
                              <th className="p-2 border border-slate-800">Actual \ Pred</th>
                              {confusionMatrix.labels.map((l) => (
                                <th key={l} className="p-2 border border-slate-800 font-mono text-cyan-300">
                                  {l}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {confusionMatrix.matrix.map((row, rIdx) => {
                              const totalInRow = row.reduce((a, b) => a + b, 0);
                              return (
                                <tr key={rIdx}>
                                  <td className="p-2 border border-slate-800 font-mono font-semibold text-slate-300 bg-slate-900/70">
                                    {confusionMatrix.labels[rIdx]}
                                  </td>
                                  {row.map((val, cIdx) => {
                                    const isDiagonal = rIdx === cIdx;
                                    const intensity = totalInRow > 0 ? val / totalInRow : 0;
                                    const bgStyle = isDiagonal
                                      ? `rgba(16, 185, 129, ${Math.max(0.15, intensity)})`
                                      : val > 0
                                      ? `rgba(244, 63, 94, ${Math.max(0.1, intensity * 0.8)})`
                                      : "transparent";

                                    return (
                                      <td
                                        key={cIdx}
                                        style={{ backgroundColor: bgStyle }}
                                        className="p-3 border border-slate-800 font-mono font-bold text-white min-w-[60px]"
                                      >
                                        <div className="text-sm">{val}</div>
                                        <div className="text-[10px] text-slate-400 font-normal">
                                          ({totalInRow > 0 ? ((val / totalInRow) * 100).toFixed(0) : 0}%)
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Confusion matrix not available.</p>
            )}
          </div>

          {/* ROC Curve Chart */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-200">Receiver Operating Characteristic (ROC)</h3>
                <p className="text-xs text-slate-400">
                  {metrics.rocAuc != null
                    ? `Area Under Curve (ROC-AUC) = ${metrics.rocAuc.toFixed(3)}`
                    : "ROC-AUC is not available for this evaluation"}
                </p>
              </div>
              {metrics.rocAuc != null && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                  AUC: {metrics.rocAuc.toFixed(3)}
                </span>
              )}
            </div>

            {rocCurve && rocCurve.length > 0 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rocCurve} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis
                      dataKey="fpr"
                      type="number"
                      domain={[0, 1]}
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{ value: "False Positive Rate (1 - Specificity)", position: "bottom", offset: 0, fill: "#94a3b8", fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="tpr"
                      type="number"
                      domain={[0, 1]}
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{ value: "True Positive Rate (Sensitivity)", angle: -90, position: "left", offset: 15, fill: "#94a3b8", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }}
                    />
                    {/* Baseline random guess reference */}
                    <ReferenceLine stroke="#64748b" strokeDasharray="4 4" segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} />
                    <Line
                      type="monotone"
                      dataKey="tpr"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#38bdf8" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                ROC curves are explicitly evaluated for binary target classification tasks.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Regression Residuals Explanation Card */
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200">Regression Diagnostics Analysis</h3>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            {activeModel.name} was evaluated on the untouched holdout set using multiple complementary regression metrics. R² = <strong>{metrics.r2?.toFixed(3) ?? "N/A"}</strong>, MAE = <strong>{metrics.mae?.toFixed(2) ?? "N/A"}</strong>, RMSE = <strong>{metrics.rmse?.toFixed(2) ?? "N/A"}</strong>{metrics.mape != null ? <> and MAPE = <strong>{(metrics.mape * 100).toFixed(2)}%</strong></> : null}. The primary metric <strong>{activeModel.primaryMetric}</strong> controls model ranking; the remaining metrics provide complementary evidence rather than being ignored.
          </p>
        </div>
      )}
    </div>
  );
};
