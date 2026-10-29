import React, { useState } from "react";
import { DatasetSession, AIInsights } from "../types";
import {
  Lightbulb,
  Sparkles,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
} from "lucide-react";

interface InsightsViewProps {
  session: DatasetSession;
  onUpdateInsights: (insights: AIInsights) => void;
  onNavigateNext: () => void;
}

export const InsightsView: React.FC<InsightsViewProps> = ({
  session,
  onUpdateInsights,
  onNavigateNext,
}) => {
  const {
    aiInsights,
    fileName,
    rawRows,
    columns,
    qualityReport,
    automlSummary,
    columnProfiles,
    correlationMatrix,
    problemDetection,
  } = session;

  const [isLoading, setIsLoading] =
    useState(false);

  const [errorMsg, setErrorMsg] =
    useState<string | null>(null);

  // ============================================================
  // SAFE HELPERS
  // ============================================================

  const safeArray = (value: any): any[] => {
    return Array.isArray(value)
      ? value
      : [];
  };

  const safeNumber = (
    value: any,
    fallback: any = null
  ) => {
    const numberValue =
      Number(value);

    return Number.isFinite(
      numberValue
    )
      ? numberValue
      : fallback;
  };

  const getProfileType = (
    profile: any
  ): string => {
    return String(
      profile?.dataType ||
        profile?.type ||
        profile?.dtype ||
        ""
    ).toLowerCase();
  };

  const isNumericProfile = (
    profile: any
  ): boolean => {
    const type =
      getProfileType(profile);

    return (
      type.includes("numerical") ||
      type.includes("numeric") ||
      type.includes("number") ||
      type.includes("integer") ||
      type.includes("int") ||
      type.includes("float") ||
      type.includes("double") ||
      type.includes("binary")
    );
  };

  const isCategoricalProfile = (
    profile: any
  ): boolean => {
    const type =
      getProfileType(profile);

    return (
      type.includes("categorical") ||
      type.includes("category") ||
      type.includes("object") ||
      type.includes("string") ||
      type.includes("boolean") ||
      type.includes("bool")
    );
  };

  // ============================================================
  // NUMERIC COLUMN EVIDENCE
  // ============================================================

  const buildNumericAnalysis = () => {
    return safeArray(
      columnProfiles
    )
      .filter(
        (profile: any) =>
          isNumericProfile(profile)
      )
      .map(
        (profile: any) => ({
          name:
            profile?.name,

          dataType:
            profile?.dataType ||
            profile?.type ||
            profile?.dtype,

          count:
            profile?.count,

          missing:
            profile?.missing ??
            profile?.missingCount,

          missingRate:
            profile?.missingRate,

          unique:
            profile?.unique ??
            profile?.uniqueCount,

          mean:
            profile?.mean,

          median:
            profile?.median,

          std:
            profile?.std ??
            profile?.standardDeviation,

          min:
            profile?.min,

          max:
            profile?.max,

          q1:
            profile?.q1 ??
            profile?.Q1,

          q3:
            profile?.q3 ??
            profile?.Q3,

          outlierCount:
            profile?.outlierCount,
        })
      );
  };

  // ============================================================
  // CATEGORICAL COLUMN EVIDENCE
  // ============================================================

  const buildCategoricalAnalysis = () => {
    return safeArray(
      columnProfiles
    )
      .filter(
        (profile: any) =>
          isCategoricalProfile(profile)
      )
      .map(
        (profile: any) => ({
          name:
            profile?.name,

          dataType:
            profile?.dataType ||
            profile?.type ||
            profile?.dtype,

          count:
            profile?.count,

          missing:
            profile?.missing ??
            profile?.missingCount,

          missingRate:
            profile?.missingRate,

          unique:
            profile?.unique ??
            profile?.uniqueCount,

          top:
            profile?.top,

          topFrequency:
            profile?.topFrequency,

          valueCounts:
            profile?.valueCounts ||
            profile?.topValues ||
            profile?.frequencies ||
            [],
        })
      );
  };

  // ============================================================
  // OUTLIER EVIDENCE
  // ============================================================

  const buildOutlierAnalysis = () => {
    return safeArray(
      columnProfiles
    )
      .filter(
        (profile: any) =>
          safeNumber(
            profile?.outlierCount,
            0
          ) > 0
      )
      .map(
        (profile: any) => ({
          column:
            profile?.name,

          outlierCount:
            profile?.outlierCount,

          min:
            profile?.min,

          max:
            profile?.max,

          q1:
            profile?.q1 ??
            profile?.Q1,

          q3:
            profile?.q3 ??
            profile?.Q3,
        })
      );
  };

  // ============================================================
  // CORRELATION EVIDENCE
  // ============================================================

  const buildCorrelationHighlights = (
    matrix: any
  ): any[] => {
    if (!matrix) {
      return [];
    }

    // --------------------------------------------
    // Case 1:
    // Already an array of correlation objects
    // --------------------------------------------

    if (Array.isArray(matrix)) {
      return matrix
        .filter(
          (item: any) =>
            item &&
            typeof item ===
              "object" &&
            item.col1 &&
            item.col2 &&
            Number.isFinite(
              Number(
                item.correlation
              )
            )
        )
        .sort(
          (
            a: any,
            b: any
          ) =>
            Math.abs(
              Number(
                b.correlation
              )
            ) -
            Math.abs(
              Number(
                a.correlation
              )
            )
        )
        .slice(0, 15);
    }

    // --------------------------------------------
    // Case 2:
    // Matrix represented as object
    // --------------------------------------------

    if (
      typeof matrix ===
      "object"
    ) {
      const result: any[] =
        [];

      const columns =
        Object.keys(
          matrix
        );

      for (
        let i = 0;
        i < columns.length;
        i++
      ) {
        const col1 =
          columns[i];

        const row =
          matrix[col1];

        if (
          !row ||
          typeof row !==
            "object"
        ) {
          continue;
        }

        for (
          let j = i + 1;
          j < columns.length;
          j++
        ) {
          const col2 =
            columns[j];

          const value =
            Number(
              row[col2]
            );

          if (
            Number.isFinite(
              value
            )
          ) {
            result.push({
              col1,
              col2,
              correlation:
                value,
            });
          }
        }
      }

      return result
        .sort(
          (
            a,
            b
          ) =>
            Math.abs(
              b.correlation
            ) -
            Math.abs(
              a.correlation
            )
        )
        .slice(0, 15);
    }

    return [];
  };

  // ============================================================
  // TARGET EVIDENCE
  // ============================================================

  const buildTargetAnalysis = () => {
    if (
      !problemDetection
        ?.targetColumn
    ) {
      return [];
    }

    return [
      {
        target:
          problemDetection.targetColumn,

        taskType:
          problemDetection.taskType,

        reason:
          problemDetection.reason,

        hasTarget:
          problemDetection.hasTarget,
      },
    ];
  };

  // ============================================================
  // AUTOML EVIDENCE
  // ============================================================

  const buildAutoMLEvidence = () => {
    if (!automlSummary) {
      return null;
    }

    const selectedModel =
      automlSummary.selectedModel;

    const models =
      safeArray(
        (automlSummary as any)
          ?.models
      );

    return {
      selectedModel:
        selectedModel
          ? {
              name:
                selectedModel.name,

              primaryMetric:
                selectedModel.primaryMetric,

              primaryMetricValue:
                selectedModel.primaryMetricValue,

              featureImportance:
                selectedModel.featureImportance ||
                [],
            }
          : null,

      testCount:
        (automlSummary as any)
          ?.testCount,

      testSize:
        (automlSummary as any)
          ?.testSize,

      models:
        models.map(
          (model: any) => ({
            name:
              model?.name,

            primaryMetric:
              model?.primaryMetric,

            primaryMetricValue:
              model?.primaryMetricValue,

            accuracy:
              model?.accuracy,

            precision:
              model?.precision,

            recall:
              model?.recall,

            f1:
              model?.f1,

            rocAuc:
              model?.rocAuc,

            r2:
              model?.r2,

            mae:
              model?.mae,

            mse:
              model?.mse,

            rmse:
              model?.rmse,

            mape:
              model?.mape,
          })
        ),

      featureImportance:
        selectedModel
          ?.featureImportance ||
        [],
    };
  };

  // ============================================================
  // FETCH GEMINI INSIGHTS
  // ============================================================

  const fetchAiInsights =
    async () => {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        // --------------------------------------------
        // Build all locally-computed evidence
        // --------------------------------------------

        const numericColumns =
          safeArray(
            columnProfiles
          )
            .filter(
              (profile: any) =>
                isNumericProfile(
                  profile
                )
            )
            .map(
              (profile: any) =>
                profile.name
            );

        const categoricalColumns =
          safeArray(
            columnProfiles
          )
            .filter(
              (profile: any) =>
                isCategoricalProfile(
                  profile
                )
            )
            .map(
              (profile: any) =>
                profile.name
            );

        const numericAnalysis =
          buildNumericAnalysis();

        const categoricalAnalysis =
          buildCategoricalAnalysis();

        const outlierAnalysis =
          buildOutlierAnalysis();

        const correlationHighlights =
          buildCorrelationHighlights(
            correlationMatrix
          );

        const targetAnalysis =
          buildTargetAnalysis();

        const automlEvidence =
          buildAutoMLEvidence();

        // --------------------------------------------
        // Feature importance
        // --------------------------------------------

        const featureImportance =
          automlSummary
            ?.selectedModel
            ?.featureImportance ||
          [];

        // --------------------------------------------
        // Schema evidence
        // --------------------------------------------

        const schemaAnalysis = {
          columns:
            columns,

          totalColumns:
            columns.length,

          numericColumns:
            numericColumns,

          categoricalColumns:
            categoricalColumns,
        };

        // --------------------------------------------
        // Dataset summary
        // --------------------------------------------

        const datasetSummary = {
          name:
            fileName,

          totalRows:
            rawRows.length,

          totalCols:
            columns.length,

          numCols:
            numericColumns,

          catCols:
            categoricalColumns,
        };

        // --------------------------------------------
        // Send computed evidence
        // --------------------------------------------

        const requestBody = {
          datasetSummary,

          qualityReport,

          correlationHighlights,

          problemDetection,

          mlResults:
            automlEvidence,

          columnProfiles,

          numericAnalysis,

          categoricalAnalysis,

          featureImportance,

          outlierAnalysis,

          targetAnalysis,

          // Trend analysis will be populated
          // when temporal analysis is available.
          trendAnalysis: [],

          schemaAnalysis,
        };

        console.log(
          "Sending grounded AI evidence:",
          {
            dataset:
              fileName,

            rows:
              rawRows.length,

            columns:
              columns.length,

            numericColumns:
              numericColumns.length,

            categoricalColumns:
              categoricalColumns.length,

            correlations:
              correlationHighlights.length,

            numericProfiles:
              numericAnalysis.length,

            categoricalProfiles:
              categoricalAnalysis.length,

            outliers:
              outlierAnalysis.length,

            featureImportance:
              featureImportance.length,

            hasTarget:
              !!problemDetection
                ?.targetColumn,

            hasAutoML:
              !!automlSummary,
          }
        );

        // --------------------------------------------
        // Gemini request
        // --------------------------------------------

        const response =
          await fetch(
            "/api/gemini/insights",
            {
              method:
                "POST",

              credentials:
                "include",

              headers: {
                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",
              },

              body:
                JSON.stringify(
                  requestBody
                ),
            }
          );

        // --------------------------------------------
        // Read response safely
        // --------------------------------------------

        const rawResponse =
          await response.text();

        if (!response.ok) {
          console.error(
            "AI Insights server error:",
            rawResponse
          );

          throw new Error(
            `Server returned status ${response.status}`
          );
        }

        if (
          !rawResponse.trim()
        ) {
          throw new Error(
            "AI Insights server returned an empty response."
          );
        }

        let data: any;

        try {
          data =
            JSON.parse(
              rawResponse
            );
        } catch {
          console.error(
            "AI Insights returned invalid JSON:",
            rawResponse.slice(
              0,
              3000
            )
          );

          throw new Error(
            "AI Insights server returned invalid JSON."
          );
        }

        // --------------------------------------------
        // Validate response
        // --------------------------------------------

        const insights =
          data?.insights ||
          data;

        if (
          !insights ||
          typeof insights !==
            "object"
        ) {
          throw new Error(
            "Invalid response schema from AI server."
          );
        }

        if (
          typeof insights.executiveSummary !==
          "string"
        ) {
          throw new Error(
            "AI response does not contain a valid executive summary."
          );
        }

        const normalizedInsights:
          AIInsights = {
          executiveSummary:
            insights.executiveSummary,

          keyFindings:
            Array.isArray(
              insights.keyFindings
            )
              ? insights.keyFindings.filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
              : [],

          businessInsights:
            Array.isArray(
              insights.businessInsights
            )
              ? insights.businessInsights.filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
              : [],

          recommendedActions:
            Array.isArray(
              insights.recommendedActions
            )
              ? insights.recommendedActions.filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
              : [],

          cautions:
            Array.isArray(
              insights.cautions
            )
              ? insights.cautions.filter(
                  (item: any) =>
                    typeof item ===
                    "string"
                )
              : [],
        };

        onUpdateInsights(
          normalizedInsights
        );

        setErrorMsg(null);

      } catch (err: any) {
        console.warn(
          "Gemini insights failed. Falling back to deterministic local intelligence:",
          err
        );

        setErrorMsg(
          "Gemini analysis was unavailable. Showing locally computed dataset insights."
        );

        // --------------------------------------------
        // Deterministic fallback
        // --------------------------------------------

        const fallback =
          generateFallbackInsights(
            session
          );

        onUpdateInsights(
          fallback
        );

      } finally {
        setIsLoading(false);
      }
    };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

        <div>
          <div className="flex items-center gap-2">

            <h1 className="text-2xl font-bold text-white tracking-tight">
              Autonomous AI Business Intelligence
            </h1>

            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-mono border border-purple-500/25">
  Gemini AI
