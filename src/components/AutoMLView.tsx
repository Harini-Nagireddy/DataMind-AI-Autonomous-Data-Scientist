import React, { useEffect, useState } from "react";
import { DatasetSession, AutoMLSummary } from "../types";
import {
  Cpu,
  Trophy,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Target,
} from "lucide-react";

interface AutoMLViewProps {
  session: DatasetSession;
  onUpdateAutoML: (summary: AutoMLSummary) => void;
  onNavigateToEvaluation: () => void;
}

export const AutoMLView: React.FC<AutoMLViewProps> = ({
  session,
  onUpdateAutoML,
  onNavigateToEvaluation,
}) => {
  const {
    cleanedRows,
    columnProfiles,
    problemDetection,
    automlSummary,
  } = session;

  const [selectedTarget, setSelectedTarget] = useState<string>(
    problemDetection.hasTarget && problemDetection.targetColumn
      ? problemDetection.targetColumn
      : columnProfiles.find(
          (c) => !c.isPossibleId && !c.isConstant
        )?.name || ""
  );

  const [taskType, setTaskType] = useState<
    "classification" | "regression"
  >(
    problemDetection.taskType === "regression"
      ? "regression"
      : "classification"
  );

  const [primaryMetric, setPrimaryMetric] = useState<string>(
    problemDetection.taskType === "regression" ? "r2" : "f1"
  );
  const [isTraining, setIsTraining] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // The session may receive a backend target recommendation shortly after
  // upload. Keep the controls synchronized with that generic recommendation.
  useEffect(() => {
    if (problemDetection.hasTarget && problemDetection.targetColumn) {
      setSelectedTarget(problemDetection.targetColumn);
      if (problemDetection.taskType === "classification" || problemDetection.taskType === "regression") {
        setTaskType(problemDetection.taskType);
        setPrimaryMetric(problemDetection.taskType === "regression" ? "r2" : "f1");
      }
    }
  }, [problemDetection.targetColumn, problemDetection.taskType, problemDetection.hasTarget]);

  /*
   * Only columns that are valid candidates for prediction
   * are displayed as target options.
   */
  const targetCandidates = columnProfiles.filter(
    (c) => !c.isPossibleId && !c.isConstant
  );

  /*
   * Safely convert values before sending them to the backend.
   *
   * Uploaded datasets can contain:
   * - undefined
   * - null
   * - NaN
   * - Infinity
   * - Date objects
   * - objects/arrays
   *
   * The backend expects normal JSON-compatible scalar values.
   */
  const sanitizeValue = (value: any): any => {
    if (value === undefined) {
      return null;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return null;
      }

      return value;
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }

    if (typeof value === "object") {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return String(value);
      }
    }

    return String(value);
  };

  /*
   * Sanitize every uploaded/cleaned row before sending it
   * to Python AutoML.
   */
  const prepareRowsForAutoML = () => {
    if (!Array.isArray(cleanedRows)) {
      return [];
    }

    return cleanedRows.map((row: any) => {
      const cleanRow: Record<string, any> = {};

      if (!row || typeof row !== "object") {
        return cleanRow;
      }

      Object.keys(row).forEach((key) => {
        cleanRow[key] = sanitizeValue(row[key]);
      });

      return cleanRow;
    });
  };

  /*
   * Validate the selected target before making the API call.
   */
  const validateDataset = (rows: any[]) => {
    if (!rows.length) {
      return "The uploaded dataset does not contain any usable rows.";
    }

    if (rows.length < 20) {
      return `AutoML requires at least 20 usable rows. Your dataset currently contains ${rows.length} rows.`;
    }

    if (!selectedTarget) {
      return "Please select a target feature for prediction.";
    }

    const firstRow = rows[0];

    if (
      !firstRow ||
      typeof firstRow !== "object" ||
      !(selectedTarget in firstRow)
    ) {
      return `The selected target column "${selectedTarget}" was not found in the cleaned dataset.`;
    }

    const targetValues = rows
      .map((row) => row?.[selectedTarget])
      .filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      );

    if (targetValues.length < 2) {
      return `The target column "${selectedTarget}" does not contain enough usable values.`;
    }

    const uniqueTargets = new Set(
      targetValues.map((value: any) => String(value))
    );

    if (taskType === "classification" && uniqueTargets.size < 2) {
      return `Classification requires at least 2 target classes. "${selectedTarget}" currently contains only one usable class.`;
    }

    if (taskType === "regression") {
      const numericTargets = targetValues.filter((value: any) => {
        const numberValue = Number(value);
        return Number.isFinite(numberValue);
      });

      if (numericTargets.length < 2) {
        return `The regression target "${selectedTarget}" does not contain enough numeric values.`;
      }

      const uniqueNumericTargets = new Set(
        numericTargets.map((value: any) => Number(value))
      );

      if (uniqueNumericTargets.size < 2) {
        return `Regression requires at least 2 distinct numeric target values.`;
      }
    }

    return null;
  };

  const handleRunAutoML = async () => {
    setErrorMsg(null);
    setCurrentStep(null);

    if (!selectedTarget) {
      setErrorMsg(
        "Please select a valid target feature for prediction."
      );
      return;
    }

    /*
     * Prepare the uploaded dataset.
     */
    const preparedRows = session.datasetId ? [] : prepareRowsForAutoML();

    /*
     * Validate before contacting Python.
     */
    const validationError = session.datasetId ? null : validateDataset(preparedRows);

    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsTraining(true);

    setCurrentStep(
      "Preparing uploaded dataset for the Python scikit-learn AutoML service..."
    );

    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 10 * 60 * 1000);

    try {
      /*
       * Log useful diagnostic information.
       * This does NOT expose the complete dataset.
       */
      console.log("Starting AutoML:", {
        rows: preparedRows.length,
        columns:
          preparedRows.length > 0
            ? Object.keys(preparedRows[0]).length
            : 0,
        target: selectedTarget,
        taskType,
      });

      setCurrentStep(
        session.datasetId
          ? `Preparing ${session.totalRows.toLocaleString()} source records for adaptive AutoML...`
          : `Sending ${preparedRows.length.toLocaleString()} rows to Python AutoML...`
      );

      const requestBody = {
        rows: session.datasetId ? [] : preparedRows,
        datasetId: session.datasetId || undefined,
        targetCol: selectedTarget,
        taskType,
        primaryMetric,
        columnProfiles,
        testSize: 0.2,
        cvFolds: session.totalRows < 100000 ? 5 : session.totalRows < 500000 ? 4 : 3,
        randomState: 42,
      };

      /*
       * Explicitly stringify once before fetch.
       *
       * This allows us to catch JSON serialization problems
       * before the request reaches the server.
       */
      let serializedBody: string;

      try {
        serializedBody = JSON.stringify(requestBody);
      } catch (serializationError: any) {
        console.error(
          "AutoML request serialization failed:",
          serializationError
        );

        throw new Error(
          "The uploaded dataset contains values that cannot be converted to JSON. Please check the uploaded columns for unsupported values."
        );
      }

      /*
       * Prevent unexpectedly huge browser requests.
       *
       * The server is configured for large requests, but this
       * warning provides a much clearer message for extremely
       * large uploaded datasets.
       */
      const requestSizeMB =
        new Blob([serializedBody]).size / (1024 * 1024);

      console.log(
        session.datasetId
          ? `AutoML metadata request: ${requestSizeMB.toFixed(2)} MB (dataset remains server-side)`
          : `AutoML request size: ${requestSizeMB.toFixed(2)} MB`
      );

      setCurrentStep(
        session.totalRows > 100000
          ? "Running adaptive AutoML on a bounded, representative training sample. The full dataset is used as the source; memory and model workload are capped for predictable runtime..."
          : "Running Python scikit-learn AutoML..."
      );

      const response = await fetch("/api/ml/automl", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        body: serializedBody,

        signal: controller.signal,
      });

      /*
       * Always read as text first.
       *
       * This prevents:
       * Unexpected token '<'
       *
       * when a development server returns an HTML error page.
       */
      const contentType =
        response.headers.get("content-type") || "";

      const rawResponse = await response.text();

      console.log("AutoML HTTP response:", {
        status: response.status,
        statusText: response.statusText,
        contentType,
        responseLength: rawResponse.length,
      });

      /*
       * Empty response
       */
      if (!rawResponse.trim()) {
        throw new Error(
          `AutoML API returned an empty response (HTTP ${response.status}).`
        );
      }

      let data: any = null;

      /*
       * Parse JSON safely.
       */
      try {
        data = JSON.parse(rawResponse);
      } catch (parseError) {
        console.error(
          "AutoML API returned non-JSON response:",
          rawResponse.slice(0, 2000)
        );

        const looksLikeHtml =
          /<\s*!doctype/i.test(rawResponse) ||
          /<\s*html[\s>]/i.test(rawResponse) ||
          /<\s*head[\s>]/i.test(rawResponse) ||
          /<\s*body[\s>]/i.test(rawResponse);

        /*
         * 404 means the route itself was not found.
         */
        if (response.status === 404) {
          throw new Error(
            "AutoML API route was not found. Make sure DataMind is running with `npm run dev` on port 3000."
          );
        }

        /*
         * HTML response.
         */
        if (looksLikeHtml) {
          throw new Error(
            `The AutoML server returned an HTML error page instead of JSON (HTTP ${response.status}). Check the terminal running DataMind for the Python AutoML error.`
          );
        }

        /*
         * Plain-text response.
         */
        const preview = rawResponse
          .replace(/\s+/g, " ")
          .slice(0, 300);

        throw new Error(
          `AutoML API returned invalid JSON${
            contentType
              ? ` (${contentType})`
              : ""
          }. Server response: ${preview}`
        );
      }

      /*
       * Handle HTTP errors returned as JSON.
       *
       * FastAPI may return:
       *
       * {
       *   "detail": "..."
       * }
       */
      if (!response.ok) {
        const backendMessage =
          data?.detail ||
          data?.error ||
          data?.message ||
          data?.errors;

        if (typeof backendMessage === "string") {
          throw new Error(
            `AutoML failed: ${backendMessage}`
          );
        }

        if (Array.isArray(backendMessage)) {
          throw new Error(
            `AutoML failed: ${backendMessage
              .map((item: any) =>
                typeof item === "string"
                  ? item
                  : item?.msg || JSON.stringify(item)
              )
              .join("; ")}`
          );
        }

        throw new Error(
          `Python AutoML service failed (HTTP ${response.status}).`
        );
      }

      /*
       * Make sure the response is actually an object.
       */
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
      ) {
        throw new Error(
          "AutoML returned an empty or invalid response."
        );
      }

      /*
       * Detect backend error objects even if HTTP status
       * accidentally came back as 200.
       */
      if (
        data.error &&
        !data.models &&
        !data.selectedModel
      ) {
        throw new Error(
          data.message
            ? `${data.error}: ${data.message}`
            : String(data.error)
        );
      }

      /*
       * Make sure the minimum expected AutoML structure exists.
       */
      if (
        !Array.isArray(data.models) ||
        !data.selectedModel
      ) {
        console.error(
          "Unexpected AutoML response:",
          data
        );

        throw new Error(
          "The Python AutoML service responded successfully, but the response did not contain a valid model evaluation result."
        );
      }

      /*
       * Successful AutoML result.
       */
      onUpdateAutoML(data as AutoMLSummary);

      setCurrentStep(
        "AutoML completed successfully."
      );

      setErrorMsg(null);
    } catch (error: any) {
      console.error(
        "Python AutoML error:",
        error
      );

      setCurrentStep(null);

      if (error?.name === "AbortError") {
        setErrorMsg(
          "AutoML exceeded the 10-minute safety timeout. Try a smaller dataset or fewer columns."
        );
      } else if (
        error instanceof TypeError &&
        String(error?.message || "")
          .toLowerCase()
          .includes("fetch")
      ) {
        setErrorMsg(
          "Could not connect to the DataMind AutoML server. Make sure `npm run dev` is running on port 3000."
        );
      } else {
        setErrorMsg(
          error?.message ||
            "AutoML failed. Check the DataMind server and Python ML service terminal for details."
        );
      }
    } finally {
      window.clearTimeout(timeout);
      setIsTraining(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              AutoML Benchmark &amp; Model Selection
            </h1>

            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-mono border border-indigo-500/25">
              scikit-learn Engine
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-1">
            Python scikit-learn AutoML with stratified 80/20
            holdout testing, 5-fold cross-validation, and
            baseline comparison.
          </p>
        </div>

        {automlSummary && (
          <button
            onClick={onNavigateToEvaluation}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-md shadow-indigo-600/20 transition-all self-start sm:self-auto"
          >
            <span>Detailed Model Evaluation</span>

            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Target Configuration Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />

              <span>
                Target Variable &amp; Objective Formulation
              </span>
            </h2>

            <p className="text-xs text-slate-400">
              Select the feature you intend to forecast or predict
              across test instances.
            </p>
          </div>

          {problemDetection.hasTarget && (
            <div className="flex items-center gap-1.5 text-xs text-purple-300 bg-purple-950/50 px-3 py-1.5 rounded-lg border border-purple-800/40">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />

              <span>
                Suggested: &apos;
                {problemDetection.targetColumn}
                &apos; ({problemDetection.taskType})
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">

          {/* Target selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Target Feature Column
            </label>

            <select
              value={selectedTarget}
              onChange={(e) => {
                const val = e.target.value;

                setSelectedTarget(val);
                setErrorMsg(null);

                const prof = columnProfiles.find(
                  (c) => c.name === val
                );

                if (prof) {
                  if (
                    prof.dataType === "numerical" &&
                    !prof.isBinary &&
                    !prof.isDiscrete &&
                    prof.uniqueCount > 10
                  ) {
                    setTaskType("regression");
                    setPrimaryMetric("r2");
                  } else {
                    setTaskType("classification");
                    setPrimaryMetric("f1");
                  }
                }
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {targetCandidates.map((cp) => (
                <option
                  key={cp.name}
                  value={cp.name}
                >
                  {cp.name} ({cp.dataType} •{" "}
                  {cp.uniqueCount} distinct)
                </option>
              ))}
            </select>
          </div>

          {/* Task Type selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Problem Formulation
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTaskType("classification");
                  setPrimaryMetric("f1");
                  setErrorMsg(null);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  taskType === "classification"
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                Classification
              </button>

              <button
                type="button"
                onClick={() => {
                  setTaskType("regression");
                  setPrimaryMetric("r2");
                  setErrorMsg(null);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  taskType === "regression"
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                Regression
              </button>
            </div>
          </div>

          {/* Primary metric selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Primary Evaluation Metric
            </label>
            <select
              value={primaryMetric}
              onChange={(e) => {
                setPrimaryMetric(e.target.value);
                setErrorMsg(null);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {taskType === "classification" ? (
                <>
                  <option value="f1">F1 (Macro) — Suggested</option>
                  <option value="accuracy">Accuracy</option>
                  <option value="precision">Precision (Macro)</option>
                  <option value="recall">Recall (Macro)</option>
                  <option value="rocAuc">ROC-AUC (binary only)</option>
                </>
              ) : (
                <>
                  <option value="r2">R² — Suggested</option>
                  <option value="mae">MAE</option>
                  <option value="mse">MSE</option>
                  <option value="rmse">RMSE</option>
                  <option value="mape">MAPE</option>
                </>
              )}
            </select>
            <p className="text-[10px] text-slate-500">
              Used for CV ranking; all applicable metrics are still reported.
            </p>
          </div>

          {/* Action Button */}
          <div className="flex items-start pt-0 lg:pt-[23px]">
            <button
              onClick={handleRunAutoML}
              disabled={isTraining}
              className="w-full h-[42px] flex items-center justify-center gap-2 px-5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {isTraining ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />

                  <span>
                    Running Python AutoML...
                  </span>
                </>
              ) : (
                <>
                  <Cpu className="w-4 h-4" />

                  <span>
                    {automlSummary
                      ? "Retrain AutoML Ensemble"
                      : "Train AutoML Ensemble"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live training step indicator */}
        {currentStep && (
          <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl flex items-center gap-2.5 text-xs text-indigo-300 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />

            <span>{currentStep}</span>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 whitespace-pre-wrap">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Model Leaderboard */}
      {automlSummary && (
        <div className="space-y-6">

          {/* Winner Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900 to-slate-900 border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-emerald-950/30">

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Trophy className="w-6 h-6" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Winning Model
                  </span>

                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold uppercase">
                    Auto-Selected
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mt-0.5">
                  {automlSummary.selectedModel.name}
                </h3>

                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  {automlSummary.selectionReason}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
              <div className="text-left md:text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  {automlSummary.selectedModel.primaryMetric}
                </span>

                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {automlSummary.selectedModel.primaryMetricValue.toFixed(
                    3
                  )}
                </span>
              </div>

              <div className="text-left md:text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Training Time
                </span>

                <span className="text-base font-bold font-mono text-slate-200">
                  {automlSummary.selectedModel.trainingTimeMs} ms
                </span>
              </div>
            </div>
          </div>

          {/* Model Leaderboard Table */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-4">

            <div className="flex items-center justify-between px-2">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />

                  <span>
                    Model Leaderboard &amp; Benchmark Metrics
                  </span>
                </h3>

                <p className="text-xs text-slate-400">
                  5-fold CV on training data + untouched 20%
                  test partition ({automlSummary.testCount} records)
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 font-mono block">
                  {automlSummary.models.length} algorithms evaluated
                </span>

                <span className="text-[10px] text-slate-500">
                  {automlSummary.cvFolds || 5}-fold CV •
                  baseline: {automlSummary.baselineMetric}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">

                <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Algorithm</th>
                    <th className="py-3 px-3 text-cyan-300">Primary ({automlSummary.primaryMetricLabel || automlSummary.selectedModel.primaryMetric})</th>
                    <th className="py-3 px-3">CV Mean ± Std</th>
                    {automlSummary.taskType === "classification" ? (
                      <>
                        <th className="py-3 px-3">Accuracy</th><th className="py-3 px-3">Precision</th><th className="py-3 px-3">Recall</th><th className="py-3 px-3">F1</th><th className="py-3 px-3">ROC-AUC</th>
                      </>
                    ) : (
                      <>
                        <th className="py-3 px-3">R²</th><th className="py-3 px-3">MAE</th><th className="py-3 px-3">MSE</th><th className="py-3 px-3">RMSE</th><th className="py-3 px-3">MAPE</th>
                      </>
                    )}
                    <th className="py-3 px-3">Training</th><th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
                  {automlSummary.models.map((model) => (
                    <tr key={model.id} className={`hover:bg-slate-800/40 transition-colors ${model.isBest ? "bg-emerald-950/20" : ""}`}>
                      <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="font-bold text-white">{model.name}</span>{model.isBest && <span className="text-[10px] px-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Top Model</span>}</div><span className="text-[11px] text-slate-400">{model.algorithm}</span></td>
                      <td className="py-3 px-3 font-mono font-bold text-cyan-300">{model.status === "trained" ? model.primaryMetricValue.toFixed(4) : "-"}</td>
                      <td className="py-3 px-3 font-mono text-amber-300">{model.status === "trained" && model.cvMean !== undefined ? `${model.cvMean.toFixed(4)} ± ${(model.cvStd || 0).toFixed(4)}` : "-"}</td>
                      {automlSummary.taskType === "classification" ? <>
                        <td className="py-3 px-3 font-mono">{model.metrics.accuracy?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.precision?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.recall?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.f1?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.rocAuc?.toFixed(4) ?? "N/A"}</td>
                      </> : <>
                        <td className="py-3 px-3 font-mono">{model.metrics.r2?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.mae?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.mse?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.rmse?.toFixed(4) ?? "-"}</td><td className="py-3 px-3 font-mono">{model.metrics.mape != null ? `${(model.metrics.mape * 100).toFixed(2)}%` : "-"}</td>
                      </>}
                      <td className="py-3 px-3 font-mono text-slate-400">{model.status === "trained" ? `${model.trainingTimeMs} ms` : "-"}</td>
                      <td className="py-3 px-3">{model.status === "trained" ? <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]"><CheckCircle2 className="w-3.5 h-3.5" />Validated</span> : <span className="text-rose-400 text-[11px]" title={model.errorMessage}>Failed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
                <span className="text-slate-500 uppercase tracking-wide text-[10px] block">
                  Baseline
                </span>

                <strong>
                  {automlSummary.baselineMetric}
                </strong>
                :{" "}
                {automlSummary.baselineValue?.toFixed(3)}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
                <span className="text-slate-500 uppercase tracking-wide text-[10px] block">
                  Selection Method
                </span>

                {automlSummary.selectionReason}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};