</span>

          </div>

          <p className="text-xs text-slate-400 mt-1">
            Dataset-specific executive analysis generated from verified statistical, quality, relationship, and model evidence.
          </p>
        </div>

        <div className="flex items-center gap-3">

          <button
            onClick={
              fetchAiInsights
            }
            disabled={
              isLoading
            }
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
          >

            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoading
                  ? "animate-spin text-purple-400"
                  : ""
              }`}
            />

            <span>
              {isLoading
                ? "Analyzing..."
                : "Regenerate Insights"}
            </span>

          </button>

          <button
            onClick={
              onNavigateNext
            }
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
          >

            <span>
              Smart Dashboard
            </span>

            <ArrowRight className="w-4 h-4" />

          </button>

        </div>

      </div>

      {/* ======================================================
          ERROR / FALLBACK NOTICE
          ====================================================== */}

      {errorMsg && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
          {errorMsg}
        </div>
      )}

      {/* ======================================================
          MAIN INSIGHTS
          ====================================================== */}

      {aiInsights ? (

        <div className="space-y-6">

          {/* EXECUTIVE SUMMARY */}

          <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/30 border border-purple-500/30 space-y-3">

            <div className="flex items-center gap-2">

              <Sparkles className="w-5 h-5 text-purple-400" />

              <h2 className="text-sm font-bold uppercase tracking-wider text-purple-300">
                Executive Strategy Briefing
              </h2>

            </div>

            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {
                aiInsights.executiveSummary
              }
            </p>

          </div>

          {/* FOUR INSIGHT CARDS */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* KEY FINDINGS */}

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">

              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">

                <CheckCircle2 className="w-4 h-4" />

                <span>
                  Key Computed Findings
                </span>

              </h3>

              <ul className="space-y-2.5 text-xs text-slate-300">

                {aiInsights.keyFindings.map(
                  (
                    finding,
                    idx
                  ) => (

                    <li
                      key={idx}
                      className="flex items-start gap-2 leading-relaxed"
                    >

                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />

                      <span>
                        {finding}
                      </span>

                    </li>

                  )
                )}

              </ul>

            </div>

            {/* BUSINESS INSIGHTS */}

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">

              <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">

                <Briefcase className="w-4 h-4" />

                <span>
                  Strategic Business Implications
                </span>

              </h3>

              <ul className="space-y-2.5 text-xs text-slate-300">

                {aiInsights.businessInsights.map(
                  (
                    item,
                    idx
                  ) => (

                    <li
                      key={idx}
                      className="flex items-start gap-2 leading-relaxed"
                    >

                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />

                      <span>
                        {item}
                      </span>

                    </li>

                  )
                )}

              </ul>

            </div>

            {/* RECOMMENDED ACTIONS */}

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">

              <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">

                <TrendingUp className="w-4 h-4" />

                <span>
                  Recommended Operational Actions
                </span>

              </h3>

              <ul className="space-y-2.5 text-xs text-slate-300">

                {aiInsights.recommendedActions.map(
                  (
                    action,
                    idx
                  ) => (

                    <li
                      key={idx}
                      className="flex items-start gap-2 leading-relaxed"
                    >

                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />

                      <span>
                        {action}
                      </span>

                    </li>

                  )
                )}

              </ul>

            </div>

            {/* CAUTIONS */}

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">

              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">

                <AlertTriangle className="w-4 h-4" />

                <span>
                  Methodological Cautions &amp; Guardrails
                </span>

              </h3>

              <ul className="space-y-2.5 text-xs text-slate-300">

                {aiInsights.cautions.map(
                  (
                    caution,
                    idx
                  ) => (

                    <li
                      key={idx}
                      className="flex items-start gap-2 leading-relaxed"
                    >

                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />

                      <span>
                        {caution}
                      </span>

                    </li>

                  )
                )}

              </ul>

            </div>

          </div>

        </div>

      ) : (

        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">

          <Lightbulb className="w-12 h-12 text-purple-400 mx-auto" />

          <h2 className="text-base font-bold text-white">
            Generate Autonomous Executive Insights
          </h2>

          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Generate dataset-specific insights from data quality, statistical relationships, feature evidence, target detection, and model performance.
          </p>

          <button
            onClick={
              fetchAiInsights
            }
            disabled={
              isLoading
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 hover:scale-[1.02] transition-all disabled:opacity-50"
          >

            <Sparkles className="w-4 h-4" />

            <span>
              {isLoading
                ? "Generating..."
                : "Generate Grounded AI Insights"}
            </span>

          </button>

        </div>

      )}

    </div>
  );
};

// ============================================================
// DETERMINISTIC LOCAL FALLBACK
// ============================================================

function generateFallbackInsights(
  session: DatasetSession
): AIInsights {

  const {
    fileName,
    rawRows,
    columns,
    qualityReport,
    automlSummary,
    columnProfiles,
    problemDetection,
    correlationMatrix,
  } = session;

  // ============================================================
  // COLUMN INFORMATION
  // ============================================================

  const profiles =
    Array.isArray(
      columnProfiles
    )
      ? columnProfiles
      : [];

  const numericProfiles =
    profiles.filter(
      (profile: any) => {
        const type =
          String(
            profile?.dataType ||
              profile?.type ||
              profile?.dtype ||
              ""
          ).toLowerCase();

        return (
          type.includes("numerical") ||
          type.includes("numeric") ||
          type.includes("number") ||
          type.includes("int") ||
          type.includes("float") ||
          type.includes("binary")
        );
      }
    );

  const categoricalProfiles =
    profiles.filter(
      (profile: any) => {
        const type =
          String(
            profile?.dataType ||
              profile?.type ||
              profile?.dtype ||
              ""
          ).toLowerCase();

        return (
          type.includes("categorical") ||
          type.includes("category") ||
          type.includes("object") ||
          type.includes("string") ||
          type.includes("boolean") ||
          type.includes("bool")
        );
      }
    );

  // ============================================================
  // CORRELATION
  // ============================================================

  let correlations: any[] =
    [];

  if (
    Array.isArray(
      correlationMatrix
    )
  ) {
    correlations =
      correlationMatrix.filter(
        (item: any) =>
          item?.col1 &&
          item?.col2 &&
          Number.isFinite(
            Number(
              item?.correlation
            )
          )
      );
  }

  correlations =
    correlations
      .sort(
        (
          a,
          b
        ) =>
          Math.abs(
            Number(
              b.correlation
            )
          ) -
          Math.abs(
            Number(
              a.correlation
            )
          )
      )
      .slice(0, 5);

  // ============================================================
  // FEATURE IMPORTANCE
  // ============================================================

  const featureImportance =
    automlSummary
      ?.selectedModel
      ?.featureImportance ||
    [];

  const topDriver =
    featureImportance.length >
    0
      ? featureImportance[0]
          ?.feature
      : null;

  const modelName =
    automlSummary
      ?.selectedModel
      ?.name ||
    null;

  const selectedMetric =
    automlSummary
      ?.selectedModel
      ?.primaryMetric ||
    null;

  const selectedMetricValue =
    automlSummary
      ?.selectedModel
      ?.primaryMetricValue;

  // ============================================================
  // FINDINGS
  // ============================================================

  const findings: string[] =
    [];

  findings.push(
    `The dataset contains ${rawRows.length.toLocaleString()} records across ${columns.length} columns, including ${numericProfiles.length} numeric and ${categoricalProfiles.length} categorical attributes.`
  );

  findings.push(
    qualityReport
      ? `The computed data quality score is ${qualityReport.qualityScore}/100, with a missing-value rate of ${qualityReport.missingRate}% and ${qualityReport.duplicateRows} duplicate rows.`
      : "A complete data-quality summary was not available."
  );

  if (
    correlations.length >
    0
  ) {
    const strongest =
      correlations[0];

    findings.push(
      `The strongest supplied numeric relationship is between '${strongest.col1}' and '${strongest.col2}' with a correlation of ${Number(strongest.correlation).toFixed(2)}.`
    );
  }

  if (
    topDriver
  ) {
    findings.push(
      `The AutoML feature-importance output identifies '${topDriver}' as the highest-ranked supplied predictive feature.`
    );
  }

  if (
    problemDetection
      ?.targetColumn
  ) {
    findings.push(
      `The detected modeling target is '${problemDetection.targetColumn}' with task type '${problemDetection.taskType || "unspecified"}'.`
    );
  }

  if (
    findings.length <
    3
  ) {
    findings.push(
      "The available computed evidence does not support additional dataset-specific findings."
    );
  }

  // ============================================================
  // BUSINESS INSIGHTS
  // ============================================================

  const businessInsights:
    string[] = [];

  if (
    topDriver
  ) {
    businessInsights.push(
      `The variable '${topDriver}' is the highest-ranked feature in the supplied model-importance evidence and should therefore receive attention during model interpretation.`
    );
  }

  if (
    correlations.length >
    0
  ) {
    const strongest =
      correlations[0];

    businessInsights.push(
      `'${strongest.col1}' and '${strongest.col2}' have the strongest supplied relationship; their joint behavior should be examined before treating them as independent predictors.`
    );
  }

  if (
    qualityReport &&
    qualityReport.totalMissingCells >
      0
  ) {
    businessInsights.push(
      `Missing values are present at a rate of ${qualityReport.missingRate}%, so affected columns should be reviewed before downstream analysis.`
    );
  }

  if (
    businessInsights.length ===
    0
  ) {
    businessInsights.push(
      "The supplied evidence does not establish a dataset-specific business implication beyond the measured statistical findings."
    );
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  const recommendedActions:
    string[] = [];

  if (
    qualityReport &&
    qualityReport.totalMissingCells >
      0
  ) {
    recommendedActions.push(
      `Review the ${qualityReport.totalMissingCells.toLocaleString()} missing cells and the columns identified in the quality report before relying on downstream results.`
    );
  }

  if (
    qualityReport &&
    qualityReport.duplicateRows >
      0
  ) {
    recommendedActions.push(
      `Review the ${qualityReport.duplicateRows.toLocaleString()} duplicate rows before using the dataset for final analysis or model training.`
    );
  }

  if (
    topDriver
  ) {
    recommendedActions.push(
      `Investigate the behavior of '${topDriver}' against the detected target before finalizing feature-selection decisions.`
    );
  }

  if (
    correlations.length >
    0
  ) {
    const strongest =
      correlations[0];

    recommendedActions.push(
      `Examine the relationship between '${strongest.col1}' and '${strongest.col2}' for possible redundancy or shared predictive information.`
    );
  }

  if (
    recommendedActions.length ===
    0
  ) {
    recommendedActions.push(
      "Continue with the available analytical workflow using the verified computed evidence."
    );
  }

  // ============================================================
  // CAUTIONS
  // ============================================================

  const cautions:
    string[] = [];

  if (
    qualityReport?.outlierCount >
    0
  ) {
    cautions.push(
      `${qualityReport.outlierCount.toLocaleString()} statistical outliers were detected and may influence some statistical summaries or model types.`
    );
  }

  if (
    qualityReport?.totalMissingCells >
    0
  ) {
    cautions.push(
      `The dataset contains missing values at a rate of ${qualityReport.missingRate}%, so missing-data handling should be considered when interpreting results.`
    );
  }

  if (
    automlSummary?.testCount
  ) {
    cautions.push(
      `The available AutoML evaluation used ${automlSummary.testCount.toLocaleString()} held-out records.`
    );
  }

  if (
    cautions.length ===
    0
  ) {
    cautions.push(
      "No additional methodological caution can be established from the supplied fallback evidence."
    );
  }

  // ============================================================
  // EXECUTIVE SUMMARY
  // ============================================================

  let executiveSummary =
    `The dataset '${fileName}' contains ${rawRows.length.toLocaleString()} records across ${columns.length} columns. `;

  if (
    qualityReport
  ) {
    executiveSummary +=
      `Its computed data quality score is ${qualityReport.qualityScore}/100 with a missing-value rate of ${qualityReport.missingRate}%. `;
  }

  if (
    problemDetection
      ?.targetColumn
  ) {
    executiveSummary +=
      `The current analysis identifies '${problemDetection.targetColumn}' as the modeling target for ${problemDetection.taskType || "predictive"} analysis.`;
  } else {
    executiveSummary +=
      "No predictive target is currently established by the supplied problem-detection result.";
  }

  // ============================================================
  // INCLUDE AUTOML FACT ONLY WHEN ACTUALLY AVAILABLE
  // ============================================================

  if (
    modelName &&
    selectedMetric &&
    selectedMetricValue !==
      undefined &&
    selectedMetricValue !==
      null
  ) {
    executiveSummary +=
      ` The selected AutoML model is ${modelName}, with ${selectedMetric} = ${Number(selectedMetricValue).toFixed(4)}.`;
  }

  return {
    executiveSummary,

    keyFindings:
      findings.slice(
        0,
        6
      ),

    businessInsights:
      businessInsights.slice(
        0,
        5
      ),

    recommendedActions:
      recommendedActions.slice(
        0,
        5
      ),

    cautions:
      cautions.slice(
        0,
        4
      ),
  };
}